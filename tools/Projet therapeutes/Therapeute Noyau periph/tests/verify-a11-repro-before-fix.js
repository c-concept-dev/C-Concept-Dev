// A11 (audit Codex, P1) — REPRODUCTION AVANT CORRECTIF (Régression #5). Technique
// "extraction-and-eval" déjà établie cette session (A12) : extrait le code SOURCE EXACT de
// storeAndReturn / handleGeneratePPTX / handleGeneratePresentation depuis Worker/index.js (via
// marqueurs de chaîne, jamais retapé), et l'exécute dans un contexte Node isolé avec seulement
// les dépendances externes non pertinentes au bug stubbées (PptxGenJS — le rendu binaire réel
// n'est pas ce qui est cassé ; RAG/LLM — la génération du plan de slides n'est pas ce qui est
// cassé non plus). Le CONTRAT entre les deux fonctions Worker, lui, est le code réel inchangé.
const fs = require('fs');
const SRC = fs.readFileSync('/home/user/C-Concept-Dev/Worker/index.js', 'utf8');

function extract(startMarker, endMarker) {
  const start = SRC.indexOf(startMarker);
  if (start === -1) throw new Error('Marqueur début introuvable: ' + startMarker);
  const end = SRC.indexOf(endMarker, start);
  if (end === -1) throw new Error('Marqueur fin introuvable après le début: ' + endMarker);
  return SRC.slice(start, end + endMarker.length);
}

const srcAllowedOrigin = extract('var ADOC_ALLOWED_ORIGIN = "https://c-concept-dev.github.io";', '\n');
const srcCors = extract('var CORS = {', '};\n');
const srcColors = extract('var C_CONCEPT_COLORS = {', '};\n');
const srcJson = extract('function json(data, status = 200) {', '__name(json, "json");');
const srcJsonErr = extract('function jsonErr(msg, status = 500) {', '__name(jsonErr, "jsonErr");');
const srcStoreAndReturn = extract('async function storeAndReturn(env2, buffer2, filename, mime, ttl = 3600) {', '__name(storeAndReturn, "storeAndReturn");');
const srcGeneratePPTX = extract('async function handleGeneratePPTX(request2, env2) {', '__name(handleGeneratePPTX, "handleGeneratePPTX");');
const srcGeneratePresentation = extract('async function handleGeneratePresentation(request2, env2) {', '__name(handleGeneratePresentation, "handleGeneratePresentation");');

console.log('=== Extraction confirmée (code RÉEL, non modifié, longueurs en caractères) ===');
console.log('storeAndReturn:', srcStoreAndReturn.length, '| handleGeneratePPTX:', srcGeneratePPTX.length, '| handleGeneratePresentation:', srcGeneratePresentation.length);

