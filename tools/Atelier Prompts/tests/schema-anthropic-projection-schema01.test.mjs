/* SCHEMA-ANTHROPIC-01 (CONTINUITE-04) — LA PROJECTION DU SCHÉMA CANONIQUE VERS ANTHROPIC
 * ============================================================================
 *
 * LE BLOCKER, PROUVÉ PAR LE FOURNISSEUR. Smoke réel de CONTINUITE-04 : worker-fast 200, worker-deep 200,
 * puis appel Anthropic #1 → HTTP 400 invalid_request_error « output_config.format.schema: Schema type
 * 'oneOf' is not supported ». La clé était valide (API-KEY-TEST-01 vert, 200 réel). Le corps de l'appel #1
 * ne diffère du test de clé que par system, max_tokens 8000, output_config.format (schéma 3.4) et
 * output_config.effort ; Anthropic a nommé le schéma.
 *
 * LA CARTE DU CANONIQUE (schéma 3.4, `api.schema`) : 1 oneOf (definitions.preference_proposable : null |
 * {type:'nouvelle', texte} | {type:'corroboration', preference_id, confirmations_invoquees}), 13 règles
 * if/then dans 5 allOf (declaration ×4, fondement ×2, evaluation ×4, quantites ×2, racine ×1 avec contains),
 * 1 not (quantites), 45 minLength, 2 maxLength, 2 minimum, 1 maxItems, 1 minItems 2, 7 $ref locaux vers
 * definitions, 17 enum, 17 const, 20 additionalProperties:false, types union avec null.
 *
 * LA PROJECTION (`schemaPourAnthropic`, couche fournisseur uniquement) : oneOf → anyOf quand les branches
 * sont PROUVÉES disjointes ; règles logiques (if/then/else, not, contains…) et contraintes de valeur
 * (minLength, maxLength, minimum, maxItems, minItems > 1…) retirées de la projection et reportées mot pour
 * mot dans la description du nœud ; tout le reste (types, enum, const, required, additionalProperties:false,
 * $ref/definitions, structure) inchangé. Le canonique n'est jamais muté.
 *
 * LA GARANTIE APRÈS RÉPONSE (`violationsContreSchema`, transportAnthropic) : la réponse est vérifiée contre
 * le schéma CANONIQUE — règles et contraintes reportées comprises — avant d'être rendue ; non conforme =
 * sortie_invalide. Puis `api.valider()` (archValider) garde ses contrôles sémantiques (citations, rôle…).
 * Rien n'est perdu en silence : ce que la projection ne dit plus, la validation canonique l'exige.
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

/* ==========================================================================
 * LA PROJECTION
 * ======================================================================= */

