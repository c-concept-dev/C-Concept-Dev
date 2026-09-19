#!/usr/bin/env node
/* SCHEMA-ANTHROPIC — DIAGNOSTIC HORS PRODUIT : BISECTION DE LA GRAMMAIRE CUMULÉE.
 * ============================================================================
 *
 * Ce script n'est PAS embarqué dans le produit. Il charge le VRAI schéma canonique
 * (ARCH_SCHEMA) et la VRAIE projection fournisseur (schemaPourAnthropic) depuis
 * atelier-prompts-v11.5-lot10g-decision-provider.html — exactement le code que le
 * produit exécute — et envoie de VRAIS appels à l'API Anthropic avec des sous-
 * ensembles de blocs racine du schéma, pour localiser la frontière de complexité
 * qui déclenche « The compiled grammar is too large ».
 *
 * PREUVE DÉJÀ ÉTABLIE (hors de ce script) : le schéma complet échoue (400) sur
 * claude-opus-5 ET claude-sonnet-5 ; chaque bloc racine pris isolément réussit
 * (200). La question ouverte : quelle COMBINAISON minimale de blocs, une fois
 * cumulée, fait basculer la compilation de la grammaire.
 *
 * DÉFINITIONS : un sous-ensemble ne garde QUE les `definitions` réellement
 * atteignables par $ref depuis les blocs retenus (fermeture transitive) — jamais
 * la table complète. Une première version gardait toutes les définitions dans
 * chaque sous-ensemble « pour simplifier » ; elle gonflait artificiellement des
 * blocs sans le moindre $ref (evaluation, strategie) à ~4 Ko avec 6 définitions
 * orphelines, rendant tout verdict sur leur combinaison invérifiable — corrigé.
 *
 * SORTIE (mode CLI) : uniquement des données sûres à coller dans un chat — nom de
 * l'essai, blocs inclus, métriques structurelles (calculées localement, jamais
 * envoyées), HTTP status, error.type, error.message (prose générique d'Anthropic,
 * jamais de contenu utilisateur), request_id, stop_reason, usage. JAMAIS : la clé,
 * un en-tête complet, le corps de la requête, le texte généré par le modèle.
 *
 * USAGE :
 *   ANTHROPIC_API_KEY=... ATELIER_SMOKE_MODEL=claude-sonnet-5 \
 *     node tools/anthropic-grammar-bisect.mjs --bisect2
 *
 * Les fonctions pures ci-dessous (chargement du produit, construction des sous-
 * ensembles, atteignabilité des définitions, métriques) sont exportées pour la
 * suite tests/anthropic-grammar-bisect-runner.test.mjs — importer ce fichier
 * n'envoie jamais de requête ni ne lit la clé : seul un lancement direct
 * (`node tools/anthropic-grammar-bisect.mjs ...`) exécute la partie réseau.
 * ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HTML_PATH = path.join(RACINE, 'atelier-prompts-v11.5-lot10g-decision-provider.html');

/* --------------------------------------------------------------------------
 * CHARGEMENT DU VRAI CODE PRODUIT (ARCH_SCHEMA + schemaPourAnthropic), avec un
 * DOM minimal — même technique que les suites SCHEMA-ANTHROPIC-01/02.
 * ------------------------------------------------------------------------ */
