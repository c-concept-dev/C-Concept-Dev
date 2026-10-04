/* PROVIDER-OPENAI-01 — OPENAI DANS LE PIPELINE API AUTOMATIQUE
 * ============================================================================
 *
 * Le pipeline API automatique du produit — l'Architecte, le compilateur, le banc d'essai, le module
 * Qualité, l'envoi direct — n'avait qu'un fournisseur. Ce lot en ajoute un second, OpenAI, par la
 * seule porte prévue pour ça : une entrée dans FOURNISSEURS_API. Ce fichier charge la PAGE ENTIÈRE
 * (cinq blocs <script>) avec un DOM simulé et un réseau factice, comme API-KEY-TEST-01.
 *
 * CE QUE CE FICHIER REJOUE N'EST PAS INVENTÉ. Les réponses du fournisseur utilisées ici sont des
 * réponses RÉELLES, enregistrées pendant la campagne de mesure du lot
 * (evaluation/provider-openai-01/smokes-reels.json) : l'appel d'outil complet sur le schéma
 * canonique, et les deux tours du mécanisme de correction. Un test qui rejoue une réponse fabriquée
 * ne prouve que la cohérence du test avec lui-même.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { html } from './perf04-frontend-harness.helper.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLE = 'sk-proj-provider-openai-01-jamais-journalisee';
const MODELE = 'gpt-5.6-sol';
const ENDPOINT = 'https://api.openai.com/v1/responses';

/* Les mesures réelles du lot : rien ici n'est une réponse fabriquée. */
const RELEVE = JSON.parse(fs.readFileSync(path.join(racine, 'evaluation/provider-openai-01/smokes-reels.json'), 'utf8'));
const REEL = RELEVE.succes_mesures[0];
const CORR = RELEVE.correction_mesuree;

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
    else if (/^<\/script>/.test(lignes[i]) && open !== -1) { blocs.push({ from: open, to: i }); open = -1; }
  } }

/** Réponse fournisseur factice, telle que le transport la lit (status, ok, json()). */
const reponse = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body });
/** Une enveloppe /v1/responses complète, avec son appel d'outil. */
const enveloppeOutil = (arguments_, { call_id = 'call_PROVIDEROPENAI01', reflexions = 1, usage = { input_tokens: 11, output_tokens: 7 }, statut = 'completed' } = {}) => ({
  status: statut, model: MODELE, usage,
  output: [
    ...Array.from({ length: reflexions }, () => ({ type: 'reasoning', summary: [] })),
    { type: 'function_call', name: 'sortie_structuree', call_id, arguments: arguments_ }
  ]
});
const enveloppeTexte = (texte, extra = {}) => ({
  status: 'completed', model: MODELE, usage: { input_tokens: 9, output_tokens: 2 },
  output: [{ type: 'message', content: [{ type: 'output_text', text: texte }] }], ...extra
});

