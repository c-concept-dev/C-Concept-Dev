// STUDIO CLINIQUE — Item 75, nettoyage de la dette, Sujet 2 : preuve réelle que
// handleGenerateCarrouselPPTX (Worker/index.js) produit un vrai fichier .pptx avec position et
// ordre de calque fidèles à doc.blocks[] (même source que l'export PDF dédié, jamais une seconde
// extraction). Fonction extraite TEXTUELLEMENT de Worker/index.js (avec le bundle PptxGenJS
// dont elle dépend, même convention que les autres tests Worker de ce dépôt : jamais réimplémentée
// ni mockée — seul le PptxGenJS RÉEL, celui qui tourne en production, génère le fichier testé ici).
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const JSZip = require('jszip');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `Bornes introuvables : "${startMarker}" → "${endMarker}"`);
  return source.slice(start, end);
}
// Prélude d'aides esbuild (__name/__commonJS/__toESM/etc., lignes 1-45 du fichier réel) : le
// bundle PptxGenJS (comme le bundle exceljs juste à côté, jamais isolé du reste du fichier par
// l'outil de build) s'appuie dessus au chargement — jamais réimplémenté ici, copié tel quel.
const PRELUDE_MARKER = 'var __publicField = (obj, key, value) => {\n  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);\n  return value;\n};\n';
const preludeEnd = source.indexOf(PRELUDE_MARKER) + PRELUDE_MARKER.length;
assert.ok(preludeEnd > PRELUDE_MARKER.length, 'Prélude esbuild introuvable — le fichier a peut-être changé de forme');
const prelude = source.slice(0, preludeEnd);
// Le bundle PptxGenJS complet précède handleGenerateCarrouselPDF/PPTX dans le fichier — extrait en
// un seul bloc contigu jusqu'à la fin de handleGenerateCarrouselPPTX (marqueur __name() qui la
// suit immédiatement) — jamais le chemin LEGACY (handleGeneratePPTX), non concerné par ce test.
const code = prelude + extract('// node_modules/pptxgenjs/dist/pptxgen.es.js', '__name(handleGenerateCarrouselPPTX, "handleGenerateCarrouselPPTX");') + '__name(handleGenerateCarrouselPPTX, "handleGenerateCarrouselPPTX");';

let capturedBuffer = null;
const context = vm.createContext({
  Response, Request, console, btoa, atob, TextEncoder, TextDecoder, Object, Array, Uint8Array, Proxy, crypto,
  // exceljs (handleGenerateXLSX, chemin non concerné par ce test) est bundlé physiquement à côté
  // de PptxGenJS dans ce fichier — stub minimal, jamais réellement exercé par ce test (aucun appel
  // à handleGenerateXLSX ici), seulement nécessaire pour que le fichier réel s'évalue sans erreur.
  require_exceljs_min: () => ({}),
  // PptxGenJS a RÉELLEMENT besoin de JSZip pour construire le zip OOXML — jamais un stub vide ici
  // (contrairement à exceljs ci-dessus, jamais exercé) : le vrai module 'jszip' déjà requis par ce
  // test lui-même (pour inspecter le résultat) le sert aussi ici, un seul et même JSZip réel.
  require_jszip_min: () => JSZip,
  // fs (chemin Node "écrire un fichier sur disque", jamais emprunté ici : sortie demandée en
  // arraybuffer, cf. handleGenerateCarrouselPPTX) — stub minimal, jamais réellement exercé.
  require_fs: () => ({}),
  // https (chemin Node "télécharger une image distante par URL", jamais emprunté ici : nos
  // images de test passent par assetId/R2, jamais par une URL http(s) externe) — stub minimal.
  require_https: () => ({}),
  init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process: () => {},
  init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console: () => {},
  init_performance2: () => {},
  jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
  json: (obj) => new Response(JSON.stringify(obj)),
});
vm.runInContext(code, context);

const EMU_PER_PX = 9525; // constante standard CSS-px→EMU à 96dpi, indépendante de PptxGenJS

