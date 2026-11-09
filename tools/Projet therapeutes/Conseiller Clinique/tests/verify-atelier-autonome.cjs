const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const base = path.join(__dirname, '..');
const target = path.join(base, 'atelier-diapos.html');
const html = fs.readFileSync(target, 'utf8');
assert.ok(Buffer.byteLength(html) < 100_000, 'La page autonome ne doit pas réembarquer l’ancienne application');
assert.ok(html.includes('data-atelier-diapos-standalone="true"'), 'Le contexte autonome doit être explicite');
['cc-login-screen', 'cc-landing', 'assistdoc-screen', 'masquerLApplication'].forEach((mot) => {
  assert.equal(html.includes(mot), false, `Ancienne interface encore présente : ${mot}`);
});
['studio-clinique-core.js', 'atelier-images.js', 'atelier-montage.js', 'atelier-diapos-base.js'].forEach((mot) => {
  assert.ok(html.includes(mot), `Dépendance fonctionnelle absente : ${mot}`);
});

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'atelier-diapos.html';
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || String(e)));
  await page.addInitScript(() => {
    window.__anciensEcransVus = [];
    new MutationObserver(() => {
      document.querySelectorAll('#cc-login-screen,#cc-landing,#assistdoc-screen').forEach((el) => window.__anciensEcransVus.push(el.id));
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/atelier-diapos.html`, { waitUntil: 'networkidle' });
  await page.locator('#am-workbench').waitFor({ state: 'visible' });
  assert.equal(await page.title(), 'Trame — images, voix, rythme');
  assert.deepEqual(await page.evaluate(() => window.__anciensEcransVus), []);
  assert.equal(await page.locator('text=Studio Clinique').count(), 0);
  assert.equal(await page.locator('#cc-login-screen,#cc-landing,#assistdoc-screen').count(), 0);
  assert.equal(await page.evaluate(() => typeof window.adocPresentStepList), 'function');
  assert.equal(await page.evaluate(() => typeof window.AtelierImages?.rendreImages), 'function');
  assert.equal(await page.evaluate(() => typeof window.AtelierMuxer), 'object');
  assert.equal(await page.locator('#cv-importer').isVisible(), true);
  assert.equal(await page.locator('#cv-mp4').isVisible(), true);
  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log('OK — page autonome, aucun écran historique observé, moteurs et banc disponibles.');
})().catch((err) => { server.close(); console.error(err); process.exitCode = 1; });