function chargerPage({ repondre } = {}) {
  const elements = new Map();
  const journal = { reseau: [], console: [], domReady: [], crees: [] };
  function makeElement(id, tag = 'div') {
    const classes = new Set(); const listeners = new Map();
    const el = {
      id, tagName: tag.toUpperCase(), value: '', textContent: '', innerHTML: '', className: '', type: '', checked: false,
      hidden: hiddenInMarkup.has(id), disabled: false, dataset: {}, style: {}, children: [], options: [], files: [], selectedIndex: 0, attrs: {}, placeholder: '', readOnly: false, href: '',
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
    if (!repondre) throw new TypeError('PROVIDER-OPENAI-01 : réseau non attendu.');
    return repondre(entree, journal.reseau.length);
  };
  const trace = (niveau) => (...a) => journal.console.push(niveau + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  const context = {
    document, localStorage: storage('local'), sessionStorage: storage('session'),
    console: { log: trace('log'), warn: trace('warn'), error: trace('error'), info: trace('info'), debug: trace('debug') },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'provider-openai-01', language: 'fr-FR', onLine: true },
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
  for (const b of blocs) { const src = lignes.slice(b.from, b.to).join('\n'); if (src.trim()) vm.runInContext(src, context, { filename: 'atelier' }); }
  document.readyState = 'interactive';
  const erreurs = [];
  for (const fn of journal.domReady) { try { fn(); } catch (e) { erreurs.push(e.message); } }
  document.readyState = 'complete';
  assert.deepEqual(erreurs, [], 'initialisation de la page sans erreur');
  return { el: byId, elements, journal, zones, ctx: context, w: context };
}

/** La page, avec OpenAI retenu comme fournisseur actif et son modèle sélectionné. */
function pageAvecOpenAI(options) {
  const h = chargerPage(options);
  h.el('fournisseur-actif').value = 'openai';
  /* Changer de fournisseur échange le contenu du champ de clé — voulu : jamais la clé de l'un chez
     l'autre. La clé se saisit donc APRÈS, comme le ferait la personne. */
  h.w.surChangementFournisseurActif();
  h.el('api-modele').value = MODELE;
  h.el('api-cle').value = CLE;
  return h;
}
/* Le produit déclare l'essentiel en `const` : invisible depuis l'objet global du bac à sable,
   mais lisible en évaluant une expression DANS le contexte. Et toute valeur fabriquée dans la VM
   doit repasser par JSON avant une comparaison stricte, dont les prototypes diffèrent d'un realm
   à l'autre — `brut` ne sert qu'à ça, jamais à masquer une différence de contenu. */
const dans = (h, expr) => vm.runInContext(expr, h.ctx);
const brut = (v) => JSON.parse(JSON.stringify(v));
/* LE SCHÉMA CANONIQUE, TEL QUE L'ARTEFACT LE CONSTRUIT — PAS TEL QUE SON LITTÉRAL S'ÉCRIT.
   Deux raisons de le lire ainsi. D'abord il est déclaré en `const` DANS l'IIFE du moteur
   Architecte : ni l'objet global du bac à sable ni une expression évaluée dans le contexte ne
   l'atteignent. Ensuite, et c'est le point qui compte, le littéral n'est PAS le schéma : les
   lignes « V11.1 DECISION-FIRST » qui le suivent immédiatement ajoutent
   strategie.pilotage_incertitude et retirent deux règles de evaluation.allOf. Prendre le seul
   littéral donnerait un schéma que le produit n'envoie jamais — et c'est exactement ce qu'une
   première version de ce test a fait, jusqu'à ce que la réponse RÉELLE du fournisseur la
   contredise en portant un champ que ce faux canonique refusait.
   La tranche lue ici est donc celle que tools/frozen-guard.mjs gèle sous le nom ARCH_SCHEMA, et
   elle est ÉVALUÉE, mutations comprises. */
const ARCH_SCHEMA = (() => {
  const a = html.indexOf('const ARCH_SCHEMA=');
  const b = html.indexOf('let ARCH_SYSTEM=', a);
  assert.ok(a > 0 && b > a, 'la tranche gelée du schéma canonique est lisible dans l’artefact');
  const tranche = html.slice(a, b);
  assert.match(tranche, /V11\.1 DECISION-FIRST/, 'et elle contient bien l’extension, pas seulement le littéral');
  return JSON.parse(JSON.stringify(vm.runInNewContext(tranche + '\nARCH_SCHEMA;')));
})();

/** Un appel passé par la FAÇADE, jamais par le transport en direct. */
const appeler = (h, params) => h.w.appelFournisseur({ fournisseur: 'openai', cle: CLE, modele: MODELE, maxTokens: 8000, contenuUtilisateur: 'Demande.', ...params });
const attraper = async (p) => { try { return { valeur: await p }; } catch (err) { return { err }; } };

// =================================================================================================
// LE REGISTRE
// =================================================================================================

test('T-PROVOPENAI01-01 · REGISTRE : OpenAI remplit le contrat minimal, et Anthropic reste le fournisseur par défaut', () => {
  const h = chargerPage();
  const reg = h.w.FOURNISSEURS_API;
  assert.deepEqual(Object.keys(reg), ['anthropic', 'openai'], 'l’ordre des clés décide du défaut : Anthropic d’abord');
  assert.deepEqual(brut(h.w.validerConfigurationFournisseur(reg.openai)), { valide: true, manquants: [] });
  assert.equal(h.w.obtenirFournisseurActif(), 'anthropic', 'sans sélection explicite, rien ne change pour qui utilisait le produit avant ce lot');
  assert.equal(reg.openai.nom, 'OpenAI');
  assert.deepEqual(brut(reg.openai.capacites), { sortie_structuree: true, effort_raisonnement: true, annulation: true, prefill_assistant: false, limites: {} });
  /* Les deux capacités qu'OpenAI n'offre pas sont ABSENTES, pas stubées : l'interface teste leur
     présence et le dit à la personne au lieu de deviner. */
  assert.equal('listerModeles' in reg.openai, false, 'GET /v1/models mêle chez OpenAI des modèles hors dialogue : aucun filtre n’est fondé');
  assert.equal('compterTokens' in reg.openai, false, 'aucun équivalent de /v1/messages/count_tokens chez ce fournisseur');
  assert.equal(typeof reg.openai.testerConnexion, 'function');
});

test('T-PROVOPENAI01-02 · CATALOGUE : les valeurs du modèle sont celles de la fiche officielle, et rien n’est inventé', () => {
  const h = chargerPage();
  const m = h.w.FOURNISSEURS_API.openai.modeles[MODELE];
  assert.ok(m, 'le seul modèle du catalogue est celui que le dépôt a sourcé et éprouvé en réel');
  assert.deepEqual({ contexte: m.contexte, sortieMax: m.sortieMax, entree: m.entree, sortie: m.sortie },
    { contexte: 1050000, sortieMax: 128000, entree: 4, sortie: 20 });
  assert.deepEqual(brut(h.w.FOURNISSEURS_API.openai.tarifDuJour(MODELE)), { entree: 4, sortie: 20, connu: true });
  /* Un tarif inconnu rend null et connu:false — jamais zéro, qui laisserait croire à la gratuité. */
  assert.deepEqual(brut(h.w.FOURNISSEURS_API.openai.tarifDuJour('modele-absent')), { entree: null, sortie: null, connu: false });
  /* Aucun champ du contrat Anthropic n'est transposé : ni zdr, ni retention. L'encart « Covered
     Models » ne doit pas pouvoir s'afficher pour un modèle OpenAI. */
  assert.equal('zdr' in m, false); assert.equal('retention' in m, false);
  assert.equal(m.prefill, false); assert.equal(m.schema, true);
  /* Et la table reste datée et sourcée dans le fichier lui-même. */
  assert.match(html, /Modèles OpenAI — relevés sur la fiche officielle du modèle/);
});

// =================================================================================================
// LA REQUÊTE
// =================================================================================================

test('T-PROVOPENAI01-03 · REQUETE : /v1/responses, deux en-têtes et pas trois, corps exact', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeTexte('OK')) });
  await appeler(h, { systeme: 'Instruction système.', maxTokens: 4096 });
  assert.equal(h.journal.reseau.length, 1);
  const r = h.journal.reseau[0];
  assert.equal(r.url, ENDPOINT, 'le point de terminaison est celui qui accepte outil ET raisonnement');
  assert.equal(r.method, 'POST');
  /* Le préflight CORS réel d'api.openai.com n'autorise QUE ces deux en-têtes : un troisième —
     l'équivalent du anthropic-dangerous-direct-browser-access — ferait échouer la requête. */
  assert.deepEqual(Object.keys(r.headers).sort(), ['Authorization', 'Content-Type']);
  assert.equal(r.headers.Authorization, 'Bearer ' + CLE, 'la clé part au fournisseur, et nulle part ailleurs');
  assert.deepEqual(RELEVE.cors.openai.allow_headers.split(','), ['authorization', 'content-type'],
    'et c’est une mesure réelle, pas une hypothèse');
  assert.deepEqual(r.body, { model: MODELE, input: [{ role: 'user', content: 'Demande.' }], max_output_tokens: 4096, instructions: 'Instruction système.' });
  assert.equal('messages' in r.body, false, 'ce n’est pas le dialecte Chat Completions');
  assert.equal('max_tokens' in r.body, false);
  assert.equal('temperature' in r.body, false);
  assert.ok(r.signal instanceof AbortSignal, 'l’appel est abandonnable');
});

