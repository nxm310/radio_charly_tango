// Liste globale des stations de scanner radio avec flux réels en direct (HTTPS)
const STATIONS = [
  {
    id: "noaa-salisbury",
    name: "NOAA Weather Radio - Salisbury (KEC92)",
    frequency: 162.475, // MHz
    band: "VHF Marine",
    wavelength: "1.85m",
    category: "marine",
    categoryLabel: "Météo Maritime & Côtière",
    location: "Salisbury, MD, USA",
    coords: [38.3607, -75.5994],
    listeners: 185,
    signal: 5,
    description: "Bulletin météo et rapports de sécurité côtière en direct de la NOAA pour la côte Est américaine. Transmission continue par voix synthétisée officielle et atmosphérique.",
    streamUrl: "https://wxradio.dyndns.org:8000/Salisbury.mp3"
  },
  {
    id: "noaa-worcester",
    name: "NOAA Weather Radio - Worcester (WXL93)",
    frequency: 162.550, // MHz
    band: "VHF Marine",
    wavelength: "1.85m",
    category: "marine",
    categoryLabel: "Maritime & Sécurité",
    location: "Worcester, MA, USA",
    coords: [42.2626, -71.8023],
    listeners: 120,
    signal: 4,
    description: "Flux continu de la NOAA diffusant les alertes de sécurité, les vents, et les prévisions côtières pour le Massachusetts.",
    streamUrl: "https://wxradio.dyndns.org:8000/KXI94.mp3"
  },
  {
    id: "noaa-baltimore",
    name: "NOAA Weather & Emergency - Baltimore",
    frequency: 162.400, // MHz
    band: "VHF safety",
    wavelength: "1.85m",
    category: "safety",
    categoryLabel: "Urgences & Vigilance",
    location: "Baltimore, MD, USA",
    coords: [39.2904, -76.6122],
    listeners: 240,
    signal: 4,
    description: "Canal opérationnel continu diffusant les prévisions météo maritimes et terrestres, ainsi que les vigilances d'urgence pour le Maryland.",
    streamUrl: "https://wxradio.dyndns.org:8000/KXI41.mp3"
  },
  {
    id: "ham-repeater-brazil",
    name: "Relais VHF Radio-Amateur (CRAM-PY2KJZ)",
    frequency: 146.610, // MHz
    band: "VHF HAM",
    wavelength: "2.04m",
    category: "space-ham",
    categoryLabel: "Radio-Amateurs",
    location: "Campinas, Brésil",
    coords: [-22.9064, -47.0616],
    listeners: 78,
    signal: 4,
    description: "Écoute en direct des communications radio-amateurs locales transitant par le relais VHF du Club de Radio-Amateurs de Campinas.",
    streamUrl: "https://live.arer.org.br:8000/amador"
  },
  {
    id: "swl-global-relay",
    name: "Shortwave Broadcast - Global Relay",
    frequency: 7.200, // MHz
    band: "HF Shortwave",
    wavelength: "41.67m",
    category: "space-ham",
    categoryLabel: "Ondes Courtes / Shortwave",
    location: "Londres, UK (Relais)",
    coords: [51.5074, -0.1278],
    listeners: 312,
    signal: 3,
    description: "Liaison avec les ondes courtes mondiales. Transmission continue de rapports d'actualité et d'émissions internationales avec le souffle atmosphérique HF.",
    streamUrl: "https://relay.urc.org.uk/live"
  }
];

// Alertes majeures réelles ou inspirées du direct pour l'activité
const ALERTS = [
  {
    id: "alert-1",
    stationId: "noaa-salisbury",
    title: "Vigilance Côtière : Salisbury",
    message: "Alerte de vent fort en vigueur. Conditions de navigation difficiles signalées le long de la côte.",
    intensity: "high",
    listenersDelta: "+120",
    time: "En cours"
  },
  {
    id: "alert-2",
    stationId: "noaa-baltimore",
    title: "Alerte Météo : Baltimore Bay",
    message: "Avis de tempête locale avec rafales soudaines pouvant atteindre 40 nœuds. Vigilance accrue recommandée.",
    intensity: "high",
    listenersDelta: "+210",
    time: "Il y a 2 min"
  }
];
