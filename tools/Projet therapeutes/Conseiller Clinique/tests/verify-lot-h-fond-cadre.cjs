const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

function block(d, id) {
  const all = ['presentation', 'carrousel'].includes(d.documentKind) ? d.blocks[0].content.blocks : d.blocks;
  return all.find(b => b.id === id);
}

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.fulfill({ json: { items: [], results: [] } }));
    const mutation = process.env.LOT_H_MUTATION;
    if (mutation) {
      const edits = {
        controls: ["      adocBlockSurfaceControlsHTML() +\n      '<details><summary>Espacements et bordures", "      '<details><summary>Espacements et bordures"],
        persist: ["      ctx.block.style = style;\n    }\n    Object.entries(surfaceChanges)", "      /* style non persisté */\n    }\n    Object.entries(surfaceChanges)"],
        render: ["      const css = adocBlockSurfaceCSSText(block.style);", "      const css = block.type === 'video' ? '' : adocBlockSurfaceCSSText(block.style);"],
        photo: ["    if (photoBorder) {\n      const imageCtx = adocImageDisplayContext();", "    if (false) {\n      const imageCtx = adocImageDisplayContext();"],
        card: ["      const css = adocBlockSurfaceCSSText(block.style);", "      const css = block.type === 'card' ? '' : adocBlockSurfaceCSSText(block.style);"],
        export: ["'body{margin:0;background:#14211f;}' + adocBlockSurfaceCSSRules(doc)", "'body{margin:0;background:#14211f;}'"],
        restore: ["      if (liveRules) { if (rules) liveRules.textContent = rules; else liveRules.remove(); }", "      if (liveRules) { /* ancienne règle conservée */ }"],
        remove: ["      if(e.target.closest('[data-block-surface-remove-border]'))window.adocRemoveBlockBorder();", "      if(e.target.closest('[data-block-surface-remove-border]')){}"]
      };
      assert.ok(edits[mutation], 'mutation inconnue');
      const [before, after] = edits[mutation];
      const source = fs.readFileSync(ROOT + '/studio-clinique-core.js', 'utf8');
      assert.equal(source.split(before).length - 1, 1, 'ancre unique de falsification ' + mutation);
      await page.route('**/studio-clinique-core.js*', route => route.fulfill({
        body: source.replace(before, after), contentType: 'application/javascript'
      }));
    }
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    const unchanged = {
      presentation: 'bb0d5fc378bf67cb7a3bb53145f0bb9e9de3d69f27b4839b4efdc6cd70a60eee',
      carrousel: 'cab381aea7c532209b6b005419a93f54ac65aa5f4ad8dc42324d8fd9e53aa4fc',
      fiche: 'ce897c05d5ff62e90f0c91b2c4c14ff568be8c698277682fd658dbb8f1c45386'
    };
    for (const kind of Object.keys(unchanged)) {
      const d = doc(kind);
      const html = await page.evaluate(async d => (await window.adocRenderClinicalDocument(d,
        { sourceSnapshotId: d.sourceSnapshotId, entries: [] }, null)).html, d);
      assert.equal(crypto.createHash('sha256').update(html).digest('hex'), unchanged[kind], kind + ' : HTML sans nouveau style identique à main');
    }

    for (const kind of ['presentation', 'carrousel', 'fiche', 'tableau', 'script', 'liens']) {
      const d = doc(kind), key = 'surface-' + kind;
      assert.equal(await open(page, d, key), true, kind + ' ouvrable');
      await page.locator('#p1').click();
      const panel = page.locator('.cc-block-edit-panel');
      assert.equal(await panel.locator('[data-block-surface-add-bg]').count(), 1, kind + ' : ajouter un fond');
      assert.equal(await panel.locator('[data-block-surface-remove-bg]').count(), 1, kind + ' : retirer le fond');
      assert.equal(await panel.locator('[data-block-surface-add-border]').count(), 1, kind + ' : ajouter un cadre');
      assert.equal(await panel.locator('[data-block-surface-remove-border]').count(), 1, kind + ' : retirer le cadre');
      await panel.locator('[data-block-surface-add-bg]').click();
      await panel.locator('[data-block-surface-add-border]').click();
      if (kind === 'fiche') {
        const swatch = panel.locator('[data-block-surface-swatch][data-surface-field="backgroundColor"]').first();
        assert.ok(await swatch.count(), 'couleurs de la charte disponibles pour le fond');
        const value = await swatch.getAttribute('data-surface-color');
        await swatch.evaluate(el => el.click());
        const chosen = await page.evaluate(k => _adocArtifacts[k]._adocStructuredDoc.blocks.find(b => b.id === 'p1').style.backgroundColor, key);
        assert.equal(chosen, value, 'la pastille de la charte active définit le fond');
      }
      let state = await page.evaluate(k => {
        const d = _adocArtifacts[k]._adocStructuredDoc;
        const blocks = ['presentation', 'carrousel'].includes(d.documentKind) ? d.blocks[0].content.blocks : d.blocks;
        return blocks.find(b => b.id === 'p1').style;
      }, key);
      assert.ok(state, kind + ' : style sauvegardé sur le bloc');
      assert.match(state.backgroundColor, /^#[0-9a-f]{6}$/i, kind + ' : fond persistant');
      assert.ok(state.borderWidth > 0, kind + ' : cadre persistant');
      await page.evaluate(k => adocOpenWorkspace(k), key);
      assert.notEqual(await page.locator('#p1').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', kind + ' : fond rendu après réouverture');
      await page.locator('#p1').click();
      await page.locator('[data-block-surface-remove-bg]').click();
      await page.locator('[data-block-surface-remove-border]').click();
      state = await page.evaluate(k => {
        const d = _adocArtifacts[k]._adocStructuredDoc;
        const blocks = ['presentation', 'carrousel'].includes(d.documentKind) ? d.blocks[0].content.blocks : d.blocks;
        return blocks.find(b => b.id === 'p1').style;
      }, key);
      assert.equal(state.backgroundColor, 'transparent', kind + ' : fond retiré');
      assert.equal(state.borderWidth, 0, kind + ' : cadre retiré');
      await page.evaluate(k => adocOpenWorkspace(k), key);
      assert.equal(await page.locator('#p1').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', kind + ' : retrait conservé');
      assert.equal(await page.locator('#p1').evaluate(el => getComputedStyle(el).borderTopWidth), '0px', kind + ' : cadre absent au rendu');
    }

    const d = doc('presentation');
    const nested = d.blocks[0].content.blocks;
    nested.push({ id: 'callout-h', type: 'callout', content: { text: 'Encadré clinique', visualRole: 'info' }, citationIds: [], validation: {} });
    nested.push({ id: 'list-h', type: 'list', content: { items: ['Premier', 'Deuxième'], ordered: false }, citationIds: [], validation: {} });
    nested.push({ id: 'quote-h', type: 'quote', content: { text: 'Une citation clinique.', attribution: 'Autrice' }, citationIds: [], validation: {} });
    nested.push({ id: 'image-h', type: 'image', content: { query: 'arbre', alt: 'Arbre' }, citationIds: [], validation: {} });
    nested.push({ id: 'video-h', type: 'video', content: { url: 'https://example.org/video.mp4', title: 'Vidéo' }, citationIds: [], validation: {} });
    nested.push({ id: 'quiz-h', type: 'quiz', content: { question: 'Question ?', options: ['Oui', 'Non'], correctIndex: 0, explanation: 'Oui.' }, citationIds: [], validation: {} });
    assert.equal(await open(page, d, 'special-surfaces'), true, 'types multimédias ouvrables');
    const otherIds = ['callout-h', 'list-h', 'quote-h', 'image-h', 'video-h', 'quiz-h'];
    for (const id of otherIds) {
      await page.locator('#' + id).evaluate(el => el.click());
      const panel = page.locator('.cc-block-edit-panel');
      assert.equal(await panel.locator('[data-block-surface-add-bg]').count(), 1, id + ' : fond disponible');
      assert.equal(await panel.locator('[data-block-surface-add-border]').count(), 1, id + ' : cadre disponible');
      await panel.locator('[data-block-surface-add-bg]').click();
      await panel.locator('[data-block-surface-add-border]').click();
      const styled = await page.evaluate(id => {
        const d = _adocArtifacts['special-surfaces']._adocStructuredDoc;
        const b = d.blocks[0].content.blocks.find(b => b.id === id);
        return { style: b.style, imageDisplay: b.content.imageDisplay };
      }, id);
      assert.ok(styled.style, id + ' : style sauvegardé');
      assert.match(styled.style.backgroundColor, /^#[0-9a-f]{6}$/i, id + ' : fond dans JSON');
      if (id === 'image-h') assert.ok(styled.imageDisplay, 'la photo conserve son réglage de cadre');
      assert.ok((id === 'image-h' ? styled.imageDisplay : styled.style).borderWidth > 0, id + ' : cadre dans JSON');
    }
    const tab = doc('tableau');
    tab.blocks.push({ id: 'table-h', type: 'table', content: { headers: ['Sujet', 'Valeur'], rows: [['A', '1']] }, citationIds: [], validation: {} });
    tab.blocks.push({ id: 'questionnaire-h', type: 'questionnaire', content: {
      questions: [{ text: 'Première question ?', options: [{ text: 'Jamais', points: 0 }, { text: 'Souvent', points: 1 }] }],
      profiles: [{ label: 'Bas', minScore: 0, maxScore: 0, interpretation: 'Peu fréquent.' },
        { label: 'Haut', minScore: 1, maxScore: 1, interpretation: 'Fréquent.' }], allowTwoPartners: false
    }, citationIds: [], validation: {} });
    assert.equal(await open(page, tab, 'table-surfaces'), true, 'table et questionnaire ouvrables dans Tableau');
    for (const id of ['table-h', 'questionnaire-h']) {
      await page.locator('#' + id).evaluate(el => el.click());
      const panel = page.locator('.cc-block-edit-panel');
      assert.equal(await panel.locator('[data-block-surface-add-bg]').count(), 1, id + ' : fond disponible');
      assert.equal(await panel.locator('[data-block-surface-add-border]').count(), 1, id + ' : cadre disponible');
      await panel.locator('[data-block-surface-add-bg]').click();
      await panel.locator('[data-block-surface-add-border]').click();
      const style = await page.evaluate(id => _adocArtifacts['table-surfaces']._adocStructuredDoc.blocks.find(b => b.id === id).style, id);
      assert.match(style.backgroundColor, /^#[0-9a-f]{6}$/i, id + ' : fond dans JSON');
      assert.ok(style.borderWidth > 0, id + ' : cadre dans JSON');
    }
    await page.evaluate(() => adocOpenWorkspace('table-surfaces'));
    for (const id of ['table-h', 'questionnaire-h']) {
      assert.notEqual(await page.locator('#' + id).evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', id + ' : fond rendu après réouverture');
      assert.notEqual(await page.locator('#' + id).evaluate(el => getComputedStyle(el).borderTopWidth), '0px', id + ' : cadre rendu après réouverture');
    }
    await page.evaluate(() => adocOpenWorkspace('special-surfaces'));
    for (const id of otherIds) {
      assert.notEqual(await page.locator('#' + id).evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', id + ' : fond rendu après réouverture');
      const borderSelector = id === 'image-h' ? '#' + id + ' img' : '#' + id;
      assert.notEqual(await page.locator(borderSelector).first().evaluate(el => getComputedStyle(el).borderTopWidth), '0px', id + ' : cadre rendu après réouverture');
    }
    await page.locator('#callout-h').click();
    await page.locator('[data-block-surface-remove-bg]').click();
    assert.equal(await page.locator('#callout-h').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'fond d’encadré retiré immédiatement');
    await page.evaluate(() => adocOpenWorkspace('special-surfaces'));
    await page.locator('#callout-h').click();
    await page.locator('[data-block-surface-remove-bg]').click();
    assert.notEqual(await page.locator('#callout-h').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'fond d’encadré rétabli immédiatement');
    const cover = doc('presentation');
    cover.blocks[0].content.imageRef = 'photo de couple';
    cover.blocks[0].content.imageAlt = 'Couple';
    assert.equal(await open(page, cover, 'card-surface'), true, 'carte avec couverture ouvrable');
    await page.locator('.adoc-sc-card-img').first().evaluate(el => el.click());
    await page.locator('[data-block-surface-add-bg]').click();
    await page.locator('[data-block-surface-add-border]').click();
    const card = await page.evaluate(() => _adocArtifacts['card-surface']._adocStructuredDoc.blocks[0]);
    assert.match(card.style.backgroundColor, /^#[0-9a-f]{6}$/i, 'fond de carte dans JSON');
    assert.equal(card.content.imageDisplay.borderWidth, 1, 'cadre photo dans imageDisplay');
    await page.evaluate(() => adocOpenWorkspace('card-surface'));
    assert.equal(await page.locator('.adoc-sc-card').first().evaluate(el => getComputedStyle(el).backgroundColor),
      await page.evaluate(color => { const el = document.createElement('span'); el.style.backgroundColor = color; return el.style.backgroundColor; }, card.style.backgroundColor),
      'couleur exacte du fond de carte après réouverture');
    assert.notEqual(await page.locator('.adoc-sc-card-img').first().evaluate(el => getComputedStyle(el).borderTopWidth), '0px', 'cadre photo rendu');
    await page.locator('.adoc-sc-card-img').first().evaluate(el => el.click());
    await page.locator('[data-block-surface-remove-border]').click();
    assert.equal(await page.evaluate(() => _adocArtifacts['card-surface']._adocStructuredDoc.blocks[0].content.imageDisplay.borderWidth), 0, 'cadre photo retiré');
    await page.locator('.adoc-sc-card').first().evaluate(el => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
    });
    assert.equal(await page.evaluate(() => window._adocBlockEditState.zone), 'surface', 'sélection de la carte et non de sa photo');
    assert.equal(await page.locator('.cc-block-edit-panel [data-block-surface-remove-border]').count(), 1, 'cadre de carte modifiable');
    await page.locator('[data-block-surface-remove-border]').click();
    assert.equal(await page.evaluate(() => _adocArtifacts['card-surface']._adocStructuredDoc.blocks[0].style.borderWidth), 0, 'cadre de carte retiré dans JSON');
    await page.evaluate(() => adocOpenWorkspace('card-surface'));
    assert.equal(await page.locator('.adoc-sc-card').first().evaluate(el => getComputedStyle(el).borderTopWidth), '0px', 'cadre de carte absent après réouverture');

    const ficheCover = doc('fiche');
    ficheCover.blocks.unshift({ id: 'fiche-cover-h', type: 'image', content: { query: 'arbre', alt: 'Couverture de fiche' }, citationIds: [], validation: {} });
    assert.equal(await open(page, ficheCover, 'fiche-cover-surface'), true, 'fiche avec photo de couverture ouvrable');
    await page.locator('.adoc-sc-cover').evaluate(el => el.click());
    assert.equal(await page.locator('[data-block-surface-add-bg]').count(), 1, 'fond disponible sur la couverture de fiche');
    await page.locator('[data-block-surface-add-bg]').click();
    await page.locator('[data-block-surface-add-border]').click();
    const ficheCoverState = await page.evaluate(() => _adocArtifacts['fiche-cover-surface']._adocStructuredDoc.blocks[0]);
    assert.match(ficheCoverState.style.backgroundColor, /^#[0-9a-f]{6}$/i, 'fond de couverture de fiche conservé');
    assert.equal(ficheCoverState.content.imageDisplay.borderWidth, 1, 'cadre de la photo de fiche conservé');
    await page.evaluate(() => adocOpenWorkspace('fiche-cover-surface'));
    assert.notEqual(await page.locator('.adoc-sc-cover').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'fond de couverture de fiche au rendu');
    assert.equal(await page.locator('.adoc-sc-cover-image-layer').count(), 1, 'photo de couverture de fiche présente au rendu');
    assert.equal(await page.locator('.adoc-sc-cover-image-layer').evaluate(el => getComputedStyle(el).borderTopWidth), '1px', 'cadre de couverture de fiche au rendu');
    await page.locator('.adoc-sc-cover').evaluate(el => el.click());
    await page.locator('[data-block-surface-remove-border]').click();
    assert.equal(await page.evaluate(() => _adocArtifacts['fiche-cover-surface']._adocStructuredDoc.blocks[0].content.imageDisplay.borderWidth), 0, 'cadre de couverture de fiche retiré');

    const autonomous = doc('presentation');
    autonomous.blocks[0].content.blocks[0].style = { backgroundColor: '#e5f0f2', borderColor: '#286b7b', borderWidth: 1 };
    autonomous.blocks[0].content.blocks.push({ id: 'video-export-h', type: 'video', content: { url: 'https://example.org/video.mp4', title: 'Vidéo' },
      style: { backgroundColor: '#e5f0f2', borderColor: '#286b7b', borderWidth: 1 }, citationIds: [], validation: {} });
    const html = await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), autonomous);
    const exported = await browser.newPage();
    try {
      const errors = [];
      exported.on('pageerror', error => errors.push(error.message));
      await exported.setContent(html, { waitUntil: 'domcontentloaded' });
      await exported.locator('#cc-ws-present-start button').click();
      await exported.waitForTimeout(200);
      assert.deepEqual(errors, [], 'l’export interactif résout ses fonctions de rendu');
      assert.ok(await exported.locator('#h1').count(), 'l’export affiche le premier bloc');
      assert.notEqual(await exported.locator('#h1').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'fond de bloc dans l’export interactif');
      assert.equal(await exported.locator('#h1').evaluate(el => getComputedStyle(el).borderTopWidth), '1px', 'cadre de bloc dans l’export interactif');
      assert.notEqual(await exported.locator('#video-export-h').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'fond vidéo dans l’export interactif');
      assert.equal(await exported.locator('#video-export-h').evaluate(el => getComputedStyle(el).borderTopWidth), '1px', 'cadre vidéo dans l’export interactif');
    } finally { await exported.close(); }

    await page.evaluate(() => {
      _adocArtifacts.legacySurface = {
        name: 'Ancien document', html: '<html><body><p>Paragraphe ancien</p></body></html>',
        _adocGenerationEngine: 'legacy-html', _adocCapabilities: { workspace: true, legacyBlockEditing: true, persist: true }
      };
    });
    assert.equal(await page.evaluate(() => adocOpenWorkspace('legacySurface')), true, 'ancien moteur ouvrable');
    await page.locator('#cc-ws-doc-card p').first().click();
    await page.locator('[data-block-surface-add-bg]').click();
    await page.locator('[data-block-surface-add-border]').click();
    assert.match(await page.evaluate(() => _adocArtifacts.legacySurface.html), /background-color:\s*rgb\(/i, 'ancien moteur conserve le fond dans son HTML');
    assert.match(await page.evaluate(() => _adocArtifacts.legacySurface.html), /border-width:\s*1px/i, 'ancien moteur conserve le cadre dans son HTML');
    await page.evaluate(() => adocOpenWorkspace('legacySurface'));
    await page.locator('#cc-ws-doc-card p').first().click();
    await page.locator('[data-block-surface-remove-bg]').click();
    await page.locator('[data-block-surface-remove-border]').click();
    assert.match(await page.evaluate(() => _adocArtifacts.legacySurface.html), /background-color:\s*transparent/i, 'ancien moteur conserve le retrait du fond');
    assert.match(await page.evaluate(() => _adocArtifacts.legacySurface.html), /border-width:\s*0px/i, 'ancien moteur conserve le retrait du cadre');
    console.log('PASS lot H : fond et cadre ajoutés/retirés sur six formats et blocs multimédias');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
