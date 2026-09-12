/* RAPIDE-CHAR-00 — HARNAIS DE CARACTÉRISATION DU PIPELINE RAPIDE
 *
 * Ce fichier n'est PAS une suite de tests (il ne correspond pas au glob
 * `tests/*.test.mjs`) : c'est un helper d'espace de test.
 *
 * Il charge, dans un contexte vm isolé :
 *   1. le bloc <script> du moteur commun/Rapide du HTML de production
 *      (FORMATS, PROFILS, VERROUS, SECTIONS, contexte, assembler,
 *       contratDuPrompt, detecterFormat, detecterQuantite…) ;
 *   2. le runtime ADN navigateur généré (selectAdaptiveLocks, projectToRapide,
 *      buildExecutionEnvelope) ;
 *   3. le fragment de colle ADN du contrôleur v11 (adnBuildEnvelope,
 *      adnRefineRapidEnvelope, adnMergeLegacyLocks, adnQuantitiesFromRapid).
 *
 * AUCUN appel réseau, AUCUNE clé API, AUCUN LLM, AUCUN Worker.
 * Aucun code de production n'est modifié : le HTML est lu, jamais réécrit.
 *
 * Ce harnais est délibérément AUTONOME vis-à-vis de celui d'ARCH-CHAR-00,
 * pour que les deux lots restent auditables indépendamment l'un de l'autre.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html');
const ADN_RUNTIME = path.join(root, 'core/adn/browser-runtime.generated.js');

const lines = fs.readFileSync(HTML, 'utf8').split('\n');
const adnRuntimeSource = fs.readFileSync(ADN_RUNTIME, 'utf8');

/* Bloc <script> du moteur commun et Rapide, localisé par ANCRE DE CONTENU.
 * Les numéros de ligne étaient figés : toute insertion de balisage en amont les
 * décalait et faisait échouer le harnais pour une raison sans rapport avec
 * Rapide. assertSourceBounds() vérifie que l'ancre désigne exactement un bloc. */
const ENGINE_ANCHOR = 'function estimerTokens(';
function engineBlock() {
  const found = [];
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^<script/.test(lines[i])) open = i + 1;
    else if (/^<\/script>/.test(lines[i]) && open !== -1) {
      if (lines.slice(open, i).some((l) => l.includes(ENGINE_ANCHOR))) found.push({ from: open, to: i });
      open = -1;
    }
  }
  return { name: 'moteur-rapide-et-communs', matches: found.length, ...(found[0] || { from: -1, to: -1 }) };
}
const ENGINE_BLOCK = engineBlock();

/* Fragment de colle ADN du contrôleur v11 : de `function adnRuntime(` à la fin
 * de `adnAppendFinalExecutionDirective`. On n'emprunte que ce fragment, car le
 * reste du contrôleur dépend d'un DOM applicatif complet sans rapport avec la
 * compilation Rapide.
 *
 * Les bornes sont TEXTUELLES et non numériques : une version antérieure de ce
 * harnais figeait des numéros de ligne, que toute insertion en amont décalait.
 * assertSourceBounds() vérifie en plus que les quatre fonctions attendues sont
 * bien dans le fragment chargé. */
const ADN_GLUE_BLOCK = Object.freeze({
  name: 'colle-adn-v11',
  start: 'function adnRuntime(){',
  end: 'function adnCompactContractForArchitecte('
});

function adnGlueSource() {
  const a = lines.join('\n').indexOf(ADN_GLUE_BLOCK.start);
  const b = lines.join('\n').indexOf(ADN_GLUE_BLOCK.end, a);
  return a === -1 || b === -1 ? '' : lines.join('\n').slice(a, b);
}

