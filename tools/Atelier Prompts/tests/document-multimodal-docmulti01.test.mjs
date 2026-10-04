/* DOC-MULTI-01 — LECTURE DOCUMENTAIRE MULTIMODALE : UN FORMAT, TROIS CHEMINS
 * ============================================================================
 *
 * Un document joint peut être lu localement, par le fournisseur actif, ou par l'IA que la personne
 * utilise déjà — à la main. Ce sont trois TRANSPORTS, pas trois formats. Ce fichier éprouve ce qui
 * doit rester vrai de bout en bout : un seul schéma canonique, un seul validateur, une seule
 * provenance, et aucun appel que la personne n'a pas demandé.
 *
 * CE QUE LA MESURE A IMPOSÉ, ET QUI SE LIT DANS CES TESTS. Aucune règle simple ne distingue un
 * document « visuel » d'un document « textuel » : la charte graphique de référence porte 2 images
 * sur 7 pages — autant qu'un rapport purement textuel — parce que sa substance visuelle est
 * vectorielle. La classification ne rend donc QUE ce que les octets établissent, et sépare ce qui
 * est ÉTABLI (rien d'extractible, ou le fichier est une image) de ce qui est seulement OBSERVÉ (du
 * texte est sorti, et des visuels sont là aussi). Le second est proposé, jamais joué tout seul.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8 } from 'fflate';
import { html } from './perf04-frontend-harness.helper.mjs';
import * as lecture from '../core/documents/reading.js';
globalThis.DOMParser = DOMParser;

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLE_A = 'sk-ant-cle-de-la-personne';
const CLE_O = 'sk-proj-cle-de-la-personne';
const CHARTE = 'Charte_graphique_Institut_Relation_Couple_v6.pdf';

/* Une lecture canonique conforme, celle qu'un des trois chemins doit produire. */
const lectureValide = (nom = CHARTE, { method = 'external_llm_manual', provider = null } = {}) => ({
  document: { name: nom, mime_type: 'application/pdf', source: 'user_document' },
  reading: {
    method, provider,
    text: 'CHARTE GRAPHIQUE\nInstitut de la Relation et du Couple',
    structure: [{ level: 1, title: 'Charte graphique' }, { level: 2, title: 'Palette' }],
    visual_elements: [
      { kind: 'palette', description: 'Palette de sept aplats, chaque aplat portant son code écrit.', value: '#086582, #68A8B0' },
      { kind: 'layout', description: 'Bandeau horizontal bleu en haut de chaque page.', value: null }
    ],
    tables: [{ title: 'Usages couleur', rows: [['Couleur', 'Usage'], ['#086582', 'Titres']] }],
    uncertain_or_unreadable: ['Le pied de page de la page 4 est coupé.']
  }
});

// =================================================================================================
// LE FORMAT, LE PROMPT, LE VALIDATEUR — éprouvés sur le module, là où ils vivent
// =================================================================================================

test('DOCMULTI-01 · TXT_LOCAL : un texte simple se lit localement, et rien n’est proposé de plus', () => {
  const verdict = lecture.classifyReading({ name: 'notes.txt', type: 'text/plain', text: 'Une note de deux lignes.\nSuite.' });
  assert.equal(verdict.level, 'local_sufficient');
  assert.equal(verdict.certainty, 'established');
});

test('DOCMULTI-02 · DOCX_LOCAL : un DOCX textuel se lit localement — aucun appel n’est justifié', () => {
  const verdict = lecture.classifyReading({ name: 'synthese.docx', text: 'x'.repeat(14991), pages: null, images: null });
  assert.equal(verdict.level, 'local_sufficient', 'un format sans pages ni images détectées reste local');
});

test('DOCMULTI-03 · PDF_TEXTE_LOCAL : un PDF textuel sans image reste local', () => {
  /* Mesuré sur un vrai rapport : 11 pages, 20 832 caractères, 0 image. */
  const verdict = lecture.classifyReading({ name: 'rapport.pdf', type: 'application/pdf', text: 'x'.repeat(20832), pages: 11, images: 0 });
  assert.equal(verdict.level, 'local_sufficient');
  /* Et un PDF textuel PEU DENSE mais sans image reste local lui aussi : la densité ne décide pas.
     Mesuré : 11 pages, 7 312 caractères (665 par page), 0 image — purement textuel. */
  const peuDense = lecture.classifyReading({ name: 'cdc.pdf', type: 'application/pdf', text: 'x'.repeat(7312), pages: 11, images: 0 });
  assert.equal(peuDense.level, 'local_sufficient', 'un document peu dense n’est pas pour autant visuel');
});

