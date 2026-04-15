// ═══════════════════════════════════════════════════════════════════════════════
// HYPNOSE IA — NOYAU (hypnose-core.js)
// © C Concept&Dev — Christophe Bonnet
//
// Architecture noyau/périphérique — identique au Thérapeute IA v8.
// Ce fichier contient TOUTE la logique. Les fichiers HTML sont des shells légers
// qui définissent window.VARIANT puis chargent ce script.
//
// window.VARIANT = {
//   mode: 'standard' | 'express' | 'pro',
//   model: 'claude-sonnet-4-6',
//   skipEntretien: false,
//   showClinical: false,
//   maxExchanges: 10,
//   autoTransition: true,
//   vakogEnabled: true,
//   binauralEnabled: true,
//   cameraEnabled: true,
//   label: 'Hypnose IA v3 — Standard'
// };
//
// Un patch = un fichier (hypnose-core.js).
// ═══════════════════════════════════════════════════════════════════════════════

// Apply VARIANT defaults
if (!window.VARIANT) window.VARIANT = {
  mode: 'standard',
  model: 'claude-sonnet-4-6',
  skipEntretien: false,
  showClinical: false,
  maxExchanges: 10,
  autoTransition: true,
  vakogEnabled: true,
  binauralEnabled: true,
  cameraEnabled: true,
  label: 'Hypnose IA v3 — Standard',
  // Web-Consult defaults
  webConsultEnabled: false,
  webConsultDomain: 'hypnosis',
  webConsultSources: ['pubmed', 'scholar', 'google_scholar'],
  webConsultAutoTrigger: false,
  webConsultManualTrigger: false
};

'use strict';

// ═══════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════
const CFG = {
  WORKER:      (localStorage.getItem('h_worker') || 'https://clone-proxy.11drumboy11.workers.dev').replace(/\/+$/, ''),
  OAI_PROXY:   'https://openai-proxy.11drumboy11.workers.dev/',
  GTTS_PROXY:  'https://google-tts-proxy.11drumboy11.workers.dev/',
  SPEED:       parseFloat(localStorage.getItem('h_speed') || '1.0'),
  MODEL:       window.VARIANT?.model || 'claude-sonnet-4-6',
};

// ═══════════════════════════════════════════════
// VOIX — CATALOGUE COMPLET
// ═══════════════════════════════════════════════
const VOICES = {
  google: [
    { id:'google-neural2-m',   label:'Neural2 · Thomas',     desc:'Voix masculine, naturelle',     engine:'google', vName:'fr-FR-Neural2-D',           gender:'MALE',   chirp:false },
    { id:'google-neural2-f',   label:'Neural2 · Sophie',     desc:'Voix féminine, douce',          engine:'google', vName:'fr-FR-Neural2-A',           gender:'FEMALE', chirp:false },
    { id:'google-chirp3-m',    label:'Chirp3 HD · Orus ✦',   desc:'Ultra-réaliste masculin',       engine:'google', vName:'fr-FR-Chirp3-HD-Orus',      gender:'MALE',   chirp:true  },
    { id:'google-chirp3-f',    label:'Chirp3 HD · Aoede ✦',  desc:'Ultra-réaliste féminin',        engine:'google', vName:'fr-FR-Chirp3-HD-Aoede',     gender:'FEMALE', chirp:true  },
  ],
  openai: [
    { id:'openai-onyx',    label:'Onyx',    desc:'Profond, grave, masculin',       engine:'openai', oaiVoice:'onyx'    },
    { id:'openai-echo',    label:'Echo',    desc:'Clair, posé, masculin',          engine:'openai', oaiVoice:'echo'    },
    { id:'openai-alloy',   label:'Alloy',   desc:'Neutre, chaleureux',             engine:'openai', oaiVoice:'alloy'   },
    { id:'openai-nova',    label:'Nova',    desc:'Légère, expressive, féminine',   engine:'openai', oaiVoice:'nova'    },
    { id:'openai-shimmer', label:'Shimmer', desc:'Douce, féminine, enveloppante',  engine:'openai', oaiVoice:'shimmer' },
    { id:'openai-fable',   label:'Fable',   desc:'Chaleureuse, narrative',         engine:'openai', oaiVoice:'fable'   },
  ],
  web: [
    { id:'webspeech', label:'Navigateur', desc:'Voix système (sans clé API)', engine:'web' },
  ]
};

// ═══════════════════════════════════════════════
// COLLÈGE MONDIAL D'EXPERTS (synthèse en silence)
// ═══════════════════════════════════════════════
const COLLEGE = {
  // Présidence d'honneur
  erickson:    { name:'Milton H. Erickson', title:'Père de l\'hypnose ericksonienne', style:'indirect, permissif, métaphores, utilisation', domain:['all'] },
  janet:       { name:'Pierre Janet', title:'Dissociation & bases cliniques', style:'dissociation thérapeutique, automatismes', domain:['trauma','anxiete'] },
  hilgard:     { name:'Ernest R. Hilgard', title:'Néodissociation, suggestibilité', style:'évaluation suggestibilité, trance logic', domain:['all'] },
  // Conseil scientifique
  spiegel:     { name:'David Spiegel (Stanford)', title:'Douleur, anxiété, neurosciences', style:'eye roll, absorption, evidence-based', domain:['douleur','anxiete','chirurgie'] },
  kirsch:      { name:'Irving Kirsch (Harvard)', title:'Placebo, suggestibilité, attentes', style:'expectation hypnosis, response sets', domain:['all'] },
  // Ericksonien & thérapie brève
  zeig:        { name:'Jeffrey Zeig', title:'Fondation Erickson, communication indirecte', style:'indirect suggestion, confusion technique', domain:['all'] },
  gilligan:    { name:'Stephen Gilligan', title:'Generative trance, Self relationnel', style:'somatic resonance, generative change', domain:['confiance','stress','anxiete'] },
  yapko:       { name:'Michael Yapko', title:'Dépression, addictions, hypnose clinique', style:'temporal orientation, future pacing', domain:['tabac','stress','sommeil'] },
  rossi:       { name:'Ernest Rossi', title:'Psychobiologie, ultradian healing', style:'ideodynamic signaling, hand levitation', domain:['all'] },
  // Médical & douleur
  lang:        { name:'Elvira Lang', title:'Hypnose procédurale, soins médicaux', style:'self-hypnosis, comfort talk, patient-centered', domain:['chirurgie','douleur'] },
  jensen:      { name:'Mark P. Jensen', title:'Douleur chronique, auto-hypnose', style:'pain modulation, daily self-hypnosis', domain:['douleur'] },
  montgomery:  { name:'Guy Montgomery', title:'Oncologie, douleur, nausées', style:'rapid induction, targeted suggestion', domain:['chirurgie','douleur'] },
  // Hammond (spécialiste hypnose thérapeutique)
  hammond:     { name:'D. Corydon Hammond', title:'Métaphores & Suggestions Hypnotiques — ⚡RAG 960 chunks', style:'scripts hypnotiques, métaphores thérapeutiques, suggestions directes/indirectes, protocoles cliniques complets pour tous troubles', domain:['all'], rag:true },
  // Trauma & sécurité
  herman:      { name:'Judith L. Herman (cadre trauma)', title:'Sécurité-témoignage-reconnexion', style:'safety first, stabilization before processing', domain:['anxiete','trauma'] },
  vanderhart:  { name:'Onno van der Hart', title:'Dissociation structurelle', style:'phase-oriented treatment, structural dissociation', domain:['trauma','anxiete'] },
  // Pédiatrie & performance
  olness:      { name:'Karen Olness', title:'Hypnose pédiatrique', style:'imagery, storytelling, naturalistic', domain:['anxiete','douleur'] },
  // Cognitif
  alladin:     { name:'Assen Alladin', title:'Hypnose cognitive & TCC', style:'cognitive hypnotherapy, CBH protocol', domain:['anxiete','stress','tabac'] },
  // Schultz (autohypnose)
  schultz:     { name:'J.H. Schultz', title:'Training autogène, autohypnose', style:'passive concentration, body warmth-heaviness', domain:['stress','sommeil','sport'] },
  // Roustang
  roustang:    { name:'François Roustang', title:'L\'Art de l\'Hypnose 2024 — ⚡RAG 130 chunks', style:'présence totale, immobilité, éveil des ressources, rapport au monde différent, hypnose humaniste', domain:['all'], rag:true },

  // Trevor — Hypnose Conversationnelle (RAG indexé)
  trevor:      { name:'Allan Trevor', title:'Hypnose Conversationnelle — ⚡RAG 59 chunks', style:'langage conversationnel, induction naturelle, suggestion intégrée dans le discours, rapport authentique', domain:['all'], rag:true },
  // Philippe Aïm — Urgences (RAG en cours)
  aim:         { name:'Philippe Aïm', title:'Hypnose en situation d\'urgence — ⚡RAG 129 chunks', style:'hypnose rapide, état de choc, intervention brève, communication de crise, anxiété intense', domain:['anxiete','chirurgie','trauma','stress'], rag:true },

  // ═══ COLLÈGE FRANÇAIS D'EXPERTS ═══
  // Pionniers historiques
  charcot:     { name:'Jean-Martin Charcot', title:'Neurologie, hystérie, Salpêtrière', style:'observation clinique, états dissociatifs, suggestibilité pathologique', domain:['anxiete','trauma'] },
  bernheim:    { name:'Hippolyte Bernheim', title:'École de Nancy, suggestion psychologique', style:'suggestion directe, rapport thérapeutique, loi des effets', domain:['all'] },
  // Hypnose médicale française
  becchio:     { name:'Jean Becchio', title:'Hypnose médicale, anesthésie, douleur', style:'hypnose chirurgicale, analgésie, induction rapide médicale', domain:['chirurgie','douleur'] },
  bellet:      { name:'Patrick Bellet', title:'Institut Français d\'Hypnose Ericksonienne', style:'ericksonien appliqué, thérapies brèves, formation clinique', domain:['all'] },
  bioy:        { name:'Antoine Bioy', title:'Psychologie clinique, douleur chronique, universitaire', style:'hypnose cognitive-clinique, douleur, intégration psychothérapique', domain:['douleur','anxiete','stress'] },
  adjadj:      { name:'Laurence Adjadj', title:'Hypnotim, thérapies brèves, psychologie', style:'hypnose brève orientée solution, ressources, trauma léger', domain:['anxiete','confiance','stress'] },
  // Hypnose thérapeutique moderne française
  lockert:     { name:'Olivier Lockert', title:'Hypnose humaniste, auteur, formateur international', style:'hypnose humaniste, présence, éveil des ressources profondes', domain:['confiance','stress','all'] },
  // Populaire / grand public francophone
  benhaim:     { name:'Jean-Marc Benhaïem', title:'L\'Art de l\'Hypnose avec Roustang — ⚡RAG 130 chunks', style:'hypnose médicale intégrative, soins de support, douleur, présence thérapeute, accompagnement existentiel', domain:['douleur','chirurgie','stress','all'], rag:true },
};

// Mapping protocole → experts principaux
// PROTOCOL_EXPERTS supprimé — sélection dynamique par domaine dans getExpertPanel()


// ═══════════════════════════════════════════════
// SÉLECTION D'EXPERTS — dynamique, basée sur les domaines déclarés
// Plus de table statique. Chaque expert déclare ses domaines dans COLLEGE.
// La sélection filtre par domaine et priorise les experts RAG.
// ═══════════════════════════════════════════════
function getExpertPanel(protocolId) {
  // Filtrer les experts dont le domaine couvre ce protocole (ou 'all')
  const eligible = Object.entries(COLLEGE)
    .filter(([id, e]) => e.domain.includes('all') || e.domain.includes(protocolId))
    .map(([id, e]) => ({ id, ...e }));

  if (eligible.length === 0) {
    // Fallback absolu : les 3 fondateurs
    return [COLLEGE.erickson, COLLEGE.hammond, COLLEGE.zeig].filter(Boolean);
  }

  // Prioriser : RAG d'abord, puis par pertinence domaine
  const withRAG = eligible.filter(e => e.rag);
  const withoutRAG = eligible.filter(e => !e.rag);

  // Composer : max 3 RAG + compléter avec les autres, max 8 total
  const panel = [...withRAG.slice(0, 3), ...withoutRAG].slice(0, 8);
  return panel;
}

function buildCollegePrompt(protocolId) {
  const experts = getExpertPanel(protocolId);
  const ragExperts = experts.filter(e => e.rag);
  let p = '\n═══ COLLÈGE MONDIAL D\'EXPERTS — SYNTHÈSE ═══\n';
  p += 'Tu synthétises en silence le savoir de ce collège. Une seule voix au patient — la tienne, informée par tous.\n\n';
  experts.forEach(e => {
    const ragTag = e.rag ? ' [📚 RAG]' : '';
    p += `• ${e.name}${ragTag} (${e.title}) → ${e.style}\n`;
  });
  // ── RAG : liste dynamique depuis le catalogue réel ──
  const catalogBooks = RAG_CATALOG.loaded ? RAG_CATALOG.books : [];
  if (catalogBooks.length > 0) {
    p += `\n⚡ BIBLIOTHÈQUE HYPNOSE ACTIVE — ${RAG_CATALOG.totalChunks} chunks sur ${catalogBooks.length} ouvrages :\n`;
    catalogBooks.forEach(b => {
      p += `  📚 ${b.author} — "${b.book_title}" (${b.chunks} chunks)\n`;
    });
    p += `\nLes extraits les plus pertinents sont fournis dans le bloc BIBLIOTHÈQUE HYPNOSE ci-dessous.\n`;
    p += `INSTRUCTIONS D'UTILISATION :\n`;
    p += `- Intègre les scripts et métaphores DIRECTEMENT dans le script hypnotique\n`;
    p += `- Adapte le registre stylistique de l'auteur selon la phase (présence, langage indirect, urgence…)\n`;
    p += `- Ne cite JAMAIS les auteurs au patient. La bibliothèque travaille en transparence.\n`;
    p += `- Si un extrait contient une suggestion précise → l'utiliser mot pour mot ou l'adapter\n`;
  } else if (ragExperts.length) {
    p += `\n⚡ SOURCES RAG : ${ragExperts.map(e=>e.name).join(', ')} (catalogue en chargement)\n`;
    p += `Intègre les extraits bibliothèque fournis ci-dessous dans le script.\n`;
  }
  p += '\nINSTRUCTION GÉNÉRALE : Chaque intervention reflète la meilleure synthèse de ces approches. Le collège travaille en arrière-plan.\n';
  return p;
}

// ═══════════════════════════════════════════════
// PROTOCOLES
// ═══════════════════════════════════════════════
const PROTOCOLS = [
  { id:'anxiete',   name:'Anxiété & Phobies',         emoji:'🌊', desc:'Libération de l\'anxiété, phobies, attaques de panique.',                       sessions:6,  suggestions:['Ancrage pouce-index','Lieu sûr disponible','Auto-hypnose 10 min/j','Journal émotionnel'],          quickScripts:['Induction sensorielle','Lieu sûr','Flottement','Portillon émotions','Ancrage calme','Retour doux'], ci:['psychose','schizophrénie'] },
  { id:'douleur',   name:'Douleur Chronique',          emoji:'🌡️', desc:'Hypno-analgésie Hammond — gant anesthésique, gate-control, rhéostat.',          sessions:6,  suggestions:['Gant anesthésique actif','Rhéostat douleur','Auto-hypnose matin','Journal douleur 0-10'],         quickScripts:['Gant anesthésique','Gate-control','Rhéostat douleur','Dissociation spatiale','Substitution','Ancrage confort'], ci:['douleur aiguë non diagnostiquée'] },
  { id:'sommeil',   name:'Troubles du Sommeil',        emoji:'🌙', desc:'Insomnie, difficultés d\'endormissement. Loi des effets inversés.',              sessions:4,  suggestions:['Ritual endormissement','Auto-hypnose coucher','Pas d\'écran 1h avant','Respiration 4-7-8'],     quickScripts:['Loi effets inversés','Lourdeur agréable','Dissociation corps','Marée somnolence','Transition naturelle','Ancrage sommeil'], ci:['apnée sévère'] },
  { id:'tabac',     name:'Arrêt du Tabac',             emoji:'🚭', desc:'Programme 6 séances — aversion + ressource + identité non-fumeur.',              sessions:6,  suggestions:['Ancrage liberté','Verre d\'eau à la place','Journal envies','Liste bénéfices arrêt'],          quickScripts:['Dégoût cigarette','Corps qui guérit','Liberté respiratoire','Ancrage liberté','Gestion manque','Futur non-fumeur'], ci:[] },
  { id:'poids',     name:'Poids & Alimentation',       emoji:'🌱', desc:'Rapport sain à la nourriture, satiété, reconnexion corps-esprit.',               sessions:8,  suggestions:['Pleine conscience alimentaire','Faim physique vs émotionnelle','Ancrage satiété','Journal alimentaire'], quickScripts:['Reconnexion satiété','Corps en confiance','Faim vs émotion','Ancrage satiété','Image de soi','Plaisir naturel'], ci:['anorexie sévère','boulimie sévère'] },
  { id:'chirurgie', name:'Préparation Chirurgie',      emoji:'🏥', desc:'Pré-op, per-op, post-op — anxiété, douleur, récupération.',                     sessions:3,  suggestions:['Visualisation succès','Ancrage calme','Récupération accélérée','Confiance équipe médicale'],   quickScripts:['Calme pré-op','Confiance chirurgien','Corps qui guérit','Anesthésie sereine','Récupération rapide','Ancrage sécurité'], ci:[] },
  { id:'confiance', name:'Confiance & Estime de Soi',  emoji:'🌟', desc:'Renforcement du Moi, estime de soi, ressources inconscientes.',                 sessions:5,  suggestions:['Ancrage force','Journal réussites','Visualisation matin','Posture puissance 2 min/j'],          quickScripts:['Ressources inconscientes','Régression positive','Futur projeté','Métaphore arbre','Ancrage force','Phare intérieur'], ci:[] },
  { id:'sport',     name:'Performance Sportive',       emoji:'⚡', desc:'Zone optimale, visualisation, gestion pression, ancrage performance.',           sessions:4,  suggestions:['Visualisation pré-compétition','Ancrage zone','Routine mentale','Récupération mentale'],        quickScripts:['Entrée dans la zone','Visualisation performance','Gestion pression','Ancrage zone','Confiance athlète','Récupération accélérée'], ci:[] },
  { id:'stress',    name:'Stress & Burn-out',          emoji:'🌿', desc:'Stress chronique, burn-out, reconnexion à soi, ressources permanentes.',         sessions:6,  suggestions:['Bulle de sérénité','Limite saine','Décompression rituel soir','Liste besoins fondamentaux'], quickScripts:['Décompression immédiate','Bulle protectrice','Reconnexion besoins','Limite saine','Ressource sérénité','Récupération profonde'], ci:['dépression sévère non traitée'] },
];

// ═══════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════
const DEPTH_LABELS = ['Éveil normal','Légère détente','Relaxation physique','Hypnoïde','Hypnose légère','Hypnose moyenne','Somnambulisme léger','Somnambulisme','Transe profonde','Transe très profonde','Somnambulisme profond'];
const PHASE_NAMES = {prep:'PRÉPARATION',induction:'INDUCTION',deepening:'APPROFOND.',work:'TRAVAIL',return:'RETOUR',anchor:'ANCRAGE'};
const PHASE_DEPTH = {prep:1,induction:3,deepening:6,work:7,return:4,anchor:2};
const PHASE_SPEED = {prep:.3,induction:.6,deepening:1,work:.8,return:.5,anchor:.4};
const PHASE_TEXT = {prep:'Installez-vous confortablement...',induction:'Laissez vos yeux se fermer...',deepening:'Chaque respiration vous amène plus profond...',work:'Votre inconscient travaille pour vous...',return:'Doucement, revenez à vous...',anchor:'Gardez cette ressource avec vous...'};

const ENT_PHASES = ['Accueil & alliance','Exploration','Anamnèse hypnotique','Formulation','Protocole & plan','Calibration'];

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const S = {
  // Profil
  prenom:'', age:'', ci:'',
  // Sélection
  protocol:null, sessionNum:1,
  // Entretien
  entretienPhase:0, entretienMessages:[], entretienHistory:[],
  entretienReady:false, entretienTimer:null, seanceStarted:false,
  collegeDecision: null,
  entretienStartTime:null,
  clinicalProfile:{ anxiety:0, motivation:0, suggestibility:0, tags:[], vakog:{v:0,a:0,k:0,og:0} },
  // Media — V7 pattern (stream partagé caméra + micro)
  _mediaStream:null, _mediaReady:false, _entretienFaceContext:null,
  // Séance hypno
  depth:0, phase:'prep',
  seanceStartTime:null, seanceTimer:null,
  seanceMessages:[], seanceLog:[],
  hypnoHistory:[],
  // Fin de séance
  inReturnPhase:false,
  // Multimodal
  binauralOn:true, faceApiOn:true, speechOn:true,
  ttsSpeed:CFG.SPEED, voiceMode:'google-neural2-m',
  // TTS
  ttsPlaying:false, ttsAudio:null,
  // Speech
  recognitionE:null, recognitionS:null, micActiveE:false, micActiveS:false, _micERunning:false,
  isGeneratingE:false,
  // Canvas
  canvasAnim:null, spiralAngle:0,
  // Binaural
  binCtx:null, oscL:null, oscR:null,
  // Face-api
  faceLoaded:false, faceInterval:null, relaxScore:0,
  mediaStream:null,
  // JSON master (cumul sessions)
  masterData:null,
  // ── MÉMOIRE THÉRAPEUTIQUE (nouveau) ──
  // Prédicats linguistiques extraits de l'entretien (mots exacts du patient)
  patientPredicates: [],    // ex: ['fatigue', 'lourd', 'prison', 'liberté']
  patientMetaphors:  [],    // métaphores spontanées du patient
  // Mémoire inter-séances
  sessionMemory: {
    effectiveMetaphors: [],  // métaphores qui ont bien fonctionné (depth > 7)
    placedAnchors:      [],  // ancrages posés ({geste, ressource, session})
    keywordsHistory:    [],  // mots clés cumulés toutes séances
    resistancePatterns: [],  // patterns de résistance observés
    lastSessionSummary: '',  // résumé clinique session précédente
  },
  // Résistance détectée pendant séance
  resistanceSignals: [],
  isGenerating: false,
  // Web-Consult cache (1 appel par session)
  _webConsultDone: false,
  _webConsultResults: null,
  _webConsultTrigger: null,
};

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const V = window.VARIANT;
  console.log(`[Hypnose Core] ✅ VARIANT loaded: mode=${V.mode}, model=${V.model}, label=${V.label}`);

  loadSettings();
  updateStats();
  setTimeout(() => loadRAGCatalog(), 1200);

  // VARIANT-driven feature gating
  if (!V.vakogEnabled) {
    const vakog = document.getElementById('vakog-module');
    if (vakog) vakog.style.display = 'none';
  }
  if (!V.binauralEnabled) {
    const binSw = document.getElementById('binaural-sw');
    if (binSw) { binSw.classList.remove('on'); S.binauralOn = false; }
  }
  if (!V.cameraEnabled) {
    const camBlocks = document.querySelectorAll('#cam-entretien-block, .cam-panel');
    camBlocks.forEach(el => { if (el) el.style.display = 'none'; });
  }

  // Express mode: skip to protocol selection directly
  if (V.skipEntretien) {
    const ctaBtn = document.querySelector('.btn-cta-main');
    if (ctaBtn) ctaBtn.textContent = 'Choisir un protocole →';
  }

  // Afficher modal consentement si pas encore accepté
  if (!localStorage.getItem('h_consent')) {
    const m = document.getElementById('modal-consent');
    if (m) m.style.display = 'flex';
  } else {
    const m = document.getElementById('modal-consent');
    if (m) m.style.display = 'none';
  }
});

// ═══════════════════════════════════════════════
// PROFILE & SETTINGS
// ═══════════════════════════════════════════════
function loadSettings() {
  const p = JSON.parse(localStorage.getItem('h_profile') || '{}');
  S.prenom = ''; S.age = ''; S.ci = p.ci || ''; // prénom/âge collectés par l'IA pendant l'entretien
  S.voiceMode = localStorage.getItem('h_voice') || 'google-neural2-m';
  S.binauralOn = localStorage.getItem('h_binaural') !== 'false';
  S.faceApiOn  = localStorage.getItem('h_faceapi') !== 'false';
  S.speechOn   = localStorage.getItem('h_speech') !== 'false';
  updateHero();
  renderCollegeFooter();
}
function saveSettings() {
  S.ci     = document.getElementById('cfg-ci').value;
  CFG.WORKER = (document.getElementById('cfg-worker').value.trim() || CFG.WORKER).replace(/\/+$/, '');
  CFG.SPEED  = S.ttsSpeed = parseFloat(document.getElementById('cfg-speed').value) || 0.72;
  const sel = document.querySelector('.voice-btn.selected');
  if (sel) { S.voiceMode = sel.dataset.voice; localStorage.setItem('h_voice', S.voiceMode); }
  localStorage.setItem('h_profile', JSON.stringify({ci:S.ci}));
  localStorage.setItem('h_worker', CFG.WORKER);
  localStorage.setItem('h_speed', CFG.SPEED);
  closeModal('modal-settings');
  updateHero(); showToast('✅ Paramètres enregistrés','success');
}
function openSettings() {
  document.getElementById('cfg-ci').value = S.ci;
  document.getElementById('cfg-worker').value = CFG.WORKER;
  document.getElementById('cfg-speed').value = CFG.SPEED;
  renderVoiceSelector();
  openModal('modal-settings');
}
function renderVoiceSelector() {
  ['google','openai','web'].forEach(group => {
    const grid = document.getElementById('voice-'+group+'-grid');
    if (!grid) return;
    grid.innerHTML = VOICES[group].map(v =>
      '<button class="voice-btn' + (S.voiceMode===v.id?' selected':'') + '" data-voice="' + v.id + '" onclick="selectVoice(\'' + v.id + '\',this)"' +
      ' style="padding:8px 10px;border-radius:9px;border:1px solid ' + (S.voiceMode===v.id?'var(--mer)':'var(--border)') + ';background:' + (S.voiceMode===v.id?'rgba(143,175,177,.15)':'var(--fond)') + ';cursor:pointer;text-align:left;transition:all .2s">' +
      '<div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:1px">' + v.label + '</div>' +
      '<div style="font-size:9px;color:var(--text2)">' + v.desc + '</div>' +
      '</button>'
    ).join('');
  });
}
function selectVoice(id, btn) {
  document.querySelectorAll('.voice-btn').forEach(b=>{b.classList.remove('selected');b.style.background='var(--fond)';b.style.borderColor='var(--border)';});
  btn.classList.add('selected');btn.style.background='rgba(143,175,177,.15)';btn.style.borderColor='var(--mer)';
  S.voiceMode=id;
}
function updateHero() {
  const prenom = S.prenom ? ', ' + S.prenom : '';
  document.getElementById('hero-prenom-disp').textContent = prenom;
  const sessions = getAllSessions();
  const zone = document.getElementById('stats-zone');
  if (sessions.length > 0) { zone.style.display = 'flex'; updateStats(); }
  const banner = document.getElementById('session-banner');
  if (sessions.length > 0) {
    const last = sessions[sessions.length-1];
    const pr = PROTOCOLS.find(p=>p.id===last.protocol);
    const lastDate = new Date(last.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long'});
    document.getElementById('sb-content').innerHTML = (pr?.emoji||'🌀') + ' Dernière séance : <strong>' + (pr?.name||last.protocol) + '</strong> — S' + (last.session_num||1) + ' — ' + lastDate;
    banner.classList.add('visible');
  }
}
function renderCollegeFooter() { /* collège retiré de l'accueil */ }
function openCollege() {
  const list = document.getElementById('college-list');
  const groups = [
    {title:'🏛️ Pionniers historiques', ids:['erickson','janet','charcot','bernheim','hilgard']},
    {title:'🔬 Conseil scientifique international', ids:['spiegel','kirsch','alladin','jensen','montgomery']},
    {title:'🌿 Ericksonien & thérapie brève', ids:['zeig','gilligan','yapko','rossi','bellet','hammond']},
    {title:'🏥 Hypnose médicale française', ids:['becchio','bioy','adjadj','lang']},
    {title:'🇫🇷 Hypnose thérapeutique française', ids:['roustang','lockert']},
    {title:'🧠 Trauma & sécurité clinique', ids:['herman','vanderhart','olness']},
    {title:'⚡ Performance & autohypnose', ids:['schultz']},
    {title:'🏥 Hypnose médicale intégrative', ids:['benhaim']},
  ];
  list.innerHTML = groups.map(g => {
    const experts = g.ids.map(id=>COLLEGE[id]).filter(Boolean);
    if (!experts.length) return '';
    return '<div><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--text2);margin-bottom:7px;margin-top:10px">' + g.title + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px">' +
      experts.map(e=>'<div style="padding:9px 12px;background:var(--fond);border-radius:8px;border:1px solid var(--border)"><span style="font-weight:600;font-size:12px;color:var(--text)">' + e.name + '</span><span style="font-size:11px;color:var(--text2);margin-left:8px">' + e.title + '</span></div>').join('') +
      '</div></div>';
  }).join('');
  openModal('modal-college');
}
async function goToEntretienDirect() {
  // VARIANT: Express mode skips entretien — show protocol picker then launch séance
  if (window.VARIANT?.skipEntretien) {
    console.log('[Hypnose Core] Express mode — entretien skipped');
    await showExpressProtocolPicker();
    return;
  }
  S.protocol = null; S.sessionNum = 1; S.entretienPhase = 0;
  S.entretienMessages = []; S.entretienHistory = []; S.entretienReady = false;
  S.seanceStarted = false;
  S.clinicalProfile = {anxiety:0, motivation:0, suggestibility:0, tags:[], vakog:{v:0,a:0,k:0,og:0}};
  S.collegeDecision = null;
  S._entretienFaceContext = null;
  // Reset prédicats et mémoire session
  S.patientPredicates = [];
  S.patientMetaphors  = [];
  S.resistanceSignals = [];
  S._transitionBridge = '';
  document.getElementById('ent-emoji').textContent = '🌀';
  document.getElementById('ent-name').textContent = 'Entretien clinique';
  document.getElementById('ent-seance-badge').textContent = 'Pré-séance';
  document.getElementById('btn-go-induction').classList.remove('visible');
  document.getElementById('entretien-chat').innerHTML = '';
  document.getElementById('profil-tags').innerHTML = '<span class="profil-tag">En construction...</span>';
  document.getElementById('expert-display').innerHTML = '<span class="expert-name">En attente de l\'entretien...</span>';
  document.getElementById('college-technique').style.display = 'none';
  document.getElementById('college-consulting').style.display = 'none';
  renderPhaseTracker(0); showScreen('screen-entretien');
  S.entretienStartTime = Date.now();
  if (S.entretienTimer) clearInterval(S.entretienTimer);
  S.entretienTimer = setInterval(()=>{
    const e=Math.floor((Date.now()-S.entretienStartTime)/1000);
    document.getElementById('ent-timer').textContent=String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');
  },1000);

  // ── CI critique → afficher blocage si détecté ──
  checkCriticalCI();

  // ── V7 pattern : une seule permission getUserMedia (vidéo + audio) ──
  await setupEntretienMedia();

  // Démarrer l'entretien (greeting TTS)
  setTimeout(() => startEntretienOuvert(), 400);
}

// ═══════════════════════════════════════════════
// SETUP MEDIA — V7 pattern
// Une seule permission vidéo+audio, micro continu dès le début
// ═══════════════════════════════════════════════
async function setupEntretienMedia() {
  if (window.location.protocol === 'file:') return; // file:// — skip

  try {
    // Demander vidéo + audio en une seule permission (V7 pattern)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: {ideal:320}, height: {ideal:240}, facingMode: 'user' },
      audio: true
    });

    // Stocker le stream principal
    S._mediaStream = stream;

    // ── Caméra entretien ──
    const vid = document.getElementById('face-video-e');
    const ph  = document.getElementById('cam-e-placeholder');
    if (vid) {
      vid.srcObject = stream;
      vid.style.display = 'block';
      if (ph) ph.style.display = 'none';
      document.getElementById('emo-e-row').style.display = 'block';
      const btn = document.getElementById('btn-cam-e-toggle');
      if (btn) btn.textContent = 'Désactiver';
      _camEActive = true;
      _camEStream = stream; // référence pour stopCamEntretien

      // Lancer l'analyse faciale dès que la vidéo est prête
      vid.onloadedmetadata = async () => {
        // Charger face-api si pas encore fait
        if (typeof faceapi !== 'undefined' && !_camEFaceLoaded) {
          const M = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
          try {
            await Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(M),
              faceapi.nets.faceExpressionNet.loadFromUri(M),
            ]);
            _camEFaceLoaded = true;
          } catch(e) { console.warn('[FaceAPI entretien]', e.message); }
        }
        if (_camEFaceLoaded) startCamELoop(vid);
      };
    }

    // ── Micro continu — V7 pattern ──
    // Créer la reconnaissance vocale maintenant (stream audio disponible)
    // Le micro démarre après le greeting TTS
    S._mediaReady = true;
    console.log('[Media] ✅ Camera + micro prêts');

  } catch(e) {
    console.warn('[Media] Permission refusée ou indisponible:', e.message);
    S._mediaReady = false;
    showToast('📷 Caméra/micro : ' + (e.name === 'NotAllowedError' ? 'permission refusée' : e.message), 'error');
  }
}

