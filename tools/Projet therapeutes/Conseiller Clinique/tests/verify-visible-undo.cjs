const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    const d = doc();
    d.blocks[0].content.imageAssetId = 'test-cover';
    d.blocks[0].content.imageAlt = 'Couverture de test';
    assert.equal(await open(page, d), true);
    const undo = page.locator('#cc-ws-undo-btn'), redo = page.locator('#cc-ws-redo-btn');
    assert.equal(await undo.isVisible(), true, 'Annuler est visible sur le document');
    assert.equal(await undo.isDisabled(), true, 'aucune action à annuler avant une modification');

    await page.locator('.adoc-sc-card-img').click();
    const contextualUndo = page.locator('.cc-block-edit-panel .cc-block-edit-undo');
    assert.equal(await contextualUndo.isVisible(), false, 'la flèche du bloc reste cachée avant modification');
    await page.getByLabel('Cadrage').selectOption('contain');
    assert.equal(await undo.isEnabled(), true, 'la modification photo active Annuler');
    assert.equal(await contextualUndo.isVisible(), true, 'la flèche apparaît près du bloc modifié');
    await contextualUndo.click();
    assert.equal(await page.locator('.adoc-sc-card-img').evaluate(el => getComputedStyle(el).objectFit), 'cover', 'Annuler restaure le cadrage initial');
    assert.equal(await redo.isEnabled(), true);
    await redo.click();
    assert.equal(await page.locator('.adoc-sc-card-img').evaluate(el => getComputedStyle(el).objectFit), 'contain', 'Rétablir restaure le cadrage choisi');

    const text = page.locator('#p1 [data-cc-editor-leaf]').first();
    await text.click();
    await text.fill('Texte modifié à annuler.');
    assert.match(await page.locator('#p1').innerText(), /Texte modifié/);
    await undo.click();
    assert.match(await page.locator('#p1').innerText(), /Contenu clinique/, 'Annuler restaure le texte');
    await redo.click();
    assert.match(await page.locator('#p1').innerText(), /Texte modifié/, 'Rétablir restaure le texte');

    page.on('dialog', dialog => dialog.accept());
    await page.locator('#p1 .cc-block-delete').evaluate(el => el.click());
    assert.equal(await page.locator('#p1').count(), 0, 'le bloc a été supprimé');
    await undo.click();
    assert.equal(await page.locator('#p1').count(), 1, 'Annuler restaure un bloc supprimé');

    await page.evaluate(async () => {
      window._adocArtifacts.legacy = { name: 'Ancien document', html: '<!doctype html><html><body><p>Texte ancien.</p></body></html>',
        _adocGenerationEngine: 'legacy-html', _adocDocumentKind: 'fiche', _adocCapabilities: { workspace: true, legacyBlockEditing: true, persist: true } };
      await window.adocOpenWorkspace('legacy');
    });
    assert.equal(await undo.isDisabled(), true, 'l’historique ne fuit pas vers un autre document');
    const legacy = page.locator('#cc-ws-doc-card [data-cc-legacy-block-id] [data-cc-editor-leaf]').first();
    await legacy.click();
    await legacy.fill('Texte ancien modifié.');
    assert.equal(await undo.isEnabled(), true, 'Annuler est aussi disponible dans l’ancien moteur');
    assert.equal(await contextualUndo.isVisible(), true, 'la flèche apparaît aussi sur un bloc legacy');
    await contextualUndo.click();
    assert.match(await page.locator('#cc-ws-doc-card').innerText(), /Texte ancien\./, 'Annuler restaure le texte legacy');
    console.log('PASS Annuler/Rétablir visibles : photo, texte, suppression et moteur legacy');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
