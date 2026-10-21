const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'text/plain' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
    });
    const document = doc();
    document.blocks[0].content.imageRef = 'test-photo';
    document.blocks[0].content.imageAlt = 'Couverture de test';
    document.blocks[0].content.blocks.push({
      id: 'photo-1', type: 'image', content: { query: 'test', alt: 'Photo intérieure' },
      citationIds: [], validation: {}
    });
    assert.equal(await open(page, document), true);
    const coverHandle = page.locator('.adoc-sc-card > .cc-card-cover-resize-handle').first();
    const imageHandle = page.locator('#photo-1 .cc-image-resize-handle').first();
    const textHandle = page.locator('#p1 > .cc-flow-resize-handle').first();
    assert.equal(await coverHandle.count(), 1);
    assert.equal(await imageHandle.count(), 1);
    assert.equal(await textHandle.count(), 1);

    await page.locator('.adoc-sc-card-img').hover();
    assert.equal(await coverHandle.isVisible(), false, 'survoler une couverture non sélectionnée ne révèle pas ses poignées');
    await page.locator('#photo-1 img').hover();
    assert.equal(await imageHandle.isVisible(), false, 'survoler une photo non sélectionnée ne révèle pas ses poignées');
    assert.equal(await textHandle.isVisible(), false, 'un bloc de texte non sélectionné garde ses poignées cachées');

    await page.locator('.adoc-sc-card-img').click();
    assert.equal(await coverHandle.isVisible(), true, 'la couverture sélectionnée révèle ses poignées');
    await page.locator('#photo-1 img').click();
    assert.equal(await imageHandle.isVisible(), true, 'la photo sélectionnée révèle ses poignées');
    await page.locator('.adoc-sc-card-img').hover();
    assert.equal(await coverHandle.isVisible(), false, 'la couverture désélectionnée cache ses poignées même au survol');
    await page.locator('#p1').click();
    assert.equal(await textHandle.isVisible(), true, 'le bloc de texte sélectionné révèle ses poignées');
    await page.locator('#photo-1 img').hover();
    assert.equal(await imageHandle.isVisible(), false, 'la photo désélectionnée cache ses poignées même au survol');

    for (const kind of ['carrousel', 'fiche', 'tableau', 'script', 'liens']) {
      const other = doc(kind);
      if (kind === 'carrousel') {
        other.blocks[0].content.imageRef = 'test-photo';
        other.blocks[0].content.imageAlt = 'Couverture de test';
      } else {
        other.blocks.unshift({
          id: 'cover-' + kind, type: 'image',
          content: { query: 'test', alt: 'Couverture de test' },
          citationIds: [], validation: {}
        });
      }
      assert.equal(await open(page, other, 'test-' + kind), true, kind + ' s’ouvre');
      const image = kind === 'carrousel' ? page.locator('.adoc-sc-card-img') : page.locator('.adoc-sc-cover');
      const grip = kind === 'carrousel'
        ? page.locator('.adoc-sc-card > .cc-card-cover-resize-handle').first()
        : page.locator('.adoc-sc-cover > .cc-doc-cover-resize-handle').first();
      await image.hover();
      assert.equal(await grip.isVisible(), false, kind + ' : survol sans sélection');
      await image.click();
      assert.equal(await grip.isVisible(), true, kind + ' : sélection de la photo');
      await page.locator('#p1').click();
      await image.hover();
      assert.equal(await grip.isVisible(), false, kind + ' : poignées cachées après sélection d’un autre bloc');
    }
    console.log('PASS poignées visibles uniquement sur le bloc ou la photo sélectionné');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
