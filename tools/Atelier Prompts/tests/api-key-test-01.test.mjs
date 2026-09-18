/* API-KEY-TEST-01 — TESTER LA CLÉ AVANT DE LANCER UNE ANALYSE
 * ============================================================================
 *
 * Un bouton « Tester » à côté du champ de clé du panneau « Connexion IA » : un appel réel minimal au
 * fournisseur sélectionné — même façade `appelFournisseur`, même transport, une tentative, seize
 * tokens, une ligne de contenu — dont le verdict est lu sur la réponse d'authentification et rien
 * d'autre. Ce fichier charge la PAGE ENTIÈRE (cinq blocs <script>) avec un DOM simulé et un réseau
 * factice qui rejoue les réponses du fournisseur ; chaque cas nomme le code HTTP et la conclusion
 * que le produit a le droit d'en tirer.
 * ========================================================================= */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { html } from './perf04-frontend-harness.helper.mjs';

const KEY_SESSION = 'atelier.v11.session';
const CLE = 'sk-ant-api-key-test-01-jamais-journalisee';
const MODELE = 'claude-opus-5';
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
const OK_BODY = { content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 9, output_tokens: 1 }, stop_reason: 'end_turn' };

/** La page entière, à froid, avec un réseau qui répond selon `repondre(url, opts)`. */
function chargerPage({ repondre } = {}) {
  const elements = new Map();
  const journal = { reseau: [], console: [], domReady: [], crees: [] };
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
    createElement: (tag) => { const e = makeElement('created:' + tag, tag); journal.crees.push(e); return e; }, createTextNode: (t) => ({ textContent: t }), createDocumentFragment: () => makeElement('fragment'),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') journal.domReady.push(fn); }, removeEventListener() {},
    body: makeElement('body'), documentElement: makeElement('html'), head: makeElement('head'), activeElement: null, hidden: false, visibilityState: 'visible', cookie: ''
  };
  document.documentElement.dataset = {};
  const zones = { session: new Map(), local: new Map() };
  const storage = (z) => ({ getItem: (k) => (zones[z].has(k) ? zones[z].get(k) : null), setItem: (k, v) => zones[z].set(k, String(v)), removeItem: (k) => zones[z].delete(k), clear: () => zones[z].clear(), get length() { return zones[z].size; }, key: (i) => [...zones[z].keys()][i] });
  const fetch = async (url, opts = {}) => {
    const entree = { url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {}, signal: opts.signal || null };
    journal.reseau.push(entree);
    if (!repondre) throw new TypeError('API-KEY-TEST-01 : réseau non attendu.');
    return repondre(entree);
  };
  const trace = (niveau) => (...a) => journal.console.push(niveau + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  const context = {
    document, localStorage: storage('local'), sessionStorage: storage('session'),
    console: { log: trace('log'), warn: trace('warn'), error: trace('error'), info: trace('info'), debug: trace('debug') },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'api-key-test-01', language: 'fr-FR', onLine: true },
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
  /* La personne colle sa clé dans le panneau « Connexion IA » ; le modèle configuré est celui de l'analyse. */
  const key = byId('v11-api-key'); key.value = CLE; key.dispatchEvent({ type: 'input' });
  byId('api-modele').value = MODELE;
  return { el: byId, elements, journal, zones, ctx: context };
}

const flush = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };
/** Un clic sur « Tester », puis attente bornée du verdict (le bouton quitte l'état « en-cours »). */
async function tester(h, { attendreVerdict = true } = {}) {
  const b = h.el('v11-api-test');
  b.click();
  if (!attendreVerdict) return b;
  for (let i = 0; i < 50 && b.dataset.etat === 'en-cours'; i += 1) await flush(2);
  return b;
}
const verdict = (h) => ({ etat: h.el('v11-api-test').dataset.etat, bouton: h.el('v11-api-test').textContent, note: h.el('v11-api-test-note').textContent, noteCachee: h.el('v11-api-test-note').hidden, desactive: h.el('v11-api-test').disabled });

/* ==========================================================================
 * LE BALISAGE ET LA REQUÊTE
 * ======================================================================= */

