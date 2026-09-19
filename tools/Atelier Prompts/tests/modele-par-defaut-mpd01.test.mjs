/* MODELE-PAR-DEFAUT-01 — SONNET 5 PAR DÉFAUT, JAMAIS DE REPLI SILENCIEUX APRÈS /v1/models
 * ============================================================================
 *
 * AVANT. peuplerModelesApi() repliait sur le littéral 'claude-opus-5' quand rien n'était
 * encore sélectionné, et sur un index positionnel muet (le premier modèle de la liste
 * fraîchement reçue) quand le modèle retenu disparaissait après une actualisation depuis
 * GET /v1/models — sans jamais le signaler. Une personne ayant choisi Sonnet pouvait donc se
 * retrouver, après un simple clic sur « Actualiser depuis l'API », sur un autre modèle sans
 * le savoir avant son prochain appel (et pouvait ensuite persister ce choix qu'elle n'avait
 * pas fait, en enregistrant sa clé).
 *
 * APRÈS. MODELE_PAR_DEFAUT ('claude-sonnet-5') est l'unique repli, déclaré une seule fois ;
 * peuplerModelesApi() le retourne avec un indicateur de dégradation, et apiRafraichirModeles()
 * l'annonce dans #api-etat plutôt que de rester silencieux. Ce fichier charge la PAGE ENTIÈRE,
 * comme SCHEMA-ANTHROPIC-02 et API-KEY-TEST-01, avec un DOM simulé et un réseau factice.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { html } from './perf04-frontend-harness.helper.mjs';

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

/** Réponse fournisseur factice, telle que le transport la lit (status, ok, json()). */
const reponse = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body });

/** La page entière, à froid, avec un réseau qui répond selon `repondre(entree)`, et un stockage
   partageable entre deux chargements successifs (pour vérifier la persistance après reload). */
function chargerPage({ repondre, zones } = {}) {
  const elements = new Map();
  const journal = { reseau: [], domReady: [] };
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
  zones = zones || { session: new Map(), local: new Map() };
  const storage = (z) => ({ getItem: (k) => (zones[z].has(k) ? zones[z].get(k) : null), setItem: (k, v) => zones[z].set(k, String(v)), removeItem: (k) => zones[z].delete(k), clear: () => zones[z].clear(), get length() { return zones[z].size; }, key: (i) => [...zones[z].keys()][i] });
  const fetch = async (url, opts = {}) => {
    const entree = { url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {}, signal: opts.signal || null };
    journal.reseau.push(entree);
    if (!repondre) throw new TypeError('MODELE-PAR-DEFAUT-01 : réseau non attendu.');
    return repondre(entree);
  };
  const context = {
    document, localStorage: storage('local'), sessionStorage: storage('session'),
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'modele-par-defaut-01', language: 'fr-FR', onLine: true },
    setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    Intl, Math, Date, JSON, Number, String, Array, Object, Promise, Map, Set, RegExp, Error, TypeError, Boolean, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, structuredClone,
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } preventDefault() {} stopPropagation() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } preventDefault() {} },
    MutationObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} },
    FileReader: class { readAsText() {} }, Blob: globalThis.Blob, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, AbortSignal, crypto: globalThis.crypto, performance: globalThis.performance,
    fetch, XMLHttpRequest: function () { throw new Error('xhr interdit'); }, WebSocket: function () { throw new Error('ws interdit'); }, EventSource: function () { throw new Error('sse interdit'); },
    alert() {}, confirm: () => true, prompt: () => null, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
    location: { href: 'https://c-concept-dev.github.io/x', origin: 'https://c-concept-dev.github.io', protocol: 'https:', hash: '', search: '', pathname: '/' },
    history: { replaceState() {}, pushState() {} }, screen: { width: 1280, height: 800 }, innerWidth: 1280, innerHeight: 800, scrollTo() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, focus() {}
  };
  context.window = context; context.globalThis = context; context.self = context;
  vm.createContext(context);
  for (const b of blocs) { const src = lignes.slice(b.from, b.to).join('\n'); if (src.trim()) vm.runInContext(src, context, { filename: 'atelier:' + b.tag.replace(/[<>]/g, '') }); }
  document.readyState = 'interactive';
  const erreurs = [];
  for (const fn of journal.domReady) { try { fn(); } catch (e) { erreurs.push(e.message); } }
  document.readyState = 'complete';
  assert.deepEqual(erreurs, [], 'initialisation de la page sans erreur');
  return { el: byId, elements, journal, zones, ctx: context, w: context.window };
}

