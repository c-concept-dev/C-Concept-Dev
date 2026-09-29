// STUDIO CLINIQUE — CORRECTIF miniature "Mes créations" : preuve réelle que handleScreenshotSlide
// (Worker/index.js) transmet fidèlement fullPage à l'API Cloudflare Browser Rendering — true par
// défaut (comportement STRICTEMENT inchangé pour Item 58/export JPEG et Item 78/frames vidéo, qui
// n'envoient jamais ce champ), false quand explicitement demandé (adocCaptureAndPersistThumbnail,
// cf. studio-clinique-core.js) — cause confirmée du défaut de miniature (cf. rapport de lot) :
// fullPage:true systématique produisait une capture de la page ENTIÈRE d'un document, ensuite
// recadrée par le CSS autour de son centre vertical, jamais du bandeau titre+couverture en tête.
// Fonction extraite TEXTUELLEMENT de index.js (jamais réimplémentée), même patron que les autres
// tests Worker de ce dépôt.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function slice(startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `Bornes introuvables pour ${label} — index.js a changé de forme`);
  return source.slice(start, end);
}

const jsonHelpers = slice('function json(data, status = 200) {', '__name(jsonErr, "jsonErr");', 'json/jsonErr') + '__name(jsonErr, "jsonErr");\n';
const screenshotCode = slice('async function handleScreenshotSlide(request2, env2) {', '__name(handleScreenshotSlide, "handleScreenshotSlide");', 'handleScreenshotSlide')
  + '__name(handleScreenshotSlide, "handleScreenshotSlide");\n';

function loadModule(fetchImpl) {
  const CORS = { 'Access-Control-Allow-Origin': 'https://c-concept-dev.github.io' };
  const sandbox = { module: { exports: {} }, CORS, Response, console, fetch: fetchImpl, setTimeout, __name: (fn) => fn };
  vm.createContext(sandbox);
  vm.runInContext(`${jsonHelpers}\n${screenshotCode}\nmodule.exports = { handleScreenshotSlide };`, sandbox, { filename: 'thumbnail-fullpage-extract.js' });
  return sandbox.module.exports;
}

function makeRequest(bodyObj) {
  return { async json() { return bodyObj; } };
}

let failCount = 0;
function check(cond, label) {
  if (cond) { console.log('PASS ' + label); } else { console.log('FAIL ' + label); failCount++; }
}

(async () => {
  const env = { CF_ACCOUNT_ID: 'acct-test', CF_API_TOKEN: 'token-test' };

  // ── Test 1 : fullPage OMIS (comme le font Item 58/export JPEG et Item 78/frames vidéo, jamais
  // touchés par ce correctif) → true transmis à Cloudflare, comportement strictement inchangé. ──
  {
    let capturedBody = null;
    const { handleScreenshotSlide } = loadModule(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('FAKE_JPEG').buffer };
    });
    const res = await handleScreenshotSlide(makeRequest({ html: '<html><body>x</body></html>' }), env);
    check(res.status === 200, '1/5 — capture réussie (fullPage omis, comme Item 58/78)');
    check(capturedBody.screenshotOptions.fullPage === true, '2/5 — fullPage:true transmis à Cloudflare quand omis — comportement Item 58/78 STRICTEMENT inchangé');
  }

  // ── Test 2 : fullPage:false explicite (nouveau, adocCaptureAndPersistThumbnail) → false transmis
  // tel quel, jamais réinterprété. ──
  {
    let capturedBody = null;
    const { handleScreenshotSlide } = loadModule(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('FAKE_JPEG').buffer };
    });
    const res = await handleScreenshotSlide(makeRequest({ html: '<html><body>x</body></html>', fullPage: false }), env);
    check(res.status === 200, '3/5 — capture réussie (fullPage:false explicite)');
    check(capturedBody.screenshotOptions.fullPage === false, '4/5 — fullPage:false transmis fidèlement à Cloudflare, cause du défaut de miniature réellement corrigée');
  }

  // ── Test 3 : non-régression — width/height/quality par défaut et le contenu HTML transmis
  // restent inchangés par cet ajout. ──
  {
    let capturedBody = null;
    const { handleScreenshotSlide } = loadModule(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('FAKE_JPEG').buffer };
    });
    await handleScreenshotSlide(makeRequest({ html: '<html><body>y</body></html>' }), env);
    check(
      capturedBody.viewport.width === 1024 && capturedBody.viewport.height === 768 && capturedBody.screenshotOptions.quality === 90 && capturedBody.html === '<html><body>y</body></html>',
      '5/5 — non-régression : width/height/quality/html par défaut inchangés par l’ajout de fullPage'
    );
  }

  console.log('');
  if (failCount === 0) {
    console.log('=== TOUS LES TESTS CORRECTIF MINIATURE (fullPage, 5/5) PASSENT ===');
    process.exit(0);
  } else {
    console.log(`=== ${failCount} ÉCHEC(S) ===`);
    process.exit(1);
  }
})();
