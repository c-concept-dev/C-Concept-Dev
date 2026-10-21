// Q6 : contrôle navigateur de la barre et des menus. Remplace le contrat « tous visibles ».
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
  let count = 0;
  try {
    for (const kind of ['presentation', 'carrousel', 'legacy']) for (const width of [1024, 1272, 1440]) for (const saved of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/studio-clinique.html?atelier-local=1`);
      await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function');
      assert.equal(await page.evaluate(async ({ kind, saved, doc }) => {
        const art = kind === 'legacy'
          ? { name: 'Document ancien', html: '<h1>Document ancien</h1><p>Texte de contrôle.</p>', _adocGenerationEngine: 'legacy-html', _adocDocumentKind: 'fiche', _adocCapabilities: { workspace: true, persist: true, export: true } }
          : { name: doc.title, _adocGenerationEngine: 'structured', _adocStructuredDoc: { ...doc, documentKind: kind }, _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
        if (saved) art._adocClinicalDocumentId = 'lot6-document-enregistre';
        window._adocArtifacts = window._adocArtifacts || {};
        window._adocArtifacts.lot6 = art;
        return window.adocOpenWorkspace('lot6');
      }, { kind, saved, doc: PRESENTATION }), true, `${kind} opens`);
      for (const id of ['cc-ws-title', 'cc-ws-badge', 'cc-ws-status', 'cc-ws-save-status', 'cc-ws-save-btn', 'cc-ws-panel-toggle-btn', 'cc-ws-close-btn', 'cc-ws-file-menu-trigger', 'cc-ws-export-menu-trigger'])
        assert.equal(await page.locator('#' + id).isVisible(), true, `${kind} ${width} ${saved}: ${id} visible`);
      assert.equal(await page.locator('#cc-ws-panel').isVisible(), true, 'sources initially visible on desktop');
      await page.locator('#cc-ws-panel-toggle-btn').click();
      assert.equal(await page.locator('#cc-ws-panel').isVisible(), false, 'sources hidden by toggle');
      assert.equal(await page.locator('#cc-ws-panel-toggle-btn').getAttribute('aria-expanded'), 'false');
      await page.locator('#cc-ws-panel-toggle-btn').click();
      assert.equal(await page.locator('#cc-ws-panel').isVisible(), true, 'sources restored by toggle');
      assert.equal(await page.locator('#cc-ws-present-btn').isVisible(), kind === 'presentation');
      assert.equal(await page.locator('#cc-ws-export-btn').isVisible(), false);
      const geo = await page.evaluate(() => {
        const bar = document.querySelector('.cc-ws-topbar');
        const boxes = [...bar.children].map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
        const rows = [];
        for (const r of boxes) { const center = Math.round((r.top + r.bottom) / 2); if (!rows.some(x => Math.abs(x - center) <= 14)) rows.push(center); }
        return { overflow: bar.scrollWidth - bar.clientWidth, left: Math.min(...boxes.map(r => r.left)), right: Math.max(...boxes.map(r => r.right)), rows: rows.length };
      });
      assert.ok(geo.overflow <= 1 && geo.left >= -1 && geo.right <= width + 1, `${kind} ${width} ${saved} overflow ${JSON.stringify(geo)}`);
      assert.ok(geo.rows <= (width >= 1200 ? 1 : 2), `${kind} ${width} ${saved} rows ${JSON.stringify(geo)}`);
      await page.locator('#cc-ws-file-menu-trigger').click();
      assert.equal(await page.locator('#cc-ws-save-as-btn').isVisible(), true);
      assert.equal(await page.locator('#cc-ws-delete-btn').isVisible(), saved);
      assert.equal(await page.locator('#cc-ws-file-menu-trigger').getAttribute('aria-expanded'), 'true');
      await page.locator('#cc-ws-export-menu-trigger').click();
      assert.equal(await page.locator('#cc-ws-file-menu-trigger').getAttribute('aria-expanded'), 'false', 'one menu open');
      for (const [id, expected] of Object.entries({
        'cc-ws-export-btn': true, 'cc-ws-export-jpeg-btn': kind === 'carrousel',
        'cc-ws-export-pptx-carrousel-btn': kind === 'carrousel',
        'cc-ws-export-pdf-carrousel-btn': kind !== 'legacy',
        'cc-ws-print-presentation-btn': kind === 'presentation',
        'cc-ws-export-standalone-presentation-btn': kind === 'presentation' }))
        assert.equal(await page.locator('#' + id).isVisible(), expected, `${kind}: ${id}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#cc-ws-export-menu-trigger').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cc-ws-export-menu-trigger', 'Escape focus');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'menuitem', 'arrow opens');
      await page.keyboard.press('End');
      assert.equal(await page.evaluate(() => document.activeElement.id), kind === 'presentation'
        ? 'cc-ws-export-standalone-presentation-btn' : kind === 'carrousel'
          ? 'cc-ws-export-pptx-carrousel-btn' : 'cc-ws-export-btn', 'End moves to last item');
      await page.keyboard.press('Escape');
      await page.locator('#cc-ws-file-menu-trigger').click();
      await page.locator('#cc-ws-title').click();
      assert.equal(await page.locator('#cc-ws-file-menu-trigger').getAttribute('aria-expanded'), 'false', 'outside click');
      await page.locator('#cc-ws-file-menu-trigger').focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#cc-workspace').evaluate(el => el.classList.contains('open')), false,
        'Escape from a closed menu retains the workspace shortcut');
      await page.close(); count++;
    }
    const mobile = await browser.newPage({ viewport: { width: 640, height: 900 } });
    await mobile.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    await mobile.goto(`http://127.0.0.1:${server.address().port}/studio-clinique.html?atelier-local=1`);
    await mobile.waitForFunction(() => typeof window.adocOpenWorkspace === 'function');
    assert.equal(await mobile.evaluate(async doc => {
      window._adocArtifacts = { lot6: { name: doc.title, _adocGenerationEngine: 'structured', _adocStructuredDoc: doc,
        _adocCapabilities: { workspace: true, persist: true, export: true } } };
      return window.adocOpenWorkspace('lot6');
    }, PRESENTATION), true);
    assert.equal(await mobile.locator('#cc-ws-panel-toggle-btn').isVisible(), true);
    assert.equal(await mobile.locator('#cc-ws-panel-toggle-btn').getAttribute('aria-expanded'), 'false');
    assert.equal(await mobile.locator('#cc-ws-panel').evaluate(el => el.getBoundingClientRect().right <= 0), true);
    await mobile.locator('#cc-ws-panel-toggle-btn').click();
    assert.equal(await mobile.locator('#cc-ws-panel-toggle-btn').getAttribute('aria-expanded'), 'true');
    await mobile.waitForFunction(() => document.getElementById('cc-ws-panel').getBoundingClientRect().right > 0);
    await mobile.close();
    console.log(`PASS verify-barre-du-haut — ${count} cas navigateur`);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('ÉCHEC verify-barre-du-haut:', e); process.exit(1); });
