#!/usr/bin/env python3
"""
==========================================================================
SCANNER RADIO PIPELINE - SYNCHRONISATION DES API & INGESTION SQLITE
==========================================================================
Ce script se connecte aux API externes (OpenSky Network) pour récupérer 
le trafic aérien réel, le stocke dans une base SQLite et exporte les 
fichiers JSON statiques nécessaires au frontend pour éviter les blocages CORS.

Utilise exclusivement la bibliothèque standard (sans dépendances pip).
"""

import os
import sqlite3
import urllib.request
import urllib.parse
import json
import time

DB_PATH = "radio_scanner.db"
SCHEMA_PATH = "schema.sql"
FLIGHTS_JSON_PATH = "live_flights.json"
RECEIVERS_JSON_PATH = "active_receivers.json"

# Bounding box pour filtrer les vols au-dessus de l'Europe de l'Ouest (France, UK, Espagne, etc.)
# [min_lat, min_lon, max_lat, max_lon]
EUROPE_BBOX = {
    "lamin": "40.0",
    "lomin": "-8.0",
    "lamax": "52.0",
    "lomax": "8.0"
}

def init_db():
    print("[+] Initialisation de la base de données SQLite...")
    if not os.path.exists(SCHEMA_PATH):
        print(f"[-] Erreur : {SCHEMA_PATH} introuvable.")
        return False
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
        cursor.executescript(schema_sql)
        
    conn.commit()
    conn.close()
    print("[+] Base de données initialisée avec succès.")
    return True

def sync_opensky_flights():
    """
    Interroge l'API OpenSky Network pour obtenir les vols en direct sur l'Europe
    """
    print("[+] Récupération des vols réels sur l'API OpenSky Network (urllib)...")
    
    # Encoder les paramètres BBOX pour l'URL
    query_string = urllib.parse.urlencode(EUROPE_BBOX)
    url = f"https://opensky-network.org/api/states/all?{query_string}"
    
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status != 200:
                print(f"[-] Échec API OpenSky (Status: {response.status})")
                return
                
            data = json.loads(response.read().decode('utf-8'))
            states = data.get("states", [])
            
            # Si states est None ou vide
            if not states:
                states = []
                
            print(f"[+] {len(states)} vols détectés dans la zone d'écoute.")
            
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Nettoyer l'ancienne table des vols temporaires
            cursor.execute("DELETE FROM active_flights")
            
            timestamp = int(time.time())
            inserted_count = 0
            
            for s in states:
                icao24 = s[0]
                callsign = s[1].strip() if s[1] else "UNKNOWN"
                origin_country = s[2]
                lon = s[5]
                lat = s[6]
                alt = s[7] # Altitude barométrique en mètres
                velocity = s[9] # Vitesse au sol en m/s
                heading = s[10] # Cap en degrés
                
                # Ne garder que les avions avec des coordonnées valides
                if lat is not None and lon is not None:
                    cursor.execute("""
                        INSERT OR REPLACE INTO active_flights 
                        (icao24, callsign, origin_country, latitude, longitude, altitude, velocity, heading, last_contact)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (icao24, callsign, origin_country, lat, lon, alt, velocity, heading, timestamp))
                    inserted_count += 1
                    
            conn.commit()
            conn.close()
            print(f"[+] {inserted_count} vols insérés en base de données.")
            
    except Exception as e:
        print(f"[-] Erreur de synchronisation OpenSky: {e}")

def populate_receivers():
    """
    Insère des récepteurs réels issus de notre catalogue de flux dans la base de données
    """
    print("[+] Enregistrement des récepteurs radio en base de données...")
    
    receivers_data = [
        ("noaa-salisbury", "NOAA Salisbury (KEC92)", "kiwisdr", 162.475, "VHF", "marine", 38.3607, -75.5994, "https://wxradio.dyndns.org:8000/Salisbury.mp3", 185),
        ("noaa-worcester", "NOAA Worcester (WXL93)", "kiwisdr", 162.550, "VHF", "marine", 42.2626, -71.8023, "https://wxradio.dyndns.org:8000/KXI94.mp3", 120),
        ("noaa-baltimore", "NOAA Emergency Baltimore", "kiwisdr", 162.400, "VHF", "safety", 39.2904, -76.6122, "https://wxradio.dyndns.org:8000/KXI41.mp3", 240),
        ("ham-repeater-brazil", "Relais VHF CRAM-PY2KJZ", "amateur", 146.610, "VHF", "space-ham", -22.9064, -47.0616, "https://live.arer.org.br:8000/amador", 78),
        ("swl-global-relay", "Ondes Courtes Global Relay", "kiwisdr", 7.200, "HF", "space-ham", 51.5074, -0.1278, "https://relay.urc.org.uk/live", 312)
    ]
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    for r in receivers_data:
        cursor.execute("""
            INSERT OR REPLACE INTO receivers 
            (id, name, type, frequency, band, category, latitude, longitude, stream_url, listeners)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, r)
        
    conn.commit()
    conn.close()
    print("[+] Récepteurs radio enregistrés.")

def export_to_static_json():
    """
    Exporte le contenu des tables sous forme de fichiers JSON statiques 
    pour que le frontend HTML5 puisse les fetch() sans soucis.
    """
    print("[+] Exportation des tables en fichiers JSON statiques pour le frontend...")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Export des Vols Actifs
    cursor.execute("SELECT * FROM active_flights")
    flights = [dict(row) for row in cursor.fetchall()]
    with open(FLIGHTS_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(flights, f, indent=2, ensure_ascii=False)
    print(f"[+] {len(flights)} vols exportés dans {FLIGHTS_JSON_PATH}")
    
    # 2. Export des Récepteurs
    cursor.execute("SELECT * FROM receivers")
    receivers = [dict(row) for row in cursor.fetchall()]
    with open(RECEIVERS_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(receivers, f, indent=2, ensure_ascii=False)
    print(f"[+] {len(receivers)} récepteurs exportés dans {RECEIVERS_JSON_PATH}")
    
    conn.close()

if __name__ == "__main__":
    print("=== DÉBUT PIPELINE SYNCHRONISATION SCANNER RADIO ===")
    if init_db():
        populate_receivers()
        sync_opensky_flights()
        export_to_static_json()
    print("=== FIN PIPELINE SYNCHRONISATION AVEC SUCCÈS ===")