export function assertSourceBounds() {
  const problems = [];
  if (ENGINE_BLOCK.matches !== 1) problems.push(`${ENGINE_BLOCK.name}: ancre « ${ENGINE_ANCHOR} » trouvée dans ${ENGINE_BLOCK.matches} bloc(s) <script>, attendu 1`);
  else {
    if (!/^<script/.test(lines[ENGINE_BLOCK.from - 1] || '')) problems.push(`${ENGINE_BLOCK.name}: ligne ${ENGINE_BLOCK.from} n'ouvre pas un <script>`);
    if (!/^<\/script>/.test(lines[ENGINE_BLOCK.to] || '')) problems.push(`${ENGINE_BLOCK.name}: ligne ${ENGINE_BLOCK.to + 1} ne ferme pas le <script>`);
  }
  const glue = adnGlueSource();
  if (!glue) problems.push(`${ADN_GLUE_BLOCK.name}: fragment introuvable entre les ancres`);
  for (const name of ['adnBuildEnvelope', 'adnRefineRapidEnvelope', 'adnMergeLegacyLocks', 'adnQuantitiesFromRapid']) {
    if (!glue.includes(`function ${name}(`)) problems.push(`${ADN_GLUE_BLOCK.name}: ${name} absent du fragment`);
  }
  return problems;
}

function makeElement(id) {
  const classes = new Set();
  return {
    id,
    value: '', textContent: '', innerHTML: '', className: '',
    checked: false, hidden: false, dataset: {}, children: [], options: [], files: [],
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))),
      contains: (c) => classes.has(c)
    },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    focus() {}, blur() {}, scrollIntoView() {},
    appendChild(child) { this.children.push(child); return child; },
    remove() {}, setAttribute() {}, getAttribute() { return null; }, closest() { return null; },
    querySelector() { return makeElement('descendant'); },
    querySelectorAll() { return [makeElement('d0'), makeElement('d1'), makeElement('d2')]; }
  };
}

/**
 * Construit un contexte Rapide isolé.
 *
 * @param {object} [options]
 * @param {string} [options.demande]   valeur de #rapide-demande
 * @param {string} [options.materiau]  valeur de #rapide-texte
 */