async function startEntretienOuvert() {
  updateExpertDisplay('entretien');
  const sessions = getAllSessions();
  let greeting;
  if (sessions.length === 0) {
    greeting = 'Bonjour. Installez-vous confortablement.\n\nQu\'est-ce qui vous amène aujourd\'hui ?';
  } else {
    const last = sessions[sessions.length-1];
    const pr = PROTOCOLS.find(p=>p.id===last.protocol);
    const lastDate = new Date(last.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long'});
    greeting = 'Bonjour, content de vous retrouver.\n\nDernière séance le ' + lastDate + (pr ? ', sur ' + pr.name.toLowerCase() : '') + '.\n\nComment vous sentez-vous depuis ?';
  }
  addMsgE('assistant', greeting);
  // ── CRITIQUE : enregistrer le greeting dans l'historique ──
  // Sans ça, l'API reçoit un historique vide → répond toujours "Bonjour" au 1er échange
  S.entretienHistory.push({role:'assistant', content:greeting});
  await speakHypno(greeting);

  // ── Auto-activation micro après que le TTS est réellement terminé ──
  // speakHypno est await MAIS parfois le buffer audio continue quelques ms après
  // On attend que S.ttsPlaying === false avant d'activer le micro
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && window.location.protocol !== 'file:') {
    const waitTTSDone = (resolve) => {
      if (!S.ttsPlaying) { resolve(); return; }
      setTimeout(() => waitTTSDone(resolve), 150);
    };
    await new Promise(waitTTSDone);
    await new Promise(r => setTimeout(r, 500)); // buffer de sécurité 500ms
    if (!S.micActiveE && !S.ttsPlaying) toggleMicE();
  }
}

// ═══════════════════════════════════════════════
// EXPRESS MODE — Sélection protocole directe (pas d'entretien)
// ═══════════════════════════════════════════════
async function showExpressProtocolPicker() {
  let modal = document.getElementById('modal-express-proto');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-express-proto';
    const grid = PROTOCOLS.map(p =>
      `<button onclick="launchExpressProtocol('${p.id}')" style="padding:16px;background:var(--fond);border:1px solid var(--border);border-radius:12px;cursor:pointer;text-align:left;transition:all .2s;display:flex;align-items:flex-start;gap:12px" onmouseover="this.style.borderColor='var(--mer)'" onmouseout="this.style.borderColor='var(--border)'">
        <span style="font-size:28px">${p.emoji}</span>
        <div>
          <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:3px">${p.name}</div>
          <div style="font-size:11px;color:var(--text2);line-height:1.4">${p.desc}</div>
          <div style="font-size:9px;color:var(--mer);margin-top:4px">${p.sessions} seances</div>
        </div>
      </button>`
    ).join('');
    modal.innerHTML = `<div class="modal-box" style="max-width:620px">
      <button class="modal-close" onclick="closeModal('modal-express-proto')">✕</button>
      <div class="modal-title" style="font-family:'Cormorant Garamond',serif">Choisir votre protocole</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:18px">Mode express — seance directe sans entretien prealable.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${grid}</div>
    </div>`;
    document.body.appendChild(modal);
  }
  openModal('modal-express-proto');
}

async function launchExpressProtocol(protoId) {
  closeModal('modal-express-proto');
  S.protocol = PROTOCOLS.find(p => p.id === protoId) || PROTOCOLS[0];
  const done = getAllSessions().filter(s => s.protocol === S.protocol.id).length;
  S.sessionNum = done + 1;
  S.clinicalProfile = {anxiety:0, motivation:0, suggestibility:0, tags:[], vakog:{v:0,a:0,k:0,og:0}};
  S.entretienReady = true;
  S.seanceStarted = false;
  S.patientPredicates = [];
  S.patientMetaphors = [];
  S.resistanceSignals = [];
  S._transitionBridge = '';
  loadSessionMemory();

  // ── Micro-calibration express : 3 questions rapides avant séance ──
  await runExpressCalibration();
  await goToSeanceHypno();
}

async function runExpressCalibration() {
  // Modal de micro-calibration — 3 questions pour ne pas travailler à l'aveugle
  return new Promise((resolve) => {
    let modal = document.getElementById('modal-express-calib');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'modal-express-calib';
      modal.innerHTML = `<div class="modal-box" style="max-width:480px">
        <div class="modal-title" style="font-family:'Cormorant Garamond',serif;font-size:20px">Avant de commencer...</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:18px">3 questions rapides pour personnaliser votre seance.</div>

        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Qu'est-ce qui vous amene aujourd'hui ?</label>
          <textarea class="form-textarea" id="calib-motif" rows="2" placeholder="En quelques mots..."></textarea>
        </div>

        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Comment vous sentez-vous en ce moment ? (0 = tres mal, 10 = tres bien)</label>
          <div style="display:flex;align-items:center;gap:12px">
            <input type="range" min="0" max="10" value="5" id="calib-etat" style="flex:1;accent-color:var(--mer)">
            <span id="calib-etat-val" style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:var(--mer-dark);min-width:24px">5</span>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:18px">
          <label class="form-label">Avez-vous deja fait de l'hypnose ?</label>
          <div style="display:flex;gap:8px">
            <button class="btn-secondary calib-exp-btn" data-val="jamais" onclick="selectCalibExp(this)" style="flex:1;padding:8px;font-size:12px">Jamais</button>
            <button class="btn-secondary calib-exp-btn" data-val="1-2fois" onclick="selectCalibExp(this)" style="flex:1;padding:8px;font-size:12px">1-2 fois</button>
            <button class="btn-secondary calib-exp-btn" data-val="habitue" onclick="selectCalibExp(this)" style="flex:1;padding:8px;font-size:12px">Habitue(e)</button>
          </div>
        </div>

        <button class="btn-primary" onclick="submitExpressCalibration()" style="width:100%">Commencer la seance</button>
      </div>`;
      document.body.appendChild(modal);
      document.getElementById('calib-etat').addEventListener('input', function() {
        document.getElementById('calib-etat-val').textContent = this.value;
      });
    }
    window._calibResolve = resolve;
    openModal('modal-express-calib');
  });
}

let _selectedCalibExp = 'jamais';
function selectCalibExp(btn) {
  document.querySelectorAll('.calib-exp-btn').forEach(b => {
    b.style.background = 'var(--white)';
    b.style.borderColor = 'var(--border)';
    b.style.color = 'var(--text)';
  });
  btn.style.background = 'rgba(143,175,177,.15)';
  btn.style.borderColor = 'var(--mer)';
  btn.style.color = 'var(--mer-dark)';
  _selectedCalibExp = btn.dataset.val;
}

async function submitExpressCalibration() {
  const motif = (document.getElementById('calib-motif')?.value || '').trim();
  const etat = parseInt(document.getElementById('calib-etat')?.value || '5');
  const experience = _selectedCalibExp;

  closeModal('modal-express-calib');

  // Estimer les scores cliniques depuis les réponses
  const anxiety = Math.max(0, Math.min(100, (10 - etat) * 10)); // etat bas → anxiété haute
  const motivation = motif.length > 20 ? 65 : motif.length > 5 ? 45 : 25; // plus le motif est détaillé, plus la motivation est haute
  const suggestibility = experience === 'habitue' ? 70 : experience === '1-2fois' ? 50 : 30;

  S.clinicalProfile.anxiety = anxiety;
  S.clinicalProfile.motivation = motivation;
  S.clinicalProfile.suggestibility = suggestibility;
  S.clinicalProfile.summary = motif || ('Seance express ' + (S.protocol?.name || ''));

  // Extraire les prédicats du motif
  if (motif) extractPatientPredicates(motif);

  // CI check sur le motif libre
  S.ci = motif; // temporaire pour le triage
  checkCriticalCI();
  S.ci = ''; // reset

  updateSignalsDisplay();
  console.log('[Express Calibration]', {anxiety, motivation, suggestibility, experience, motif});

  if (window._calibResolve) {
    window._calibResolve();
    window._calibResolve = null;
  }
}

// ═══════════════════════════════════════════════
// PRO MODE — Affichage notes cliniques en séance
// ═══════════════════════════════════════════════
function displayClinicalNote(clinical) {
  if (!window.VARIANT?.showClinical || !clinical) return;
  const container = document.getElementById('clinical-notes-pro');
  if (!container) {
    // Créer le conteneur dynamiquement dans la sidebar séance
    const ctrl = document.querySelector('.seance-ctrl');
    if (!ctrl) return;
    const block = document.createElement('div');
    block.className = 'ctrl-block';
    block.innerHTML = '<div class="ctrl-title">Notes cliniques</div><div id="clinical-notes-pro" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>';
    ctrl.appendChild(block);
    return displayClinicalNote(clinical); // retry
  }
  const note = document.createElement('div');
  note.style.cssText = 'font-size:10px;color:rgba(200,175,130,.9);padding:6px 8px;background:rgba(138,115,85,.08);border:1px solid rgba(138,115,85,.15);border-radius:6px;line-height:1.4;font-style:italic';
  const phase = (typeof PHASE_NAMES !== 'undefined' ? PHASE_NAMES[S.phase] : S.phase) || S.phase;
  note.innerHTML = '<div style="font-size:8px;font-weight:700;color:var(--mer);margin-bottom:2px">' + phase + ' · D' + S.depth.toFixed(1) + '</div>' + clinical;
  container.prepend(note);
  while (container.children.length > 8) container.removeChild(container.lastChild);
}

function goToEntretien() { goToEntretienDirect(); }

// ═══════════════════════════════════════════════
// SESSIONS DATA
// ═══════════════════════════════════════════════
function getAllSessions() { return JSON.parse(localStorage.getItem('h_sessions') || '[]'); }
function saveSessions(arr) { localStorage.setItem('h_sessions', JSON.stringify(arr)); }
function updateStats() {
  const sessions = getAllSessions();
  document.getElementById('st-total').textContent = sessions.length;
  // Streak
  let streak = 0;
  if (sessions.length) {
    let d = new Date();
    const dates = sessions.map(s => new Date(s.date).toDateString());
    while (dates.includes(d.toDateString())) { streak++; d = new Date(d - 86400000); }
  }
  document.getElementById('st-streak').textContent = streak;
  if (sessions.length) {
    const avg = sessions.reduce((a,s)=>a+(s.depth_final||0),0)/sessions.length;
    document.getElementById('st-depth').textContent = avg.toFixed(1);
    const tot = sessions.reduce((a,s)=>a+(s.duration_min||0),0);
    document.getElementById('st-time').textContent = tot+"'";
  }
}

// ─── Protocoles (accès interne uniquement — non exposé en accueil) ───
function renderProtocols() { /* Désactivé — accueil Ericksonien */ }
function selectProto(id, el) {
  S.protocol = PROTOCOLS.find(p=>p.id===id);
}

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goToAccueil() { showScreen('screen-accueil'); updateStats(); updateHero(); }

function openImportExport() {
  // Résumé dossier
  const sessions = getAllSessions();
  const div = document.getElementById('dossier-resume');
  if (sessions.length === 0) {
    div.textContent = 'Aucune séance enregistrée.';
  } else {
    const protoCount = {};
    sessions.forEach(s=>{ protoCount[s.protocol]=(protoCount[s.protocol]||0)+1; });
    const lines = [`${sessions.length} séance${sessions.length>1?'s':''} enregistrée${sessions.length>1?'s':''}`];
    Object.entries(protoCount).forEach(([id,n])=>{
      const pr=PROTOCOLS.find(p=>p.id===id);
      lines.push(`${pr?.emoji||'•'} ${pr?.name||id} : ${n} séance${n>1?'s':''}`);
    });
    div.innerHTML = lines.join('<br>');
  }
  const expInfo = document.getElementById('export-status');
  if (expInfo) expInfo.textContent = sessions.length > 0 ? `${sessions.length} séance${sessions.length>1?'s':''} — dernière : ${new Date(sessions[sessions.length-1]?.date).toLocaleDateString('fr-FR')}` : 'Aucune séance';
  openModal('modal-importexport');
}
function openImport() { openImportExport(); }

// ═══════════════════════════════════════════════
// ═══ ÉCRAN 2 — ENTRETIEN CLINIQUE ═══
// ═══════════════════════════════════════════════
async function startEntretien() { return startEntretienOuvert(); }