test('T-PROVOPENAI01-04 · SYSTEME_VIDE : une instruction vide n’est pas transmise du tout', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeTexte('OK')) });
  await appeler(h, { systeme: '' });
  assert.equal('instructions' in h.journal.reseau[0].body, false);
});

test('T-PROVOPENAI01-05 · OUTIL_FORCE : le schéma part en paramètres d’un outil NON strict, appel forcé', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeOutil('{"a":1}')) });
  await appeler(h, { schema: { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'integer' } } }, effort: 'high' });
  const b = h.journal.reseau[0].body;
  assert.equal(b.tools.length, 1);
  assert.equal(b.tools[0].type, 'function');
  assert.equal(b.tools[0].strict, false, 'strict:true refuse le schéma canonique — mesuré 400 « allOf is not permitted »');
  assert.deepEqual(b.tool_choice, { type: 'function', name: b.tools[0].name });
  assert.match(b.tools[0].description, /N’enveloppez jamais l’objet sous une clé englobante/);
  assert.deepEqual(b.reasoning, { effort: 'high' }, 'l’effort demandé par le pipeline automatique est transmis tel quel');
  assert.equal('response_format' in b, false, 'le mode strict n’est pas une solution de repli : il n’est jamais tenté');
});

test('T-PROVOPENAI01-06 · PROJECTION : la racine est nettoyée de ce qu’OpenAI refuse, et de rien d’autre', () => {
  const h = chargerPage();
  const canonique = {
    $schema: 'http://json-schema.org/draft-07/schema#', $id: 'x', type: 'object', additionalProperties: false,
    required: ['a'], definitions: { d: { type: 'string', minLength: 3 } },
    properties: { a: { $ref: '#/definitions/d' }, b: { type: ['string', 'null'], enum: ['x', null] } },
    allOf: [{ description: 'Règle métier conditionnelle.', if: { properties: { a: { const: 'x' } } }, then: { required: ['b'] } }]
  };
  const avant = JSON.parse(JSON.stringify(canonique));
  const projete = brut(h.w.schemaPourOpenAI(canonique));
  assert.deepEqual(canonique, avant, 'la projection ne mute JAMAIS le canonique');
  for (const k of ['$schema', '$id', 'allOf']) assert.equal(k in projete, false, k + ' retiré de la racine');
  assert.match(projete.description, /Règle métier conditionnelle\./, 'la description métier du combinateur remonte à la racine, le modèle la lit encore');
  /* TOUT LE RESTE PART TEL QUEL : les definitions, les $ref, les enum à type union, les règles
     profondes. Aucune réécriture BETA-04 ici — aucune grammaire n’est compilée qui l’exigerait. */
  assert.deepEqual(projete.definitions, canonique.definitions);
  assert.deepEqual(projete.properties, canonique.properties);
  assert.deepEqual(projete.required, ['a']);
  assert.equal(projete.additionalProperties, false);
  /* Les mots-clés refusés à la racine sont exactement ceux que l'API énonce en refusant. */
  assert.match(html, /'oneOf'\/'anyOf'\/'allOf'\/'enum'\/'const'\/'not' at the top level/);
  for (const mot of ['oneOf', 'anyOf', 'allOf', 'enum', 'const', 'not']) {
    assert.equal(mot in brut(h.w.schemaPourOpenAI({ type: 'object', [mot]: mot === 'not' ? { type: 'null' } : ['x'] })), false, mot + ' refusé à la racine');
  }
});

// =================================================================================================
// LA SORTIE STRUCTURÉE — RÉPONSE RÉELLE REJOUÉE
// =================================================================================================

