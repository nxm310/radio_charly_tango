// Liste globale des stations de scanner radio
const STATIONS = [
  // --- SÉCURITÉ PUBLIQUE / URGENCES ---
  {
    id: "paris-pompiers",
    name: "Paris Pompiers - Brigade (BSPP)",
    frequency: 85.550, // MHz
    band: "VHF",
    wavelength: "3.5m",
    category: "safety",
    categoryLabel: "Secours & Incendie",
    location: "Paris, France",
    coords: [48.8566, 2.3522],
    listeners: 342,
    signal: 5,
    description: "Canal opérationnel de la Brigade de Sapeurs-Pompiers de Paris. Transmissions d'urgences, départs de secours et coordination de crise.",
    audioFeed: "demo-safety-1"
  },
  {
    id: "ny-pd-manhattan",
    name: "NYPD Manhattan South Dispatch",
    frequency: 476.3375, // MHz
    band: "UHF",
    wavelength: "0.63m",
    category: "safety",
    categoryLabel: "Police / Gendarmerie",
    location: "New York, USA",
    coords: [40.7128, -74.0060],
    listeners: 1205,
    signal: 4,
    description: "Central dispatch for NYPD Southern Manhattan Precincts (1st, 5th, 7th, 9th, 10th and 13th). High activity.",
    audioFeed: "demo-safety-2"
  },
  {
    id: "london-ambulance",
    name: "London Ambulance Service Dispatch",
    frequency: 141.525, // MHz
    band: "VHF",
    wavelength: "2.12m",
    category: "safety",
    categoryLabel: "Ambulances & SMUR",
    location: "Londres, UK",
    coords: [51.5074, -0.1278],
    listeners: 184,
    signal: 4,
    description: "London-wide emergency dispatch and paramedic coordination for major trauma and medical responses.",
    audioFeed: "demo-safety-3"
  },
  {
    id: "tokyo-ems",
    name: "Tokyo Fire & EMS Command (東京消防庁)",
    frequency: 466.550, // MHz
    band: "UHF",
    wavelength: "0.64m",
    category: "safety",
    categoryLabel: "Secours & Incendie",
    location: "Tokyo, Japon",
    coords: [35.6762, 139.6503],
    listeners: 412,
    signal: 5,
    description: "Tokyo Fire Department primary dispatch and disaster management communications. Fully digitalized network simulator.",
    audioFeed: "demo-safety-4"
  },

  // --- COMMUNICATIONS AÉRONAUTIQUES ---
  {
    id: "paris-cdg-tower",
    name: "Paris-CDG Tour de Contrôle (LFPG)",
    frequency: 118.150, // MHz
    band: "VHF Air",
    wavelength: "2.54m",
    category: "aviation",
    categoryLabel: "Aéronautique",
    location: "Roissy CDG, France",
    coords: [49.0097, 2.5479],
    listeners: 529,
    signal: 5,
    description: "Contrôle d'aérodrome de l'aéroport Paris-Charles de Gaulle. Fréquence Tour Nord pour les atterrissages et décollages.",
    audioFeed: "demo-aviation-1"
  },
  {
    id: "jfk-approach",
    name: "New York JFK Radar Approach",
    frequency: 128.125, // MHz
    band: "VHF Air",
    wavelength: "2.34m",
    category: "aviation",
    categoryLabel: "Aéronautique",
    location: "New York, USA",
    coords: [40.6413, -73.7781],
    listeners: 840,
    signal: 3,
    description: "JFK Terminal Radar Approach Control (TRACON) managing arrivals and spacing for runways 4L/4R and 22L/22R.",
    audioFeed: "demo-aviation-2"
  },
  {
    id: "tokyo-haneda-tower",
    name: "Tokyo Haneda Tower (RJTT)",
    frequency: 118.725, // MHz
    band: "VHF Air",
    wavelength: "2.53m",
    category: "aviation",
    categoryLabel: "Aéronautique",
    location: "Haneda Airport, Japon",
    coords: [35.5494, 139.7798],
    listeners: 298,
    signal: 4,
    description: "Tokyo International Airport (Haneda) primary tower and local control frequency for coastal runways.",
    audioFeed: "demo-aviation-3"
  },

  // --- SERVICES MARITIMES ---
  {
    id: "marseille-port",
    name: "Marseille Port Control - Canal 12",
    frequency: 156.600, // MHz
    band: "VHF Marine",
    wavelength: "1.92m",
    category: "marine",
    categoryLabel: "Maritime",
    location: "Marseille, France",
    coords: [43.2965, 5.3698],
    listeners: 98,
    signal: 4,
    description: "Capitainerie et régulation du trafic maritime du Grand Port Maritime de Marseille (GPMM). Mouvements des ferries et porte-conteneurs.",
    audioFeed: "demo-marine-1"
  },
  {
    id: "rotterdam-harbor",
    name: "Rotterdam Sector Maasmond - Ch 20",
    frequency: 157.000, // MHz
    band: "VHF Marine",
    wavelength: "1.91m",
    category: "marine",
    categoryLabel: "Maritime",
    location: "Rotterdam, Pays-Bas",
    coords: [51.9244, 4.4777],
    listeners: 145,
    signal: 5,
    description: "Maasmond traffic coordination for one of the largest ports in the world. Communication between pilots, tugboats, and supertankers.",
    audioFeed: "demo-marine-2"
  },
  {
    id: "sf-coast-guard",
    name: "US Coast Guard Sector San Francisco - Ch 16",
    frequency: 156.800, // MHz
    band: "VHF Marine",
    wavelength: "1.91m",
    category: "marine",
    categoryLabel: "Maritime",
    location: "San Francisco, USA",
    coords: [37.7749, -122.4194],
    listeners: 215,
    signal: 3,
    description: "International hailing and distress frequency. Marine emergency coordination, search & rescue, and safety advisories.",
    audioFeed: "demo-marine-3"
  },

  // --- ONDES COURTES (HF) & RADIO-AMATEURS ---
  {
    id: "swiss-ham",
    name: "Swiss Alps HAM Repeater HB9",
    frequency: 145.725, // MHz (VHF Amateur)
    band: "VHF HAM",
    wavelength: "2.06m",
    category: "space-ham",
    categoryLabel: "Radio-Amateurs",
    location: "Berne, Suisse",
    coords: [46.9480, 7.4474],
    listeners: 112,
    signal: 4,
    description: "High-altitude alpine VHF repeater. Regional chats between operators, technical experiments and alpine weather reports.",
    audioFeed: "demo-ham-1"
  },
  {
    id: "shannon-volmet",
    name: "Shannon VOLMET HF Weather",
    frequency: 5.505, // MHz (HF Aviation)
    band: "HF Shortwave",
    wavelength: "54.49m",
    category: "space-ham",
    categoryLabel: "Ondes Courtes / SWL",
    location: "Shannon, Irlande",
    coords: [52.7126, -8.8689],
    listeners: 310,
    signal: 2,
    description: "Aviation weather broadcast station. Continuous voice reports of weather forecasts for North Atlantic airports. Atmospheric noise present.",
    audioFeed: "demo-ham-2"
  },
  {
    id: "iss-space-link",
    name: "ISS Space Voice Downlink (ARISS)",
    frequency: 145.800, // MHz (VHF Space)
    band: "VHF Space",
    wavelength: "2.06m",
    category: "space-ham",
    categoryLabel: "Espace & Satellite",
    location: "Orbite Terrestre Basse (Relais)",
    coords: [0.0, 0.0], // Se met à jour dynamiquement ou simulé au centre
    listeners: 789,
    signal: 3,
    description: "Amateur Radio on the International Space Station (ARISS) down-link. Direct voice contacts with astronauts when passing overhead.",
    audioFeed: "demo-space-1"
  }
];

// Alertes majeures simulées pour susciter l'intérêt (Notifications Push)
const ALERTS = [
  {
    id: "alert-1",
    stationId: "paris-pompiers",
    title: "Pic d'activité : Paris Pompiers",
    message: "Incendie majeur en cours dans le 13e arrondissement de Paris. Dispositif de secours important en cours de déploiement.",
    intensity: "high",
    listenersDelta: "+850",
    time: "À l'instant"
  },
  {
    id: "alert-2",
    stationId: "jfk-approach",
    title: "Trafic dense : JFK Airport",
    message: "Fortes turbulences de cisaillement au-dessus de New York. Spacements accrus et déroutement de 3 vols en cours.",
    intensity: "medium",
    listenersDelta: "+420",
    time: "Il y a 5 min"
  },
  {
    id: "alert-3",
    stationId: "sf-coast-guard",
    title: "Alerte détresse : San Francisco Bay",
    message: "Opération de recherche et sauvetage (SAR) lancée après un appel de détresse d'un voilier près du Golden Gate.",
    intensity: "high",
    listenersDelta: "+610",
    time: "Il y a 12 min"
  }
];