test('DOCMULTI-04 · PDF_SCAN_REQUIS : rien d’extractible → lecture visuelle ÉTABLIE, pas supposée', () => {
  const vide = lecture.classifyReading({ name: 'scan.pdf', type: 'application/pdf', text: '', pages: 12 });
  assert.equal(vide.level, 'visual_required');
  assert.equal(vide.certainty, 'established');
  /* Presque rien compte comme rien : un en-tête et un numéro de page par feuille. */
  const presqueVide = lecture.classifyReading({ name: 'scan2.pdf', text: 'x'.repeat(100), pages: 10 });
  assert.equal(presqueVide.level, 'visual_required');
  /* Et un document que le lecteur a dû reconnaître par OCR EST un scan. */
  const ocr = lecture.classifyReading({ name: 'scan3.pdf', text: 'x'.repeat(5000), pages: 3, ocrPages: 3, images: 3 });
  assert.equal(ocr.level, 'visual_required');
  assert.match(ocr.reasons.join(' '), /OCR/);
});

test('DOCMULTI-05 · IMAGE_REQUISE : une image n’a pas de couche de texte — fait établi', () => {
  for (const nom of ['logo.png', 'capture.JPG', 'photo.webp']) {
    const v = lecture.classifyReading({ name: nom });
    assert.equal(v.level, 'visual_required', nom);
    assert.equal(v.certainty, 'established', nom);
  }
  assert.equal(lecture.classifyReading({ name: 'sans-extension', type: 'image/png' }).level, 'visual_required');
});

test('DOCMULTI-06 · CHARTE_GRAPHIQUE : du texte ET des visuels → PROPOSÉ, jamais décidé', () => {
  /* Les chiffres sont ceux de la charte réelle : 7 pages, 7 085 caractères, 2 images. */
  const v = lecture.classifyReading({ name: CHARTE, type: 'application/pdf', text: 'x'.repeat(7085), pages: 7, images: 2 });
  assert.equal(v.level, 'visual_possible');
  assert.equal(v.certainty, 'observed', 'le code ne peut pas ÉTABLIR qu’un document est visuel : il l’observe');
  assert.match(v.reasons.join(' '), /2 image\(s\) sur 7 page\(s\)/, 'et il le dit avec ses chiffres');
  assert.equal(v.facts.chars_per_page, 1012);
  /* Un format où la présence de visuels n’a pas pu être établie est dit tel quel, pas supposé nul. */
  const inconnu = lecture.classifyReading({ name: 'deck.pptx', text: 'x'.repeat(4000), pages: null, images: null });
  assert.equal(inconnu.level, 'visual_possible');
  assert.match(inconnu.reasons.join(' '), /n’a pas pu être établie/);
});

