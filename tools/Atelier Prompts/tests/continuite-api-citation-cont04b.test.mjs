/* CONTINUITE-04B — APRÈS LE 200 DE L'APPEL #1, LE PARCOURS DOIT ALLER JUSQU'AU PROMPT FINAL ET À L'APPEL #2
 * ============================================================================
 *
 * BUG RÉEL (smoke navigateur sur GitHub Pages, HTML a6cf38e7…, claude-sonnet-5) : test clé 200, Fast 200,
 * Deep 200, appel #1 200 (req_011CfDT13WkjVNdYovgiPsue, 60 s) — puis plus aucun appel réseau, tous les
 * panneaux masqués, prompt final vide, 0 matériau, aucun message durable. Reproduit hors navigateur avec
 * la même demande (req_011CfDUEJd5FvQgJkDsB996F) : 0 violation canonique, puis api.valider() rend
 * « Citation introuvable dans la source utilisateur : besoin d'un ton clair, crédible et non agressif ».
 * La demande porte « d’un » (apostrophe typographique U+2019) ; le modèle cite « d'un » (U+0027).
 * archCitationPresente() comparait les deux textes normalisés NFC + espaces, jamais la ponctuation :
 * une citation exacte au sens humain était refusée → beginApiAnalysis lève → beginExchange affiche un
 * toast de 3,2 s et masque tout (show(null)). Ni retry (la validation canonique avait passé), ni appel #2.
 *
 * POURQUOI LES SUITES PRÉCÉDENTES NE L'ONT PAS VU : CONTINUITE-04 remplace api.valider par un espion qui
 * rend [] ; SCHEMA-ANTHROPIC-03 s'arrête à la frontière du transport ; le smoke réel de gel utilisait une
 * demande sans apostrophe typographique.
 *
 * CORRECTION (dans le moteur Architecte, plage gelée volontairement rouverte pour cette seule ligne) :
 * archNormaliser() plie les apostrophes, guillemets et tirets typographiques vers leur forme ASCII avant
 * comparaison. La valeur du modèle n'est jamais réécrite ; seule la COMPARAISON devient tolérante.
 *
 * Ce fichier exécute la page ENTIÈRE (vm), depuis le routeur V11 : Fast et Deep répondent par des fixtures
 * aux formes exactes des workers, Anthropic par un tool_use réel de forme ; api.valider est le VRAI.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { html, arbiterTurn } from './perf04-frontend-harness.helper.mjs';
import { analyseFixture } from './archcompiler-harness.helper.mjs';
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
  return { el: byId, elements, journal, zones, ctx: context };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const DEMANDE = "Je veux préparer un email professionnel pour proposer une refonte de site web à un prospect.\nContexte :\n- petite entreprise de 15 personnes ;\n- besoin d’un ton clair, crédible et non agressif ;\nJe veux un résultat directement exploitable.";
/* La forme observée : un composant retenu fondé sur une citation utilisateur exacte, apostrophe DROITE là où la
   demande porte l'apostrophe typographique — c'est archValider (fondements des composants) qui la vérifie. */
const avecCitation = (citation) => analyseFixture({ compilation: { composants_retenus: [{ type: 'contrainte', titre: 'Ton du courriel', contenu: 'Ton clair, crédible et non agressif.', justification: 'Exigé par la demande.', fondements: [{ nature: 'utilisateur', citation, usage: 'Fixe le ton du courriel.' }] }], composants_ecartes: [] } });
const ANALYSE = avecCitation("besoin d'un ton clair, crédible et non agressif");
const outil = (input) => reponse(200, { content: [{ type: 'tool_use', id: 'toolu_1', name: 'sortie_structuree', input }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'tool_use' });
const texte = (t) => reponse(200, { content: [{ type: 'text', text: t }], usage: { input_tokens: 3, output_tokens: 2 }, stop_reason: 'end_turn' });
const json = (o) => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => o });

