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
      const d = doc(kind);
      const callout = { id: 'test-callout', type: 'callout', content: { text: 'Bandeau clinique', visualRole: 'info' }, citationIds: [], validation: {} };
      if (['presentation', 'carrousel'].includes(kind)) d.blocks[0].content.blocks.push(callout);
      else d.blocks.push(callout);
      const key = 'background-' + kind;
      assert.equal(await open(page, d, key), true, kind + ' ouvre un document avec encadré');
      await page.locator('#test-callout').click();
      const toggle = page.locator('[data-block-background-toggle]');
      assert.equal(await toggle.count(), 1, kind + ' propose de retirer le fond');
      assert.notEqual(await page.locator('#test-callout').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
      await toggle.click();
      assert.equal(await page.evaluate(k => {
        const d = _adocArtifacts[k]._adocStructuredDoc;
        return ['presentation', 'carrousel'].includes(d.documentKind) ? d.blocks[0].content.blocks.find(b => b.id === 'test-callout').style.backgroundColor : d.blocks.find(b => b.id === 'test-callout').style.backgroundColor;
      }, key), 'transparent', kind + ' écrit le style dans le JSON');
      assert.equal(await page.locator('#test-callout').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', kind + ' affiche un fond transparent');
      await page.evaluate(k => adocOpenWorkspace(k), key);
      await page.locator('#test-callout').click();
      assert.equal(await page.locator('#test-callout').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', kind + ' garde le fond après re-rendu');
      await page.locator('[data-block-background-toggle]').click();
      assert.notEqual(await page.locator('#test-callout').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', kind + ' restaure le fond de charte');
    }
    await page.evaluate(() => {
      _adocArtifacts.legacyBackground = {
        name: 'Ancien encadré', html: '<html><body><p class="adoc-sc-callout adoc-sc-callout-info">Bandeau ancien</p></body></html>',
        _adocGenerationEngine: 'legacy-html', _adocCapabilities: { workspace: true, legacyBlockEditing: true, persist: true }
      };
    });
    assert.equal(await page.evaluate(() => adocOpenWorkspace('legacyBackground')), true);
    await page.locator('.adoc-sc-callout').click();
    await page.locator('[data-block-background-toggle]').click();
    assert.equal(await page.locator('.adoc-sc-callout').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'ancien moteur : fond transparent');
    assert.match(await page.evaluate(() => _adocArtifacts.legacyBackground.html), /background-color:\s*transparent/, 'ancien moteur : HTML persistant');
    console.log('Fond des encadrés : 6 types structurés + legacy, retrait, re-rendu et restauration OK');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