async function generateEntretienResponse(userMsg) {
  S.entretienHistory.push({role:'user', content:userMsg});

  // ── Extraction passive des prédicats linguistiques du patient ──
  extractPatientPredicates(userMsg);

  showTypingE();
  try {
    const p = S.protocol;
    const pid = p?.id || null;
    const prevSessions = pid ? getAllSessions().filter(s => s.protocol === pid) : getAllSessions();
    const isFirst = prevSessions.length === 0;
    const prevCount = prevSessions.length;

    // ── Mémoire inter-séances ACTIVE ──
    const mem = S.sessionMemory;
    let memBlock = '';
    if (!isFirst && (mem.effectiveMetaphors.length || mem.placedAnchors.length || mem.lastSessionSummary || mem.resistancePatterns.length)) {
      memBlock = '\nMÉMOIRE THÉRAPEUTIQUE ACTIVE (séances précédentes) :\n';
      if (mem.lastSessionSummary)
        memBlock += `- Résumé S${prevCount} : ${mem.lastSessionSummary}\n`;

      // DIRECTIVES CONDITIONNELLES — pas juste de l'information, des ACTIONS
      if (mem.resistancePatterns.length > 0) {
        const rp = mem.resistancePatterns.slice(-3).join(', ');
        memBlock += `- RÉSISTANCES CONNUES : ${rp}\n`;
        memBlock += `  → DIRECTIVE : adapter ta strategie d'entretien. Si la résistance est de type "controle/intellectualisation" → questions orientées corps et vécu, pas analyse. Si "évitement" → questions indirectes, projectives. Si "compliance de surface" → chercher les contradictions.\n`;
      }
      if (mem.effectiveMetaphors.length > 0) {
        memBlock += `- MÉTAPHORES EFFICACES (profondeur > 7) : ${mem.effectiveMetaphors.slice(-3).join(', ')}\n`;
        memBlock += `  → DIRECTIVE : ces métaphores ont fonctionné. Les réutiliser comme terrain connu pendant l'entretien pour orienter vers l'intérieur.\n`;
      }
      if (mem.placedAnchors.length > 0) {
        const anchors = mem.placedAnchors.slice(-2).map(a => `${a.geste} → ${a.ressource}`).join(' | ');
        memBlock += `- ANCRAGES POSÉS : ${anchors}\n`;
        memBlock += `  → DIRECTIVE : mentionner naturellement l'ancrage si le patient évoque la ressource associée. "La dernière fois vous aviez trouvé ce geste utile..."\n`;
      }
      if (mem.keywordsHistory.length > 0)
        memBlock += `- Mots-clés cumulés : ${mem.keywordsHistory.slice(-5).join(', ')}\n`;
      memBlock += '\n';
    }

    // ── Prédicats du patient ──
    const predicatsBlock = S.patientPredicates.length > 0
      ? `\nPRÉDICATS DU PATIENT (ses propres mots — à réutiliser dans l'induction) :\n${S.patientPredicates.slice(-8).join(', ')}\n`
      : '';

    const protoLine = p ? `Protocole pressenti : ${p.name}` : "Protocole : à déterminer en cours d'entretien";
    const exchangeNum = Math.floor(S.entretienHistory.length / 2) + 1;

    const systemPrompt = `Tu n'incarnes pas un role. Tu penses.

Tu es un hypnotherapeute ericksonien d'excellence menant un entretien pre-inductif. Ton objectif : capturer assez de matiere clinique pour construire une seance hypnotique sur mesure, parfaitement calibree pour CE patient.

L'entretien n'est PAS un simple recueil d'informations. Chaque question EST deja le debut de l'induction. Tu orientes l'attention vers l'INTERIEUR — ressources, sensations, moments positifs. Tu utilises le langage du patient, ses metaphores, ses mots exacts.

${protoLine}
${isFirst ? 'Premiere seance avec ce patient.' : `Seance ${prevCount + 1} — suivi therapeutique.`}
${S.ci ? `CONTRE-INDICATIONS : ${S.ci} — adapter les techniques.` : ''}
${memBlock}${predicatsBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEQUENCE DE RAISONNEMENT — INTERNE UNIQUEMENT (NE PAS INCLURE DANS LA REPONSE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT : Les etapes ci-dessous guident ta REFLEXION. Tu ne dois JAMAIS les inclure dans ta reponse au patient. Ta reponse ne contient QUE ton intervention therapeutique (accuse + apport + question).

ETAPE 1 — CE QUE JE SAIS DEJA
Quel portrait clinique se dessine ? Quelle est la demande REELLE (pas seulement manifeste) ?
"Ce patient est quelqu'un qui..." — si tu ne peux pas encore completer, c'est normal avant l'echange 3.

ETAPE 2 — CE QUI MANQUE POUR UNE SEANCE SUR MESURE
Parmi ces piliers, lequel est le plus faible ?
- DEMANDE PROFONDE : je ne sais pas ce qui motive vraiment cette personne au-dela du symptome
- RESSOURCES : je ne connais pas ses ressources internes (moments positifs, capacites naturelles, experiences de transe)
- CONTEXTE DECLENCHEUR : je ne sais pas quand/comment le probleme se manifeste
- CANAL SENSORIEL : je ne sais pas si ce patient est visuel, auditif, kinesthesique
- SUGGESTIBILITE : je n'ai pas evalue sa reactivite aux suggestions
- CONTRE-INDICATIONS : je n'ai pas verifie les CI critiques

ETAPE 3 — HYPOTHESE CLINIQUE
Que revele la derniere reponse ? Pas seulement le contenu — le STYLE.
Le patient intellectualise-t-il ? Se refugie-t-il dans le factuel ? Montre-t-il une ouverture emotionnelle ?
Formule une hypothese : "Ce patient semble..." Si fragile, tiens-la legerement.

ETAPE 3bis — CHASSE AUX CONTRADICTIONS
Compare la reponse courante aux precedentes :
- contradictions explicites (dit X, maintenant dit non-X)
- ecarts entre valeurs revendiquees et comportements decrits
- variations de ton selon le contexte
Si une contradiction PERTINENTE apparait et a un impact sur la comprehension clinique, pose une question de clarification :
"Vous me disiez X, et la j'entends plutot Y — dans la realite, lequel prend le dessus ?"
Regles : pas avant echange 4. Confrontation douce. Comprendre la tension, pas pieger.

ETAPE 4 — SELECTION DE L'ACTE (un seul)
Quelle est la MEILLEURE question maintenant ?
Types : question orientee ressource, clarification clinique, exploration du vecu, question projective (si ce probleme etait derriere vous...), pont biographique, calibration sensorielle, test de suggestibilite leger.
Au lieu de "Depuis combien de temps ?" → "Qu'est-ce que vous ressentiriez si ce probleme etait derriere vous ?"
Au lieu de "Quels symptomes ?" → "Qu'est-ce qui vous a amene a imaginer que les choses pourraient etre differentes ?"

ETAPE 5 — AUTO-CORRECTION
"Mon hypothese tient-elle encore ?"
"Le patient a-t-il repondu a ce que j'ai demande ou a-t-il esquive ?"
"Est-ce que je collecte assez de materiau pour construire une seance puissante ?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODELE D'INTERVENTION — 3 PARTIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ACCUSE DE RECEPTION (1 phrase) — specifique, avec les mots du patient.
   "Ce poids que vous decrivez sur les epaules, c'est present depuis longtemps."
   PAS : "C'est interessant." / "Je vous entends." / "C'est courageux."

2. APPORT (0-1 phrase) — ce que TU vois. Optionnel. Pas de remplissage.
   "Ce que je note, c'est que chaque fois que vous parlez de liberte, votre voix change."

3. QUESTION (1 phrase) — precise, orientee vers l'interieur.
   "Si cette liberte etait la, demain matin, qu'est-ce qui serait different en premier ?"

JAMAIS de question sans accuse de reception. UNE seule question par message.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PACING — LES 3 PREMIERS ECHANGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Les 3 premiers echanges determinent si le patient se livre ou se ferme.
- D'abord comprendre la demande et le contexte. Pas de profondeur prematuree.
- Pas de question sur les traumas ou l'enfance avant l'echange 4.
- Ton : un professionnel bienveillant qui met en confiance, pas un psy qui analyse.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GESTION DE LA RESISTANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reponse courte/fermee → ne pas insister. Changer d'angle : "Et si on prenait ca autrement..."
Intellectualisation → ramener au corporel : "Et dans votre corps, ca fait quoi quand vous en parlez ?"
Scepticisme sur l'hypnose → normaliser : "Beaucoup de gens sont surpris par leur propre experience."
Emotion forte → accueillir, ne pas enchainer : "Prenez le temps qu'il faut."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERDITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Reponses de plus de 4 phrases
- Postures theatrales (*je hoche la tete*, *je souris*)
- Validation excessive ("c'est un grand pas", "je vous entends profondement")
- Listes a puces ou tirets
- Questions multiples deguisees
- Jargon technique non necessaire
- Reformulations longues
- ZERO emoji

Phase : echange ${exchangeNum}${exchangeNum >= 5 ? ' — commence a synthetiser le materiau clinique' : ''}${exchangeNum >= 7 ? ' — tu as assez d\'elements, prepare le signal de fin' : ''}
${S._entretienFaceContext ? `\nSIGNAUX NON-VERBAUX : emotion dominante ${S._entretienFaceContext.dominant} (${Math.round(S._entretienFaceContext.score * 100)}%) — ajuste le rythme.` : ''}

FORMAT : Retourne UNIQUEMENT ta prochaine intervention therapeutique (accuse + apport optionnel + UNE question). RIEN d'autre — pas de raisonnement, pas d'etapes, pas de notes cliniques, pas de titres, pas de sections. Juste 2-4 phrases adressees au patient.
Quand pret → termine par exactement : [READY_FOR_INDUCTION: resume clinique en 1 phrase avec les mots cles du patient]`;

    let cleanHistory = S.entretienHistory.slice(-14).map(m => ({role: m.role, content: String(m.content || '')}));
    if (cleanHistory[0]?.role === 'assistant') cleanHistory.unshift({role:'user', content:'Bonjour.'});
    const fixed = [];
    for (const m of cleanHistory) {
      if (fixed.length && fixed[fixed.length - 1].role === m.role) {
        fixed[fixed.length - 1].content += '\n' + m.content;
      } else {
        fixed.push({...m});
      }
    }
    if (fixed[fixed.length - 1]?.role !== 'user') fixed.push({role:'user', content:'[Patient attend]'});

    const resp = await callAPI(systemPrompt, fixed);
    hideTypingE();

    const readyMatch = resp.match(/\[READY_FOR_INDUCTION:\s*(.+?)\]/s);
    
    // FIX — Strip internal reasoning before display
    // Claude sometimes outputs ETAPE blocks despite "silencieux" instruction
    let displayText = resp
      .replace(/\[READY_FOR_INDUCTION:[^\]]*\]/g, '')
      .replace(/ETAPE\s*\d+[^\n]*\n[\s\S]*?(?=(?:ETAPE\s*\d|$))/gi, '')  // ETAPE blocks
      .replace(/━+/g, '')  // separator lines
      .replace(/CE QUE JE SAIS DEJA[\s\S]*?(?=\n\n|\n[A-Z])/gi, '')
      .replace(/CE QUI MANQUE[\s\S]*?(?=\n\n|\n[A-Z])/gi, '')
      .replace(/HYPOTHESE CLINIQUE[\s\S]*?(?=\n\n|\n[A-Z])/gi, '')
      .replace(/CHASSE AUX CONTRADICTIONS[\s\S]*?(?=\n\n|\n[A-Z])/gi, '')
      .replace(/SELECTION DE L'ACTE[\s\S]*?(?=\n\n|\n[A-Z])/gi, '')
      .replace(/AUTO-CORRECTION[\s\S]*?(?=\n\n|\n[A-Z])/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // If stripping removed everything, use the last paragraph as fallback
    if (!displayText || displayText.length < 10) {
      const paragraphs = resp.split(/\n\n+/).filter(p => p.trim().length > 10 && !p.includes('ETAPE'));
      displayText = paragraphs[paragraphs.length - 1]?.trim() || resp.trim();
      console.warn('[Entretien] Raisonnement interne détecté et filtré, fallback sur dernier paragraphe');
    }
    
    // Log if reasoning leaked
    if (resp.includes('ETAPE 1') || resp.includes('CE QUE JE SAIS')) {
      console.warn('[Entretien] ⚠️ Raisonnement interne dans la réponse API — filtré avant affichage');
    }

    S.entretienHistory.push({role:'assistant', content: displayText});
    analyzeClinicialSignals(userMsg + ' ' + resp);

    // Triage LLM — vérification de sécurité toutes les 3 réponses patient
    if (S.entretienHistory.filter(m => m.role === 'user').length % 3 === 0) {
      const recentText = S.entretienHistory.slice(-6).filter(m => m.role === 'user').map(m => m.content).join(' ');
      triageLLMCheck(recentText); // async, non-bloquant
    }

    if (S.entretienHistory.length >= 4 && !S.collegeDecision) {
      consultCollegeIA();
    }

    updateEntretienPhase();
    addMsgE('assistant', displayText);
    await speakHypno(displayText);

    if (readyMatch) {
      S.clinicalProfile.summary = readyMatch[1].trim();
      S.entretienReady = true;

      // CHANTIER 2 — Construire le modèle patient structuré par LLM
      buildPatientModel(); // async, non-bloquant — sera prêt pour la séance

      S._transitionBridge = await buildTransitionBridge();
      showReadyBanner(readyMatch[1].trim());
    }

  } catch(e) {
    hideTypingE();
    console.error('[Entretien]', e);
    addMsgE('system', '⚠️ Erreur — vérifiez la connexion.');
  }
}

// ── Extraction passive des prédicats linguistiques du patient ──
function extractPatientPredicates(text) {
  if (!text || text.length < 3) return;
  const t = text.toLowerCase();
  const stopwords = new Set(['dans','avec','pour','mais','plus','aussi','très','bien','tout','même','cette','comme','quand','alors','nous','vous','leur','sous','sans','donc','être','avoir','faire','aller','venir','prendre','voir','vouloir','pouvoir','devoir','suis','sont','était','avait','fait','fais','peut','doit','leur','rien','fois','entre']);
  const words = (t.match(/\b[a-zàâäéèêëîïôùûüç]{4,}\b/g) || []);
  const meaningful = words.filter(w => !stopwords.has(w));
  for (const w of meaningful.slice(0, 6)) {
    if (!S.patientPredicates.includes(w)) S.patientPredicates.push(w);
  }
  if (S.patientPredicates.length > 20) S.patientPredicates = S.patientPredicates.slice(-20);
  // Métaphores spontanées
  const rx = /(?:c['\u2019]est comme|comme un[e]?|on dirait|(?:je|me) sens comme)\s+([^,.!?]{4,30})/gi;
  let m;
  while ((m = rx.exec(text)) !== null) {
    const met = m[1].trim();
    if (!S.patientMetaphors.includes(met)) S.patientMetaphors.push(met);
  }
}

// ── Pont de transition entretien→séance avec mots du patient ──
// Construit un pont pré-inductif qui utilise le matériau clinique récolté
async function buildTransitionBridge() {
  const predicates = S.patientPredicates.slice(-5);
  const metaphors  = S.patientMetaphors.slice(-2);
  const summary    = S.clinicalProfile.summary || '';
  const vak        = S.clinicalProfile.vakog || {v:0,a:0,k:0,og:0};
  const vakTotal   = (vak.v+vak.a+vak.k+vak.og) || 1;
  const vakDom     = Object.entries({visuel:vak.v, auditif:vak.a, kinesthesique:vak.k}).sort((a,b)=>b[1]-a[1])[0];

  // Si pas de Worker → fallback statique
  if (!CFG.WORKER) {
    let bridge = '';
    if (metaphors.length > 0) {
      bridge += `Vous avez evoque ${metaphors[0]}... c'est exactement cette image que nous allons utiliser. `;
    } else if (predicates.length > 0) {
      bridge += `Ce mot — ${predicates[predicates.length - 1]} — va nous servir de point de depart... `;
    }
    bridge += `Installez-vous confortablement... laissez votre corps trouver sa propre position... et permettez-vous simplement d'etre la... sans rien a faire d'autre que de laisser venir...`;
    return bridge;
  }

  // Génération LLM du pont de transition
  try {
    const resp = await callAPI(
      `Tu es un hypnotherapeute ericksonien. Genere un PONT DE TRANSITION de 3-5 phrases entre l'entretien clinique et l'induction hypnotique.

Ce pont doit :
- Utiliser les mots exacts du patient : ${predicates.join(', ')}
${metaphors.length ? '- Reprendre sa metaphore : ' + metaphors[0] : ''}
- Privilegier le canal ${vakDom[0]} (dominant chez ce patient)
- Commencer a orienter l'attention vers l'interieur
- Installer le confort physique
- Etre fluide, permissif, indirect
- Utiliser des pauses ... pour le rythme

Resume clinique : ${summary}

FORMAT : Uniquement le texte du pont. Pas de titre, pas de balise. Langage permissif ericksonien.`,
      [{role:'user', content:'Genere le pont de transition.'}],
      400
    );
    return resp.trim() || buildTransitionBridgeFallback(predicates, metaphors);
  } catch(e) {
    console.warn('[Transition] LLM fallback:', e.message);
    return buildTransitionBridgeFallback(predicates, metaphors);
  }
}

function buildTransitionBridgeFallback(predicates, metaphors) {
  let bridge = '';
  if (metaphors && metaphors.length > 0) {
    bridge += `Vous avez evoque ${metaphors[0]}... c'est exactement cette image que nous allons utiliser. `;
  } else if (predicates && predicates.length > 0) {
    bridge += `Ce mot — ${predicates[predicates.length - 1]} — va nous servir de point de depart... `;
  }
  bridge += `Installez-vous confortablement... laissez votre corps trouver sa propre position... et permettez-vous simplement d'etre la... sans rien a faire d'autre que de laisser venir...`;
  return bridge;
}

// ═══════════════════════════════════════════════
// CONSULTATION COLLÈGE — appel silencieux
// Déclenché après le 2e échange patient
// ═══════════════════════════════════════════════
async function consultCollegeIA() {
  if (S.collegeDecision) return;
  if (S.entretienHistory.length < 4) return;

  const catalogueLignes = Object.entries(COLLEGE).map(([id, e]) =>
    `${id} | ${e.name} | ${e.title} | Style: ${e.style} | Domaines: ${e.domain.join(', ')}`
  ).join('\n');

  const conversationResumee = S.entretienHistory.slice(-8)
    .map(m => `${m.role === 'user' ? 'PATIENT' : 'THÉRAPEUTE'}: ${m.content}`)
    .join('\n');

  const vak = S.clinicalProfile.vakog || {};
  const vakTotal = (vak.v||0)+(vak.a||0)+(vak.k||0)+(vak.og||0)||1;
  const vakDesc = `Visuel ${Math.round((vak.v||0)/vakTotal*100)}% / Auditif ${Math.round((vak.a||0)/vakTotal*100)}% / Kinesthesique ${Math.round((vak.k||0)/vakTotal*100)}% / Olfactif ${Math.round((vak.og||0)/vakTotal*100)}%`;

  const prompt = `Tu es le coordinateur scientifique d'un college d'hypnotherapeutes experts.
Analyse cet entretien et constitue une EQUIPE d'experts adaptee a CE patient.
Chaque expert a un ROLE precis ET des DIRECTIVES CONCRETES par phase.

COLLEGE DISPONIBLE :
${catalogueLignes}

ENTRETIEN :
${conversationResumee}

PROFIL PATIENT :
- Canal VAKOG : ${vakDesc}
- Anxiete : ${S.clinicalProfile.anxiety}% / Motivation : ${S.clinicalProfile.motivation}% / Suggestibilite estimee : ${S.clinicalProfile.suggestibility}%

OUTILS DISPONIBLES : coherence_cardiaque, metronome_visuel, body_scan, lieu_sur, binaural_adaptatif

REGLES :
- 2-6 experts selon complexite
- Chaque expert a un role + une directive CONCRETE (pas "faire l'induction" mais "induction par confusion ericksonienne, langage indirect, dissemination de suggestions")
- Recommande les OUTILS a utiliser par phase
- Si resistance de type "controle" → privilegier confusion ou permission
- Si canal kinesthesique → privilegier body_scan et ancrage corporel
- Si canal visuel → privilegier lieu_sur et metronome
- Si anxiete elevee → coherence_cardiaque en prep obligatoire

JSON uniquement :
{
  "equipe": [
    {"id": "id_expert", "role": "role precis", "directive": "instruction concrete — comment cet expert contribue au script"}
  ],
  "technique_principale": "Nom technique combinee",
  "approche": "Directe | Indirecte | Mixte | Ericksonienne | Cognitive | Somatique",
  "complexite": "Simple | Moderee | Complexe",
  "justification": "2-3 phrases",
  "phase_directives": {
    "prep": "directive concrète pour la preparation",
    "induction": "directive concrète pour l'induction — technique precise, style, rythme",
    "deepening": "directive concrète pour l'approfondissement",
    "work": "directive concrète pour le travail therapeutique",
    "return": "directive concrète pour le retour",
    "anchor": "directive concrète pour l'ancrage"
  },
  "tools_recommended": {
    "prep": ["outils recommandes pour cette phase"],
    "induction": ["outils recommandes"],
    "deepening": ["outils recommandes"],
    "work": ["outils recommandes"]
  }
}`;

  try {
    document.getElementById('college-consulting').style.display = 'block';
    const resp = await callAPI(
      'Tu es coordinateur expert. Réponds uniquement en JSON valide, sans markdown ni backticks.',
      [{role:'user', content: prompt}],
      800
    );

    const clean = resp.replace(/```json|```/g, '').trim();
    const decision = JSON.parse(clean);

    // Normaliser : compatibilité avec ancien format si besoin
    if (!decision.equipe && decision.experts) {
      decision.equipe = decision.experts.map(id => ({id, role: COLLEGE[id]?.title || ''}));
    }
    decision.equipe = (decision.equipe || []).filter(m => COLLEGE[m.id]);
    if (!decision.equipe.length) {
      decision.equipe = [{id:'erickson',role:'Induction'},{id:'hammond',role:'Travail'},{id:'zeig',role:'Ancrage'}];
    }
    // Rétrocompat
    decision.experts = decision.equipe.map(m => m.id);
    decision.technique = decision.technique_principale || decision.technique || 'Approche intégrative';

    S.collegeDecision = decision;
    renderCollegeDecision(decision);

  } catch(e) {
    console.warn('[Collège] Consultation échouée:', e.message);
    document.getElementById('college-consulting').style.display = 'none';
  }
}

function renderCollegeDecision(decision) {
  document.getElementById('college-consulting').style.display = 'none';

  const complexiteColor = {Simple:'#6abf69', Modérée:'#C8A46E', Complexe:'#cf6a6a'}[decision.complexite] || '#8FAFB1';

  // Badge complexité
  const badgeHTML = decision.complexite
    ? `<div style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;background:${complexiteColor}22;color:${complexiteColor};border:1px solid ${complexiteColor}44;margin-bottom:7px">${decision.complexite}</div>`
    : '';

  // Équipe avec rôles
  const expertHTML = badgeHTML + (decision.equipe || []).map(m => {
    const e = COLLEGE[m.id];
    const ragBadge = e.rag ? '<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(143,175,177,.2);color:var(--mer);margin-left:4px">📚 RAG</span>' : '';
    return `<div style="margin-bottom:7px;padding:5px 7px;border-radius:6px;background:rgba(255,255,255,.03);border:1px solid rgba(143,175,177,.1)">
      <div style="font-size:10px;font-weight:600;color:var(--text1)">${e.name}${ragBadge}</div>
      <div style="font-size:9px;color:var(--mer);font-style:italic;margin:1px 0">${m.role}</div>
      <div style="font-size:9px;color:var(--text2);opacity:.7">${e.title}</div>
    </div>`;
  }).join('');
  document.getElementById('expert-display').innerHTML = expertHTML;

  // Technique + justification
  document.getElementById('college-technique-name').textContent =
    `${decision.approche} — ${decision.technique}`;
  document.getElementById('college-technique-why').textContent = decision.justification;
  document.getElementById('college-technique').style.display = 'block';

  const n = decision.equipe?.length || 0;
  showToast(`🎓 Équipe constituée — ${n} expert${n>1?'s':''} · ${decision.technique}`, 'success');
}

function analyzeClinicialSignals(text) {
  // Phase 4 — Analyse clinique par LLM (remplace le keyword-matching naïf)
  // L'appel est asynchrone et non-bloquant — le résultat met à jour l'UI quand il arrive
  analyzeClinicialSignalsLLM(text);
}

async function analyzeClinicialSignalsLLM(text) {
  if (!text || text.length < 15 || !CFG.WORKER) {
    return; // Pas assez de matière ou pas de Worker
  }

  // Throttle : pas plus d'une analyse toutes les 2 réponses
  if (!S._analysisCounter) S._analysisCounter = 0;
  S._analysisCounter++;
  if (S._analysisCounter % 2 !== 0 && S._analysisCounter > 1) return;

  try {
    const prevProfile = JSON.stringify({
      anxiety: S.clinicalProfile.anxiety,
      motivation: S.clinicalProfile.motivation,
      suggestibility: S.clinicalProfile.suggestibility,
      vakog: S.clinicalProfile.vakog,
      tags: S.clinicalProfile.tags
    });

    const resp = await callAPI(
      `Tu es un analyseur clinique silencieux pour un systeme d'hypnotherapie. Analyse cet echange et mets a jour le profil clinique.

PROFIL ACTUEL : ${prevProfile}

ECHANGE A ANALYSER :
${text.substring(0, 600)}

REGLES D'ANALYSE :
- Anxiete : evalue le NIVEAU reel d'anxiete, pas juste la presence de mots. "Je ne suis plus anxieux" = anxiete basse. "Ca me terrifie" = anxiete haute. Score 0-100.
- Motivation : evalue la motivation au changement. Discours passif = basse. "Je veux vraiment" avec exemples concrets = haute. Score 0-100.
- Suggestibilite : evalue la reactivite aux suggestions. Langage riche en images/sensations = haute. Langage factuel/analytique = basse. Score 0-100.
- VAKOG : detecte le canal sensoriel dominant dans le LANGAGE du patient (pas le contenu). Attention aux metaphores mortes ("je vois ce que vous voulez dire" n'est PAS visuel). Scores 0-100 par canal.
- Tags : dimensions cliniques emergentes (traumatique, algique, sommeil, professionnel, familial, somatique, cognitif). Ajoute uniquement si clairement present.
- Resistance : detecte les signes de resistance (reponses courtes, evitement, scepticisme, intellectualisation excessive). Liste vide si pas de resistance.

Reponds UNIQUEMENT en JSON valide :
{"anxiety":N,"motivation":N,"suggestibility":N,"vakog":{"v":N,"a":N,"k":N,"og":N},"tags":["..."],"resistance":["..."]}`,
      [{role:'user', content:'Analyse.'}],
      300
    );

    const clean = resp.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    // Mise à jour progressive (pondération 60% ancien / 40% nouveau pour stabilité)
    const w = 0.4;
    if (typeof result.anxiety === 'number')
      S.clinicalProfile.anxiety = Math.round(S.clinicalProfile.anxiety * (1-w) + result.anxiety * w);
    if (typeof result.motivation === 'number')
      S.clinicalProfile.motivation = Math.round(S.clinicalProfile.motivation * (1-w) + result.motivation * w);
    if (typeof result.suggestibility === 'number')
      S.clinicalProfile.suggestibility = Math.round(S.clinicalProfile.suggestibility * (1-w) + result.suggestibility * w);

    if (result.vakog) {
      const vak = S.clinicalProfile.vakog;
      ['v','a','k','og'].forEach(ch => {
        if (typeof result.vakog[ch] === 'number')
          vak[ch] = Math.round(vak[ch] * (1-w) + result.vakog[ch] * w);
      });
    }

    if (Array.isArray(result.tags)) {
      result.tags.forEach(tag => {
        if (tag && !S.clinicalProfile.tags.includes(tag))
          S.clinicalProfile.tags.push(tag);
      });
    }

    if (Array.isArray(result.resistance) && result.resistance.length > 0) {
      result.resistance.forEach(r => {
        if (r && !S.resistanceSignals.includes(r))
          S.resistanceSignals.push(r);
      });
    }

    updateSignalsDisplay();
    console.log('[ClinicalAnalysis] ✅ LLM', result);

  } catch(e) {
    console.warn('[ClinicalAnalysis] LLM fallback:', e.message);
    // Fallback silencieux — pas d'erreur visible pour le patient
  }
}

function updateSignalsDisplay() {
  document.getElementById('sig-anx').textContent = S.clinicalProfile.anxiety > 0 ? Math.round(S.clinicalProfile.anxiety)+'%' : '—';
  document.getElementById('sig-mot').textContent = S.clinicalProfile.motivation > 0 ? Math.round(S.clinicalProfile.motivation)+'%' : '—';
  document.getElementById('sig-sug').textContent = S.clinicalProfile.suggestibility > 0 ? Math.round(S.clinicalProfile.suggestibility)+'%' : '—';
  document.getElementById('sig-anx-bar').style.width = S.clinicalProfile.anxiety + '%';
  document.getElementById('sig-mot-bar').style.width = S.clinicalProfile.motivation + '%';
  document.getElementById('sig-sug-bar').style.width = S.clinicalProfile.suggestibility + '%';

  // VAKOG display
  const vak = S.clinicalProfile.vakog || {v:0,a:0,k:0,og:0};
  const total = (vak.v + vak.a + vak.k + vak.og) || 1;
  const pct = x => Math.round(x / total * 100);
  const domEntry = Object.entries({v:vak.v,a:vak.a,k:vak.k,og:vak.og}).sort((a,b)=>b[1]-a[1])[0];
  const domLabel = {v:'👁 Visuel',a:'👂 Auditif',k:'🤲 Kinesthésique',og:'👃 Olfactif'}[domEntry[0]];
  document.getElementById('sig-vakog-dom').textContent = domEntry[1] > 0 ? domLabel : '—';
  document.getElementById('sig-v').textContent = vak.v > 0 ? pct(vak.v)+'%' : '—';
  document.getElementById('sig-a').textContent = vak.a > 0 ? pct(vak.a)+'%' : '—';
  document.getElementById('sig-k').textContent = vak.k > 0 ? pct(vak.k)+'%' : '—';
  document.getElementById('sig-og').textContent = vak.og > 0 ? pct(vak.og)+'%' : '—';
  document.getElementById('sig-v-bar').style.width = pct(vak.v) + '%';
  document.getElementById('sig-a-bar').style.width = pct(vak.a) + '%';
  document.getElementById('sig-k-bar').style.width = pct(vak.k) + '%';
  document.getElementById('sig-og-bar').style.width = pct(vak.og) + '%';

  if (S.clinicalProfile.tags.length) {
    document.getElementById('profil-tags').innerHTML =
      S.clinicalProfile.tags.map(t=>`<span class="profil-tag new">${t}</span>`).join('');
  }
}

function updateEntretienPhase() {
  // Phase 4 — Progression adaptative basée sur le contenu clinique, pas sur le compteur
  const exchanges = Math.floor(S.entretienHistory.length / 2);
  const cp = S.clinicalProfile;
  const hasTags = cp.tags.length > 0;
  const hasVAKOG = (cp.vakog?.v || 0) + (cp.vakog?.a || 0) + (cp.vakog?.k || 0) > 0;
  const hasMotivation = cp.motivation > 20;
  const hasAnxiety = cp.anxiety > 0; // on a au moins évalué l'anxiété
  const hasSuggestibility = cp.suggestibility > 0;
  const hasSummary = !!cp.summary;
  const hasCollege = !!S.collegeDecision;

  // Phase 0 : Accueil (toujours les 2 premiers échanges minimum)
  let newPhase = 0;

  // Phase 1 : Exploration — on a commencé à recueillir de la matière
  if (exchanges >= 2 && (hasTags || hasAnxiety || hasMotivation)) newPhase = 1;

  // Phase 2 : Anamnèse hypnotique — on a des tags cliniques ET du VAKOG
  if (newPhase >= 1 && hasTags && (hasVAKOG || exchanges >= 4)) newPhase = 2;

  // Phase 3 : Formulation — le collège a délibéré OU on a assez de matière
  if (newPhase >= 2 && (hasCollege || (hasMotivation && hasSuggestibility))) newPhase = 3;

  // Phase 4 : Protocole & plan — formulation clinique disponible
  if (newPhase >= 3 && hasCollege && exchanges >= 5) newPhase = 4;

  // Phase 5 : Calibration — prêt pour l'induction
  if (newPhase >= 4 && (hasSummary || exchanges >= 8)) newPhase = 5;

  // Garde-fou : si le patient a beaucoup parlé sans progresser, avancer quand même
  if (exchanges >= 10 && newPhase < 3) newPhase = 3;
  if (exchanges >= 12 && newPhase < 5) newPhase = 5;

  if (newPhase !== S.entretienPhase) {
    S.entretienPhase = newPhase;
    renderPhaseTracker(newPhase);
    document.getElementById('ent-phase-label').textContent = ENT_PHASES[newPhase].toUpperCase();
  }
}

function renderPhaseTracker(active) {
  document.querySelectorAll('.phase-item').forEach((el, i) => {
    el.classList.remove('active','done');
    if (i < active) el.classList.add('done');
    else if (i === active) el.classList.add('active');
  });
}

function showReadyBanner(summary) {
  // Afficher formulation
  addMsgE('formulation',
    `<div class="form-header">📋 FORMULATION CLINIQUE</div>${summary}`
  );
  renderPhaseTracker(5);

  // Bouton de secours toujours visible
  document.getElementById('btn-go-induction').classList.add('visible');

  if (window.VARIANT?.autoTransition !== false) {
    // ── AUTO-TRANSITION vers la séance ──
    const announcement = 'L\'entretien est terminé. Installez-vous confortablement... Nous allons commencer votre séance dans un instant.';
    addMsgE('assistant', announcement);

    speakHypno(announcement).then(() => {
      setTimeout(() => {
        if (!S.seanceStarted) goToSeanceHypno();
      }, 2000);
    });
  } else {
    // PRO MODE : pas d'auto-transition — le thérapeute décide
    addMsgE('system', 'Formulation prête. Cliquez sur "Passer à l\'induction" quand vous êtes prêt.');
  }
}

// ═══════════════════════════════════════════════
// VAD — Voice Activity Detection
// Auto-send après 2.5s de silence vocal
// ═══════════════════════════════════════════════
let _vadTimer = null;
const VAD_SILENCE_MS = 2500; // délai silence avant envoi auto

function resetVADTimer() {
  // Appelé à chaque keypress aussi (oninput textarea)
  clearTimeout(_vadTimer);
  const ind = document.getElementById('vad-indicator');
  if (ind) ind.style.opacity = '0';
}

function startVADTimer() {
  // Déclenché par la reconnaissance vocale après un résultat final
  clearTimeout(_vadTimer);
  const ta = document.getElementById('entretien-ta');
  const ind = document.getElementById('vad-indicator');

  if (!ta?.value.trim()) return; // rien à envoyer

  // Afficher indicateur
  if (ind) ind.style.opacity = '1';

  _vadTimer = setTimeout(() => {
    if (ind) ind.style.opacity = '0';
    const text = document.getElementById('entretien-ta')?.value.trim();
    if (text && !S.isGeneratingE && !S.ttsPlaying) {
      sendEntretienMsg();
    }
  }, VAD_SILENCE_MS);
}

function cancelVADTimer() {
  clearTimeout(_vadTimer);
  const ind = document.getElementById('vad-indicator');
  if (ind) ind.style.opacity = '0';
}

// ═══════════════════════════════════════════════
// CAMÉRA ENTRETIEN — Lecture non-verbale
// Face-api pendant l'entretien clinique
// ═══════════════════════════════════════════════
let _camEActive = false;
let _camEStream = null;
let _camELoop = null;
let _camEFaceLoaded = false;

async function toggleCamEntretien() {
  if (_camEActive) {
    stopCamEntretien();
  } else {
    await startCamEntretien();
  }
}

async function startCamEntretien() {
  if (window.location.protocol === 'file:') {
    showToast('📷 Caméra indisponible en file:// — utiliser LocalHost Launcher', 'error');
    return;
  }
  const btn = document.getElementById('btn-cam-e-toggle');
  const ph  = document.getElementById('cam-e-placeholder');
  const vid = document.getElementById('face-video-e');
  if (btn) btn.textContent = 'Chargement...';

  try {
    // Réutiliser le stream global si setupEntretienMedia l'a déjà acquis
    let stream = S._mediaStream || null;
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {width:{ideal:320}, height:{ideal:240}, facingMode:'user'},
        audio: false
      });
    }
    _camEStream = stream;

    // Charger face-api si pas encore fait
    if (!_camEFaceLoaded && typeof faceapi !== 'undefined') {
      const M = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(M),
        faceapi.nets.faceExpressionNet.loadFromUri(M),
      ]);
      _camEFaceLoaded = true;
    }

    vid.srcObject = stream;
    if (ph) ph.style.display = 'none';
    vid.style.display = 'block';
    document.getElementById('emo-e-row').style.display = 'block';
    if (btn) btn.textContent = 'Désactiver';
    _camEActive = true;

    vid.onloadedmetadata = () => { if (_camEFaceLoaded) startCamELoop(vid); };
    // Si déjà chargée
    if (vid.readyState >= 2 && _camEFaceLoaded) startCamELoop(vid);

  } catch(e) {
    console.warn('[CamEntretien]', e.message);
    showToast('📷 Caméra non accessible — ' + e.message, 'error');
    if (btn) btn.textContent = 'Activer';
  }
}

function stopCamEntretien() {
  _camEActive = false;
  if (_camELoop) { clearInterval(_camELoop); _camELoop = null; }

  // Ne pas couper le stream partagé si c'est S._mediaStream (audio still needed for mic)
  // On coupe seulement les pistes vidéo
  if (_camEStream && _camEStream !== S._mediaStream) {
    _camEStream.getTracks().forEach(t => t.stop());
  } else if (_camEStream) {
    _camEStream.getVideoTracks().forEach(t => t.stop()); // garder audio
  }
  _camEStream = null;

  const vid = document.getElementById('face-video-e');
  if (vid) { vid.style.display = 'none'; vid.srcObject = null; }
  const ph = document.getElementById('cam-e-placeholder');
  if (ph) ph.style.display = 'block';
  const row = document.getElementById('emo-e-row');
  if (row) row.style.display = 'none';
  const btn = document.getElementById('btn-cam-e-toggle');
  if (btn) btn.textContent = 'Activer';
}

function startCamELoop(vid) {
  const EKMAN = ['happy','sad','angry','fearful','disgusted','surprised','neutral'];
  const EMO_LABELS = {happy:'😊 Joie',sad:'😢 Tristesse',angry:'😠 Colère',fearful:'😨 Peur',disgusted:'🤢 Dégoût',surprised:'😲 Surprise',neutral:'😐 Neutre'};

  _camELoop = setInterval(async () => {
    if (!_camEActive || !vid || vid.paused) return;
    try {
      const det = await faceapi
        .detectSingleFace(vid, new faceapi.TinyFaceDetectorOptions({inputSize:160,scoreThreshold:.4}))
        .withFaceExpressions();

      if (!det) {
        document.getElementById('emo-e-label').textContent = 'Visage non détecté';
        return;
      }

      const expr = det.expressions;
      // Dominant
      const dom = Object.entries(expr).sort((a,b) => b[1]-a[1])[0];
      document.getElementById('emo-e-label').textContent =
        `${EMO_LABELS[dom[0]]||dom[0]} — ${Math.round(dom[1]*100)}%`;

      // Grid émotions
      const grid = document.getElementById('emo-e-grid');
      if (grid) {
        grid.innerHTML = EKMAN.map(e => {
          const v = Math.round((expr[e]||0)*100);
          return `<div style="font-size:9px;color:var(--text2);white-space:nowrap">
            ${EMO_LABELS[e].split(' ')[0]} <span style="color:${v>30?'var(--mer)':'inherit'}">${v}%</span>
          </div>`;
        }).join('');
      }

      // Injecter dans profil clinique pour le prompt
      S._entretienFaceContext = {
        dominant: dom[0],
        score: dom[1],
        expressions: Object.fromEntries(EKMAN.map(e => [e, Math.round((expr[e]||0)*100)]))
      };

    } catch(e) { /* silencieux */ }
  }, 1500); // 1.5s entretien — moins fréquent qu'en séance
}

function updateExpertDisplay(ctx) {
  if (!S.protocol) return;
  const experts = getExpertPanel(S.protocol.id).slice(0, 3);
  const html = experts.map(e=>`<div style="margin-bottom:4px"><span class="expert-name">${e.name}</span><br>${e.title}</div>`).join('');
  if (ctx === 'entretien') document.getElementById('expert-display').innerHTML = html;
  if (ctx === 'seance') document.getElementById('expert-seance').innerHTML = html;
}

async function sendEntretienMsg() {
  const ta = document.getElementById('entretien-ta');
  const text = ta.value.trim();
  if (!text) return;
  if (S.isGeneratingE) return; // anti-double envoi
  S.isGeneratingE = true;
  ta.value = ''; autoResize(ta);
  cancelVADTimer();

  const wasMicActive = S.micActiveE; // sauvegarder l'état micro
  // Arrêter le micro pendant que l'IA réfléchit et parle
  // pauseMicForTTS_E ne reset pas micActiveE — c'est ce qu'on veut
  pauseMicForTTS_E();

  stopTTS();
  addMsgE('user', text);
  await generateEntretienResponse(text);
  S.isGeneratingE = false;

  // Relancer le micro si il était actif — speakHypno appelle déjà resumeMicAfterTTS_E
  // mais si pas de TTS (fallback silencieux), on le relance manuellement
  if (wasMicActive && !S.ttsPlaying && !S.micActiveE) {
    S.micActiveE = true; // restaurer le flag
    S._bufE = '';
    if (ta) { ta.value = ''; autoResize(ta); }
    setTimeout(() => startMicE(), 300);
  }
}

function addMsgE(role, text) {
  const chat = document.getElementById('entretien-chat');
  const el = document.createElement('div');
  el.className = 'msg-e ' + role;
  el.innerHTML = text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  S.entretienMessages.push({role, text, ts:Date.now()});
}

let typingElE = null;
function showTypingE() {
  const chat = document.getElementById('entretien-chat');
  typingElE = document.createElement('div');
  typingElE.className = 'typing-indicator';
  typingElE.innerHTML = '<span></span><span></span><span></span>';
  chat.appendChild(typingElE);
  chat.scrollTop = chat.scrollHeight;
}
function hideTypingE() { typingElE?.remove(); typingElE = null; }

// ═══════════════════════════════════════════════
// TRANSITION ENTRETIEN → HYPNOSE
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// MODÈLE PATIENT STRUCTURÉ — Construit par LLM après l'entretien
// Remplace les scores numériques bruts par un modèle psychique exploitable
// ═══════════════════════════════════════════════
async function buildPatientModel() {
  if (!CFG.WORKER || S.entretienHistory.length < 4) return;

  const conversation = S.entretienHistory.slice(-12)
    .map(m => `${m.role === 'user' ? 'PATIENT' : 'THÉRAPEUTE'}: ${m.content}`)
    .join('\n');

  const cp = S.clinicalProfile;

  try {
    const resp = await callAPI(
      `Tu es un systeme de modelisation clinique pour l'hypnotherapie. A partir de cet entretien, construis un modele patient structure.

ENTRETIEN :
${conversation.substring(0, 1200)}

SCORES OBSERVES : anxiete ${cp.anxiety}%, motivation ${cp.motivation}%, suggestibilite ${cp.suggestibility}%
TAGS : ${(cp.tags || []).join(', ') || 'aucun'}

CONSTRUIS CE MODELE en JSON valide :
{
  "attachment_style": "secure|anxious|avoidant|disorganized",
  "attachment_notes": "2 phrases max justifiant le style d'attachement detecte",
  "emotional_regulation": "high|medium|low",
  "regulation_notes": "comment le patient gere ses emotions dans l'entretien",
  "resistance_type": "control_intellectuel|evitement_emotionnel|compliance_surface|somatisation|aucune",
  "resistance_notes": "description du pattern de resistance observe",
  "processing_channel": "imagery|somatic|narrative|analytical",
  "processing_notes": "par quel canal le patient traite l'information — images mentales, sensations corporelles, recits, ou analyse logique",
  "dissociation_risk": "none|low|moderate|high",
  "dissociation_notes": "signes de dissociation observes ou probables",
  "induction_strategy": "directive recommandee pour l'induction basee sur le profil complet — 2-3 phrases",
  "contraindications_induction": ["liste des choses a NE PAS faire avec ce patient"]
}

REGLES :
- Base-toi sur les COMPORTEMENTS observes dans l'entretien, pas seulement les declarations
- Si les donnees sont insuffisantes pour un champ, mets "unknown" et explique dans les notes
- attachment_style : ecoute la COHERENCE NARRATIVE (secure = nuance, anxieux = amplification, evitant = minimisation)
- resistance_type : "aucune" est RARE — la plupart des patients ont un pattern
- processing_channel : observe les predicats VAKOG utilises spontanement
- L'induction_strategy doit etre CONCRETE — pas "adapter au patient" mais "induction kinesthesique par scan corporel, eviter les directives frontales"

JSON uniquement.`,
      [{role:'user', content:'Modele patient.'}],
      600
    );

    const clean = resp.replace(/```json|```/g, '').trim();
    const model = JSON.parse(clean);
    S.clinicalProfile.patientModel = model;
    console.log('[PatientModel] ✅', model);

  } catch(e) {
    console.warn('[PatientModel] LLM erreur:', e.message);
    // Fallback minimal
    S.clinicalProfile.patientModel = {
      attachment_style: 'unknown',
      emotional_regulation: 'unknown',
      resistance_type: 'unknown',
      processing_channel: 'unknown',
      dissociation_risk: 'unknown',
      induction_strategy: 'Approche permissive par defaut — donnees insuffisantes.',
      contraindications_induction: []
    };
  }
}