test('DOCMULTI-11 · PROMPT_MANUEL : généré, complet, et il interdit ce qu’il doit interdire', () => {
  const prompt = lecture.buildManualPrompt({ name: CHARTE });
  assert.match(prompt, new RegExp(CHARTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'il nomme le document');
  assert.match(prompt, /Joignez ce document/, 'il dit de joindre l’original');
  assert.match(prompt, /N’INVENTEZ RIEN/);
  assert.match(prompt, /uncertain_or_unreadable/, 'il exige que l’incertain soit nommé');
  assert.match(prompt, /NE TRAITEZ PAS la demande métier/, 'il interdit d’exécuter la demande finale');
  assert.match(prompt, /Retournez uniquement le JSON/);
  /* Le cas charte graphique est demandé explicitement, pas laissé à l’inspiration du modèle. */
  for (const attendu of ['logos', 'palettes', 'typographies', 'grilles', 'contraste', 'interdictions', 'captures', 'tableaux']) {
    assert.match(prompt, new RegExp(attendu), 'relevé demandé : ' + attendu);
  }
  /* Et jamais la permission de déduire une valeur d’une apparence. */
  assert.match(prompt, /EXPLICITEMENT écrits dans le document/);
});

test('DOCMULTI-12 · SCHEMA_DANS_LE_PROMPT : le prompt porte le schéma, et c’est le MÊME que celui des fournisseurs', () => {
  const prompt = lecture.buildManualPrompt({ name: CHARTE });
  for (const champ of ['document', 'mime_type', 'source', 'method', 'provider', 'text', 'structure',
                       'visual_elements', 'tables', 'uncertain_or_unreadable']) {
    assert.match(prompt, new RegExp('"' + champ + '"'), 'champ annoncé : ' + champ);
  }
  /* Les deux descriptions du même format — en prose pour le chemin manuel, en JSON Schema pour la
     sortie structurée — doivent rester en phase. */
  const enProse = JSON.parse(lecture.readingSchemaText());
  const duSchema = lecture.READING_JSON_SCHEMA.properties;
  assert.deepEqual(Object.keys(enProse.document).sort(), Object.keys(duSchema.document.properties).sort());
  assert.deepEqual(Object.keys(enProse.reading).sort(), Object.keys(duSchema.reading.properties).sort());
  assert.deepEqual(duSchema.reading.required.sort(), Object.keys(enProse.reading).sort());
  assert.deepEqual([...lecture.READING_METHODS], [...duSchema.reading.properties.method.enum]);
});

test('DOCMULTI-13 · JSON_VALIDE : admis, et converti en matériau qui se nomme comme une dérivation', () => {
  const verdict = lecture.validateReading(lectureValide(), { name: CHARTE, method: 'external_llm_manual', provider: null });
  assert.deepEqual(verdict.violations, []);
  assert.equal(verdict.valid, true);
  const materiau = lecture.readingToMaterial(lectureValide(), { name: CHARTE });
  assert.match(materiau, /lecture par une IA externe/, 'la méthode est dite');
  assert.match(materiau, /qui reste la source/, 'et le document reste la source');
  assert.match(materiau, /#086582/, 'la valeur écrite dans le document est conservée');
  assert.match(materiau, /Éléments visuels relevés/);
  assert.match(materiau, /Tableaux relevés/);
  assert.match(materiau, /Illisible ou incertain/);
  assert.match(materiau, /Couleur \| Usage/, 'les lignes de tableau sont restituées');
});

test('DOCMULTI-14 · JSON_INVALIDE : les cinq formes de rejet, chacune avec un motif utile', () => {
  const attendu = { name: CHARTE, method: 'external_llm_manual', provider: null };
  /* a. syntaxe cassée */
  const casse = lecture.extractReadingJson('{"document": {"name": "x",}');
  assert.equal(casse.ok, false);
  assert.match(casse.error, /JSON illisible|Aucun objet JSON/);
  /* b. champs manquants */
  const manquant = lecture.validateReading({ document: { name: CHARTE, source: 'user_document' }, reading: { method: 'external_llm_manual', provider: null, text: 'x' } }, attendu);
  assert.equal(manquant.valid, false);
  assert.ok(manquant.violations.some(x => /structure : tableau requis/.test(x)), 'le champ absent est nommé');
  /* c. type incorrect */
  const mauvaisType = lectureValide();
  mauvaisType.reading.structure = 'une chaîne';
  mauvaisType.reading.tables = [{ title: null, rows: 'pas un tableau' }];
  const vType = lecture.validateReading(mauvaisType, attendu);
  assert.equal(vType.valid, false);
  assert.ok(vType.violations.some(x => /structure : tableau attendu/.test(x)));
  assert.ok(vType.violations.some(x => /rows : tableau de lignes attendu/.test(x)));
  /* d. texte parasite avant et après */
  const parasite = 'Bien sûr ! Voici le JSON :\n```json\n' + JSON.stringify(lectureValide()) + '\n```\nDites-moi si besoin.';
  const extrait = lecture.extractReadingJson(parasite);
  assert.equal(extrait.ok, true, 'la prose autour est tolérée : ce n’est pas un défaut de lecture');
  assert.equal(lecture.validateReading(extrait.value, attendu).valid, true);
  /* e. un champ impossible, et une lecture qui parle d’un autre document */
  const intrus = lectureValide();
  intrus.reading.decision_utilisateur = 'je valide';
  const vIntrus = lecture.validateReading(intrus, attendu);
  assert.equal(vIntrus.valid, false);
  assert.ok(vIntrus.violations.some(x => /decision_utilisateur : propriété non prévue/.test(x)),
    'un champ que le format ne prévoit pas est refusé, pas ignoré');
  const autre = lecture.validateReading(lectureValide('un-autre-document.pdf'), attendu);
  assert.equal(autre.valid, false);
  assert.ok(autre.violations.some(x => /document.name/.test(x)), 'une lecture d’un autre document est refusée');
  /* Aucun motif ne recopie la valeur reçue : un message d’erreur ne doit pas réafficher le contenu. */
  for (const v of [...manquant.violations, ...vType.violations, ...vIntrus.violations]) {
    assert.equal(/CHARTE GRAPHIQUE|086582/.test(v), false, 'le motif ne recopie pas le contenu : ' + v);
  }
});

test('DOCMULTI-15 · PROVENANCE : la méthode et le fournisseur voyagent, et le local reste du local', () => {
  const attendu = { name: CHARTE };
  /* Une lecture fournisseur doit nommer SON fournisseur. */
  const sansProvider = lectureValide(CHARTE, { method: 'provider_multimodal', provider: null });
  assert.equal(lecture.validateReading(sansProvider, { ...attendu, method: 'provider_multimodal', provider: 'anthropic' }).valid, false);
  const bon = lectureValide(CHARTE, { method: 'provider_multimodal', provider: 'anthropic' });
  assert.equal(lecture.validateReading(bon, { ...attendu, method: 'provider_multimodal', provider: 'anthropic' }).valid, true);
  /* Et une lecture manuelle ne peut pas se faire passer pour une lecture fournisseur. */
  const usurpation = lectureValide(CHARTE, { method: 'external_llm_manual', provider: 'anthropic' });
  assert.equal(lecture.validateReading(usurpation, { ...attendu, method: 'external_llm_manual', provider: null }).valid, false);
  /* Le rendu nomme les trois origines distinctement. */
  assert.match(lecture.readingToMaterial(bon, { name: CHARTE }), /lecture multimodale — anthropic/);
  assert.match(lecture.readingToMaterial(lectureValide(), { name: CHARTE }), /IA externe, apportée par la personne/);
  /* Une lecture purement locale n'est pas une dérivation : elle ne produit aucun bloc ajouté. */
  const locale = lecture.localReading({ name: 'notes.txt', type: 'text/plain', text: 'Deux lignes.' });
  assert.equal(locale.reading.method, 'local');
  assert.equal(locale.reading.provider, null);
  assert.deepEqual(locale.reading.visual_elements, []);
});

test('DOCMULTI-16 · PAS_UNE_PAROLE_UTILISATEUR : une lecture reste un matériau, jamais une décision', () => {
  const materiau = lecture.readingToMaterial(lectureValide(), { name: CHARTE });
  /* Le bloc s’annonce comme dérivé et nomme sa source : rien n’y ressemble à une consigne. */
  assert.match(materiau, /^\[lecture par une IA externe[^\]]*dérivée du document/);
  /* Et le format n’a aucun champ par lequel un modèle pourrait décider quoi que ce soit. */
  const champs = Object.keys(lecture.READING_JSON_SCHEMA.properties.reading.properties);
  for (const interdit of ['decision', 'instruction', 'answer', 'user_choice', 'validated', 'demande']) {
    assert.equal(champs.some(c => c.includes(interdit)), false, 'aucun champ « ' + interdit + ' »');
  }
  assert.equal(lecture.READING_JSON_SCHEMA.properties.reading.additionalProperties, false,
    'et rien ne peut s’y ajouter en route');
});

test('DOCMULTI-25 · LIMITES : une lecture démesurée est refusée, pas tronquée en silence', () => {
  const trop = lectureValide();
  trop.reading.text = 'x'.repeat(lecture.READING_LIMITS.textChars + 1);
  const v = lecture.validateReading(trop, { name: CHARTE, method: 'external_llm_manual', provider: null });
  assert.equal(v.valid, false);
  assert.ok(v.violations.some(x => /text : au plus/.test(x)));
  const tropDItems = lectureValide();
  tropDItems.reading.visual_elements = Array.from({ length: lecture.READING_LIMITS.items + 1 }, () => ({ kind: 'other', description: 'x', value: null }));
  assert.equal(lecture.validateReading(tropDItems, { name: CHARTE, method: 'external_llm_manual', provider: null }).valid, false);
});

// =================================================================================================
// LA PAGE — ce que Node peut exercer honnêtement : le registre, les transports, le plan B.
// Les chemins PDF réels (charte, scan, image) demandent un moteur de rendu : ils sont éprouvés par
// les smokes navigateur du lot, relevés dans evaluation/doc-multi-01/.
// =================================================================================================

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

const reponse = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body });
const brut = (v) => JSON.parse(JSON.stringify(v));