test('T-PROVOPENAI01-07 · SORTIE_REELLE : l’appel d’outil réellement rendu par OpenAI sur le schéma canonique traverse le transport', async () => {
  assert.equal(REEL.status_http, 200, 'la mesure dont ce test part est un succès réel');
  assert.equal(REEL.violations_canoniques, 0, 'et il ne violait pas le canonique');
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeOutil(REEL.arguments, { reflexions: 2, usage: REEL.usage ? { input_tokens: REEL.usage.entree, output_tokens: REEL.usage.sortie } : undefined })) });
  const res = await appeler(h, { schema: ARCH_SCHEMA, effort: 'high' });
  assert.equal(res.fournisseur, 'openai');
  assert.equal(res.modele, MODELE);
  assert.equal(res.structure_validee, true);
  assert.equal(res.raison_arret, 'completed');
  assert.equal(res.detail.corrections, 0, 'aucune correction n’a été nécessaire — c’est ce que la mesure réelle a donné');
  assert.equal(res.detail.blocs_reflexion, 2);
  assert.deepEqual(brut(res.tokens), { entree: REEL.usage.entree, sortie: REEL.usage.sortie });
  /* Le texte rendu est exactement l'objet validé, re-sérialisé — comme le chemin Anthropic. */
  assert.deepEqual(JSON.parse(res.texte), JSON.parse(REEL.arguments));
  assert.deepEqual(Object.keys(JSON.parse(res.texte)), REEL.cles_premier_niveau);
  /* Et il est réellement exploitable par le produit : l'importateur de l'Architecte l'accepte. */
  assert.equal(JSON.parse(res.texte).version, '3.4');
  /* La porte que le produit applique réellement : la validation contre le CANONIQUE complet, par
     la fonction même qui garde le chemin Anthropic. Zéro violation sur une réponse OpenAI réelle. */
  assert.deepEqual(brut(h.w.violationsContreSchema(ARCH_SCHEMA, JSON.parse(res.texte))), []);
  for (const bloc of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation', 'verification', 'apprentissage']) {
    assert.ok(JSON.parse(res.texte)[bloc], 'bloc obligatoire ' + bloc + ' présent');
  }
});

test('T-PROVOPENAI01-08 · LECTURE_PAR_TYPE : l’appel d’outil est reconnu par son type et son nom, jamais par sa position', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, {
    status: 'completed', usage: { input_tokens: 5, output_tokens: 3 },
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'function_call', name: 'un_autre_outil', call_id: 'c0', arguments: '{"piege":true}' },
      { type: 'message', content: [{ type: 'output_text', text: 'du texte à ignorer' }] },
      { type: 'function_call', name: 'sortie_structuree', call_id: 'c1', arguments: '{"a":7}' }
    ] }) });
  const res = await appeler(h, { schema: { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'integer' } } } });
  assert.deepEqual(JSON.parse(res.texte), { a: 7 }, 'ni le premier élément, ni le texte, ni l’outil homonyme');
});

test('T-PROVOPENAI01-09 · TEXTE_LIBRE : sans schéma, la réponse est la concaténation des blocs de texte', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, {
    status: 'completed', usage: { input_tokens: 4, output_tokens: 6 },
    output: [{ type: 'reasoning', summary: [] },
             { type: 'message', content: [{ type: 'output_text', text: 'Première partie. ' }, { type: 'output_text', text: 'Seconde partie.' }] }] }) });
  const res = await appeler(h, {});
  assert.equal(res.texte, 'Première partie. Seconde partie.');
  assert.equal(res.structure_validee, null, 'aucun schéma demandé : rien n’est déclaré validé');
  assert.equal(res.detail.blocs_reflexion, 1);
});

// =================================================================================================
// LA CORRECTION — DEUX TOURS RÉELS REJOUÉS
// =================================================================================================

test('T-PROVOPENAI01-10 · CORRECTION : une non-conformité donne UNE requête de correction, par le canal de résultat d’outil', async () => {
  assert.equal(CORR.appel_de_correction.status_http, 200, 'le mécanisme rejoué ici a été mesuré en réel');
  const schema = CORR.schema_court;
  const h = pageAvecOpenAI({ repondre: (e, n) => reponse(200, enveloppeOutil(
    n === 1 ? '{"titre":"Note","quantites":{"min":null,"max":null}}' : CORR.appel_de_correction.arguments,
    { call_id: 'call_mesure' })) });
  const res = await appeler(h, { schema, effort: 'low' });
  assert.equal(h.journal.reseau.length, 2, 'exactement un tour de correction, jamais deux');
  const deuxieme = h.journal.reseau[1].body.input;
  assert.equal(deuxieme.length, 3, 'la demande d’origine, l’appel d’outil du modèle, puis le résultat en erreur');
  assert.deepEqual(deuxieme[0], { role: 'user', content: 'Demande.' });
  assert.equal(deuxieme[1].type, 'function_call');
  assert.equal(deuxieme[2].type, 'function_call_output');
  assert.equal(deuxieme[2].call_id, 'call_mesure', 'le résultat est rattaché à l’appel qu’il corrige');
  /* Ce qui est renvoyé au modèle : des CHEMINS et des ATTENTES de schéma, jamais une valeur reçue. */
  assert.match(deuxieme[2].output, /Violations \(chemin : attente du schéma\)/);
  assert.match(deuxieme[2].output, /minLength 12/);
  assert.match(deuxieme[2].output, /l’objet COMPLET corrigé/);
  assert.equal(deuxieme[2].output.includes('Note'), false, 'la valeur fautive n’est pas rejouée au modèle');
  assert.equal(res.structure_validee, true);
  assert.equal(res.detail.corrections, 1);
  assert.deepEqual(Object.keys(JSON.parse(res.texte)).sort(), CORR.appel_de_correction.objet_complet_rendu);
  assert.deepEqual(brut(h.w.violationsContreSchema(schema, JSON.parse(res.texte))), []);
  /* Les jetons des deux tours sont cumulés : le coût réel est dit, pas celui du dernier appel. */
  assert.deepEqual(brut(res.tokens), { entree: 22, sortie: 14 });
});