export function chargerProduit() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const lignes = html.split('\n');
  const blocs = [];
  { let open = -1;
    for (let i = 0; i < lignes.length; i += 1) {
      if (/^<script/.test(lignes[i])) open = i + 1;
      else if (/^<\/script>/.test(lignes[i]) && open !== -1) { blocs.push({ from: open, to: i }); open = -1; }
    } }
  const elements = new Map();
  function makeElement(id) {
    return {
      id, value: '', textContent: '', innerHTML: '', className: '', hidden: false, disabled: false,
      dataset: {}, style: {}, children: [], options: [], files: [], attrs: {},
      classList: { add() {}, remove() {}, toggle() { return false; }, contains: () => false },
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, click() {},
      focus() {}, blur() {}, appendChild(c) { return c; }, append() {}, remove() {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      removeAttribute() {}, hasAttribute: () => false, closest: () => null, matches: () => false,
      querySelector: (s) => byId(String(s).replace(/^#/, '')), querySelectorAll: () => [],
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 })
    };
  }
  const byId = (id) => { if (!elements.has(id)) elements.set(id, makeElement(String(id))); return elements.get(id); };
  const domReady = [];
  const document = {
    readyState: 'loading', getElementById: byId, querySelector: (s) => byId('sel:' + s), querySelectorAll: () => [],
    createElement: (tag) => makeElement('created:' + tag), createTextNode: (t) => ({ textContent: t }), createDocumentFragment: () => makeElement('fragment'),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') domReady.push(fn); }, removeEventListener: () => {},
    body: makeElement('body'), documentElement: Object.assign(makeElement('html'), { dataset: {} }), head: makeElement('head'),
    activeElement: null, hidden: false, visibilityState: 'visible', cookie: ''
  };
  const zones = { session: new Map(), local: new Map() };
  const storage = (z) => ({ getItem: (k) => (zones[z].has(k) ? zones[z].get(k) : null), setItem: (k, v) => zones[z].set(k, String(v)), removeItem: (k) => zones[z].delete(k), clear: () => zones[z].clear(), get length() { return zones[z].size; }, key: (i) => [...zones[z].keys()][i] });
  const context = {
    document, localStorage: storage('local'), sessionStorage: storage('session'),
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'anthropic-grammar-bisect', language: 'fr-FR', onLine: true },
    setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    Intl, Math, Date, JSON, Number, String, Array, Object, Promise, Map, Set, RegExp, Error, TypeError, Boolean, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, structuredClone,
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } preventDefault() {} stopPropagation() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } preventDefault() {} },
    MutationObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} },
    FileReader: class { readAsText() {} }, Blob: globalThis.Blob, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, AbortSignal, crypto: globalThis.crypto, performance: globalThis.performance,
    fetch: async () => { throw new Error('réseau désactivé pendant le chargement du produit'); },
    XMLHttpRequest: function () { throw new Error('xhr interdit'); }, WebSocket: function () { throw new Error('ws interdit'); }, EventSource: function () { throw new Error('sse interdit'); },
    alert() {}, confirm: () => true, prompt: () => null, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
    location: { href: 'https://c-concept-dev.github.io/x', origin: 'https://c-concept-dev.github.io', protocol: 'https:', hash: '', search: '', pathname: '/' },
    history: { replaceState() {}, pushState() {} }, screen: { width: 1280, height: 800 }, innerWidth: 1280, innerHeight: 800, scrollTo() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, focus() {}
  };
  context.window = context; context.globalThis = context; context.self = context;
  vm.createContext(context);
  for (const b of blocs) { const src = lignes.slice(b.from, b.to).join('\n'); if (src.trim()) vm.runInContext(src, context, { filename: 'atelier-bisect' }); }
  document.readyState = 'interactive';
  for (const fn of domReady) { try { fn(); } catch (e) { console.error('erreur init page : ' + e.message); } }
  document.readyState = 'complete';
  const schema = context.window.__ARCHITECTE_V10__ && context.window.__ARCHITECTE_V10__.schema;
  const projeter = context.window.schemaPourAnthropic;
  if (!schema || typeof projeter !== 'function') throw new Error('ARCH_SCHEMA ou schemaPourAnthropic introuvables dans le produit chargé.');
  return { schema, projeter };
}

/* --------------------------------------------------------------------------
 * MÉTRIQUES STRUCTURELLES — mêmes définitions que la suite SCHEMA-ANTHROPIC-02.
 * ------------------------------------------------------------------------ */
export function metriques(s) {
  const m = { octets: JSON.stringify(s).length, noeuds: 0, properties: 0, required: 0, ref: 0, definitions: 0, profondeur: 0, enum: 0, const: 0, ap_false: 0, anyOf: 0, minItems: 0 };
  (function w(n, d) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => w(x, d)); return; }
    m.noeuds += 1; m.profondeur = Math.max(m.profondeur, d);
    if (n.properties) { m.properties += Object.keys(n.properties).length; for (const k of Object.keys(n.properties)) w(n.properties[k], d + 1); }
    if (n.definitions) { m.definitions += Object.keys(n.definitions).length; for (const k of Object.keys(n.definitions)) w(n.definitions[k], d + 1); }
    if (Array.isArray(n.required)) m.required += n.required.length;
    if (n.$ref) m.ref += 1;
    if (n.enum) m.enum += 1; if (n.const !== undefined) m.const += 1; if (n.additionalProperties === false) m.ap_false += 1; if (n.anyOf) m.anyOf += 1; if (n.minItems !== undefined) m.minItems += 1;
    for (const k of ['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains']) if (n[k] && typeof n[k] === 'object') w(n[k], d + 1);
    for (const k of ['anyOf', 'allOf', 'oneOf']) if (Array.isArray(n[k])) n[k].forEach((b) => w(b, d + 1));
  })(s, 1);
  return m;
}

