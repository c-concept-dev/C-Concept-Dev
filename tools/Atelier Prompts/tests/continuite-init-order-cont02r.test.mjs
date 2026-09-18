/* CONTINUITE-02R — L'ORDRE D'INITIALISATION, ÉPROUVÉ SUR LA PAGE ENTIÈRE
 * ============================================================================
 *
 * LE DÉFAUT, MESURÉ PAR LE SMOKE D'INTÉGRATION DE CONTINUITE-04. Six gestionnaires DOMContentLoaded,
 * dans l'ordre d'enregistrement : fournisseurs (bloc 1), demarrer() (bloc 1), archDemarrer() (bloc
 * 3), qualité (bloc 3), init() du contrôleur V11 (bloc 4, qui termine par v11SessionRestore et
 * show('#v11-ready')), puis la façade (bloc 5) : setMode(currentMode()) → resetModePresentation →
 * #v11-api-progress, #v11-exchange, #v11-dialogue, #v11-ready et #ui-rapid-gate masqués. La
 * restauration était donc annulée visuellement par une initialisation exécutée ENSUITE — ce que les
 * tests de CONTINUITE-02, qui exécutaient v11SessionRestore isolément, ne pouvaient pas voir.
 *
 * LA CORRECTION. La façade s'initialise au parse (elle est placée après tout le balisage qu'elle
 * touche) : ses remises à zéro de présentation précèdent DOMContentLoaded par construction du cycle
 * de vie du document. init() — et sa dernière étape, la restauration — est alors la dernière
 * autorité de présentation. La restauration applique le mode AVANT de rendre le résultat, par le
 * gestionnaire `change` que la façade écoute déjà. Aucun délai, aucune observation, aucun rejeu.
 *
 * CE FICHIER charge la PAGE ENTIÈRE (cinq blocs <script>, runtime embarqué) dans un contexte isolé,
 * avec un DOM simulé, un sessionStorage préparé, un réseau qui REFUSE — et exécute tous les
 * gestionnaires DOMContentLoaded dans leur ordre d'enregistrement.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { html } from './perf04-frontend-harness.helper.mjs';

const KEY = 'atelier.v11.session';
const lignes = html.split('\n');
const metas = Object.fromEntries([...html.matchAll(/<meta name="([^"]+)" content="([^"]+)">/g)].map((m) => [m[1], m[2]]));
const hiddenInMarkup = new Set([...html.matchAll(/<[a-z]+[^>]*\sid="([^"]+)"[^>]*\shidden[\s>]/g)].map((m) => m[1]));
const selectOptions = {};
for (const m of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
  selectOptions[m[1]] = [...m[2].matchAll(/<option value="([^"]*)"([^>]*)>/g)].map((o) => ({ value: o[1], selected: /selected/.test(o[2]) }));
}
const blocs = [];
{ let open = -1;
  for (let i = 0; i < lignes.length; i += 1) {
    if (/^<script/.test(lignes[i])) open = i + 1;
    else if (/^<\/script>/.test(lignes[i]) && open !== -1) { blocs.push({ from: open, to: i, tag: lignes[open - 1] }); open = -1; }
  } }

/** La page entière, à froid. `session` : la photographie déjà présente dans sessionStorage. */
function chargerPageEntiere({ session = null, sensible = false } = {}) {
  const elements = new Map();
  const journal = { reseau: [], avertissements: [], domReady: [], ordre: [], setMode: [], resets: [] };
  function makeElement(id, tag = 'div') {
    const classes = new Set(); const listeners = new Map();
    const el = {
      id, tagName: tag.toUpperCase(), value: '', textContent: '', innerHTML: '', className: '', type: '', checked: false,
      hidden: hiddenInMarkup.has(id), disabled: false, dataset: {}, style: {}, children: [], options: [], files: [], selectedIndex: 0, attrs: {}, placeholder: '', readOnly: false,
      classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, on) => { const want = on === undefined ? !classes.has(c) : !!on; if (want) classes.add(c); else classes.delete(c); return want; }, contains: (c) => classes.has(c) },
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); }, removeEventListener() {},
      dispatchEvent(ev) { try { if (!ev.target) ev.target = el; } catch {} for (const fn of listeners.get(ev.type) || []) fn(ev); return true; },
      click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
      focus() {}, blur() {}, scrollIntoView() {}, select() {},
      appendChild(c) { el.children.push(c); c.parentNode = el; return c; }, append(...c) { c.forEach((x) => el.appendChild(x)); }, prepend(...c) { el.children.unshift(...c); },
      insertBefore(c) { el.children.unshift(c); return c; }, remove() {}, removeChild(c) { el.children = el.children.filter((x) => x !== c); return c; },
      setAttribute(k, v) { el.attrs[k] = String(v); if (k === 'hidden') el.hidden = true; }, getAttribute(k) { return el.attrs[k] ?? null; },
      removeAttribute(k) { delete el.attrs[k]; if (k === 'hidden') el.hidden = false; }, hasAttribute(k) { return k in el.attrs; },
      closest() { return null; }, matches() { return false; }, contains() { return false; },
      querySelector(sel) { return byId(String(sel).replace(/^#/, '')); }, querySelectorAll() { return [makeElement('d0'), makeElement('d1'), makeElement('d2')]; },
      getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 10 }; },
      get parentElement() { return el.parentNode || makeElement('parent-of-' + id); }, get firstChild() { return el.children[0] || null; }, get childNodes() { return el.children; }
    };
    if (selectOptions[id]) { el.options = selectOptions[id].map((o) => ({ value: o.value })); const s = selectOptions[id].find((o) => o.selected) || selectOptions[id][0]; el.value = s ? s.value : ''; }
    /* Les deux points de présentation qui ont causé le défaut sont observés : chaque masquage de #v11-ready est daté. */
    if (id === 'v11-ready' || id === 'ui-rapid-gate') {
      let hidden = el.hidden;
      Object.defineProperty(el, 'hidden', { get: () => hidden, set: (v) => { hidden = !!v; journal.ordre.push(`${id}:${hidden ? 'masqué' : 'visible'}`); } });
    }
    return el;
  }
  const byId = (id) => { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); };
  const query = (sel) => { const s = String(sel).trim(); const meta = s.match(/^meta\[name="([^"]+)"\]$/); if (meta) return metas[meta[1]] ? { content: metas[meta[1]] } : null;
    const id = s.match(/#([\w-]+)/); return id ? byId(id[1]) : byId('sel:' + s); };
  const document = {
    readyState: 'loading', getElementById: (id) => byId(String(id)), querySelector: query, querySelectorAll: () => [],
    createElement: (tag) => makeElement('created:' + tag, tag), createTextNode: (t) => ({ textContent: t }), createDocumentFragment: () => makeElement('fragment'),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') journal.domReady.push(fn); }, removeEventListener() {},
    body: makeElement('body'), documentElement: makeElement('html'), head: makeElement('head'), activeElement: null, hidden: false, visibilityState: 'visible', cookie: ''
  };
  document.documentElement.dataset = {};
  const zones = { session: new Map(), local: new Map() };
  if (session) zones.session.set(KEY, JSON.stringify(session));
  if (sensible) zones.local.set('atelier.sensible', 'true');
  const storage = (z) => ({ getItem: (k) => (zones[z].has(k) ? zones[z].get(k) : null), setItem: (k, v) => zones[z].set(k, String(v)), removeItem: (k) => zones[z].delete(k), clear: () => zones[z].clear(), get length() { return zones[z].size; }, key: (i) => [...zones[z].keys()][i] });
  const refuse = (kind) => (...a) => { journal.reseau.push({ kind, url: String(a[0] || '').replace(/^https?:\/\/[^/]+/, '') }); throw new Error(`CONTINUITE-02R : réseau interdit au chargement (${kind}).`); };
  const context = {
    document, localStorage: storage('local'), sessionStorage: storage('session'),
    console: { log() {}, warn: (...a) => journal.avertissements.push(a.map(String).join(' ').slice(0, 160)), error: (...a) => journal.avertissements.push('ERROR ' + a.map(String).join(' ').slice(0, 160)), info() {}, debug() {} },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'cont02r', language: 'fr-FR', onLine: true },
    setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    Intl, Math, Date, JSON, Number, String, Array, Object, Promise, Map, Set, RegExp, Error, TypeError, Boolean, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, structuredClone,
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } preventDefault() {} stopPropagation() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } preventDefault() {} },
    MutationObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} },
    FileReader: class { readAsText() {} }, Blob: globalThis.Blob, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, AbortSignal, crypto: globalThis.crypto, performance: globalThis.performance,
    fetch: refuse('fetch'), XMLHttpRequest: function () { refuse('xhr')(); }, WebSocket: function () { refuse('ws')(); }, EventSource: function () { refuse('sse')(); },
    alert() {}, confirm: () => true, prompt: () => null, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
    location: { href: 'https://c-concept-dev.github.io/x', origin: 'https://c-concept-dev.github.io', protocol: 'https:', hash: '', search: '', pathname: '/' },
    history: { replaceState() {}, pushState() {} }, screen: { width: 1280, height: 800 }, innerWidth: 1280, innerHeight: 800, scrollTo() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, focus() {}
  };
  context.window = context; context.globalThis = context; context.self = context;
  vm.createContext(context);
  for (const b of blocs) { const src = lignes.slice(b.from, b.to).join('\n'); if (src.trim()) vm.runInContext(src, context, { filename: 'atelier:' + b.tag.replace(/[<>]/g, '') }); }
  /* Ce que le parse a déjà fait : la façade est-elle initialisée avant DOMContentLoaded ? */
  const modeAvantDomReady = document.body.dataset.v11Mode || null;
  const ordreAvantDomReady = journal.ordre.slice();
  document.readyState = 'interactive';
  const erreurs = [];
  for (const fn of journal.domReady) { try { fn(); } catch (e) { erreurs.push(e.message); } }
  document.readyState = 'complete';
  return { el: byId, journal, erreurs, zones, ctx: context, modeAvantDomReady, ordreAvantDomReady,
    snap: () => (zones.session.get(KEY) ? JSON.parse(zones.session.get(KEY)) : null), router: () => context.window.__V11_ROUTER__ };
}