const flush = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

/* ==========================================================================
 * T1 → T2 — LE REPLI PAR DÉFAUT, ET LE LIBELLÉ DISTINCT DE L'IDENTIFIANT
 * ======================================================================= */

test('T1 · DEFAULT_MODEL_IS_SONNET : rien de sélectionné → le repli est claude-sonnet-5, jamais claude-opus-5', () => {
  const h = chargerPage();
  assert.equal(h.w.MODELE_PAR_DEFAUT, 'claude-sonnet-5');
  assert.equal(h.el('api-modele').value, 'claude-sonnet-5');
  /* Les sélecteurs Qualité suivent le même repli dès qu'ils sont peuplés — au premier changement
     de fournisseur ou à la première actualisation, pas nécessairement dès le chargement initial. */
  h.w.repeuplerTousLesSelectsModeles();
  assert.equal(h.el('qualite-modele-exec').value, 'claude-sonnet-5');
  assert.equal(h.el('qualite-modele-juge').value, 'claude-sonnet-5');
});

test('T2 · LABEL_DISTINCT_FROM_API_VALUE : l’option affiche « Claude Sonnet 5 », la value transmise à l’API reste claude-sonnet-5', () => {
  const h = chargerPage();
  const sel = h.el('api-modele');
  assert.equal(sel.value, 'claude-sonnet-5');
  const optionSonnet = sel.innerHTML.match(/<option value="claude-sonnet-5"[^>]*>([^<]+)<\/option>/);
  assert.ok(optionSonnet, 'une option porte value="claude-sonnet-5"');
  assert.match(optionSonnet[1], /^Claude Sonnet 5/, 'le libellé affiché est le nom du modèle, pas son identifiant API');
  assert.equal(/^claude-sonnet-5/.test(optionSonnet[1]), false, 'le libellé n’est pas l’identifiant brut');
});

/* ==========================================================================
 * T3 — PERSISTANCE APRÈS RELOAD
 * ======================================================================= */

test('T3 · PERSISTED_SELECTION_SURVIVES_RELOAD : Haiku choisi et enregistré → toujours Haiku après un rechargement de page', () => {
  const zones = { session: new Map(), local: new Map() };
  const h1 = chargerPage({ zones });
  h1.el('api-modele').value = 'claude-haiku-4-5-20251001';
  h1.el('api-cle').value = 'sk-ant-persist-test';
  h1.w.enregistrerCle();
  assert.equal(zones.local.has('atelier.modele') || zones.session.has('atelier.modele'), true, 'le modèle est écrit quelque part');
  const h2 = chargerPage({ zones });
  assert.equal(h2.el('api-modele').value, 'claude-haiku-4-5-20251001', 'la sélection explicite survit au rechargement');
});

/* ==========================================================================
 * T4 → T6 — ACTUALISATION DEPUIS /v1/models : JAMAIS DE REPLI SILENCIEUX
 * ======================================================================= */

const modelesApi = (ids) => reponse(200, { data: ids.map((id) => ({ id, display_name: id, max_input_tokens: 200000, max_tokens: 8192 })) });