// ── Inférence de protocole par LLM — universelle et adaptative ──
async function inferProtocolLLM() {
  const summary = S.clinicalProfile.summary || '';
  const tags = S.clinicalProfile.tags || [];
  const collegeDecision = S.collegeDecision;

  // Construire le catalogue des protocoles disponibles
  const catalog = PROTOCOLS.map(p => `${p.id}: ${p.name} — ${p.desc}`).join('\n');

  if (!CFG.WORKER || !summary) {
    // Fallback : si pas de Worker ou pas de summary, prendre stress par défaut
    return PROTOCOLS.find(p => p.id === 'stress') || PROTOCOLS[0];
  }

  try {
    const resp = await callAPI(
      `Tu es un systeme de routage clinique pour un outil d'hypnotherapie. Analyse la formulation clinique et selectionne le protocole le plus adapte.

FORMULATION CLINIQUE : ${summary}
TAGS CLINIQUES : ${tags.join(', ') || 'aucun'}
${collegeDecision ? `TECHNIQUE RECOMMANDEE PAR LE COLLEGE : ${collegeDecision.technique} (${collegeDecision.approche})` : ''}

PROTOCOLES DISPONIBLES :
${catalog}

REGLES :
- Choisis le protocole le PLUS pertinent pour la demande du patient
- Si la demande ne correspond a aucun protocole exactement, choisis le plus proche
- Si comorbidite (ex: anxiete + sommeil), choisis le protocole PRINCIPAL
- Reponds UNIQUEMENT avec l'id du protocole (un seul mot)`,
      [{role:'user', content:'Quel protocole ?'}],
      50
    );

    const id = resp.trim().toLowerCase().replace(/[^a-z]/g, '');
    const found = PROTOCOLS.find(p => p.id === id);
    if (found) {
      console.log(`[Protocol] ✅ LLM inferred: ${found.name}`);
      return found;
    }
    // Fuzzy match si le LLM a donné un nom approchant
    const fuzzy = PROTOCOLS.find(p => id.includes(p.id) || p.id.includes(id));
    if (fuzzy) {
      console.log(`[Protocol] ✅ LLM fuzzy: ${fuzzy.name}`);
      return fuzzy;
    }
  } catch(e) {
    console.warn('[Protocol] LLM fallback:', e.message);
  }

  // Fallback : stress par défaut
  return PROTOCOLS.find(p => p.id === 'stress') || PROTOCOLS[0];
}

async function goToSeanceHypno() {
  if (S.seanceStarted) return;
  S.seanceStarted = true;

  if (S.entretienTimer) clearInterval(S.entretienTimer);

  // ── Arrêt complet médias entretien ──
  stopTTS();
  cancelVADTimer();
  stopMicE();
  stopMeyda();
  stopCamEntretien();
  if (S._mediaStream) {
    S._mediaStream.getTracks().forEach(t => t.stop());
    S._mediaStream = null;
  }
  S._mediaReady = false;
  window.speechSynthesis?.cancel();
  if (S.ttsAudio) { S.ttsAudio.pause(); S.ttsAudio.src = ''; S.ttsAudio = null; }
  S.ttsPlaying = false;

  // ── Charger la mémoire inter-séances ──
  loadSessionMemory();

  await new Promise(r => setTimeout(r, 300));

  S.depth = 0; S.phase = 'prep';
  S.seanceStartTime = Date.now();
  S.seanceMessages = []; S.seanceLog = [];
  S.hypnoHistory = [];
  S.resistanceSignals = [];

  // ── Résoudre le protocole — inférence intelligente ──
  if (!S.protocol) {
    S.protocol = await inferProtocolLLM();
    const done = getAllSessions().filter(s => s.protocol === S.protocol.id).length;
    S.sessionNum = done + 1;
  }

  const p = S.protocol;
  document.getElementById('sh-proto').textContent = `${p?.emoji||'🌀'} ${p?.name||'Séance libre'} · S${S.sessionNum}`;
  renderQuickScripts();
  updateExpertDisplay('seance');
  showScreen('screen-seance');
  startCanvasAnim();
  if (S.binauralOn) startBinaural();
  syncBinauralSw();
  initVakogSidebar();
  setTimeout(() => startCamera(), 600);

  if (S.seanceTimer) clearInterval(S.seanceTimer);
  S.seanceTimer = setInterval(() => {
    const e = Math.floor((Date.now() - S.seanceStartTime) / 1000);
    document.getElementById('sh-timer').textContent =
      String(Math.floor(e / 60)).padStart(2,'0') + ':' + String(e % 60).padStart(2,'0');
  }, 1000);

  addMsgS('system', `🌀 Séance ${S.sessionNum}/${p?.sessions||'?'} — ${p?.name||'Séance libre'} — Début`);

  // ── Pont de transition pré-inductif (utilise les mots du patient) ──
  const bridge = S._transitionBridge || '';
  const mem = S.sessionMemory;
  const memHint = mem.lastSessionSummary
    ? `Séance précédente : ${mem.lastSessionSummary}. ${mem.effectiveMetaphors.length ? `Métaphores efficaces : ${mem.effectiveMetaphors.slice(-2).join(', ')}.` : ''} ${mem.placedAnchors.length ? `Ancrages posés : ${mem.placedAnchors.slice(-1).map(a => a.geste + ' → ' + a.ressource).join(', ')}.` : ''}`
    : '';

  const context = S.clinicalProfile.summary
    ? `Entretien réalisé. Formulation clinique : "${S.clinicalProfile.summary}". Prédicats linguistiques du patient : [${S.patientPredicates.slice(-6).join(', ')}]. ${S.patientMetaphors.length ? `Métaphores spontanées du patient : ${S.patientMetaphors.join(', ')}.` : ''} ${memHint} ${bridge ? `Pont de transition préparé : "${bridge}"` : ''} Commence par lire ce pont de transition, puis entre dans la phase prep avec une induction adaptée à ces mots exacts.`
    : 'Commence la séance avec une installation douce et une induction conversationnelle.';
  await generateHypnoScript(context);
}

// ═══════════════════════════════════════════════
// GÉNÉRATION SCRIPT HYPNOTIQUE
// ═══════════════════════════════════════════════
async function generateHypnoScript(userInput) {
  if (S.isGenerating) return;
  S.isGenerating = true;
  const loadId = addLoadingMsgS();
  try {
    const p = S.protocol || PROTOCOLS[0];

    // Collège : utiliser la décision dynamique de l'entretien si disponible,
    // sinon fallback sur le mapping statique par protocole
    let collegeBlock;
    if (S.collegeDecision) {
      const d = S.collegeDecision;
      const expertLines = d.equipe.map(m => {
        const e = COLLEGE[m.id];
        return e ? `• ${e.name} [${m.role}] → ${m.directive || e.style}` : '';
      }).filter(Boolean).join('\n');

      // Directive spécifique à la phase courante
      const phaseDir = d.phase_directives?.[S.phase] || '';

      collegeBlock = `\n═══ EQUIPE D'EXPERTS — DECISION POUR CE PATIENT ═══\n` +
        `Technique : ${d.technique} (${d.approche}) — Complexite : ${d.complexite||'?'}\n` +
        `Justification : ${d.justification}\n\n` +
        `Equipe active :\n${expertLines}\n` +
        (phaseDir ? `\n══ DIRECTIVE PHASE ${S.phase.toUpperCase()} ══\n${phaseDir}\nApplique cette directive MAINTENANT dans le script que tu generes.\n` : '') +
        `\nINSTRUCTION : Chaque expert contribue selon sa directive. Le style du script reflete la synthese de l'equipe. Ne cite jamais un expert au patient.\n`;
    } else {
      collegeBlock = buildCollegePrompt(p?.id || 'stress');
    }

    const ragContext = await fetchRAG(userInput, p, S.phase);

    // ── WEB-CONSULT — Entité 3B (conditionnel) ──
    let webContext = '';
    if (window.VARIANT.webConsultEnabled) {
      if (!S._webConsultDone) {
        const wcResult = await evaluateWebConsultNeed(userInput, {
          system: 'hypnose',
          phase: S.phase || 'entretien',
          protocol: p?.id || 'non défini'
        });
        if (wcResult) {
          console.log(`[WebConsult-LLM] ✅ SEARCH: "${wcResult.query}" — ${wcResult.reason}`);
          const webResults = await webConsult(wcResult.query, 'hypnosis');
          webContext = buildWebConsultContext(webResults);
          S._webConsultDone = true;
          S._webConsultResults = webResults;
          S._webConsultTrigger = wcResult.trigger;
        }
      } else if (S._webConsultDone && S._webConsultResults) {
        // Réutiliser le résultat déjà obtenu
        webContext = buildWebConsultContext(S._webConsultResults);
      }
    }

    const systemPrompt = buildHypnoSystemPrompt(p, collegeBlock, ragContext, webContext);

    S.hypnoHistory.push({role:'user', content:userInput});
    let cleanH = S.hypnoHistory.slice(-12).map(m=>({role:m.role,content:String(m.content)}));
    if (cleanH[0]?.role==='assistant') cleanH.unshift({role:'user',content:'[Début séance]'});
    const fixed = [];
    for (const m of cleanH) {
      if (fixed.length && fixed[fixed.length-1].role===m.role) fixed[fixed.length-1].content+='\n'+m.content;
      else fixed.push({...m});
    }
    if (fixed[fixed.length-1]?.role!=='user') fixed.push({role:'user',content:'[Patient attend]'});

    // VARIANT: maxTokens dynamique selon la phase
    const phaseTokens = {prep:900, induction:1200, deepening:1400, work:1400, return:1000, anchor:800};
    const maxTk = phaseTokens[S.phase] || 1200;

    const resp = await callAPI(systemPrompt, fixed, maxTk);
    S.hypnoHistory.push({role:'assistant', content:resp});
    removeLoadingS(loadId);

    const {clinical, script} = parseResp(resp);
    const text = script || resp;

    // PRO MODE: afficher les notes cliniques dans la sidebar
    if (clinical) displayClinicalNote(clinical);

    addMsgS('hypno', text);
    updateOverlayText(extractFirst(text));
    duckHypnoSound(true);          // baisser son ambiance pendant la voix
    await speakHypno(text);
    duckHypnoSound(false);         // remonter après
    autoAdjDepth(text);

    // Arbre de décision continu — réévalue après chaque script généré
    // (pas seulement au changement de phase — réagit aux changements de profondeur et résistance)
    therapeuticDecisionEngine();

    S.seanceLog.push({ts:Date.now(),type:'script',phase:S.phase,depth:S.depth,text});
  } catch(e) {
    removeLoadingS(loadId);
    addMsgS('system','⚠️ Erreur de génération — vérifiez la connexion.');
    console.error('[HypnoScript]',e);
  }
  S.isGenerating = false;
}

function buildHypnoSystemPrompt(p, collegeBlock, ragContext, webContext) {
  const clinSummary = S.clinicalProfile.summary || 'évaluation non disponible';
  const prevSessions = getAllSessions().filter(s => s.protocol === p?.id);

  // ── Historique sessions ──
  const histoBlock = prevSessions.length > 0
    ? `\nHISTORIQUE PATIENT :\n${prevSessions.slice(-3).map(s =>
        `- S${s.session_num||1} (${new Date(s.date).toLocaleDateString('fr-FR')}) : profondeur ${(s.depth_final||0).toFixed(1)}/10, bien-être ${s.wellbeing||'?'}/10${s.notes?', notes: "'+s.notes.substring(0,60)+'"':''}`
      ).join('\n')}\n`
    : '';

  // ── Bloc VAKOG ──
  const vak = S.clinicalProfile.vakog || {v:0,a:0,k:0,og:0};
  const vakTotal = (vak.v+vak.a+vak.k+vak.og) || 1;
  const vakPct = x => Math.round(x / vakTotal * 100);
  const vakDom = Object.entries({Visuel:vak.v, Auditif:vak.a, Kinesthésique:vak.k, 'Olfactif/Gustatif':vak.og})
    .sort((a,b) => b[1]-a[1]);
  const vakDomName = vakDom[0][1] > 0 ? vakDom[0][0] : 'Non déterminé';
  const vakInstructions = {
    Visuel: `Dominant VISUEL — métaphores visuelles prioritaires.\nEx: "Imaginez une lumière douce... bleutée... qui enveloppe vos épaules..." / "Voyez ce chemin qui s'ouvre..."`,
    Auditif: `Dominant AUDITIF — métaphores sonores et voix.\nEx: "Entendez ce silence... profond..." / "Ma voix... comme une vague... vous porte..."`,
    Kinesthésique: `Dominant KINESTHÉSIQUE — sensations corporelles localisées prioritaires.\nEx: "Sentez le poids de vos mains... sur vos cuisses... cette chaleur qui monte..." / "Votre dos s'enfonce dans le siège... soutenu..."`,
    'Olfactif/Gustatif': `Canal OLFACTIF/GUSTATIF — ancres sensorielles subtiles.\nEx: "Une odeur douce et familière... comme de la lavande..."`,
    'Non déterminé': `Canal non établi — commence par kinesthésique (le plus universel), observe la réponse.`
  };
  const vakSec = vakDom[1]&&vakDom[1][1]>0 ? ` | Secondaire : ${vakDom[1][0]} (${vakPct(vakDom[1][1])}%)` : '';
  const vakBlock = `\nCANAL SENSORIEL DOMINANT (VAKOG) :\n• Dominant : ${vakDomName} (${vakPct(vakDom[0][1])}%)${vakSec}\n• INSTRUCTION : ${vakInstructions[vakDomName]}\n`;

  const kinoBlock = (typeof getKinoBlock === 'function') ? getKinoBlock() : '';
  const cameraBlock = (typeof buildCameraContext === 'function') ? buildCameraContext() : '';

  // ── Prédicats linguistiques du patient ──
  const predicatsBlock = S.patientPredicates.length > 0
    ? `\nPRÉDICATS LINGUISTIQUES DU PATIENT (ses mots exacts — à réutiliser dans le script) :\n${S.patientPredicates.slice(-8).join(', ')}\n${S.patientMetaphors.length ? `Métaphores spontanées : ${S.patientMetaphors.join(', ')}` : ''}\n`
    : '';

  // ── Modèle patient structuré (construit par LLM après l'entretien) ──
  const pm = S.clinicalProfile?.patientModel;
  const patientModelBlock = pm && pm.attachment_style !== 'unknown'
    ? `\nMODÈLE PATIENT :
• Attachement : ${pm.attachment_style}${pm.attachment_notes ? ' — ' + pm.attachment_notes : ''}
• Regulation emotionnelle : ${pm.emotional_regulation}${pm.regulation_notes ? ' — ' + pm.regulation_notes : ''}
• Type de resistance : ${pm.resistance_type}${pm.resistance_notes ? ' — ' + pm.resistance_notes : ''}
• Canal de traitement : ${pm.processing_channel}${pm.processing_notes ? ' — ' + pm.processing_notes : ''}
• Risque dissociatif : ${pm.dissociation_risk}${pm.dissociation_notes ? ' — ' + pm.dissociation_notes : ''}

STRATEGIE D'INDUCTION RECOMMANDEE :
${pm.induction_strategy || 'Approche permissive par defaut.'}
${pm.contraindications_induction?.length ? '\nA NE PAS FAIRE avec ce patient :\n' + pm.contraindications_induction.map(c => '- ' + c).join('\n') : ''}
\n`
    : '';

  // ── Mémoire thérapeutique ACTIVE ──
  const mem = S.sessionMemory;
  let memBlock = '';
  if (mem.effectiveMetaphors.length || mem.placedAnchors.length || mem.resistancePatterns.length) {
    memBlock = '\nMÉMOIRE THÉRAPEUTIQUE ACTIVE :\n';

    // Résistances connues → directives de stratégie
    if (mem.resistancePatterns.length > 0) {
      const rp = mem.resistancePatterns.slice(-3);
      memBlock += `RÉSISTANCES CONNUES : ${rp.join(', ')}\n`;
      memBlock += 'DIRECTIVES :\n';
      for (const r of rp) {
        const rl = r.toLowerCase();
        if (rl.includes('control') || rl.includes('intellectualis'))
          memBlock += '  → Induction INDIRECTE obligatoire. Technique de confusion ou permission. PAS de directive.\n';
        else if (rl.includes('evit') || rl.includes('fuit') || rl.includes('esquiv'))
          memBlock += '  → Approche permissive. Metaphores ouvertes. Laisser le patient venir a son rythme.\n';
        else if (rl.includes('complian') || rl.includes('surface') || rl.includes('acquiesc'))
          memBlock += '  → Mefiante : compliance de surface. Chercher la profondeur authentique. Tester avec paradoxe leger.\n';
        else if (rl.includes('somat') || rl.includes('corps') || rl.includes('tension'))
          memBlock += '  → Resistance corporelle. Commencer par la validation somatique avant toute suggestion.\n';
        else
          memBlock += `  → Pattern "${r}" — adapter le rythme et la technique.\n`;
      }
    }

    // Métaphores efficaces → réutiliser comme fil conducteur
    if (mem.effectiveMetaphors.length > 0) {
      memBlock += `MÉTAPHORES EFFICACES (profondeur > 7 en sessions précédentes) : ${mem.effectiveMetaphors.slice(-3).join(', ')}\n`;
      memBlock += '  → DIRECTIVE : tisser ces metaphores dans le script. Le patient les connait, elles resonnent. Les developper, pas les repeter mecaniquement.\n';
    }

    // Ancrages posés → réactiver
    if (mem.placedAnchors.length > 0) {
      const anchors = mem.placedAnchors.slice(-2);
      memBlock += `ANCRAGES POSÉS : ${anchors.map(a => a.geste + ' → ' + a.ressource).join(' | ')}\n`;
      memBlock += '  → DIRECTIVE : reactiver l\'ancrage dans la phase work ou deepening. Formuler : "Et peut-etre que ce geste... ' + anchors[anchors.length-1].geste + '... retrouve naturellement cette sensation de ' + anchors[anchors.length-1].ressource + '..."\n';
    }

    memBlock += '\n';
  }

  // ── Résistance détectée ──
  const resistBlock = S.resistanceSignals.length > 0
    ? `\n⚠️ RÉSISTANCE DÉTECTÉE (${S.resistanceSignals.length} signal${S.resistanceSignals.length>1?'s':''}) : ${S.resistanceSignals.slice(-2).join(' | ')}\nStratégie recommandée : changer de métaphore, utiliser le pacing, technique de confusion légère, ou accepter et utiliser la résistance comme levier.\n`
    : '';

  // ── Contraintes cliniques du triage ──
  const triageAdapts = (S._triageAdaptations || []);
  const triageBlock = triageAdapts.length > 0
    ? `\n⚠️ CONTRAINTES CLINIQUES (triage) :\n${triageAdapts.map(a => {
        if (a === 'noRegression:true') return '- PAS de regression (trauma). Lieu sur obligatoire en phase 1.';
        if (a === 'safePlaceFirst:true') return '- Installer un lieu sur avant toute intervention profonde.';
        if (a === 'lowActivation:true') return '- Maintenir une activation emotionnelle BASSE (bipolaire stabilise).';
        if (a === 'noDeepRegression:true') return '- PAS de regression profonde (borderline). Cadre ferme.';
        if (a === 'systematicAnchor:true') return '- Ancrage de securite SYSTEMATIQUE a chaque phase.';
        if (a === 'pregnancySafe:true') return '- Grossesse : pas de travail sur douleur abdominale ni lourdeur ventrale.';
        return '- ' + a;
      }).join('\n')}\n`
    : '';

  // ── Collège dynamique depuis catalogue ──
  const catalogBooks = RAG_CATALOG.loaded ? RAG_CATALOG.books : [];
  let collegeWithLib = collegeBlock;
  if (catalogBooks.length > 0) {
    collegeWithLib += `\n⚡ BIBLIOTHÈQUE HYPNOSE ACTIVE — ${RAG_CATALOG.totalChunks} chunks — ${catalogBooks.length} ouvrages :\n`;
    catalogBooks.forEach(b => { collegeWithLib += `  📚 ${b.author} — "${b.book_title}" (${b.chunks} chunks)\n`; });
    collegeWithLib += `INSTRUCTIONS : Intègre les extraits bibliographiques ci-dessous directement dans le script. Ne cite jamais les auteurs au patient.\n`;
  }

  return `Tu es une IA hypnotherapeute clinicienne d'excellence, synthese du college mondial.
Protocole : ${p?.name||'non defini'} — Seance ${S.sessionNum}/${p?.sessions||'?'}
Patient : ${S.prenom||'anonyme'}${S.age?', '+S.age+' ans':''}
Formulation clinique : ${clinSummary}
Phase actuelle : ${S.phase} — Profondeur : ${S.depth.toFixed(1)}/10 (${DEPTH_LABELS[Math.round(S.depth)]||'calibration'})
${histoBlock}${vakBlock}${patientModelBlock}${predicatsBlock}${memBlock}${resistBlock}${triageBlock}${kinoBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RAISONNEMENT CLINIQUE — AVANT CHAQUE GENERATION (silencieux)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Avant de generer le script, execute cette sequence :

0. DECISION CLINIQUE — EST-CE LE BON MOMENT ?
   Avant toute generation de script, pose-toi cette question :
   "Dois-je continuer l'hypnose, ou faut-il faire autre chose ?"
   SIGNAUX D'ARRET ou de BIFURCATION :
   - Patient desorganise, discours incoherent → STOP. Reorienter. Psychoeducation ou contenance.
   - Patient en dissociation excessive (regard vide, perte de contact, ne repond plus) → sortie douce immediate. Ancrage sensoriel. "Sentez vos pieds sur le sol."
   - Patient en detresse aigue (pleurs incontrôlables, panique) → STOP travail therapeutique. Contenance. "Vous etes en securite ici. Respirez avec moi."
   - Patient qui demande d'arreter → ARRET IMMEDIAT. Pas de "laissez venir". Respecter.
   - Resistance persistante malgre 3 tentatives → STOP induction. Passer en psychoeducation ou en conversation. L'alliance n'est pas assez solide.
   - Patient qui revele pendant la seance une CI non declaree (trauma grave, psychose) → sortie progressive et reorientation.
   Si AUCUN signal d'arret → continuer le protocole normal.
   Si un signal est present → [CLINIQUE] doit indiquer la bifurcation choisie ET le [SCRIPT] doit etre adapte (contenance, sortie, psychoeducation — PAS une suggestion hypnotique).

1. COHERENCE PROFONDEUR — La profondeur rapportee (${S.depth.toFixed(1)}/10) est-elle coherente avec ce que je sais du patient ?
   Source de la profondeur : ${S.faceApiOn && faceDetections.length > 5 ? 'MULTIMODAL (camera active — score fiable)' : 'TEXTUELLE SEULE (camera inactive — score approximatif, etre plus prudent)'}
   ${S.relaxScore > 0.6 ? 'Camera confirme une relaxation profonde (' + (S.relaxScore*100).toFixed(0) + '%) — coherent avec une profondeur elevee.' : S.relaxScore > 0.3 ? 'Camera indique une relaxation moderee (' + (S.relaxScore*100).toFixed(0) + '%) — ne pas surestimer la profondeur.' : S.faceApiOn && faceDetections.length > 5 ? 'Camera indique un eveil relatif (' + (S.relaxScore*100).toFixed(0) + '%) — la profondeur affichee est probablement surestimee. Adapter le script a un niveau plus leger.' : ''}
   Si le patient vient d'arriver en seance, une profondeur de 8 est suspecte. Adapter le script a la profondeur REELLE, pas au chiffre affiche.

2. EVALUATION RESISTANCE — Le patient montre-t-il des signes de resistance (tension, ouverture des yeux, mouvements, questions) ? Si OUI → ne pas pousser. Utiliser l'une des 4 strategies :
   a) UTILISATION — integrer la resistance dans la suggestion : "Et c'est tout a fait normal de garder cette vigilance... elle a toujours bien fonctionne pour vous... et pendant que vous la gardez... vous pouvez aussi permettre a autre chose de se passer..."
   b) PACING — rejoindre le patient : "Vous n'avez pas besoin de vous detendre... et c'est parfait comme ca..."
   c) CONFUSION — micro-technique ericksonienne : une phrase legerement illogique qui decroche le mental analytique
   d) PERMISSION — donner le controle au patient : "Vous pouvez choisir... de laisser venir... ou pas... et les deux sont bien..."

3. CONTINUITE NARRATIVE — Le script doit s'inscrire dans la continuite de ce qui precede. Pas de rupture de ton, pas de changement de metaphore brutal. Si une metaphore est en cours, la developper. Si le patient a donne des predicats specifiques, les tisser naturellement.

4. CALIBRATION PHASE — Chaque phase a un objectif precis :
   prep → installer le confort, poser le cadre, commencer le rationnement
   induction → focaliser l'attention, utiliser le canal VAKOG dominant, premiers signes de lacher-prise
   deepening → approfondir par repetition, ralentissement, metaphores d'enfoncement
   work → suggestions therapeutiques specifiques au protocole, metaphores de changement
   return → remontee progressive, ancrage, suggestions post-hypnotiques
   anchor → poser l'ancre, renforcer, donner une suggestion d'autonomie

PRINCIPES ABSOLUS :
- Langage permissif, indirect — suggerer jamais forcer
- Pauses ... = 3 secondes reelles (TTS les respecte)
- Rythme ultra-lent en deepening/work (une phrase, pause, une phrase)
- Valider l'experience du patient avant toute nouvelle suggestion
- Utiliser IMPERATIVEMENT les predicats linguistiques du patient
- Si resistance → JAMAIS forcer — utiliser/rejoindre/transformer (voir strategies ci-dessus)
- Si transe profonde confirmee → maintenir, ne pas perturber
${cameraBlock}
FORMAT :
[CLINIQUE] raisonnement clinique (3 lignes max — resultat de la sequence ci-dessus — NE PAS lire au patient)
[SCRIPT] texte hypnotique exact a lire a voix haute (avec ... pour les vraies pauses)
${getActiveToolsContext()}${getCollegeSessionDirective()}${collegeWithLib}${ragContext ? '\n' + ragContext : ''}${webContext ? '\n' + webContext : ''}`;
}

function parseResp(raw) {
  const cM = raw.match(/\[CLINIQUE\]([\s\S]*?)(?=\[SCRIPT\]|$)/);
  const sM = raw.match(/\[SCRIPT\]([\s\S]*?)$/);
  return { clinical:cM?cM[1].trim():'', script:sM?sM[1].trim():'' };
}

function extractFirst(text) {
  return text.replace(/\.\.\./g,'').match(/^[^.!?]+[.!?]?/)?.[0]?.substring(0,85) || text.substring(0,85);
}

function autoAdjDepth(script) {
  // Phase 4 — Ajustement intelligent de la profondeur
  // Au lieu de chercher des mots-clés hardcodés, on analyse le bloc [CLINIQUE]
  // Le LLM a déjà raisonné sur la profondeur dans sa séquence clinique
  const s = script.toLowerCase();

  // Signaux d'approfondissement (patterns ericksoniens réels, pas juste "plus profond")
  const deepeningSignals = [
    /plus profond/,
    /approfond/,
    /descendez/,
    /laissez.{0,20}aller/,
    /chaque respiration.{0,30}(profond|lourd|enfonc)/,
    /10.{0,5}9.{0,5}8/,    // comptage descendant
    /triple.{0,10}(lourd|profond)/,
    /dissoci/,
    /cataleps/,
  ];

  const returnSignals = [
    /revenez/,
    /remontez/,
    /retournez/,
    /eveillez/,
    /ouvrez.{0,15}yeux/,
    /1.{0,5}2.{0,5}3.{0,5}4.{0,5}5/,  // comptage ascendant
    /reorient/,
    /reprendre.{0,15}conscience/,
  ];

  const deepCount = deepeningSignals.filter(rx => rx.test(s)).length;
  const returnCount = returnSignals.filter(rx => rx.test(s)).length;

  if (deepCount > returnCount && deepCount > 0) {
    const increment = Math.min(deepCount * 0.3, 1.0); // max +1 par script
    setTimeout(() => setDepth(Math.min(10, S.depth + increment)), 2000);
  } else if (returnCount > deepCount && returnCount > 0) {
    const decrement = Math.min(returnCount * 0.5, 2.0); // remontée plus rapide
    setTimeout(() => setDepth(Math.max(0, S.depth - decrement)), 2000);
  }
}

// ═══════════════════════════════════════════════
// API CALL
// ═══════════════════════════════════════════════
async function callAPI(system, messages, maxTokens=900) {
  // Passe par le proxy Cloudflare — jamais appel direct Anthropic (CORS bloqué)
  const response = await fetch(CFG.WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: {
        provider: 'anthropic',
        model: CFG.MODEL,
        max_tokens: maxTokens,
        system,
        messages
      }
    })
  });
  if (!response.ok) throw new Error('API ' + response.status);
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// RAG — Bibliothèque thérapeutique multi-requêtes
// Bibliothèque indexée :
//   • Allan Trevor — Hypnose Conversationnelle (59 chunks)
//   • François Roustang / Jean-Marc Benhaïem — L'Art de l'Hypnose 2024 (130 chunks)
//   • Philippe Aïm — Hypnose en situation d'urgence (en cours d'indexation)
// ═══════════════════════════════════════════════

// Construire les requêtes RAG selon contexte clinique
// ═══════════════════════════════════════════════════════════════
// RAG UNIVERSEL — Système dynamique et adaptatif
// ───────────────────────────────────────────────────────────────
// Principe : ZÉRO auteur hardcodé.
// Au démarrage → catalogue chargé depuis /library-stats (approche hypnosis)
// À chaque génération → requêtes construites depuis le catalogue réel
// Ajout de 10-20 livres = aucune modification de code requise
// ═══════════════════════════════════════════════════════════════

// ── Catalogue en mémoire (chargé au démarrage) ──
const RAG_CATALOG = {
  loaded:   false,
  loading:  false,
  books:    [],          // [{book_id, book_title, author, chunks, approach, language}]
  totalChunks: 0,
  loadedAt: null,
  error:    null,
};

// ── Charger le catalogue depuis /library-stats ──
async function loadRAGCatalog() {
  if (RAG_CATALOG.loaded || RAG_CATALOG.loading) return;
  if (!CFG.WORKER) return;
  RAG_CATALOG.loading = true;
  try {
    // Requête D1 directe — plus fiable que /library-stats (évite les doublons de requêtes)
    const q = await fetch(CFG.WORKER + '/d1-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: "SELECT book_id, book_title, author, COUNT(*) as chunks FROM chunks WHERE approach='hypnosis' GROUP BY book_id ORDER BY chunks DESC"
      })
    });
    if (!q.ok) throw new Error('HTTP ' + q.status);
    const qData = await q.json();
    const rows = qData.results || [];
      RAG_CATALOG.books = rows.map(row => ({
        book_id:    row.book_id,
        book_title: row.book_title,
        author:     row.author || 'Inconnu',
        approach:   'hypnosis',
        language:   'fr',
        chunks:     row.chunks || 0,
      }));
      RAG_CATALOG.totalChunks = rows.reduce((s, r) => s + (r.chunks || 0), 0);

    RAG_CATALOG.loaded  = true;
    RAG_CATALOG.loading = false;
    RAG_CATALOG.loadedAt = Date.now();
    console.log(`[RAG Catalog] ✅ ${RAG_CATALOG.books.length} livres hypnose — ${RAG_CATALOG.totalChunks} chunks total`);
    RAG_CATALOG.books.forEach(b => console.log(`  📚 ${b.author} — "${b.book_title}" (${b.chunks} chunks)`));

    // Mettre à jour le collège avec les vrais auteurs
    updateCollegeFromCatalog();

  } catch(e) {
    RAG_CATALOG.loading = false;
    RAG_CATALOG.error = e.message;
    console.warn('[RAG Catalog] ⚠️ Chargement échoué:', e.message);
  }
}