function chargerPage({ repondre } = {}) {
  const elements = new Map();
  const journal = { reseau: [], console: [], domReady: [], confirmations: [] };
  function makeElement(id, tag = 'div') {
    const classes = new Set(); const listeners = new Map();
    const el = {
      id, tagName: tag.toUpperCase(), value: '', textContent: '', innerHTML: '', className: '', type: '', checked: false,
      hidden: hiddenInMarkup.has(id), disabled: false, dataset: {}, style: {}, children: [], options: [], files: [], selectedIndex: 0, attrs: {}, placeholder: '', readOnly: false, rows: 0, href: '',
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
      querySelector(sel) { return byId(String(sel).replace(/^#/, '')); }, querySelectorAll() { return []; },
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
    createElement: (tag) => makeElement('created:' + tag + ':' + Math.random().toString(36).slice(2), tag),
    createTextNode: (t) => ({ textContent: t }), createDocumentFragment: () => makeElement('fragment'),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') journal.domReady.push(fn); }, removeEventListener() {},
    body: makeElement('body'), documentElement: makeElement('html'), head: makeElement('head'), activeElement: null, hidden: false, visibilityState: 'visible', cookie: ''
  };
  document.documentElement.dataset = {};
  const zones = { session: new Map(), local: new Map() };
  const storage = (z) => ({ getItem: (k) => (zones[z].has(k) ? zones[z].get(k) : null), setItem: (k, v) => zones[z].set(k, String(v)), removeItem: (k) => zones[z].delete(k), clear: () => zones[z].clear(), get length() { return zones[z].size; }, key: (i) => [...zones[z].keys()][i] });
  const fetch = async (url, opts = {}) => {
    const entree = { url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {}, signal: opts.signal || null };
    journal.reseau.push(entree);
    if (!repondre) throw new TypeError('DOC-MULTI-01 : réseau non attendu.');
    return repondre(entree, journal.reseau.length);
  };
  const trace = (n) => (...a) => journal.console.push(n + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  const context = {
    document, localStorage: storage('local'), sessionStorage: storage('session'),
    console: { log: trace('log'), warn: trace('warn'), error: trace('error'), info: trace('info'), debug: trace('debug') },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'doc-multi-01', language: 'fr-FR', onLine: true },
    setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    Intl, Math, Date, JSON, Number, String, Array, Object, Promise, Map, Set, RegExp, Error, TypeError, Boolean, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, structuredClone,
    File: globalThis.File, Blob: globalThis.Blob, FileReader: class { readAsText() {} },
    btoa: globalThis.btoa, atob: globalThis.atob, TextEncoder, TextDecoder, URL, URLSearchParams, AbortController, AbortSignal,
    crypto: globalThis.crypto, performance: globalThis.performance, DOMParser,
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } preventDefault() {} stopPropagation() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } preventDefault() {} },
    MutationObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} },
    fetch, XMLHttpRequest: function () { throw new Error('xhr interdit'); }, WebSocket: function () { throw new Error('ws interdit'); }, EventSource: function () { throw new Error('sse interdit'); },
    alert() {}, confirm: (m) => { journal.confirmations.push(String(m)); return true; }, prompt: () => null,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
    location: { href: 'https://c-concept-dev.github.io/x', origin: 'https://c-concept-dev.github.io', protocol: 'https:', hash: '', search: '', pathname: '/' },
    history: { replaceState() {}, pushState() {} }, screen: { width: 1280, height: 800 }, innerWidth: 1280, innerHeight: 800,
    scrollTo() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, focus() {}
  };
  context.window = context; context.globalThis = context; context.self = context;
  vm.createContext(context);
  /* L'ingestion documentaire charge ses modules par import() dynamique — le lecteur, puis le
     format canonique. Sans chargeur, ces import() rejettent et la page se contente de dire
     « document illisible » : le test mesurerait alors son propre harnais. Le contexte reçoit donc
     le chargeur réel, et le nom de fichier de l'artefact pour que « ./core/documents/… » résolve
     comme dans un navigateur servant la page. */
  const options = { filename: path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'),
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER };
  for (const b of blocs) { const src = lignes.slice(b.from, b.to).join('\n'); if (src.trim()) vm.runInContext(src, context, options); }
  document.readyState = 'interactive';
  const erreurs = [];
  for (const fn of journal.domReady) { try { fn(); } catch (e) { erreurs.push(e.message); } }
  document.readyState = 'complete';
  assert.deepEqual(erreurs, [], 'initialisation de la page sans erreur');
  return { el: byId, elements, journal, ctx: context, w: context };
}