test('T0 · UX_PLACEMENT : le bouton « Tester » est dans la rangée du champ de clé du panneau Connexion IA, neutre au départ', () => {
  const rangee = html.match(/<div class="ui-api-key-row">([\s\S]*?)<\/div>\n\s*<p class="ui-api-test-note" id="v11-api-test-note" hidden><\/p>/);
  assert.ok(rangee, 'la rangée de clé contient le bouton, suivi de la note d’explication');
  assert.match(rangee[1], /<input type="password" id="v11-api-key"[\s\S]*<button[^>]*id="v11-api-show"[\s\S]*<button type="button" class="ui-inline-link ui-api-test" id="v11-api-test" data-etat="neutre"[^>]*>Tester<\/button>/);
  assert.equal(/<dialog|id="v11-api-test-modal"|v11-api-diagnostic/.test(html), false, 'ni modale, ni page, ni panneau de diagnostic');
  for (const etat of ['ok', 'ko', 'avis']) assert.ok(html.includes(`#v11-shell .ui-api-test[data-etat="${etat}"]`), `état visuel ${etat} défini dans la charte`);
  assert.ok(html.includes('--ds-success-text:') && html.includes('--ds-danger-text:'), 'jetons vert et rouge déclarés (clair et sombre)');
  assert.equal((html.match(/--ds-success-text:/g) || []).length, 2); assert.equal((html.match(/--ds-danger-text:/g) || []).length, 2);
  const h = chargerPage();
  assert.deepEqual(verdict(h), { etat: 'neutre', bouton: 'Tester', note: '', noteCachee: true, desactive: false }, 'au chargement : neutre, note masquée');
});

test('T0b · REQUETE_MINIMALE : un appel réel au transport existant — modèle configuré, 16 tokens, une ligne, ni système, ni schéma, ni effort', async () => {
  const h = chargerPage({ repondre: () => reponse(200, OK_BODY) });
  await tester(h);
  assert.equal(h.journal.reseau.length, 1);
  const r = h.journal.reseau[0];
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages'); assert.equal(r.method, 'POST');
  assert.deepEqual(r.body, { model: MODELE, max_tokens: 16, messages: [{ role: 'user', content: 'Répondez uniquement : OK' }] }, 'corps exact : rien d’autre');
  assert.equal('system' in r.body, false); assert.equal('output_config' in r.body, false);
  assert.equal(r.headers['x-api-key'], CLE, 'la clé part au fournisseur, et nulle part ailleurs');
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.ok(r.signal instanceof AbortSignal, 'l’appel est abandonnable');
});

/* ==========================================================================
 * LES VERDICTS
 * ======================================================================= */

test('T1 · AUTH_SUCCESS : 200 → vert « ✓ Clé valide »', async () => {
  const h = chargerPage({ repondre: () => reponse(200, OK_BODY) });
  await tester(h);
  assert.deepEqual(verdict(h), { etat: 'ok', bouton: '✓ Clé valide', note: 'Le fournisseur a accepté la clé et répondu avec le modèle sélectionné.', noteCachee: false, desactive: false });
});

test('T1b · AUTH_SUCCESS_MALGRE_CONTENU : un 200 dont le transport rejette le contenu (troncature à 16 tokens) prouve quand même la clé', async () => {
  const h = chargerPage({ repondre: () => reponse(200, { ...OK_BODY, stop_reason: 'max_tokens' }) });
  await tester(h);
  assert.equal(verdict(h).etat, 'ok'); assert.equal(verdict(h).bouton, '✓ Clé valide');
});