// ── Construire les requêtes RAG dynamiquement depuis le catalogue ──
function buildRAGQueries(userInput, protocol, phase) {
  const queries = [];

  // ── Q1 : Requête sémantique principale (ce que dit le patient) ──
  const mainQ = userInput.substring(0, 150).trim();
  if (mainQ) {
    queries.push({ query: mainQ, approach: 'hypnosis', topK: 5, label: 'principale' });
  }

  // ── Q2 : Requête de phase ──
  const phaseMap = {
    prep:      'préparation induction installation rapport hypnotique',
    induction: 'induction hypnotique technique entrée transe fixation',
    deepening: 'approfondissement transe profondeur dissociation immobilité',
    work:      'suggestions thérapeutiques hypnose travail ' + (protocol?.id || ''),
    return:    'retour hypnose réveil progressif réorientation',
    anchor:    'ancrage post-hypnotique ressource suggestion directe',
  };
  if (phaseMap[phase]) {
    queries.push({ query: phaseMap[phase], approach: 'hypnosis', topK: 4, label: 'phase:' + phase });
  }

  // ── Q3 : Requête spécifique au protocole ──
  const protocolMap = {
    tabac:     'arrêt tabac suggestion hypnotique liberté non-fumeur aversion',
    anxiete:   'anxiété phobie lieu sûr ancrage calme sécurité hypnose',
    douleur:   'douleur chronique hypnoanalgésie gant anesthésique gate-control rhéostat',
    sommeil:   'insomnie endormissement lourdeur suggestion hypnotique nuit',
    confiance: 'confiance estime de soi ressources inconscient métaphore force',
    stress:    'stress burnout relaxation profonde ressources hypnose',
    poids:     'alimentation satiété corps image suggestions hypnotiques',
    chirurgie: 'préparation chirurgicale anesthésie calme récupération',
    sport:     'performance zone optimale visualisation hypnose compétition',
    trauma:    'trauma dissociation sécurité ressource hypnose stabilisation',
    deuil:     'deuil perte séparation accompagnement hypnose',
    couple:    'relation intime confiance communication hypnose',
  };
  const protQ = protocol?.id ? (protocolMap[protocol.id] || 'hypnose thérapeutique ' + protocol.name) : null;
  if (protQ) {
    queries.push({ query: protQ, approach: 'hypnosis', topK: 5, label: 'protocole:' + (protocol?.id || '') });
  }

  // ── Q4 : Requête VAKOG — canal sensoriel dominant ──
  const vak = S.clinicalProfile?.vakog || {};
  const vakTotal = (vak.v||0)+(vak.a||0)+(vak.k||0)+(vak.og||0) || 1;
  const kPct = (vak.k||0)/vakTotal, vPct = (vak.v||0)/vakTotal, aPct = (vak.a||0)/vakTotal;
  if (kPct > 0.28) {
    queries.push({ query: 'sensations corps chaleur lourdeur kinesthésique ancrage corporel relaxation', approach: 'hypnosis', topK: 4, label: 'vakog:K' });
  } else if (vPct > 0.28) {
    queries.push({ query: 'visualisation lumière couleurs métaphore visuelle images intérieures hypnose', approach: 'hypnosis', topK: 4, label: 'vakog:V' });
  } else if (aPct > 0.28) {
    queries.push({ query: 'voix silence son rythme musique intérieure auditif hypnose', approach: 'hypnosis', topK: 4, label: 'vakog:A' });
  }

  // ── Q5 : Requête émotionnelle si anxiété élevée ──
  const anxiety = S.clinicalProfile?.anxiety || 0;
  if (anxiety > 55 || protocol?.id === 'chirurgie') {
    queries.push({ query: 'anxiété intense sécurité protection calme intervention rapide hypnose', approach: 'hypnosis', topK: 3, label: 'anxiété' });
  }

  return queries.slice(0, 5); // max 5 en parallèle
}

// ── Fetch RAG universel ──
async function fetchRAG(userInput, protocol, phase) {
  if (!CFG.WORKER) return '';

  // Charger le catalogue si pas encore fait (lazy load)
  if (!RAG_CATALOG.loaded && !RAG_CATALOG.loading) {
    await loadRAGCatalog();
  }

  try {
    const queryDefs = buildRAGQueries(userInput, protocol, phase);

    // Requêtes parallèles — toutes filtrées approach:"hypnosis"
    const results = await Promise.allSettled(
      queryDefs.map(def => fetch(CFG.WORKER + '/search-library', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: def.query, approach: def.approach, topK: def.topK || 4 })
      }).then(r => r.ok ? r.json() : { results: [] }))
    );

    // ── Fusionner et dédupliquer ──
    const seen   = new Set();
    const chunks = [];
    for (const res of results) {
      if (res.status !== 'fulfilled') continue;
      for (const item of (res.value.results || [])) {
        const key = (item.book_title||'') + '|' + (item.page||'') + '|' + (item.content||'').substring(0, 70);
        if (!seen.has(key)) { seen.add(key); chunks.push(item); }
      }
    }
    if (!chunks.length) return '';

    // ── Tri par score sémantique ──
    chunks.sort((a, b) => (b.score || 0) - (a.score || 0));

    // ── Diversité : garantir représentation équilibrée des auteurs ──
    // Pas de hardcoding : on groupe par auteur depuis les chunks réels
    const byAuthor = {};
    for (const c of chunks) {
      const a = c.author || 'Inconnu';
      if (!byAuthor[a]) byAuthor[a] = [];
      byAuthor[a].push(c);
    }

    // Trier les auteurs par nombre de chunks dans la base (les plus riches d'abord)
    // On s'appuie sur RAG_CATALOG si chargé, sinon on utilise le count local
    const authorOrder = Object.keys(byAuthor).sort((a, b) => {
      const catA = RAG_CATALOG.books.find(bk => bk.author === a)?.chunks || byAuthor[a].length;
      const catB = RAG_CATALOG.books.find(bk => bk.author === b)?.chunks || byAuthor[b].length;
      return catB - catA; // auteurs avec plus de chunks d'abord
    });

    // Prendre max 3 chunks par auteur → assurer la diversité
    const balanced = [];
    const MAX_PER_AUTHOR = 3;
    const MAX_TOTAL = 12;
    for (const author of authorOrder) {
      const authorChunks = byAuthor[author]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, MAX_PER_AUTHOR);
      balanced.push(...authorChunks);
      if (balanced.length >= MAX_TOTAL) break;
    }
    // Re-tri final par score
    balanced.sort((a, b) => (b.score || 0) - (a.score || 0));
    const final = balanced.slice(0, 10);

    // ── Construire le bloc contexte ──
    const totalBooks = RAG_CATALOG.loaded
      ? `${RAG_CATALOG.books.length} ouvrages, ${RAG_CATALOG.totalChunks} chunks`
      : 'bibliothèque hypnose';

    let ctx = '\n═══ BIBLIOTHÈQUE HYPNOSE ═══\n';
    ctx += `(${totalBooks} — filtré approach:hypnosis)\n`;
    ctx += '(Intégrer naturellement dans le script — ne pas citer les sources)\n\n';

    final.forEach(item => {
      const author  = item.author   ? ` [${item.author}]`       : '';
      const page    = item.page     ? `, p.${item.page}`         : '';
      const score   = item.score    ? ` — score ${Math.round(item.score * 100)}%` : '';
      const content = (item.content || '').substring(0, 380).trim();
      ctx += `── ${item.book_title || 'Référence'}${page}${author}${score} ──\n${content}\n\n`;
    });

    const sourcesList = [...new Set(final.map(c => c.author || '?'))].join(', ');
    console.log(`[RAG] ✅ ${final.length} chunks | sources: ${sourcesList} | requêtes: ${queryDefs.map(q=>q.label).join(', ')}`);
    return ctx;

  } catch(e) {
    console.warn('[RAG] Erreur:', e.message);
    return '';
  }
}

// ── Mettre à jour les UIs depuis le catalogue chargé ──
function updateCollegeFromCatalog() {
  if (!RAG_CATALOG.loaded || !RAG_CATALOG.books.length) return;
  const books = RAG_CATALOG.books;
  const total = RAG_CATALOG.totalChunks;
  console.log(`[RAG Catalog] ✅ ${books.length} ouvrages hypnose — ${total} chunks`);

  const bookHTML = books.map(b => {
    const shortTitle = (b.book_title || '').substring(0, 42) + ((b.book_title||'').length > 42 ? '…' : '');
    return `<div style="font-size:9px;color:var(--text2);padding:2px 0;border-bottom:1px solid rgba(200,208,195,.1);line-height:1.4">
      <span style="color:var(--mer);font-weight:600">${b.author}</span>
      <span style="opacity:.7"> — ${b.chunks} chunks</span>
      <div style="opacity:.55;font-size:8px">${shortTitle}</div>
    </div>`;
  }).join('');
  const footerHTML = `<div style="font-size:9px;color:var(--mer);margin-top:5px;font-weight:700;text-align:center">
    ${books.length} ouvrages · ${total} chunks
  </div>`;

  // Mettre à jour les deux sidebars (séance + éventuellement entretien)
  ['rag-catalog-info', 'rag-catalog-info-e'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = bookHTML + footerHTML;
  });
  // Statut
  ['rag-catalog-status', 'rag-catalog-status-e'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '✅ ' + books.length + ' livres'; el.style.color = 'var(--mer)'; }
  });
}

// ═══════════════════════════════════════════════
// WEB-CONSULT — Recherche web filtrée + fiabilité
// Entité 3B : Le web comme consultant externe
// Hiérarchie : D1 (primaire) > LLM (training) > Web (conditionnel)
// ═══════════════════════════════════════════════

async function webConsult(query, domain) {
  const V = window.VARIANT;
  if (!V.webConsultEnabled) return null;
  if (!CFG.WORKER) return null;
  if (!query || query.trim().length < 5) return null;

  try {
    const resp = await fetch(CFG.WORKER + '/web-consult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.trim().substring(0, 250),
        domain: domain || V.webConsultDomain || 'hypnosis',
        sources: V.webConsultSources || ['pubmed', 'scholar', 'google_scholar'],
        language: 'fr',
        max_results: 3,
        caller: 'hypnose-ia'
      })
    });
    if (!resp.ok) {
      console.warn('[WebConsult] HTTP', resp.status);
      return null;
    }
    const data = await resp.json();
    console.log(`[WebConsult] ✅ ${data.results?.length || 0} résultats pour "${query.substring(0, 50)}"`);
    return data;
  } catch(e) {
    console.warn('[WebConsult]', e.message);
    return null;
  }
}

function buildWebConsultContext(results) {
  if (!results?.results?.length) return '';
  let ctx = '\n═══ CONSULTATION WEB (sources vérifiées) ═══\n';
  ctx += 'ATTENTION : ces informations proviennent du web. Fiabilité variable.\n';
  ctx += 'RÈGLE : utilise ces informations pour enrichir ton raisonnement clinique [CLINIQUE].\n';
  ctx += 'NE LES INJECTE PAS directement dans le [SCRIPT] sans les avoir validées contre tes connaissances.\n';
  ctx += 'Si une source a reliability "low" → ignore-la sauf si elle confirme d\'autres sources.\n\n';
  for (const r of results.results) {
    ctx += `── ${r.title} [${r.source}] (fiabilité: ${r.reliability}) ──\n`;
    if (r.date) ctx += `Date: ${r.date} | `;
    if (r.reliability_reason) ctx += `Raison: ${r.reliability_reason}`;
    ctx += '\n';
    ctx += `${r.snippet}\n`;
    if (r.url) ctx += `URL: ${r.url}\n`;
    ctx += '\n';
  }
  ctx += `(${results.meta?.returned || 0} résultats sur ${results.meta?.total_found || 0} trouvés — ${results.meta?.sources_consulted?.join(', ') || '?'})\n`;
  return ctx;
}

// ═══ WEB-CONSULT — ÉVALUATION PAR RAISONNEMENT LLM ═══
// Remplace detectRareCaseTrigger() + buildClinicalQuery() — zéro hardcoding
// Le LLM comprend le contexte : qui a la pathologie, si c'est actif, si c'est rare
// Coût : ~$0.0003 par appel Haiku, latence ~300-500ms
async function evaluateWebConsultNeed(userInput, context) {
  if (!window.VARIANT?.webConsultEnabled) return null;
  if (!window.VARIANT?.webConsultAutoTrigger) return null;
  if (!CFG.WORKER) return null;

  // Pré-filtre : messages trop courts = pas de signal clinique
  if ((userInput || '').trim().length < 30) return null;

  const systemLabel = context.system === 'hypnose' ? 'hypnothérapeutique (hypnose ericksonienne)' : 'thérapeutique';

  const prompt = `Tu es l'évaluateur web-consult d'un système ${systemLabel}.

CONTEXTE SÉANCE :
- Système : ${context.system}
- Phase : ${context.phase || 'entretien'}
- Protocole : ${context.protocol || 'non défini'}

DERNIER MESSAGE PATIENT :
"${(userInput || '').substring(0, 500)}"

MISSION : Décide si une recherche documentaire (PubMed/Scholar) apporterait une valeur clinique RÉELLE à cette séance.

RÈGLES DE RAISONNEMENT :
1. La pathologie/situation doit concerner LE PATIENT LUI-MÊME, pas un tiers (parent décédé, ex-partenaire, collègue = NE PAS déclencher)
2. La situation doit être ACTIVE et pertinente pour la séance en cours
3. Le cas doit être suffisamment RARE ou COMPLEXE pour que la littérature apporte quelque chose que le système ne sait pas déjà
4. Les cas standards (insomnie, tabac, stress, confiance, poids) = NE PAS déclencher
5. Une technique ou approche INCONNUE mentionnée par le patient = déclencher
6. Une demande explicite de références/littérature = déclencher

RÉPONSE — format strict JSON, rien d'autre :
{"decision":"SEARCH","query":"termes cliniques en anglais optimisés PubMed","reason":"1 phrase"}
ou
{"decision":"SKIP","reason":"1 phrase"}`;

  try {
    const resp = await fetch(CFG.WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          temperature: 0,
          system: prompt,
          messages: [{ role: 'user', content: 'Évalue ce message patient et retourne le JSON.' }]
        }
      })
    });
    if (!resp.ok) {
      console.warn('[WebConsult-LLM] HTTP', resp.status);
      return null;
    }
    const data = await resp.json();
    const rawText = (data.content?.[0]?.text || '').trim();
    const cleanText = rawText.replace(/```json\n?|```/g, '').trim();
    const parsed = JSON.parse(cleanText);

    if (parsed.decision === 'SEARCH' && parsed.query) {
      return { query: parsed.query, trigger: 'llm-reasoning', reason: parsed.reason || '' };
    }

    console.log(`[WebConsult-LLM] ⏭ SKIP: ${parsed.reason || 'pas de raison'}`);
    return null;

  } catch (e) {
    console.warn('[WebConsult-LLM] Erreur évaluation, fallback SKIP:', e.message);
    return null;
  }
}



// ═══════════════════════════════════════════════
// TTS HYPNOTIQUE — MOTEUR COMPLET
// ═══════════════════════════════════════════════
async function speakHypno(text) {
  const clean = text
    .replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1')
    .replace(/^#{1,6}\s+/gm,'').replace(/\[CLINIQUE\][\s\S]*?(?=\[SCRIPT\])/g,'')
    .replace(/\[SCRIPT\]/g,'').replace(/\[CLINIQUE\][\s\S]*/g,'')
    .replace(/<div[^>]*>|<\/div>/g,'').replace(/class="[^"]*"/g,'').trim();

  S.ttsPlaying = true; updateAudioDot('speaking');
  // Pause micro pendant la parole TTS — évite feedback et capture de la voix IA
  pauseMicForTTS_E();
  pauseMicForTTS_S();

  const vm = S.voiceMode;
  const vInfo = [...VOICES.google,...VOICES.openai,...VOICES.web].find(v=>v.id===vm);
  try {
    if (vInfo?.engine === 'openai') { await speakOpenAI(clean, vInfo); }
    else if (vInfo?.engine === 'google') { await speakGoogle(clean, vInfo); }
    else { await speakWebSpeech(clean); }
  } catch(e) {
    console.warn('[TTS fallback]', e?.message || e || 'erreur inconnue');
    await speakWebSpeech(clean);
  }

  S.ttsPlaying = false; updateAudioDot('silence');
  // Relancer le micro après la fin de la parole
  resumeMicAfterTTS_E();
  resumeMicAfterTTS_S();
}

async function speakOpenAI(text, vInfo) {
  // Pauses ... → segments avec silence (OpenAI TTS ne supporte pas SSML)
  const segs = text.split(/\.\.\./);
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i].trim();
    if (!seg) { await new Promise(r=>setTimeout(r, 2400)); continue; }
    // Proxy Cloudflare — pas de clé côté client
    const r = await fetch(CFG.OAI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-endpoint': '/v1/audio/speech' },
      body: JSON.stringify({ model:'tts-1-hd', voice:vInfo.oaiVoice, input:seg, speed:Math.max(0.25,Math.min(4,CFG.SPEED)) })
    });
    if (!r.ok) throw new Error('OpenAI TTS proxy ' + r.status);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    await playURL(url); URL.revokeObjectURL(url);
    if (i < segs.length-1) await new Promise(r=>setTimeout(r, 2400));
  }
}

async function speakGoogle(text, vInfo) {
  const ssml = text.replace(/\.\.\./g,'<break time="2500ms"/>');
  const hasSSML = ssml !== text;
  const isChirp = vInfo?.chirp;
  try {
    const body = {
      input: (hasSSML && !isChirp) ? {ssml:`<speak>${ssml}</speak>`} : {text},
      voice:{languageCode:'fr-FR',name:vInfo?.vName||'fr-FR-Neural2-D',...(!isChirp?{ssmlGender:vInfo?.gender||'MALE'}:{})},
      audioConfig:{audioEncoding:'MP3',speakingRate:CFG.SPEED,...(!isChirp?{pitch:-2}:{})}
    };
    // Proxy Cloudflare — clé Google stockée côté Worker
    const r = await fetch(CFG.GTTS_PROXY, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
    });
    if (!r.ok) throw new Error('Google TTS proxy ' + r.status);
    const d = await r.json();
    if (!d.audioContent) throw new Error('No audioContent');
    const blob = b64Blob(d.audioContent,'audio/mpeg');
    const url = URL.createObjectURL(blob);
    await playURL(url); URL.revokeObjectURL(url);
  } catch(e) { throw e; }
}

function b64Blob(b64,type){const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type});}
function playURL(url){return new Promise((res,rej)=>{const a=new Audio(url);S.ttsAudio=a;a.onended=()=>{S.ttsAudio=null;res()};a.onerror=e=>{S.ttsAudio=null;rej(e)};a.play().catch(rej);});}
function speakWebSpeech(text){return new Promise(res=>{if(!window.speechSynthesis){res();return;}
const segs=text.split(/\.\.\./);let i=0;
function next(){if(i>=segs.length){res();return;}const s=segs[i++].trim();if(!s){setTimeout(next,2500);return;}
const u=new SpeechSynthesisUtterance(s);u.lang='fr-FR';u.rate=CFG.SPEED;u.pitch=0.85;
const vs=window.speechSynthesis.getVoices();const fv=vs.find(v=>v.lang.startsWith('fr')&&v.name.toLowerCase().includes('thomas'))||vs.find(v=>v.lang.startsWith('fr'));
if(fv)u.voice=fv;u.onend=()=>setTimeout(next,i<segs.length?2500:0);window.speechSynthesis.speak(u);}next();});}
function stopTTS(){S.ttsAudio?.pause();window.speechSynthesis?.cancel();S.ttsPlaying=false;updateAudioDot('silence');}

// ═══════════════════════════════════════════════
// SPEECH RECOGNITION
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// RECONNAISSANCE VOCALE — calqué V7
// ═══════════════════════════════════════════════

// ── Entretien ──
// ═══════════════════════════════════════════════
// RECONNAISSANCE VOCALE — pattern V7
// new SpeechRecognition() UNIQUEMENT dans le handler clic
// Jamais au chargement de page / showScreen
// ═══════════════════════════════════════════════

function setupSpeechE() { /* no-op — init lazy via clic */ }
function setupSpeechS() { /* no-op — init lazy via clic */ }

// ── Entretien ──────────────────────────────────

function toggleMicE() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('btn-mic-e');

  if (!SR) { showToast('🎤 Reconnaissance vocale non disponible dans ce navigateur', 'error'); return; }
  if (window.location.protocol === 'file:') { showToast('🎤 Micro indisponible en file:// — utiliser LocalHost Launcher', 'error'); return; }

  S.micActiveE = !S.micActiveE;

  if (S.micActiveE) {
    btn.classList.add('active');
    S._bufE = '';

    if (S.recognitionE) { try { S.recognitionE.stop(); } catch(e) {} }
    S.recognitionE = new SR();
    S.recognitionE.lang = 'fr-FR';
    S.recognitionE.continuous = true;
    S.recognitionE.interimResults = true;

    S.recognitionE.onresult = (ev) => {
      if (S.ttsPlaying) return;
      let fin = '', intr = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) fin += t + ' '; else intr += t;
      }
      if (fin) {
        S._bufE += fin;
        // VAD — auto-envoi après 2.5s de silence
        startVADTimer();
      }
      const ta = document.getElementById('entretien-ta');
      if (ta) { ta.value = (S._bufE + intr).trim(); autoResize(ta); }
      updateAudioDot('listening');
      clearTimeout(S._silE);
      S._silE = setTimeout(() => { if (!S.ttsPlaying) updateAudioDot('silence'); }, 2000);
    };

    S.recognitionE.onerror = (ev) => {
      if (ev.error === 'not-allowed') {
        showToast('🎤 Permission micro refusée — autoriser dans le navigateur', 'error');
        S.micActiveE = false; btn.classList.remove('active');
      }
      if (ev.error !== 'no-speech') console.warn('[SpeechE]', ev.error);
    };

    S.recognitionE.onstart = () => { S._micERunning = true; };
    S.recognitionE.onend = () => {
      S._micERunning = false;
      if (S.micActiveE && !S.ttsPlaying) {
        setTimeout(() => startMicE(), 100); // petit délai anti-boucle rapide
      }
    };

    document.getElementById('entretien-ta').value = '';
    S._micERunning = false;
    try { S.recognitionE.start(); } catch(e) { console.warn('[SpeechE start]', e.message); }

  } else {
    btn.classList.remove('active');
    cancelVADTimer();
    stopMicE();
  }
}

function startMicE() {
  if (!S.micActiveE || !S.recognitionE || S.ttsPlaying) return;
  if (S._micERunning) return; // déjà en cours
  try {
    S._micERunning = true;
    S.recognitionE.start();
  } catch(e) {
    S._micERunning = false;
    if (e.name !== 'InvalidStateError') console.warn('[startMicE]', e.message);
  }
}

function stopMicE() {
  S.micActiveE = false;
  document.getElementById('btn-mic-e')?.classList.remove('active');
  if (S.recognitionE) { try { S.recognitionE.stop(); } catch(e) {} }
}

function pauseMicForTTS_E() {
  cancelVADTimer(); // annuler auto-envoi pendant que l'IA parle
  if (S.recognitionE && S.micActiveE) try { S.recognitionE.stop(); } catch(e) {}
}

function resumeMicAfterTTS_E() {
  if (!S.micActiveE) return;
  // Attendre que le TTS soit vraiment terminé (buffer audio)
  const tryResume = () => {
    if (S.ttsPlaying) { setTimeout(tryResume, 150); return; }
    S._bufE = '';
    const ta = document.getElementById('entretien-ta');
    if (ta) { ta.value = ''; autoResize(ta); }
    setTimeout(() => {
      if (S.micActiveE && !S.ttsPlaying) startMicE();
    }, 400);
  };
  setTimeout(tryResume, 200);
}

// ── Séance ─────────────────────────────────────

function toggleMicS() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('btn-mic-s');

  if (!SR) { showToast('🎤 Reconnaissance vocale non disponible dans ce navigateur', 'error'); return; }
  if (window.location.protocol === 'file:') { showToast('🎤 Micro indisponible en file:// — utiliser LocalHost Launcher', 'error'); return; }

  S.micActiveS = !S.micActiveS;

  if (S.micActiveS) {
    btn.classList.add('active');
    S._bufS = '';

    if (S.recognitionS) { try { S.recognitionS.stop(); } catch(e) {} }
    S.recognitionS = new SR();
    S.recognitionS.lang = 'fr-FR';
    S.recognitionS.continuous = true;
    S.recognitionS.interimResults = true;

    S.recognitionS.onresult = (ev) => {
      if (S.ttsPlaying) return;
      updateAudioDot('listening');
      let fin = '', intr = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) fin += t + ' '; else intr += t;
      }
      if (fin) S._bufS += fin;
      const ta = document.getElementById('seance-ta');
      if (ta) { ta.value = (S._bufS + intr).trim(); autoResize(ta); }
      clearTimeout(S._silS);
      S._silS = setTimeout(() => { if (!S.ttsPlaying) updateAudioDot('silence'); }, 2000);
    };

    S.recognitionS.onerror = (ev) => {
      if (ev.error === 'not-allowed') {
        showToast('🎤 Permission micro refusée', 'error');
        S.micActiveS = false; btn.classList.remove('active');
      }
      if (ev.error !== 'no-speech') console.warn('[SpeechS]', ev.error);
    };

    S.recognitionS.onend = () => {
      if (S.micActiveS && !S.ttsPlaying) {
        try { S.recognitionS.start(); } catch(e) {}
      }
    };

    document.getElementById('seance-ta').value = '';
    if (!S.ttsPlaying) try { S.recognitionS.start(); } catch(e) { console.warn('[SpeechS start]', e.message); }

  } else {
    btn.classList.remove('active');
    if (S.recognitionS) { try { S.recognitionS.stop(); } catch(e) {} }
    S.micActiveS = false;
  }
}

function pauseMicForTTS_S() {
  if (S.recognitionS && S.micActiveS) try { S.recognitionS.stop(); } catch(e) {}
}

function resumeMicAfterTTS_S() {
  if (S.micActiveS && S.recognitionS && !S.ttsPlaying) {
    setTimeout(() => { try { S.recognitionS.start(); } catch(e) {} }, 400);
  }
}

// ═══════════════════════════════════════════════
// MODULE CAMÉRA — CALIBRATION HYPNOTIQUE
// ═══════════════════════════════════════════════

// Couleurs émotions Ekman
const EMO_COLORS = {
  neutral:'#8FAFB1', happy:'#6abf69', sad:'#6a9fcf',
  angry:'#cf6a6a', fearful:'#cf9f6a', disgusted:'#9f6acf', surprised:'#cfcf6a'
};
const EMO_FR = {
  neutral:'Neutre', happy:'Détendu', sad:'Mélancolie',
  angry:'Tension', fearful:'Anxiété', disgusted:'Malaise', surprised:'Surprise'
};

// Buffer de détections pour scoring
let faceDetections = [];   // [{timestamp, emotion, expressions}]
let tranceBaseline = null; // baseline neutral mesuré à T0

async function startCamera() {
  const placeholder = document.getElementById('cam-placeholder');
  const video = document.getElementById('face-video');
  const btnToggle = document.getElementById('btn-cam-toggle');

  // Caméra impossible en file:// — nécessite HTTPS ou localhost
  if (window.location.protocol === 'file:') {
    placeholder.innerHTML = `<span class="cam-icon">🔒</span>
      <span style="font-size:10px;text-align:center;padding:0 8px">Caméra indisponible en local</span>
      <span style="font-size:9px;opacity:.5;text-align:center;padding:0 8px">Ouvrir via LocalHost Launcher<br>ou déployer sur GitHub Pages</span>`;
    document.getElementById('face-emotion').textContent = 'Nécessite HTTPS / localhost';
    return;
  }

  try {
    placeholder.innerHTML = '<span class="cam-icon">⏳</span><span style="font-size:10px">Chargement modèles...</span>';

    // Charger modèles face-api si pas encore fait
    if (!S.faceLoaded) {
      const M = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(M),
        faceapi.nets.faceExpressionNet.loadFromUri(M),
        faceapi.nets.faceLandmark68Net.loadFromUri(M),
      ]);
      S.faceLoaded = true;
    }

    // Obtenir flux caméra (vidéo uniquement, audio géré séparément)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width:{ideal:640}, height:{ideal:480}, facingMode:'user' },
      audio: true
    });
    S.mediaStream = stream;

    // Connecter au video element
    video.srcObject = stream;
    placeholder.style.display = 'none';
    video.style.display = 'block';
    btnToggle.textContent = 'Désactiver';

    video.onloadedmetadata = () => {
      document.getElementById('trance-panel').style.display = 'block';
      document.getElementById('emo-grid').style.display = 'grid';
      document.getElementById('face-dot').classList.add('on');
      document.getElementById('face-emotion').textContent = 'Analyse en cours...';

      // Démarrer boucle détection + audio
      startFaceLoop(video);
      if (typeof Meyda !== 'undefined') startMeyda(stream);

      // Calibration baseline après 5 secondes
      setTimeout(() => calibrateBaseline(), 5000);
    };

  } catch(e) {
    console.warn('[Camera]', e.message);
    placeholder.innerHTML = '<span class="cam-icon">🚫</span><span style="font-size:10px">Caméra non disponible</span><span style="font-size:9px;opacity:.5">' + e.message + '</span>';
    document.getElementById('face-emotion').textContent = 'Caméra indisponible';
    // speech init lazy via clic micro
  }
}

function toggleCamera() {
  const video = document.getElementById('face-video');
  if (video.style.display === 'block') {
    // Désactiver
    if (S.faceInterval) { clearInterval(S.faceInterval); S.faceInterval = null; }
    if (S.mediaStream) { S.mediaStream.getTracks().forEach(t=>t.stop()); S.mediaStream = null; }
    video.style.display = 'none';
    video.srcObject = null;
    document.getElementById('cam-placeholder').style.display = 'flex';
    document.getElementById('btn-cam-toggle').textContent = 'Activer';
    document.getElementById('face-dot').classList.remove('on','warn');
    document.getElementById('trance-panel').style.display = 'none';
    document.getElementById('emo-grid').style.display = 'none';
    faceDetections = [];
  } else {
    startCamera();
  }
}

