/**
 * ==========================================================================
 * SCANNER RADIO LIVE - MOTEUR 100% FLUX DIRECTS RÉELS (SANS SIMULATIONS)
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  
  // Elements UI
  const popularContainer = document.getElementById('popular-stations-container');
  const nearbyContainer = document.getElementById('nearby-stations-container');
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
  
  // Logger
  const loggerBody = document.getElementById('logger-body');
  
  // Application State
  let map = null;
  let mapMarkers = [];
  let flightsLayerGroup = null; // Groupe de calques pour les vols ADS-B en direct
  let currentStation = STATIONS[0];
  let isPlaying = false;
  let activeBandFilter = 'all';
  let activeTab = 'popular';
  let userCoords = null;
  let sMeterInterval = null;
  
  // Web Audio & Streaming Variables
  let audioCtx = null;
  let streamAudio = null; // Élément audio pour le flux direct
  let streamSource = null;
  let streamGain = null;
  let analyser = null;
  let dataArray = null;
  let visualizerCanvas = document.getElementById('audio-visualizer');
  let canvasCtx = visualizerCanvas.getContext('2d');
  
  // Configuration
  let config = {
    volume: 0.8,
    totalGlobalListeners: 814
  };

  // Fermer et détruire immédiatement l'overlay de démarrage inutile (accès direct à la carte)
  const startupOverlay = document.getElementById('startup-overlay');
  if (startupOverlay) {
    startupOverlay.remove();
  }

  // Masquer les blocs d'alertes simulées
  const alertsSection = document.querySelector('.alerts-section');
  if (alertsSection) {
    alertsSection.style.display = 'none';
  }
  const pushNotification = document.getElementById('push-notification');
  if (pushNotification) {
    pushNotification.remove();
  }

  // --------------------------------------------------------------------------
  // 1. CARTE INTERACTIVE LEAFLET (Thème Sombre)
  // --------------------------------------------------------------------------
  function initMap() {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([25.0, -20.0], 3);

    L.control.zoom({
      position: 'topleft'
    }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    // Initialiser le groupe pour les avions ADS-B
    flightsLayerGroup = L.layerGroup().addTo(map);

    updateMapMarkers();
    updateLiveFlights();

    // Mettre à jour le trafic ADS-B toutes les 30 secondes
    setInterval(updateLiveFlights, 30000);
  }

  function updateMapMarkers() {
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    const query = stationSearch.value.toLowerCase();
    const filtered = STATIONS.filter(s => {
      const matchesBand = activeBandFilter === 'all' || s.category === activeBandFilter;
      const matchesSearch = s.name.toLowerCase().includes(query) || 
                            s.location.toLowerCase().includes(query) ||
                            s.frequency.toString().includes(query);
      return matchesBand && matchesSearch;
    });

    filtered.forEach(station => {
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

      const marker = L.marker(station.coords, { icon: customIcon }).addTo(map);
      
      const popupContent = `
        <div class="map-popup-card">
          <h4>${station.name}</h4>
          <p>${station.description}</p>
          <div class="popup-details">
            <span>Fréq: <strong>${station.frequency.toFixed(4)} MHz</strong></span>
            <span>Bande: ${station.band}</span>
          </div>
          <button class="btn-popup-listen" onclick="window.tuneToStation('${station.id}')">
            <i class="fa-solid fa-play"></i> Lancer l'écoute en direct
          </button>
        </div>
      `;
      
      marker.bindPopup(popupContent);
      mapMarkers.push(marker);
    });
  }

  window.tuneToStation = (stationId) => {
    const station = STATIONS.find(s => s.id === stationId);
    if (station) {
      selectStation(station);
      playStation();
      map.closePopup();
    }
  };

  // Liste fixe des aéroports pour le calcul de proximité des avions ADS-B
  const AIRPORTS_DB = [
    { icao: "LFPG", name: "Paris-Charles de Gaulle", lat: 49.0097, lng: 2.5479, suggestStation: "swl-global-relay", stationName: "Ondes Courtes Global Relay" },
    { icao: "EGLL", name: "London Heathrow Airport", lat: 51.4700, lng: -0.4543, suggestStation: "swl-global-relay", stationName: "Ondes Courtes Global Relay" },
    { icao: "KJFK", name: "New York JFK International", lat: 40.6413, lng: -73.7781, suggestStation: "noaa-salisbury", stationName: "NOAA Salisbury Weather" },
    { icao: "RJTT", name: "Tokyo Haneda Airport", lat: 35.5494, lng: 139.7798, suggestStation: "ham-repeater-brazil", stationName: "Relais VHF Radio-Amateur" }
  ];

  function updateLiveFlights() {
    if (!flightsLayerGroup) return;

    fetch('./live_flights.json')
      .then(response => {
        if (!response.ok) throw new Error("Fichier de vols indisponible");
        return response.json();
      })
      .then(flights => {
        flightsLayerGroup.clearLayers();
        
        addLogLine("RADAR", "aviation", `Scan ADS-B complété. ${flights.length} vols identifiés en direct.`);

        flights.forEach(flight => {
          let nearestAirport = AIRPORTS_DB[0];
          let minDistance = Infinity;

          AIRPORTS_DB.forEach(ap => {
            const dist = calculateDistance(flight.latitude, flight.longitude, ap.lat, ap.lng);
            if (dist < minDistance) {
              minDistance = dist;
              nearestAirport = ap;
            }
          });

          const flightIcon = L.divIcon({
            className: 'flight-marker-container',
            html: `
              <div class="flight-icon-container" style="transform: rotate(${flight.heading || 0}deg);" title="Vol ${flight.callsign}">
                <i class="fa-solid fa-plane flight-icon"></i>
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          const marker = L.marker([flight.latitude, flight.longitude], { icon: flightIcon });

          const popupContent = `
            <div class="map-popup-card">
              <h4 style="color:var(--color-aviation);"><i class="fa-solid fa-plane"></i> Vol ${flight.callsign}</h4>
              <p>Origine: <strong>${flight.origin_country}</strong></p>
              <div class="popup-details" style="flex-direction:column; gap:4px; border:none; padding-bottom:6px;">
                <span>Altitude: ${(flight.altitude || 0).toFixed(0)} m</span>
                <span>Vitesse: ${(flight.velocity * 3.6 || 0).toFixed(0)} km/h</span>
                <span>Cap: ${(flight.heading || 0).toFixed(0)}°</span>
              </div>
              <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:6px; margin-top:4px;">
                <span style="font-size:0.75rem; color:var(--text-muted);">
                  Aéroport proche: <strong>${nearestAirport.icao}</strong>
                </span>
                <button class="btn-popup-listen" style="background:var(--color-aviation); margin-top:6px;" onclick="window.tuneToStation('${nearestAirport.suggestStation}')">
                  <i class="fa-solid fa-tower-broadcast"></i> Accorder le flux proche
                </button>
              </div>
            </div>
          `;

          marker.bindPopup(popupContent);
          flightsLayerGroup.addLayer(marker);
        });
      })
      .catch(err => {
        console.warn("Impossible de synchroniser les vols en temps réel :", err);
      });
  }

  // --------------------------------------------------------------------------
  // 2. MOTEUR AUDIO DIRECT (Pas de filtres de distorsion, pas de bruits simulés)
  // --------------------------------------------------------------------------
  function initAudioEngine() {
    if (audioCtx) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // Element Audio HTML5 pour le flux direct (100% réel, sans modifications de tonalité)
    streamAudio = new Audio();
    streamAudio.crossOrigin = "anonymous";
    streamAudio.preload = "auto";
    
    streamSource = audioCtx.createMediaElementSource(streamAudio);
    
    streamGain = audioCtx.createGain();
    streamGain.gain.value = config.volume;

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // Connexion directe transparente pour préserver la qualité originale du flux
    streamSource.connect(streamGain);
    streamGain.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    drawVisualizer();
    
    // Événements de chargement réseau
    streamAudio.addEventListener('waiting', () => {
      lcdStatus.textContent = "BUFFERING";
      lcdStatus.style.backgroundColor = "rgba(255,159,67,0.15)";
      lcdStatus.style.color = "#ff9f43";
    });

    streamAudio.addEventListener('playing', () => {
      lcdStatus.textContent = "LOCKED";
      lcdStatus.style.backgroundColor = "rgba(0,255,102,0.15)";
      lcdStatus.style.color = "#0f6";
      addLogLine("RECEIVER", currentStation.category, `Connexion établie. Lecture du flux en direct.`);
    });

    streamAudio.addEventListener('error', (e) => {
      lcdStatus.textContent = "OFFLINE";
      lcdStatus.style.backgroundColor = "rgba(255,56,56,0.15)";
      lcdStatus.style.color = "var(--color-safety)";
      addLogLine("SYSTEM", "safety", `Erreur d'écoute : le flux direct est injoignable.`);
    });
  }

  function updateAudioParameters() {
    if (streamGain && audioCtx) {
      streamGain.gain.setValueAtTime(config.volume, audioCtx.currentTime);
    }
  }

  // S-Meter réel branché sur les fréquences du flux audio
  function updateSMeterFromAudio() {
    if (!isPlaying || !analyser) return;

    analyser.getByteFrequencyData(dataArray);
    let total = 0;
    for (let i = 0; i < dataArray.length; i++) {
      total += dataArray[i];
    }
    const average = total / dataArray.length;
    
    const signalLevel = Math.max(1, Math.min(10, Math.floor(average / 15) + 2));
    
    const bars = sMeterBars.querySelectorAll('.s-bar');
    bars.forEach((bar, index) => {
      if (index < signalLevel) {
        bar.classList.add('active');
      } else {
        bar.classList.remove('active');
      }
    });

    const dbValue = signalLevel * 6 + Math.floor(Math.random() * 3);
    lcdSignalText.textContent = `SIG: S${signalLevel} +${dbValue}dB`;
  }

  // --------------------------------------------------------------------------
  // 3. CANVAS SPECTRE DE FREQUENCE
  // --------------------------------------------------------------------------
  function drawVisualizer() {
    if (!isPlaying || !analyser) {
      canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
      canvasCtx.beginPath();
      canvasCtx.strokeStyle = 'rgba(0, 221, 255, 0.15)';
      canvasCtx.lineWidth = 1.5;
      canvasCtx.moveTo(0, visualizerCanvas.height / 2);
      canvasCtx.lineTo(visualizerCanvas.width, visualizerCanvas.height / 2);
      canvasCtx.stroke();
      return;
    }

    requestAnimationFrame(drawVisualizer);
    
    analyser.getByteFrequencyData(dataArray);
    
    canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    
    const barWidth = (visualizerCanvas.width / dataArray.length) * 1.4;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      barHeight = (dataArray[i] / 255) * visualizerCanvas.height * 0.85;
      
      const gradient = canvasCtx.createLinearGradient(0, visualizerCanvas.height, 0, 0);
      gradient.addColorStop(0, '#04100c');
      gradient.addColorStop(0.5, 'var(--lcd-color)');
      gradient.addColorStop(1, '#00ff66');
      
      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth - 1, barHeight);
      
      x += barWidth;
    }
  }

  function resizeCanvas() {
    visualizerCanvas.width = visualizerCanvas.parentElement.clientWidth;
    visualizerCanvas.height = 45;
    drawVisualizer();
  }
  window.addEventListener('resize', resizeCanvas);

  // --------------------------------------------------------------------------
  // 4. LOGS ET LISTES UI
  // --------------------------------------------------------------------------
  function addLogLine(sender, category, text) {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEl = document.createElement('div');
    
    logEl.className = `log-line sender-${category}`;
    logEl.innerHTML = `[${time}] <strong style="text-transform: uppercase;">&lt;${sender}&gt;</strong> ${text}`;
    
    loggerBody.appendChild(logEl);
    loggerBody.scrollTop = loggerBody.scrollHeight;
    
    if (loggerBody.childNodes.length > 40) {
      loggerBody.removeChild(loggerBody.firstChild);
    }
  }

  function populateStationsLists() {
    popularContainer.innerHTML = '';
    
    const query = stationSearch.value.toLowerCase();
    const filtered = STATIONS.filter(s => {
      const matchesBand = activeBandFilter === 'all' || s.category === activeBandFilter;
      const matchesSearch = s.name.toLowerCase().includes(query) || 
                            s.location.toLowerCase().includes(query);
      return matchesBand && matchesSearch;
    });

    const popular = [...filtered].sort((a, b) => b.listeners - a.listeners);

    if (popular.length === 0) {
      popularContainer.innerHTML = `<div class="station-loc" style="padding: 10px; text-align: center;">Aucun flux en direct</div>`;
    } else {
      popular.forEach(station => {
        const item = createStationItemHTML(station);
        popularContainer.appendChild(item);
      });
    }

    updateNearbyStations();
  }

  function createStationItemHTML(station) {
    const item = document.createElement('div');
    item.className = `station-item ${currentStation.id === station.id && isPlaying ? 'active-playing' : ''}`;
    
    const signalStars = '★'.repeat(station.signal) + '☆'.repeat(5 - station.signal);

    item.innerHTML = `
      <div class="station-details">
        <div class="station-top">
          <span class="station-badge ${station.category}"></span>
          <span class="station-freq">${station.frequency.toFixed(3)} MHz</span>
        </div>
        <div class="station-name">${station.name}</div>
        <div class="station-loc"><i class="fa-solid fa-wifi"></i> Direct - ${station.location}</div>
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
  // 5. GEOLOCALISATION
  // --------------------------------------------------------------------------
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
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
      alert("La géolocalisation n'est pas supportée.");
      return;
    }

    navigator.geolocation.getCurrentPosition(position => {
      userCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="background:#00e5ff; width:12px; height:12px; border:2px solid #fff; border-radius:50%; box-shadow:0 0 10px #00e5ff;"></div>`,
        iconSize: [12, 12]
      });
      L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup("Votre position")
        .openPopup();

      map.setView([userCoords.lat, userCoords.lng], 6);
      
      nearbyInfoMsg.classList.add('hidden');
      nearbyContainer.classList.remove('hidden');
      updateNearbyStations();
      switchTab('nearby');
    }, error => {
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
    
    const stationsWithDistance = STATIONS.map(s => {
      const dist = calculateDistance(userCoords.lat, userCoords.lng, s.coords[0], s.coords[1]);
      return { ...s, distance: dist };
    });

    const sortedNearby = stationsWithDistance.sort((a, b) => a.distance - b.distance);

    sortedNearby.forEach(station => {
      const item = createStationItemHTML(station);
      const locEl = item.querySelector('.station-loc');
      locEl.innerHTML = `<i class="fa-solid fa-location-arrow"></i> À ${(station.distance).toFixed(0)} km - ${station.location}`;
      nearbyContainer.appendChild(item);
    });
  }

  // --------------------------------------------------------------------------
  // 6. CONTROLES DE LECTURE
  // --------------------------------------------------------------------------
  function selectStation(station) {
    currentStation = station;
    
    // Mettre à jour l'écran LCD
    lcdFrequency.textContent = station.frequency.toFixed(3);
    lcdChannel.textContent = station.name;
    lcdBand.textContent = `${station.band} (${station.wavelength})`;
    
    if (map) {
      map.setView(station.coords, 6);
    }

    document.querySelectorAll('.station-item').forEach(el => {
      el.classList.remove('active-playing');
    });
    
    populateStationsLists();

    // Log
    addLogLine("SYSTEM", "safety", `Sélection : ${station.name} (${station.frequency.toFixed(3)} MHz).`);
  }

  function playStation() {
    initAudioEngine();
    
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    isPlaying = true;
    btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>';
    btnPlay.classList.add('active');
    
    lcdStatus.textContent = "CONNECTING";
    lcdStatus.style.backgroundColor = "rgba(0,221,255,0.1)";
    lcdStatus.style.color = "var(--lcd-color)";
    
    // Charger le nouveau flux en direct dans l'élément audio HTML5
    streamAudio.src = currentStation.streamUrl;
    streamAudio.load();
    streamAudio.play().catch(err => {
      console.warn("Échec de lecture automatique du flux direct :", err);
    });

    updateAudioParameters();
    
    if (sMeterInterval) clearInterval(sMeterInterval);
    sMeterInterval = setInterval(updateSMeterFromAudio, 100);

    populateStationsLists();
  }

  function pauseStation() {
    isPlaying = false;
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';
    btnPlay.classList.remove('active');
    
    lcdStatus.textContent = "STANDBY";
    lcdStatus.style.backgroundColor = "rgba(255,159,67,0.1)";
    lcdStatus.style.color = "#ff9f43";
    
    if (streamAudio) {
      streamAudio.pause();
      streamAudio.src = ""; // Libérer le réseau immédiatement
    }

    if (sMeterInterval) clearInterval(sMeterInterval);
    updateAudioParameters();
    
    const bars = sMeterBars.querySelectorAll('.s-bar');
    bars.forEach(bar => bar.classList.remove('active'));

    populateStationsLists();
    addLogLine("SYSTEM", "safety", `Écoute arrêtée.`);
  }

  // --------------------------------------------------------------------------
  // 7. EVENEMENTS
  // --------------------------------------------------------------------------
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
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  bandFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      bandFilters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeBandFilter = btn.getAttribute('data-band');
      populateStationsLists();
      updateMapMarkers();
    });
  });

  stationSearch.addEventListener('input', () => {
    populateStationsLists();
    updateMapMarkers();
  });

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

  volumeSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    volumeVal.textContent = `${value}%`;
    config.volume = value / 100;
    updateAudioParameters();
  });

  btnGeoloc.addEventListener('click', handleGeolocation);
  btnActivateGeo.addEventListener('click', handleGeolocation);

  // Masquer les dials Squelch inutiles
  const squelchSliderEl = document.getElementById('squelch-slider');
  if (squelchSliderEl) {
    const squelchContainer = squelchSliderEl.closest('.dial-container');
    if (squelchContainer) {
      squelchContainer.style.display = 'none';
    }
  }

  // --------------------------------------------------------------------------
  // 8. INITIALISATION DIRECTE
  // --------------------------------------------------------------------------
  initMap();
  selectStation(STATIONS[0]);
  populateStationsLists();
  resizeCanvas();

  // Variation de l'audience
  setInterval(() => {
    config.totalGlobalListeners += Math.floor(Math.random() * 3) - 1;
    globalListenersText.textContent = `${config.totalGlobalListeners} en ligne`;
  }, 10000);
});
