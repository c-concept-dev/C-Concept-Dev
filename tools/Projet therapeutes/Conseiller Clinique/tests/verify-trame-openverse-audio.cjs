const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const base = path.join(__dirname, '..');
const tone = fs.readFileSync(path.join(__dirname, 'atelier-test-tone.mp3'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'atelier-diapos.html';
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], openverseRequests = [], freesoundRequests = [];
  page.on('pageerror', error => errors.push(error.stack || String(error)));
  await page.route('https://clone-proxy.11drumboy11.workers.dev/trame/audio/search**', async route => {
    freesoundRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{
      id: 'freesound-test', provider: 'Freesound', title: 'Pluie sous les feuilles', creator: 'Auteur Freesound', durationSeconds: 1.5,
      previewUrl: 'https://audio.example.test/freesound-pluie.mp3', downloadUrl: 'https://audio.example.test/freesound-pluie.mp3',
      sourceUrl: 'https://freesound.org/s/123/', license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      licenseLabel: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Pluie sous les feuilles — Auteur Freesound — CC0'
    }] }) });
  });
  await page.route('https://api.openverse.org/v1/audio/**', async route => {
    openverseRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{
      id: 'ambiance-test', title: 'Pluie douce au jardin', creator: 'Créatrice test', duration: 1500,
      url: 'https://audio.example.test/pluie.mp3', foreign_landing_url: 'https://source.example.test/pluie',
      license: 'cc0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'Pluie douce au jardin — Créatrice test — CC0'
    }] }) });
  });
  await page.route('https://audio.example.test/**', route => route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: { 'access-control-allow-origin': '*' }, body: tone }));
  await page.goto(`http://127.0.0.1:${server.address().port}/atelier-diapos.html`, { waitUntil: 'networkidle' });
  await page.locator('#am-workbench').waitFor({ state: 'visible' });
  await page.locator('[data-jump="sources"]').click();
  await page.locator('#am-audio-library').evaluate(element => { element.open = true; });
  await page.locator('#am-audio-search').fill('pluie douce');
  await page.locator('#am-audio-search-form button[type="submit"]').click();
  await page.locator('article[data-ambient-id="freesound-test"]').waitFor();
  await page.locator('article[data-ambient-id="openverse-ambiance-test"]').waitFor();
  assert.equal(freesoundRequests.length, 1, 'une recherche Freesound est envoyée au proxy sécurisé');
  assert.equal(openverseRequests.length, 1, 'une recherche complémentaire Openverse est envoyée');
  const freesoundRequestUrl = new URL(freesoundRequests[0]);
  assert.equal(freesoundRequestUrl.searchParams.get('q'), 'pluie douce', 'le texte français est confié au Worker Cloudflare pour traduction');
  assert.equal(freesoundRequestUrl.searchParams.get('lang'), 'fr', 'Trame indique au Worker que la recherche est saisie en français');
  const requestUrl = new URL(openverseRequests[0]);
  assert.equal(requestUrl.searchParams.get('q'), 'rain ambience', 'la recherche française courante est traduite pour élargir les résultats');
  assert.equal(requestUrl.searchParams.get('license'), 'cc0,pdm,by', 'les résultats sont limités aux licences ouvertes retenues');
  const freesoundResult=page.locator('article[data-ambient-id="freesound-test"]');
  await freesoundResult.locator('[data-ambient-action="preview"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ambient-id="freesound-test"] [data-ambient-action="preview"]')?.textContent.includes('Arrêter'));
  await freesoundResult.locator('[data-ambient-action="preview"]').click();
  assert.match(await freesoundResult.locator('[data-ambient-action="preview"]').innerText(), /Écouter/, 'le même bouton arrête la préécoute');
  await freesoundResult.locator('[data-ambient-action="add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-source-lane="music"] .am-source-track').length === 1);
  const track = page.locator('[data-source-lane="music"] .am-source-track');
  assert.match(await track.innerText(), /Pluie-sous-les-feuilles\.mp3/i, 'le son Freesound devient une vraie piste de l’annexe Musique');
  assert.match(await track.locator('.am-source-credit').innerText(), /Auteur Freesound.*CC0/i, 'le crédit et la licence restent visibles avec la piste');
  assert.equal(await track.locator('.am-source-credit a').count(), 2, 'les liens vers la source et la licence sont conservés');
  assert.match(await track.locator('[data-source-action="place"]').innerText(), /Ambiance/, 'la destination Ambiance est explicite pour une novice');
  await track.locator('[data-source-action="place"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-master-lane="ambience"] .am-clip[data-kind="ambience"]').length === 1);
  await page.locator('[data-jump="master"]').click();
  const ambienceClip=page.locator('[data-master-lane="ambience"] .am-clip[data-kind="ambience"]').first();
  await ambienceClip.click();
  await page.locator('.am-clip-integrated-tools [data-duplicate]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-master-lane="ambience"] .am-clip[data-kind="ambience"]').length === 2);
  assert.equal(await page.locator('[data-master-lane="ambience"] .am-clip[data-kind="ambience"]').count(), 2, 'Dupliquer crée une copie indépendante sur Ambiance Master');
  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log('OK — Freesound + Openverse, préécoute, ajout à l’annexe Musique, placement Ambiance et duplication vérifiés.');
})().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
