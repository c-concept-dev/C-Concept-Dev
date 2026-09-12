/* ARCH-CHAR-00 — HARNAIS DE CARACTÉRISATION archCompiler
 *
 * Ce fichier n'est PAS une suite de tests (il ne correspond pas au glob
 * `tests/*.test.mjs`) : c'est un helper d'espace de test.
 *
 * Il charge les trois blocs <script> du HTML de production nécessaires à
 * archCompiler(), dans un contexte vm isolé, avec un DOM et un localStorage
 * simulés. AUCUN appel réseau, AUCUNE clé API, AUCUN LLM, AUCUN Worker.
 *
 * Aucun code de production n'est modifié : le HTML est lu, jamais réécrit.
 * archCompiler n'est pas appelé directement — il est atteint par l'API
 * publique que le moteur expose lui-même, window.__ARCHITECTE_V10__, afin
 * que le harnais ne dépende d'aucun détail interne.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html');
const RUNTIME = path.join(root, 'core', 'adn', 'browser-runtime.generated.js');
const lines = fs.readFileSync(HTML, 'utf8').split('\n');

/* Bornes des trois blocs <script> réellement nécessaires.
 * Elles sont vérifiées à l'exécution par assertScriptBounds() : si le HTML
 * bouge, le harnais échoue bruyamment au lieu de charger un fragment faux. */
/* Seule l'OUVERTURE de chaque bloc est figée : la fermeture est trouvée en
 * suivant le premier `</script>` qui suit. Un lot qui allonge un bloc de
 * production ne fait donc plus échouer le harnais pour une raison de bornes —
 * mais `assertScriptBounds()` continue de vérifier que la ligne d'ouverture
 * ouvre bien un <script> et que la fermeture trouvée en ferme bien un. */
/* Les blocs sont localisés par ANCRE DE CONTENU, jamais par numéro de ligne :
 * un lot qui ajoute du balisage au-dessus des <script> ne fait plus échouer le
 * harnais pour une raison de bornes. `assertScriptBounds()` reste la garde :
 * chaque ancre doit être trouvée dans exactement un bloc <script>. */
const BLOCK_ANCHORS = [
  { name: 'moteur-rapide-et-communs', anchor: 'function estimerTokens(' },
  { name: 'proportion', anchor: 'function qResoudreProportion(' },
  { name: 'architecte', anchor: 'const ARCH_SCHEMA=' }
];

/** Toutes les paires <script> … </script> du document, en numéros de ligne. */
function scriptRanges() {
  const out = [];
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^<script/.test(lines[i])) open = i + 1;
    else if (/^<\/script>/.test(lines[i]) && open !== -1) { out.push({ from: open, to: i }); open = -1; }
  }
  return out;
}

const RANGES = scriptRanges();
const BLOCKS = BLOCK_ANCHORS.map((b) => {
  const found = RANGES.filter((r) => lines.slice(r.from, r.to).some((l) => l.includes(b.anchor)));
  return { ...b, ...(found.length === 1 ? found[0] : { from: -1, to: -1 }), matches: found.length };
});

export function assertScriptBounds() {
  const problems = [];
  for (const b of BLOCKS) {
    if (b.matches !== 1) { problems.push(`${b.name}: ancre « ${b.anchor} » trouvée dans ${b.matches} bloc(s) <script>, attendu 1`); continue; }
    if (!/^<script/.test(lines[b.from - 1] || '')) problems.push(`${b.name}: ligne ${b.from} n'ouvre pas un <script>`);
    if (!/^<\/script>/.test(lines[b.to] || '')) problems.push(`${b.name}: ligne ${b.to + 1} ne ferme pas le <script>`);
  }
  return problems;
}