/**
 * Dépose des fichiers par la VRAIE porte : le champ de fichiers et son événement « change ».
 * L'attente est CONDITIONNELLE — l'ingestion charge ses modules par import() dynamique — et porte
 * sur ce que le DOM MONTRE, puisque c'est tout ce que ce lot expose : aucune poignée globale n'a été
 * ajoutée. Quatre gardes du dépôt interdisent un quatrième espace de noms, et une surface qui ne
 * servirait qu'aux tests n'en est pas une. Ce qui demande un vrai PDF — la lecture multimodale d'une
 * charte, un scan, une image — est éprouvé par les smokes navigateur, relevés dans
 * evaluation/doc-multi-01/smokes-navigateur.json.
 */
async function deposer(h, fichiers) {
  const champ = h.el('v11-files');
  champ.files = fichiers;
  champ.dispatchEvent({ type: 'change', target: champ });
  const liste = h.el('v11-filelist');
  for (let i = 0; i < 400; i += 1) {
    await new Promise((r) => setTimeout(r, 1));
    const vues = liste.children.slice(-fichiers.length).map((x) => x.innerHTML).join(' ');
    if (liste.children.length >= fichiers.length && !/Analyse locale/.test(vues)) break;
  }
  const vues = liste.children.slice(-fichiers.length).map((x) => x.innerHTML);
  assert.equal(vues.some((v) => /Analyse locale/.test(v)), false, 'l’ingestion est terminée');
  return vues;
}
const derniereRangee = (h) => h.el('v11-filelist').children[h.el('v11-filelist').children.length - 1];
const fichierTexte = (nom, contenu) => new File([contenu], nom, { type: 'text/plain' });
const fichierDocx = (nom, texte) => new File([zipSync({ 'word/document.xml': strToU8('<w:document xmlns:w="word"><w:p><w:r><w:t>' + texte + '</w:t></w:r></w:p></w:document>') })], nom);

