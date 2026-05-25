-- ==========================================================================
-- SCHÉMA DE BASE DE DONNÉES SQLITE - SCANNER RADIO PIPELINE
-- ==========================================================================

-- Table des aéroports (Référentiels et Fréquences)
CREATE TABLE IF NOT EXISTS airports (
    icao TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    atis_freq REAL,      -- Fréquence ATIS en MHz
    tower_freq REAL,     -- Fréquence Tour en MHz
    approach_freq REAL   -- Fréquence Approche en MHz
);

-- Table des vols en direct (Données d'état ADS-B synchronisées depuis OpenSky)
CREATE TABLE IF NOT EXISTS active_flights (
    icao24 TEXT PRIMARY KEY,
    callsign TEXT,
    origin_country TEXT,
    latitude REAL,
    longitude REAL,
    altitude REAL,       -- Altitude en mètres
    velocity REAL,       -- Vitesse en m/s
    heading REAL,        -- Cap en degrés (0-360)
    last_contact INTEGER  -- Timestamp de dernière mise à jour
);

-- Table des récepteurs radio physiques (KiwiSDR / Relais / Scanners)
CREATE TABLE IF NOT EXISTS receivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,         -- 'kiwisdr', 'broadcastify', 'amateur'
    frequency REAL NOT NULL,    -- Fréquence principale en MHz
    band TEXT NOT NULL,         -- 'VHF', 'UHF', 'HF', 'LF'
    category TEXT NOT NULL,     -- 'safety', 'aviation', 'marine', 'space-ham'
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    stream_url TEXT NOT NULL,   -- URL d'écoute directe HTTPS
    listeners INTEGER DEFAULT 0,
    status TEXT DEFAULT 'online'
);

-- Index pour des requêtes géographiques rapides
CREATE INDEX IF NOT EXISTS idx_airports_coords ON airports(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_flights_coords ON active_flights(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_receivers_coords ON receivers(latitude, longitude);

-- Insertion de données de référence (Aéroports clés)
INSERT OR REPLACE INTO airports (icao, name, city, country, latitude, longitude, atis_freq, tower_freq, approach_freq) VALUES 
('LFPG', 'Paris-Charles de Gaulle', 'Paris', 'France', 49.0097, 2.5479, 126.850, 118.150, 128.125),
('KJFK', 'John F. Kennedy International', 'New York', 'USA', 40.6413, -73.7781, 128.725, 119.100, 128.125),
('RJTT', 'Tokyo Haneda International', 'Tokyo', 'Japon', 35.5494, 139.7798, 128.800, 118.725, 119.150),
('EGLL', 'London Heathrow Airport', 'Londres', 'UK', 51.4700, -0.4543, 128.075, 118.500, 120.400);
