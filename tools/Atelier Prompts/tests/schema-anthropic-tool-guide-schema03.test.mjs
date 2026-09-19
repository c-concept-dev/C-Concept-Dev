/* SCHEMA-ANTHROPIC-03 — LE SCHÉMA CANONIQUE PART COMME SCHÉMA D'OUTIL, LA RÉPONSE EST VÉRIFIÉE CONTRE LUI
 * ============================================================================
 *
 * PREUVES FOURNISSEUR (réelles, claude-sonnet-5 et claude-opus-5), dans l'ordre : sortie structurée
 * `output_config.format` → 400 « oneOf not supported » ; → 400 « For 'anyOf', 'type' is not supported » ;
 * projection réduite (8 092 octets, 114 nœuds, 83 properties) → 400 « The compiled grammar is too large ».
 * Mesures réelles ensuite, sur la grammaire : descriptions, enum/const, unions avec null, inline des
 * definitions — aucun effet ; propriétés optionnelles → 400 « too many optional parameters (limit: 24) » ;
 * un objet PLAT de 74 propriétés `string` à clés d'un caractère → déjà « too large ». Le canonique en
 * compte 83 (90 dépliées). Conclusion : aucune projection à grammaire compilée ne peut porter l'analyse
 * complète en un appel. Le diagnostic (runner de bisection) a été retiré avec cette décision.
 *
 * ARCHITECTURE. L'appel porte un outil personnalisé NON strict dont `input_schema` est le canonique lui-même
 * (moins les combinateurs de la RACINE, seule chose qu'Anthropic refuse là — « input_schema does not
 * support oneOf, allOf, or anyOf at the top level » — et les métadonnées), `tool_choice` forcé : aucune
 * grammaire, JSON garanti (`tool_use.input`), guide complet lu par le modèle. Vérifié en réel : 200.
 * La réponse est vérifiée contre le canonique COMPLET (violationsContreSchema) ; non conforme → UNE
 * requête de correction (résultat d'outil en erreur portant les violations, chemin et attente, jamais de
 * contenu) ; encore non conforme → sortie_invalide. Mesuré en réel : 2 premières réponses sur 4 violaient
 * une règle ; la correction a ramené la conformité. api.valider() garde ses contrôles en aval.
 *
 * Ce fichier exécute la page entière (vm), réseau remplacé par un espion à la frontière fetch.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { html } from './perf04-frontend-harness.helper.mjs';
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

const clone = (x) => JSON.parse(JSON.stringify(x));
/** Réponse « outil appelé » telle que l'API la rend pour un input donné. */
const reponseOutil = (input, extra = {}) => reponse(200, { content: [{ type: 'tool_use', id: 'toolu_' + Math.random().toString(36).slice(2, 8), name: 'sortie_structuree', input }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'tool_use', ...extra });
/** Une page chargée, son moteur Architecte et la façade fournisseur. */
function page(repondre) {
  const h = chargerPage({ repondre });
  const w = h.ctx.window;
  return { h, w, api: w.__ARCHITECTE_V10__, adapt: w.schemaPourAnthropic, violations: w.violationsContreSchema, appel: w.appelFournisseur, F: w.FOURNISSEURS_API };
}
const APPEL = (p, extra = {}) => p.appel({ fournisseur: 'anthropic', cle: 'k', modele: 'claude-sonnet-5', maxTokens: 8000, systeme: 's', contenuUtilisateur: 'c', schema: p.api.schema, effort: 'high', ...extra });
/** Parcourt un schéma : appelle `visite(noeud, chemin)`. */
function parcourir(s, visite, chemin = '$') {
  if (!s || typeof s !== 'object') return;
  if (Array.isArray(s)) { s.forEach((x, i) => parcourir(x, visite, `${chemin}[${i}]`)); return; }
  visite(s, chemin);
  for (const k of Object.keys(s)) {
    if (['enum', 'const', 'required', 'default', 'description', 'type', 'title'].includes(k)) continue;
    if (['properties', 'definitions', '$defs', 'patternProperties'].includes(k)) { for (const n of Object.keys(s[k])) parcourir(s[k][n], visite, `${chemin}.${k}.${n}`); }
    else if (typeof s[k] === 'object') parcourir(s[k], visite, `${chemin}.${k}`);
  }
}
const refs = (s) => { const out = new Set(); parcourir(s, (n) => { if (typeof n.$ref === 'string') out.add(n.$ref.replace(/^#\/definitions\//, '')); }); return out; };

test('T1 · CANONICAL_UNCHANGED : deep-equal avant/après, non muté, empreinte source du guard, métriques', () => {
  const { api, adapt } = page();
  const avant = clone(api.schema); adapt(api.schema);
  assert.deepEqual(clone(api.schema), avant);
  assert.equal(createHash('sha256').update(html.slice(html.indexOf('const ARCH_SCHEMA='), html.indexOf('let ARCH_SYSTEM='))).digest('hex'), 'a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b');
  assert.equal(JSON.stringify(api.schema).length, 11510);
  assert.ok(Array.isArray(api.schema.allOf) && api.schema.allOf.length === 1 && api.schema.allOf[0].if, 'la règle racine reste dans le canonique');
});

test('T2 · PROVIDER_GUIDE_IS_CANONICAL_MINUS_ROOT_COMBINATORS : le guide transmis = canonique moins $schema/$id et moins les combinateurs de la racine, rien d’autre ; description racine reprise ; idempotent', () => {
  const { api, adapt } = page();
  const guide = adapt(api.schema);
  const attendu = clone(api.schema); delete attendu.$schema; delete attendu.$id; delete attendu.allOf; attendu.description = api.schema.allOf[0].description;
  assert.deepEqual(clone(guide), attendu);
  assert.equal(guide.allOf, undefined); assert.equal(guide.anyOf, undefined); assert.equal(guide.oneOf, undefined);
  assert.equal(guide.description, 'Une information bloquante interdit un livrable complet immédiat.');
  assert.deepEqual(clone(adapt(guide)), clone(guide), 'idempotent');
  /* Tout ce que la projection à grammaire devait retirer reste dans le guide : le modèle lit le contrat entier. */
  const mots = {}; parcourir(guide, (n) => { for (const k of Object.keys(n)) mots[k] = (mots[k] || 0) + 1; });
  for (const k of ['oneOf', 'if', 'then', 'not', 'minLength', 'maxLength', 'minimum', 'minItems', 'maxItems']) assert.ok(mots[k] >= 1, k + ' présent dans le guide');
  const motsCanon = {}; parcourir(api.schema, (n) => { for (const k of Object.keys(n)) motsCanon[k] = (motsCanon[k] || 0) + 1; });
  assert.equal(mots.allOf, motsCanon.allOf - 1, 'seul l’allOf racine manque');
  assert.equal(mots.contains, undefined, 'le contains vivait dans la règle racine ; il reste exigé après réponse (T5)');
});

test('T3 · STRUCTURE_REQUIRED_DISCRIMINANTS_PRESERVED, NO_ORPHAN_DEFINITIONS : properties, required, enum, const, types nullables et $ref identiques au canonique ; chaque definition est référencée', () => {
  const { api, adapt } = page();
  const guide = adapt(api.schema);
  const releve = (s, cle) => { const out = []; parcourir(s, (n, chemin) => { if (chemin !== '$' && n[cle] !== undefined) out.push([chemin, JSON.stringify(n[cle])]); }); return out.sort((a, b) => a[0].localeCompare(b[0])); };
  const canonSansRegleRacine = clone(api.schema); delete canonSansRegleRacine.allOf;
  for (const cle of ['required', 'enum', 'const', 'type', 'additionalProperties', '$ref']) assert.deepEqual(releve(guide, cle), releve(canonSansRegleRacine, cle), cle);
  assert.deepEqual(clone(guide.required), ['version', 'comprehension', 'evaluation', 'strategie', 'livrable', 'compilation', 'verification', 'apprentissage']);
  assert.deepEqual(Object.keys(guide.definitions).sort(), [...refs(guide)].sort(), 'aucune definition orpheline, aucune $ref pendante');
  assert.equal(guide.properties.version.const, '3.4');
  assert.deepEqual(guide.definitions.preference_proposable.oneOf.map((b) => b.properties && b.properties.type && b.properties.type.const), [undefined, 'nouvelle', 'corroboration']);
});

test('T4 · NO_ROOT_COMBINATOR_EVER, BETA-04 KEPT : un oneOf/anyOf racine est retiré (description reprise) ; enum à type union → anyOf par type, à tout niveau sauf la racine ; métadonnées retirées', () => {
  const { adapt } = page();
  const s = { $schema: 'x', $id: 'y', $comment: 'z', type: 'object', properties: { a: { type: ['string', 'null'], enum: ['x', null] } }, oneOf: [{ description: 'D1', required: ['a'] }], anyOf: [{ description: 'D2' }] };
  const g = adapt(s);
  assert.deepEqual(clone(g), { type: 'object', description: 'D2 D1', properties: { a: { anyOf: [{ type: 'string', enum: ['x'] }, { type: 'null', enum: [null] }] } } });
});

test('T5 · CANONICAL_VALIDATION_STILL_STRICT : la fixture passe ; 18 mutations rejetées, chacune sur la règle canonique attendue, sans jamais citer la valeur reçue ; null et les deux branches complètes de preference_proposable acceptés', () => {
  const { api, violations } = page();
  assert.deepEqual(clone(violations(api.schema, analyseFixture())), []);
  const cas = [
    ['type=nouvelle sans texte', (a) => { a.apprentissage.preference_proposable = { type: 'nouvelle' }; }, /preference_proposable\.texte : requis \(branche 1\)/],
    ['type=nouvelle avec preference_id', (a) => { a.apprentissage.preference_proposable = { type: 'nouvelle', texte: 'x', preference_id: 'p' }; }, /preference_proposable\.preference_id : propriété non prévue \(branche 1\)/],
    ['type=corroboration sans preference_id', (a) => { a.apprentissage.preference_proposable = { type: 'corroboration' }; }, /preference_proposable\.preference_id : requis \(branche 2\)/],
    ['discriminant hors enum', (a) => { a.apprentissage.preference_proposable = { type: 'autre', texte: 'x' }; }, /oneOf exige exactement une branche \(0 satisfaite\)/],
    ['oneOf exact', (a) => { a.apprentissage.preference_proposable = { type: 'corroboration', texte: 'x' }; }, /oneOf exige exactement une branche/],
    ['minItems 2', (a) => { a.apprentissage.preference_proposable = { type: 'corroboration', preference_id: 'p1', confirmations_invoquees: ['une'] }; }, /confirmations_invoquees : minItems 2/],
    ['not (min et max null)', (a) => { a.livrable.quantites = { min: null, max: null, unite: null }; }, /quantites : forme interdite par not/],
    ['if/then (min entier sans unité)', (a) => { a.livrable.quantites = { min: 3, max: null, unite: null }; }, /quantites\.unite : type attendu string .*règle conditionnelle/],
    ['if/then (statut déduction avec source demande)', (a) => { a.comprehension.declarations = [{ contenu: 'x', statut: 'deduction_llm', source: 'demande', preuve: null }]; }, /declarations\[0\]\.source : valeur attendue "aucune" \(règle conditionnelle\)/],
    ['if/then + contains racine (information bloquante avec livrable complet)', (a) => { a.comprehension.informations_manquantes = [{ information: 'délai', bloquant: true, justification: 'sans délai, impossible' }]; a.evaluation.livrable_complet_possible = true; a.evaluation.action_recommandee = 'questionner'; a.evaluation.questions_a_poser = ['Quel délai ?']; }, /evaluation\.livrable_complet_possible : valeur attendue false \(règle conditionnelle\)/],
    ['minLength', (a) => { a.comprehension.intention_principale = ''; }, /intention_principale : minLength 1/],
    ['maxItems', (a) => { a.evaluation.action_recommandee = 'questionner'; a.evaluation.questions_a_poser = ['a', 'b', 'c', 'd']; }, /questions_a_poser : maxItems 3/],
    ['minimum', (a) => { a.livrable.quantites = { min: -1, max: 2, unite: 'u' }; }, /quantites\.min : minimum 0/],
    ['enum', (a) => { a.evaluation.niveau_risque = 'extrême'; }, /niveau_risque : valeur hors enum/],
    ['const version', (a) => { a.version = '3.3'; }, /version : valeur attendue "3\.4"/],
    ['required', (a) => { delete a.strategie.role_adaptatif.mission; }, /role_adaptatif\.mission : requis/],
    ['additionalProperties', (a) => { a.evaluation.commentaire = 'x'; }, /evaluation\.commentaire : propriété non prévue/],
    ['$ref + if/then de fondement', (a) => { a.compilation.composants_retenus = [{ type: 'contrainte', titre: 't', contenu: 'c', justification: 'j', fondements: [{ nature: 'utilisateur', citation: null, usage: 'usage clair' }] }]; }, /fondements\[0\]\.citation : type attendu string \(reçu null\) \(règle conditionnelle\)/],
  ];
  assert.equal(cas.length, 18);
  for (const [nom, muter, attendu] of cas) {
    const a = analyseFixture(); muter(a);
    const v = violations(api.schema, a);
    assert.ok(v.length, `${nom} : aucune violation détectée`);
    assert.ok(v.some((m) => attendu.test(m)), `${nom} : ${v.join(' | ')}`);
    for (const m of v) assert.equal(/extrême|délai|commentaire=|usage clair/.test(m.replace(/^\S+ /, '')), false, 'les messages ne citent jamais la valeur reçue');
  }
  for (const pref of [null, { type: 'nouvelle', texte: 'x' }, { type: 'corroboration', preference_id: 'p', confirmations_invoquees: ['a', 'b'] }]) {
    const a = analyseFixture(); a.apprentissage.preference_proposable = pref;
    assert.deepEqual(clone(violations(api.schema, a)), [], JSON.stringify(pref));
  }
  assert.deepEqual(clone(api.valider(analyseFixture())), []);
  const sans = analyseFixture(); delete sans.verification;
  assert.ok(api.valider(sans).some((m) => /verification/.test(m)), 'api.valider garde ses contrôles');
});

test('T-PAYLOAD · corps réel de l’appel #1 : outil non strict = guide, tool_choice forcé, effort, modèle, max_tokens ; aucun output_config.format, aucun strict ; sérialisable', async () => {
  const corps = analyseFixture();
  const { api, appel, h } = page(() => reponseOutil(corps));
  await appel({ fournisseur: 'anthropic', cle: 'k', modele: 'claude-sonnet-5', maxTokens: 8000, systeme: 'SYS', contenuUtilisateur: 'CTX', schema: api.schema, effort: 'high' });
  const b = h.journal.reseau[0].body;
  assert.equal(b.model, 'claude-sonnet-5'); assert.equal(b.max_tokens, 8000); assert.equal(b.system, 'SYS');
  assert.deepEqual(b.messages, [{ role: 'user', content: 'CTX' }]);
  assert.deepEqual(b.output_config, { effort: 'high' });
  assert.equal(b.tools.length, 1); assert.equal(b.tools[0].name, 'sortie_structuree'); assert.equal(b.tools[0].strict, undefined);
  assert.match(b.tools[0].description, /N’enveloppez jamais l’objet/, 'mesuré en réel : sans cette consigne, le modèle enveloppe l’objet sous une clé unique');
  assert.deepEqual(b.tools[0].input_schema, clone(page().adapt(api.schema)));
  assert.deepEqual(b.tool_choice, { type: 'tool', name: 'sortie_structuree' });
  assert.equal('thinking' in b, false); assert.equal('temperature' in b, false);
  const m = { octets: JSON.stringify(b.tools[0].input_schema).length, corps: JSON.stringify(b).length };
  console.log(JSON.stringify({ etape: 'T-PAYLOAD', guide_octets: m.octets, corps_octets: m.corps, canonique_octets: JSON.stringify(api.schema).length }));
  assert.ok(m.octets < 11510 && m.octets > 10500);
});

test('T6 · TOOL_USE_READ : la réponse est lue dans tool_use.input (jamais dans un bloc texte) ; sans schéma, le bloc texte reste la voie ; une réponse sans outil est sortie_invalide ; troncature et refus inchangés', async () => {
  const corps = analyseFixture();
  const p = page(() => reponse(200, { content: [{ type: 'text', text: 'commentaire hors outil' }, { type: 'tool_use', id: 'toolu_1', name: 'sortie_structuree', input: corps }], usage: { input_tokens: 3, output_tokens: 4 }, stop_reason: 'tool_use' }));
  const r = await APPEL(p);
  assert.equal(r.texte, JSON.stringify(corps)); assert.equal(r.structure_validee, true); assert.equal(r.raison_arret, 'tool_use'); assert.deepEqual(clone(r.tokens), { entree: 3, sortie: 4 }); assert.equal(r.detail.corrections, 0);
  const p2 = page(() => reponse(200, { content: [{ type: 'text', text: 'libre' }], usage: {}, stop_reason: 'end_turn' }));
  const r2 = await p2.appel({ fournisseur: 'anthropic', cle: 'k', modele: 'm', maxTokens: 16, contenuUtilisateur: 'c' });
  assert.equal(r2.texte, 'libre'); assert.equal(r2.structure_validee, null); assert.equal('tools' in p2.h.journal.reseau[0].body, false); assert.equal('output_config' in p2.h.journal.reseau[0].body, false);
  const p3 = page(() => reponse(200, { content: [{ type: 'text', text: JSON.stringify(corps) }], usage: {}, stop_reason: 'end_turn' }));
  await assert.rejects(APPEL(p3), (e) => e.categorie === 'sortie_invalide' && /aucune sortie structurée/.test(e.message));
  const p4 = page(() => reponse(200, { content: [{ type: 'tool_use', id: 't', name: 'sortie_structuree', input: { version: '3.4' } }], usage: {}, stop_reason: 'max_tokens' }));
  await assert.rejects(APPEL(p4), (e) => e.categorie === 'troncature');
  const p5 = page(() => reponse(200, { content: [], usage: {}, stop_reason: 'refusal', stop_details: { category: 'x' } }));
  await assert.rejects(APPEL(p5), (e) => e.categorie === 'refus' && e.detail.refus_categorie === 'x');
});

test('T7 · ONE_BOUNDED_CORRECTION : non conforme → UNE requête de correction (historique + tool_result is_error portant les violations, jamais de contenu) → conforme = accepté avec corrections:1 et jetons cumulés ; encore non conforme = sortie_invalide, deux requêtes et pas une de plus ; conforme du premier coup = une seule requête', async () => {
  const bon = analyseFixture();
  const mauvais = analyseFixture(); mauvais.livrable.quantites = { min: null, max: null, unite: null };
  let n = 0;
  const p = page(() => reponseOutil(n++ === 0 ? mauvais : bon));
  const r = await APPEL(p);
  assert.equal(p.h.journal.reseau.length, 2);
  assert.equal(r.texte, JSON.stringify(bon)); assert.equal(r.structure_validee, true); assert.equal(r.detail.corrections, 1); assert.deepEqual(clone(r.tokens), { entree: 20, sortie: 10 });
  const b1 = p.h.journal.reseau[0].body, b2 = p.h.journal.reseau[1].body;
  assert.deepEqual(b2.tools, b1.tools); assert.deepEqual(b2.tool_choice, b1.tool_choice); assert.equal(b2.system, b1.system);
  assert.equal(b2.messages.length, 3);
  assert.deepEqual(b2.messages[0], b1.messages[0]);
  assert.equal(b2.messages[1].role, 'assistant'); assert.equal(b2.messages[1].content[0].type, 'tool_use'); assert.deepEqual(b2.messages[1].content[0].input, mauvais);
  assert.equal(b2.messages[2].role, 'user');
  const res = b2.messages[2].content[0];
  assert.equal(res.type, 'tool_result'); assert.equal(res.tool_use_id, b2.messages[1].content[0].id); assert.equal(res.is_error, true);
  assert.match(res.content, /^Réponse non conforme au schéma de l’outil\. Violations \(chemin : attente du schéma\) :\n- \$\.livrable\.quantites : forme interdite par not\n/);
  assert.match(res.content, /objet COMPLET corrigé/);
  assert.equal(/intention|Demande|"/.test(res.content), false, 'aucune valeur reçue, aucun contenu métier dans la correction');
  /* Deux fois non conforme : rejet, deux requêtes exactement, violations de la seconde réponse. */
  const encore = analyseFixture(); encore.comprehension.intention_principale = '';
  let k = 0;
  const p2 = page(() => reponseOutil(k++ === 0 ? mauvais : encore));
  await assert.rejects(APPEL(p2), (e) => { assert.equal(e.categorie, 'sortie_invalide'); assert.equal(e.statut_http, 200); assert.match(e.message, /intention_principale : minLength 1/); assert.equal(e.texte_partiel, JSON.stringify(encore)); assert.deepEqual(clone(e.tokens), { entree: 20, sortie: 10 }); return true; });
  assert.equal(p2.h.journal.reseau.length, 2);
  /* Conforme du premier coup : une seule requête. */
  const p3 = page(() => reponseOutil(bon));
  await APPEL(p3);
  assert.equal(p3.h.journal.reseau.length, 1);
  /* L'appelant (beginApiAnalysis) ne retouche rien : ce qu'il reçoit est ce que l'outil a rendu. */
  const src = html.slice(html.indexOf('async function beginApiAnalysis(){'), html.indexOf('function compositeDemand(){'));
  assert.equal(/violationsContreSchema|corrig/.test(src), false);
});

test('T8 · OTHER_PROVIDERS_UNCHANGED : un autre fournisseur reçoit le schéma canonique intact (oneOf et allOf racine compris) ; la façade ne projette rien', async () => {
  const { api, appel, F } = page();
  const recu = [];
  F.factice = { id: 'factice', nom: 'Factice', transport: async (p) => { recu.push(p); return { texte: '{}', tokens: {} }; }, modeles: {}, tarifDuJour: () => ({ connu: false }), capacites: { sortie_structuree: true, effort_raisonnement: true, annulation: true, prefill_assistant: true, limites: {} } };
  await appel({ fournisseur: 'factice', cle: 'k', modele: 'm', maxTokens: 10, systeme: 's', contenuUtilisateur: 'c', schema: api.schema, effort: 'high' });
  assert.equal(recu[0].schema, api.schema); assert.ok(JSON.stringify(recu[0].schema).includes('"oneOf"')); assert.ok(Array.isArray(recu[0].schema.allOf));
  delete F.factice;
});

test('T9 · NO_GRAMMAR_PATH_LEFT : plus aucun output_config.format ni normalisation de projection dans la page ; l’envoi direct porte son schéma en clair et laisse la forme de transport au transport', () => {
  assert.equal((html.match(/output_config\s*=\s*\{\s*format/g) || []).length, 0);
  assert.equal(/json_schema/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'plus de type json_schema hors commentaires');
  assert.equal(/schemaFusionnerBranchesObjet|SCHEMA_ANTHROPIC_REGLES_REPORTEES|SCHEMA_ANTHROPIC_CONTRAINTES_REPORTEES/.test(html), false);
  assert.match(html, /corps\.schema = normaliserSchema\(JSON\.parse\(brutSchema\)\)/);
  assert.match(html, /const schema = corpsRequete\.schema;/);
});

test('T10 · SONNET5 : le modèle par défaut est claude-sonnet-5 par sa VALUE, l’appel #1 réel part avec ce modèle', async () => {
  const corps = analyseFixture();
  const p = page(() => reponseOutil(corps));
  assert.match(html, /const MODELE_PAR_DEFAUT\s*=\s*'claude-sonnet-5'/);
  const modele = p.w.obtenirModeleActif('architecte-analyse');
  assert.equal(modele, 'claude-sonnet-5');
  await p.appel({ fournisseur: 'anthropic', cle: 'k', modele, maxTokens: 8000, systeme: 's', contenuUtilisateur: 'c', schema: p.api.schema, effort: 'high' });
  assert.equal(p.h.journal.reseau[0].body.model, 'claude-sonnet-5');
});

test('T11 · CONTINUITE-01/02/02R/03/04, API-KEY-TEST-01, BETA-04, MODELE-PAR-DEFAUT-01 rejoués inchangés', () => {
  const suites = ['tests/continuite-conversationnelle-cont01.test.mjs', 'tests/continuite-session-cont02.test.mjs', 'tests/continuite-init-order-cont02r.test.mjs', 'tests/continuite-edit-guard-cont03.test.mjs', 'tests/continuite-api-e2e-cont04.test.mjs', 'tests/api-key-test-01.test.mjs', 'tests/beta04-stabilization.test.mjs', 'tests/modele-par-defaut-mpd01.test.mjs'];
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const sortie = execFileSync(process.execPath, ['--test', '--test-reporter=spec', ...suites], { encoding: 'utf8', env, cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 240000 });
  const n = (k) => Number((sortie.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) || [])[1]);
  assert.equal(n('fail'), 0, sortie.slice(-2000)); assert.equal(n('pass'), 14 + 20 + 8 + 17 + 16 + 22 + 27 + 8);
});