test('DOCMULTI-07 · LOCAL_SUFFISANT : aucun geste de lecture proposé, et aucun appel', async () => {
  const h = chargerPage();   /* repondre absent : toute requête ferait échouer le test */
  const vues = await deposer(h, [fichierTexte('notes.txt', 'Le texte exact de la personne, mot pour mot.')]);
  assert.match(vues[0], /Texte extrait ; la mise en page/, 'la notice du lecteur, qui dit ce qui n’est pas interprété');
  assert.equal(/Lecture visuelle|manuellement/.test(vues[0]), false, 'aucun geste de lecture proposé');
  assert.equal(h.journal.reseau.length, 0, 'le local suffisait : rien n’est parti');
  assert.match(derniereRangee(h).innerHTML, /data-geste="retirer"/, '« Retirer » reste le seul geste');
});

test('DOCMULTI-10 · SANS_CLE : rien ne part, et le matériau reste celui du local', async () => {
  const h = chargerPage();
  await deposer(h, [fichierDocx('synthese.docx', 'BILAN DE COMPÉTENCES')]);
  assert.equal(h.el('api-cle').value, '', 'aucune clé n’est saisie');
  assert.equal(h.journal.reseau.length, 0, 'et aucun appel n’est tenté');
  assert.match(derniereRangee(h).innerHTML, /synthese\.docx/);
});

test('DOCMULTI-18 · UN_ECHEC_N_EMPORTE_PAS_LES_AUTRES', async () => {
  const h = chargerPage();
  const vues = await deposer(h, [fichierTexte('bon.txt', 'Un contenu lisible et suffisant pour une analyse.'),
    new File(['binaire'], 'vieux.doc'), fichierDocx('synthese.docx', 'BILAN')]);
  assert.equal(vues.length, 3, 'les trois rangées subsistent');
  assert.match(vues.join(' '), /bon\.txt/);
  assert.match(vues.join(' '), /synthese\.docx/);
  assert.match(vues.join(' '), /Format non pris en charge/, 'l’échec est dit, nommément');
  assert.equal(h.journal.reseau.length, 0);
});