/** La page entière en mode API : clé dans le panneau V11, Fast/Deep/Anthropic par fixtures, parcours lancé par le routeur. */
async function parcours({ analyse = ANALYSE, demande = DEMANDE } = {}) {
  const appels = [];
  const h = chargerPage({ repondre: (e) => {
    appels.push({ url: e.url, outil: e.body && e.body.tools ? e.body.tools[0].name : null, schema: !!(e.body && e.body.tools), system: e.body && e.body.system });
    if (/fast-interaction/.test(e.url)) return json({ type: 'ACKNOWLEDGE', text: 'Bien reçu.', question_focus: null, missing_determinant_id: null, explicit_unknown_determinant_ids: [] });
    if (/operational-request/.test(e.url)) return json(arbiterTurn('operational_request_ready'));
    if (e.body && e.body.tools) return outil(analyse);
    return texte('Objet : proposition de refonte\n\nBonjour,\nVoici une proposition.');
  } });
  const w = h.ctx.window, $ = (id) => h.el(id);
  $('v11-api-provider').value = 'anthropic'; $('v11-api-key').value = 'sk-test'; $('ui-mode-select').value = 'architecte';
  $('v11-demande').value = demande;
  const lancement = w.__V11_ROUTER__.start('architecte');
  for (let i = 0; i < 200; i++) { await attendre(10); if ($('v11-execution-output').value || h.journal.console.some((l) => /error/.test(l))) break; }
  await Promise.race([lancement, attendre(200)]);
  const snap = JSON.parse(h.zones.session.get('atelier.v11.session') || 'null');
  return { h, $, w, appels, snap, toast: $('toast').textContent };
}

test('T1 · POST_CALL1_REACHES_FINAL_PROMPT_AND_CALL2 : citation à apostrophe droite contre une demande à apostrophe typographique → api.valider PASS, prompt final visible, appel #2 lancé, réponse ingérée une fois', async () => {
  const p = await parcours();
  const anthropic = p.appels.filter((a) => /api.anthropic.com/.test(a.url));
  assert.equal(anthropic.length, 2, 'appel #1 (outil) puis appel #2 (texte) — ' + JSON.stringify(p.toast));
  assert.equal(anthropic[0].outil, 'sortie_structuree'); assert.equal(anthropic[1].schema, false);
  assert.equal(anthropic[1].system, 'Répondez directement et complètement au prompt suivant.');
  assert.ok(p.$('v11-final').value.length > 200, 'prompt final compilé');
  assert.equal(p.$('v11-ready').hidden, false, 'panneau final visible');
  assert.equal(p.$('v11-execution').hidden, false, 'Réponse de votre IA visible');
  assert.match(p.$('v11-execution-output').value, /^Objet : proposition de refonte/);
  assert.deepEqual(p.snap.state.docs.map((d) => [d.name, d.type, d.external]), [['Réponse IA — cycle 1.txt', 'text/plain', false]]);
  assert.equal(p.appels.filter((a) => /operational-request/.test(a.url)).length, 1, 'aucun tour OPRIE automatique après ingestion');
  assert.equal(p.$('v11-continue').hidden, false, 'Continuer disponible');
});

test('T2 · CITATION_PUNCTUATION_FOLDED_ONLY_FOR_COMPARISON : apostrophes, guillemets et tirets typographiques pliés ; une citation réellement absente reste refusée ; la valeur du modèle n’est pas réécrite', async () => {
  const { ctx } = chargerPage();
  const api = ctx.window.__ARCHITECTE_V10__;
  const source = 'besoin d’un ton « clair » — oui';
  ctx.document.getElementById('arch-demande').value = source;
  for (const c of ["d'un ton \" clair \" - oui", 'd’un ton « clair » — oui', "besoin d'un"]) {
    const a = avecCitation(c);
    assert.equal(api.valider(a).filter((m) => /Citation/.test(m)).length, 0, c + ' : ' + api.valider(a).join(' | '));
    assert.equal(a.compilation.composants_retenus[0].fondements[0].citation, c, 'valeur intacte');
  }
  assert.ok(api.valider(avecCitation('ton chaleureux')).some((m) => /Citation introuvable/.test(m)), 'une citation absente est toujours refusée');
});

test('T3 · REAL_FAILURE_STILL_VISIBLE_NOT_SILENT : une analyse qu’api.valider refuse (citation absente) arrête le parcours sans appel #2, prompt final vide, message porté par le toast', async () => {
  const p = await parcours({ analyse: avecCitation('ton chaleureux et familier') });
  assert.equal(p.appels.filter((a) => /api.anthropic.com/.test(a.url)).length, 1);
  assert.equal(p.$('v11-final').value, ''); assert.equal(p.snap.state.docs.length, 0);
  assert.match(p.toast, /Citation introuvable/);
});