export const TOUS_LES_BLOCS = ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation', 'verification', 'apprentissage'];

/** Tous les `$ref` présents directement dans un nœud (pas de résolution ni de fermeture
   transitive ici — juste le repérage), en parcourant les mêmes clés structurelles que
   `metriques()` et le `parcourir()` de la suite SCHEMA-ANTHROPIC-02. */
export function refsDirectes(noeud, acc) {
  acc = acc || new Set();
  if (!noeud || typeof noeud !== 'object') return acc;
  if (Array.isArray(noeud)) { noeud.forEach((x) => refsDirectes(x, acc)); return acc; }
  if (typeof noeud.$ref === 'string') acc.add(noeud.$ref);
  for (const k of ['properties', 'definitions', '$defs', 'patternProperties']) {
    if (noeud[k]) for (const n of Object.keys(noeud[k])) refsDirectes(noeud[k][n], acc);
  }
  for (const k of ['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains', 'propertyNames']) {
    if (noeud[k] && typeof noeud[k] === 'object') refsDirectes(noeud[k], acc);
  }
  for (const k of ['anyOf', 'allOf', 'oneOf', 'prefixItems']) {
    if (Array.isArray(noeud[k])) noeud[k].forEach((x) => refsDirectes(x, acc));
  }
  return acc;
}

/** `#/definitions/nom` (ou `#/$defs/nom`) → `nom` ; toute autre forme (référence externe,
   pointeur profond) → null, délibérément hors périmètre : le canonique n'en produit pas. */
export function nomDefinition(ref) {
  const m = /^#\/definitions\/([^/]+)$/.exec(ref) || /^#\/\$defs\/([^/]+)$/.exec(ref);
  return m ? m[1] : null;
}

/** Fermeture transitive : part des `$ref` trouvées dans `racineSansDefinitions`, résout
   chaque définition atteinte, puis suit À SON TOUR les `$ref` qu'ELLE contient (une
   définition peut référencer une autre définition — ex. declaration → preuve). Retourne
   uniquement les définitions réellement atteintes ; une `$ref` vers un nom absent de
   `toutesLesDefinitions` est ignorée ici (schéma cassé : hors du périmètre de ce runner). */
export function definitionsAtteignables(racineSansDefinitions, toutesLesDefinitions) {
  const retenues = {};
  const aVisiter = new Set([...refsDirectes(racineSansDefinitions)].map(nomDefinition).filter(Boolean));
  const visitees = new Set();
  while (aVisiter.size) {
    const nom = aVisiter.values().next().value;
    aVisiter.delete(nom);
    if (visitees.has(nom)) continue;
    visitees.add(nom);
    if (!Object.prototype.hasOwnProperty.call(toutesLesDefinitions, nom)) continue;
    retenues[nom] = toutesLesDefinitions[nom];
    for (const suivante of refsDirectes(toutesLesDefinitions[nom])) {
      const nomSuivant = nomDefinition(suivante);
      if (nomSuivant && !visitees.has(nomSuivant)) aVisiter.add(nomSuivant);
    }
  }
  return retenues;
}

/** Le schéma canonique restreint à un sous-ensemble de blocs racine (plus `version`,
   toujours présent) : SEULS restent les properties/required des blocs retenus, et SEULES
   les `definitions` réellement atteignables par $ref depuis ce qui reste — jamais la table
   complète, jamais une définition orpheline. */