function makeElement(id) {
  const classes = new Set();
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    checked: false,
    hidden: false,
    dataset: {},
    children: [],
    options: [],
    files: [],
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))),
      contains: (c) => classes.has(c),
      get size() { return classes.size; }
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    focus() {},
    blur() {},
    scrollIntoView() {},
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
    /* archRendu() construit la carte d'un composant en innerHTML puis câble
     * ses champs par index : `d.querySelectorAll('input,textarea')[0..2]`.
     * Un stub renvoyant null ou un tableau vide ferait échouer le harnais sur
     * du code de production parfaitement valide — on renvoie donc des
     * descendants factices, en nombre suffisant pour ce câblage. */
    querySelector() { return makeElement('descendant'); },
    querySelectorAll() { return [makeElement('d0'), makeElement('d1'), makeElement('d2')]; }
  };
}

/**
 * Construit un contexte Architecte isolé.
 *
 * @param {object} options
 * @param {string} options.demande            valeur de #arch-demande
 * @param {string} [options.materiau]         valeur de #arch-materiau
 * @param {object} [options.reglages]         { destinataire, detail, structure, volume, densite, maxLivrable, profondeurAccueil }
 * @param {Array}  [options.preferences]      contenu de localStorage 'atelier10.preferences'
 */
export function createArchitecteHarness({ demande = '', materiau = '', reglages = {}, preferences = [] } = {}) {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const setValue = (id, v) => { el(id).value = v == null ? '' : String(v); };

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
  store.set('atelier10.preferences', JSON.stringify(preferences));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  /* Toute tentative réseau est enregistrée ET refusée : c'est ce qui permet
   * à T-ARCHCHAR-18 de prouver que la compilation est purement locale. */
  const refuse = (kind) => (...args) => {
    network.push({ kind, arg: String(args[0] ?? '') });
    throw new Error(`ARCH-CHAR-00 : appel réseau interdit pendant la caractérisation (${kind}).`);
  };

  const win = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    localStorage
  };

  const context = {
    window: win,
    document,
    localStorage,
    console: { log() {}, warn() {}, error() {}, info() {} },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'arch-char-00' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Intl, Math, Date, JSON,
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    FileReader: class { readAsText() {} },
    Blob: class {},
    URL: { createObjectURL: () => 'blob:none', revokeObjectURL() {} },
    AbortController,
    fetch: refuse('fetch'),
    XMLHttpRequest: function () { throw new Error('ARCH-CHAR-00 : XMLHttpRequest interdit.'); },
    WebSocket: function () { throw new Error('ARCH-CHAR-00 : WebSocket interdit.'); },
    EventSource: function () { throw new Error('ARCH-CHAR-00 : EventSource interdit.'); }
  };
  context.globalThis = context;
  context.self = context;
  win.document = document;
  win.fetch = context.fetch;

  vm.createContext(context);
  /* ADN-ARCH-02 — le compilateur projette le contrat canonique enrichi via
     `canonicalToArchProjectionInput()`, qui vit dans le noyau ADN. Le harnais
     charge donc le bundle navigateur RÉELLEMENT expédié (mêmes octets que dans
     le HTML), au lieu d'en réimplémenter une seconde version. */
  vm.runInContext(fs.readFileSync(RUNTIME, 'utf8'), context, { filename: 'atelier:adn-runtime' });
  for (const b of BLOCKS) {
    vm.runInContext(lines.slice(b.from, b.to).join('\n'), context, { filename: `atelier:${b.name}` });
  }

  /* Le moteur Architecte s'initialise lui-même sur DOMContentLoaded ; c'est
   * archDemarrer() qui publie window.__ARCHITECTE_V10__. On déclenche donc
   * l'événement plutôt que d'accéder à des liaisons internes de l'IIFE. */
  for (const fn of domReady) fn();

  /* Les valeurs de champs sont posées APRÈS le démarrage : archDemarrer()
   * restaure les réglages persistés et écraserait des valeurs posées avant.
   * Cet ordre reproduit aussi l'usage réel — la personne saisit après le
   * chargement de l'application. */
  setValue('arch-demande', demande);
  setValue('arch-materiau', materiau);
  setValue('arch-destinataire', reglages.destinataire);
  setValue('arch-detail', reglages.detail ?? 'auto');
  setValue('arch-structure', reglages.structure ?? 'auto');
  setValue('arch-volume', reglages.volume);
  setValue('arch-densite', reglages.densite ?? 'auto');
  setValue('arch-max-livrable', reglages.maxLivrable);
  if (reglages.profondeurAccueil !== undefined) setValue('accueil-profondeur', reglages.profondeurAccueil);

  const api = context.window.__ARCHITECTE_V10__;
  if (!api) throw new Error('ARCH-CHAR-00 : __ARCHITECTE_V10__ non exposé — le harnais n’a pas pu initialiser le moteur.');

  return {
    api,
    context,
    element: el,
    network,
    /** Renseigne archAnalyse via le chemin de production (validation incluse). */
    importer(analyse) { return api.importer(analyse); },
    valider(analyse) { return [...api.valider(analyse)]; },
    /** ADN-ARCH-02 : le contrat canonique enrichi est la SEULE entrée sémantique. */
    compiler(contrat, apercu) { return api.compiler(contrat, apercu); },
    appliquerContrat(contrat) { return api.appliquerContrat(contrat); },
    get contratCanonique() { return api.contratCanonique; },
    get runtime() { return context.window.__ATELIER_ADN_RUNTIME__; },
    contexte() { return api.contexte(); },
    get analyse() { return api.analyse; },
    get composants() { return api.composants; },
    /* `etat` est déclaré en liaison lexicale de haut niveau : il n'apparaît pas
     * comme propriété du contexte et doit être lu par évaluation. */
    evaluate(expression) { return vm.runInContext(expression, context); },
    /** `etat` du moteur commun, où archCompiler écrit prompt/demande/contrat. */
    get etat() { return vm.runInContext('etat', context); },
    /** Contenu écrit dans le DOM par archCompiler. */
    get sortieDOM() { return el('arch-sortie').textContent; },
    get compteDOM() { return el('arch-compte').textContent; },
    get statutDOM() { return el('arch-statut').textContent; }
  };
}