test('DOCMULTI-08 · PIECE_ANTHROPIC : un PDF devient un bloc document, placé AVANT la consigne', async () => {
  const h = chargerPage({ repondre: () => reponse(200, { content: [{ type: 'text', text: 'ok' }], usage: {}, stop_reason: 'end_turn' }) });
  await h.w.appelFournisseur({ fournisseur: 'anthropic', cle: 'sk-ant-A', modele: 'claude-sonnet-5', maxTokens: 16,
    contenuUtilisateur: 'Lisez ce document.', documents: [{ name: 'c.pdf', mediaType: 'application/pdf', base64: 'JVBERi0=' }] });
  const bloc = h.journal.reseau[0].body.messages[0].content;
  assert.ok(Array.isArray(bloc), 'le contenu devient une liste de blocs dès qu’une pièce est jointe');
  assert.equal(bloc[0].type, 'document');
  assert.equal(bloc[0].source.type, 'base64');
  assert.equal(bloc[0].source.media_type, 'application/pdf');
  assert.equal(bloc[1].type, 'text');
  assert.deepEqual(h.journal.reseau.map((r) => new URL(r.url).host), ['api.anthropic.com']);
  /* Sans pièce, le contenu reste la chaîne d’avant ce lot — à l’identique. */
  const h2 = chargerPage({ repondre: () => reponse(200, { content: [{ type: 'text', text: 'ok' }], usage: {}, stop_reason: 'end_turn' }) });
  await h2.w.appelFournisseur({ fournisseur: 'anthropic', cle: 'sk-ant-A', modele: 'claude-sonnet-5', maxTokens: 16, contenuUtilisateur: 'Bonjour.' });
  assert.equal(h2.journal.reseau[0].body.messages[0].content, 'Bonjour.');
});

test('DOCMULTI-09 · PIECE_OPENAI : un PDF devient input_file, une image input_image, avant input_text', async () => {
  const rep = () => reponse(200, { status: 'completed', usage: {}, output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] });
  const h = chargerPage({ repondre: rep });
  await h.w.appelFournisseur({ fournisseur: 'openai', cle: 'sk-proj-O', modele: 'gpt-5.6-sol', maxTokens: 16,
    contenuUtilisateur: 'Lisez ce document.', documents: [{ name: 'c.pdf', mediaType: 'application/pdf', base64: 'JVBERi0=' }] });
  let parts = h.journal.reseau[0].body.input[0].content;
  assert.equal(parts[0].type, 'input_file');
  assert.equal(parts[0].filename, 'c.pdf');
  assert.match(parts[0].file_data, /^data:application\/pdf;base64,/);
  assert.equal(parts[1].type, 'input_text');
  const h2 = chargerPage({ repondre: rep });
  await h2.w.appelFournisseur({ fournisseur: 'openai', cle: 'sk-proj-O', modele: 'gpt-5.6-sol', maxTokens: 16,
    contenuUtilisateur: 'Lisez cette image.', documents: [{ name: 'c.png', mediaType: 'image/png', base64: 'iVBORw0=' }] });
  parts = h2.journal.reseau[0].body.input[0].content;
  assert.equal(parts[0].type, 'input_image');
  assert.match(parts[0].image_url, /^data:image\/png;base64,/);
  assert.deepEqual(h2.journal.reseau.map((r) => new URL(r.url).host), ['api.openai.com']);
});

test('DOCMULTI-19 · AUCUN_APPEL_CROISE : chaque fournisseur ne reçoit que SA clé', async () => {
  const h = chargerPage({ repondre: (e) => (e.url.includes('openai')
    ? reponse(200, { status: 'completed', usage: {}, output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] })
    : reponse(200, { content: [{ type: 'text', text: 'ok' }], usage: {}, stop_reason: 'end_turn' })) });
  const piece = [{ name: 'c.pdf', mediaType: 'application/pdf', base64: 'JVBERi0=' }];
  await h.w.appelFournisseur({ fournisseur: 'anthropic', cle: 'sk-ant-A', modele: 'claude-sonnet-5', maxTokens: 16, contenuUtilisateur: 'x', documents: piece });
  await h.w.appelFournisseur({ fournisseur: 'openai', cle: 'sk-proj-O', modele: 'gpt-5.6-sol', maxTokens: 16, contenuUtilisateur: 'x', documents: piece });
  assert.deepEqual(h.journal.reseau.map((r) => new URL(r.url).host), ['api.anthropic.com', 'api.openai.com']);
  assert.equal(JSON.stringify(h.journal.reseau[0]).includes('sk-proj-O'), false, 'aucune fuite vers Anthropic');
  assert.equal(JSON.stringify(h.journal.reseau[1]).includes('sk-ant-A'), false, 'aucune fuite vers OpenAI');
});

