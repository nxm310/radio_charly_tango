/**
 * ==========================================================================
 * SCANNER RADIO LIVE - MOTEUR AUDIO ET LOGIQUE TACTIQUE
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  
  // Elements UI
  const startupOverlay = document.getElementById('startup-overlay');
  const btnStart = document.getElementById('btn-start');
  const popularContainer = document.getElementById('popular-stations-container');
  const nearbyContainer = document.getElementById('nearby-stations-container');
  const alertsContainer = document.getElementById('alerts-container');
  const stationSearch = document.getElementById('station-search');
  const btnGeoloc = document.getElementById('btn-geolocation');
  const btnActivateGeo = document.getElementById('btn-activate-geo');
  const nearbyInfoMsg = document.getElementById('nearby-info-msg');
  const bandFilters = document.querySelectorAll('.btn-wl');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const globalListenersText = document.getElementById('global-listeners');
  
  // LCD Screen Elements
  const lcdFrequency = document.getElementById('lcd-frequency');
  const lcdChannel = document.getElementById('lcd-channel');
  const lcdBand = document.getElementById('lcd-band');
  const lcdStatus = document.getElementById('lcd-status');
  const lcdSignalText = document.getElementById('lcd-signal-text');
  const sMeterBars = document.getElementById('s-meter-bars');
  
  // Player Controls
  const btnPlay = document.getElementById('btn-play');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeVal = document.getElementById('volume-val');
  const squelchSlider = document.getElementById('squelch-slider');
  const squelchVal = document.getElementById('squelch-val');
  
  // Logger
  const loggerBody = document.getElementById('logger-body');
  
  // Push Notifications
  const pushNotification = document.getElementById('push-notification');
  const pushTitle = document.getElementById('push-title');
  const pushMessage = document.getElementById('push-message');
  const pushListeners = document.getElementById('push-listeners');
  const btnPushListen = document.getElementById('btn-push-listen');
  const closePush = document.getElementById('close-push');
  
  // Application State
  let map = null;
  let mapMarkers = [];
  let currentStation = STATIONS[0];
  let isPlaying = false;
  let activeBandFilter = 'all';
  let activeTab = 'popular';
  let userCoords = null;
  let simulatedAlertInterval = null;
  let transmissionInterval = null;
  
  // Web Audio Variables
  let audioCtx = null;
  let noiseNode = null;
  let noiseGain = null;
  let audioFilter = null;
  let analyser = null;
  let dataArray = null;
  let visualizerCanvas = document.getElementById('audio-visualizer');
  let canvasCtx = visualizerCanvas.getContext('2d');
  let isMuted = false;
  
  // Configuration
  let config = {
    volume: 0.8,
    squelch: 0.35, // 0 to 1
    totalGlobalListeners: 1420
  };

  // --------------------------------------------------------------------------
  // 1. CARTE INTERACTIVE LEAFLET (Thème Sombre & Épuré)
  // --------------------------------------------------------------------------
  function initMap() {
    // Initialise au centre de l'Europe/Afrique pour la vue d'ensemble
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([20.0, 0.0], 3);

    // Zoom buttons repositioning
    L.control.zoom({
      position: 'topleft'
    }).addTo(map);

    // CartoDB Dark Matter Tiles (Splendide carte noire tactique)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    updateMapMarkers();
  }

  function updateMapMarkers() {
    // Nettoyer les anciens marqueurs
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    // Filtrer les stations en fonction de la bande active et de la recherche
    const query = stationSearch.value.toLowerCase();
    const filtered = STATIONS.filter(s => {
      const matchesBand = activeBandFilter === 'all' || s.category === activeBandFilter;
      const matchesSearch = s.name.toLowerCase().includes(query) || 
                            s.location.toLowerCase().includes(query) ||
                            s.frequency.toString().includes(query);
      return matchesBand && matchesSearch;
    });

    filtered.forEach(station => {
      // Si la station est l'ISS et qu'on veut la positionner aléatoirement/orbite, on simule sa trace
      let coords = station.coords;
      if (station.id === 'iss-space-link') {
        // Simuler des coordonnées de vol spatial temporaires
        const time = Date.now() * 0.00005;
        coords = [
          Math.sin(time) * 45 + 10,
          Math.cos(time) * 120
        ];
        station.coords = coords;
      }

      // Marqueur HTML Pulsant personnalisé en fonction de la catégorie
      const customIcon = L.divIcon({
        className: 'custom-leaflet-icon',
        html: `
          <div class="pulsating-marker ${station.category}">
            <div class="marker-dot"></div>
            <div class="marker-pulse"></div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const marker = L.marker(coords, { icon: customIcon }).addTo(map);
      
      // Popup stylisé
      const popupContent = `
        <div class="map-popup-card">
          <h4>${station.name}</h4>
          <p>${station.description}</p>
          <div class="popup-details">
            <span>Fréq: <strong>${station.frequency.toFixed(4)} MHz</strong></span>
            <span>Bande: ${station.band}</span>
          </div>
          <button class="btn-popup-listen" onclick="window.tuneToStation('${station.id}')">
            <i class="fa-solid fa-radio"></i> Connecter
          </button>
        </div>
      `;
      
      marker.bindPopup(popupContent);
      mapMarkers.push(marker);
    });
  }

  // Permettre l'appel depuis la carte (HTML Popup)
  window.tuneToStation = (stationId) => {
    const station = STATIONS.find(s => s.id === stationId);
    if (station) {
      selectStation(station);
      playStation();
      map.closePopup();
    }
  };

  // --------------------------------------------------------------------------
  // 2. MOTEUR AUDIO WEB AUDIO API (Synthétiseur Analogique)
  // --------------------------------------------------------------------------
  function initAudioEngine() {
    if (audioCtx) return;
    
    // Initialiser l'audio context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // Analyser Node pour le visualiseur
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // Filtre Passe-Bande Radio (Donne ce son pincé et métallique caractéristique)
    audioFilter = audioCtx.createBiquadFilter();
    audioFilter.type = "bandpass";
    audioFilter.frequency.value = 1000; // Fréquence vocale humaine
    audioFilter.Q.value = 1.2; // Résonance

    // Node de gain de bruit
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.0; // Silencieux par défaut

    // Générateur de Bruit Blanc (Static analogique)
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;
    
    // Chaînage audio
    noiseNode.connect(noiseGain);
    noiseGain.connect(audioFilter);
    audioFilter.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    noiseNode.start(0);

    // Démarrer la boucle de rendu visuel
    drawVisualizer();
  }

  // Jouer un bip de fin de transmission ("Roger Beep" réaliste)
  function playRogerBeep() {
    if (!audioCtx || !isPlaying) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Haute fréquence claire
    
    gain.gain.setValueAtTime(config.volume * 0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  }

  // Jouer un bip d'ouverture de canal (micro-click)
  function playClickSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(config.volume * 0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  }

  // --------------------------------------------------------------------------
  // 3. SYNTHESE VOCALE TACTIQUE (Simulation Transmissions)
  // --------------------------------------------------------------------------
  
  // Extraits réalistes en français et anglais selon le type de station
  const DISPATCH_VOCALS = {
    safety: [
      "Centrale d'appel BSPP pour Secours 4. Incendie confirmé rue de Tolbiac, présence de fumées au 3e étage. Prudence à l'approche.",
      "Dispatch Gendarmerie : Véhicule suspect signalé sur l'autoroute A1. Vitesse excessive, direction Lille. Interception demandée.",
      "Ambulance Control: Red Alert on Sector Delta, major cardiac event reported at Waterloo Station platform 4. Paramedics on route.",
      "Tokyo Fire Command: Engine 2 dispatched to Shinjuku sector for structural evaluation. Wind speed 10 knots."
    ],
    aviation: [
      "Paris Contrôle : Air France 118, contactez la Tour sur 118.150. Bonne journée.",
      "CDG Tour: Air France 118, vent du 220 degrés, 8 nœuds, piste 26 gauche, autorisé atterrissage.",
      "JFK Radar Approach: Delta 442, descend and maintain 4000, speed 210, vector to final approach runway 22 Right.",
      "Haneda Ground: JapanAir 512, taxi via Bravo, hold short of runway 34 Left."
    ],
    marine: [
      "Marseille Capitainerie pour le Ferry Méditerranée. Vous êtes autorisé à appareiller, sortie du bassin Nord, vitesse max 5 nœuds.",
      "Rotterdam Harbor: Maersk Sealand, adjust pilot speed to 6 knots. Incoming Container Vessel crossing sector.",
      "US Coast Guard SF: Broadcast Notice to Mariners, gale warning in effect for Bodega Bay. Sailors advised to stay in harbor."
    ],
    "space-ham": [
      "HB9 Amateur Radio: CQ CQ, ici station suisse dans les Alpes. Signal S9+5dB, météo dégagée, température de 12 degrés, 73 à tous.",
      "ARISS Space Link: This is ISS, International Space Station. Copying you five by five. Passing over Western Europe at 28,000 kilometers per hour.",
      "Shannon Volmet: London Heathrow weather at 2030, wind 240 degrees at 15 knots, visibility 10 kilometers, light rain."
    ]
  };

  const RANDOM_CALLSIGNS = ["F-GKOB", "Sierra-Hotel-9", "November-42-Delta", "Echo-Whiskey-3", "Alpha-Bravo-0", "HB9-Zulu"];

  function simulateIncomingTransmission() {
    if (!isPlaying) return;
    
    // Décider aléatoirement si une transmission débute
    const isTransmitting = Math.random() > 0.45;
    
    if (isTransmitting && ('speechSynthesis' in window)) {
      // 1. Démarrer transmission
      playClickSound();
      
      // Ouvrir le squelch (bruit de transmission plus fort)
      updateNoiseLevel(true);
      
      // Mettre à jour l'écran LCD
      lcdStatus.textContent = "RECEIVING";
      lcdStatus.classList.remove('blink');
      lcdStatus.style.backgroundColor = "rgba(0,255,102,0.15)";
      lcdStatus.style.color = "#0f6";
      
      // Sélectionner un texte réaliste correspondant à la catégorie de la station
      const categoryVocals = DISPATCH_VOCALS[currentStation.category] || DISPATCH_VOCALS.safety;
      const text = categoryVocals[Math.floor(Math.random() * categoryVocals.length)];
      
      // Utiliser Web Speech API
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Choisir une voix correspondant à la langue de la transmission (Français pour Paris/Marseille, Anglais sinon)
      const isFrench = currentStation.location.toLowerCase().includes("paris") || currentStation.location.toLowerCase().includes("marseille");
      utterance.lang = isFrench ? 'fr-FR' : 'en-US';
      
      // Paramètres vocaux pour effet radio métallique
      utterance.rate = 1.05; // Un peu plus rapide, pressé
      utterance.pitch = 0.85; // Un peu plus grave/nasal
      utterance.volume = config.volume;

      // Ajouter dans le journal de bord interactif
      const sender = RANDOM_CALLSIGNS[Math.floor(Math.random() * RANDOM_CALLSIGNS.length)];
      addLogLine(sender, currentStation.category, text);

      // Fin de la transmission
      utterance.onend = () => {
        setTimeout(() => {
          playRogerBeep();
          updateNoiseLevel(false);
          
          // Remettre l'état SCANNING/LOCKED
          lcdStatus.textContent = "LOCKED";
          lcdStatus.style.backgroundColor = "rgba(0,221,255,0.1)";
          lcdStatus.style.color = "var(--lcd-color)";
        }, 300);
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      // Simuler une variation du S-Meter et du bruit analogique même s'il n'y a pas de voix
      simulateSMeterOscillation();
    }
  }

  // Gérer le niveau de bruit blanc dynamique en fonction du volume, du squelch et de l'état
  function updateNoiseLevel(isTransmitting = false) {
    if (!audioCtx || !isPlaying) {
      if (noiseGain) noiseGain.gain.value = 0;
      return;
    }

    // Le niveau de bruit dépend du Squelch.
    // Si squelch élevé, on coupe le bruit sauf si transmission active.
    // Si squelch faible, on entend le bruit de fond constant.
    let targetNoise = 0;
    
    if (isTransmitting) {
      // Bruit de modulation radio pendant la transmission (assez faible)
      targetNoise = config.volume * 0.05;
    } else {
      // Bruit statique permanent s'il dépasse la valeur de squelch réglée
      const squelchThreshold = config.squelch; // 0 à 1
      if (squelchThreshold < 0.45) {
        // Plus le squelch est bas, plus le souffle analogique est fort
        targetNoise = config.volume * (0.45 - squelchThreshold) * 0.4;
      } else {
        targetNoise = 0.0; // Complètement filtré par le Squelch
      }
    }

    if (noiseGain) {
      noiseGain.gain.setValueAtTime(targetNoise, audioCtx.currentTime);
    }
  }

  // Oscillation continue du S-Meter pour faire vivre l'écran LCD
  function simulateSMeterOscillation() {
    if (!isPlaying) return;
    
    // Déterminer la qualité du signal de la station (1 à 5)
    const baseSignal = currentStation.signal; 
    const randomVariation = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    const finalSignal = Math.max(1, Math.min(10, baseSignal * 2 + randomVariation));
    
    // Mettre à jour l'UI des barres
    const bars = sMeterBars.querySelectorAll('.s-bar');
    bars.forEach((bar, index) => {
      if (index < finalSignal) {
        bar.classList.add('active');
      } else {
        bar.classList.remove('active');
      }
    });

    // Mettre à jour le texte du signal
    const dbValue = finalSignal * 6 + Math.floor(Math.random() * 5);
    lcdSignalText.textContent = `SIG: S${finalSignal} +${dbValue}dB`;
  }

  // --------------------------------------------------------------------------
  // 4. BOUCLES DE LOGIQUE ET VISUALISATION CANVAS
  // --------------------------------------------------------------------------
  function drawVisualizer() {
    if (!isPlaying || !analyser) {
      // Dessiner une ligne plate propre si silencieux
      canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
      canvasCtx.beginPath();
      canvasCtx.strokeStyle = 'rgba(0, 221, 255, 0.2)';
      canvasCtx.lineWidth = 2;
      canvasCtx.moveTo(0, visualizerCanvas.height / 2);
      canvasCtx.lineTo(visualizerCanvas.width, visualizerCanvas.height / 2);
      canvasCtx.stroke();
      return;
    }

    requestAnimationFrame(drawVisualizer);
    
    analyser.getByteFrequencyData(dataArray);
    
    canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    
    // Dessiner de jolies barres de spectre phosphorescentes cyan
    const barWidth = (visualizerCanvas.width / dataArray.length) * 1.5;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      barHeight = (dataArray[i] / 255) * visualizerCanvas.height * 0.8;
      
      // Dégradé de vert-bleu fluorescent
      const gradient = canvasCtx.createLinearGradient(0, visualizerCanvas.height, 0, 0);
      gradient.addColorStop(0, '#04100c');
      gradient.addColorStop(0.5, 'var(--lcd-color)');
      gradient.addColorStop(1, '#00ff66');
      
      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth - 1, barHeight);
      
      x += barWidth;
    }
  }

  // Rendre le canvas responsive par rapport à son container parent
  function resizeCanvas() {
    visualizerCanvas.width = visualizerCanvas.parentElement.clientWidth;
    visualizerCanvas.height = 45;
    drawVisualizer();
  }
  window.addEventListener('resize', resizeCanvas);

  // --------------------------------------------------------------------------
  // 5. GESTION DES LOGS DE TRANSMISSION (Terminal)
  // --------------------------------------------------------------------------
  function addLogLine(sender, category, text) {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEl = document.createElement('div');
    
    logEl.className = `log-line sender-${category}`;
    logEl.innerHTML = `[${time}] <strong style="text-transform: uppercase;">&lt;${sender}&gt;</strong> ${text}`;
    
    loggerBody.appendChild(logEl);
    
    // Auto-scroll vers le bas
    loggerBody.scrollTop = loggerBody.scrollHeight;
    
    // Limiter les lignes pour économiser la mémoire
    if (loggerBody.childNodes.length > 50) {
      loggerBody.removeChild(loggerBody.firstChild);
    }
  }

  // --------------------------------------------------------------------------
  // 6. INITIALISATION DES LISTES UI (Sidebar)
  // --------------------------------------------------------------------------
  function populateStationsLists() {
    // 1. Liste Populaire
    popularContainer.innerHTML = '';
    
    const query = stationSearch.value.toLowerCase();
    
    // Filtrer par bande & recherche
    const filtered = STATIONS.filter(s => {
      const matchesBand = activeBandFilter === 'all' || s.category === activeBandFilter;
      const matchesSearch = s.name.toLowerCase().includes(query) || 
                            s.location.toLowerCase().includes(query);
      return matchesBand && matchesSearch;
    });

    // Trier par auditeurs décroissants
    const popular = [...filtered].sort((a, b) => b.listeners - a.listeners);

    if (popular.length === 0) {
      popularContainer.innerHTML = `<div class="station-loc" style="padding: 10px; text-align: center;">Aucun récepteur trouvé</div>`;
    } else {
      popular.forEach(station => {
        const item = createStationItemHTML(station);
        popularContainer.appendChild(item);
      });
    }

    // 2. Liste Proche
    updateNearbyStations();
  }

  function createStationItemHTML(station) {
    const item = document.createElement('div');
    item.className = `station-item ${currentStation.id === station.id && isPlaying ? 'active-playing' : ''}`;
    
    // Signal d'étoiles simplifié
    const signalStars = '★'.repeat(station.signal) + '☆'.repeat(5 - station.signal);

    item.innerHTML = `
      <div class="station-details">
        <div class="station-top">
          <span class="station-badge ${station.category}"></span>
          <span class="station-freq">${station.frequency.toFixed(3)} MHz</span>
        </div>
        <div class="station-name">${station.name}</div>
        <div class="station-loc"><i class="fa-solid fa-map-pin"></i> ${station.location}</div>
      </div>
      <div class="station-meta">
        <div class="station-listeners"><i class="fa-solid fa-users"></i> ${station.listeners}</div>
        <div class="station-signal-strength" title="Signal">${signalStars}</div>
      </div>
    `;

    item.addEventListener('click', () => {
      selectStation(station);
      playStation();
    });

    return item;
  }

  // --------------------------------------------------------------------------
  // 7. GÉOLOCALISATION & DISTANCE
  // --------------------------------------------------------------------------
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function handleGeolocation() {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }

    navigator.geolocation.getCurrentPosition(position => {
      userCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      
      // Placer un petit marqueur bleu pour l'utilisateur sur la carte
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="background:#00e5ff; width:12px; height:12px; border:2px solid #fff; border-radius:50%; box-shadow:0 0 10px #00e5ff;"></div>`,
        iconSize: [12, 12]
      });
      L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup("Votre position actuelle")
        .openPopup();

      map.setView([userCoords.lat, userCoords.lng], 7);
      
      // Mettre à jour la liste à proximité
      nearbyInfoMsg.classList.add('hidden');
      nearbyContainer.classList.remove('hidden');
      updateNearbyStations();
      
      // Basculer l'onglet vers 'nearby'
      switchTab('nearby');

    }, error => {
      console.warn("Erreur de géolocalisation. Utilisation d'une simulation.", error);
      // Simuler Paris comme position par défaut si l'utilisateur refuse pour le test
      userCoords = { lat: 48.8566, lng: 2.3522 };
      
      nearbyInfoMsg.classList.add('hidden');
      nearbyContainer.classList.remove('hidden');
      updateNearbyStations();
      switchTab('nearby');
    });
  }

  function updateNearbyStations() {
    if (!userCoords) return;

    nearbyContainer.innerHTML = '';
    
    // Calculer les distances pour toutes les stations
    const stationsWithDistance = STATIONS.map(s => {
      const dist = calculateDistance(userCoords.lat, userCoords.lng, s.coords[0], s.coords[1]);
      return { ...s, distance: dist };
    });

    // Trier par distance croissante
    const sortedNearby = stationsWithDistance.sort((a, b) => a.distance - b.distance);

    sortedNearby.forEach(station => {
      const item = createStationItemHTML(station);
      
      // Injecter la distance dans la description géographique de l'item
      const locEl = item.querySelector('.station-loc');
      locEl.innerHTML = `<i class="fa-solid fa-location-arrow"></i> À ${(station.distance).toFixed(0)} km - ${station.location}`;
      
      nearbyContainer.appendChild(item);
    });
  }

  // --------------------------------------------------------------------------
  // 8. LOGIQUE DE SELECTION & LECTURE DU SPECTRE
  // --------------------------------------------------------------------------
  function selectStation(station) {
    currentStation = station;
    
    // Mettre à jour l'écran LCD
    lcdFrequency.textContent = station.frequency.toFixed(3);
    lcdChannel.textContent = station.name;
    lcdBand.textContent = `${station.band} (${station.wavelength})`;
    
    // Zoomer sur la carte sur la station
    if (map && station.coords[0] !== 0) {
      map.setView(station.coords, 8);
    }

    // Jouer un petit bip d'action de clic
    playClickSound();

    // Mettre à jour les classes de sélection active
    document.querySelectorAll('.station-item').forEach(el => {
      el.classList.remove('active-playing');
    });
    
    populateStationsLists();

    // Ajouter log système
    const time = new Date().toLocaleTimeString('fr-FR');
    const systemLog = document.createElement('div');
    systemLog.className = 'log-line system';
    systemLog.textContent = `[${time}] [SYSTEM] Connexion établie sur la fréquence ${station.frequency.toFixed(3)} MHz [${station.band}].`;
    loggerBody.appendChild(systemLog);
    loggerBody.scrollTop = loggerBody.scrollHeight;
  }

  function playStation() {
    initAudioEngine();
    
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    isPlaying = true;
    btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>';
    btnPlay.classList.add('active');
    
    // Écran LCD allumé
    lcdStatus.textContent = "LOCKED";
    lcdStatus.style.backgroundColor = "rgba(0,221,255,0.1)";
    lcdStatus.style.color = "var(--lcd-color)";
    
    updateNoiseLevel(false);
    simulateSMeterOscillation();
    
    // Débuter les transmissions vocales simulées périodiques
    if (transmissionInterval) clearInterval(transmissionInterval);
    // Transmettre toutes les 12 à 25 secondes
    transmissionInterval = setInterval(() => {
      simulateIncomingTransmission();
    }, 15000);
    
    // Lancer une première transmission peu après la connexion
    setTimeout(() => {
      simulateIncomingTransmission();
    }, 2000);

    populateStationsLists();
  }

  function pauseStation() {
    isPlaying = false;
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';
    btnPlay.classList.remove('active');
    
    // Écran LCD en pause
    lcdStatus.textContent = "STANDBY";
    lcdStatus.style.backgroundColor = "rgba(255,159,67,0.1)";
    lcdStatus.style.color = "#ff9f43";
    
    if (transmissionInterval) clearInterval(transmissionInterval);
    updateNoiseLevel(false);
    
    // Réinitialiser le S-Meter
    const bars = sMeterBars.querySelectorAll('.s-bar');
    bars.forEach(bar => bar.classList.remove('active'));

    populateStationsLists();
  }

  // --------------------------------------------------------------------------
  // 9. SIMULATION ALERTES MAJEURES (Traffic Alerts)
  // --------------------------------------------------------------------------
  function populateAlertsList() {
    alertsContainer.innerHTML = '';
    
    ALERTS.forEach(alert => {
      const item = document.createElement('div');
      item.className = `alert-item intensity-${alert.intensity}`;
      
      item.innerHTML = `
        <div class="alert-head">
          <span><i class="fa-solid fa-triangle-exclamation"></i> ${alert.title}</span>
          <span class="alert-time">${alert.time}</span>
        </div>
        <div class="alert-desc">${alert.message}</div>
        <div class="alert-foot">
          <span>Activité: <span class="alert-delta">${alert.listenersDelta}</span></span>
          <span style="color:var(--color-aviation);">Écouter <i class="fa-solid fa-angle-right"></i></span>
        </div>
      `;

      item.addEventListener('click', () => {
        const station = STATIONS.find(s => s.id === alert.stationId);
        if (station) {
          selectStation(station);
          playStation();
        }
      });

      alertsContainer.appendChild(item);
    });
  }

  // Simuler le déclenchement d'une alerte Push
  function triggerSimulatedAlert() {
    if (ALERTS.length === 0) return;
    
    const randomAlert = ALERTS[Math.floor(Math.random() * ALERTS.length)];
    
    // Remplir la notification push UI
    pushTitle.textContent = randomAlert.title;
    pushMessage.textContent = randomAlert.message;
    pushListeners.innerHTML = `<i class="fa-solid fa-users"></i> ${randomAlert.listenersDelta} auditeurs`;
    
    // Afficher la notification push
    pushNotification.classList.remove('hidden');

    // Jouer une tonalité d'alerte radio à l'utilisateur
    if (audioCtx && isPlaying) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // Tonalité attention
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); 
      
      gain.gain.setValueAtTime(config.volume * 0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    }

    // Configurer le bouton "Écouter Direct"
    btnPushListen.onclick = () => {
      const station = STATIONS.find(s => s.id === randomAlert.stationId);
      if (station) {
        selectStation(station);
        playStation();
        pushNotification.classList.add('hidden');
      }
    };
  }

  // --------------------------------------------------------------------------
  // 10. GESTION DES EVENEMENTS D'INTERFACE
  // --------------------------------------------------------------------------
  
  // Onglets Popular / Nearby
  function switchTab(tabName) {
    activeTab = tabName;
    tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (tabName === 'popular') {
      document.getElementById('list-popular').classList.remove('hidden');
      document.getElementById('list-nearby').classList.add('hidden');
    } else {
      document.getElementById('list-popular').classList.add('hidden');
      document.getElementById('list-nearby').classList.remove('hidden');
    }
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // Filtre par longueur d'onde (Bande)
  bandFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      bandFilters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      activeBandFilter = btn.getAttribute('data-band');
      populateStationsLists();
      updateMapMarkers();
    });
  });

  // Recherche
  stationSearch.addEventListener('input', () => {
    populateStationsLists();
    updateMapMarkers();
  });

  // Contrôles du Player
  btnPlay.addEventListener('click', () => {
    if (isPlaying) {
      pauseStation();
    } else {
      playStation();
    }
  });

  btnPrev.addEventListener('click', () => {
    const currentIndex = STATIONS.findIndex(s => s.id === currentStation.id);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = STATIONS.length - 1;
    selectStation(STATIONS[prevIndex]);
    if (isPlaying) playStation();
  });

  btnNext.addEventListener('click', () => {
    const currentIndex = STATIONS.findIndex(s => s.id === currentStation.id);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= STATIONS.length) nextIndex = 0;
    selectStation(STATIONS[nextIndex]);
    if (isPlaying) playStation();
  });

  // Sliders
  volumeSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    volumeVal.textContent = `${value}%`;
    config.volume = value / 100;
    updateNoiseLevel(false);
  });

  squelchSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    squelchVal.textContent = `${value}%`;
    config.squelch = value / 100;
    updateNoiseLevel(false);
  });

  // Notification close
  closePush.addEventListener('click', () => {
    pushNotification.classList.add('hidden');
  });

  // Géolocalisation
  btnGeoloc.addEventListener('click', handleGeolocation);
  btnActivateGeo.addEventListener('click', handleGeolocation);

  // Overlay de démarrage
  btnStart.addEventListener('click', () => {
    startupOverlay.classList.add('hidden');
    initAudioEngine();
    playStation();
    
    // Déclencher une alerte toutes les 45 secondes pour le spectacle
    simulatedAlertInterval = setInterval(triggerSimulatedAlert, 45000);
    // Première alerte rapide après 15 secondes
    setTimeout(triggerSimulatedAlert, 15000);
  });

  // --------------------------------------------------------------------------
  // 11. INITIALISATION GENERALE
  // --------------------------------------------------------------------------
  initMap();
  selectStation(STATIONS[0]);
  populateStationsLists();
  populateAlertsList();
  resizeCanvas();

  // Simuler la variation du nombre d'auditeurs globaux
  setInterval(() => {
    config.totalGlobalListeners += Math.floor(Math.random() * 5) - 2;
    globalListenersText.textContent = `${config.totalGlobalListeners.toLocaleString('fr-FR')} en ligne`;
  }, 10000);
});
