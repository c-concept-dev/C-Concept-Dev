const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.fulfill({ json: { items: [], results: [] } }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    for (const kind of ['presentation', 'carrousel', 'fiche', 'tableau', 'script', 'liens']) {
      const key = 'delete-' + kind;
      assert.equal(await open(page, doc(kind), key), true);
      const block = page.locator('#h1');
      const button = block.locator(':scope > .cc-block-delete');
      assert.equal(await button.count(), 1, kind + ' affiche une croix sur le bloc');
      const [blockBox, buttonBox] = await Promise.all([block.boundingBox(), button.boundingBox()]);
      assert.ok(buttonBox.x >= blockBox.x + blockBox.width - 30 && buttonBox.y <= blockBox.y + 10, kind + ' place la croix en haut à droite');
      if (kind === 'presentation' && process.env.STUDIO_SCREENSHOT_PATH) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_PATH });
      page.once('dialog', d => d.dismiss());
      await button.click();
      assert.equal(await block.count(), 1, kind + ' annulation conserve le bloc');
      page.once('dialog', d => d.accept());
      await button.click();
      await page.waitForFunction(() => !document.getElementById('h1'));
      assert.equal(await page.evaluate(k => {
        const d = _adocArtifacts[k]._adocStructuredDoc;
        return ['presentation', 'carrousel'].includes(d.documentKind) ? d.blocks[0].content.blocks.some(b => b.id === 'h1') : d.blocks.some(b => b.id === 'h1');
      }, key), false, kind + ' retire le bloc du JSON');
      assert.equal(await page.locator('#p1 > .cc-block-delete').count(), 1, kind + ' réinstalle la croix après rendu');
      if (kind === 'presentation') {
        await page.evaluate(() => {
          const leaf = document.querySelector('#p1 [data-cc-editor-leaf]');
          leaf.focus();
          leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
        });
        await page.waitForSelector('#h1');
        assert.equal(await page.evaluate(k => _adocArtifacts[k]._adocStructuredDoc.blocks[0].content.blocks.some(b => b.id === 'h1'), key), true, 'annulation clavier restaure le bloc structuré');
      }
    }
    const fiche = doc('fiche'); fiche.blocks = [fiche.blocks[0]];
    assert.equal(await open(page, fiche, 'last-fiche'), true);
    let message = '';
    page.on('dialog', async d => { message = d.message(); await d.accept(); });
    await page.locator('#h1 > .cc-block-delete').click();
    assert.equal(await page.locator('#h1').count(), 1, 'dernier bloc obligatoire conservé');
    assert.match(message, /au moins un/);
    await page.evaluate(() => {
      _adocArtifacts.legacyDelete = {
        name: 'Ancien document', html: '<html><body><h2>Premier titre</h2><p>Paragraphe à retirer.</p><p>Paragraphe conservé.</p></body></html>',
        _adocGenerationEngine: 'legacy-html', _adocCapabilities: { workspace: true, legacyBlockEditing: true, persist: true }
      };
    });
    assert.equal(await page.evaluate(() => adocOpenWorkspace('legacyDelete')), true);
    const legacyButton = page.locator('.adoc-sc-block-drag-wrap').nth(1).locator(':scope > .cc-block-delete');
    assert.equal(await legacyButton.count(), 1, 'ancien moteur : croix hors du bloc HTML');
    await legacyButton.click();
    await page.waitForFunction(() => !document.querySelector('#cc-ws-doc-card p')?.textContent?.includes('à retirer'));
    const html = await page.evaluate(() => _adocArtifacts.legacyDelete.html);
    assert.ok(!html.includes('Paragraphe à retirer'), 'ancien moteur : HTML modifié');
    assert.ok(html.includes('Paragraphe conservé'), 'ancien moteur : autre contenu intact');
    assert.ok(!html.includes('cc-block-delete'), 'ancien moteur : contrôle absent du document sauvegardé');
    await page.evaluate(() => {
      const leaf = document.querySelector('#cc-ws-doc-card [data-cc-editor-leaf]');
      leaf.focus();
      leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    });
    await page.waitForFunction(() => _adocArtifacts.legacyDelete.html.includes('Paragraphe à retirer'));
    assert.equal(await page.locator('.adoc-sc-block-drag-wrap').count(), 3, 'annulation clavier restaure le bloc ancien');
    await page.evaluate(() => {
      _adocArtifacts.xlsxDeleteGuard = {
        name: 'Tableur local', fmt: 'xlsx', html: '<html><body></body></html>',
        _adocGenerationEngine: 'legacy-html', _adocCapabilities: { workspace: true, legacyBlockEditing: true },
        xlsxData: { headers: ['Colonne'], rows: [['Valeur']], sections: [], columnSummaries: [], legend: [], notes: [] }
      };
    });
    assert.equal(await page.evaluate(() => adocOpenWorkspace('xlsxDeleteGuard')), true);
    assert.equal(await page.locator('table[data-cc-xlsx-grid]').count(), 1);
    assert.equal(await page.locator('.cc-block-delete').count(), 0, 'grille xlsx hors suppression de bloc : elle est la source entière du document');
    console.log('Croix de suppression : 6 types structurés, annulation, garde dernier bloc et ancien moteur OK');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