test('T4 · REFRESH_KEEPS_SELECTION_WHEN_STILL_LISTED : le modèle choisi reste choisi quand /v1/models le renvoie encore', async () => {
  const h = chargerPage({ repondre: () => modelesApi(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']) });
  h.el('api-modele').value = 'claude-sonnet-5';
  h.el('api-cle').value = 'sk-ant-refresh-test';
  await h.w.apiRafraichirModeles();
  await flush();
  assert.equal(h.el('api-modele').value, 'claude-sonnet-5');
  assert.equal(h.el('api-etat').className.includes('valide'), true, 'statut « ok », rien à signaler');
  assert.equal(/n.y figure plus/.test(h.el('api-etat').textContent), false);
});

test('T5 · REFRESH_NEVER_SILENT_FALLBACK : Sonnet disparu de /v1/models, Opus listé en premier → le repli n’est PAS Opus par accident de position, et il est annoncé', async () => {
  /* Opus délibérément en tête de la réponse fournisseur : si le repli redevenait un
     index positionnel muet (l’ancien bug), ce test le détecterait — le repli suivrait
     l’ordre de la réponse plutôt que MODELE_PAR_DEFAUT. */
  const h = chargerPage({ repondre: () => modelesApi(['claude-opus-5', 'claude-fable-5', 'claude-haiku-4-5-20251001']) });
  h.el('api-modele').value = 'claude-sonnet-5';
  h.el('api-cle').value = 'sk-ant-refresh-test';
  await h.w.apiRafraichirModeles();
  await flush();
  assert.equal(h.el('api-modele').value, 'claude-opus-5', 'seul modèle encore listé qui ne soit pas Sonnet — ici, forcément le repli attendu');
  const etat = h.el('api-etat');
  assert.equal(etat.className.includes('alerte'), true, 'le repli est signalé comme une alerte, jamais un « ok » silencieux');
  assert.match(etat.textContent, /Claude Sonnet 5/, 'le message nomme le modèle demandé');
  assert.match(etat.textContent, /n.y figure plus/, 'le message dit explicitement que ce modèle a disparu de la liste');
});

test('T5b · REFRESH_PREFERS_DEFAULT_OVER_POSITION : le modèle choisi a disparu, mais Sonnet (MODELE_PAR_DEFAUT) est toujours listé, pas en tête → c’est lui le repli, pas le premier de la liste', async () => {
  const h = chargerPage({ repondre: () => modelesApi(['claude-opus-5', 'claude-fable-5', 'claude-sonnet-5']) });
  h.el('api-modele').value = 'claude-haiku-4-5-20251001';
  h.el('api-cle').value = 'sk-ant-refresh-test';
  await h.w.apiRafraichirModeles();
  await flush();
  assert.equal(h.el('api-modele').value, 'claude-sonnet-5', 'MODELE_PAR_DEFAUT est préféré au premier élément de la liste (Opus)');
  assert.equal(h.el('api-etat').className.includes('alerte'), true);
});

test('T6 · REFRESH_FALLBACK_WHEN_DEFAULT_ALSO_ABSENT : ni le modèle choisi ni MODELE_PAR_DEFAUT ne sont listés → repli sur le premier disponible, toujours annoncé', async () => {
  const h = chargerPage({ repondre: () => modelesApi(['claude-opus-5', 'claude-fable-5']) });
  h.el('api-modele').value = 'claude-haiku-4-5-20251001';
  h.el('api-cle').value = 'sk-ant-refresh-test';
  await h.w.apiRafraichirModeles();
  await flush();
  assert.equal(h.el('api-modele').value, 'claude-opus-5', 'à défaut du modèle demandé et du repli par défaut, le premier modèle listé — jamais une sélection vide');
  assert.equal(h.el('api-etat').className.includes('alerte'), true);
});

/* ==========================================================================
 * T7 — LE MODÈLE CONFIGURÉ EST BIEN CELUI TRANSMIS AUX FINALITÉS ARCHITECTE
 * ======================================================================= */

test('T7 · ARCHITECTE_USES_CONFIGURED_MODEL : architecte-analyse et architecte-livrable résolvent sur le modèle du sélecteur principal', () => {
  const h = chargerPage();
  h.el('api-modele').value = 'claude-sonnet-5';
  assert.equal(h.w.obtenirModeleActif('architecte-analyse'), 'claude-sonnet-5');
  assert.equal(h.w.obtenirModeleActif('architecte-livrable'), 'claude-sonnet-5');
  h.el('api-modele').value = 'claude-haiku-4-5-20251001';
  assert.equal(h.w.obtenirModeleActif('architecte-analyse'), 'claude-haiku-4-5-20251001');
  assert.equal(h.w.obtenirModeleActif('architecte-livrable'), 'claude-haiku-4-5-20251001');
});
