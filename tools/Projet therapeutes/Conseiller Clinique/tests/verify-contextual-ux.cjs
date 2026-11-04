const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    assert.equal(await open(page, doc()), true);
    await page.locator('#p1').click();
    const panel = page.locator('.cc-block-edit-panel');
    assert.equal(await panel.count(), 1);
    const size = await panel.evaluate(el => ({ height: el.getBoundingClientRect().height, limit: innerHeight * .5, scrollHeight: el.scrollHeight }));
    assert(size.height <= size.limit + 2, 'le panneau reste compact dans une fenêtre de 800 px');
    assert(size.scrollHeight > size.height, 'les options se parcourent dans le panneau');
    await page.waitForTimeout(50);
    const panelTop = await panel.evaluate(el => el.getBoundingClientRect().top);
    const blockBottom = await page.locator('#p1').evaluate(el => el.getBoundingClientRect().bottom);
    assert(panelTop < 800, 'le panneau apparaît sans défilement manuel après sélection');
    assert(panelTop >= blockBottom, 'le panneau ne recouvre pas le bloc sélectionné');
    await panel.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const selected = await page.locator('#p1').evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
    assert(selected.bottom > 0 && selected.top < 800, 'le bloc reste visible lorsque les options défilent');
    assert.equal(await page.locator('.cc-editor-narration').evaluate(el => el.open), false);
    await page.getByRole('button', { name: 'Ajouter une référence', exact: true }).click();
    await page.locator('[data-source-author]').fill('Auteur de test');
    await page.locator('[data-source-title]').fill('Ouvrage de test');
    await page.locator('[data-source-page]').fill('12');
    await page.locator('[data-source-excerpt]').fill('Passage de référence saisi manuellement.');
    await page.getByRole('button', { name: 'Ajouter et lier au bloc' }).click();
    await page.waitForFunction(() => window._adocArtifacts['test-doc']._adocStructuredDoc.citations.length === 1);
    const source = await page.evaluate(() => {
      const art = window._adocArtifacts['test-doc'];
      return { citations: art._adocStructuredDoc.citations, entries: art._adocStructuredSnapshot.entries,
        links: art._adocStructuredDoc.blocks[0].content.blocks[1].validation.citationLinks };
    });
    assert.equal(source.entries[0].exactText, 'Passage de référence saisi manuellement.');
    assert.equal(source.links[0].claimSupport, 'needs-review');
    assert.equal(await open(page, doc(), 'test-dive'), true);
    await page.locator('#p1').click();
    await page.locator('.cc-block-deep-dive summary').click();
    await page.locator('[data-deep-dive-link-text]').fill('Contenu clinique');
    await page.locator('[data-deep-dive-new-title]').fill('Complément clinique');
    await page.getByRole('button', { name: 'Ajouter et lier à ce bloc' }).click();
    await page.waitForFunction(() => window._adocArtifacts['test-dive']._adocStructuredDoc.deepDives?.length === 1);
    const dive = await page.evaluate(() => {
      const d = window._adocArtifacts['test-dive']._adocStructuredDoc;
      return { page: d.deepDives[0], link: d.blocks[0].content.blocks[1].deepDiveLinks[0] };
    });
    assert.equal(dive.link.targetId, dive.page.id);
    assert.equal(dive.page.paragraphs[0], 'Nouveau paragraphe.');
    assert.deepEqual(errors, []);
    console.log('PASS contextual UX, manual source, manual deep dive');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
