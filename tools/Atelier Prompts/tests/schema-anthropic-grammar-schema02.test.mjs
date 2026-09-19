/* SCHEMA-ANTHROPIC-02 — RÉDUCTION DE LA GRAMMAIRE FOURNISSEUR
 * ============================================================================
 *
 * PREUVE FOURNISSEUR (smoke réel après SCHEMA-ANTHROPIC-01 #2) : clé 200, worker-fast 200, worker-deep 200,
 * appel Anthropic #1 → HTTP 400 invalid_request_error « The compiled grammar is too large, which would cause
 * performance issues. Simplify your tool schemas or reduce the number of strict tools. » Corps ≈ 38,7 Ko.
 *
 * MESURÉ AVANT CORRECTION (projection #2) : 15 297 octets, 114 nœuds, 83 properties, 80 required, 7 $ref,
 * 6 definitions, 54 descriptions pour 6 927 octets (la plus longue 794), profondeur 5, 11 enum, 1 const,
 * 19 additionalProperties:false. Le canonique : 11 510 octets, 197 nœuds, 4 descriptions (832 octets).
 * Source principale mesurée : 50 descriptions TECHNIQUES ajoutées par l'adaptateur (règles et contraintes
 * retirées recopiées en JSON/prose) = 6 927 − 832 = 6 095 octets, plus 4 minItems ; sans elles : 8 144 octets.
 *
 * PRINCIPE : une règle n'est pas encodée deux fois. La projection est un guide structurel minimal ; la
 * validation canonique après réponse (violationsContreSchema puis api.valider) est l'autorité complète.
 * $ref/definitions conservés : la version inline mesure 8 734 octets contre 8 092 (declaration utilisée deux fois).
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
const reponseStructuree = (objet) => reponse(200, { content: [{ type: 'text', text: JSON.stringify(objet) }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

/** Une page chargée, son moteur Architecte et la façade fournisseur. */
function page(repondre) {
  const h = chargerPage({ repondre });
  const w = h.ctx.window;
  return { h, w, api: w.__ARCHITECTE_V10__, adapt: w.schemaPourAnthropic, violations: w.violationsContreSchema, appel: w.appelFournisseur, F: w.FOURNISSEURS_API };
}
const NON_SUPPORTES = ['oneOf', 'not', 'if', 'then', 'else', 'contains', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'maxItems', 'uniqueItems', 'pattern', 'patternProperties', 'dependentSchemas', 'dependentRequired', 'propertyNames', 'minProperties', 'maxProperties', 'prefixItems'];
/** Parcourt un schéma : appelle `visite(noeud, chemin, sousConditionnel)`. Les sous-arbres if/then/else/not/contains sont marqués. */
function parcourir(s, visite, chemin = '$', cond = false) {
  if (!s || typeof s !== 'object') return;
  if (Array.isArray(s)) { s.forEach((x, i) => parcourir(x, visite, `${chemin}[${i}]`, cond)); return; }
  visite(s, chemin, cond);
  for (const k of Object.keys(s)) {
    if (['enum', 'const', 'required', 'default', 'description', 'type', 'title'].includes(k)) continue;
    const sousCond = cond || ['if', 'then', 'else', 'not', 'contains'].includes(k);
    if (['properties', 'definitions', '$defs', 'patternProperties'].includes(k)) { for (const n of Object.keys(s[k])) parcourir(s[k][n], visite, `${chemin}.${k}.${n}`, sousCond); }
    else if (typeof s[k] === 'object') parcourir(s[k], visite, `${chemin}.${k}`, sousCond);
  }
}
const motsCles = (s) => { const c = {}; parcourir(s, (n) => { for (const k of Object.keys(n)) c[k] = (c[k] || 0) + 1; }); return c; };


const HORS_FUSION = (chemin) => chemin.startsWith('$.definitions.preference_proposable');
function releve(s, cle) {
  const out = [];
  parcourir(s, (n, chemin, cond) => { if (!cond && !HORS_FUSION(chemin) && n[cle] !== undefined) out.push([chemin, JSON.stringify(n[cle])]); });
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}