function startFaceLoop(vid) {
  if (S.faceInterval) clearInterval(S.faceInterval);
  S.faceInterval = setInterval(async () => {
    try {
      if (vid.readyState !== 4) return;
      const det = await faceapi
        .detectSingleFace(vid, new faceapi.TinyFaceDetectorOptions({inputSize:224, scoreThreshold:0.5}))
        .withFaceLandmarks()
        .withFaceExpressions();

      if (det) {
        document.getElementById('face-dot').classList.add('on');
        document.getElementById('face-dot').classList.remove('warn');
        const ex = det.expressions;

        // Stocker détection
        const maxE = Object.entries(ex).sort((a,b)=>b[1]-a[1])[0];
        faceDetections.push({ timestamp: Date.now(), emotion: maxE[0], expressions: {...ex} });
        if (faceDetections.length > 200) faceDetections.shift(); // buffer 200 frames ~100s

        // Afficher émotion dominante
        document.getElementById('face-emotion').textContent =
          (EMO_FR[maxE[0]] || maxE[0]) + ' ' + (maxE[1]*100).toFixed(0) + '%';

        // Calcul score de transe hypnotique
        computeTrancScore(ex);

        // Mini-grid émotions
        updateEmoGrid(ex);

        // Auto-ajustement profondeur
        const tension = (ex.angry||0) + (ex.fearful||0) + (ex.sad||0);
        if (['induction','deepening','work'].includes(S.phase)) {
          if (S.relaxScore > 0.75 && S.depth < 8) setDepth(S.depth + 0.06);
          else if (tension > 0.45 && S.depth > 2) {
            setDepth(S.depth - 0.1);
            if (tension > 0.65) triggerAnchor();
          }
        }
      } else {
        // Pas de visage
        document.getElementById('face-dot').classList.remove('on');
        document.getElementById('face-dot').classList.add('warn');
        document.getElementById('face-emotion').textContent = '⚠️ Visage non détecté';
        updateTrancDisplay(0, 'Hors cadre');
      }
    } catch(e) { /* silencieux */ }
  }, 500); // 2 FPS — équilibre perf/précision
}

function calibrateBaseline() {
  // Mesurer neutral baseline sur les 10 premières détections
  if (faceDetections.length < 5) return;
  const recent = faceDetections.slice(0, 10);
  const neutralAvg = recent.reduce((a,d) => a + (d.expressions.neutral||0), 0) / recent.length;
  tranceBaseline = neutralAvg;
  addMsgS('system', `📷 Calibration baseline : neutral ${(neutralAvg*100).toFixed(0)}% — L'analyse de transe est calibrée.`);
}

function computeTrancScore(ex) {
  // Score de transe = f(neutral élevé + happy + absence tension + absence surprise)
  // Érickson : transe = neutral/calme, pas d'expression active
  const neutral = ex.neutral || 0;
  const happy   = ex.happy   || 0;
  const tension = (ex.angry||0) + (ex.fearful||0) + (ex.disgusted||0);
  const arousal = (ex.surprised||0);
  const sad     = ex.sad     || 0;

  // Formule calibrée hypnose : neutral fort + happy doux - tension - arousal
  let raw = neutral * 0.55 + happy * 0.25 - tension * 0.8 - arousal * 0.4 - sad * 0.1;
  S.relaxScore = Math.max(0, Math.min(1, raw));

  // Ajuster par rapport à la baseline si disponible
  let tranceScore = S.relaxScore;
  if (tranceBaseline !== null && tranceBaseline > 0.1) {
    // Score relatif : combien au-delà de la baseline
    const relative = (neutral - tranceBaseline) / (1 - tranceBaseline);
    tranceScore = Math.max(0, Math.min(1, S.relaxScore * 0.6 + Math.max(0, relative) * 0.4));
  }

  // Déterminer état
  let state, cssClass;
  if (tranceScore > 0.80) { state = '🌊 Transe profonde'; cssClass = 'deep'; }
  else if (tranceScore > 0.60) { state = '🌿 Transe légère'; cssClass = 'medium'; }
  else if (tranceScore > 0.40) { state = '😌 Relaxation'; cssClass = 'light'; }
  else if (tranceScore > 0.20) { state = '👁️ Éveil partiel'; cssClass = ''; }
  else { state = '💃 Éveil — " dans la samba "'; cssClass = ''; }

  updateTrancDisplay(tranceScore, state, cssClass);
}

function updateTrancDisplay(score, state, cssClass='') {
  const pct = Math.round(score * 100);
  document.getElementById('trance-pct').textContent = pct + '%';
  const fill = document.getElementById('trance-fill');
  fill.style.width = pct + '%';
  fill.className = 'trance-fill' + (cssClass ? ' ' + cssClass : '');
  document.getElementById('trance-state').textContent = state;
}

function updateEmoGrid(ex) {
  const grid = document.getElementById('emo-grid');
  const emotions = ['neutral','happy','sad','angry','fearful','disgusted','surprised'];
  grid.innerHTML = emotions.map(e => {
    const pct = Math.round((ex[e]||0)*100);
    return `<div class="emo-row">
      <div class="emo-name">${EMO_FR[e]||e}</div>
      <div class="emo-mini-bar"><div class="emo-mini-fill" style="width:${pct}%;background:${EMO_COLORS[e]||'#8FAFB1'}"></div></div>
      <div class="emo-pct">${pct}%</div>
    </div>`;
  }).join('');
}

// Contexte caméra pour injection dans le prompt IA
function buildCameraContext() {
  if (!faceDetections.length) return '';
  const recent = faceDetections.slice(-20); // 10 dernières secondes
  const avgEx = {};
  const emoKeys = ['neutral','happy','sad','angry','fearful','disgusted','surprised'];
  emoKeys.forEach(e => {
    avgEx[e] = recent.reduce((a,d)=>(a + (d.expressions[e]||0)),0) / recent.length;
  });
  const dominant = Object.entries(avgEx).sort((a,b)=>b[1]-a[1])[0];
  const neutralRatio = avgEx.neutral;
  const tension = avgEx.angry + avgEx.fearful + avgEx.disgusted;
  const tranceScore = S.relaxScore;

  let tranceText;
  if (tranceScore > 0.80) tranceText = 'transe profonde confirmée';
  else if (tranceScore > 0.60) tranceText = 'transe légère';
  else if (tranceScore > 0.40) tranceText = 'relaxation superficielle';
  else if (tranceScore > 0.20) tranceText = 'éveil partiel — revenir vers l\'intérieur';
  else tranceText = 'patient éveillé / non hypnotisé — approfondissement nécessaire';

  return `\n\n[ANALYSE FACIALE TEMPS RÉEL]
• État hypnotique estimé : ${tranceText} (score ${(tranceScore*100).toFixed(0)}%)
• Émotion dominante : ${EMO_FR[dominant[0]]||dominant[0]} (${(dominant[1]*100).toFixed(0)}%)
• Neutral (indicateur transe) : ${(neutralRatio*100).toFixed(0)}%
• Tension faciale : ${(tension*100).toFixed(0)}%${tension > 0.3 ? ' ⚠️ tension élevée' : ''}
${tranceBaseline !== null ? '• Baseline calibrée : ' + (tranceBaseline*100).toFixed(0) + '% neutral' : ''}
RÈGLE : Ces données sont INDICATIVES. Formule les observations en hypothèses ouvertes, jamais en affirmations. Si tension élevée : insère segment sécurisant. Si éveil confirmé : relance l'induction.`;
}

let anchorLock = false;
function triggerAnchor(){
  if(anchorLock)return;
  anchorLock=true;
  setTimeout(()=>anchorLock=false,25000);
  generateHypnoScript('Tension faciale détectée — insère segment sécurisant et ancrage doux, naturellement dans le flux.');
}

// Compatibilité avec ancien code
async function initFaceApi() {
  // Désormais démarré manuellement via startCamera()
  // Speech init via clic micro uniquement (V7 pattern)
}

let meydaA=null,audioCtxM=null;
function startMeyda(stream){
  if(typeof Meyda==='undefined')return;
  try{
    audioCtxM=new(window.AudioContext||window.webkitAudioContext)();
    const src=audioCtxM.createMediaStreamSource(stream);
    meydaA=Meyda.createMeydaAnalyzer({audioContext:audioCtxM,source:src,bufferSize:2048,featureExtractors:['rms','energy'],callback:f=>{if(!S.ttsPlaying&&(f.rms||0)>.02)updateAudioDot('listening');else if(!S.ttsPlaying)updateAudioDot('silence');}});
    meydaA.start();
  }catch(e){}
}
function stopMeyda(){meydaA?.stop();meydaA=null;audioCtxM?.close();audioCtxM=null;}

function updateAudioDot(status){
  const dot=document.getElementById('audio-dot');const txt=document.getElementById('audio-txt');
  dot.className='audio-dot'+(status!=='silence'?' '+status:'');
  txt.textContent={silence:'Silence',listening:'Vous parlez',speaking:'IA parle'}[status]||status;
}

// ═══════════════════════════════════════════════
// BINAURAL
// ═══════════════════════════════════════════════
function startBinaural(){
  try{
    if(S.binCtx)stopBinaural();
    S.binCtx=new(window.AudioContext||window.webkitAudioContext)();
    const ctx=S.binCtx,merger=ctx.createChannelMerger(2);
    [200,206].forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=f;g.gain.value=.045;o.connect(g);g.connect(merger,0,i);o.start();if(i===0)S.oscL=o;else S.oscR=o;});
    merger.connect(ctx.destination);
    document.getElementById('bin-freq').textContent='200 Hz / 206 Hz — 6 Hz θ';
  }catch(e){console.warn('[Binaural]',e);}
}
function stopBinaural(){try{S.oscL?.stop();S.oscR?.stop();S.binCtx?.close();}catch(e){}S.binCtx=S.oscL=S.oscR=null;}
function toggleBinaural(el){el.classList.toggle('on');S.binauralOn=el.classList.contains('on');if(S.binauralOn)startBinaural();else stopBinaural();}
function syncBinauralSw(){const el=document.getElementById('binaural-sw');S.binauralOn?el.classList.add('on'):el.classList.remove('on');}

// ═══════════════════════════════════════════════
// MODULE VAKOG SENSORIEL
// Visuel · Auditif (banque sons) · Kinesthésique · Olfactif
// ═══════════════════════════════════════════════

// ── Mise à jour affichage VAKOG dans sidebar séance ──
function updateVakogSidebar() {
  const vak = S.clinicalProfile?.vakog || {v:0,a:0,k:0,og:0};
  const total = (vak.v+vak.a+vak.k+vak.og) || 1;
  const pct = x => Math.round(x/total*100);
  const dom = Object.entries({v:vak.v,a:vak.a,k:vak.k,og:vak.og}).sort((a,b)=>b[1]-a[1]);

  [['v','vakog-v-pct'],['a','vakog-a-pct'],['k','vakog-k-pct'],['og','vakog-og-pct']].forEach(([key,id])=>{
    const el = document.getElementById(id);
    if (el) el.textContent = vak[key] > 0 ? pct(vak[key])+'%' : '—';
  });

  // Mettre en évidence le canal dominant
  ['v','a','k','og'].forEach(c => {
    const btn = document.getElementById(`vakog-${c}-btn`);
    if (btn) btn.classList.toggle('active', dom[0][0] === c && dom[0][1] > 0);
  });

  // Auto-ouvrir le sous-menu du canal dominant si > 40%
  if (dom[0][1] > 0 && pct(dom[0][1]) >= 40) {
    const sub = document.getElementById(`vakog-${dom[0][0]}-sub`);
    if (sub) sub.classList.add('open');
  }
}

function toggleVakogCanal(canal) {
  const sub = document.getElementById(`vakog-${canal}-sub`);
  if (sub) sub.classList.toggle('open');
}

// ── VISUEL — effets sur le canvas et overlay ──
let visualFX = null;
function triggerVisual(fx) {
  if (visualFX === fx) { clearVisualFX(); return; }
  clearVisualFX();
  visualFX = fx;

  document.querySelectorAll('#vakog-v-sub .vakog-sub-btn').forEach(b => b.classList.remove('playing'));
  const fxBtns = {'spiral-color':'snd-rain','breath-circle':'snd-bowl','light-pulse':'snd-stop'};

  const overlay = document.getElementById('vakog-visual-overlay');

  if (fx === 'spiral-color') {
    // Le canvas spiral change de couleur selon profondeur
    S.spiralColorFX = true;
    showToast('🌀 Spiral colorée — profondeur adaptée', 'success');
    document.querySelector('[onclick="triggerVisual(\'spiral-color\')"]')?.classList.add('playing');
  }
  else if (fx === 'breath-circle') {
    // Cercle respiratoire sur l'overlay (inspire 4s / expire 6s)
    S.breathCircleActive = true;
    startBreathCircle();
    document.querySelector('[onclick="triggerVisual(\'breath-circle\')"]')?.classList.add('playing');
    showToast('⭕ Cercle respiratoire — inspire 4s / expire 6s', 'success');
  }
  else if (fx === 'light-pulse') {
    // Flash lumineux doux synchronisé aux ... du script
    S.lightPulseActive = true;
    overlay.style.background = 'radial-gradient(circle, rgba(143,175,177,.12) 0%, transparent 70%)';
    overlay.style.opacity = '1';
    startLightPulse();
    document.querySelector('[onclick="triggerVisual(\'light-pulse\')"]')?.classList.add('playing');
  }
}

function clearVisualFX() {
  visualFX = null;
  S.spiralColorFX = false;
  S.breathCircleActive = false;
  S.lightPulseActive = false;
  const overlay = document.getElementById('vakog-visual-overlay');
  if (overlay) { overlay.style.opacity = '0'; overlay.innerHTML = ''; }
  document.querySelectorAll('#vakog-v-sub .vakog-sub-btn').forEach(b => b.classList.remove('playing'));
  if (S._breathInterval) { clearInterval(S._breathInterval); S._breathInterval = null; }
  if (S._pulseInterval) { clearInterval(S._pulseInterval); S._pulseInterval = null; }
}

function startBreathCircle() {
  const overlay = document.getElementById('vakog-visual-overlay');
  overlay.innerHTML = `
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none">
      <svg id="breath-svg" width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="30" fill="none" stroke="rgba(143,175,177,.3)" stroke-width="2"/>
        <circle cx="80" cy="80" r="30" fill="none" stroke="rgba(143,175,177,.7)" stroke-width="3"
          id="breath-circle" style="transform-origin:80px 80px;transition:all 4s ease-in-out"/>
      </svg>
      <div id="breath-label" style="color:rgba(200,208,195,.6);font-size:12px;margin-top:8px;letter-spacing:2px">Inspirez...</div>
    </div>`;
  overlay.style.opacity = '1';

  let phase = 'in';
  const circle = document.getElementById('breath-circle');
  const label = document.getElementById('breath-label');

  function step() {
    if (!S.breathCircleActive) return;
    if (phase === 'in') {
      circle.setAttribute('r', '65');
      circle.style.transition = 'r 4s ease-in-out';
      circle.style.stroke = 'rgba(143,175,177,.9)';
      if (label) label.textContent = 'Inspirez...';
      phase = 'out';
      S._breathInterval = setTimeout(step, 4200);
    } else {
      circle.setAttribute('r', '28');
      circle.style.transition = 'r 6s ease-in-out';
      circle.style.stroke = 'rgba(143,175,177,.4)';
      if (label) label.textContent = 'Expirez...';
      phase = 'in';
      S._breathInterval = setTimeout(step, 6200);
    }
  }
  step();
}

function startLightPulse() {
  const overlay = document.getElementById('vakog-visual-overlay');
  let dir = 1, val = 0;
  S._pulseInterval = setInterval(() => {
    if (!S.lightPulseActive) { clearInterval(S._pulseInterval); overlay.style.opacity='0'; return; }
    val += dir * 0.008;
    if (val >= 0.6) dir = -1;
    if (val <= 0) { dir = 1; val = 0; }
    overlay.style.background = `radial-gradient(circle at 50% 35%, rgba(143,175,177,${val.toFixed(3)}) 0%, transparent 65%)`;
    overlay.style.opacity = '1';
  }, 50);
}

// ── AUDITIF — banque de sons hypnotiques ──
const HYPNO_SOUNDS = {
  // Sons libres de droits — sources variées freesound/archive/pixabay compatibles
  rain:   { label:'Pluie douce',      url:'https://assets.mixkit.co/sfx/preview/mixkit-light-rain-loop-2393.mp3',  loop:true },
  bowl:   { label:'Bol tibétain',     url:'https://assets.mixkit.co/sfx/preview/mixkit-tibetan-bowl-sound-2519.mp3', loop:true },
  ocean:  { label:'Vagues océan',     url:'https://assets.mixkit.co/sfx/preview/mixkit-ocean-waves-loop-1196.mp3', loop:true },
  forest: { label:'Forêt',            url:'https://assets.mixkit.co/sfx/preview/mixkit-forest-birds-ambience-1210.mp3', loop:true },
  fire:   { label:'Feu crépitant',    url:'https://assets.mixkit.co/sfx/preview/mixkit-campfire-crackles-1330.mp3', loop:true },
};

let hypnoSoundEl = null;
let currentSoundId = null;

function playHypnoSound(id) {
  if (currentSoundId === id) { stopHypnoSound(); return; }
  stopHypnoSound();

  const snd = HYPNO_SOUNDS[id];
  if (!snd) return;

  hypnoSoundEl = new Audio(snd.url);
  hypnoSoundEl.loop = snd.loop;
  hypnoSoundEl.volume = 0.35; // discret — ne pas couvrir TTS
  hypnoSoundEl.play().then(() => {
    currentSoundId = id;
    document.querySelectorAll('#vakog-a-sub .vakog-sub-btn').forEach(b => b.classList.remove('playing'));
    document.getElementById(`snd-${id}`)?.classList.add('playing');
    showToast(`🎵 ${snd.label}`, 'success');
  }).catch(e => {
    console.warn('[Son hypnotique]', e.message);
    showToast('⚠️ Son non chargé — vérifier la connexion', 'error');
    hypnoSoundEl = null;
  });
}

function stopHypnoSound() {
  if (hypnoSoundEl) { hypnoSoundEl.pause(); hypnoSoundEl.src = ''; hypnoSoundEl = null; }
  currentSoundId = null;
  document.querySelectorAll('#vakog-a-sub .vakog-sub-btn').forEach(b => b.classList.remove('playing'));
}

// Baisser le son hypnotique pendant TTS, relever après
function duckHypnoSound(duck = true) {
  if (!hypnoSoundEl) return;
  hypnoSoundEl.volume = duck ? 0.07 : 0.35;
}

// ── KINESTHÉSIQUE — suggestions corporelles ──
const KINO_SUGGESTIONS = {
  mains:      { txt: 'Sentez le poids de vos mains... posées sur vos cuisses... chaudes et lourdes...', inject: 'Invite le patient à sentir ses mains posées sur ses cuisses, lourdes, chaudes, le contact du tissu.' },
  respiration:{ txt: 'Votre ventre se gonfle doucement... et se relâche... à chaque souffle...', inject: 'Guide la respiration abdominale, lente, profonde, ventre qui se gonfle et se relâche.' },
  lourdeur:   { txt: 'Une lourdeur agréable descend dans vos bras... dans vos jambes... tout votre corps s\'alourdit...', inject: 'Suggère la lourdeur progressive dans les membres, technique Schultz.' },
  chaleur:    { txt: 'Une chaleur douce commence à irradier... de votre centre... vers vos extrémités...', inject: 'Diffuse la sensation de chaleur depuis le centre du corps, training autogène.' },
  gravite:    { txt: 'La gravité vous tient... bienveillante... vous ancre... profondément dans ce siège...', inject: 'Utilise la gravité comme ancrage, présence corporelle totale, Roustang.' },
  flottement: { txt: 'À présent... une légèreté... comme si votre corps ne pesait plus rien... flottant...', inject: 'Transition vers la légèreté et le flottement dissociatif.' },
};

let kinoTimeout = null;

function injectKino(type) {
  const k = KINO_SUGGESTIONS[type];
  if (!k) return;

  // Afficher suggestion visuelle sur écran patient
  const el = document.getElementById('vakog-kino-txt');
  if (el) {
    el.textContent = k.txt;
    el.classList.add('show');
    clearTimeout(kinoTimeout);
    kinoTimeout = setTimeout(() => el.classList.remove('show'), 8000);
  }

  // Injecter dans le prochain prompt IA
  S._kinoInject = k.inject;
  showToast('🤲 Suggestion corporelle envoyée', 'success');

  document.querySelectorAll('#vakog-k-sub .vakog-sub-btn').forEach(b => b.classList.remove('playing'));
  const btns = document.querySelectorAll(`#vakog-k-sub .vakog-sub-btn`);
  const types = ['mains','respiration','lourdeur','chaleur','gravite','flottement'];
  const idx = types.indexOf(type);
  if (btns[idx]) { btns[idx].classList.add('playing'); setTimeout(()=>btns[idx].classList.remove('playing'), 3000); }
}

// ── OLFACTIF — suggestion verbale injectée ──
const OLFACTIF_INJECT = {
  lavande: 'Évoque une odeur de lavande apaisante qui enveloppe le patient, ancre olfactive de sécurité.',
  ocean:   'Évoque les embruns marins frais, l\'air iodé de l\'océan, espace et liberté.',
  foret:   'Évoque l\'odeur de résine, de pin, de terre humide après la pluie, ancrage naturel.',
};

function injectOlfactif(type) {
  const inj = OLFACTIF_INJECT[type];
  if (!inj) return;
  S._kinoInject = inj; // réutilise le même canal d'injection prompt
  showToast('👃 Ancre olfactive activée', 'success');
}

// ── Intégration dans speakHypno : duck le son pendant TTS ──
// (appelé depuis speakHypno — déjà patché via pauseMicForTTS)
const _origSpeakHypno = speakHypno;
// Duck/unduck géré via les hooks pause/resume TTS

// ── Enrichissement buildHypnoSystemPrompt avec injection kino ──
function getKinoBlock() {
  if (!S._kinoInject) return '';
  const block = `\nSUGGESTION CORPORELLE ACTIVE : ${S._kinoInject}\nIntègre cette sensation dans le script maintenant.\n`;
  S._kinoInject = null; // consommer une seule fois
  return block;
}

// ── Init VAKOG sidebar au démarrage séance ──
function initVakogSidebar() {
  updateVakogSidebar();
  // Si canal dominant kinesthésique → ouvrir auto
  const vak = S.clinicalProfile?.vakog || {v:0,a:0,k:0,og:0};
  const total = (vak.v+vak.a+vak.k+vak.og)||1;
  const dom = Object.entries(vak).sort((a,b)=>b[1]-a[1])[0];
  if (dom && vak[dom[0]]/total >= 0.4) {
    document.getElementById(`vakog-${dom[0]}-sub`)?.classList.add('open');
  }
}
function adjBinauralForPhase(phase){
  if(!S.oscR||!S.binCtx)return;
  const fm={prep:206,induction:205,deepening:204,work:203,return:205,anchor:206};
  const t=fm[phase]||206;S.oscR.frequency.setTargetAtTime(t,S.binCtx.currentTime,2);
  document.getElementById('bin-freq').textContent=`200 Hz / ${t} Hz — ${t-200} Hz`;
}

// ═══════════════════════════════════════════════════════════════
// MODULE OUTILS THÉRAPEUTIQUES — Pilotés par arbre de décision
// Le patient est PASSIF. Le thérapeute (système) DÉCIDE.
// ═══════════════════════════════════════════════════════════════

// ── État des outils ──
const TOOLS = {
  coherence:   { active: false, timer: null, rhythm: null, phase: null },
  bodyscan:    { active: false, zone: null },
  safespace:   { active: false, env: null },
  metronome:   { active: false, timer: null, speed: 1.0 },
  binaural:    { adapted: false },
};

// ══════════════════════════════════════════════════
// 1. COHÉRENCE CARDIAQUE — type RespiRelax
// ══════════════════════════════════════════════════
const BREATH_RHYTHMS = {
  'coherence-5-5':  { label: 'Coherence 5/5',     inhale: 5, hold: 0, exhale: 5, holdOut: 0, bpm: 6,  use: 'standard' },
  'relax-4-6':      { label: 'Relaxant 4/6',       inhale: 4, hold: 0, exhale: 6, holdOut: 0, bpm: 6,  use: 'relaxation' },
  'sleep-4-7-8':    { label: 'Sommeil 4-7-8',      inhale: 4, hold: 7, exhale: 8, holdOut: 0, bpm: 3,  use: 'sommeil' },
  'anti-panic-3-6': { label: 'Anti-panique 3/6',   inhale: 3, hold: 0, exhale: 6, holdOut: 0, bpm: 7,  use: 'urgence' },
  'square-4-4-4-4': { label: 'Carree 4-4-4-4',    inhale: 4, hold: 4, exhale: 4, holdOut: 4, bpm: 4,  use: 'ancrage' },
};

function startCoherence(rhythmId, durationSec) {
  const rhythm = BREATH_RHYTHMS[rhythmId || 'coherence-5-5'];
  if (!rhythm) return;
  stopCoherence();
  TOOLS.coherence.active = true;
  TOOLS.coherence.rhythm = rhythm;

  const overlay = document.getElementById('vakog-visual-overlay');
  if (!overlay) return;

  const totalCycle = rhythm.inhale + rhythm.hold + rhythm.exhale + rhythm.holdOut;
  let elapsed = 0;
  let cycles = 0;

  // Créer le SVG de cohérence cardiaque
  overlay.innerHTML = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
      <svg viewBox="0 0 200 200" width="160" height="160" style="filter:drop-shadow(0 0 20px rgba(143,175,177,.3))">
        <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(143,175,177,.15)" stroke-width="1"/>
        <circle id="coherence-bubble" cx="100" cy="100" r="20" fill="rgba(143,175,177,.25)" stroke="rgba(143,175,177,.5)" stroke-width="1.5" style="transition:r ${rhythm.inhale}s ease-in-out"/>
      </svg>
      <div id="coherence-label" style="color:rgba(200,208,195,.7);font-size:13px;font-family:'Cormorant Garamond',serif;font-style:italic;margin-top:12px;letter-spacing:1px">Inspirez...</div>
      <div id="coherence-timer" style="color:rgba(143,175,177,.4);font-size:10px;margin-top:6px;font-variant-numeric:tabular-nums"></div>
    </div>`;
  overlay.style.opacity = '1';

  const bubble = document.getElementById('coherence-bubble');
  const label = document.getElementById('coherence-label');
  const timerEl = document.getElementById('coherence-timer');

  // Créer un son doux pour les transitions (oscillateur pur, très court)
  let audioCtx = null;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}

  function playTick() {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 528; // fréquence Solfège — doux
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch(e) {}
  }

  function breathCycle() {
    if (!TOOLS.coherence.active) return;
    const cyclePos = elapsed % totalCycle;

    if (cyclePos < rhythm.inhale) {
      // INSPIRE
      if (cyclePos === 0) {
        playTick();
        bubble?.setAttribute('r', '55');
        if (label) label.textContent = 'Inspirez...';
      }
    } else if (cyclePos < rhythm.inhale + rhythm.hold) {
      // RÉTENTION
      if (cyclePos === rhythm.inhale) {
        if (label) label.textContent = 'Retenez...';
      }
    } else if (cyclePos < rhythm.inhale + rhythm.hold + rhythm.exhale) {
      // EXPIRE
      if (cyclePos === rhythm.inhale + rhythm.hold) {
        playTick();
        bubble?.setAttribute('r', '20');
        bubble.style.transition = `r ${rhythm.exhale}s ease-in-out`;
        if (label) label.textContent = 'Expirez...';
      }
    } else {
      // PAUSE BASSE
      if (cyclePos === rhythm.inhale + rhythm.hold + rhythm.exhale) {
        if (label) label.textContent = 'Pause...';
      }
    }

    if (cyclePos === 0 && elapsed > 0) {
      cycles++;
      bubble.style.transition = `r ${rhythm.inhale}s ease-in-out`;
    }

    elapsed++;
    const remaining = (durationSec || 180) - elapsed;
    if (timerEl) timerEl.textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    if (remaining <= 0) { stopCoherence(); return; }

    TOOLS.coherence.timer = setTimeout(breathCycle, 1000);
  }

  breathCycle();
  console.log(`[Outils] ✅ Coherence cardiaque: ${rhythm.label} — ${durationSec||180}s`);
}

function stopCoherence() {
  TOOLS.coherence.active = false;
  if (TOOLS.coherence.timer) { clearTimeout(TOOLS.coherence.timer); TOOLS.coherence.timer = null; }
  const overlay = document.getElementById('vakog-visual-overlay');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(() => { if (!TOOLS.coherence.active) overlay.innerHTML = ''; }, 1500); }
}

// ══════════════════════════════════════════════════
// 2. BINAURAL ADAPTATIF — évolue selon la phase
// ══════════════════════════════════════════════════
const BINAURAL_PROFILES = {
  prep:      { base: 200, beat: 10, label: 'α 10 Hz — éveil calme' },       // alpha
  induction: { base: 200, beat: 8,  label: 'α 8 Hz — relaxation' },         // low alpha
  deepening: { base: 200, beat: 5,  label: 'θ 5 Hz — transe légère' },      // theta
  work:      { base: 200, beat: 4,  label: 'θ 4 Hz — transe profonde' },    // deep theta
  return:    { base: 200, beat: 8,  label: 'α 8 Hz — remontée' },           // alpha
  anchor:    { base: 200, beat: 10, label: 'α 10 Hz — ancrage conscient' }, // alpha
};

function adaptBinaural(phase) {
  const profile = BINAURAL_PROFILES[phase];
  if (!profile || !S.oscR || !S.binCtx) return;
  const targetFreq = profile.base + profile.beat;
  S.oscR.frequency.setTargetAtTime(targetFreq, S.binCtx.currentTime, 3); // transition 3s
  document.getElementById('bin-freq').textContent = `${profile.base} Hz / ${targetFreq} Hz — ${profile.label}`;
  TOOLS.binaural.adapted = true;
  console.log(`[Outils] Binaural adapté: ${profile.label}`);
}

// ══════════════════════════════════════════════════
// 3. LIEU SÛR VISUEL — environnements immersifs CSS
// ══════════════════════════════════════════════════
const SAFE_SPACES = {
  plage:    { label: 'Plage au coucher de soleil', bg: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 20%, #0f3460 40%, #e94560 55%, #f5a623 65%, #c9a96e 80%, #d4c5a9 100%)', sound: 'ocean' },
  foret:    { label: 'Forêt profonde',             bg: 'linear-gradient(180deg, #0d1117 0%, #1a2a1a 25%, #2d4a2d 50%, #1e3a1e 75%, #0d1f0d 100%)', sound: 'forest' },
  montagne: { label: 'Sommet de montagne',         bg: 'linear-gradient(180deg, #1a1a3e 0%, #2d3a5e 25%, #6a8b8d 50%, #c8d0c3 75%, #e6d7c3 100%)', sound: 'rain' },
  nuit:     { label: 'Nuit étoilée',               bg: 'linear-gradient(180deg, #0a0a1a 0%, #0d0d2e 40%, #1a1a3e 70%, #0d0d1e 100%)', sound: null },
  jardin:   { label: 'Jardin secret',              bg: 'linear-gradient(180deg, #1e3a2a 0%, #2d5a3d 30%, #4a8a5a 50%, #6aaa6a 70%, #3a7a4a 100%)', sound: 'forest' },
};

function activateSafeSpace(envId) {
  const env = SAFE_SPACES[envId || 'plage'];
  if (!env) return;
  stopSafeSpace();
  TOOLS.safespace.active = true;
  TOOLS.safespace.env = envId;

  const overlay = document.getElementById('vakog-visual-overlay');
  if (overlay) {
    overlay.style.background = env.bg;
    overlay.style.opacity = '0.6';
    overlay.innerHTML = envId === 'nuit'
      ? '<div style="position:absolute;inset:0;overflow:hidden">' + Array.from({length:40}, () =>
          `<div style="position:absolute;width:2px;height:2px;background:white;border-radius:50%;top:${Math.random()*100}%;left:${Math.random()*100}%;opacity:${0.3+Math.random()*0.7};animation:twinkle ${2+Math.random()*4}s infinite"></div>`
        ).join('') + '</div>'
      : '';
  }
  if (env.sound) playHypnoSound(env.sound);
  console.log(`[Outils] ✅ Lieu sûr: ${env.label}`);
}

function stopSafeSpace() {
  TOOLS.safespace.active = false;
  const overlay = document.getElementById('vakog-visual-overlay');
  if (overlay) { overlay.style.opacity = '0'; overlay.style.background = ''; overlay.innerHTML = ''; }
}

// ══════════════════════════════════════════════════
// 4. BODY SCAN — zones de tension injectées dans le prompt
// ══════════════════════════════════════════════════
const BODY_ZONES = {
  tete:      'Sentez la tension dans votre front... votre crane... et laissez-la se dissoudre doucement...',
  machoire:  'Relâchez votre machoire... desserrez les dents... laissez la bouche s\'entrouvrir legerement...',
  epaules:   'Vos epaules descendent... naturellement... elles n\'ont plus besoin de porter quoi que ce soit...',
  poitrine:  'Votre poitrine s\'ouvre... votre respiration trouve sa propre ampleur...',
  ventre:    'Votre ventre se detend... comme une vague tiede qui l\'enveloppe...',
  dos:       'Votre dos s\'enfonce dans le support... soutenu... relache...',
  mains:     'Vos mains deviennent lourdes... chaudes... comme si elles fondaient dans vos cuisses...',
  jambes:    'Vos jambes se relachent completement... des hanches jusqu\'aux pieds... lourdes et confortables...',
  pieds:     'Sentez le contact de vos pieds... l\'ancrage au sol... la stabilite...',
};

function activateBodyScan(zones) {
  // zones = array of zone ids, or 'full' for complete scan
  const targetZones = zones === 'full' ? Object.keys(BODY_ZONES) : (Array.isArray(zones) ? zones : [zones]);
  TOOLS.bodyscan.active = true;
  TOOLS.bodyscan.zone = targetZones;

  // Injecter les suggestions dans le prochain prompt
  const suggestions = targetZones.map(z => BODY_ZONES[z] || '').filter(Boolean);
  S._bodyScanInject = suggestions.join('\n...\n');
  console.log(`[Outils] ✅ Body scan: ${targetZones.join(', ')}`);
}

function stopBodyScan() {
  TOOLS.bodyscan.active = false;
  TOOLS.bodyscan.zone = null;
  S._bodyScanInject = null;
}

// ══════════════════════════════════════════════════
// 5. MÉTRONOME VISUEL — pendule pour fixation
// ══════════════════════════════════════════════════
function startMetronome(speedSec) {
  stopMetronome();
  TOOLS.metronome.active = true;
  TOOLS.metronome.speed = speedSec || 2.0;
  const overlay = document.getElementById('vakog-visual-overlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div style="position:absolute;top:15%;left:50%;transform:translateX(-50%)">
      <div id="pendulum-dot" style="width:14px;height:14px;border-radius:50%;background:rgba(143,175,177,.6);box-shadow:0 0 20px rgba(143,175,177,.3);animation:pendulumSwing ${TOOLS.metronome.speed}s ease-in-out infinite alternate;transform-origin:center -100px"></div>
    </div>
    <style>@keyframes pendulumSwing{0%{transform:translateX(-80px)}100%{transform:translateX(80px)}}</style>`;
  overlay.style.opacity = '1';
  console.log(`[Outils] ✅ Métronome: ${TOOLS.metronome.speed}s`);
}