test('T-PROVOPENAI01-11 · CORRECTION_BORNEE : une seconde non-conformité est refusée, jamais rattrapée', async () => {
  const schema = CORR.schema_court;
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeOutil('{"titre":"Trop court","quantites":{"min":null,"max":null}}')) });
  const { err, valeur } = await attraper(appeler(h, { schema }));
  assert.equal(valeur, undefined, 'rien n’est rendu');
  assert.equal(h.journal.reseau.length, 2, 'deux appels au total, jamais trois');
  assert.equal(err.categorie, 'sortie_invalide');
  assert.equal(err.fournisseur, 'openai');
  assert.equal(err.recuperable, false);
  assert.match(err.message, /non conforme au schéma canonique/);
  assert.ok(Array.isArray(err.detail.violations) && err.detail.violations.length >= 1);
});

test('T-PROVOPENAI01-12 · JSON_ILLISIBLE : des arguments non analysables sont une sortie invalide, pas un plantage', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeOutil('{"a":')) });
  const { err } = await attraper(appeler(h, { schema: { type: 'object', properties: { a: { type: 'integer' } } } }));
  assert.equal(err.categorie, 'sortie_invalide');
  assert.match(err.message, /n’a pas renvoyé un JSON analysable/);
  assert.equal(h.journal.reseau.length, 1, 'une sortie illisible n’est pas une non-conformité : aucune correction n’est tentée');
});

test('T-PROVOPENAI01-13 · AUCUNE_SORTIE_STRUCTUREE : l’absence d’appel d’outil est dite, jamais comblée', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeTexte('Je préfère répondre en texte.')) });
  const { err } = await attraper(appeler(h, { schema: { type: 'object', properties: {} } }));
  assert.equal(err.categorie, 'sortie_invalide');
  assert.match(err.message, /aucune sortie structurée/);
});

// =================================================================================================
// CE QUE LE FOURNISSEUR DIT DE LUI-MÊME
// =================================================================================================

test('T-PROVOPENAI01-14 · TRONCATURE : status « incomplete » + motif de plafond, annoncé par l’API et non deviné', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, {
    status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    usage: { input_tokens: 10, output_tokens: 16 },
    output: [{ type: 'reasoning', summary: [] }, { type: 'function_call', name: 'sortie_structuree', call_id: 'c', arguments: '{"a":' }] }) });
  const { err } = await attraper(appeler(h, { schema: { type: 'object', properties: { a: { type: 'integer' } } } }));
  assert.equal(err.categorie, 'troncature');
  assert.match(err.message, /augmentez la longueur maximale/i);
  assert.equal(err.texte_partiel, '{"a":', 'ce qui a été produit est conservé');
  assert.deepEqual(brut(err.tokens), { entree: 10, sortie: 16 });
  assert.equal(RELEVE.succes_mesures[0].incomplete_details, null, 'et le chemin nominal mesuré, lui, n’était pas tronqué');
});

test('T-PROVOPENAI01-15 · REFUS : le canal de refus dédié est lu, et ne se confond pas avec une sortie vide', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, {
    status: 'completed', usage: { input_tokens: 8, output_tokens: 4 },
    output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Je ne peux pas répondre à cette demande.' }] }] }) });
  const { err } = await attraper(appeler(h, {}));
  assert.equal(err.categorie, 'refus');
  assert.equal(err.detail.refus_categorie, 'refusal');
  assert.match(err.message, /a refusé cette demande/);
  /* Et un filtre de contenu qui interrompt la réponse est aussi un refus, pas une troncature. */
  const h2 = pageAvecOpenAI({ repondre: () => reponse(200, { status: 'incomplete', incomplete_details: { reason: 'content_filter' }, usage: {}, output: [] }) });
  const r2 = await attraper(appeler(h2, {}));
  assert.equal(r2.err.categorie, 'refus');
  assert.equal(r2.err.detail.refus_categorie, 'content_filter');
});

test('T-PROVOPENAI01-16 · INTERRUPTION_AUTRE : un arrêt inachevé pour un motif inconnu n’est pas présenté comme un succès', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, { status: 'incomplete', incomplete_details: { reason: 'motif_futur' }, usage: {}, output: [{ type: 'message', content: [{ type: 'output_text', text: 'début' }] }] }) });
  const { err } = await attraper(appeler(h, {}));
  assert.equal(err.categorie, 'sortie_invalide');
  assert.match(err.message, /interrompue avant son terme \(motif_futur\)/);
});

// =================================================================================================
// LES ERREURS HTTP, ET LE VERDICT DE CLÉ QUI EN DÉPEND
// =================================================================================================