/** Métriques structurelles d'un schéma. */
function metriques(s) {
  const m = { octets: JSON.stringify(s).length, noeuds: 0, properties: 0, required: 0, ref: 0, definitions: 0, descriptions: 0, descriptions_octets: 0, plus_longue: 0, profondeur: 0, enum: 0, const: 0, ap_false: 0, anyOf: 0, minItems: 0 };
  (function w(n, d) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => w(x, d)); return; }
    m.noeuds += 1; m.profondeur = Math.max(m.profondeur, d);
    if (n.properties) { m.properties += Object.keys(n.properties).length; for (const k of Object.keys(n.properties)) w(n.properties[k], d + 1); }
    if (n.definitions) { m.definitions += Object.keys(n.definitions).length; for (const k of Object.keys(n.definitions)) w(n.definitions[k], d + 1); }
    if (Array.isArray(n.required)) m.required += n.required.length;
    if (n.$ref) m.ref += 1;
    if (typeof n.description === 'string') { m.descriptions += 1; m.descriptions_octets += Buffer.byteLength(n.description); m.plus_longue = Math.max(m.plus_longue, n.description.length); }
    if (n.enum) m.enum += 1; if (n.const !== undefined) m.const += 1; if (n.additionalProperties === false) m.ap_false += 1; if (n.anyOf) m.anyOf += 1; if (n.minItems !== undefined) m.minItems += 1;
    for (const k of ['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains']) if (n[k] && typeof n[k] === 'object') w(n[k], d + 1);
    for (const k of ['anyOf', 'allOf', 'oneOf']) if (Array.isArray(n[k])) n[k].forEach((b) => w(b, d + 1));
  })(s, 1);
  return m;
}
/* La projection #2, telle que mesurée avant cette correction (commit 0cb3bfc9). */
const AVANT = { octets: 15297, noeuds: 114, properties: 83, required: 80, ref: 7, definitions: 6, descriptions: 54, descriptions_octets: 6927, plus_longue: 794, profondeur: 5, enum: 11, const: 1, ap_false: 19, anyOf: 0, minItems: 4 };

test('T1 · CANONICAL_UNCHANGED : deep-equal avant/après, non muté, empreinte source du guard', () => {
  const { api, adapt } = page();
  const avant = clone(api.schema); adapt(api.schema);
  assert.deepEqual(clone(api.schema), avant);
  assert.equal(createHash('sha256').update(html.slice(html.indexOf('const ARCH_SCHEMA='), html.indexOf('let ARCH_SYSTEM='))).digest('hex'), 'a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b');
  assert.deepEqual(metriques(api.schema), { octets: 11510, noeuds: 197, properties: 121, required: 88, ref: 7, definitions: 6, descriptions: 4, descriptions_octets: 832, plus_longue: 371, profondeur: 7, enum: 17, const: 17, ap_false: 20, anyOf: 0, minItems: 6 });
});

test('T2/T3 · NO_ONEOF, NO_UNSUPPORTED_ANYOF_PATTERN : les deux blockers précédents restent fermés', () => {
  const { api, adapt } = page();
  const projete = adapt(api.schema);
  assert.equal(JSON.stringify(projete).includes('"oneOf"'), false);
  assert.equal(JSON.stringify(projete).includes('"anyOf"'), false);
  parcourir(projete, (n, chemin) => { if (n.anyOf !== undefined) assert.equal(n.type, undefined, chemin); });
});

test('T4 · PROVIDER_SCHEMA_SIZE_REDUCED : mesuré avant/après — octets −47 %, descriptions 54 → 4, octets de descriptions 6 927 → 832, minItems 4 → 0 ; structure (nœuds, properties, required, $ref, definitions, enum, const, additionalProperties) inchangée', () => {
  const { api, adapt } = page();
  const m = metriques(adapt(api.schema));
  assert.ok(m.octets < AVANT.octets * 0.55, `${m.octets} octets contre ${AVANT.octets}`);
  assert.equal(m.descriptions, 4); assert.equal(m.descriptions_octets, 832); assert.equal(m.plus_longue, 371); assert.equal(m.minItems, 0);
  for (const k of ['noeuds', 'properties', 'required', 'ref', 'definitions', 'profondeur', 'enum', 'const', 'ap_false', 'anyOf']) assert.equal(m[k], AVANT[k], k);
  assert.ok(m.octets <= 8100, `${m.octets} octets — 8 092 mesurés ; toute hausse doit être motivée`);
});