/** Découpe un prompt en sections `## TITRE` -> corps, dans l'ordre rencontré. */
export function sectionsOf(prompt) {
  const out = [];
  const re = /^## (.+)$/gm;
  let m;
  const marks = [];
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

/**
 * Fixture archAnalyse 3.4 minimale et VALIDE, volontairement neutre :
 * aucun vocabulaire métier n'est requis par les assertions génériques.
 * `overrides` permet de remplacer bloc par bloc (fusion superficielle).
 */
export function analyseFixture(overrides = {}) {
  const base = {
    version: '3.4',
    comprehension: {
      intention_principale: 'Produire le livrable demandé par la personne utilisatrice.',
      intentions_secondaires: [],
      declarations: [],
      contraintes: [],
      ambiguites: [],
      informations_manquantes: []
    },
    evaluation: {
      niveau_risque: 'faible',
      justification_risque: 'Aucun facteur aggravant identifié dans la demande.',
      connaissance_externe_necessaire: false,
      actualite_requise: false,
      justification_connaissance: 'La demande se suffit à elle-même.',
      calcul_requis: false,
      livrable_complet_possible: true,
      reponse_partielle_possible: false,
      action_recommandee: 'continuer',
      questions_a_poser: [],
      parties_realisables_immediatement: []
    },
    strategie: {
      capacites_necessaires: [],
      hypotheses_autorisees: [],
      hypotheses_interdites: [],
      /* archValider exige intitule, mission ET des tableaux competences/limites
       * non vides : la fixture les renseigne de façon neutre, sans métier. */
      role_adaptatif: {
        intitule: 'spécialiste du livrable demandé',
        mission: 'Produire un livrable conforme au cadrage.',
        competences: ['structuration du livrable'],
        limites: ['ne rien produire hors du périmètre décrit']
      },
      niveau_architecture: 'standard',
      justification_niveau: 'Le cadrage est proportionné à la demande.',
      pilotage_incertitude: {
        decisions_autonomes: [],
        estimations_a_etiqueter: [],
        inconnues_non_devineables: []
      }
    },
    livrable: {
      nature: 'un livrable structuré',
      format_technique: 'texte',
      quantites: null,
      ton: 'neutre',
      longueur_indicative: 'proportionnée à la tâche'
    },
    compilation: { composants_retenus: [], composants_ecartes: [] },
    verification: {
      criteres_bloquants: [],
      criteres_qualitatifs: [],
      elements_non_verifiables: [],
      controle_provenance: []
    },
    apprentissage: { preferences_applicables: [], preference_proposable: null }
  };
  const out = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? { ...base[k], ...v }
      : v;
  }
  return out;
}