test('T2 · AUTH_401 : rouge « ✕ Clé invalide »', async () => {
  const h = chargerPage({ repondre: () => reponse(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
  await tester(h);
  assert.deepEqual(verdict(h), { etat: 'ko', bouton: '✕ Clé invalide', note: 'Authentification refusée par le fournisseur : vérifiez la clé.', noteCachee: false, desactive: false });
});

test('T3 · AUTHENTICATION_ERROR_BODY : la catégorie structurée du transport (authentification) suffit, même sans statut', async () => {
  /* Le transport classe 401 → `authentification` ; on rejoue ici un fournisseur qui n'aurait que la catégorie. */
  const h = chargerPage({ repondre: () => reponse(401, { error: { type: 'authentication_error', message: 'x' } }) });
  const f = h.ctx.window.FOURNISSEURS_API.anthropic.transport;
  h.ctx.window.FOURNISSEURS_API.anthropic.transport = async (p) => { try { await f(p); } catch (e) { const s = h.ctx.window.creerErreurApi({ categorie: e.categorie, fournisseur: 'anthropic', statut_http: null, recuperable: false, message_utilisateur: 'authentication_error' }); throw s; } };
  await tester(h);
  assert.equal(verdict(h).etat, 'ko'); assert.equal(verdict(h).bouton, '✕ Clé invalide');
});

test('T3b · AUTH_403 : clé reconnue, accès refusé — rouge, mais pas « Clé invalide »', async () => {
  const h = chargerPage({ repondre: () => reponse(403, { error: { type: 'permission_error', message: 'forbidden' } }) });
  await tester(h);
  assert.deepEqual(verdict(h), { etat: 'ko', bouton: '✕ Accès refusé', note: 'Clé reconnue, mais le fournisseur refuse l’accès à cette ressource.', noteCachee: false, desactive: false });
});

test('T4 · MODEL_NOT_FOUND : 404 → « Clé reconnue, mais le modèle sélectionné n’est pas disponible. » — jamais « clé invalide »', async () => {
  const h = chargerPage({ repondre: () => reponse(404, { error: { type: 'not_found_error', message: 'model: nope' } }) });
  await tester(h);
  const v = verdict(h);
  assert.equal(v.etat, 'avis'); assert.equal(v.bouton, 'Modèle indisponible');
  assert.equal(v.note, 'Clé reconnue, mais le modèle sélectionné n’est pas disponible.');
  assert.equal(/invalide/i.test(v.bouton + v.note), false);
});

test('T5 · RATE_LIMIT : 429 → « Clé reconnue, mais limite API atteinte. » — une seule requête, pas de reprise', async () => {
  const h = chargerPage({ repondre: () => reponse(429, { error: { type: 'rate_limit_error', message: 'slow down' } }) });
  await tester(h);
  const v = verdict(h);
  assert.equal(v.etat, 'avis'); assert.equal(v.note, 'Clé reconnue, mais limite API atteinte.');
  assert.equal(/invalide/i.test(v.bouton + v.note), false);
  assert.equal(h.journal.reseau.length, 1, 'un test = une tentative, même sur 429');
});

test('T6 · NETWORK_ERROR : échec réseau → « Impossible de vérifier la clé pour le moment. »', async () => {
  const h = chargerPage({ repondre: () => { throw new TypeError('Failed to fetch'); } });
  await tester(h);
  const v = verdict(h);
  assert.equal(v.etat, 'avis'); assert.equal(v.bouton, 'Vérification impossible'); assert.equal(v.note, 'Impossible de vérifier la clé pour le moment.');
  assert.equal(/invalide/i.test(v.bouton + v.note), false);
});

test('T6b · 5xx : « Service fournisseur temporairement indisponible. » — une seule requête', async () => {
  const h = chargerPage({ repondre: () => reponse(503, { error: { type: 'overloaded_error', message: 'overloaded' } }) });
  await tester(h);
  assert.equal(verdict(h).note, 'Service fournisseur temporairement indisponible.'); assert.equal(verdict(h).etat, 'avis');
  assert.equal(h.journal.reseau.length, 1);
});

test('T6c · AUTRE_ERREUR : 400 → « Autre erreur fournisseur. (code 400) », sans prose du fournisseur', async () => {
  const h = chargerPage({ repondre: () => reponse(400, { error: { type: 'invalid_request_error', message: 'secret-ish provider prose' } }) });
  await tester(h);
  assert.equal(verdict(h).note, 'Autre erreur fournisseur. (code 400)'); assert.equal(verdict(h).etat, 'avis');
});

test('T7 · TIMEOUT : le transport abandonne la requête à 30 s exactement (une tentative, borne propre à ce test) → échec technique', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let signal = null;
    const h = chargerPage({ repondre: (e) => new Promise((_, rej) => { signal = e.signal; signal.addEventListener('abort', () => { const err = new Error('aborted'); err.name = 'AbortError'; rej(err); }); }) });
    const b = await tester(h, { attendreVerdict: false });
    await flush(4);
    assert.equal(b.dataset.etat, 'en-cours'); assert.equal(b.textContent, 'Test en cours…'); assert.equal(b.disabled, true);
    mock.timers.tick(29999); await flush(4);
    assert.equal(signal.aborted, false, 'pas encore abandonné à 29 999 ms');
    assert.equal(b.dataset.etat, 'en-cours');
    mock.timers.tick(1); await flush(8);
    assert.equal(signal.aborted, true, 'abandonné par le transport à 30 000 ms');
    const v = verdict(h);
    assert.equal(v.etat, 'avis'); assert.equal(v.note, 'Impossible de vérifier la clé pour le moment.'); assert.equal(v.desactive, false);
    assert.equal(h.journal.reseau.length, 1, 'aucune seconde tentative après le délai');
  } finally { mock.timers.reset(); }
});

/* ==========================================================================
 * CE QUI EFFACE LE VERDICT
 * ======================================================================= */

test('T8 · KEY_CHANGED_AFTER_SUCCESS : vert → neutre dès la frappe, dans le panneau comme dans les outils', async () => {
  const h = chargerPage({ repondre: () => reponse(200, OK_BODY) });
  await tester(h); assert.equal(verdict(h).etat, 'ok');
  const k = h.el('v11-api-key'); k.value = CLE + 'x'; k.dispatchEvent({ type: 'input' });
  assert.deepEqual(verdict(h), { etat: 'neutre', bouton: 'Tester', note: '', noteCachee: true, desactive: false });
  await tester(h); assert.equal(verdict(h).etat, 'ok');
  const lk = h.el('api-cle'); lk.value = CLE + 'y'; lk.dispatchEvent({ type: 'input' });
  assert.equal(verdict(h).etat, 'neutre', 'la clé tapée dans Envoi direct efface aussi le verdict');
  /* Clé effacée depuis les outils sans événement (« Effacer la clé ») : le retour à l'accueil resynchronise et efface. */
  await tester(h); assert.equal(verdict(h).etat, 'ok');
  h.el('api-cle').value = '';
  const retour = h.journal.crees.find((e) => e.id === 'v11-back-normal');
  retour.click();
  assert.equal(verdict(h).etat, 'neutre'); assert.equal(h.el('v11-api-key').value, '');
});

test('T9 · PROVIDER_CHANGED_AFTER_SUCCESS : vert → neutre', async () => {
  const h = chargerPage({ repondre: () => reponse(200, OK_BODY) });
  await tester(h); assert.equal(verdict(h).etat, 'ok');
  const p = h.el('v11-api-provider'); p.value = 'autre'; p.dispatchEvent({ type: 'change' });
  assert.equal(verdict(h).etat, 'neutre'); assert.equal(verdict(h).bouton, 'Tester');
  await flush(2);
  await tester(h); assert.equal(verdict(h).etat, 'ok');
  h.el('fournisseur-actif').dispatchEvent({ type: 'change' });
  assert.equal(verdict(h).etat, 'neutre', 'le sélecteur des outils efface aussi');
});

test('T10 · MODEL_CHANGED_AFTER_SUCCESS : vert → neutre', async () => {
  const h = chargerPage({ repondre: () => reponse(200, OK_BODY) });
  await tester(h); assert.equal(verdict(h).etat, 'ok');
  const m = h.el('api-modele'); m.value = 'claude-sonnet-5'; m.dispatchEvent({ type: 'change' });
  assert.deepEqual(verdict(h), { etat: 'neutre', bouton: 'Tester', note: '', noteCachee: true, desactive: false });
});

test('T10b · CHANGED_IN_FLIGHT : la clé change pendant le test → l’ancien résultat ne colore pas la nouvelle clé, la requête est abandonnée', async () => {
  let resoudre; let signal;
  const h = chargerPage({ repondre: (e) => new Promise((res) => { signal = e.signal; resoudre = () => res(reponse(200, OK_BODY)); }) });
  const b = await tester(h, { attendreVerdict: false });
  await flush(2);
  assert.equal(b.dataset.etat, 'en-cours');
  const k = h.el('v11-api-key'); k.value = CLE + 'z'; k.dispatchEvent({ type: 'input' });
  assert.equal(signal.aborted, true, 'transport abandonné dès le changement');
  resoudre(); await flush(8);
  assert.deepEqual(verdict(h), { etat: 'neutre', bouton: 'Tester', note: '', noteCachee: true, desactive: false });
  /* Et un modèle changé en vol, sans abandon par le champ : le retour est comparé et ignoré. */
  const h2 = chargerPage({ repondre: () => new Promise((res) => { resoudre = () => res(reponse(401, { error: { type: 'authentication_error', message: 'x' } })); }) });
  await tester(h2, { attendreVerdict: false }); await flush(2);
  h2.el('api-modele').value = 'claude-sonnet-5'; h2.el('api-modele').dispatchEvent({ type: 'change' });
  resoudre(); await flush(8);
  assert.equal(verdict(h2).etat, 'neutre'); assert.equal(verdict(h2).desactive, false, 'le bouton est libéré');
});

/* ==========================================================================
 * CE QUI NE SORT JAMAIS
 * ======================================================================= */

test('T11 · NO_SECRET_LOGGING : la clé n’apparaît ni dans la console, ni dans le stockage, ni dans le DOM hors champs de clé, ni dans la session', async () => {
  const h = chargerPage({ repondre: () => reponse(401, { error: { type: 'authentication_error', message: 'x' } }) });
  await tester(h);
  const h2 = chargerPage({ repondre: () => reponse(200, OK_BODY) });
  await tester(h2);
  for (const x of [h, h2]) {
    assert.equal(x.journal.console.some((l) => l.includes(CLE)), false, 'console');
    assert.equal([...x.zones.session.values(), ...x.zones.local.values()].some((v) => v.includes(CLE)), false, 'sessionStorage / localStorage');
    assert.equal(x.zones.session.has(KEY_SESSION), false, 'aucune photographie de session déclenchée par le test');
    for (const el of x.elements.values()) {
      if (['v11-api-key', 'api-cle', 'accueil-cle'].includes(el.id)) continue;
      const surface = [el.textContent, el.innerHTML, el.value, JSON.stringify(el.dataset), JSON.stringify(el.attrs)].join('\n');
      assert.equal(surface.includes(CLE), false, `élément #${el.id}`);
    }
  }
  const bloc = html.slice(html.indexOf('const V11_KEY_TEST_TIMEOUT_MS'), html.indexOf('async function v11KeyTestRun'));
  const fn = html.slice(html.indexOf('async function v11KeyTestRun'), html.indexOf('/* CONTINUITE-04 — MODE API BOUT-EN-BOUT'));
  assert.equal(/console\.|\bstate\.|v11SessionSave|oprieMark|sessionStorage|localStorage|coffre\./.test(bloc + fn), false, 'le code du test ne journalise, ne stocke, ne marque rien');
  assert.deepEqual((bloc + fn).match(/dataset\.\w+=/g), ['dataset.etat='], 'le seul dataset écrit est l’état visuel du bouton');
});

test('T12 · ONE_REQUEST_ONLY : un clic = une requête ; un second clic pendant le test est ignoré', async () => {
  let resoudre;
  const h = chargerPage({ repondre: () => new Promise((res) => { resoudre = () => res(reponse(200, OK_BODY)); }) });
  const b = await tester(h, { attendreVerdict: false }); await flush(2);
  b.click(); b.click(); await flush(2);
  assert.equal(h.journal.reseau.length, 1);
  resoudre(); await flush(8);
  assert.equal(verdict(h).etat, 'ok'); assert.equal(h.journal.reseau.length, 1);
  await tester(h, { attendreVerdict: false }); await flush(2); assert.equal(h.journal.reseau.length, 2, 'un nouveau clic après verdict = une nouvelle requête');
  resoudre(); await flush(8); assert.equal(verdict(h).etat, 'ok');
});

test('T12b · SANS_CLE : aucun appel, bouton neutre', async () => {
  const h = chargerPage({ repondre: () => reponse(200, OK_BODY) });
  const k = h.el('v11-api-key'); k.value = ''; k.dispatchEvent({ type: 'input' });
  await tester(h);
  assert.equal(h.journal.reseau.length, 0); assert.equal(verdict(h).etat, 'neutre');
});

test('T13 · NO_OPRIE : aucun Worker, aucun tour, aucune progression d’analyse — la seule requête est celle du fournisseur', async () => {
  const h = chargerPage({ repondre: () => reponse(200, OK_BODY) });
  await tester(h);
  assert.deepEqual(h.journal.reseau.map((r) => r.url), ['https://api.anthropic.com/v1/messages']);
  assert.equal(h.el('v11-api-progress').hidden, true); assert.equal(h.el('v11-dialogue').hidden, true); assert.equal(h.el('v11-exchange').hidden, true); assert.equal(h.el('v11-ready').hidden, true);
  assert.equal(h.zones.session.has(KEY_SESSION), false);
  assert.equal(h.ctx.window.__V11_ROUTER__.getLastPostOprieValidationObservation(), null, 'aucune validation post-OPRIE : aucun tour n’a eu lieu');
  assert.equal(h.ctx.window.__V11_ROUTER__.getLastAmbiguityGuardObservation(), null);
});

/* ==========================================================================
 * NON-RÉGRESSION
 * ======================================================================= */

test('T14 · CONTINUITE-01/02/02R/03/04 NON REGRESSION : les cinq suites gelées ou en attente passent inchangées', () => {
  const suites = ['tests/continuite-conversationnelle-cont01.test.mjs', 'tests/continuite-session-cont02.test.mjs', 'tests/continuite-init-order-cont02r.test.mjs', 'tests/continuite-edit-guard-cont03.test.mjs', 'tests/continuite-api-e2e-cont04.test.mjs'];
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const sortie = execFileSync(process.execPath, ['--test', '--test-reporter=spec', ...suites], { encoding: 'utf8', env, cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 120000 });
  const n = (k) => Number((sortie.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) || [])[1]);
  assert.equal(n('fail'), 0, sortie.slice(-2000)); assert.equal(n('pass'), 14 + 20 + 8 + 17 + 16);
});