test('T5 · TECHNICAL_DESCRIPTION_DUPLICATION_REMOVED : aucune description ne contient de sérialisation JSON du canonique ni de recopie de contrainte', () => {
  const { api, adapt } = page();
  parcourir(adapt(api.schema), (n, chemin) => {
    if (n.description === undefined) return;
    assert.equal(/\{"|"\}|Règle vérifiée|Contrainte|vérifiée après réponse|minLength|maxLength|minItems|maxItems|minimum|oneOf|if\b.*then/.test(n.description), false, `${chemin} : ${n.description.slice(0, 60)}`);
  });
  const src = html.slice(html.indexOf('function schemaPourAnthropic('), html.indexOf('async function transportAnthropic('));
  assert.equal(/vérifiée après réponse : '|Règle vérifiée après réponse : '/.test(src), false, 'l’adaptateur ne fabrique plus de description');
});

test('T6 · BUSINESS_DESCRIPTIONS_PRESERVED_WHERE_USEFUL : les 4 descriptions métier du canonique, mot pour mot, à leur nœud', () => {
  const { api, adapt } = page();
  const p = adapt(api.schema), c = api.schema;
  assert.equal(p.definitions.declaration.properties.statut.description, c.definitions.declaration.properties.statut.description);
  assert.equal(p.definitions.preference_proposable.properties.preference_id.description, c.definitions.preference_proposable.oneOf[2].properties.preference_id.description);
  assert.equal(p.properties.evaluation.properties.connaissance_externe_necessaire.description, c.properties.evaluation.properties.connaissance_externe_necessaire.description);
  assert.equal(p.description, c.allOf[0].description, 'la description du membre allOf racine, désormais vidé, remonte à la racine');
  let n = 0; parcourir(p, (x) => { if (x.description !== undefined) n += 1; }); assert.equal(n, 4);
});

test('T7 · REQUIRED_STRUCTURAL_FIELDS_PRESERVED : chaque required hors conditionnels et hors fusion identique au canonique ; racine et blocs intacts', () => {
  const { api, adapt } = page();
  const p = adapt(api.schema);
  assert.deepEqual(releve(p, 'required'), releve(api.schema, 'required'));
  assert.deepEqual(clone(p.required), ['version', 'comprehension', 'evaluation', 'strategie', 'livrable', 'compilation', 'verification', 'apprentissage']);
  assert.deepEqual(clone(p.definitions.preference_proposable.required), ['type']);
  assert.equal(metriques(p).required, 80);
});

test('T8 · ENUM_CONST_DISCRIMINANTS_PRESERVED : 10 enums canoniques hors conditionnels + discriminant fusionné, const version 3.4, types union avec null', () => {
  const { api, adapt } = page();
  const p = adapt(api.schema);
  assert.deepEqual(releve(p, 'enum'), releve(api.schema, 'enum'));
  assert.deepEqual(clone(p.definitions.preference_proposable.properties.type), { enum: ['nouvelle', 'corroboration'], type: 'string' });
  assert.equal(p.properties.version.const, '3.4');
  assert.deepEqual(releve(p, 'type').filter(([, t]) => t.includes('null')), releve(api.schema, 'type').filter(([, t]) => t.includes('null')));
});

test('T9 · CANONICAL_VALIDATOR_STILL_REJECTS : ce que la projection ne dit plus reste exigé après réponse (échantillon ; la suite SCHEMA-ANTHROPIC-01 T8 rejoue les 18 mutations)', async () => {
  const { api, violations } = page();
  assert.deepEqual(clone(violations(api.schema, analyseFixture())), []);
  const cas = [
    [(a) => { a.apprentissage.preference_proposable = { type: 'corroboration', preference_id: 'p', confirmations_invoquees: ['une'] }; }, /confirmations_invoquees : minItems 2/],
    [(a) => { a.strategie.role_adaptatif.competences = []; }, /competences : minItems 1/],
    [(a) => { a.comprehension.intention_principale = ''; }, /intention_principale : minLength 1/],
    [(a) => { a.livrable.quantites = { min: null, max: null, unite: null }; }, /forme interdite par not/],
    [(a) => { a.apprentissage.preference_proposable = { type: 'nouvelle' }; }, /texte : requis \(branche 1\)/],
  ];
  for (const [muter, attendu] of cas) { const a = analyseFixture(); muter(a); const v = violations(api.schema, a); assert.ok(v.some((m) => attendu.test(m)), v.join(' | ')); }
  const corps = analyseFixture(); corps.strategie.role_adaptatif.competences = [];
  const p2 = page(() => reponseStructuree(corps));
  await assert.rejects(p2.appel({ fournisseur: 'anthropic', cle: 'k', modele: 'm', maxTokens: 8000, systeme: 's', contenuUtilisateur: 'c', schema: p2.api.schema, effort: 'high' }), (e) => e.categorie === 'sortie_invalide' && /competences : minItems 1/.test(e.message));
});

