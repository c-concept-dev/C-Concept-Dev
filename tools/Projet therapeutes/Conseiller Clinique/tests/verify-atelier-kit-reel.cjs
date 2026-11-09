const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const base = path.join(__dirname, '..');
const kit = process.env.ATELIER_KIT || '/Users/christophebonnet/Downloads/KIT-TRANSFERT-ATELIER-DIAPOS-2026-11-09.zip';
assert.ok(fs.existsSync(kit), `Kit réel introuvable : ${kit}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-diapos-kit-'));
const extraction = spawnSync('unzip', ['-q', kit, '-d', temp], { encoding: 'utf8' });
assert.equal(extraction.status, 0, extraction.stderr || 'Extraction du kit impossible');

const presentation = path.join(temp, 'references', 'presentation-interactive.html');
const mediaDir = path.join(temp, 'media-tests');
const mp3 = fs.readdirSync(mediaDir).filter((name) => /\.mp3$/i.test(name)).sort().map((name) => path.join(mediaDir, name));
assert.ok(fs.existsSync(presentation), 'Présentation réelle absente du kit');
assert.equal(mp3.length, 5, 'Le kit doit fournir exactement cinq MP3');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'atelier-diapos.html';
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
let browser;

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('requestfailed', (request) => errors.push(`Requête échouée : ${request.url()} — ${request.failure()?.errorText || 'raison inconnue'}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/atelier-diapos.html`, { waitUntil: 'networkidle' });

  const snapdomProbe = await page.evaluate(async () => Promise.race([
    import(new URL('vendor/snapdom.mjs', location.href).href).then((mod) => typeof mod.snapdom),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 10_000)),
  ]));
  assert.equal(snapdomProbe, 'function', 'Le moteur SnapDOM autonome doit se charger avant le rendu réel');

  await page.locator('#cv-fichier').setInputFiles(presentation);
  let images = 0;
  for (let elapsed = 0; elapsed < 300_000 && images < 50; elapsed += 5_000) {
    await page.waitForTimeout(5_000);
    images = await page.locator('#cv-vignettes figure').count();
    const progress = await page.locator('#cv-avancement-texte').textContent();
    const notice = await page.locator('#cv-message').textContent();
    if (elapsed % 30_000 === 0) {
      const diagnostic = await page.evaluate(() => ({
        fonts: document.fonts && document.fonts.status,
        scene: !!document.querySelector('[data-atelier-capture]'),
        sceneHtml: document.querySelector('[data-atelier-capture]')?.innerHTML.length || 0,
        resources: performance.getEntriesByType('resource').map((entry) => entry.name),
      }));
      console.log(`Rendu réel : ${images} vignettes — ${progress || notice} — ${JSON.stringify(diagnostic)}`);
    }
    if (/impossible|invalide|ne contient pas|n.est pas un export/i.test(`${progress} ${notice}`)) break;
  }
  assert.ok(images >= 50, `Le rendu réel est bloqué : ${await page.locator('#cv-message').textContent()} — ${await page.locator('#cv-avancement-texte').textContent()}`);
  images = await page.locator('#cv-vignettes figure').count();
  assert.equal(images, 64, 'La présentation réelle doit produire ses 64 étapes visuelles');
  assert.match(await page.locator('#cv-message').textContent(), /Présentation chargée/);

  await page.locator('#am-add-voice').setInputFiles(mp3.slice(0, 3));
  await page.waitForFunction(() => document.querySelectorAll('[data-import-lane="voice"] .am-source-track').length === 3, null, { timeout: 120_000 });
  await page.locator('#am-add-music').setInputFiles(mp3.slice(3));
  await page.waitForFunction(() => document.querySelectorAll('[data-import-lane="music"] .am-source-track').length === 2, null, { timeout: 120_000 });

  assert.equal(await page.locator('[data-import-lane="voice"] .am-source-track').count(), 3);
  assert.equal(await page.locator('[data-import-lane="music"] .am-source-track').count(), 2);
  assert.equal(await page.locator('[data-import-lane="voice"] .am-source-clip').count(), 3);
  assert.equal(await page.locator('[data-import-lane="music"] .am-source-clip').count(), 2);
  assert.equal(await page.locator('#am-step-count').textContent(), '64');
  assert.deepEqual(errors, []);

  await browser.close();
  server.close();
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`PASS kit réel : ${images} images interactives et ${mp3.length} MP3 importés (3 voix, 2 musiques)`);
})().catch((error) => {
  if (browser) browser.close().catch(() => {});
  server.close();
  fs.rmSync(temp, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