/** Raccourci : harnais + import d'une analyse + contrat canonique enrichi.
 *  ADN-ARCH-02 : la compilation reçoit TOUJOURS un contrat, jamais une analyse.
 *  `arbiter` permet de faire varier la partie OPRIE du contrat ; `contrat`
 *  permet de fournir directement un contrat déjà construit (ou `null` pour
 *  caractériser le refus fail-closed). */
export function compileWith({ demande = 'Demande de caractérisation.', materiau = '', reglages = {}, preferences = [], analyse = analyseFixture(), arbiter, contrat, apercu } = {}) {
  const h = createArchitecteHarness({ demande, materiau, reglages, preferences });
  const imported = h.importer(analyse);
  const contract = contrat !== undefined
    ? contrat
    : enrichedContractFixture(h, { arbiter: arbiter || arbiterFixture(), demande, analyse });
  const prompt = imported ? h.compiler(contract, apercu) : '';
  return { harness: h, imported, prompt, contract };
}

/* ==========================================================================
 * ADN-ARCH-02 — FIXTURES DU CONTRAT CANONIQUE
 *
 * Le compilateur ne consomme plus archAnalyse : il projette le CONTRAT
 * CANONIQUE ENRICHI. Les fixtures ci-dessous construisent ce contrat par le
 * chemin de production exact — `mapOprieToCanonicalContract()` d'abord, puis
 * `enrichCanonicalContractFromArchAnalysis()` — pour qu'aucun test ne se repose
 * sur une forme canonique fabriquée à la main.
 * ======================================================================= */

/** Sortie Arbiter minimale et VALIDE, alignée par défaut sur `analyseFixture()`.
 *  Aucun vocabulaire métier : uniquement des champs structurels. */
export function arbiterFixture(overrides = {}) {
  const base = {
    state: 'operational_request_ready',
    reason: 'La demande est exploitable en l’état.',
    issues: [],
    operational_request_candidate: {
      objective: 'Produire le livrable demandé par la personne utilisatrice.',
      expected_deliverable: 'un livrable structuré',
      secondary_objectives: [],
      confirmed_constraints: [],
      confirmed_priorities: [],
      confirmed_preferences: [],
      delegated_decisions: [],
      assumptions_allowed: [],
      remaining_unknowns: [],
      external_facts_to_research: []
    },
    intent_preservation: {
      objective_preserved: true, priorities_preserved: true,
      semantic_equivalence: true, concerns: []
    }
  };
  const out = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? { ...base[k], ...v }
      : v;
  }
  return out;
}

/** Canonical Base Contract produit par le mapper de production. */
export function canonicalBaseFixture(harness, { arbiter = arbiterFixture(), demande = 'Demande de caractérisation.', requestId = 'arch-char-00' } = {}) {
  return harness.runtime.mapOprieToCanonicalContract(arbiter, { request_id: requestId, original_request: demande });
}

/** Contrat canonique ENRICHI, par le chemin de production exact. */
export function enrichedContractFixture(harness, { arbiter, demande, analyse = analyseFixture() } = {}) {
  const base = canonicalBaseFixture(harness, { arbiter: arbiter || arbiterFixture(), demande: demande || 'Demande de caractérisation.' });
  return harness.runtime.enrichCanonicalContractFromArchAnalysis(base, analyse).contract;
}