export function createRapideHarness({ demande = '', materiau = '' } = {}) {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const domReady = [];
  const network = [];

  const document = {
    readyState: 'complete',
    getElementById: (id) => el(String(id)),
    querySelector: (sel) => {
      const s = String(sel);
      return s.startsWith('#') ? el(s.slice(1)) : el(s);
    },
    querySelectorAll: () => [],
    createElement: () => makeElement('created'),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') domReady.push(fn); },
    removeEventListener() {},
    body: makeElement('body'),
    documentElement: makeElement('html')
  };

  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  /* Toute tentative réseau est ENREGISTRÉE puis REFUSÉE : c'est ce qui rend
   * la preuve d'absence de réseau démonstrative et non déclarative. */
  const refuse = (kind) => (...args) => {
    network.push({ kind, arg: String(args[0] ?? '') });
    throw new Error(`RAPIDE-CHAR-00 : appel réseau interdit pendant la caractérisation (${kind}).`);
  };

  const win = {
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    localStorage
  };

  const context = {
    window: win, document, localStorage,
    console: { log() {}, warn() {}, error() {}, info() {} },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'rapide-char-00' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Intl, Math, Date, JSON,
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    FileReader: class { readAsText() {} },
    Blob: class {},
    URL: { createObjectURL: () => 'blob:none', revokeObjectURL() {} },
    AbortController,
    fetch: refuse('fetch'),
    XMLHttpRequest: function () { throw new Error('RAPIDE-CHAR-00 : XMLHttpRequest interdit.'); },
    WebSocket: function () { throw new Error('RAPIDE-CHAR-00 : WebSocket interdit.'); },
    EventSource: function () { throw new Error('RAPIDE-CHAR-00 : EventSource interdit.'); }
  };
  context.globalThis = context;
  context.self = context;
  win.document = document;
  win.fetch = context.fetch;

  vm.createContext(context);

  /* 1. runtime ADN navigateur — s'installe sur `window`. */
  vm.runInContext(adnRuntimeSource, context, { filename: 'core/adn/browser-runtime.generated.js' });

  /* 2. moteur commun + Rapide. */
  vm.runInContext(lines.slice(ENGINE_BLOCK.from, ENGINE_BLOCK.to).join('\n'), context, { filename: `atelier:${ENGINE_BLOCK.name}` });

  /* 3. colle ADN du contrôleur v11 : `adpState` est la seule dépendance
   *    ambiante du fragment ; on la fournit telle que le contrôleur la crée. */
  vm.runInContext('var adpState={lastEnvelope:null,lastProjection:null,requestedMode:"rapide",pendingQuestion:false};', context);
  vm.runInContext(adnGlueSource(), context, { filename: `atelier:${ADN_GLUE_BLOCK.name}` });

  for (const fn of domReady) fn();

  /* Les champs sont posés après l'initialisation, comme dans l'usage réel. */
  el('rapide-demande').value = demande;
  el('rapide-texte').value = materiau;

  const ev = (expression) => vm.runInContext(expression, context);

  /* Passerelle vers les liaisons lexicales de haut niveau du bloc <script> :
   * elles ne sont pas des propriétés du contexte et doivent être évaluées. */
  const bind = (name) => ev(name);

  return {
    context,
    element: el,
    network,
    evaluate: ev,

    /* ---- bibliothèque de projection legacy (lecture seule) ---- */
    get FORMATS() { return bind('FORMATS'); },
    get PROFILS() { return bind('PROFILS'); },
    get VERROUS() { return bind('VERROUS'); },
    get SECTIONS() { return bind('SECTIONS'); },
    get SEUILS() { return bind('SEUILS'); },
    get etat() { return bind('etat'); },

    /* ---- producteurs et compilateur legacy ---- */
    detecterFormat: (texte) => ev('detecterFormat')(texte),
    detecterQuantite: (texte) => ev('detecterQuantite')(texte),
    profilDuFormat: (format) => ev('profilDuFormat')(format),
    actifsAdaptes: (verrous, ctx) => [...ev('actifsAdaptes')(verrous, ctx)],
    contexte: (d, format, niveau, champs) => ev('contexte')(d, format, niveau, champs || {}),
    assembler: (ctx, actifs) => ev('assembler')(ctx, actifs),
    contratDuPrompt: (ctx, actifs) => ev('contratDuPrompt')(ctx, actifs),
    rapideFormatAdaptatif: () => ev('rapideFormatAdaptatif')(),
    assemblerRapideAdaptatif: () => ev('assemblerRapideAdaptatif')(),

    /* ---- couche ADN ---- */
    adnRuntime: () => ev('adnRuntime')(),
    adnBuildEnvelope: (d, m, provider, extras) => ev('adnBuildEnvelope')(d, m, provider, extras || {}),
    adnQuantitiesFromRapid: (ctx) => ev('adnQuantitiesFromRapid')(ctx),
    adnRefineRapidEnvelope: (r, orientation, materiau) => ev('adnRefineRapidEnvelope')(r, orientation, materiau),
    adnMergeLegacyLocks: (existing, projection) => [...ev('adnMergeLegacyLocks')(existing, projection)],

    setDemande(value) { el('rapide-demande').value = value; },
    setMateriau(value) { el('rapide-texte').value = value; }
  };
}

/* Correspondance officielle CDC v1.5 §4 entre identifiants legacy français
 * et catalogue canonique des 13 verrous. */
export const LEGACY_TO_CANONICAL = Object.freeze({
  role: 'role',
  destinataire: 'recipient',
  donnees: 'data',
  provenance: 'provenance',
  perimetre: 'scope',
  gabarit: 'plan',
  format: 'format',
  volume: 'volume',
  amorce: 'opening_closing',
  interdits: 'forbidden',
  hypotheses: 'assumptions',
  longueur: 'length',
  controle: 'final_check'
});