test('T-PROVOPENAI01-17 · CLASSIFICATION : chaque code porte sa catégorie et son statut, jamais la prose du fournisseur', async () => {
  const cas = [[401, 'authentification'], [403, 'acces_refuse'], [404, 'inconnue'],
               [429, 'limitation'], [503, 'indisponibilite'], [400, 'requete_invalide']];
  for (const [code, categorie] of cas) {
    const h = pageAvecOpenAI({ repondre: () => reponse(code, { error: { message: 'prose du fournisseur', type: 'x' } }) });
    const { err } = await attraper(appeler(h, { essaisMax: 1 }));
    assert.equal(err.categorie, categorie, 'code ' + code);
    assert.equal(err.statut_http, code, 'le statut voyage : c’est lui que lit le classificateur du test de clé');
    assert.equal(err.fournisseur, 'openai');
    assert.equal(h.journal.reseau.length, 1, 'essaisMax:1 — un test de clé reste un seul appel, même sur 429');
  }
});

test('T-PROVOPENAI01-17b · TEST_DE_CLE_BOUT_EN_BOUT : le bouton « Tester » du panneau Connexion IA rend son verdict sur OpenAI', async () => {
  const flush = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };
  const verdicts = [[200, 'ok', '✓ Clé valide'], [401, 'ko', '✕ Clé invalide'], [403, 'ko', '✕ Accès refusé'],
                    [404, 'avis', 'Modèle indisponible'], [429, 'avis', 'Limite atteinte'], [503, 'avis', 'Service indisponible']];
  for (const [code, etat, libelle] of verdicts) {
    const h = chargerPage({ repondre: () => (code === 200 ? reponse(200, enveloppeTexte('OK')) : reponse(code, { error: { message: 'prose' } })) });
    const k = h.el('v11-api-key'); k.value = CLE; k.dispatchEvent({ type: 'input' });
    const p = h.el('v11-api-provider'); p.value = 'openai'; p.dispatchEvent({ type: 'change' });
    await flush(2);
    h.el('api-modele').value = MODELE;
    const b = h.el('v11-api-test');
    b.click();
    for (let i = 0; i < 50 && b.dataset.etat === 'en-cours'; i += 1) await flush(2);
    assert.equal(h.journal.reseau.length, 1, 'une seule requête, code ' + code);
    assert.equal(h.journal.reseau[0].url, ENDPOINT, 'et elle part bien chez OpenAI');
    assert.equal(b.dataset.etat, etat, 'état visuel pour ' + code);
    assert.equal(b.textContent, libelle, 'libellé pour ' + code);
    assert.equal(h.el('v11-api-test-note').textContent.includes('prose'), false, 'la prose du fournisseur n’est jamais affichée');
  }
});

test('T-PROVOPENAI01-18 · REPRISES : un 500 passager est rejoué, un échec persistant est rendu', async () => {
  const h = pageAvecOpenAI({ repondre: (e, n) => (n === 1 ? reponse(500, { error: { message: 'oups' } }) : reponse(200, enveloppeTexte('OK'))) });
  const res = await appeler(h, { essaisMax: 2 });
  assert.equal(h.journal.reseau.length, 2);
  assert.equal(res.texte, 'OK');
  const h2 = pageAvecOpenAI({ repondre: () => reponse(503, { error: { message: 'surchargé' } }) });
  const { err } = await attraper(appeler(h2, { essaisMax: 2 }));
  assert.equal(h2.journal.reseau.length, 2, 'le budget de reprises est respecté, jamais dépassé');
  assert.equal(err.categorie, 'indisponibilite');
  assert.equal(err.recuperable, true);
});

test('T-PROVOPENAI01-19 · ANNULATION ET DELAI : le signal de l’appelant est relayé, le délai est borné', async () => {
  const h = pageAvecOpenAI({ repondre: (e) => new Promise((_, rej) => {
    e.signal.addEventListener('abort', () => { const x = new Error('aborted'); x.name = 'AbortError'; rej(x); });
  }) });
  const ctrl = new h.w.AbortController();
  const p = attraper(appeler(h, { signal: ctrl.signal }));
  await new Promise((r) => setImmediate(r));
  ctrl.abort();
  const { err } = await p;
  assert.equal(err.categorie, 'annulation');
  assert.equal(err.name, 'AbortError');
  /* Un appel déjà abandonné ne part pas du tout. */
  const h2 = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeTexte('OK')) });
  const dejaAbandonne = new h2.w.AbortController(); dejaAbandonne.abort();
  const r2 = await attraper(appeler(h2, { signal: dejaAbandonne.signal }));
  assert.equal(r2.err.categorie, 'annulation');
  assert.equal(h2.journal.reseau.length, 0);
  /* Et le délai propre au transport rend delai_depasse, pas une erreur inconnue. */
  const h3 = pageAvecOpenAI({ repondre: (e) => new Promise((_, rej) => {
    e.signal.addEventListener('abort', () => { const x = new Error('aborted'); x.name = 'AbortError'; rej(x); });
  }) });
  const r3 = await attraper(appeler(h3, { delaiMs: 5, essaisMax: 1 }));
  assert.equal(r3.err.categorie, 'delai_depasse');
  assert.equal(r3.err.recuperable, true);
});

// =================================================================================================
// LA FAÇADE, ET CE QU'ELLE RETIRE
// =================================================================================================

