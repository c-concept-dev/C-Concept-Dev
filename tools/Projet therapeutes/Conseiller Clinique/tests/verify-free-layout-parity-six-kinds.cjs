#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
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
        return { anchor: anchor.style, inserted: inserted && inserted.style,
          valid: window.adocValidateSchema('clinicalDocument', d).valid };
      }, kind);
      assert.equal(lateral.valid, true, kind + ' : insertion latérale invalide');
      assert(lateral.inserted.x > lateral.anchor.x, kind + ' : nouveau paragraphe pas à droite');
      assert.equal(lateral.inserted.y, lateral.anchor.y, kind + ' : colonnes non alignées');
      assert(lateral.anchor.width > 0 && lateral.inserted.width > 0, kind + ' : largeurs de colonnes absentes');
      console.log('PASS — ' + kind + ' : déplacement, export, retour au flux et insertion à droite');
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
