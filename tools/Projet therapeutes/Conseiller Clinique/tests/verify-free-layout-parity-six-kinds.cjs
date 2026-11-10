#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browserType = process.env.PLAYWRIGHT_BROWSER === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch(browserType === chromium && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    await page.goto('file://' + path.join(ROOT, 'studio-clinique.html'));
    await page.evaluate(() => { document.getElementById('cc-login-screen').style.display = 'none'; });

    for (const kind of ['fiche', 'carrousel', 'tableau', 'script', 'liens', 'presentation']) {
      const d = doc(kind);
      const key = 'free-layout-' + kind;
      assert.equal(await open(page, d, key), true, kind + ' ne s’ouvre pas');
      await page.locator('#p1').scrollIntoViewIfNeeded();
      await page.locator('#p1').hover();
      const moveHandle = page.locator('#p1 > .adoc-sc-free-move-handle');
      const before = await moveHandle.boundingBox();
      assert(before, kind + ' : poignée de déplacement absente');
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2 + 360, before.y + before.height / 2 + 180, { steps: 12 });
      await page.mouse.up();

      const moved = await page.evaluate(kind => {
        const art = window._adocArtifacts[window._adocWsState.storeKey];
        const d = art._adocStructuredDoc;
        const block = ['carrousel', 'presentation'].includes(kind)
          ? d.blocks[0].content.blocks.find(b => b.id === 'p1')
          : d.blocks.find(b => b.id === 'p1');
        const el = document.getElementById('p1');
        const panel = document.querySelector('.cc-block-edit-panel');
        return {
          style: block.style,
          css: el.getAttribute('style') || '',
          valid: window.adocValidateSchema('clinicalDocument', d).valid,
          reset: !!panel?.querySelector('[data-card-position-reset]'),
          handles: el.querySelectorAll('.adoc-sc-nested-resize-handle').length,
          visibleHandles: Array.from(el.querySelectorAll('.adoc-sc-nested-resize-handle'))
            .filter(h => getComputedStyle(h).display !== 'none').length,
        };
      }, kind);
      assert.equal(moved.valid, true, kind + ' : coordonnées rejetées par le schéma');
      for (const field of ['x', 'y', 'width', 'height'])
        assert(Number.isFinite(moved.style?.[field]), kind + ' : ' + field + ' non persisté');
      assert.match(moved.css, /position:\s*absolute/, kind + ' : bloc encore dans le flux');
      assert.equal(moved.reset, true, kind + ' : retour au flux absent');
      assert.equal(moved.handles, 8, kind + ' : huit poignées attendues');
      assert.equal(moved.visibleHandles, 8, kind + ' : poignées non visibles après déplacement');

      const exported = await page.evaluate(async kind => {
        const art = window._adocArtifacts[window._adocWsState.storeKey];
        const d = art._adocStructuredDoc;
        const block = ['carrousel', 'presentation'].includes(kind)
          ? d.blocks[0].content.blocks.find(b => b.id === 'p1')
          : d.blocks.find(b => b.id === 'p1');
        const result = kind === 'presentation'
          ? { html: await window.adocBuildStandalonePresentationHTML(d, { embedImages: false }) }
          : await window.adocExportClinicalDocumentHTML(d, art._adocStructuredSnapshot);
        return { html: result.html || '', style: block.style };
      }, kind);
      if (kind === 'presentation') {
        fs.writeFileSync('/tmp/studio-clinique-placement-libre.html', exported.html, 'utf8');
        assert(exported.html.includes('"x":' + exported.style.x), 'presentation : x absent du document embarqué');
        const exportPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        await exportPage.route('https://**/*', route => route.abort());
        await exportPage.setContent(exported.html, { waitUntil: 'domcontentloaded' });
        await exportPage.locator('#cc-ws-present-start button').click();
        await exportPage.waitForSelector('#p1', { state: 'attached' });
        const exportedStyle = await exportPage.locator('#p1').evaluate(el => ({
          position: getComputedStyle(el).position, left: el.style.left, top: el.style.top,
          width: el.style.width, height: el.style.height,
        }));
        assert.equal(exportedStyle.position, 'absolute');
        for (const field of ['left', 'top', 'width', 'height']) {
          const sourceField = field === 'left' ? 'x' : field === 'top' ? 'y' : field;
          assert(Math.abs(parseFloat(exportedStyle[field]) - exported.style[sourceField]) < 0.01,
            'presentation : ' + field + ' diverge dans l’export');
        }
        await exportPage.close();
      } else {
        assert(exported.html.includes('left:' + exported.style.x + 'px'), kind + ' : x perdu à l’export');
        assert(exported.html.includes('top:' + exported.style.y + 'px'), kind + ' : y perdu à l’export');
        assert(exported.html.includes('width:' + exported.style.width + 'px'), kind + ' : largeur perdue à l’export');
        assert(exported.html.includes('height:' + exported.style.height + 'px'), kind + ' : hauteur perdue à l’export');
      }

      await page.locator('[data-card-position-reset]').click();
      await page.waitForFunction(() => document.getElementById('p1'));
      const reset = await page.evaluate(kind => {
        const d = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
        const block = ['carrousel', 'presentation'].includes(kind)
          ? d.blocks[0].content.blocks.find(b => b.id === 'p1')
          : d.blocks.find(b => b.id === 'p1');
        return ['x', 'y', 'width', 'height', 'zIndex'].every(field => block.style?.[field] == null);
      }, kind);
      assert.equal(reset, true, kind + ' : retour au flux incomplet');

      await page.locator('#p1').click();
      const menu = page.locator('.cc-block-insert-position-menu select');
      assert.equal(await menu.count(), 1, kind + ' : menu unique d’insertion absent');
      assert.deepEqual(await menu.locator('option').allTextContents(),
        ['Choisir la position…', 'Au-dessus', 'En dessous', 'À gauche', 'À droite'],
        kind + ' : positions du menu incomplètes');
      await menu.selectOption('right');
      await page.getByRole('button', { name: 'Paragraphe', exact: true }).click();
      const lateral = await page.evaluate(kind => {
        const d = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
        const list = ['carrousel', 'presentation'].includes(kind) ? d.blocks[0].content.blocks : d.blocks;
        const anchor = list.find(b => b.id === 'p1');
        const inserted = list.find(b => b.type === 'paragraph' && b.id !== 'p1');
        const insertedEl = inserted && document.getElementById(inserted.id);
        const rect = insertedEl && insertedEl.getBoundingClientRect();
        return { anchor: anchor.style, inserted: inserted && inserted.style,
          valid: window.adocValidateSchema('clinicalDocument', d).valid,
          panelCount: document.querySelectorAll('.cc-block-edit-panel').length,
          highlighted: !!insertedEl?.classList.contains('cc-new-lateral-block'),
          hint: insertedEl?.querySelector('.cc-new-lateral-block-hint')?.textContent || '',
          focused: !!insertedEl?.contains(document.activeElement),
          visibleWidth: rect ? Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) : 0,
        };
      }, kind);
      assert.equal(lateral.valid, true, kind + ' : insertion latérale invalide');
      assert(lateral.inserted.x > lateral.anchor.x, kind + ' : nouveau paragraphe pas à droite');
      assert.equal(lateral.inserted.y, lateral.anchor.y, kind + ' : colonnes non alignées');
      assert(lateral.anchor.width > 0 && lateral.inserted.width > 0, kind + ' : largeurs de colonnes absentes');
      assert.equal(lateral.panelCount, 0, kind + ' : le grand panneau masque encore le nouveau bloc');
      assert.equal(lateral.highlighted, true, kind + ' : nouveau bloc sans mise en évidence');
      assert.match(lateral.hint, /Bloc ajouté à droite/, kind + ' : repère d’insertion absent');
      assert.equal(lateral.focused, true, kind + ' : saisie directe non focalisée');
      assert(lateral.visibleWidth >= 80, kind + ' : nouveau bloc pratiquement invisible');
      console.log('PASS — ' + kind + ' : déplacement, export, retour au flux et insertion à droite');
    }

    const leftDoc = doc('presentation');
    assert.equal(await open(page, leftDoc, 'free-layout-presentation-left'), true);
    await page.locator('#p1').click();
    await page.locator('.cc-block-insert-position-menu select').selectOption('left');
    await page.getByRole('button', { name: 'Paragraphe', exact: true }).click();
    const left = await page.evaluate(() => {
      const d = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
      const list = d.blocks[0].content.blocks;
      const anchor = list.find(b => b.id === 'p1');
      const inserted = list.find(b => b.type === 'paragraph' && b.id !== 'p1');
      const el = document.getElementById(inserted.id);
      const rect = el.getBoundingClientRect();
      return {
        insertedId: inserted.id, anchor: anchor.style, inserted: inserted.style,
        panelCount: document.querySelectorAll('.cc-block-edit-panel').length,
        highlighted: el.classList.contains('cc-new-lateral-block'),
        hint: el.querySelector('.cc-new-lateral-block-hint')?.textContent || '',
        focused: el.contains(document.activeElement),
        selectedText: String(getSelection()),
        visibleWidth: Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)),
      };
    });
    assert(left.inserted.x < left.anchor.x, 'presentation gauche : ordre visuel inversé');
    assert.equal(left.panelCount, 0, 'presentation gauche : panneau masquant encore présent');
    assert.equal(left.highlighted, true, 'presentation gauche : bloc non mis en évidence');
    assert.match(left.hint, /Bloc ajouté à gauche/, 'presentation gauche : message absent');
    assert.equal(left.focused, true, 'presentation gauche : saisie non focalisée');
    assert.match(left.selectedText, /Nouveau paragraphe/, 'presentation gauche : texte initial non sélectionné');
    assert(left.visibleWidth >= 80, 'presentation gauche : bloc presque invisible dans la fenêtre');
    await page.screenshot({ path: '/tmp/studio-clinique-insertion-gauche-ux.png', fullPage: false });
    await page.keyboard.type('Texte saisi immédiatement');
    assert.equal(await page.locator('#' + left.insertedId + ' [data-cc-editor-leaf="text"]').textContent(),
      'Texte saisi immédiatement', 'presentation gauche : la saisie ne remplace pas directement le texte initial');
    await page.evaluate(id => document.getElementById(id).click(), left.insertedId);
    assert.equal(await page.locator('.cc-block-edit-panel').count(), 1,
      'presentation gauche : les options complètes ne s’ouvrent pas au clic suivant');
    await page.waitForTimeout(80);
    const panelPlacement = await page.evaluate(() => {
      const panel = document.querySelector('.cc-block-edit-panel');
      const parent = panel.parentElement;
      const panelRect = panel.getBoundingClientRect();
      const blockBottoms = Array.from(parent.children)
        .filter(el => el !== panel && el.classList.contains('adoc-sc-block'))
        .map(el => el.getBoundingClientRect().bottom);
      return {
        panelTop: panelRect.top,
        maxBlockBottom: Math.max(...blockBottoms),
        positionedClass: panel.classList.contains('cc-block-edit-panel--positioned-anchor'),
      };
    });
    assert.equal(panelPlacement.positionedClass, true,
      'presentation gauche : panneau non adapté à un bloc libre');
    assert(panelPlacement.panelTop >= panelPlacement.maxBlockBottom - 1,
      'presentation gauche : le panneau masque encore un bloc de la diapositive');
    await page.screenshot({ path: '/tmp/studio-clinique-panneau-sous-bloc.png', fullPage: false });
    await page.getByRole('button', { name: 'Fermer le panneau de correction' }).click();
    await page.locator('#' + left.insertedId).hover();
    const leftMove = await page.locator('#' + left.insertedId + ' > .adoc-sc-free-move-handle').boundingBox();
    assert(leftMove, 'presentation gauche : poignée de déplacement absente');
    await page.mouse.move(leftMove.x + leftMove.width / 2, leftMove.y + leftMove.height / 2);
    await page.mouse.down();
    await page.mouse.move(leftMove.x + leftMove.width / 2 + 760, leftMove.y + leftMove.height / 2, { steps: 16 });
    await page.mouse.up();
    const collision = await page.evaluate(insertedId => {
      const d = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
      const list = d.blocks[0].content.blocks;
      const a = list.find(b => b.id === 'p1').style;
      const b = list.find(block => block.id === insertedId).style;
      const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      return { overlap, a, b };
    }, left.insertedId);
    assert.equal(collision.overlap, false, 'presentation gauche : le déplacement a masqué le bloc voisin');
    await page.locator('#' + left.insertedId).hover();
    const eastResize = await page.locator('#' + left.insertedId + ' > .cc-pos-resize-e').boundingBox();
    assert(eastResize, 'presentation gauche : poignée de redimensionnement absente');
    await page.mouse.move(eastResize.x + eastResize.width / 2, eastResize.y + eastResize.height / 2);
    await page.mouse.down();
    await page.mouse.move(eastResize.x + eastResize.width / 2 + 760, eastResize.y + eastResize.height / 2, { steps: 16 });
    await page.mouse.up();
    const resizeCollision = await page.evaluate(insertedId => {
      const list = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc.blocks[0].content.blocks;
      const a = list.find(b => b.id === 'p1').style;
      const b = list.find(block => block.id === insertedId).style;
      return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    }, left.insertedId);
    assert.equal(resizeCollision, false, 'presentation gauche : le redimensionnement a masqué le bloc voisin');
    console.log('PASS — présentation : insertion à gauche visible, focalisée et sans panneau masquant');

    const denseDoc = doc('presentation');
    const denseBlocks = denseDoc.blocks[0].content.blocks;
    denseBlocks.find(block => block.id === 'p1').style = { x: 18, y: 1121, width: 1376, height: 72 };
    denseBlocks.push({
      id: 'p2', type: 'paragraph',
      content: { text: 'Bloc voisin sous le passage sélectionné.' },
      citationIds: [], validation: {},
      style: { x: 18, y: 1210, width: 1376, height: 72 },
      editor: { html: { text: 'Bloc voisin sous le passage sélectionné.' } },
    });
    assert.equal(await open(page, denseDoc, 'free-layout-presentation-dense'), true);
    await page.locator('#p1').click();
    await page.waitForTimeout(100);
    const densePanel = await page.evaluate(() => {
      const panel = document.querySelector('.cc-block-edit-panel');
      const card = document.querySelector('.adoc-sc-presentation-slide .adoc-sc-card');
      const panelRect = panel.getBoundingClientRect();
      const blockRects = Array.from(card.children)
        .filter(el => el.classList.contains('adoc-sc-block'))
        .map(el => el.getBoundingClientRect());
      return {
        panelTop: panelRect.top,
        maxBlockBottom: Math.max(...blockRects.map(rect => rect.bottom)),
        cardHeight: card.offsetHeight,
        p1Bottom: document.getElementById('p1').getBoundingClientRect().bottom,
      };
    });
    assert(densePanel.panelTop >= densePanel.maxBlockBottom - 1,
      'présentation dense : le panneau masque encore un bloc profond');
    assert(densePanel.panelTop >= densePanel.p1Bottom - 1,
      'présentation dense : le panneau masque sa propre cible');
    assert(densePanel.cardHeight > 1282,
      'présentation dense : la diapositive ne s’agrandit pas pour réserver le panneau');
    await page.locator('.cc-block-edit-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/studio-clinique-panneau-bloc-profond.png', fullPage: false });
    console.log('PASS — présentation dense : panneau sous les blocs au-delà du canevas de 800 px');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