test('T1 · NO_ONEOF_AFTER_ANTHROPIC_ADAPTATION : plus aucun oneOf ni aucun mot-clé documenté non pris en charge ; minItems ≤ 1 ; additionalProperties uniquement false', () => {
  const { api, adapt } = page();
  const projete = adapt(api.schema);
  const texte = JSON.stringify(projete);
  assert.equal(texte.includes('"oneOf"'), false);
  const comptes = motsCles(projete);
  for (const k of NON_SUPPORTES) assert.equal(comptes[k], undefined, `mot-clé non pris en charge encore présent : ${k}`);
  parcourir(projete, (n, chemin) => {
    if (n.minItems !== undefined) assert.ok(n.minItems === 0 || n.minItems === 1, `${chemin}.minItems=${n.minItems}`);
    if (n.additionalProperties !== undefined) assert.equal(n.additionalProperties, false, chemin);
    if (n.$ref !== undefined) assert.match(n.$ref, /^#\/definitions\//, `référence locale seulement : ${chemin}`);
  });
  assert.deepEqual(Object.keys(comptes).sort(), ['$ref', 'additionalProperties', 'anyOf', 'const', 'definitions', 'description', 'enum', 'items', 'minItems', 'properties', 'required', 'type'], 'le vocabulaire restant est exactement le sous-ensemble pris en charge');
  assert.deepEqual(clone(adapt(projete)), clone(projete), 'idempotente');
});

test('T2 · CANONICAL_SCHEMA_UNCHANGED : le canonique est deep-equal avant/après, non muté, et son empreinte est celle du guard', () => {
  const { api, adapt } = page();
  const avant = clone(api.schema);
  const texteAvant = JSON.stringify(api.schema);
  adapt(api.schema);
  assert.deepEqual(clone(api.schema), avant);
  assert.equal(JSON.stringify(api.schema), texteAvant);
  const c = motsCles(api.schema);
  assert.equal(c.oneOf, 1); assert.equal(c.if, 13); assert.equal(c.not, 1); assert.equal(c.contains, 1); assert.equal(c.minLength, 45);
  /* L'empreinte du bloc source ARCH_SCHEMA, telle que tools/frozen-guard.mjs la calcule. */
  const bloc = html.slice(html.indexOf('const ARCH_SCHEMA='), html.indexOf('let ARCH_SYSTEM='));
  assert.equal(createHash('sha256').update(bloc).digest('hex'), 'a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b');
});

/** Paires (chemin, valeur) d'un mot-clé, hors sous-arbres conditionnels, avec oneOf renommé anyOf dans les chemins. */
function releve(s, cle) {
  const out = [];
  parcourir(s, (n, chemin, cond) => { if (!cond && n[cle] !== undefined) out.push([chemin.replace(/\.oneOf\[/g, '.anyOf['), JSON.stringify(n[cle])]); });
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

test('T3 · REQUIRED_PRESERVED : chaque required du canonique (hors règles conditionnelles) est identique, au même chemin, dans la projection', () => {
  const { api, adapt } = page();
  const c = releve(api.schema, 'required'), p = releve(adapt(api.schema), 'required');
  assert.ok(c.length >= 20); assert.deepEqual(p, c);
});

test('T4 · ENUMS_PRESERVED : chaque enum et chaque const hors conditionnels sont identiques ; les enums des conditions vivent dans les règles reportées', () => {
  const { api, adapt } = page();
  const projete = adapt(api.schema);
  assert.deepEqual(releve(projete, 'enum'), releve(api.schema, 'enum'));
  assert.deepEqual(releve(projete, 'const'), releve(api.schema, 'const'));
  assert.equal(releve(api.schema, 'enum').length, 10);
  assert.deepEqual(releve(projete, 'const').map(([c]) => c), ['$.definitions.preference_proposable.anyOf[1].properties.type', '$.definitions.preference_proposable.anyOf[2].properties.type', '$.properties.version']);
});

test('T5 · OBJECT_STRUCTURE_PRESERVED : mêmes properties, mêmes types, mêmes additionalProperties:false (20), mêmes $ref, mêmes items — aucun aplatissement', () => {
  const { api, adapt } = page();
  const projete = adapt(api.schema);
  const cles = (s) => { const out = []; parcourir(s, (n, chemin, cond) => { if (!cond && n.properties) out.push([chemin.replace(/\.oneOf\[/g, '.anyOf['), Object.keys(n.properties).join(',')]); }); return out.sort(); };
  assert.deepEqual(cles(projete), cles(api.schema));
  assert.deepEqual(releve(projete, 'type'), releve(api.schema, 'type'));
  assert.deepEqual(releve(projete, '$ref'), releve(api.schema, '$ref'));
  assert.deepEqual(releve(projete, 'additionalProperties'), releve(api.schema, 'additionalProperties'));
  assert.equal(releve(projete, 'additionalProperties').length, 20);
  assert.deepEqual(clone(Object.keys(projete.definitions)), clone(Object.keys(api.schema.definitions)));
  assert.deepEqual(clone(projete.required), clone(api.schema.required));
  assert.equal(projete.$schema, undefined); assert.equal(projete.$id, undefined); assert.equal(api.schema.$schema, 'http://json-schema.org/draft-07/schema#');
});

test('T6 · NULLABLE_CASES : les unions de type avec null restent telles quelles ; enum à type union → anyOf par type (BETA-04) ; null | objets → anyOf avec {type:null}', () => {
  const { api, adapt } = page();
  const projete = adapt(api.schema);
  const unions = releve(api.schema, 'type').filter(([, t]) => t.includes('null'));
  assert.ok(unions.length >= 8, 'le canonique a des unions avec null');
  assert.deepEqual(releve(projete, 'type').filter(([, t]) => t.includes('null')), unions);
  assert.deepEqual(clone(projete.definitions.preuve.type), ['object', 'null']);
  assert.deepEqual(clone(projete.definitions.preference_proposable.type), ['object', 'null']);
  assert.deepEqual(clone(projete.definitions.preference_proposable.anyOf[0]), { type: 'null' });
  assert.deepEqual(clone(adapt({ type: ['string', 'null'], enum: ['a', null] })), { anyOf: [{ type: 'string', enum: ['a'] }, { type: 'null', enum: [null] }] });
  assert.deepEqual(clone(adapt({ oneOf: [{ type: 'string' }, { type: 'null' }] })), { anyOf: [{ type: 'string' }, { type: 'null' }] });
});

test('T7 · DISCRIMINATED_BRANCHES : preference_proposable — trois branches prouvées disjointes (null / type=nouvelle / type=corroboration) → anyOf ; un oneOf non prouvé disjoint est refusé', () => {
  const { api, adapt } = page();
  const canon = api.schema.definitions.preference_proposable;
  const p = adapt(api.schema).definitions.preference_proposable;
  assert.equal(p.oneOf, undefined); assert.equal(p.anyOf.length, 3);
  assert.deepEqual(clone(p.anyOf), clone(canon.oneOf.map((b) => adapt(b))), 'chaque branche est la projection de la branche canonique');
  assert.deepEqual(clone(p.anyOf[1].required), ['type', 'texte']); assert.deepEqual(clone(p.anyOf[2].required), ['type', 'preference_id', 'confirmations_invoquees']);
  assert.equal(p.anyOf[1].properties.type.const, 'nouvelle'); assert.equal(p.anyOf[2].properties.type.const, 'corroboration');
  assert.equal(p.anyOf[2].properties.confirmations_invoquees.minItems, 1);
  assert.match(p.anyOf[2].properties.confirmations_invoquees.description, /minItems 2/);
  /* Disjonction prouvée par discriminant enum, par types primitifs distincts ; refus sinon. */
  assert.ok(adapt({ oneOf: [{ type: 'object', required: ['k'], properties: { k: { enum: ['a', 'b'] } } }, { type: 'object', required: ['k'], properties: { k: { enum: ['c'] } } }] }).anyOf);
  assert.ok(adapt({ oneOf: [{ type: 'string' }, { type: 'integer' }] }).anyOf);
  assert.throws(() => adapt({ oneOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'object', properties: { b: { type: 'string' } } }] }), /non prouvées disjointes/);
  assert.throws(() => adapt({ oneOf: [{ type: 'object', required: ['k'], properties: { k: { enum: ['a', 'b'] } } }, { type: 'object', required: ['k'], properties: { k: { enum: ['b'] } } }] }), /non prouvées disjointes/);
  assert.throws(() => adapt({ oneOf: [{ type: 'number' }, { type: 'integer' }] }), /non prouvées disjointes/);
  assert.throws(() => adapt({ oneOf: [{ type: 'object', properties: { k: { const: 'a' } } }, { type: 'object', properties: { k: { const: 'b' } } }] }), /non prouvées disjointes/, 'sans required des deux côtés, rien n’est prouvé');
  /* Un anyOf déjà présent est conservé par conjonction, jamais écrasé. */
  assert.deepEqual(clone(adapt({ anyOf: [{ type: 'string' }], oneOf: [{ type: 'string' }, { type: 'null' }] })), { anyOf: [{ type: 'string' }], allOf: [{ anyOf: [{ type: 'string' }, { type: 'null' }] }] });
});

test('T7b · RULES_REPORTED_VERBATIM : les 14 règles (13 if/then + 1 not) et chaque contrainte de valeur hors conditionnel sont reportées mot pour mot dans la description du nœud porteur', () => {
  const { api, adapt } = page();
  const projete = adapt(api.schema);
  let regles = 0; parcourir(projete, (n) => { if (n.description) regles += (n.description.match(/Règle vérifiée après réponse : /g) || []).length; });
  assert.equal(regles, 14);
  /* Chaque règle canonique, sérialisée telle quelle, figure dans une description. */
  const descriptions = []; parcourir(projete, (n) => { if (n.description) descriptions.push(n.description); });
  const tout = descriptions.join('\n');
  parcourir(api.schema, (n, chemin, cond) => {
    if (cond) return;
    const regle = {}; for (const k of ['if', 'then', 'else', 'not', 'contains']) if (n[k] !== undefined) regle[k] = n[k];
    if (Object.keys(regle).length) assert.ok(tout.includes('Règle vérifiée après réponse : ' + JSON.stringify(regle) + '.'), chemin);
    for (const k of ['minLength', 'maxLength', 'minimum', 'maximum', 'maxItems']) if (n[k] !== undefined) assert.ok(tout.includes(`${k} ${JSON.stringify(n[k])}`), `${chemin}.${k}`);
    if (n.minItems > 1) assert.ok(tout.includes(`minItems ${n.minItems}`), chemin);
  });
  assert.match(projete.description, /^Une information bloquante interdit un livrable complet immédiat\. Règle vérifiée après réponse : \{"if"/, 'la description propre du membre allOf est conservée devant la règle');
  assert.equal(projete.allOf, undefined);
  assert.equal(projete.properties.livrable.properties.quantites.allOf, undefined);
  assert.match(projete.properties.livrable.properties.quantites.description, /"not"/);
  assert.match(projete.definitions.declaration.description, /"statut":\{"enum":\["declaration_utilisateur"\]\}/);
});

/* ==========================================================================
 * LA GARANTIE APRÈS RÉPONSE
 * ======================================================================= */

test('T8 · POST_VALIDATION_STILL_REJECTS_INVALID : une réponse valide passe ; chaque contrainte reportée est exigée par violationsContreSchema ; le transport rejette (sortie_invalide) ; api.valider garde ses contrôles', async () => {
  const { api, violations } = page();
  const valide = analyseFixture();
  assert.deepEqual(clone(violations(api.schema, valide)), [], 'la fixture canonique est conforme');
  const cas = [
    ['oneOf exact (branche corroboration sans preference_id)', (a) => { a.apprentissage.preference_proposable = { type: 'corroboration', texte: 'x' }; }, /preference_proposable : aucune branche anyOf|oneOf exige exactement une branche/],
    ['minItems 2 reporté', (a) => { a.apprentissage.preference_proposable = { type: 'corroboration', preference_id: 'p1', confirmations_invoquees: ['une'] }; }, /confirmations_invoquees : minItems 2/],
    ['not reporté (min et max null)', (a) => { a.livrable.quantites = { min: null, max: null, unite: null }; }, /quantites : forme interdite par not/],
    ['if/then reporté (min entier sans unité)', (a) => { a.livrable.quantites = { min: 3, max: null, unite: null }; }, /quantites\.unite : type attendu string .*règle conditionnelle/],
    ['if/then reporté (statut déduction avec source demande)', (a) => { a.comprehension.declarations = [{ contenu: 'x', statut: 'deduction_llm', source: 'demande', preuve: null }]; }, /declarations\[0\]\.source : valeur attendue "aucune" \(règle conditionnelle\)/],
    ['if/then + contains reportés (information bloquante avec livrable complet)', (a) => { a.comprehension.informations_manquantes = [{ information: 'délai', bloquant: true, justification: 'sans délai, impossible' }]; a.evaluation.livrable_complet_possible = true; a.evaluation.action_recommandee = 'questionner'; a.evaluation.questions_a_poser = ['Quel délai ?']; }, /evaluation\.livrable_complet_possible : valeur attendue false \(règle conditionnelle\)/],
    ['minLength reporté', (a) => { a.comprehension.intention_principale = ''; }, /intention_principale : minLength 1/],
    ['maxItems reporté', (a) => { a.evaluation.action_recommandee = 'questionner'; a.evaluation.questions_a_poser = ['a', 'b', 'c', 'd']; }, /questions_a_poser : maxItems 3/],
    ['minimum reporté', (a) => { a.livrable.quantites = { min: -1, max: 2, unite: 'u' }; }, /quantites\.min : minimum 0/],
    ['enum', (a) => { a.evaluation.niveau_risque = 'extrême'; }, /niveau_risque : valeur hors enum/],
    ['const version', (a) => { a.version = '3.3'; }, /version : valeur attendue "3\.4"/],
    ['required', (a) => { delete a.strategie.role_adaptatif.mission; }, /role_adaptatif\.mission : requis/],
    ['additionalProperties', (a) => { a.evaluation.commentaire = 'x'; }, /evaluation\.commentaire : propriété non prévue/],
    ['$ref + if/then de fondement (citation obligatoire)', (a) => { a.compilation.composants_retenus = [{ type: 'contrainte', titre: 't', contenu: 'c', justification: 'j', fondements: [{ nature: 'utilisateur', citation: null, usage: 'usage clair' }] }]; }, /fondements\[0\]\.citation : type attendu string \(reçu null\) \(règle conditionnelle\)/],
  ];
  for (const [nom, muter, attendu] of cas) {
    const a = analyseFixture(); muter(a);
    const v = violations(api.schema, a);
    assert.ok(v.length, `${nom} : aucune violation détectée`);
    assert.ok(v.some((m) => attendu.test(m)), `${nom} : ${v.join(' | ')}`);
    for (const m of v) assert.equal(/extrême|délai|commentaire=|usage clair/.test(m.replace(/^\S+ /, '')), false, 'les messages ne citent jamais la valeur reçue');
  }
  /* Le transport : une réponse 200 non conforme est rejetée avant d'être rendue ; une conforme passe. */
  let corps = analyseFixture(); corps.apprentissage.preference_proposable = { type: 'nouvelle', texte: '' };
  const p2 = page(() => reponseStructuree(corps));
  await assert.rejects(p2.appel({ fournisseur: 'anthropic', cle: 'k', modele: 'm', maxTokens: 8000, systeme: 's', contenuUtilisateur: 'c', schema: p2.api.schema, effort: 'high' }),
    (e) => { assert.equal(e.categorie, 'sortie_invalide'); assert.equal(e.statut_http, 200); assert.match(e.message, /^Réponse structurée non conforme au schéma canonique : \$\.apprentissage\.preference_proposable/); assert.ok(e.detail.violations.length >= 1); assert.equal(e.texte_partiel, JSON.stringify(corps)); return true; });
  corps = analyseFixture();
  const r = await p2.appel({ fournisseur: 'anthropic', cle: 'k', modele: 'm', maxTokens: 8000, systeme: 's', contenuUtilisateur: 'c', schema: p2.api.schema, effort: 'high' });
  assert.equal(r.structure_validee, true); assert.equal(r.texte, JSON.stringify(corps));
  const p3 = page(() => reponse(200, { content: [{ type: 'text', text: 'pas du json' }], usage: {}, stop_reason: 'end_turn' }));
  const r3 = await p3.appel({ fournisseur: 'anthropic', cle: 'k', modele: 'm', maxTokens: 8000, systeme: 's', contenuUtilisateur: 'c', schema: p3.api.schema });
  assert.equal(r3.structure_validee, false, 'texte non analysable : laissé à l’appelant, jamais lu comme conforme');
  const p4 = page(() => reponse(200, { content: [{ type: 'text', text: 'libre' }], usage: {}, stop_reason: 'end_turn' }));
  assert.equal((await p4.appel({ fournisseur: 'anthropic', cle: 'k', modele: 'm', maxTokens: 16, contenuUtilisateur: 'c' })).structure_validee, null, 'sans schéma, rien n’est vérifié');
  /* api.valider() reste en place. */
  assert.deepEqual(clone(api.valider(analyseFixture())), []);
  const sans = analyseFixture(); delete sans.verification;
  assert.ok(api.valider(sans).some((m) => /verification/.test(m)));
});

test('T9 · OTHER_PROVIDERS_UNCHANGED : la projection n’existe que dans le transport Anthropic ; un autre fournisseur reçoit le schéma canonique intact (oneOf compris)', async () => {
  const { api, appel, F, w } = page();
  const recu = [];
  F.factice = { id: 'factice', nom: 'Factice', transport: async (p) => { recu.push(p); return { texte: '{}', tokens: {} }; }, modeles: {}, tarifDuJour: () => ({ connu: false }), capacites: { sortie_structuree: true, effort_raisonnement: true, annulation: true, prefill_assistant: true, limites: {} } };
  await appel({ fournisseur: 'factice', cle: 'k', modele: 'm', maxTokens: 10, systeme: 's', contenuUtilisateur: 'c', schema: api.schema, effort: 'high' });
  assert.equal(recu[0].schema, api.schema, 'même référence, non projetée');
  assert.equal(JSON.stringify(recu[0].schema).includes('"oneOf"'), true);
  assert.equal(F.anthropic.transport.name, 'transportAnthropic');
  assert.equal(w.validerConfigurationFournisseur(F.anthropic).valide, true);
  delete F.factice;
});

/* ==========================================================================
 * LE CORPS RÉEL DE L'APPEL #1 (§8 — sans appel réseau)
 * ======================================================================= */

test('T-PAYLOAD · le corps de l’appel #1 tel que le transport le construit : output_config.format json_schema projeté (zéro oneOf, zéro mot-clé non pris en charge), effort high, modèle et max_tokens inchangés, sérialisable, taille bornée', async () => {
  const corps = analyseFixture();
  const { api, adapt, appel, h } = page(() => reponseStructuree(corps));
  await appel({ fournisseur: 'anthropic', cle: 'k', modele: 'claude-opus-5', maxTokens: 8000, systeme: 'SYS', contenuUtilisateur: 'CTX', schema: api.schema, effort: 'high' });
  assert.equal(h.journal.reseau.length, 1);
  const b = h.journal.reseau[0].body;
  assert.deepEqual(Object.keys(b).sort(), ['max_tokens', 'messages', 'model', 'output_config', 'system']);
  assert.equal(b.model, 'claude-opus-5'); assert.equal(b.max_tokens, 8000); assert.equal(b.system, 'SYS');
  assert.equal(b.output_config.format.type, 'json_schema'); assert.equal(b.output_config.effort, 'high');
  assert.deepEqual(clone(b.output_config.format.schema), clone(adapt(api.schema)));
  const texte = JSON.stringify(b.output_config.format.schema);
  assert.equal(texte.includes('"oneOf"'), false);
  const comptes = motsCles(b.output_config.format.schema);
  for (const k of NON_SUPPORTES) assert.equal(comptes[k], undefined, k);
  assert.ok(texte.length > 11000 && texte.length < 20000, `schéma projeté : ${texte.length} octets`);
  assert.ok(JSON.stringify(b).length < 40000);
});

/* ==========================================================================
 * NON-RÉGRESSION
 * ======================================================================= */

test('T10/T11 · CONTINUITE-01/02/02R/03/04, API-KEY-TEST-01 et BETA-04 : rejoués inchangés', () => {
  const suites = ['tests/continuite-conversationnelle-cont01.test.mjs', 'tests/continuite-session-cont02.test.mjs', 'tests/continuite-init-order-cont02r.test.mjs', 'tests/continuite-edit-guard-cont03.test.mjs', 'tests/continuite-api-e2e-cont04.test.mjs', 'tests/api-key-test-01.test.mjs', 'tests/beta04-stabilization.test.mjs'];
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const sortie = execFileSync(process.execPath, ['--test', '--test-reporter=spec', ...suites], { encoding: 'utf8', env, cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 180000 });
  const n = (k) => Number((sortie.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) || [])[1]);
  assert.equal(n('fail'), 0, sortie.slice(-2000)); assert.equal(n('pass'), 14 + 20 + 8 + 17 + 16 + 22 + 27);
});