test('DOCMULTI-26 · PIECE_NON_TRANSMISSIBLE : un format que nul ne lit est refusé AVANT tout appel', async () => {
  const h = chargerPage();
  const { err } = await h.w.appelFournisseur({ fournisseur: 'anthropic', cle: 'sk-ant-x', modele: 'claude-sonnet-5',
    maxTokens: 16, contenuUtilisateur: 'x', documents: [{ name: 'x.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: 'AAA' }] })
    .then(() => ({}), (e) => ({ err: e }));
  assert.ok(err);
  assert.equal(err.categorie, 'requete_invalide');
  assert.match(err.message, /Seuls un PDF ou une image/);
  assert.equal(h.journal.reseau.length, 0, 'et rien n’est parti');
  /* Une pièce vide est refusée aussi, et pour sa propre raison. */
  const { err: vide } = await h.w.appelFournisseur({ fournisseur: 'anthropic', cle: 'sk-ant-x', modele: 'claude-sonnet-5',
    maxTokens: 16, contenuUtilisateur: 'x', documents: [{ name: 'x.pdf', mediaType: 'application/pdf', base64: '' }] })
    .then(() => ({}), (e) => ({ err: e }));
  assert.match(vide.message, /vide ou illisible/);
});

// CE QUI NE DOIT PAS AVOIR BOUGÉ
// =================================================================================================

const suiteExterne = (fichiers, attendu, etiquette) => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const sortie = execFileSync(process.execPath, ['--test', '--test-reporter=spec', ...fichiers],
    { encoding: 'utf8', env, cwd: racine, timeout: 300000 });
  const n = (k) => Number((sortie.match(new RegExp(`^\\u2139 ${k} (\\d+)`, 'm')) || [])[1]);
  assert.equal(n('fail'), 0, sortie.slice(-1500));
  assert.equal(n('pass'), attendu, etiquette + ' : compte exact');
};

test('DOCMULTI-20 · CONTINUITE-05 non régressée', () => {
  suiteExterne(['tests/continuite-conversation-longue-cont05.test.mjs', 'tests/continuite-api-citation-cont04b.test.mjs'], 30, 'CONTINUITE');
});

test('DOCMULTI-21 · MULTI-PROVIDER non régressé', () => {
  suiteExterne(['tests/provider-openai-pipeline-provideropenai01.test.mjs'], 35, 'PROVIDER-OPENAI');
});

test('DOCMULTI-22 · PDF-SAFARI-01 non régressé', () => {
  suiteExterne(['tests/document-reader-pdf-safari-pdfsafari01.test.mjs', 'tests/document-reader.test.mjs'], 19, 'lecteur');
  /* Et le correctif lui-même est intact, à la ligne près. */
  const reader = fs.readFileSync(path.join(racine, 'core/documents/reader.js'), 'utf8');
  assert.match(reader, /installStreamAsyncIteration\(\);/);
  assert.match(reader, /PDF-SAFARI-01 — Safari does not iterate a ReadableStream/);
});

test('DOCMULTI-24 · FROZEN : les sept plages gelées sont intactes, aucune réouverture', () => {
  const sortie = execFileSync(process.execPath, [path.join(racine, 'tools', 'frozen-guard.mjs')], { cwd: racine, encoding: 'utf8' });
  const verdict = JSON.parse(sortie);
  assert.equal(verdict.status, 'OK');
  const baseline = JSON.parse(fs.readFileSync(path.join(racine, 'anti-regression-baseline.json'), 'utf8'));
  assert.deepEqual(verdict.hashes, baseline.hashes);
  /* Ce lot n'a touché aucune plage : les empreintes sont celles que PROVIDER-OPENAI-01B a laissées. */
  assert.equal(baseline.hashes['moteur Architecte'], '3f0878c887d61218768ba6f11db15a0d0af511496a770fb5f7f1322610e0c181');
  assert.equal(baseline.hashes.ARCH_SCHEMA, 'a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b');
});