(async () => {
  // Deux cartes, positions et calques volontairement différents (exigé par le CDC de ce lot).
  const cards = [
    {
      id: 'card-1', style: { x: 0, y: 0, width: 500, height: 400 },
      content: {
        title: 'Carte Un',
        blocks: [
          // zIndex 10 > 5 : "Titre Un" doit apparaître APRÈS "Paragraphe Un" dans le XML (ordre de calque).
          { id: 'h1', type: 'heading', content: { text: 'Titre Un', level: 1 }, style: { x: 20, y: 20, width: 200, height: 40, zIndex: 10 } },
          { id: 'p1', type: 'paragraph', content: { text: 'Paragraphe Un' }, style: { x: 20, y: 80, width: 200, height: 60, zIndex: 5 } },
        ],
      },
    },
    {
      id: 'card-2', style: { x: 550, y: 100, width: 400, height: 300 },
      content: {
        title: 'Carte Deux',
        blocks: [
          { id: 'q2', type: 'quote', content: { text: 'Citation Deux' }, style: { x: 10, y: 10, width: 150, height: 50, zIndex: 1 } },
        ],
      },
    },
  ];

  // storeAndReturn (la VRAIE fonction, incluse dans l'extraction juste avant handleGenerate
  // CarrouselPDF/PPTX) écrit dans env2.CLONE_KV — jamais mockée elle-même (contrairement au 1er
  // essai de ce test) : seul son binding KV est un faux, en mémoire, qui capture le buffer réel
  // écrit tel quel, pour l'inspecter ci-dessous.
  const fakeKV = { put: async (key, value) => { if (key.startsWith('file:')) capturedBuffer = value; } };
  const req = new Request('https://test.local/', { method: 'POST', body: JSON.stringify({ cards, filename: 'test-carrousel' }) });
  const resp = await context.handleGenerateCarrouselPPTX(req, { CLONE_KV: fakeKV });
  if (resp.status !== 200) console.log('BODY:', await resp.clone().text());
  assert.equal(resp.status, 200, 'La génération doit réussir');
  assert.ok(capturedBuffer, 'storeAndReturn doit avoir reçu le buffer PPTX réel');
  const respData = await resp.json();
  assert.equal(respData.filename, 'test-carrousel.pptx');
  console.log('PASS 1/6 — génération réussie, fichier .pptx réel produit (', capturedBuffer.byteLength, 'octets)');

  // ── Inspection RÉELLE du XML interne (un .pptx est un zip OOXML) ──
  const zip = await JSZip.loadAsync(Buffer.from(capturedBuffer));
  const presentationXml = await zip.file('ppt/presentation.xml').async('string');
  const sldSzMatch = presentationXml.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
  assert.ok(sldSzMatch, 'presentation.xml doit déclarer sldSz');
  assert.equal(Number(sldSzMatch[1]), 1024 * EMU_PER_PX, 'Largeur de diapositive doit être 1024px convertis en EMU — même canevas que Item 75 Phase 1, jamais une valeur distincte');
  assert.equal(Number(sldSzMatch[2]), 768 * EMU_PER_PX, 'Hauteur de diapositive doit être 768px convertis en EMU');
  console.log('PASS 2/6 — dimensions de la présentation = canevas 1024×768px réel (', sldSzMatch[1], 'x', sldSzMatch[2], 'EMU), même canevas que le positionnement Item 75');

  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.equal(slideFiles.length, 2, 'Une carte = une diapositive : 2 cartes doivent produire exactement 2 diapositives');
  console.log('PASS 3/6 — une carte = une diapositive, confirmé (2 cartes → 2 fichiers slide*.xml réels dans le zip)');

  const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.ok(slide1.includes('Carte Un'), 'Le titre de la carte 1 doit être présent dans sa diapositive');
  assert.ok(slide1.includes('Titre Un') && slide1.includes('Paragraphe Un'), 'Les deux éléments imbriqués de la carte 1 doivent être présents');

  // Position ABSOLUE attendue de "Titre Un" (nested x=20,y=20 relatif à la carte, carte à x=0,y=0
  // sur le canevas) = (20,20)px → EMU. Vérifie que le référentiel carte+décalage est bien appliqué
  // (même référentiel que côté client, ctx.el.parentElement — jamais une seconde convention).
  const expectedX = 20 * EMU_PER_PX, expectedY = 20 * EMU_PER_PX;
  assert.ok(slide1.includes(`x="${expectedX}"`) && slide1.includes(`y="${expectedY}"`),
    `La position de "Titre Un" doit être exactement (${expectedX},${expectedY}) EMU (carte x=0,y=0 + décalage nested x=20,y=20)`);
  console.log('PASS 4/6 — position réelle fidèle : carte(0,0) + élément imbriqué(20,20) = ' + expectedX + ',' + expectedY + ' EMU, mesuré dans le XML réel, pas supposé');

  // Ordre de calque : "Paragraphe Un" (zIndex 5) doit apparaître AVANT "Titre Un" (zIndex 10) dans
  // le XML — même ordre croissant que adocNestedBlocksSortedByLayer côté client (Item 75 Phase 2).
  const idxParagraphe = slide1.indexOf('Paragraphe Un');
  const idxTitre = slide1.indexOf('Titre Un');
  assert.ok(idxParagraphe > 0 && idxTitre > 0 && idxParagraphe < idxTitre,
    'zIndex 5 (Paragraphe) doit être peint AVANT zIndex 10 (Titre) — ordre de calque fidèle');
  console.log('PASS 5/6 — ordre de calque fidèle : zIndex croissant respecté dans le XML réel (Paragraphe avant Titre)');

  const slide2 = await zip.file('ppt/slides/slide2.xml').async('string');
  assert.ok(slide2.includes('Carte Deux') && slide2.includes('Citation Deux'), 'La carte 2 (position/contenu différents) doit être fidèlement présente sur sa propre diapositive');
  // Carte 2 à x=550,y=100 sur le canevas + élément imbriqué à x=10,y=10 relatif = (560,110)px absolus.
  const expectedX2 = 560 * EMU_PER_PX, expectedY2 = 110 * EMU_PER_PX;
  assert.ok(slide2.includes(`x="${expectedX2}"`) && slide2.includes(`y="${expectedY2}"`),
    `La position de "Citation Deux" doit être (${expectedX2},${expectedY2}) EMU (carte x=550,y=100 + décalage nested x=10,y=10)`);
  console.log('PASS 6/6 — deuxième carte (position de carte NON nulle, cf. CDC) également fidèle : ' + expectedX2 + ',' + expectedY2 + ' EMU mesuré');

  console.log('\n=== TOUS LES TESTS ITEM 75 DETTE — SUJET 2 (EXPORT PPTX) PASSENT (6/6) ===');
})().catch(err => { console.error('ÉCHEC :', err); process.exit(1); });
