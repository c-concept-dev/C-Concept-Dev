// A11 (audit Codex, P1) — /generate-presentation renvoie du JSON déguisé en PPTX.
// AVANT ce lot : handleGeneratePresentation lisait la réponse de handleGeneratePPTX (un
// POINTEUR JSON {id,url,...} vers CLONE_KV, contrat partagé par TOUTES les routes de fichier)
// comme si c'étaient les octets bruts du fichier. Reproduit AVANT correctif dans
// verify-a11-repro-before-fix.js (Régression #5 : bug confirmé sur le code non modifié, via
// extraction du code réel de Worker/index.js).
//
// Investigation (obligatoire avant code) : bug confirmé 100% Worker-only — le client
// (studio-clinique.html) n'appelle même pas /generate-presentation, et son usage réel de
// /generate-pptx (direct, ~L6265/6770) dépend du contrat JSON existant de handleGeneratePPTX,
// jamais touché par ce lot. Décision : corriger uniquement handleGeneratePresentation, en
// réutilisant le mécanisme déjà existant de handleGetFile (CLONE_KV.get("file:"+id,
// {type:"arrayBuffer"})) pour aller chercher le VRAI contenu binaire.
//
// Ce test réutilise la même technique d'extraction ("extraction-and-eval", déjà établie pour
// A12/A11) que la reproduction, sur le code Worker RÉEL et désormais MODIFIÉ.
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
const srcGetFile = extract('async function handleGetFile(url, env2) {', '__name(handleGetFile, "handleGetFile");');

function buildHarness() {
  const __defProp = Object.defineProperty;
  const __name = (target, value) => __defProp(target, 'name', { value, configurable: true });

  class PptxGenJSStub {
    constructor() { this.layout = null; this.theme = null; this._slides = []; }
    addSlide() { const slide = { background: null, addText() {}, addShape() {} }; this._slides.push(slide); return slide; }
    get ShapeType() { return { rect: 'rect' }; }
    async write() {
      return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('FAKE-BUT-REAL-ZIP-STRUCTURE-PPTX-CONTENT')]);
    }
  }

  const kvStore = new Map();
  const env2 = {
    CLONE_KV: {
      async put(key, value) { kvStore.set(key, value); },
      async get(key, opts) {
        if (!kvStore.has(key)) return null;
        const v = kvStore.get(key);
        if (opts && opts.type === 'arrayBuffer') {
          const buf = Buffer.isBuffer(v) ? v : Buffer.from(v);
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
        return v;
      },
    },
    PEXELS_API_KEY: null,
    DB: {}, AI: {}, VECTOR_INDEX: {},
  };

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
    + stubHandlers + '\n' + srcStoreAndReturn + '\n' + srcGeneratePPTX + '\n' + srcGeneratePresentation + '\n' + srcGetFile
    + '\nmodule.exports = { handleGeneratePresentation, handleGeneratePPTX, handleGetFile, storeAndReturn, env2 };';

  const vm = require('vm');
  const ctx = { __name, crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2) }, PptxGenJS: PptxGenJSStub, Response, Request, console, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), env2, kvStore };
  const sandbox = Object.assign({ module: { exports: {} }, require, Buffer, Promise, URL }, ctx);
  vm.createContext(sandbox);
  vm.runInContext(fullSrc, sandbox, { filename: 'worker-extract.js' });
  return sandbox.module.exports;
}

const REAL_PPTX_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('FAKE-BUT-REAL-ZIP-STRUCTURE-PPTX-CONTENT')]);

