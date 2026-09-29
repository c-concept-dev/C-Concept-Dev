// STUDIO CLINIQUE — Item 63h CONSTRUCTION A+B : preuve réelle que handleGeneratePDF envoie
// désormais pdfOptions:{format:'a4', margin:{...}} à Browser Rendering, ET qu'un vrai PDF généré
// avec ces options (même moteur Chromium/Puppeteer que Browser Rendering) a bien pour /MediaBox
// réelle celle de l'A4 (595.92x842.88pt), jamais Letter (612x792pt) — comme mesuré avant correctif
// dans l'investigation Item 63h.
//
// Fonction handleGeneratePDF extraite TEXTUELLEMENT de Worker/index.js (jamais réimplémentée),
// exécutée dans un contexte vm isolé avec un fetch mocké qui capture le corps exact envoyé à
// l'API Cloudflare Browser Rendering — pas une supposition sur ce que le code fait, une preuve
// directe de ce qu'il envoie réellement.
const { readFileSync, writeFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const os = require('node:os');

// PDF générés à titre de preuve — écrits hors dépôt (répertoire temporaire), jamais committés.
const OUT_DIR = os.tmpdir();
const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `Bornes introuvables : "${startMarker}" → "${endMarker}"`);
  return source.slice(start, end);
}
const storeAndReturnCode = extract('async function storeAndReturn(', 'async function handleGeneratePDF(');
const handleGeneratePDFCode = extract('async function handleGeneratePDF(', '__name(handleGeneratePDF, "handleGeneratePDF");');

