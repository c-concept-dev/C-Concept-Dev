// Lot 2 : les gestes modifient l'écran et le document en mémoire sans écrire de version.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key-local'));
    await page.route('https://**/*', route => {
      const url = new URL(route.request().url());
      if (route.request().resourceType() === 'script') return route.fulfill({ body: '', contentType: 'application/javascript' });
      if (url.pathname === '/brand-assets/upload') return route.fulfill({ json: { asset_id: 'asset-drop' } });
      if (url.pathname.endsWith('/use')) return route.fulfill({ json: {} });
      return route.fulfill({ json: { results: [], items: [], total: 0 } });
    });
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.adocApplyTheme === 'function');
    const d = doc();
    d.blocks[0].content.imageRef = 'ocean landscape';
    d.blocks[0].content.imageAlt = 'Océan';
    assert.equal(await open(page, d), true);
    await page.evaluate(() => {
      window.__lot2SaveCalls = 0;
      window.adocWsSave = async () => { window.__lot2SaveCalls++; return true; };
    });
    const check = async (label, visible) => {
      const state = await page.evaluate(() => ({
        saveCalls: window.__lot2SaveCalls,
        dirty: !!window._adocArtifacts['test-doc']._ccEditorDirty,
        status: document.getElementById('cc-ws-save-status')?.textContent?.trim(),
      }));
      assert.equal(state.saveCalls, 0, label + ' a appelé adocWsSave');
      assert.equal(state.dirty, true, label + ' n’a pas marqué le document modifié');
      assert.equal(state.status, 'Modifications non sauvegardées', label + ' : état affiché');
      assert.equal(await page.locator(visible).count() > 0, true, label + ' : changement invisible');
      await page.evaluate(() => { window._adocArtifacts['test-doc']._ccEditorDirty = false; });
    };

    await page.evaluate(() => window.adocApplyTheme('test-doc', 'encre'));
    await check('Thème rapide', '#cc-ws-brandkit');
    console.log('PASS thème rapide : aucun appel de sauvegarde, état et rendu visibles');

    await page.evaluate(async () => {
      const art = window._adocArtifacts['test-doc'];
      window._adocStructuredReThemeCandidate = { storeKey: 'test-doc',
        renderManifestOverride: art._adocRenderManifestOverride, brandKitName: 'Charte test' };
      await window.adocConfirmStructuredRetheme();
    });
    await check('Charte structurée', '#cc-ws-brandkit');
    console.log('PASS charte structurée : aucun appel de sauvegarde, état et rendu visibles');

    await page.locator('.adoc-sc-card-img').click();
    await page.evaluate(() => window.adocRemoveCardImage());
    const imageState = await page.evaluate(() => ({
      ref: window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.imageRef,
      count: document.querySelectorAll('.adoc-sc-card-img').length,
    }));
    assert.equal(imageState.ref, null);
    assert.equal(imageState.count, 0);
    await check('Retrait d’image', '.adoc-sc-card');
    console.log('PASS retrait de couverture : aucun appel de sauvegarde, état et rendu visibles');

    await page.locator('#p1').click();
    await page.evaluate(() => {
      window._adocMediaHistoryResults = [{ asset_id: 'asset-media', attribution: 'Photo test' }];
      return window.adocMediaInsertFromHistory(0);
    });
    assert.equal(await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.blocks[1].style.backgroundAssetId), 'asset-media');
    await check('Image Médias', '#p1');
    console.log('PASS image Médias : aucun appel de sauvegarde, état et rendu visibles');

    await page.evaluate(() => {
      const cover = window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content;
      cover.imageRef = 'ocean landscape'; cover.imageAlt = 'Océan'; delete cover.imageAssetId;
      return window.adocOpenWorkspace('test-doc');
    });

    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    await page.locator('.adoc-sc-card-img').evaluate((el, value) => {
      const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'photo.png', { type: 'image/png' }));
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    }, png);
    await page.waitForSelector('.adoc-sc-card-img[data-asset-id="asset-drop"]');
    await check('Image déposée', '.adoc-sc-card-img[data-asset-id="asset-drop"]');
    console.log('PASS image déposée : aucun appel de sauvegarde, état et rendu visibles');

    await page.locator('#p1').click();
    await page.evaluate(() => {
      const st = window._adocBlockEditState;
      st.pendingBlock = { id: 'p1', type: 'paragraph', content: { text: 'Correction locale' }, citationIds: [], validation: {} };
      return window.adocConfirmBlockCorrection();
    });
    assert.equal(await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.blocks[1].content.text), 'Correction locale');
    await check('Correction de bloc', '#p1');
    console.log('PASS correction structurée : aucun appel de sauvegarde, état et rendu visibles');

    await page.locator('.adoc-sc-card-title').click();
    await page.evaluate(() => {
      window._adocBlockEditState.pendingBlock = { content: { text: 'Titre corrigé' } };
      return window.adocConfirmBlockCorrection();
    });
    assert.equal(await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.title), 'Titre corrigé');
    await check('Correction de titre', '.adoc-sc-card-title');
    console.log('PASS correction de titre : aucun appel de sauvegarde, état et rendu visibles');

    await page.locator('#p1').evaluate((el, value) => {
      const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'fond.png', { type: 'image/png' }));
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    }, png);
    await page.waitForFunction(() => window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.blocks[1].style?.backgroundAssetId === 'asset-drop');
    await check('Image déposée en fond', '#p1');
    console.log('PASS image déposée en fond : aucun appel de sauvegarde, état et rendu visibles');

    await page.evaluate(() => {
      window._adocArtifacts.legacy = { name: 'Document ancien', fmt: 'html', html: '<!doctype html><html><body><p>Ancien passage</p></body></html>',
        _adocGenerationEngine: 'legacy-html', _adocCapabilities: { workspace: true, persist: true, legacyBlockEditing: true } };
      return window.adocOpenWorkspace('legacy');
    });
    await page.evaluate(() => {
      window._adocLegacyBlockEditState = { storeKey: 'legacy', blockKey: 'idx0', pendingHtml: 'Passage corrigé' };
      return window.adocConfirmLegacyBlockCorrection();
    });
    const legacy = await page.evaluate(() => ({
      calls: window.__lot2SaveCalls,
      dirty: !!window._adocArtifacts.legacy._ccEditorDirty,
      status: document.getElementById('cc-ws-save-status')?.textContent?.trim(),
      html: window._adocArtifacts.legacy.html,
      visible: document.getElementById('cc-ws-doc-card')?.textContent,
    }));
    assert.equal(legacy.calls, 0, 'Correction legacy a appelé adocWsSave');
    assert.equal(legacy.dirty, true);
    assert.equal(legacy.status, 'Modifications non sauvegardées');
    assert.ok(legacy.html.includes('Passage corrigé') && legacy.visible.includes('Passage corrigé'));
    console.log('PASS correction legacy : aucun appel de sauvegarde, état et rendu visibles');

    await page.evaluate(() => {
      window._adocArtifacts.legacy._ccEditorDirty = false;
      window._adocLegacyReThemeCandidate = { storeKey: 'legacy',
        html: '<!doctype html><html><body><p>Passage recoloré</p></body></html>',
        brandKitId: 'test-kit', brandKitName: 'Charte ancienne' };
      return window.adocConfirmLegacyRetheme();
    });
    const legacyTheme = await page.evaluate(() => ({
      calls: window.__lot2SaveCalls,
      dirty: !!window._adocArtifacts.legacy._ccEditorDirty,
      status: document.getElementById('cc-ws-save-status')?.textContent?.trim(),
      html: window._adocArtifacts.legacy.html,
      visible: document.getElementById('cc-ws-doc-card')?.textContent,
    }));
    assert.equal(legacyTheme.calls, 0, 'Charte legacy a appelé adocWsSave');
    assert.equal(legacyTheme.dirty, true);
    assert.equal(legacyTheme.status, 'Modifications non sauvegardées');
    assert.ok(legacyTheme.html.includes('Passage recoloré') && legacyTheme.visible.includes('Passage recoloré'));
    console.log('PASS charte legacy : aucun appel de sauvegarde, état et rendu visibles');

    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