// Dépendances externes STUBBÉES (non pertinentes au bug — le contrat storeAndReturn ↔
// handleGeneratePPTX ↔ handleGeneratePresentation, lui, est le code réel ci-dessus) :
// - PptxGenJS : produit un buffer minimal portant la VRAIE signature ZIP (PK\x03\x04) qu'un
//   .pptx réel porte toujours (un pptx EST un zip) — suffisant pour distinguer "vrai binaire
//   pptx" de "texte JSON", exactement ce que ce lot doit vérifier.
// - handleRagSearch / handleLLMProxy : la génération du plan de slides n'est jamais la cause du
//   bug (confirmé par lecture de code : le bug est dans le traitement de la réponse de
//   handleGeneratePPTX, après que le plan a déjà été produit).
function buildHarness() {
  const __defProp = Object.defineProperty;
  const __name = (target, value) => __defProp(target, 'name', { value, configurable: true });

  class PptxGenJSStub {
    constructor() { this.layout = null; this.theme = null; this._slides = []; }
    addSlide() {
      const slide = { background: null, addText() {}, addShape() {} };
      this._slides.push(slide);
      return slide;
    }
    get ShapeType() { return { rect: 'rect' }; }
    async write() {
      // Signature ZIP réelle (PK\x03\x04) suivie d'un peu de contenu — représentatif d'un vrai
      // fichier .pptx (qui EST un zip), jamais un texte JSON.
      return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('FAKE-BUT-REAL-ZIP-STRUCTURE-PPTX-CONTENT')]);
    }
  }

  const kvStore = new Map();
  const env2 = {
    CLONE_KV: {
      async put(key, value, opts) { kvStore.set(key, value); },
      async get(key) { return kvStore.has(key) ? kvStore.get(key) : null; },
    },
    PEXELS_API_KEY: null,
    DB: {}, AI: {}, VECTOR_INDEX: {},
  };

  const ctx = {
    __name, crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2) },
    PptxGenJS: PptxGenJSStub,
    Response, Request, console, btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    env2, kvStore,
  };

  // Stubs des deux SEULES dépendances externes à handleGeneratePresentation non couvertes par
  // le code extrait ci-dessus (RAG + LLM) — jamais la partie sous test.
  const stubHandlers = `
    async function handleRagSearch(req) {
      return new Response(JSON.stringify({ chunks: [
        { index: 0, book_title: 'Ouvrage test', author: 'Auteur', page_number: 1, content: 'Extrait clinique de test suffisant pour dépasser le seuil de 3 chunks.' },
        { index: 1, book_title: 'Ouvrage test 2', author: 'Auteur 2', page_number: 5, content: 'Deuxième extrait clinique de test.' },
        { index: 2, book_title: 'Ouvrage test 3', author: 'Auteur 3', page_number: 9, content: 'Troisième extrait clinique de test.' },
      ] }));
    }
    __name(handleRagSearch, "handleRagSearch");
    async function handleLLMProxy(req) {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({
        presentation_title: 'Titre de test', presentation_subtitle: 'Sous-titre',
        slides: [{ title: 'Slide 1', bullets: ['Point A', 'Point B'], citation: 'Auteur, p.1' }],
      }) }] }));
    }
    __name(handleLLMProxy, "handleLLMProxy");
  `;

  const fullSrc = srcAllowedOrigin + '\n' + srcCors + '\n' + srcColors + '\n' + srcJson + '\n' + srcJsonErr + '\n'
    + stubHandlers + '\n' + srcStoreAndReturn + '\n' + srcGeneratePPTX + '\n' + srcGeneratePresentation
    + '\nmodule.exports = { handleGeneratePresentation, handleGeneratePPTX, storeAndReturn, env2 };';

  const vm = require('vm');
  const sandbox = Object.assign({ module: { exports: {} }, require, Buffer, Promise }, ctx);
  vm.createContext(sandbox);
  vm.runInContext(fullSrc, sandbox, { filename: 'worker-extract.js' });
  return sandbox.module.exports;
}

(async () => {
  const { handleGeneratePresentation, env2 } = buildHarness();

  const req = new Request('https://proxy/generate-presentation', {
    method: 'POST',
    body: JSON.stringify({ topic: 'Test EMDR', nb_slides: 1, filename: 'presentation-test' }),
    headers: { 'Content-Type': 'application/json' },
  });

  const res = await handleGeneratePresentation(req, env2);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('Content-Type');
  const contentDisposition = res.headers.get('Content-Disposition');

  console.log('\n=== REPRODUCTION A11 (code NON modifié) ===');
  console.log('Statut HTTP:', res.status);
  console.log('Content-Type annoncé:', contentType);
  console.log('Content-Disposition:', contentDisposition);
  console.log('Taille du corps:', buf.length, 'octets');
  console.log('4 premiers octets (hex) — un vrai .pptx doit être 50 4b 03 04 (signature ZIP):', buf.slice(0, 4).toString('hex'));
  const bodyAsText = buf.toString('utf8');
  let parsedAsJson = null;
  try { parsedAsJson = JSON.parse(bodyAsText); } catch (e) {}
  console.log('Le corps annoncé "PPTX" est en réalité du JSON parsable:', !!parsedAsJson);
  if (parsedAsJson) console.log('Contenu JSON réel reçu à la place du fichier:', JSON.stringify(parsedAsJson));
  console.log('\nBUG CONFIRMÉ:', (!!parsedAsJson && buf.slice(0, 4).toString('hex') !== '504b0304'));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