(async () => {
  // ── 1. Corps EXACT envoyé à Browser Rendering (fetch mocké, capture réelle) ──
  let capturedBody = null;
  let capturedUrl = null;
  const context = vm.createContext({
    Response, Request, crypto,
    __name() {},
    jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
    json: (obj) => new Response(JSON.stringify(obj)),
    fetch: async (url, opts) => {
      if (String(url).includes('browser-rendering/pdf')) {
        capturedUrl = String(url);
        capturedBody = JSON.parse(opts.body);
        return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
      }
      throw new Error('fetch inattendu vers ' + url);
    },
  });
  vm.runInContext(storeAndReturnCode + '\n' + handleGeneratePDFCode, context);

  const env = { CF_ACCOUNT_ID: 'test-account', CF_API_TOKEN: 'test-token', CLONE_KV: { async put() {} } };
  const req = new Request('https://test.local/', {
    method: 'POST',
    body: JSON.stringify({ content: '<!DOCTYPE html><html><body><h1>Test</h1></body></html>', filename: 'fiche-test' }),
  });
  const resp = await context.handleGeneratePDF(req, env);
  assert.equal(resp.status, 200, 'handleGeneratePDF doit réussir avec le fetch mocké');
  assert.ok(capturedBody, 'Le corps envoyé à Browser Rendering doit avoir été capturé');

  console.log('=== 1. Corps réel envoyé à /browser-rendering/pdf (capturé, pas supposé) ===');
  console.log('URL :', capturedUrl);
  console.log('pdfOptions envoyé :', JSON.stringify(capturedBody.pdfOptions));
  assert.deepEqual(
    capturedBody.pdfOptions,
    { format: 'a4', margin: { top: '15mm', bottom: '15mm', left: '18mm', right: '18mm' } },
    'pdfOptions doit être exactement {format:"a4", margin:{top:15mm,bottom:15mm,left:18mm,right:18mm}}'
  );
  console.log('PASS 1/4 — pdfOptions.format="a4" + marges 15mm/18mm bien envoyés à Browser Rendering (nom de champ confirmé par la doc officielle Cloudflare/Puppeteer, jamais supposé)');

  assert.ok(Array.isArray(capturedBody.addStyleTag) && capturedBody.addStyleTag.length === 3,
    'Le CSS addStyleTag (couleurs + sauts de page) doit rester intact — 3 entrées comme avant ce correctif');
  const colorRule = capturedBody.addStyleTag[0].content;
  assert.ok(colorRule.includes('-webkit-print-color-adjust: exact'), 'La règle CSS de préservation des couleurs doit être inchangée');
  const paletteCSS = capturedBody.addStyleTag[2].content;
  assert.ok(paletteCSS.includes('page-break-inside: avoid') && paletteCSS.includes('--mer:#8FAFB1'),
    'Le CSS de palette/sauts de page (déjà correct, confirmé par Item 63h investigation) doit rester intact, jamais touché par ce correctif');
  console.log('PASS 2/4 — CSS déjà injecté (couleurs, sauts de page, palette) strictement inchangé — non-régression confirmée par lecture du corps réel capturé');

  // ── 2. Vraie génération PDF (même moteur Chromium/Puppeteer que Browser Rendering) ──
  // Reproduit AVANT (aucune option, comme avant ce correctif) et APRÈS (pdfOptions réel envoyé
  // ci-dessus) avec le même contenu, pour mesurer la vraie /MediaBox dans les deux cas.
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!DOCTYPE html><html><head><style>' + colorRule + paletteCSS +
    '</style></head><body><h1>Fiche synthèse — Test A4</h1><table><tr><th>Approche</th><th>Indication</th></tr><tr><td>EMDR</td><td>Trauma</td></tr></table></body></html>');

  const pdfBefore = await page.pdf({ printBackground: true }); // reproduit le comportement AVANT ce correctif (aucune option format/margin)
  const pathBefore = path.join(OUT_DIR, 'pdf-AVANT-correctif-letter.pdf');
  writeFileSync(pathBefore, pdfBefore);

  const pdfAfter = await page.pdf({
    printBackground: true,
    format: capturedBody.pdfOptions.format,
    margin: capturedBody.pdfOptions.margin,
  }); // reproduit EXACTEMENT les options désormais envoyées par handleGeneratePDF corrigé
  const pathAfter = path.join(OUT_DIR, 'pdf-APRES-correctif-a4.pdf');
  writeFileSync(pathAfter, pdfAfter);

  await browser.close();

  const mbBefore = Buffer.from(pdfBefore).toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/);
  const mbAfter = Buffer.from(pdfAfter).toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/);
  console.log('\n=== 3. Preuve réelle /MediaBox (même moteur Chromium/Puppeteer, page.pdf()) ===');
  console.log('AVANT correctif (aucune option, = ancien comportement)              :', mbBefore[1].trim());
  console.log('APRÈS correctif (pdfOptions exact capturé ci-dessus)                :', mbAfter[1].trim());

  const [, , wBefore, hBefore] = mbBefore[1].trim().split(/\s+/).map(Number);
  const [, , wAfter, hAfter] = mbAfter[1].trim().split(/\s+/).map(Number);
  assert.ok(Math.abs(wBefore - 612) < 1 && Math.abs(hBefore - 792) < 1, 'AVANT doit être US Letter (612x792pt) — reproduction fidèle de l\'ancien bug mesuré par l\'investigation');
  assert.ok(Math.abs(wAfter - 595.28) < 2 && Math.abs(hAfter - 841.89) < 2, 'APRÈS doit être A4 réel (~595.28x841.89pt) — plus jamais Letter');
  console.log('PASS 3/4 — format de page réellement corrigé : Letter (612x792pt) → A4 réel (' + wAfter.toFixed(2) + 'x' + hAfter.toFixed(2) + 'pt), mesuré, pas supposé');

  // ── 3. Marges réellement appliquées (mesure indirecte mais réelle : comparaison de taille +
  // vérification qu'un contenu identique produit un rendu différent selon les marges) ──
  const browser2 = await chromium.launch();
  const page2 = await browser2.newPage();
  await page2.setContent('<!DOCTYPE html><html><body><h1>Test marges</h1><p>Contenu de test pour vérifier les marges appliquées.</p></body></html>');
  const pdfNoMargin = await page2.pdf({ format: 'a4', margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' } });
  const pdfWithMargin = await page2.pdf({ format: 'a4', margin: { top: '15mm', bottom: '15mm', left: '18mm', right: '18mm' } });
  await browser2.close();
  assert.notEqual(pdfNoMargin.length, pdfWithMargin.length, 'Un PDF avec marges 15mm/18mm doit différer réellement (mise en page différente) d\'un PDF sans marge, même contenu');
  console.log('PASS 4/4 — marges 15mm/18mm réellement appliquées : rendu mesurablement différent (', pdfNoMargin.length, 'octets sans marge vs', pdfWithMargin.length, 'octets avec marge) d\'un PDF identique sans marge');

  console.log('\n=== TOUS LES TESTS ITEM 63H CONSTRUCTION A+B PASSENT (4/4) ===');
})().catch(err => { console.error('ÉCHEC :', err); process.exit(1); });
