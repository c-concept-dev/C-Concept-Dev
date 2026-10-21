const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const path = require('node:path');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');
const backend = require(path.resolve(__dirname, '../../../../Worker/tests/clinical-documents-sqlite.cjs'))();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    let pptxCalls = 0, pdfHtml = '', jpegHtml = '';
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'local-test-only'));
    await page.route('https://**/*', async route => {
      const req = route.request(), u = new URL(req.url());
      if (req.resourceType() === 'script') return route.fulfill({ body: '', contentType: 'application/javascript' });
      if (u.pathname.startsWith('/clinical-documents')) {
        const rep = await backend.respond(req.url(), req.method(), req.postData());
        return route.fulfill({ status: rep.status, body: await rep.text(), contentType: 'application/json' });
      }
      if (u.pathname.includes('generate-carrousel-pptx')) pptxCalls++;
      if (u.pathname.endsWith('/browser-rendering/generate-carrousel-pdf')) {
        pdfHtml = JSON.parse(req.postData()).html;
        return route.fulfill({ body: '%PDF-1.4\n%%EOF', contentType: 'application/pdf' });
      }
      if (u.pathname.endsWith('/browser-rendering/screenshot-slide')) {
        jpegHtml = JSON.parse(req.postData()).html;
        return route.fulfill({ body: png, contentType: 'image/jpeg' });
      }
      if (u.pathname.startsWith('/brand-assets/')) return route.fulfill({ body: png, contentType: 'image/png' });
      return route.fulfill({ json: { results: [], items: [], total: 0 } });
    });
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    const d = doc();
    d.blocks[0].content.imageRef = null;
    d.blocks[0].content.imageAlt = 'Couple';
    d.blocks[0].content.imageAssetId = 'asset-cover';
    d.blocks[0].content.blocks.push({ id: 'photo-1', type: 'image', content: { query: 'photo clinique', alt: 'Photo clinique' }, citationIds: [], validation: {} });
    assert.equal(await open(page, d), true);

    await page.locator('.adoc-sc-card-img').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByLabel('Cadrage').count(), 1, 'la couverture de carte expose le cadrage');
    await page.getByLabel('Cadrage').selectOption('cover');
    await page.locator('[data-image-display="focalX"]').fill('73');
    await page.getByText('Corrections de la photo').click();
    await page.locator('[data-image-display="brightness"]').fill('118');
    await page.getByLabel('Cadrage').selectOption('contain');
    if (process.env.STUDIO_SCREENSHOT_PATH) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_PATH, fullPage: false });
    assert.equal(await page.locator('.adoc-sc-card-img').evaluate(el => getComputedStyle(el).objectFit), 'contain');
    assert.equal(await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.imageDisplay.fit), 'contain');
    await page.evaluate(() => adocWsSave());
    const id = await page.evaluate(() => window._adocArtifacts['test-doc']._adocClinicalDocumentId);
    assert.ok(id, 'le document local est sauvegardé');
    await page.reload();
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    await page.evaluate(() => adocCreationsLoad('cc-home-creations'));
    const idx = await page.evaluate(id => window._adocCreationsState['cc-home-creations'].filtered.findIndex(x => x.document_id === id), id);
    await page.evaluate(i => adocCreationsOpen('cc-home-creations', i), idx);
    await page.waitForSelector('.adoc-sc-card-img');
    assert.equal(await page.locator('.adoc-sc-card-img').evaluate(el => getComputedStyle(el).objectFit), 'contain', 'cadrage conservé après relecture');
    assert.equal(await page.locator('.adoc-sc-card-img').evaluate(el => getComputedStyle(el).filter.includes('brightness(1.18)')), true, 'correction conservée après relecture');
    const exported = await page.evaluate(() => adocBuildStandalonePresentationHTML(window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc, { delaiMs: 0 }));
    assert.ok(exported.includes('"brightness":118'), 'l’export autonome conserve le réglage de correction');
    assert.ok(!exported.includes('local-test-only'), 'aucune clé dans l’export');
    const offline = await browser.newContext();
    const exportPage = await offline.newPage();
    await exportPage.route('http://studio.test/export.html', r => r.fulfill({ body: exported, contentType: 'text/html' }));
    await exportPage.goto('http://studio.test/export.html');
    await offline.setOffline(true);
    await exportPage.evaluate(() => adocPresentDemarrerExport());
    await exportPage.waitForSelector('.adoc-sc-card-img');
    assert.equal(await exportPage.locator('.adoc-sc-card-img').evaluate(el => getComputedStyle(el).objectFit), 'contain', 'export hors ligne recadré');
    await offline.close();
    await page.locator('#photo-1 img').click();
    assert.equal(await page.getByLabel('Cadrage').count(), 1, 'le bloc image expose le cadrage');
    await page.locator('[data-image-size="widthPercent"]').fill('60');
    assert.equal(await page.locator('#photo-1 .adoc-sc-image-cadre').evaluate(el => Math.round(el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width * 100)), 60, 'le curseur Taille redimensionne immédiatement le cadre visible');
    const handle = page.locator('#photo-1 .cc-image-resize-handle');
    assert.equal(await handle.isVisible(), true, 'la photo sélectionnée expose sa poignée');
    await handle.scrollIntoViewIfNeeded();
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 35, handleBox.y + handleBox.height / 2, { steps: 5 });
    await page.mouse.up();
    const resizedPercent = await page.locator('#photo-1 .adoc-sc-image-cadre').evaluate(el => Math.round(el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width * 100));
    assert.ok(resizedPercent > 60, 'la poignée agrandit réellement la photo : ' + resizedPercent + '%');
    assert.equal(await page.evaluate(() => window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc.blocks[0].content.blocks.find(b => b.id === 'photo-1').content.widthPercent), resizedPercent, 'la taille visible et le JSON coïncident');
    await page.getByLabel('Cadrage').selectOption('fill');
    assert.equal(await page.locator('#photo-1 img').evaluate(el => getComputedStyle(el).objectFit), 'fill');
    await page.evaluate(() => adocOpenWorkspace(window._adocWsState.storeKey));
    await page.waitForSelector('#photo-1 img');
    assert.equal(await page.locator('#photo-1 img').evaluate(el => getComputedStyle(el).objectFit), 'fill', 'bloc image conservé après rendu');
    assert.equal(await page.locator('#photo-1 .adoc-sc-image-cadre').evaluate(el => Math.round(el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width * 100)), resizedPercent, 'taille identique après rendu');
    await page.evaluate(() => adocWsSave());
    await page.reload();
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    await page.evaluate(() => adocCreationsLoad('cc-home-creations'));
    const resizedIdx = await page.evaluate(savedId => window._adocCreationsState['cc-home-creations'].filtered.findIndex(x => x.document_id === savedId), id);
    await page.evaluate(i => adocCreationsOpen('cc-home-creations', i), resizedIdx);
    await page.waitForSelector('#photo-1 img');
    assert.equal(await page.locator('#photo-1 .adoc-sc-image-cadre').evaluate(el => Math.round(el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width * 100)), resizedPercent, 'taille identique après sauvegarde et relecture');
    assert.equal(await page.locator('#photo-1 img').evaluate(el => getComputedStyle(el).objectFit), 'fill', 'cadrage conservé après sauvegarde et relecture');

    for (const kind of ['fiche', 'tableau', 'script', 'liens']) {
      const other = doc(kind);
      other.blocks.unshift({ id: 'cover-' + kind, type: 'image', content: { query: 'photo de couverture', alt: 'Couverture' }, citationIds: [], validation: {} });
      assert.equal(await open(page, other, 'test-' + kind), true);
      await page.locator('.adoc-sc-cover').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.getByLabel('Cadrage').count(), 1, kind + ' expose la couverture');
      await page.getByLabel('Cadrage').selectOption('contain');
      assert.equal(await page.locator('.adoc-sc-cover-image-layer').evaluate(el => getComputedStyle(el).objectFit), 'contain', kind + ' applique le cadrage');
      await page.evaluate(key => adocOpenWorkspace(key), 'test-' + kind);
      await page.waitForSelector('.adoc-sc-cover-image-layer');
      assert.equal(await page.locator('.adoc-sc-cover-image-layer').evaluate(el => getComputedStyle(el).objectFit), 'contain', kind + ' persiste après rendu');
      await page.locator('.adoc-sc-cover').click({ position: { x: 12, y: 12 } });
      await page.getByRole('button', { name: 'Remise à zéro des réglages' }).click();
      await page.waitForFunction(key => !window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.imageDisplay, 'test-' + kind);
      await page.waitForFunction(() => !document.querySelector('.adoc-sc-cover-image-layer'));
      assert.equal(await page.locator('.adoc-sc-cover-image-layer').count(), 0, kind + ' restaure la bannière historique');
    }
    const fiche = doc('fiche');
    fiche.blocks.unshift({ id: 'cover-fiche-export', type: 'image', content: { query: 'portrait', alt: 'Portrait', assetId: 'asset-cover', imageDisplay: { fit: 'contain', brightness: 118 } }, citationIds: [], validation: {} });
    assert.equal(await open(page, fiche, 'export-fiche'), true);
    const classic = await page.evaluate(() => {
      const art = window._adocArtifacts['export-fiche'];
      return adocExportClinicalDocumentHTML(art._adocStructuredDoc, art._adocStructuredSnapshot);
    });
    assert.equal(classic.blocked, false, JSON.stringify(classic.qc));
    assert.ok(!classic.html.includes('local-test-only'));
    const classicOffline = await browser.newContext();
    const classicPage = await classicOffline.newPage();
    await classicPage.route('http://studio.test/fiche.html', r => r.fulfill({ body: classic.html, contentType: 'text/html' }));
    await classicPage.goto('http://studio.test/fiche.html');
    await classicOffline.setOffline(true);
    await classicPage.waitForSelector('.adoc-sc-cover-image-layer');
    assert.equal(await classicPage.locator('.adoc-sc-cover-image-layer').evaluate(el => getComputedStyle(el).objectFit), 'contain');
    assert.equal(await classicPage.locator('.adoc-sc-cover-image-layer').evaluate(el => el.src.startsWith('data:image/')), true, 'couverture Fiche embarquée hors connexion');
    await classicOffline.close();
    const carrousel = doc('carrousel');
    carrousel.blocks[0].content.imageRef = 'photo'; carrousel.blocks[0].content.imageAlt = 'Photo';
    carrousel.blocks[0].content.imageDisplay = { fit: 'contain' };
    assert.equal(await open(page, carrousel, 'pptx-warning'), true);
    let warning = '';
    page.once('dialog', async dialog => { warning = dialog.message(); await dialog.dismiss(); });
    await page.evaluate(() => adocWsExportCarrouselPPTX());
    assert.ok(warning.includes('ne reprend pas les cadrages'), 'limite PPTX annoncée dans l’interface');
    assert.equal(pptxCalls, 0, 'aucun export après refus');
    const exportCard = doc('carrousel');
    exportCard.blocks[0].content.imageRef = null;
    exportCard.blocks[0].content.imageAssetId = 'asset-cover';
    exportCard.blocks[0].content.imageAlt = 'Couverture';
    exportCard.blocks[0].content.imageDisplay = { fit: 'contain', brightness: 118 };
    exportCard.blocks[0].content.blocks.push({ id: 'image-export', type: 'image', content: {
      query: 'photo', alt: 'Photo', assetId: 'asset-inline', imageDisplay: { fit: 'fill', contrast: 120 }
    }, citationIds: [], validation: {} });
    assert.equal(await open(page, exportCard, 'export-card'), true);
    await page.evaluate(() => adocWsExportCarrouselPDF());
    assert.match(pdfHtml, /object-fit:contain/, 'le PDF reprend le cadrage de couverture');
    assert.match(pdfHtml, /brightness\(118%\)/, 'le PDF reprend la correction de couverture');
    assert.match(pdfHtml, /object-fit:fill/, 'le PDF reprend le cadrage du bloc image');
    jpegHtml = '';
    await page.evaluate(() => { window.JSZip = class { file() {} async generateAsync() { return new Blob(['zip']); } }; });
    await page.evaluate(() => adocWsExportJPEG());
    assert.ok(jpegHtml, 'l’export JPEG a appelé la capture');
    assert.match(jpegHtml, /object-fit:contain/, 'le JPEG reprend le cadrage de couverture');
    assert.match(jpegHtml, /contrast\(120%\)/, 'le JPEG reprend la correction du bloc image');
    console.log('PASS lot 7 : couverture des six types, bloc image, cadrage et correction visibles');
  } finally { await browser.close(); backend.db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