test('T-PROVOPENAI01-20 · CAPACITES : le préremplissage est retiré par la façade, l’effort et le schéma passent', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeOutil('{"a":1}')) });
  await appeler(h, { prefill: 'Voici :', effort: 'high', schema: { type: 'object', properties: { a: { type: 'integer' } } } });
  const b = h.journal.reseau[0].body;
  assert.equal(JSON.stringify(b).includes('Voici'), false, 'le préremplissage ne part pas : OpenAI ne le prend pas en charge, la façade le retire');
  assert.deepEqual(b.input, [{ role: 'user', content: 'Demande.' }], 'et aucun tour assistant n’est fabriqué à la place');
  assert.ok(b.reasoning && b.tools);
});

test('T-PROVOPENAI01-21 · TEST_DE_CONNEXION : un appel minimal, sans système, sans schéma, sans effort', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeTexte('OK')) });
  await h.w.FOURNISSEURS_API.openai.testerConnexion({ cle: CLE, modele: MODELE });
  assert.deepEqual(h.journal.reseau[0].body, { model: MODELE, input: [{ role: 'user', content: 'Répondez uniquement : OK' }], max_output_tokens: 16 });
  for (const champ of ['instructions', 'tools', 'tool_choice', 'reasoning']) assert.equal(champ in h.journal.reseau[0].body, false, champ + ' absent');
});

test('T-PROVOPENAI01-22 · CAPACITES_ABSENTES : l’interface le dit explicitement au lieu de deviner', async () => {
  const h = pageAvecOpenAI();
  dans(h, 'etat').prompt = 'un prompt assemblé';
  await dans(h, 'compterTokensExact')();
  await dans(h, 'apiRafraichirModeles')();
  assert.match(h.el('api-etat').textContent, /OpenAI ne permet pas d’actualiser sa liste de modèles/);
  assert.match(html, /ne permet pas un comptage exact depuis cette interface/,
    'le comptage exact a sa propre phrase, qui nomme le fournisseur plutôt que d’estimer en silence');
  assert.equal(h.journal.reseau.length, 0, 'aucune requête inventée vers un point de terminaison non vérifié');
});

// =================================================================================================
// L'INTERFACE SUIT LE FOURNISSEUR
// =================================================================================================

test('T-PROVOPENAI01-23 · TEXTES : gabarit de clé et lien de console suivent la sélection, dans les deux surfaces', () => {
  const h = chargerPage();
  /* Anthropic actif : le balisage d'origine, inchangé. */
  assert.equal(h.el('api-cle').placeholder, 'sk-ant-…');
  assert.equal(h.el('lien-console-outils').textContent, 'console.anthropic.com');
  assert.equal(h.el('lien-console-outils').href, 'https://console.anthropic.com/');
  h.el('fournisseur-actif').value = 'openai';
  h.w.surChangementFournisseurActif();
  for (const champ of ['api-cle', 'accueil-cle']) assert.equal(h.el(champ).placeholder, 'sk-…', champ);
  for (const lien of ['lien-console-outils', 'lien-console-accueil']) {
    assert.equal(h.el(lien).href, 'https://platform.openai.com/api-keys', lien);
    assert.equal(h.el(lien).textContent, 'platform.openai.com/api-keys', lien);
  }
  assert.match(h.el('note-fournisseur-actif').textContent, /actuellement OpenAI\./);
  assert.match(h.el('chapo-envoi-direct').textContent, /via OpenAI/);
  /* Et le retour en arrière est complet : rien ne reste d'OpenAI. */
  h.el('fournisseur-actif').value = 'anthropic';
  h.w.surChangementFournisseurActif();
  assert.equal(h.el('api-cle').placeholder, 'sk-ant-…');
  assert.equal(h.el('lien-console-outils').textContent, 'console.anthropic.com');
});

test('T-PROVOPENAI01-24 · MODELES : le sélecteur bascule sur le catalogue du fournisseur, et le dit', () => {
  const h = chargerPage();
  h.el('fournisseur-actif').value = 'openai';
  const r = h.w.repeuplerTousLesSelectsModeles();
  assert.deepEqual(Object.keys(h.w.obtenirModelesFournisseur()), [MODELE]);
  assert.equal(r.retenu, MODELE);
  assert.equal(r.degrade, true, 'MODELE_PAR_DEFAUT est un identifiant Anthropic : le repli est signalé, pas silencieux');
  assert.match(h.el('api-modele').innerHTML, /GPT-5\.6 Sol — 4 \/ 20 \$ par MTok/, 'le tarif sourcé est affiché');
  assert.equal(/lancement/.test(h.el('api-modele').innerHTML), false, 'aucun tarif « de lancement » n’est annoncé : OpenAI ne publie pas celui d’après');
});

// =================================================================================================
// CE QUI NE SORT JAMAIS, ET CE QUI N'A PAS BOUGÉ
// =================================================================================================