function stopMetronome() {
  TOOLS.metronome.active = false;
  if (TOOLS.metronome.timer) { clearTimeout(TOOLS.metronome.timer); TOOLS.metronome.timer = null; }
  const overlay = document.getElementById('vakog-visual-overlay');
  if (overlay && !TOOLS.safespace.active && !TOOLS.coherence.active) { overlay.style.opacity = '0'; overlay.innerHTML = ''; }
}

// ══════════════════════════════════════════════════
// ARBRE DE DÉCISION THÉRAPEUTIQUE
// Décide automatiquement quels outils activer selon le contexte clinique
// Le patient ne touche à rien — le système décide
// ══════════════════════════════════════════════════
async function therapeuticDecisionEngine() {
  const phase = S.phase;
  const depth = S.depth;
  const pm = S.clinicalProfile?.patientModel || {};
  const anxiety = S.clinicalProfile?.anxiety || 0;
  const protocol = S.protocol?.id || 'stress';
  const resistance = S.resistanceSignals.length;
  const vak = S.clinicalProfile?.vakog || {};
  const vakTotal = (vak.v||0)+(vak.a||0)+(vak.k||0)+(vak.og||0)||1;
  const vakDom = Object.entries({v:vak.v||0, a:vak.a||0, k:vak.k||0}).sort((a,b)=>b[1]-a[1])[0][0];
  const relaxScore = S.relaxScore || 0;
  const attachStyle = pm.attachment_style || 'unknown';
  const resistType = pm.resistance_type || 'unknown';
  const processingChannel = pm.processing_channel || 'unknown';

  const decisions = [];

  // ── OUTILS RECOMMANDÉS PAR LE COLLÈGE (si disponible) ──
  const collegeTools = S.collegeDecision?.tools_recommended?.[phase] || [];

  // ── PHASE: PREP ──
  if (phase === 'prep') {
    // Cohérence cardiaque systématique en prep
    if (!TOOLS.coherence.active) {
      let rhythm = 'coherence-5-5';
      if (anxiety > 70) rhythm = 'anti-panic-3-6';
      else if (protocol === 'sommeil') rhythm = 'relax-4-6';
      decisions.push({ tool: 'coherence', action: 'start', params: [rhythm, 120] });
    }
  }

  // ── PHASE: INDUCTION ──
  if (phase === 'induction') {
    // Arrêter la cohérence cardiaque (on passe à l'induction)
    if (TOOLS.coherence.active) decisions.push({ tool: 'coherence', action: 'stop' });

    // Métronome pour les visuels ou les résistants intellectuels
    if ((vakDom === 'v' || resistType === 'control_intellectuel') && !TOOLS.metronome.active) {
      decisions.push({ tool: 'metronome', action: 'start', params: [2.5] });
    }

    // Body scan pour les kinesthésiques
    if ((vakDom === 'k' || processingChannel === 'somatic') && !TOOLS.bodyscan.active) {
      decisions.push({ tool: 'bodyscan', action: 'start', params: [['epaules','mains','pieds']] });
    }
  }

  // ── PHASE: DEEPENING ──
  if (phase === 'deepening') {
    // Arrêter le métronome (le patient a lâché la fixation)
    if (TOOLS.metronome.active && depth > 4) decisions.push({ tool: 'metronome', action: 'stop' });

    // Body scan complet si kinesthésique et pas encore fait
    if (vakDom === 'k' && !TOOLS.bodyscan.active && depth > 3) {
      decisions.push({ tool: 'bodyscan', action: 'start', params: ['full'] });
    }

    // Lieu sûr pour anxiété/trauma
    if ((protocol === 'anxiete' || protocol === 'stress') && anxiety > 50 && !TOOLS.safespace.active && depth > 4) {
      const env = vakDom === 'a' ? 'nuit' : vakDom === 'k' ? 'jardin' : 'plage';
      decisions.push({ tool: 'safespace', action: 'start', params: [env] });
    }
  }

  // ── PHASE: WORK ──
  if (phase === 'work') {
    // Lieu sûr obligatoire pour trauma si pas encore activé
    const triageAdapts = S._triageAdaptations || [];
    if (triageAdapts.includes('safePlaceFirst:true') && !TOOLS.safespace.active) {
      decisions.push({ tool: 'safespace', action: 'start', params: ['foret'] });
    }

    // Résistance détectée pendant le travail → cohérence cardiaque courte pour stabiliser
    if (resistance > 2 && !TOOLS.coherence.active && depth < 5) {
      decisions.push({ tool: 'coherence', action: 'start', params: ['square-4-4-4-4', 60] });
    }
  }

  // ── PHASE: RETURN ──
  if (phase === 'return') {
    // Tout arrêter progressivement
    if (TOOLS.safespace.active) decisions.push({ tool: 'safespace', action: 'stop' });
    if (TOOLS.bodyscan.active) decisions.push({ tool: 'bodyscan', action: 'stop' });
    if (TOOLS.coherence.active) decisions.push({ tool: 'coherence', action: 'stop' });
    if (TOOLS.metronome.active) decisions.push({ tool: 'metronome', action: 'stop' });
  }

  // ── PHASE: ANCHOR ──
  if (phase === 'anchor') {
    // Body scan ciblé sur la zone d'ancrage (mains)
    if (!TOOLS.bodyscan.active) {
      decisions.push({ tool: 'bodyscan', action: 'start', params: [['mains']] });
    }
  }

  // ── BINAURAL TOUJOURS ADAPTATIF ──
  if (S.binauralOn) {
    adaptBinaural(phase);
  }

  // ── OUTILS RECOMMANDÉS PAR LE COLLÈGE (complète les décisions par phase) ──
  if (collegeTools.length > 0) {
    for (const toolId of collegeTools) {
      const normalizedId = toolId.toLowerCase().replace(/[^a-z_]/g, '');
      if (normalizedId.includes('coherence') && !TOOLS.coherence.active && !decisions.find(d => d.tool === 'coherence')) {
        decisions.push({ tool: 'coherence', action: 'start', params: ['coherence-5-5', 120] });
      }
      if (normalizedId.includes('body_scan') && !TOOLS.bodyscan.active && !decisions.find(d => d.tool === 'bodyscan')) {
        decisions.push({ tool: 'bodyscan', action: 'start', params: ['full'] });
      }
      if (normalizedId.includes('lieu_sur') && !TOOLS.safespace.active && !decisions.find(d => d.tool === 'safespace') && depth > 3) {
        const env = vakDom === 'a' ? 'nuit' : vakDom === 'k' ? 'jardin' : 'plage';
        decisions.push({ tool: 'safespace', action: 'start', params: [env] });
      }
      if (normalizedId.includes('metronome') && !TOOLS.metronome.active && !decisions.find(d => d.tool === 'metronome')) {
        decisions.push({ tool: 'metronome', action: 'start', params: [2.5] });
      }
    }
  }

  // ── RE-CONSULTATION COLLÈGE si situation a changé significativement ──
  // Le collège n'est pas juste décoratif — il se re-consulte si nécessaire
  if (S.collegeDecision && !S._collegeReconsulted) {
    const needsReconsult =
      (resistance > 3 && S.collegeDecision.complexite !== 'Complexe') || // résistance forte non prévue
      (depth > 7 && S.phase === 'work' && S.collegeDecision.approche === 'Directe') || // transe profonde mais approche directive → basculer indirecte
      (S._triageAdaptations?.length > 0 && !S.collegeDecision._triageAware); // contraintes triage non connues du collège

    if (needsReconsult) {
      S._collegeReconsulted = true; // une seule reconsultation par séance
      reconsultCollegeDuringSession();
    }
  }

  // ── EXÉCUTER LES DÉCISIONS avec introductions parlées ──
  for (const d of decisions) {
    try {
      const intro = getToolIntroduction(d.tool, d.action, d.params);
      if (intro && d.action === 'start') {
        // Parler l'introduction AVANT d'activer l'outil — préserve la transe
        addMsgS('hypno', intro);
        await speakHypno(intro);
        // Petite pause après l'introduction pour laisser les mots s'installer
        await new Promise(r => setTimeout(r, 1500));
      }
      if (d.tool === 'coherence')  { d.action === 'start' ? startCoherence(...(d.params||[])) : stopCoherence(); }
      if (d.tool === 'metronome')  { d.action === 'start' ? startMetronome(...(d.params||[])) : stopMetronome(); }
      if (d.tool === 'bodyscan')   { d.action === 'start' ? activateBodyScan(...(d.params||[])) : stopBodyScan(); }
      if (d.tool === 'safespace')  { d.action === 'start' ? activateSafeSpace(...(d.params||[])) : stopSafeSpace(); }
      if (intro && d.action === 'stop') {
        // Parler la sortie APRÈS avoir désactivé — transition douce
        addMsgS('hypno', intro);
        await speakHypno(intro);
      }
    } catch(e) { console.warn('[DecisionEngine]', d.tool, e.message); }
  }

  if (decisions.length > 0) {
    console.log(`[DecisionEngine] ${phase} D${depth.toFixed(1)} → ${decisions.map(d => d.tool + ':' + d.action).join(', ')}`);
  }

  return decisions;
}

// ── Introductions parlées générées par LLM — préservent l'axe hypnotique ──
async function getToolIntroduction(tool, action, params) {
  // Le LLM génère l'introduction avec les mots du patient et le contexte de transe
  const predicats = S.patientPredicates.slice(-4).join(', ');
  const metaphors = S.patientMetaphors.slice(-1)[0] || '';
  const depth = S.depth;
  const phase = S.phase;

  // Descriptions des outils pour le LLM (jamais exposées au patient)
  const toolDescriptions = {
    coherence: 'guide respiratoire visuel (bulle qui monte inspire / descend expire)',
    metronome: 'point oscillant lent pour fixation visuelle',
    bodyscan:  'exploration corporelle zone par zone',
    safespace: 'environnement visuel immersif affiche sur ecran',
  };

  const envLabels = {
    plage: 'plage au coucher de soleil', foret: 'foret profonde',
    montagne: 'sommet de montagne', nuit: 'nuit etoilee', jardin: 'jardin secret'
  };

  // Pour les arrêts simples ou si pas de Worker → fallback statique court
  if (action === 'stop' || !CFG.WORKER) {
    return getToolIntroFallback(tool, action, params);
  }

  const toolLabel = toolDescriptions[tool] || tool;
  const envLabel = tool === 'safespace' ? (envLabels[params?.[0]] || 'lieu sur') : '';

  try {
    const resp = await callAPI(
      `Tu es un hypnotherapeute ericksonien en pleine seance. Profondeur actuelle : ${depth.toFixed(1)}/10, phase : ${phase}.
Le systeme va ${action === 'start' ? 'activer' : 'desactiver'} un outil therapeutique : ${toolLabel}${envLabel ? ' (' + envLabel + ')' : ''}.

MISSION : Genere 2-3 phrases d'introduction hypnotique qui PREPARENT le patient a percevoir cet outil SANS briser la transe.
${predicats ? 'Mots du patient a tisser : ' + predicats : ''}
${metaphors ? 'Metaphore du patient : ' + metaphors : ''}

REGLES ABSOLUES :
- JAMAIS nommer l'outil ("coherence cardiaque", "body scan", "metronome", "lieu sur") — le patient ne doit pas savoir qu'un outil technique est active
- JAMAIS de meta-langage ("je vais activer", "vous allez voir apparaitre")
- Langage permissif, indirect, ericksonien
- Phrases courtes avec pauses ...
- Si profondeur > 5 : phrases tres lentes, tres douces, minimalistes
- Si profondeur < 3 : phrases un peu plus structurantes
- Utilise les mots du patient si disponibles
- Le but est que le patient DECOUVRE l'outil comme une extension naturelle de son experience interieure

Genere UNIQUEMENT le texte a lire au patient. Rien d'autre.`,
      [{role:'user', content: `Introduction pour ${tool}:${action} en phase ${phase}`}],
      200
    );
    const clean = resp.replace(/\[CLINIQUE\][\s\S]*/,'').replace(/\[SCRIPT\]/g,'').trim();
    return clean || getToolIntroFallback(tool, action, params);
  } catch(e) {
    console.warn('[ToolIntro] LLM fallback:', e.message);
    return getToolIntroFallback(tool, action, params);
  }
}

// Fallback statique (si pas de Worker ou erreur)
function getToolIntroFallback(tool, action, params) {
  if (action === 'start') {
    if (tool === 'coherence')
      return 'Et peut-etre que votre respiration... peut trouver un rythme... un rythme calme... qui vous appartient... inspire... et expire... naturellement...';
    if (tool === 'metronome')
      return 'Et si vos yeux sont ouverts... vous pouvez remarquer ce mouvement doux... qui va et vient... lentement...';
    if (tool === 'bodyscan')
      return 'Et peut-etre que votre attention... se pose naturellement... quelque part dans votre corps... avec curiosite...';
    if (tool === 'safespace')
      return 'Et quelque part en vous... il y a un endroit... un endroit ou vous vous sentez bien... completement bien... laissez-le venir...';
  }
  if (action === 'stop') {
    if (tool === 'coherence')
      return 'Et votre respiration trouve maintenant son propre rythme... sans guide... naturellement...';
    if (tool === 'safespace')
      return 'Et vous pouvez garder avec vous... tout ce que cet endroit vous a donne...';
    if (tool === 'metronome')
      return 'Et vos yeux peuvent se reposer... se fermer s\'ils le souhaitent...';
  }
  return null;
}

// ── Re-consultation du collège pendant la séance ──
async function reconsultCollegeDuringSession() {
  if (!CFG.WORKER || !S.collegeDecision) return;

  const d = S.collegeDecision;
  const resistance = S.resistanceSignals.slice(-3).join(', ');
  const pm = S.clinicalProfile?.patientModel || {};

  try {
    const resp = await callAPI(
      `Tu es le coordinateur du college d'experts hypnotherapeutes. La seance est EN COURS et la situation a change.

EQUIPE INITIALE : ${d.equipe.map(m => m.id + ' [' + m.role + ']').join(', ')}
TECHNIQUE PREVUE : ${d.technique} (${d.approche})
COMPLEXITE PREVUE : ${d.complexite}

SITUATION ACTUELLE :
- Phase : ${S.phase} — Profondeur : ${S.depth.toFixed(1)}/10
- Resistance detectee : ${resistance || 'aucune'}
- Modele patient : attachement ${pm.attachment_style || '?'}, resistance ${pm.resistance_type || '?'}
- Contraintes triage : ${(S._triageAdaptations || []).join(', ') || 'aucune'}

QUESTION : Faut-il ajuster la strategie ? Si oui, quelle modification precise ?
Reponds en JSON : {"adjust":true/false, "new_technique":"...", "new_approche":"...", "directive":"instruction precise pour le prochain script"}
Si pas de changement necessaire : {"adjust":false}`,
      [{role:'user', content:'Re-consultation college en seance.'}],
      300
    );

    const clean = resp.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    if (result.adjust) {
      S.collegeDecision.technique = result.new_technique || S.collegeDecision.technique;
      S.collegeDecision.approche = result.new_approche || S.collegeDecision.approche;
      S.collegeDecision._triageAware = true;
      S.collegeDecision._sessionDirective = result.directive || '';
      console.log('[Collège] ✅ Re-consultation:', result.directive);
      addMsgS('system', `🎓 College reconsulte — ${result.new_technique || 'strategie ajustee'}`);
    }
  } catch(e) {
    console.warn('[College reconsult]', e.message);
  }
}

// Inject college session directive into the hypno prompt if available
function getCollegeSessionDirective() {
  const directive = S.collegeDecision?._sessionDirective;
  return directive ? `\nDIRECTIVE DU COLLEGE (ajustement en cours de seance) : ${directive}\n` : '';
}

// ── Enrichir le prompt hypno avec les outils actifs + consignes d'intégration ──
function getActiveToolsContext() {
  const parts = [];
  const rhythm = TOOLS.coherence.rhythm;

  if (TOOLS.coherence.active && rhythm) {
    parts.push(`OUTIL ACTIF : Coherence cardiaque (${rhythm.label} — inspire ${rhythm.inhale}s / expire ${rhythm.exhale}s)
INTEGRATION OBLIGATOIRE : Le patient suit deja un rythme respiratoire guide visuellement. Tes suggestions DOIVENT se synchroniser avec ce rythme.
- Phrases d'inspiration (${rhythm.inhale}s) : courtes, montantes, ouvrantes — "Et en inspirant... cette fraicheur qui entre..."
- Phrases d'expiration (${rhythm.exhale}s) : plus longues, descendantes, relachantes — "En expirant... tout ce qui n'est plus necessaire... s'en va... naturellement..."
- NE PAS dire "respirez" ou "inspirez" — le patient le fait deja. ACCOMPAGNE le mouvement, ne le dirige pas.
- Rythme TTS : une phrase par cycle respiratoire. Pause ... entre chaque.`);
  }

  if (TOOLS.safespace.active && TOOLS.safespace.env) {
    const env = SAFE_SPACES[TOOLS.safespace.env];
    const sensoryMap = {
      plage:    'la lumiere doree... le son des vagues... le sable chaud sous les pieds... l\'odeur salee de l\'air...',
      foret:    'la lumiere filtree par les feuilles... le bruissement des branches... la terre humide sous les pieds... l\'odeur de mousse et d\'humus...',
      montagne: 'l\'immensitie du ciel... le silence profond... l\'air frais et pur sur le visage... la solidite de la roche...',
      nuit:     'les etoiles qui scintillent... le silence vaste de la nuit... l\'air frais et calme... une serenite infinie...',
      jardin:   'les couleurs des fleurs... le chant discret des oiseaux... la douceur de l\'herbe... le parfum des plantes...',
    };
    parts.push(`OUTIL ACTIF : Lieu sur visuel — ${env?.label || ''}
Le patient VOIT cet environnement sur son ecran. Tes suggestions doivent le PEUPLER de sensations multi-sensorielles.
Suggestions a tisser naturellement : ${sensoryMap[TOOLS.safespace.env] || ''}
REGLE : ne dis pas "imaginez un lieu sur" — il est DEJA LA. Dis "et dans cet endroit... vous pouvez remarquer..." comme si le patient y etait deja.`);
  }

  if (TOOLS.bodyscan.active && S._bodyScanInject) {
    parts.push(`OUTIL ACTIF : Body scan — zones ciblees : ${(TOOLS.bodyscan.zone||[]).join(', ')}
INTEGRATION : Integre ces suggestions kinesthesiques dans le flux du script, une zone a la fois, avec des pauses longues entre chaque.
Ne dis pas "nous allons faire un body scan". Dis "et peut-etre que votre attention... se pose naturellement... sur vos epaules..."
Suggestions preparees (a adapter a ta voix) :
${S._bodyScanInject}`);
  }

  if (TOOLS.metronome.active) {
    parts.push(`OUTIL ACTIF : Metronome visuel — oscillation ${TOOLS.metronome.speed}s
Le patient fixe un point qui oscille lentement. Ses yeux suivent.
INTEGRATION : Synchronise tes suggestions avec le mouvement — "et pendant que vos yeux suivent ce mouvement... gauche... droite... vous pouvez remarquer que vos paupieres deviennent un peu plus lourdes..."
Quand la fixation provoque une fatigue oculaire naturelle → accompagne : "et si vos yeux veulent se fermer... laissez-les faire... c'est parfait..."
NE PAS mentionner "le pendule" ou "le metronome" — le patient le voit, il n'a pas besoin qu'on le nomme.`);
  }

  if (S.binauralOn && BINAURAL_PROFILES[S.phase]) {
    parts.push(`OUTIL ACTIF : Binaural ${BINAURAL_PROFILES[S.phase].label}
Le patient entend un son continu doux dans ses ecouteurs. Ne le mentionne pas explicitement. Si besoin, integre : "et ce son doux... en arriere-plan... qui accompagne..."`);
  }

  if (parts.length === 0) return '';

  return `\n\n═══ OUTILS THERAPEUTIQUES ACTIFS ═══
REGLE FONDAMENTALE : Les outils sont DEJA actifs visuellement et/ou sonorement pour le patient.
Tu ne les "introduis" pas — tu les ACCOMPAGNES. Le patient les percoit deja.
Tes suggestions doivent se TISSER avec les outils, pas les decrire.
Ne brise JAMAIS la transe pour expliquer un outil. L'outil fait partie du paysage hypnotique.

${parts.join('\n\n')}
\n`;
}

// ═══════════════════════════════════════════════════════════════
// CANVAS SPIRAL
// ═══════════════════════════════════════════════
function startCanvasAnim(){
  const canvas=document.getElementById('hypnoCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');if(S.canvasAnim)cancelAnimationFrame(S.canvasAnim);
  function resize(){const z=canvas.parentElement;canvas.width=z.offsetWidth;canvas.height=z.offsetHeight;}
  resize();window.addEventListener('resize',resize);
  S.spiralAngle=0;let lastT=0;
  function draw(ts){
    const dt=ts-lastT;lastT=ts;
    const spd=PHASE_SPEED[S.phase]||.5;
    S.spiralAngle+=(.003+spd*.003)*Math.min(dt,50);
    const W=canvas.width,H=canvas.height,cx=W/2,cy=H/2,d=S.depth;
    ctx.fillStyle='#1e2825';ctx.fillRect(0,0,W,H);
    if(d>3){const gr=ctx.createRadialGradient(cx,cy,0,cx,cy,70+d*14);gr.addColorStop(0,`rgba(143,175,177,${.04+d*.011})`);gr.addColorStop(1,'transparent');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(cx,cy,70+d*14,0,Math.PI*2);ctx.fill();}
    const arms=2+(d>5?1:0),turns=4+d*.2,pts=Math.floor(200+d*18);
    for(let a=0;a<arms;a++){
      const ao=(a/arms)*Math.PI*2;ctx.beginPath();
      for(let i=0;i<pts;i++){const t=i/pts,ang=t*turns*Math.PI*2+S.spiralAngle+ao,r=t*Math.min(W,H)*.44,x=cx+r*Math.cos(ang),y=cy+r*Math.sin(ang);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
      const al=.11+d*.02,gr2=ctx.createLinearGradient(cx-200,cy,cx+200,cy);
      gr2.addColorStop(0,`rgba(143,175,177,${al})`);gr2.addColorStop(.5,`rgba(201,169,110,${al*.65})`);gr2.addColorStop(1,`rgba(143,175,177,${al})`);
      ctx.strokeStyle=gr2;ctx.lineWidth=.8+d*.09;ctx.stroke();
    }
    const pulse=(Math.sin(Date.now()*.0015)+1)/2;
    ctx.beginPath();ctx.arc(cx,cy,22+pulse*14,0,Math.PI*2);ctx.strokeStyle=`rgba(143,175,177,${.09+d*.025})`;ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,3+d*.3,0,Math.PI*2);ctx.fillStyle=`rgba(143,175,177,${.5+d*.04})`;ctx.fill();
    S.canvasAnim=requestAnimationFrame(draw);
  }
  S.canvasAnim=requestAnimationFrame(draw);
}

// ═══════════════════════════════════════════════
// PROFONDEUR & PHASES
// ═══════════════════════════════════════════════
function setDepth(val,anim=true){
  S.depth=Math.max(0,Math.min(10,val));
  const fill=document.getElementById('depth-fill');
  fill.style.transition=anim?'width 1.8s cubic-bezier(.4,0,.2,1)':'none';
  fill.style.width=(S.depth*10)+'%';
  document.getElementById('depth-num').textContent=S.depth.toFixed(1);
  const lbl=DEPTH_LABELS[Math.round(S.depth)];
  document.getElementById('depth-text').textContent=lbl;
  document.getElementById('sh-depth').textContent=lbl;
}
function adjDepth(d){setDepth(S.depth+d);}
function setDepthClick(e,bar){const r=bar.getBoundingClientRect();setDepth(((e.clientX-r.left)/r.width)*10);}
function setPhase(p,el){
  S.phase=p;
  document.querySelectorAll('.phase-btn').forEach(b=>b.classList.remove('active'));
  (el||document.querySelector(`[data-p="${p}"]`))?.classList.add('active');
  document.getElementById('sh-phase').textContent=PHASE_NAMES[p];
  const tgt=PHASE_DEPTH[p];if(Math.abs(S.depth-tgt)>1.5)setTimeout(()=>setDepth(tgt),600);
  updateOverlayText(PHASE_TEXT[p]);

  // Arbre de décision thérapeutique — active/désactive les outils selon la phase
  setTimeout(() => therapeuticDecisionEngine(), 800);

  addMsgS('system',`Phase → ${PHASE_NAMES[p]}`);
}
function updateOverlayText(t){const el=document.getElementById('hypno-overlay');el.style.opacity='0';setTimeout(()=>{el.textContent=t;el.style.opacity='1';},900);}

// ═══════════════════════════════════════════════
// MESSAGES SÉANCE
// ═══════════════════════════════════════════════
function addMsgS(type,text){
  const chat=document.getElementById('seance-chat');
  const el=document.createElement('div');el.className='msg-s '+type;
  if(type==='hypno') el.innerHTML=`<div class="msg-meta">${PHASE_NAMES[S.phase]||''} · ${S.depth.toFixed(1)}/10</div>${escHtml(text)}`;
  else el.textContent=text;
  chat.appendChild(el);chat.scrollTop=chat.scrollHeight;
  S.seanceMessages.push({type,text,phase:S.phase,depth:S.depth,ts:Date.now()});
}
let ldCnt=0;
function addLoadingMsgS(){const id='ld-'+(++ldCnt);const chat=document.getElementById('seance-chat');const el=document.createElement('div');el.className='msg-s';el.id=id;el.innerHTML='<div class="dots-loading"><span></span><span></span><span></span></div>';chat.appendChild(el);chat.scrollTop=chat.scrollHeight;return id;}
function removeLoadingS(id){document.getElementById(id)?.remove();}
function escHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');}