test('T10 · OTHER_PROVIDERS_UNCHANGED', async () => {
  const { api, appel, F } = page();
  const recu = [];
  F.factice = { id: 'factice', nom: 'Factice', transport: async (p) => { recu.push(p); return { texte: '{}', tokens: {} }; }, modeles: {}, tarifDuJour: () => ({ connu: false }), capacites: { sortie_structuree: true, effort_raisonnement: true, annulation: true, prefill_assistant: true, limites: {} } };
  await appel({ fournisseur: 'factice', cle: 'k', modele: 'm', maxTokens: 10, systeme: 's', contenuUtilisateur: 'c', schema: api.schema, effort: 'high' });
  assert.equal(recu[0].schema, api.schema); assert.ok(JSON.stringify(recu[0].schema).includes('"oneOf"'));
  delete F.factice;
});

test('T-PAYLOAD (§9) · corps réel de l’appel #1 sans réseau : tailles, nœuds, profondeur, vocabulaire — comparés à la correction #2', async () => {
  const corps = analyseFixture();
  const { api, appel, h } = page(() => reponseStructuree(corps));
  await appel({ fournisseur: 'anthropic', cle: 'k', modele: 'claude-opus-5', maxTokens: 8000, systeme: 'SYS', contenuUtilisateur: 'CTX', schema: api.schema, effort: 'high' });
  const b = h.journal.reseau[0].body;
  const schema = b.output_config.format.schema;
  const m = metriques(schema);
  const vocab = {}; parcourir(schema, (n) => { for (const k of Object.keys(n)) vocab[k] = (vocab[k] || 0) + 1; });
  const rapport = { body_octets: JSON.stringify(b).length, schema_octets: m.octets, descriptions_octets: m.descriptions_octets, descriptions: m.descriptions, noeuds: m.noeuds, profondeur: m.profondeur, vocabulaire: Object.keys(vocab).sort(), avant_schema_octets: AVANT.octets, avant_descriptions_octets: AVANT.descriptions_octets };
  console.log(JSON.stringify({ etape: 'T-PAYLOAD', ...rapport }));
  assert.ok(m.octets < 8100 && m.octets > 7000); assert.equal(m.descriptions_octets, 832); assert.equal(m.noeuds, 114); assert.equal(m.profondeur, 5);
  assert.deepEqual(rapport.vocabulaire, ['$ref', 'additionalProperties', 'const', 'definitions', 'description', 'enum', 'items', 'properties', 'required', 'type']);
  assert.equal(b.output_config.effort, 'high'); assert.equal(b.max_tokens, 8000); assert.equal(b.model, 'claude-opus-5');
});

test('T11/T12 · CONTINUITE-01..04, API-KEY-TEST-01, SCHEMA-ANTHROPIC-01, BETA-04 rejoués', () => {
  const suites = ['tests/continuite-conversationnelle-cont01.test.mjs', 'tests/continuite-session-cont02.test.mjs', 'tests/continuite-init-order-cont02r.test.mjs', 'tests/continuite-edit-guard-cont03.test.mjs', 'tests/continuite-api-e2e-cont04.test.mjs', 'tests/api-key-test-01.test.mjs', 'tests/schema-anthropic-projection-schema01.test.mjs', 'tests/beta04-stabilization.test.mjs'];
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const sortie = execFileSync(process.execPath, ['--test', '--test-reporter=spec', ...suites], { encoding: 'utf8', env, cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 240000 });
  const n = (k) => Number((sortie.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) || [])[1]);
  assert.equal(n('fail'), 0, sortie.slice(-2000)); assert.equal(n('pass'), 14 + 20 + 8 + 17 + 16 + 22 + 13 + 27);
});