test('T-PROVOPENAI01-25 · AUCUNE_FUITE : la clé n’apparaît ni dans la console, ni dans le stockage, ni dans le DOM', async () => {
  const h = pageAvecOpenAI({ repondre: () => reponse(401, { error: { message: 'invalid api key' } }) });
  await attraper(appeler(h, { essaisMax: 1 }));
  const h2 = pageAvecOpenAI({ repondre: () => reponse(200, enveloppeOutil(REEL.arguments)) });
  await appeler(h2, { schema: ARCH_SCHEMA });
  for (const x of [h, h2]) {
    assert.equal(x.journal.console.some((l) => l.includes(CLE)), false, 'console');
    assert.equal([...x.zones.session.values(), ...x.zones.local.values()].some((v) => v.includes(CLE)), false, 'stockage');
    for (const el of x.elements.values()) {
      if (['v11-api-key', 'api-cle', 'accueil-cle'].includes(el.id)) continue;
      const surface = [el.textContent, el.innerHTML, el.value, JSON.stringify(el.dataset), JSON.stringify(el.attrs)].join('\n');
      assert.equal(surface.includes(CLE), false, 'élément #' + el.id);
    }
  }
  /* Et la zone de transport ne journalise rien du tout. */
  const zone = html.slice(html.indexOf('/* GARDE-ADAPTATEUR-OPENAI:DEBUT'), html.indexOf('/* GARDE-ADAPTATEUR-OPENAI:FIN'));
  assert.equal(/console\.|localStorage|sessionStorage|coffre\./.test(zone), false, 'le transport OpenAI ne journalise, ne stocke rien');
  assert.equal(/sk-[A-Za-z0-9]{12,}/.test(html), false, 'aucune clé dans l’artefact');
});

test('T-PROVOPENAI01-26 · CONFINEMENT : chaque fournisseur reste dans sa zone de garde', () => {
  const zoneA = html.slice(html.indexOf('/* GARDE-ADAPTATEUR-ANTHROPIC:DEBUT'), html.indexOf('/* GARDE-ADAPTATEUR-ANTHROPIC:FIN'));
  const zoneO = html.slice(html.indexOf('/* GARDE-ADAPTATEUR-OPENAI:DEBUT'), html.indexOf('/* GARDE-ADAPTATEUR-OPENAI:FIN'));
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const horsZones = code(html.replace(zoneA, '').replace(zoneO, ''));
  assert.equal(horsZones.includes('api.anthropic.com'), false, 'aucun appel Anthropic hors de sa zone');
  assert.equal(horsZones.includes('api.openai.com'), false, 'aucun appel OpenAI hors de sa zone');
  assert.equal(code(zoneA).includes('api.openai.com'), false, 'et les deux zones ne se mélangent pas');
  assert.equal(code(zoneO).includes('api.anthropic.com'), false);
  /* Le registre, lui, est désormais hors des deux : il n'appartient à aucun fournisseur. */
  const registre = html.slice(html.indexOf('const FOURNISSEURS_API = {'), html.indexOf('window.FOURNISSEURS_API = FOURNISSEURS_API;'));
  assert.equal(registre.includes('api.anthropic.com') || registre.includes('api.openai.com'), false);
  assert.ok(html.indexOf('/* GARDE-ADAPTATEUR-OPENAI:FIN */') < html.indexOf('const FOURNISSEURS_API = {'));
});

test('T-PROVOPENAI01-27 · ANTHROPIC_INCHANGE : le premier fournisseur part exactement comme avant ce lot', async () => {
  const h = chargerPage({ repondre: () => reponse(200, { content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 9, output_tokens: 1 }, stop_reason: 'end_turn' }) });
  const res = await h.w.appelFournisseur({ fournisseur: 'anthropic', cle: 'sk-ant-x', modele: 'claude-sonnet-5', maxTokens: 16, systeme: '', contenuUtilisateur: 'Répondez uniquement : OK' });
  const r = h.journal.reseau[0];
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.deepEqual(r.body, { model: 'claude-sonnet-5', max_tokens: 16, system: '', messages: [{ role: 'user', content: 'Répondez uniquement : OK' }] });
  assert.equal(res.fournisseur, 'anthropic');
  assert.equal(res.texte, 'OK');
  /* Et la façade reste par défaut sur Anthropic pour tout appelant qui ne nomme personne. */
  const h2 = chargerPage({ repondre: () => reponse(200, { content: [{ type: 'text', text: 'OK' }], usage: {}, stop_reason: 'end_turn' }) });
  await h2.w.appelApiAnthropic({ cle: 'sk-ant-x', modele: 'claude-sonnet-5', maxTokens: 16, contenuUtilisateur: 'x' });
  assert.equal(h2.journal.reseau[0].url, 'https://api.anthropic.com/v1/messages');
});

test('T-PROVOPENAI01-28 · PLAGES_GELEES : aucune des sept plages FROZEN n’a été touchée par ce lot', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(racine, 'anti-regression-baseline.json'), 'utf8'));
  assert.deepEqual(Object.keys(baseline.hashes).sort(),
    ['ARCH_SCHEMA', 'ARCH_SYSTEM', 'FORMATS', 'VERROUS', 'moteur Architecte', 'moteur Atelier', 'moteur Rapide'].sort());
  /* La preuve est produite par le garde lui-même, lancé par `npm run guard` dans la chaîne
     `npm run check` : ce test vérifie que la baseline n'a pas été réécrite pour le faire taire. */
  assert.equal(baseline.hashes.ARCH_SCHEMA, 'a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b');
  assert.equal(baseline.hashes['moteur Architecte'], '8668de58c928afaf010d37aa3b3f1c57a280f32e916cf483ad100c2784debc39');
  /* Et le pipeline automatique appelle toujours la façade, jamais un fournisseur nommé. */
  const appels = [...html.matchAll(/appelFournisseur\(\{fournisseur[,:]/g)];
  assert.ok(appels.length >= 5, 'les appels du pipeline passent par la façade avec le fournisseur actif');
});