async function sendSeanceMsg(){
  const ta = document.getElementById('seance-ta');
  const text = ta.value.trim();
  if (!text) return;
  ta.value = ''; autoResize(ta); stopTTS();
  if (S.micActiveS && S.recognitionS) try { S.recognitionS.stop(); } catch(e) {}
  addMsgS('patient', text);

  // ── Détection résistance (signaux sémantiques patient pendant séance) ──
  detectResistance(text);

  await generateHypnoScript(text);
  if (S.micActiveS && S.recognitionS) setTimeout(() => { try { S.recognitionS.start(); } catch(e) {} }, 500);
}

// ── Détection résistance pendant séance ──
function detectResistance(text) {
  const t = text.toLowerCase();
  const resistancePatterns = [
    { pattern: /je n[e']? (sens|vois|entends|ressens) (pas|rien)/i, label: 'pas de sensation' },
    { pattern: /je (n[e']? peux|peux pas|arrive pas) (pas )?à/i,    label: 'impossibilité' },
    { pattern: /pourquoi|c[e']est quoi|vous voulez dire|je comprends pas/i, label: 'rationalisation' },
    { pattern: /je pense (que|à)/i,                                  label: 'retour mental' },
    { pattern: /je suis distrait|je ne (me )?concentre pas|bruit/i,  label: 'distraction' },
    { pattern: /bizarre|étrange|j[e']? trouve ça|c[e']?est difficile/i, label: 'inconfort' },
  ];
  for (const {pattern, label} of resistancePatterns) {
    if (pattern.test(t)) {
      S.resistanceSignals.push(label);
      if (S.resistanceSignals.length > 5) S.resistanceSignals = S.resistanceSignals.slice(-5);
      console.log('[Résistance]', label);
      break;
    }
  }
}

// ═══════════════════════════════════════════════
// QUICK SCRIPTS ADAPTATIFS
// ═══════════════════════════════════════════════
function renderQuickScripts(){
  if (!S.protocol) return;
  const scripts = S.protocol.quickScripts || [];
  document.getElementById('quick-list').innerHTML = scripts.map(q =>
    `<button class="quick-btn" onclick="sendQuickAdaptive('${q.replace(/'/g,"\\'")}')">` +
    `${q}</button>`
  ).join('');
}

// QuickScript adaptatif — génère une version personnalisée selon profil + VAKOG + prédicats
function sendQuickAdaptive(label) {
  const vak = S.clinicalProfile?.vakog || {v:0,a:0,k:0,og:0};
  const vakTotal = (vak.v+vak.a+vak.k+vak.og) || 1;
  const dominant = Object.entries({visuel:vak.v,auditif:vak.a,kinesthésique:vak.k}).sort((a,b)=>b[1]-a[1])[0][0];
  const predicats = S.patientPredicates.slice(-3).join(', ');
  const metaphors = S.patientMetaphors.slice(-1)[0] || '';

  const ta = document.getElementById('seance-ta');
  ta.value = `Technique : ${label}. Adapte cette technique au canal dominant ${dominant}${predicats ? `. Utilise les mots du patient : ${predicats}` : ''}${metaphors ? `. Métaphore patient : "${metaphors}"` : ''}.`;
  ta.focus();
}
// ═══════════════════════════════════════════════
// FIN DE SÉANCE — RETOUR RITUALISÉ
// ═══════════════════════════════════════════════
function confirmExit() {
  if (S.phase === 'work' || S.phase === 'deepening') {
    // Retour progressif obligatoire avant de sortir
    if (confirm('Vous êtes en transe profonde. Lancer le retour progressif avant de terminer ?')) {
      initiateRitualReturn();
    }
  } else if (S.phase === 'anchor' || S.phase === 'return') {
    // Déjà en retour — confirmer la fin
    if (confirm('Terminer la séance maintenant ?')) endSession();
  } else {
    if (confirm('Terminer la séance maintenant ?')) endSession();
  }
}

async function initiateRitualReturn() {
  S.inReturnPhase = true;
  // Forcer la phase retour
  setPhase('return', null);
  stopTTS();

  addMsgS('system', '🌅 Retour progressif initié');

  // Script de retour généré par l'IA
  const returnScript = await generateReturnScript();

  // Après le retour → ancrage
  setTimeout(async () => {
    if (!S.inReturnPhase) return;
    setPhase('anchor', null);
    const anchorScript = await generateAnchorScript();
    // Après l'ancrage → proposer la fin
    setTimeout(() => {
      S.inReturnPhase = false;
      showReturnComplete();
    }, 8000);
  }, 20000);
}

async function generateReturnScript() {
  const depth = S.depth;
  const p = S.protocol;
  const predicats = S.patientPredicates.slice(-3).join(', ');

  // Durée et richesse du retour proportionnelles à la profondeur atteinte
  const returnInstructions = depth > 7
    ? 'Retour TRÈS PROGRESSIF (profondeur > 7/10) : au moins 10 phrases, compte de 1 à 7, jalons corporels explicites, temps long entre chaque niveau.'
    : depth > 5
    ? 'Retour PROGRESSIF (profondeur 5-7/10) : 7-8 phrases, compte de 1 à 5, sensations corporelles, récupération graduelle.'
    : 'Retour DOUX (profondeur légère) : 4-5 phrases, rappel du corps, ouverture des yeux au propre rythme.';

  const prompt = `Tu es en fin de séance hypnotique. Phase RETOUR.
Profondeur atteinte : ${depth.toFixed(1)}/10.
${returnInstructions}
${predicats ? `Utilise les mots du patient dans le retour : ${predicats}` : ''}
Génère UNIQUEMENT le [SCRIPT] de retour — sans [CLINIQUE].
Le retour : graduel, ancré dans le corps, retour progressif de la conscience, ton chaud.
Terminer par une phrase d'ancrage dans le présent et de valorisation.`;

  try {
    const maxTok = depth > 7 ? 700 : depth > 5 ? 500 : 350;
    const resp = await callAPI(prompt, [{role:'user', content:'Script de retour progressif.'}], maxTok);
    const script = resp.replace(/\[SCRIPT\]/g,'').replace(/\[CLINIQUE\][\s\S]*/,'').trim();
    addMsgS('hypno', script);
    updateOverlayText('Doucement, revenez à vous...');
    await speakHypno(script);
    return script;
  } catch(e) {
    const fallback = "Dans un moment, je vais compter de 1 à 5... et à chaque chiffre, vous reviendrez doucement à l'état ordinaire de conscience...\n\nUn... votre respiration change légèrement... deux... vous sentez le poids de votre corps... trois... les sons autour de vous reviennent progressivement... quatre... une légère énergie traverse vos membres... cinq... ouvrez les yeux quand vous vous sentez prêt, en emportant avec vous tout ce qui vous est utile.";
    addMsgS('hypno', fallback);
    await speakHypno(fallback);
    return fallback;
  }
}

async function generateAnchorScript() {
  const p = S.protocol;
  const predicats = S.patientPredicates.slice(-3).join(', ');
  const metaphors = S.patientMetaphors.slice(-1)[0] || '';
  const mem = S.sessionMemory;
  const existingAnchors = mem.placedAnchors.length > 0
    ? `Ancrages déjà posés : ${mem.placedAnchors.map(a => a.geste + ' → ' + a.ressource).join(', ')}. Réactive-les et consolide.`
    : 'Premier ancrage avec ce patient — crée un geste ressource mémorable.';

  const prompt = `Tu es en phase ANCRAGE, fin de séance ${p?.name||'hypnotique'}.
${existingAnchors}
${predicats ? `Mots du patient à réutiliser dans l'ancrage : ${predicats}` : ''}
${metaphors ? `Métaphore patient : "${metaphors}" — intègre-la dans la ressource ancrée` : ''}
Génère le script d'ancrage post-hypnotique :
- Geste déclencheur simple (pouce-index, main sur le coeur, ou autre geste naturel)
- Ressource accessible dans la vie quotidienne
- Suggestion de continuité de l'effet thérapeutique
- Formulation du geste en langage du patient
6-8 phrases avec pauses ...`;

  try {
    const resp = await callAPI(prompt, [{role:'user', content:'Script ancrage post-hypnotique.'}], 500);
    const script = resp.replace(/\[SCRIPT\]/g,'').replace(/\[CLINIQUE\][\s\S]*/,'').trim();
    addMsgS('hypno', script);
    updateOverlayText('Gardez cette ressource avec vous...');

    // Mémoriser l'ancrage posé
    const gestMatch = script.match(/(?:pouce.index|main sur|geste|toucher)\s+([^.]{5,30})/i);
    if (gestMatch) {
      S.sessionMemory.placedAnchors.push({
        geste:    gestMatch[1].trim(),
        ressource: S.clinicalProfile.summary?.substring(0, 40) || p?.name || 'ressource',
        session:  S.sessionNum,
      });
    }

    await speakHypno(script);
    return script;
  } catch(e) {
    return '';
  }
}

function showReturnComplete() {
  addMsgS('system', '✨ Retour complet — séance terminée');
  // Petit dialogue post-hypnotique
  const postMsg = `Comment vous sentez-vous en ce moment ? Prenez le temps de vous réancrer complètement avant de vous lever.`;
  addMsgS('hypno', postMsg);
  speakHypno(postMsg).then(() => {
    setTimeout(() => endSession(), 4000);
  });
}

function endSession() {
  S.inReturnPhase = false;
  if (S.seanceTimer) clearInterval(S.seanceTimer);
  if (S.entretienTimer) clearInterval(S.entretienTimer);
  stopTTS(); stopBinaural(); stopMeyda();
  if (S.faceInterval) { clearInterval(S.faceInterval); S.faceInterval = null; }
  if (S.canvasAnim) { cancelAnimationFrame(S.canvasAnim); S.canvasAnim = null; }
  if (S.recognitionS) try { S.recognitionS.stop() } catch(e) {}
  S.micActiveS = false; document.getElementById('btn-mic-s').classList.remove('active');
  const vid = document.getElementById('face-video');
  if (vid.srcObject) { vid.srcObject.getTracks().forEach(t=>t.stop()); vid.srcObject=null; vid.style.display='none'; }

  const elapsed = S.seanceStartTime ? Math.round((Date.now()-S.seanceStartTime)/60000) : 0;
  const p = S.protocol;
  document.getElementById('post-sub').textContent = `${p?.emoji||'🌀'} ${p?.name||'Hypnose'} — Séance ${S.sessionNum}/${p?.sessions||'?'} — ${elapsed} min`;
  document.getElementById('sl-profondeur').value = Math.round(S.depth);
  document.getElementById('v-profondeur').textContent = Math.round(S.depth);
  document.getElementById('sugg-tags').innerHTML = (p?.suggestions||[]).map(s=>`<span class="sugg-tag" onclick="this.classList.toggle('active')">${s}</span>`).join('');
  document.getElementById('post-notes').value = '';
  document.getElementById('post-intention').value = '';
  showScreen('screen-post');
}

// ═══════════════════════════════════════════════
// EXPORT / IMPORT JSON (V7 style)
// ═══════════════════════════════════════════════
function buildSessionData(){
  const p = S.protocol;
  const elapsed = S.seanceStartTime ? Math.round((Date.now() - S.seanceStartTime) / 60000) : 0;

  const safeInt = id => { const el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; };
  const safeStr = id => { const el = document.getElementById(id); return el ? (el.value || '') : ''; };
  const safeTags = sel => { try { return [...document.querySelectorAll(sel)].map(s => s.textContent); } catch(e) { return []; } };

  const logDepths = Array.isArray(S.seanceLog) ? S.seanceLog.map(l => l.depth || 0) : [];
  const depthMax = logDepths.length > 0 ? Math.max(...logDepths) : (S.depth || 0);
  const fd = (typeof faceDetections !== 'undefined' && Array.isArray(faceDetections)) ? faceDetections : [];
  const tranceAvg = fd.length > 0
    ? (fd.reduce((a, d) => a + (d.expressions?.neutral || 0), 0) / fd.length).toFixed(2)
    : null;

  return {
    _format: 'hypnose-ia-session', _version: '2.1',
    _exported:         new Date().toISOString(),
    protocol:          p?.id || 'libre',
    protocol_name:     p?.name || 'Séance libre',
    session_num:       S.sessionNum || 1,
    date:              new Date().toISOString(),
    duration_min:      elapsed,
    depth_final:       S.depth || 0,
    depth_max:         depthMax,
    wellbeing:         safeInt('sl-bienetre'),
    profondeur_reported: safeInt('sl-profondeur'),
    notes:             safeStr('post-notes'),
    intention:         safeStr('post-intention'),
    suggestions_actives: safeTags('.sugg-tag.active'),
    patient:           { prenom: S.prenom, age: S.age, ci: S.ci },
    clinical_profile:  S.clinicalProfile || {},
    patient_model:     S.clinicalProfile?.patientModel || null,
    patient_predicates: S.patientPredicates || [],
    patient_metaphors:  S.patientMetaphors  || [],
    session_memory:     S.sessionMemory     || {},
    resistance_signals: S.resistanceSignals || [],
    entretien_messages: S.entretienMessages || [],
    seance_messages:    S.seanceMessages    || [],
    log:               S.seanceLog || [],
    college_experts:   (S.collegeDecision?.equipe || []).map(m => m.id),
    college_technique: S.collegeDecision?.technique || '',
    voice_mode:        S.voiceMode || '',
    binaural:          S.binauralOn || false,
    relax_avg:         S.relaxScore || 0,
    trance_score_avg:  tranceAvg,
    rag_catalog:       RAG_CATALOG.loaded ? RAG_CATALOG.books.map(b => b.author + ' (' + b.chunks + ')') : [],
    web_consult_enabled: !!window.VARIANT.webConsultEnabled,
  };
}

function saveAndClose(){
  let data;
  try { data = buildSessionData(); }
  catch(e) { console.error('[saveAndClose] buildSessionData failed:', e); showToast('⚠️ Erreur construction données', 'error'); return; }
  const sessions = getAllSessions();
  sessions.push(data);
  if (sessions.length > 200) sessions.splice(0, sessions.length - 200);
  saveSessions(sessions);
  updateSessionMemoryAfterSession(data);
  showToast('✅ Séance enregistrée !', 'success');
  setTimeout(() => goToAccueil(), 900);
}

function updateSessionMemoryAfterSession(data) {
  try {
    const stored = JSON.parse(localStorage.getItem('h_session_memory') || '{}');
    const mem = {
      effectiveMetaphors: stored.effectiveMetaphors || [],
      placedAnchors:      stored.placedAnchors      || [],
      keywordsHistory:    stored.keywordsHistory     || [],
      resistancePatterns: stored.resistancePatterns  || [],
      lastSessionSummary: '',
    };
    if ((data.depth_max || 0) >= 6 && data.patient_metaphors?.length > 0) {
      for (const m of data.patient_metaphors) {
        if (!mem.effectiveMetaphors.includes(m)) mem.effectiveMetaphors.push(m);
      }
      if (mem.effectiveMetaphors.length > 10) mem.effectiveMetaphors = mem.effectiveMetaphors.slice(-10);
    }
    for (const a of (S.sessionMemory.placedAnchors || [])) {
      if (!mem.placedAnchors.find(x => x.geste === a.geste)) mem.placedAnchors.push(a);
    }
    if (mem.placedAnchors.length > 6) mem.placedAnchors = mem.placedAnchors.slice(-6);
    for (const w of (data.patient_predicates || [])) {
      if (!mem.keywordsHistory.includes(w)) mem.keywordsHistory.push(w);
    }
    if (mem.keywordsHistory.length > 30) mem.keywordsHistory = mem.keywordsHistory.slice(-30);
    mem.lastSessionSummary = data.clinical_profile?.summary || '';
    mem.resistancePatterns = [...new Set([...(mem.resistancePatterns||[]), ...(data.resistance_signals||[])])].slice(-10);
    localStorage.setItem('h_session_memory', JSON.stringify(mem));
    console.log('[Mémoire] inter-séances sauvegardée');
  } catch(e) {
    console.warn('[Mémoire] Sauvegarde échouée:', e.message);
  }
}

function loadSessionMemory() {
  try {
    const stored = JSON.parse(localStorage.getItem('h_session_memory') || '{}');
    S.sessionMemory = {
      effectiveMetaphors: stored.effectiveMetaphors || [],
      placedAnchors:      stored.placedAnchors      || [],
      keywordsHistory:    stored.keywordsHistory     || [],
      resistancePatterns: stored.resistancePatterns  || [],
      lastSessionSummary: stored.lastSessionSummary  || '',
    };
  } catch(e) {
    S.sessionMemory = { effectiveMetaphors:[], placedAnchors:[], keywordsHistory:[], resistancePatterns:[], lastSessionSummary:'' };
  }
}

function eraseAllData(quitAfter) {
  const msg = quitAfter
    ? 'Effacer TOUTES les données et recharger la page ? Irréversible.'
    : 'Effacer toutes les données (séances, profil, mémoire) ? Irréversible.';
  if (!confirm(msg)) return;
  ['h_sessions','h_session_memory','h_worker','h_speed','h_voice','h_consent','h_prenom','h_age'].forEach(k => localStorage.removeItem(k));
  showToast('🗑️ Données effacées', 'success');
  if (quitAfter) setTimeout(() => window.location.reload(), 1200);
  else setTimeout(() => { updateStats(); goToAccueil(); }, 900);
}

function validateConsent() {
  const ci    = document.getElementById('consent-ci')?.checked;
  const rgpd  = document.getElementById('consent-rgpd')?.checked;
  const adult = document.getElementById('consent-adult')?.checked;
  if (!ci || !rgpd || !adult) { showToast('⚠️ Veuillez cocher les 3 cases', 'error'); return; }
  localStorage.setItem('h_consent', '1');
  const m = document.getElementById('modal-consent');
  if (m) m.style.display = 'none';
}

// ═══════════════════════════════════════════════
// TRIAGE CLINIQUE — 4 niveaux de sécurité
// Remplace le checkCriticalCI statique (3 regex)
// par un système hiérarchisé exhaustif
// ═══════════════════════════════════════════════

const TRIAGE_RULES = [
  // ── ROUGE — Contre-indication absolue → STOP ──
  { level: 'red', rx: /psychos[ei]|schizophrénie|schizophrenie|délirant|hallucination|episode.?psychotique/i,
    msg: "Psychose / schizophrénie active : l'hypnose est contre-indiquée. Elle peut aggraver la dissociation et les symptômes positifs.", action: 'stop', orient: 'Psychiatre / urgences psychiatriques' },
  { level: 'red', rx: /suicid|idée.?noir|envie.?mourir|passer.?à.?l.?acte|autolyse/i,
    msg: "Risque suicidaire actif détecté. L'hypnose n'est pas appropriée en contexte de crise suicidaire.", action: 'stop', orient: '3114 (crise suicidaire) / SAMU 15 / Urgences' },
  { level: 'red', rx: /état.?maniaque|manie.?aiguë|décompens|bouffée.?délirante/i,
    msg: "État maniaque / décompensation aiguë. Stabilisation psychiatrique nécessaire avant toute intervention.", action: 'stop', orient: 'Psychiatre en urgence' },
  { level: 'red', rx: /confusion.?mentale|démence.?sévère|trouble.?cognitif.?majeur|anosognosie/i,
    msg: "Trouble cognitif majeur : le patient ne peut pas donner un consentement éclairé ni suivre les suggestions.", action: 'stop', orient: 'Médecin traitant / Neuropsychologue' },

  // ── ORANGE — Stabilisation d'abord → orienter avant hypnose ──
  { level: 'orange', rx: /bipolaire.*non.?stabil|maniaque|cyclothymie.?non.?trait/i,
    msg: "Trouble bipolaire non stabilisé : risque d'épisode maniaque. Accord psychiatrique requis.", action: 'orient', orient: 'Psychiatre pour stabilisation médicamenteuse' },
  { level: 'orange', rx: /borderline.?décompens|état.?limite.?crise|auto.?mutilation.?active|scarif/i,
    msg: "État borderline décompensé / automutilation active. Stabilisation avec thérapeute référent avant hypnose.", action: 'orient', orient: 'Thérapeute spécialisé / psychiatre' },
  { level: 'orange', rx: /alcool.?sévère|addiction.?active.?sévère|sevrage|délirium|ivresse/i,
    msg: "Addiction active sévère / sevrage. L'hypnose est possible en support mais pas en première ligne.", action: 'orient', orient: 'Addictologue / CSAPA' },
  { level: 'orange', rx: /dissoci.{0,15}(complexe|sévère|identité)|person.?multip|did\b|alter\b/i,
    msg: "Trouble dissociatif complexe. L'hypnose peut aggraver la dissociation. Cadre spécialisé requis.", action: 'orient', orient: 'Thérapeute formé aux troubles dissociatifs' },
  { level: 'orange', rx: /dépression.?sévère.?non.?trait|épisode.?dépressif.?majeur/i,
    msg: "Dépression sévère non traitée. Stabilisation médicale recommandée avant hypnothérapie.", action: 'orient', orient: 'Médecin traitant / Psychiatre' },
  { level: 'orange', rx: /anorexie.?sévère|boulimie.?sévère|tca.?sévère|imc.?<.?15/i,
    msg: "TCA sévère. Prise en charge pluridisciplinaire nécessaire. Hypnose en complément, pas seule.", action: 'orient', orient: 'Équipe TCA spécialisée' },

  // ── JAUNE — Hypnose avec adaptation ──
  { level: 'yellow', rx: /épilepsie|epilepsie|convulsion/i,
    msg: "Épilepsie : sons binauraux et stimulations visuelles pulsées désactivés. Séance adaptée.", action: 'adapt',
    adaptations: ['binauralEnabled:false', 'vakogVisualDisabled:true'] },
  { level: 'yellow', rx: /trauma.?(complexe|sévère)|ptsd|tspt|état.?de.?stress.?post/i,
    msg: "Trauma complexe / PTSD. Induction permissive uniquement. Pas de régression. Lieu sûr obligatoire en phase 1.", action: 'adapt',
    adaptations: ['noRegression:true', 'safePlaceFirst:true'] },
  { level: 'yellow', rx: /enceinte|grossesse|femme.?enceinte/i,
    msg: "Grossesse : pas de travail sur douleur abdominale ni suggestions de lourdeur ventrale. Adapter.", action: 'adapt',
    adaptations: ['pregnancySafe:true'] },
  { level: 'yellow', rx: /bipolaire.?stabilis|lithium|thymorégulat/i,
    msg: "Trouble bipolaire stabilisé sous traitement. Hypnose possible avec vigilance sur l'activation émotionnelle.", action: 'adapt',
    adaptations: ['lowActivation:true'] },
  { level: 'yellow', rx: /borderline|état.?limite|tpl/i,
    msg: "Traits borderline. Cadre ferme, pas de régression profonde, ancrage de sécurité systématique.", action: 'adapt',
    adaptations: ['noDeepRegression:true', 'systematicAnchor:true'] },
  { level: 'yellow', rx: /cardiaqu|pace.?maker|défibrill/i,
    msg: "Pathologie cardiaque / pacemaker. Sons binauraux désactivés. Rythme calme.", action: 'adapt',
    adaptations: ['binauralEnabled:false'] },
];

function checkCriticalCI() {
  const ci = (S.ci || '').toLowerCase();
  if (!ci || ci.length < 3) return true;

  S._triageResults = [];
  S._triageAdaptations = [];
  let blocked = false;

  for (const rule of TRIAGE_RULES) {
    if (rule.rx.test(ci)) {
      S._triageResults.push(rule);

      if (rule.level === 'red') {
        // STOP — afficher blocage
        const orientHTML = rule.orient ? '<br><strong>Orientation :</strong> ' + rule.orient : '';
        document.getElementById('ci-block-msg').innerHTML = rule.msg + orientHTML;
        document.getElementById('modal-ci-block').style.display = 'flex';
        blocked = true;
        console.warn('[Triage] 🔴 ROUGE:', rule.msg);
        break; // Un rouge suffit
      }

      if (rule.level === 'orange') {
        // ORIENTER — afficher avertissement fort mais permettre de continuer
        const orientHTML = rule.orient ? '<br><strong>Orientation recommandée :</strong> ' + rule.orient : '';
        document.getElementById('ci-block-msg').innerHTML =
          '⚠️ <strong>Avertissement clinique</strong><br><br>' + rule.msg + orientHTML +
          '<br><br><em>L\'hypnose est possible mais nécessite un cadre adapté et un accord du professionnel référent.</em>';
        document.getElementById('modal-ci-block').style.display = 'flex';
        console.warn('[Triage] 🟠 ORANGE:', rule.msg);
      }

      if (rule.level === 'yellow') {
        // ADAPTER — appliquer les adaptations silencieusement
        if (rule.adaptations) {
          S._triageAdaptations.push(...rule.adaptations);
          rule.adaptations.forEach(a => {
            if (a === 'binauralEnabled:false') { S.binauralOn = false; }
          });
        }
        showToast('⚠️ ' + rule.msg, 'default');
        console.log('[Triage] 🟡 JAUNE:', rule.msg);
      }
    }
  }

  return !blocked;
}

// Triage LLM — appelé pendant l'entretien si signaux d'alerte émergent
async function triageLLMCheck(conversationText) {
  if (!CFG.WORKER || !conversationText || conversationText.length < 50) return null;

  try {
    const resp = await callAPI(
      `Tu es un systeme de securite clinique pour un outil d'hypnotherapie. Analyse ce texte de patient et detecte tout signal d'alerte.

SIGNAUX D'ALERTE A DETECTER :
- Ideation suicidaire (explicite ou implicite)
- Dissociation active (perte de contact avec la realite pendant l'entretien)
- Decompensation (desorganisation du discours, logorrhee, fuite des idees)
- Etat maniaque (euphorie excessive, grandiosite, projets irrealistes)
- Confusion (desoriente dans le temps/espace, discours incoherent)
- Automutilation active
- Psychose (hallucinations, delire, paranoia)
- Detresse aigue ingerable

TEXTE PATIENT :
${conversationText.substring(0, 800)}

Si AUCUN signal d'alerte → reponds: {"alert":false}
Si signal detecte → reponds: {"alert":true,"level":"red|orange|yellow","signal":"description courte","action":"stop|orient|adapt|monitor"}
JSON uniquement.`,
      [{role:'user', content:'Analyse.'}],
      200
    );

    const clean = resp.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    if (result.alert) {
      console.warn('[Triage LLM]', result.level, ':', result.signal);
      if (result.level === 'red') {
        document.getElementById('ci-block-msg').innerHTML =
          '🔴 <strong>Alerte clinique détectée pendant l\'entretien</strong><br><br>' +
          result.signal + '<br><br><em>L\'hypnose n\'est pas recommandée dans ce contexte. Veuillez consulter un professionnel.</em>';
        document.getElementById('modal-ci-block').style.display = 'flex';
      } else if (result.level === 'orange') {
        showToast('⚠️ Signal clinique : ' + result.signal, 'error');
      }
    }
    return result;
  } catch(e) {
    console.warn('[Triage LLM] Erreur:', e.message);
    return null;
  }
}

function exportSessionJSON(){
  const data=buildSessionData();
  const p=S.protocol;
  const fname = p ? `hypnose-${p.id}-s${S.sessionNum}` : `hypnose-seance-${S.sessionNum}`;
  download(JSON.stringify(data,null,2),'application/json',`${fname}-${new Date().toISOString().split('T')[0]}.json`);
  showToast('📥 JSON téléchargé','success');
}

function exportAllJSON(){
  const sessions=getAllSessions();
  if(!sessions.length){showToast('Aucune séance','error');return;}
  download(JSON.stringify({sessions,profile:{prenom:S.prenom,age:S.age},exported:new Date().toISOString()},null,2),'application/json',`hypnose-ia-all-${new Date().toISOString().split('T')[0]}.json`);
}

function openImport(){openImportExport();}

// ═══════════════════════════════════════════════
// HISTORIQUE
// ═══════════════════════════════════════════════
function openHistorique(){
  let modal = document.getElementById('modal-historique');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-historique';
    modal.innerHTML = '<div class="modal-box" style="max-width:600px"><button class="modal-close" onclick="closeModal(\'modal-historique\')">✕</button><div class="modal-title">📋 Historique des séances</div><div id="histo-list" style="display:flex;flex-direction:column;gap:9px;max-height:440px;overflow-y:auto"></div></div>';
    document.body.appendChild(modal);
  }
  const sessions=getAllSessions().reverse();
  const list=document.getElementById('histo-list');
  if(!sessions.length){list.innerHTML='<div style="text-align:center;color:var(--text2);padding:24px;font-style:italic">Aucune séance enregistrée.</div>';}
  else{
    list.innerHTML=sessions.slice(0,60).map(s=>{
      const pr=PROTOCOLS.find(p=>p.id===s.protocol);
      const date=new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
      const experts=(s.college_experts||[]).slice(0,2).join(', ');
      return '<div style="background:var(--fond);border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div><div style="font-weight:600;font-size:13px">' + (pr?.emoji||'🌀') + ' ' + (s.protocol_name||s.protocol||'Séance') + ' — S' + (s.session_num||1) + '</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:2px">' + date + ' · ' + (s.duration_min||0) + ' min · Profondeur ' + (s.depth_final||0).toFixed(1) + '/10</div>' +
        (experts ? '<div style="font-size:10px;color:var(--gold);margin-top:3px">🎓 ' + experts + '</div>' : '') +
        (s.notes ? '<div style="font-size:10px;color:var(--text2);margin-top:4px;font-style:italic">"' + s.notes.substring(0,80) + (s.notes.length>80?'...':'') + '"</div>' : '') +
        '</div><div style="font-size:18px;font-family:\'Cormorant Garamond\',serif;font-weight:600;color:var(--mer-dark)">' + (s.wellbeing||'—') + '/10</div></div>';
    }).join('');
  }
  openModal('modal-historique');
}

function download(content,type,filename){const b=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=filename;a.click();}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function showToast(msg,type='default'){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show'+(type!=='default'?' '+type:'');setTimeout(()=>t.className='toast',2800);}
function autoResize(ta){ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,110)+'px';}

// ── Import session JSON (stub — referenced in HTML) ──
function importSessionJSON(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.sessions && Array.isArray(data.sessions)) {
        const existing = getAllSessions();
        const merged = [...existing, ...data.sessions];
        saveSessions(merged);
        showToast('📤 ' + data.sessions.length + ' séance(s) importée(s)', 'success');
        updateStats();
        updateHero();
      } else if (data.protocol || data.session_num) {
        const existing = getAllSessions();
        existing.push(data);
        saveSessions(existing);
        showToast('📤 1 séance importée', 'success');
        updateStats();
        updateHero();
      } else {
        showToast('⚠️ Format JSON non reconnu', 'error');
      }
    } catch(err) {
      showToast('⚠️ Erreur de lecture JSON', 'error');
      console.error('[Import]', err);
    }
  };
  reader.readAsText(file);
}
