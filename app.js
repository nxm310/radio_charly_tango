/**
 * ==========================================================================
 * SCANNER RADIO LIVE - MOTEUR DE FLUX REELS ET LOGIQUE TACTIQUE
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
  let sMeterInterval = null;
  
  // Web Audio & Streaming Variables
  let audioCtx = null;
  let streamAudio = null; // Élément audio pour le flux direct
  let streamSource = null;
  let streamGain = null;
  let noiseNode = null;
  let noiseGain = null;
  let audioFilter = null;
  let analyser = null;
  let dataArray = null;
  let visualizerCanvas = document.getElementById('audio-visualizer');
  let canvasCtx = visualizerCanvas.getContext('2d');
  
  // Configuration
  let config = {
    volume: 0.8,
    squelch: 0.35, // 0 to 1
    totalGlobalListeners: 948
  };

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

    updateMapMarkers();
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
            <i class="fa-solid fa-tower-broadcast"></i> Se Brancher en Direct
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

  // --------------------------------------------------------------------------
  // 2. MOTEUR AUDIO WEB AUDIO API & FLUX AUDIO REEL
  // --------------------------------------------------------------------------
  function initAudioEngine() {
    if (audioCtx) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // 1. Element Audio HTML5 pour lire les flux Icecast/MP3 en direct
    streamAudio = new Audio();
    streamAudio.crossOrigin = "anonymous"; // Permet de lire les fréquences du spectre malgré CORS
    streamAudio.preload = "auto";
    
    // Node Source basé sur notre élément audio
    streamSource = audioCtx.createMediaElementSource(streamAudio);
    
    // Contrôle de Gain du flux direct
    streamGain = audioCtx.createGain();
    streamGain.gain.value = config.volume;

    // 2. Node Analyser pour le visualiseur de spectre
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // 3. Filtre Passe-Bande Radio (Effet talkie-walkie très réaliste)
    audioFilter = audioCtx.createBiquadFilter();
    audioFilter.type = "bandpass";
    audioFilter.frequency.value = 1100; // Centré sur les fréquences vocales
    audioFilter.Q.value = 1.0; // Résonance étroite pour l'effet "cristallin" analogique

    // 4. Générateur de Bruit Blanc (Static)
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;
    
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.0;

    // 5. Chainage audio
    // Le flux direct passe par le filtre radio, puis le gain du flux, puis va à l'analyser et à la sortie
    streamSource.connect(audioFilter);
    audioFilter.connect(streamGain);
    streamGain.connect(analyser);

    // Le bruit blanc (static) va aussi à l'analyser pour s'afficher à l'écran
    noiseNode.connect(noiseGain);
    noiseGain.connect(analyser);

    analyser.connect(audioCtx.destination);
    
    noiseNode.start(0);

    // Lancer la boucle de rendu visuel du Canvas
    drawVisualizer();
    
    // Gérer les évènements de chargement du flux
    streamAudio.addEventListener('waiting', () => {
      lcdStatus.textContent = "BUFFERING";
      lcdStatus.style.backgroundColor = "rgba(255,159,67,0.15)";
      lcdStatus.style.color = "#ff9f43";
    });

    streamAudio.addEventListener('playing', () => {
      playClickSound();
      lcdStatus.textContent = "LOCKED";
      lcdStatus.style.backgroundColor = "rgba(0,255,102,0.15)";
      lcdStatus.style.color = "#0f6";
      addLogLine("RECEIVER", currentStation.category, `Signal verrouillé. Réception audio en cours.`);
    });

    streamAudio.addEventListener('error', (e) => {
      console.error("Erreur de chargement du flux direct :", e);
      lcdStatus.textContent = "ERR: OFFLINE";
      lcdStatus.style.backgroundColor = "rgba(255,56,56,0.15)";
      lcdStatus.style.color = "var(--color-safety)";
      addLogLine("SYSTEM", "safety", `Erreur de connexion au flux. Station temporairement hors-ligne.`);
    });
  }

  // Jouer des tonalités de manipulation radio (Bips réalistes)
  function playClickSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "triangle";
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(config.volume * 0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  }

  function playRogerBeep() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(config.volume * 0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.16);
  }

  // Ajustement dynamique du bruit de souffle analogique en fonction du Squelch
  function updateAudioParameters() {
    if (!audioCtx) return;

    // Volume du flux direct
    if (streamGain) {
      streamGain.gain.setValueAtTime(config.volume, audioCtx.currentTime);
    }

    // Le niveau de bruit statique dépend du squelch.
    // Si squelch bas (< 0.40), on mixe du bruit blanc analogique réaliste sur le flux réel.
    // Si squelch haut (> 0.40), on coupe complètement le bruit de fond pour un confort parfait.
    if (noiseGain) {
      let targetNoise = 0;
      if (isPlaying && config.squelch < 0.40) {
        targetNoise = config.volume * (0.40 - config.squelch) * 0.25;
      }
      noiseGain.gain.setValueAtTime(targetNoise, audioCtx.currentTime);
    }
  }

  // Oscillation du S-Meter basée sur l'activité audio réelle !
  function updateSMeterFromAudio() {
    if (!isPlaying || !analyser) return;

    analyser.getByteFrequencyData(dataArray);
    let total = 0;
    for (let i = 0; i < dataArray.length; i++) {
      total += dataArray[i];
    }
    const average = total / dataArray.length;
    
    // Convertir l'intensité audio réelle en barre S-Meter (1 à 10)
    // Plus le flux en direct contient de voix/bruit, plus les barres s'allument
    const signalLevel = Math.max(1, Math.min(10, Math.floor(average / 12) + 2));
    
    const bars = sMeterBars.querySelectorAll('.s-bar');
    bars.forEach((bar, index) => {
      if (index < signalLevel) {
        bar.classList.add('active');
      } else {
        bar.classList.remove('active');
      }
    });

    const dbValue = signalLevel * 6 + Math.floor(Math.random() * 4);
    lcdSignalText.textContent = `SIG: S${signalLevel} +${dbValue}dB`;
  }

  // --------------------------------------------------------------------------
  // 3. LOGIQUE DE VISUALISATION CANVAS (Canvas visualizer)
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
      popularContainer.innerHTML = `<div class="station-loc" style="padding: 10px; text-align: center;">Aucun flux actif trouvé</div>`;
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
        <div class="station-loc"><i class="fa-solid fa-rss animate-pulse"></i> FLUX EN DIRECT - ${station.location}</div>
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
  // 6. CONTROLES DE LECTURE DU SPECTRE REEL
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

    playClickSound();

    document.querySelectorAll('.station-item').forEach(el => {
      el.classList.remove('active-playing');
    });
    
    populateStationsLists();

    // Log système
    addLogLine("SYSTEM", "safety", `Recherche sur ${station.frequency.toFixed(3)} MHz...`);
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
      console.warn("Échec de la lecture automatique du flux direct (interaction requise) :", err);
    });

    updateAudioParameters();
    
    // Lancer la boucle de mise à jour du S-Meter en fonction de l'audio réel
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
      streamAudio.src = ""; // Libérer le stream réseau immédiatement
    }

    if (sMeterInterval) clearInterval(sMeterInterval);
    updateAudioParameters();
    
    // Éteindre les barres S-Meter
    const bars = sMeterBars.querySelectorAll('.s-bar');
    bars.forEach(bar => bar.classList.remove('active'));

    playRogerBeep();
    populateStationsLists();
    addLogLine("SYSTEM", "safety", `Récepteur mis en veille.`);
  }

  // --------------------------------------------------------------------------
  // 7. ALERTES MAJEURES
  // --------------------------------------------------------------------------
  function populateAlertsList() {
    alertsContainer.innerHTML = '';
    ALERTS.forEach(alert => {
      const item = document.createElement('div');
      item.className = `alert-item intensity-${alert.intensity}`;
      
      item.innerHTML = `
        <div class="alert-head">
          <span><i class="fa-solid fa-triangle-exclamation animate-pulse"></i> ${alert.title}</span>
          <span class="alert-time">${alert.time}</span>
        </div>
        <div class="alert-desc">${alert.message}</div>
        <div class="alert-foot">
          <span>Trafic: <span class="alert-delta">${alert.listenersDelta}</span></span>
          <span style="color:var(--color-aviation);">Brancher en direct <i class="fa-solid fa-angle-right"></i></span>
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

  function triggerSimulatedAlert() {
    if (ALERTS.length === 0) return;
    const randomAlert = ALERTS[Math.floor(Math.random() * ALERTS.length)];
    
    pushTitle.textContent = randomAlert.title;
    pushMessage.textContent = randomAlert.message;
    pushListeners.innerHTML = `<i class="fa-solid fa-users animate-pulse"></i> ${randomAlert.listenersDelta} auditeurs en direct`;
    
    pushNotification.classList.remove('hidden');

    if (audioCtx && isPlaying) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(500, audioCtx.currentTime);
      osc.frequency.setValueAtTime(1000, audioCtx.currentTime + 0.12);
      
      gain.gain.setValueAtTime(config.volume * 0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.36);
    }

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
  // 8. EVENEMENTS
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

  squelchSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    squelchVal.textContent = `${value}%`;
    config.squelch = value / 100;
    updateAudioParameters();
  });

  closePush.addEventListener('click', () => {
    pushNotification.classList.add('hidden');
  });

  btnGeoloc.addEventListener('click', handleGeolocation);
  btnActivateGeo.addEventListener('click', handleGeolocation);

  btnStart.addEventListener('click', () => {
    startupOverlay.classList.add('hidden');
    initAudioEngine();
    playStation();
    
    simulatedAlertInterval = setInterval(triggerSimulatedAlert, 40000);
    setTimeout(triggerSimulatedAlert, 12000);
  });

  // --------------------------------------------------------------------------
  // 9. INITIALISATION
  // --------------------------------------------------------------------------
  initMap();
  selectStation(STATIONS[0]);
  populateStationsLists();
  populateAlertsList();
  resizeCanvas();

  // Variation de l'audience
  setInterval(() => {
    config.totalGlobalListeners += Math.floor(Math.random() * 3) - 1;
    globalListenersText.textContent = `${config.totalGlobalListeners} en ligne`;
  }, 10000);
});