export function sousEnsemble(canonique, blocsInclus) {
  const toutesLesDefinitions = canonique.definitions || {};
  const clone = JSON.parse(JSON.stringify(canonique));
  for (const b of TOUS_LES_BLOCS) if (!blocsInclus.includes(b)) delete clone.properties[b];
  clone.required = clone.required.filter((r) => r === 'version' || blocsInclus.includes(r));
  delete clone.definitions;
  const atteignables = definitionsAtteignables(clone, toutesLesDefinitions);
  if (Object.keys(atteignables).length) clone.definitions = atteignables;
  return clone;
}

/* ==========================================================================
 * PARTIE CLI — RÉSEAU RÉEL. Ne s'exécute que si ce fichier est le programme
 * lancé directement (même garde que tools/build-release-manifest.mjs) : un
 * `import` depuis un test n'envoie jamais rien et ne lit jamais la clé.
 * ======================================================================= */
const LANCE_DIRECTEMENT = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (LANCE_DIRECTEMENT) {
  const MODE = process.argv.includes('--bisect2') ? 'bisect2'
    : process.argv.includes('--bisect') ? 'bisect'
    : process.argv.includes('--grammaire') ? 'grammaire'
    : null;

  if (!MODE) {
    console.log('Usage : node tools/anthropic-grammar-bisect.mjs --bisect2 | --bisect | --grammaire');
    console.log('Variables : la clé Anthropic via sa variable d’environnement dédiée (obligatoire, jamais affichée), ' +
      'ATELIER_SMOKE_MODEL (défaut claude-sonnet-5).');
    process.exit(1);
  }

  const CLE = process.env.ANTHROPIC_API_KEY;
  if (!CLE) {
    console.log('Clé Anthropic absente de l’environnement (variable non définie). Rien n’est envoyé.');
    process.exit(1);
  }
  const MODELE = process.env.ATELIER_SMOKE_MODEL || 'claude-sonnet-5';
  console.log('Modèle cible : ' + MODELE);
  console.log('Clé détectée : oui (' + CLE.length + ' caractères, jamais affichée).');
  console.log('Mode : ' + MODE);
  console.log('');

  const SYSTEME_DIAGNOSTIC = 'Diagnostic technique interne (SCHEMA-ANTHROPIC). Ceci ne teste que la compilation de la grammaire structurée fournie ; ignorez tout autre objectif. Produisez un JSON minimal conforme au schéma, même incomplet.';
  const MESSAGE_DIAGNOSTIC = 'Diagnostic structurel — aucune tâche réelle.';

  const afficherEssai = ({ nom, blocsInclus, metriques: m, statut, requestId, errType, errMsg, stopReason, usage, erreurReseau }) => {
    console.log('--- essai : ' + nom + ' ---');
    console.log('blocs inclus       : ' + (blocsInclus.length ? blocsInclus.join(', ') : '(aucun)'));
    console.log('métriques          : octets=' + m.octets + ' noeuds=' + m.noeuds + ' properties=' + m.properties +
      ' required=' + m.required + ' ref=' + m.ref + ' definitions=' + m.definitions + ' profondeur=' + m.profondeur +
      ' enum=' + m.enum + ' const=' + m.const + ' ap_false=' + m.ap_false + ' anyOf=' + m.anyOf + ' minItems=' + m.minItems);
    if (erreurReseau) { console.log('erreur réseau      : ' + erreurReseau); console.log(''); return; }
    console.log('HTTP status        : ' + statut);
    console.log('request_id         : ' + (requestId || '(absent)'));
    if (errType || errMsg) {
      console.log('error.type         : ' + (errType || '(absent)'));
      console.log('error.message      : ' + (errMsg || '(absent)'));
    } else {
      console.log('stop_reason        : ' + (stopReason || '(absent)'));
      console.log('usage              : ' + (usage ? JSON.stringify(usage) : '(absent)'));
    }
    console.log('');
  };

  const essai = async (nom, blocsInclus, schemaCanonique, projeter) => {
    const sousSchema = sousEnsemble(schemaCanonique, blocsInclus);
    const projete = projeter(sousSchema);
    const m = metriques(projete);
    const corps = {
      model: MODELE, max_tokens: 64, system: SYSTEME_DIAGNOSTIC,
      messages: [{ role: 'user', content: MESSAGE_DIAGNOSTIC }],
      output_config: { format: { type: 'json_schema', schema: projete }, effort: 'high' }
    };
    let reponse;
    try {
      reponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CLE, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(corps)
      });
    } catch (e) {
      afficherEssai({ nom, blocsInclus, metriques: m, statut: null, erreurReseau: e.message });
      return { nom, blocsInclus, statut: null, echec: true, grammaireTropGrande: false };
    }
    const requestId = reponse.headers.get('request-id') || reponse.headers.get('anthropic-request-id') || reponse.headers.get('x-request-id') || null;
    let data = {};
    try { data = await reponse.json(); } catch { data = {}; }
    const echec = !reponse.ok;
    const errType = echec ? (data.error && data.error.type) || null : null;
    const errMsg = echec ? (data.error && data.error.message) || null : null;
    const grammaireTropGrande = echec && reponse.status === 400 && /compiled grammar is too large/i.test(errMsg || '');
    afficherEssai({
      nom, blocsInclus, metriques: m, statut: reponse.status, requestId,
      errType, errMsg, stopReason: echec ? null : (data.stop_reason || null),
      usage: echec ? null : data.usage || null
    });
    return { nom, blocsInclus, statut: reponse.status, echec, grammaireTropGrande, errType, errMsg };
  };

  const bisect2 = async (schemaCanonique, projeter) => {
    console.log('=== ÉTAPE 0 — référence : ensemble complet (7 blocs) ===');
    const ref = await essai('REF_FULL_SET', TOUS_LES_BLOCS, schemaCanonique, projeter);
    if (!ref.grammaireTropGrande) {
      console.log('L’ensemble complet n’a PAS reproduit « compiled grammar is too large » cette fois-ci ' +
        '(statut ' + ref.statut + (ref.errType ? ', ' + ref.errType : '') + '). Le diagnostic préalable n’est plus reproductible tel quel ; ' +
        'arrêt du bisect2 pour éviter des appels inutiles sur une prémisse qui a changé.');
      return { reproduit: false };
    }

    console.log('=== ÉTAPE 1 — recherche binaire du préfixe minimal défaillant (ordre canonique) ===');
    let lo = 1; let hi = TOUS_LES_BLOCS.length; // lo passe (jamais vérifié à 0 blocs, non pertinent) ; hi échoue (= référence)
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const prefixe = TOUS_LES_BLOCS.slice(0, mid);
      const r = await essai('PREFIX_' + mid + '_BLOCS', prefixe, schemaCanonique, projeter);
      if (r.grammaireTropGrande) { hi = mid; } else { lo = mid + 1; }
    }
    const tailleMinPrefixe = hi;
    console.log('Préfixe minimal défaillant : ' + tailleMinPrefixe + ' bloc(s) — ' + TOUS_LES_BLOCS.slice(0, tailleMinPrefixe).join(', '));
    console.log('');

    console.log('=== ÉTAPE 2 — minimisation gloutonne (delta-debug à un bloc) de cet ensemble ===');
    let candidat = TOUS_LES_BLOCS.slice(0, tailleMinPrefixe);
    let progression = true;
    while (progression && candidat.length > 1) {
      progression = false;
      for (const bloc of [...candidat]) {
        const reduit = candidat.filter((b) => b !== bloc);
        const r = await essai('SANS_' + bloc + '_' + reduit.length + '_BLOCS', reduit, schemaCanonique, projeter);
        if (r.grammaireTropGrande) { candidat = reduit; progression = true; break; }
      }
    }
    console.log('=== RÉSULTAT bisect2 ===');
    console.log('Ensemble minimal encore défaillant : ' + candidat.length + ' bloc(s) — ' + candidat.join(', '));
    console.log('(Chaque bloc de cet ensemble, retiré individuellement, fait repasser l’appel en 200 — sinon la réduction aurait continué.)');
    return { reproduit: true, ensembleMinimal: candidat, tailleMinPrefixe };
  };

  const { schema, projeter } = chargerProduit();

  if (MODE === 'grammaire') {
    await essai('SCHEMA_COMPLET', TOUS_LES_BLOCS, schema, projeter);
  } else if (MODE === 'bisect') {
    for (const b of TOUS_LES_BLOCS) await essai('SEUL_' + b, [b], schema, projeter);
  } else if (MODE === 'bisect2') {
    await bisect2(schema, projeter);
  }
}