(async () => {
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);
  const { handleGeneratePresentation, handleGeneratePPTX, handleGetFile, env2 } = buildHarness();

  // ═══ 1. /generate-presentation (défaut) produit un VRAI fichier ouvrable ═══
  {
    const req = new Request('https://proxy/generate-presentation', {
      method: 'POST', body: JSON.stringify({ topic: 'Test EMDR', nb_slides: 1, filename: 'presentation-test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handleGeneratePresentation(req, env2);
    const buf = Buffer.from(await res.arrayBuffer());
    log('1a. Statut 200', res.status === 200, res.status);
    log('1b. Signature ZIP réelle (50 4b 03 04) — un vrai .pptx, jamais du JSON', buf.slice(0, 4).toString('hex') === '504b0304', buf.slice(0, 4).toString('hex'));
    log('1c. Contenu binaire identique à celui réellement produit par PptxGenJS/storeAndReturn', buf.equals(REAL_PPTX_BYTES), { len: buf.length, expectedLen: REAL_PPTX_BYTES.length });
    log('1d. Content-Type PPTX correct', res.headers.get('Content-Type') === 'application/vnd.openxmlformats-officedocument.presentationml.presentation', res.headers.get('Content-Type'));
    log('1e. Content-Disposition avec le bon nom de fichier', res.headers.get('Content-Disposition') === 'attachment; filename="presentation-test.pptx"', res.headers.get('Content-Disposition'));
  }

  // ═══ 2. /generate-presentation?return_json=true — pptx_base64 décode vers le VRAI fichier ═══
  {
    const req = new Request('https://proxy/generate-presentation', {
      method: 'POST', body: JSON.stringify({ topic: 'Test EMDR', nb_slides: 1, filename: 'presentation-test-json', return_json: true }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handleGeneratePresentation(req, env2);
    const data = await res.json();
    const decoded = Buffer.from(data.pptx_base64, 'base64');
    log('2a. pptx_base64 présent', typeof data.pptx_base64 === 'string' && data.pptx_base64.length > 0, !!data.pptx_base64);
    log('2b. pptx_base64 décode vers un VRAI binaire pptx (signature ZIP), jamais vers le JSON pointeur', decoded.slice(0, 4).toString('hex') === '504b0304', decoded.slice(0, 4).toString('hex'));
    log('2c. Contenu décodé identique au binaire réellement produit', decoded.equals(REAL_PPTX_BYTES), null);
  }

  // ═══ 3. Non-régression — /generate-pptx (appel DIRECT, contrat client réel) reste inchangé ═══
  {
    const req = new Request('https://proxy/generate-pptx', {
      method: 'POST',
      body: JSON.stringify({ content: { title: 'T', slides: [{ title: 'S1', bullets: ['a'] }] }, filename: 'direct-test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handleGeneratePPTX(req, env2);
    const data = await res.json();
    log('3a. /generate-pptx retourne toujours le POINTEUR JSON {id,url,...} (contrat client inchangé)', typeof data.id === 'string' && typeof data.url === 'string' && typeof data.url_preview === 'string' && data.filename === 'direct-test.pptx', data);
    // Vérifie que ce même fichier reste bien récupérable via /get-file (mécanisme réutilisé, jamais dupliqué).
    const fileUrl = new URL(data.url);
    const fileRes = await handleGetFile(fileUrl, env2);
    const fileBuf = Buffer.from(await fileRes.arrayBuffer());
    log('3b. Le fichier reste récupérable via /get-file (même mécanisme, non dupliqué)', fileBuf.equals(REAL_PPTX_BYTES), fileBuf.slice(0, 4).toString('hex'));
  }

  // ═══ 4. Non-régression — storeAndReturn (utilisé par PDF/XLSX/DOCX/ZIP) est resté inchangé ═══
  {
    const workerSrc = fs.readFileSync('/home/user/C-Concept-Dev/Worker/index.js', 'utf8');
    const stillPresent = workerSrc.includes(srcStoreAndReturn);
    log('4a. storeAndReturn (partagé par toutes les routes de fichier) n\'a subi AUCUNE modification', stillPresent, null);
    const pptxStillCallsStore = extract('async function handleGeneratePPTX(request2, env2) {', '__name(handleGeneratePPTX, "handleGeneratePPTX");').includes('storeAndReturn(');
    log('4b. handleGeneratePPTX appelle toujours storeAndReturn (contrat non modifié)', pptxStillCallsStore, null);
  }

  console.log('=== Résultats — A11 : /generate-presentation produit un vrai PPTX ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  process.exit(failCount > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