export const CANONICAL_LOCK_IDS = Object.freeze([
  'role', 'recipient', 'data', 'provenance', 'scope', 'plan', 'format',
  'volume', 'opening_closing', 'forbidden', 'assumptions', 'length', 'final_check'
]);

export function toCanonical(legacyIds) {
  /* Le spread ramène le résultat dans le realm de Node : les tableaux issus du
   * contexte vm ne sont pas comparables par assert.deepEqual (prototypes
   * distincts). Même raison d'être que plain() ci-dessous. */
  return [...(legacyIds || [])].map((id) => LEGACY_TO_CANONICAL[id] || id);
}

/* Normalise une valeur produite dans le contexte vm vers le realm de Node,
 * afin de la comparer avec assert.deepEqual. À n'utiliser que sur des données
 * sérialisables : jamais sur `ctx`, qui porte des RegExp (ctx.fmt.compteur). */
export function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Reproduit le chemin de production Rapide tel qu'il existe aujourd'hui :
 *   assemblerRapideAdaptatif() → adnRefineRapidEnvelope() → projectToRapide()
 *   → adnMergeLegacyLocks() → assembler()
 * Voir adpRunRapide() dans le HTML de production.
 */
export function runRapidePipeline({ demande, materiau = '', orientation = null } = {}) {
  const harness = createRapideHarness({ demande, materiau });
  const orient0 = orientation || null;
  /* ADN-RAPIDE-01 : adpRunRapide() pose la source sémantique AVANT d'assembler.
     Le harnais reproduit cet ordre, sans quoi il mesurerait le chemin legacy. */
  harness.evaluate('typeof rapideAppliquerContratCanonique==="function"')
    && harness.context.rapideAppliquerContratCanonique((orient0 && orient0.canonical) || null);
  const r = harness.assemblerRapideAdaptatif();
  if (!r) return { harness, r: null, promptLegacy: '', promptFinal: '', legacyLocks: [], adnLocks: [], mergedLocks: [] };

  const orient = orientation || {
    source: 'oprie', route: 'rapide', oprie: { state: 'operational_request_ready' },
    envelope: null, semantic: null, providerResult: null, action: null,
    decision: { state: 'ready' }
  };

  const refined = harness.adnRefineRapidEnvelope(r, orient, materiau);
  const projection = harness.adnRuntime().projectToRapide(refined, { material: materiau, format: r.ctx.format, level: r.niveau });
  const merged = harness.adnMergeLegacyLocks(r.actifs, projection);
  const promptFinal = harness.assembler(r.ctx, merged);

  return {
    harness,
    r,
    ctx: r.ctx,
    envelope: refined,
    projection,
    promptLegacy: r.prompt,
    promptFinal,
    legacyLocks: [...r.actifs],
    adnLocks: [...projection.lock_ids],
    adnLegacyLocks: [...projection.legacy_lock_ids],
    mergedLocks: merged,
    contrat: harness.contratDuPrompt(r.ctx, merged)
  };
}

/** Découpe un prompt en sections `## TITRE` -> corps, dans l'ordre rencontré. */
export function sectionsOf(prompt) {
  const out = [];
  const re = /^## (.+)$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(String(prompt || '')))) marks.push({ title: m[1].trim(), start: m.index, bodyStart: m.index + m[0].length });
  for (let i = 0; i < marks.length; i += 1) {
    const end = i + 1 < marks.length ? marks[i + 1].start : String(prompt).length;
    out.push({ title: marks[i].title, body: String(prompt).slice(marks[i].bodyStart, end).trim() });
  }
  return out;
}

export function sectionTitles(prompt) {
  return sectionsOf(prompt).map((s) => s.title);
}

export function sectionBody(prompt, title) {
  const found = sectionsOf(prompt).find((s) => s.title === title);
  return found ? found.body : null;
}

export function hasSection(prompt, title) {
  return sectionTitles(prompt).includes(title);
}
