const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('https://**/*', route => route.fulfill({ json: { items: [], results: [] } }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    for (const kind of ['presentation', 'fiche', 'tableau', 'script', 'liens']) {
      const key = 'resize-' + kind;
      assert.equal(await open(page, doc(kind), key), true);
      await page.locator('#p1').click();
      const block = page.locator('#p1'), grip = block.locator(':scope > .cc-flow-resize-se');
      assert.deepEqual(await block.locator(':scope > .cc-flow-resize-handle').evaluateAll(els => els.map(el => el.dataset.flowResize).sort()), ['e','n','ne','nw','s','se','sw','w'], kind + ' expose huit poignées');
      assert.equal(await grip.isVisible(), true, kind + ' expose les poignées du bloc sélectionné');
      await grip.scrollIntoViewIfNeeded();
      const before = await block.boundingBox(), g = await grip.boundingBox();
      await page.mouse.move(g.x + g.width/2, g.y + g.height/2);
      await page.mouse.down();
      await page.mouse.move(g.x + g.width/2 - 120, g.y + g.height/2 + 35, { steps: 5 });
      await page.mouse.up();
      const after = await block.boundingBox();
      assert.ok(after.width < before.width - 60, kind + ' réduit la largeur visible : ' + before.width + ' → ' + after.width);
      assert.ok(after.height > before.height + 15, kind + ' agrandit la hauteur minimale');
      if (kind === 'presentation') {
        await page.evaluate(() => {
          const leaf = document.querySelector('#p1 [data-cc-editor-leaf]');
          leaf.focus(); leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
        });
        await page.waitForFunction(width => Math.abs(document.getElementById('p1').getBoundingClientRect().width - width) < 3, before.width);
        await page.evaluate(() => {
          const leaf = document.querySelector('#p1 [data-cc-editor-leaf]');
          leaf.focus(); leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
        });
        await page.waitForFunction(width => Math.abs(document.getElementById('p1').getBoundingClientRect().width - width) < 3, after.width);
      }
      const values = await page.evaluate(k => {
        const d = _adocArtifacts[k]._adocStructuredDoc;
        const b = ['presentation','carrousel'].includes(d.documentKind) ? d.blocks[0].content.blocks.find(x => x.id === 'p1') : d.blocks.find(x => x.id === 'p1');
        return { style: b.style, check: adocValidateSchema('clinicalDocument', d) };
      }, key);
      assert.ok(values.style.flowWidthPercent < 100 && values.style.flowMinHeightPx > 0, kind + ' conserve les dimensions en JSON');
      assert.equal(values.check.valid && !values.check.skipped, true, kind + ' valide le document après le geste : ' + JSON.stringify(values.check));
      await page.evaluate(k => adocOpenWorkspace(k), key);
      const reopened = await page.locator('#p1').boundingBox();
      assert.ok(Math.abs(reopened.width - after.width) < 3, kind + ' retrouve la largeur après rendu');
      assert.ok(Math.abs(reopened.height - after.height) < 3, kind + ' retrouve la hauteur après rendu');
    }
    const allTypes = doc('fiche');
    allTypes.blocks.push(
      { id: 'q1', type: 'quote', content: { text: 'Une citation clinique.' }, citationIds: [], validation: {} },
      { id: 'c1', type: 'callout', content: { text: 'Point de vigilance.', visualRole: 'info' }, citationIds: [], validation: {} },
      { id: 'l1', type: 'list', content: { items: ['Premier repère', 'Deuxième repère'], ordered: false }, citationIds: [], validation: {} },
      { id: 't1', type: 'table', content: { headers: ['Avant', 'Après'], rows: [['A', 'B']] }, citationIds: [], validation: {} }
    );
    assert.equal(await open(page, allTypes, 'resize-all-types'), true);
    for (const id of ['h1', 'p1', 'q1', 'c1', 'l1', 't1']) {
      await page.locator('#' + id).click();
      assert.equal(await page.locator('#' + id + ' > .cc-flow-resize-se').isVisible(), true, id + ' expose une poignée d’angle');
    }
    for (const direction of ['n','ne','e','se','s','sw','w','nw']) {
      const key = 'resize-direction-' + direction;
      assert.equal(await open(page, doc('fiche'), key), true);
      await page.locator('#p1').click();
      const block = page.locator('#p1');
      const handle = block.locator(':scope > .cc-flow-resize-' + direction);
      const before = await block.boundingBox();
      const grip = await handle.boundingBox();
      const dx = direction.includes('e') ? -60 : direction.includes('w') ? 60 : 0;
      const dy = direction.includes('s') ? 40 : direction.includes('n') ? -40 : 0;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2 + dx, grip.y + grip.height / 2 + dy, { steps: 5 });
      await page.mouse.up();
      const after = await block.boundingBox();
      if (dx) assert.ok(after.width < before.width - 30, direction + ' réduit la largeur du côté glissé');
      if (dy) assert.ok(after.height > before.height + 20, direction + ' augmente la hauteur du côté glissé');
    }
    assert.equal(await open(page, doc('carrousel'), 'resize-carrousel'), true);
    const card = page.locator('.adoc-sc-card').first();
    await card.click({ position: { x: 5, y: 5 } });
    assert.deepEqual(await card.locator(':scope > .adoc-sc-card-resize-handle').evaluateAll(els => els.map(el => el.dataset.resizeDirection).sort()), ['e','n','ne','nw','s','se','sw','w'], 'la carte du Carrousel expose huit poignées');
    const cardGrip = card.locator(':scope > .cc-pos-resize-nw');
    const cardBefore = await card.boundingBox(), cg = await cardGrip.boundingBox();
    await page.mouse.move(cg.x + cg.width / 2, cg.y + cg.height / 2); await page.mouse.down();
    await page.mouse.move(cg.x + cg.width / 2 + 40, cg.y + cg.height / 2 + 25, { steps: 5 }); await page.mouse.up();
    const cardAfter = await card.boundingBox();
    assert.ok(cardAfter.width < cardBefore.width - 20 && cardAfter.height < cardBefore.height - 10, 'coin haut gauche réduit la carte');
    await page.locator('#p1').click();
    assert.deepEqual(await page.locator('#p1 > .adoc-sc-nested-resize-handle').evaluateAll(els => els.map(el => el.dataset.resizeDirection).sort()), ['e','n','ne','nw','s','se','sw','w'], 'le bloc imbriqué du Carrousel expose huit poignées');
    assert.equal(await page.locator('#p1 > .cc-pos-resize-se').isVisible(), true, 'poignées imbriquées visibles sur sélection');
    assert.equal(await page.evaluate(() => adocValidateSchema('clinicalDocument', _adocArtifacts['resize-carrousel']._adocStructuredDoc).valid), true, 'carte redimensionnée conforme au schéma');
    const special = doc('presentation');
    special.blocks[0].content.blocks.push(
      { id: 'v1', type: 'video', content: { url: 'https://example.test/video.mp4', title: 'Extrait' }, citationIds: [], validation: {} },
      { id: 'quiz1', type: 'quiz', content: { question: 'Quel repère ?', options: ['A', 'B'], correctIndex: 0, explanation: 'Le repère A.' }, citationIds: [], validation: {} },
      { id: 'quest1', type: 'questionnaire', content: { questions: [
        { text: 'Question 1', options: [{ text: 'Oui', points: 0 }, { text: 'Non', points: 1 }] },
        { text: 'Question 2', options: [{ text: 'Oui', points: 0 }, { text: 'Non', points: 1 }] }
      ], profiles: [
        { label: 'Bas', minScore: 0, maxScore: 0, interpretation: 'Bas.' },
        { label: 'Haut', minScore: 1, maxScore: 2, interpretation: 'Haut.' }
      ], allowTwoPartners: false }, citationIds: [], validation: {} }
    );
    assert.equal(await open(page, special, 'resize-special'), true);
    const specialWidths = {};
    for (const id of ['v1', 'quiz1', 'quest1']) {
      await page.locator('#' + id).click({ position: { x: 4, y: 4 } });
      const handle = page.locator('#' + id + ' > .cc-flow-resize-w');
      assert.equal(await handle.isVisible(), true, id + ' expose huit poignées');
      assert.equal(await page.locator('#' + id + ' > .cc-flow-resize-handle').count(), 8);
      await handle.scrollIntoViewIfNeeded();
      const before = await page.locator('#' + id).boundingBox(), grip = await handle.boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2 + 45, grip.y + grip.height / 2, { steps: 5 }); await page.mouse.up();
      specialWidths[id] = (await page.locator('#' + id).boundingBox()).width;
      assert.ok(specialWidths[id] < before.width - 20, id + ' se redimensionne : ' + JSON.stringify({ before: before.width, after: specialWidths[id], style: await page.locator('#' + id).getAttribute('style'), gripTarget: await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.className, { x: grip.x + grip.width/2, y: grip.y + grip.height/2 }) }));
    }
    assert.equal(await page.evaluate(() => adocValidateSchema('clinicalDocument', _adocArtifacts['resize-special']._adocStructuredDoc).valid), true, 'les trois types spéciaux restent valides');
    await page.evaluate(() => adocOpenWorkspace('resize-special'));
    for (const id of ['v1', 'quiz1', 'quest1']) { const reopenedWidth=(await page.locator('#'+id).boundingBox()).width; assert.ok(Math.abs(reopenedWidth-specialWidths[id])<3,id+' retrouve sa largeur après rendu'); }
    await page.evaluate(() => {
      _adocArtifacts.resizeLegacy = {
        name: 'Document ancien', html: '<html><body><h2>Titre</h2><p>Texte clinique à redimensionner.</p></body></html>',
        _adocGenerationEngine: 'legacy-html', _adocCapabilities: { workspace: true, legacyBlockEditing: true, persist: true }
      };
    });
    assert.equal(await page.evaluate(() => adocOpenWorkspace('resizeLegacy')), true);
    const legacy = page.locator('#cc-ws-doc-card p').first();
    await legacy.click();
    const grip = legacy.locator('xpath=..').locator(':scope > .cc-flow-resize-se');
    assert.equal(await grip.isVisible(), true, 'ancien moteur expose ses poignées');
    await grip.scrollIntoViewIfNeeded();
    const before = await legacy.boundingBox(), g = await grip.boundingBox();
    await page.mouse.move(g.x + g.width/2, g.y + g.height/2); await page.mouse.down();
    await page.mouse.move(g.x + g.width/2 - 100, g.y + g.height/2 + 30, { steps: 5 }); await page.mouse.up();
    const after = await legacy.boundingBox();
    assert.ok(after.width < before.width - 40 && after.height > before.height + 10, 'ancien moteur change visiblement les deux dimensions');
    const saved = await page.evaluate(() => _adocArtifacts.resizeLegacy.html);
    assert.match(saved, /width:\s*\d+%/);
    assert.match(saved, /min-height:\s*\d+px/);
    assert.ok(!saved.includes('cc-flow-resize-handle'), 'poignées absentes du HTML persisté');
    await page.evaluate(() => adocOpenWorkspace('resizeLegacy'));
    const reopened = await page.locator('#cc-ws-doc-card p').first().boundingBox();
    assert.ok(Math.abs(reopened.width - after.width) < 3, 'ancien moteur retrouve la largeur');
    assert.ok(Math.abs(reopened.height - after.height) < 3, 'ancien moteur retrouve la hauteur');
    console.log('PASS poignées : cinq types structurés, huit directions et moteur ancien, rendu et persistance');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
