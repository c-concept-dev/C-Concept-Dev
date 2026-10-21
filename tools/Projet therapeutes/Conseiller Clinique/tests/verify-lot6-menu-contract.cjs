const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');
const root = path.join(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.setHeader('content-type', path.extname(file) === '.js' ? 'text/javascript' : 'text/html; charset=utf-8');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1272, height: 900 } });
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/studio-clinique.html?atelier-local=1`);
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function');
    const opened = await page.evaluate(async doc => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.lot6 = { name: doc.title, _adocGenerationEngine: 'structured', _adocStructuredDoc: doc,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
      return window.adocOpenWorkspace('lot6');
    }, PRESENTATION);
    assert.ok(opened, 'workspace opened');
    assert.equal(await page.locator('#cc-ws-save-btn').isVisible(), true, 'Sauvegarder always visible');
    assert.equal(await page.locator('#cc-ws-file-menu-trigger').count(), 1, 'Fichier menu trigger');
    assert.equal(await page.locator('#cc-ws-export-menu-trigger').count(), 1, 'Exporter menu trigger');
    assert.equal(await page.locator('#cc-ws-export-btn').isVisible(), false, 'export action hidden until menu opens');
    await page.locator('#cc-ws-export-menu-trigger').click();
    assert.equal(await page.locator('#cc-ws-export-btn').isVisible(), true, 'export action appears in menu');
    assert.equal(await page.locator('#cc-ws-export-menu-trigger').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#cc-ws-export-menu-trigger').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cc-ws-export-menu-trigger');
    console.log('PASS verify-lot6-menu-contract');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