const SESSION = (patch = {}, ui = {}) => ({
  version: 1, saved_at: '2026-09-18T12:00:00.000Z',
  state: { answers: [{ question: 'Quel est le délai ?', answer: 'Trois mois.', missing_determinant_id: 'delai' }],
    docs: [{ name: 'Réponse IA — cycle 1.txt', type: 'text/plain', size: 12, text: 'Voici le plan', external: false }],
    dialogueRequest: 'Prépare un plan de migration.', requestedMode: 'architecte', ...patch },
  ui: { demande: 'Prépare un plan de migration.', finalPrompt: 'PROMPT FINAL', continuation: null, ...ui }
});

/* ==========================================================================
 * L'AUTOPSIE, VÉRIFIÉE SUR LES OCTETS : QUI ÉCOUTE DOMContentLoaded, ET QUAND LA FAÇADE S'INITIALISE
 * ======================================================================= */

test('T0 · DOM_READY_MAP : cinq gestionnaires DOMContentLoaded, init() en dernier ; la façade ne les attend plus', () => {
  const refonte = html.slice(html.indexOf('<script id="ui-refonte-v115-lot1-script">'), html.indexOf('</script>', html.indexOf('<script id="ui-refonte-v115-lot1-script">')));
  assert.equal(/DOMContentLoaded/.test(refonte.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'la façade ne s’enregistre plus sur DOMContentLoaded');
  assert.match(refonte, /\(function initialiserFacade\(\)\{[\s\S]*setMode\(currentMode\(\)\);\n  \}\)\(\);/, 'elle s’initialise au parse');
  const controleur = html.slice(html.indexOf('<script id="v11-controller">'), html.indexOf('<script id="ui-refonte-v115-lot1-script">'));
  assert.match(controleur, /if\(document\.readyState==='loading'\)document\.addEventListener\('DOMContentLoaded',init,\{once:true\}\);else init\(\);/);
  assert.ok(html.indexOf('<script id="v11-controller">') < html.indexOf('<script id="ui-refonte-v115-lot1-script">'), 'la façade est le dernier bloc : elle voit tout le balisage');
  /* Et la page réelle, chargée : la façade a posé le mode AVANT DOMContentLoaded, et cinq gestionnaires restent. */
  const h = chargerPageEntiere();
  assert.equal(h.modeAvantDomReady, 'architecte', 'présentation du mode initialisée au parse');
  assert.equal(h.journal.domReady.length, 5, 'fournisseurs, demarrer, archDemarrer, qualité, init — la façade n’y est plus');
  assert.deepEqual(h.erreurs, []);
});

/* ==========================================================================
 * T1 → T3 — LES TROIS ÉTATS, AVEC TOUS LES GESTIONNAIRES, DANS L'ORDRE
 * ======================================================================= */

test('T1 · DOM_READY_ORDER_CURRENT_RESULT : prompt courant → #v11-ready visible à la FIN de tous les gestionnaires', () => {
  const h = chargerPageEntiere({ session: SESSION() });
  assert.deepEqual(h.erreurs, []);
  assert.equal(h.el('v11-ready').hidden, false, 'le résultat courant est présenté');
  assert.equal(h.el('v11-final').value, 'PROMPT FINAL');
  assert.equal(h.el('v11-demande').value, 'Prépare un plan de migration.');
  assert.equal(h.el('v11-copy-final').hidden, false); assert.equal(h.el('v11-continue').hidden, false, 'Copier et Continuer disponibles');
  assert.equal(h.el('ui-rapid-gate').hidden, true, 'aucun bandeau');
  /* La chronologie : la façade a masqué au parse (avant DOMContentLoaded) ; la restauration a rendu visible ; plus rien après. */
  assert.deepEqual(h.ordreAvantDomReady.filter((x) => x.startsWith('v11-ready')), ['v11-ready:masqué']);
  assert.equal(h.journal.ordre.filter((x) => x.startsWith('v11-ready')).slice(-1)[0], 'v11-ready:visible', 'le dernier mot est celui de la restauration');
});

test('T2 · DOM_READY_ORDER_STALE_RESULT : demande ≠ dialogueRequest → #v11-ready masqué à la FIN, bandeau « Demande modifiée » visible', () => {
  const h = chargerPageEntiere({ session: SESSION({}, { demande: 'Prépare un plan de migration en quatre étapes.' }) });
  assert.deepEqual(h.erreurs, []);
  assert.equal(h.el('v11-ready').hidden, true);
  assert.equal(h.el('v11-final').value, 'PROMPT FINAL', 'l’artefact est restauré, non exposé');
  assert.equal(h.el('ui-rapid-gate').hidden, false, 'le bandeau survit à toute l’initialisation');
  assert.equal(h.el('ui-rapid-gate-title').textContent, 'Demande modifiée');
  assert.equal(h.el('ui-rapid-gate').dataset.state, 'improvable');
  assert.equal(h.journal.ordre.filter((x) => x.startsWith('ui-rapid-gate')).slice(-1)[0], 'ui-rapid-gate:visible');
  assert.equal(h.el('v11-demande').value, 'Prépare un plan de migration en quatre étapes.');
});

test('T3 · CONTINUATION_RESTORE_FULL_INIT : zone « réponse prise en compte » → restaurée, visible, sans doublon', () => {
  const h = chargerPageEntiere({ session: SESSION({}, { continuation: { open: true, kind: 'precision', ingested: 'Réponse IA — cycle 1.txt' } }) });
  assert.deepEqual(h.erreurs, []);
  assert.equal(h.el('v11-ready').hidden, false);
  assert.equal(h.el('v11-continue-panel').hidden, false);
  assert.equal(h.el('v11-continue-panel').dataset.kind, 'precision');
  assert.equal(h.el('v11-continue-panel').dataset.ingested, 'Réponse IA — cycle 1.txt');
  assert.equal(h.el('v11-continue-editor').hidden, false);
  assert.equal(h.el('v11-continue-analyse-only').hidden, false);
  assert.match(h.el('v11-continue-help').textContent, /^Réponse prise en compte \(Réponse IA — cycle 1\.txt\)/);
  const s = h.snap();
  assert.equal(s.state.docs.length, 1); assert.equal(s.state.answers.length, 1);
  assert.equal(h.el('v11-filelist').children.length, 1, 'un seul document rendu');
});

/* ==========================================================================
 * T4 → T8 — RESTAURATION PURE, MODE, PHOTOGRAPHIE INVALIDE
 * ======================================================================= */

test('T4 · NO_NETWORK_ON_RESTORE : aucune requête pendant tout le chargement, aucun tour, aucun identifiant d’échange', () => {
  const h = chargerPageEntiere({ session: SESSION({}, { continuation: { open: true, kind: 'precision', ingested: 'Réponse IA — cycle 1.txt' } }) });
  assert.deepEqual(h.journal.reseau, [], 'zéro fetch / xhr / ws');
  assert.deepEqual(h.erreurs, []);
  assert.equal(h.router().getLastPostOprieValidationObservation(), null, 'aucune validation post-OPRIE : aucun tour n’a couru');
  assert.equal(h.el('v11-api-progress').hidden, true); assert.equal(h.el('v11-dialogue').hidden, true); assert.equal(h.el('v11-exchange').hidden, true);
});

test('T5 · NO_DUPLICATE_DOCS et T6 · NO_DUPLICATE_ANSWERS : après tout le chargement, la photographie réécrite est identique', () => {
  const session = SESSION();
  const h = chargerPageEntiere({ session });
  const s = h.snap();
  assert.deepEqual(s.state.docs, session.state.docs);
  assert.deepEqual(s.state.answers, session.state.answers);
  assert.equal(h.el('v11-filelist').children.length, 1);
  assert.equal(s.ui.finalPrompt, 'PROMPT FINAL'); assert.equal(s.ui.demande, session.ui.demande);
  assert.deepEqual(Object.keys(s).sort(), ['saved_at', 'state', 'ui', 'version'], 'schéma v1 inchangé');
});

test('T7 · MODE_RESTORE : le mode restauré est appliqué AVANT le résultat, par la façade — et ne le masque pas', () => {
  for (const mode of ['rapide', 'architecte', 'atelier']) {
    const h = chargerPageEntiere({ session: SESSION({ requestedMode: mode }) });
    assert.deepEqual(h.erreurs, [], mode);
    assert.equal(h.el('ui-mode-select').value, mode, `${mode} : sélecteur`);
    assert.equal(h.ctx.document.body.dataset.v11Mode, mode, `${mode} : présentation de la façade appliquée`);
    assert.equal(h.el('v11-ready').hidden, false, `${mode} : le résultat courant reste visible`);
    const ordre = h.journal.ordre.filter((x) => x.startsWith('v11-ready'));
    assert.equal(ordre.slice(-1)[0], 'v11-ready:visible', `${mode} : la restauration a le dernier mot`);
  }
  /* Une photographie sans mode : la page garde le sien, et le résultat reste visible. */
  const sans = chargerPageEntiere({ session: SESSION({ requestedMode: null }) });
  assert.equal(sans.el('ui-mode-select').value, 'architecte'); assert.equal(sans.el('v11-ready').hidden, false);
  /* Sur les octets : aucune exception par mode, aucun délai, aucune observation. */
  const restore = html.slice(html.indexOf('function v11SessionRestore(){'), html.indexOf('/* GENERATED — LOT 10G.3B.3F.2'));
  assert.equal(/setTimeout|setInterval|MutationObserver|requestAnimationFrame|'rapide'|'atelier'/.test(restore.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  assert.match(restore, /sel\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
});

test('T8 · INVALID_SNAPSHOT : photographie corrompue, ancienne ou vide → la page démarre vierge, rien n’est montré', () => {
  for (const brut of ['{corrompu', '{"version":2,"state":{"answers":[],"docs":[]},"ui":{"demande":"D"}}', '{"version":1,"state":{"answers":[],"docs":[]},"ui":{"demande":"","finalPrompt":""}}']) {
    const h = chargerPageEntiere();
    h.zones.session.set(KEY, brut);
    /* Rejouer l'initialisation V11 (init est le dernier gestionnaire) sur cette page vierge : même chemin que le chargement. */
    const init = h.journal.domReady[h.journal.domReady.length - 1];
    assert.doesNotThrow(() => init());
    assert.equal(h.zones.session.has(KEY), false, `retirée : ${brut.slice(0, 20)}`);
    assert.equal(h.el('v11-ready').hidden, true); assert.equal(h.el('ui-rapid-gate').hidden, true);
    assert.equal(h.el('v11-demande').value, ''); assert.deepEqual(h.journal.reseau, []);
  }
});
