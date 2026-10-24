const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#9b4e36"/></svg>');
    let writes = 0;
    await page.route('https://**/*', route => {
      const req = route.request(), url = req.url();
      if (req.method() !== 'GET') writes++;
      if (url.endsWith('/media-assets')) return route.fulfill({ json: { media: [{ asset_id: 'photo-1', alt: 'Photo de test', attribution: 'Photographe test' }] } });
      if (url.includes('/brand-assets/photo-1')) return route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="red"/></svg>', contentType: 'image/svg+xml' });
      if (url.includes('/fetch-image')) return route.fulfill({ json: { photos: [{ thumb: photo, url: photo, alt: 'Résultat de recherche', photographer: 'Autre auteur' }] } });
      return route.fulfill({ body: '', contentType: 'application/javascript' });
    });
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    assert.equal(await open(page, doc('fiche')), true);
    await page.locator('#cc-ws-media-toggle').click();
    await page.locator('#cc-ws-media-history .cc-media-thumb').first().waitFor();
    writes = 0;
    const thumb = page.locator('#cc-ws-media-history .cc-media-thumb').first();
    await thumb.scrollIntoViewIfNeeded();
    await thumb.hover();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.cc-media-hover-preview').count(), 0, 'survol bref : aucun aperçu');
    await page.locator('.cc-media-hover-preview').waitFor();
    assert.equal(await page.locator('.cc-media-hover-preview figcaption').innerText(), 'Photo : Photographe test');
    const [small, large] = await Promise.all([thumb.boundingBox(), page.locator('.cc-media-hover-preview img').boundingBox()]);
    assert.ok(large.width > small.width * 2, 'aperçu nettement agrandi');
    if (process.env.STUDIO_SCREENSHOT_PATH) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_PATH });
    assert.equal(writes, 0, 'survol sans insertion ni écriture');
    await page.mouse.move(800, 700);
    assert.equal(await page.locator('.cc-media-hover-preview').count(), 0, 'sortie : aperçu fermé');
    await thumb.focus();
    await page.locator('.cc-media-hover-preview').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.cc-media-hover-preview').count(), 0, 'Échap ferme l’aperçu au clavier');
    await page.locator('#cc-ws-media-search-input').fill('test');
    await page.evaluate(() => adocMediaSearch());
    const found = page.locator('#cc-ws-media-search-results .cc-media-thumb').first();
    await found.scrollIntoViewIfNeeded();
    await found.hover();
    await page.locator('.cc-media-hover-preview').waitFor();
    assert.equal(await page.locator('.cc-media-hover-preview img').getAttribute('src'), photo, 'la recherche utilise la grande image');
    assert.equal(writes, 0);
    console.log('PASS aperçu Médias différé : historique, recherche, sortie, clavier, zéro écriture');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
