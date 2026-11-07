const assert = require('node:assert/strict');
const path = require('node:path');
const { webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.goto('file://' + path.join(ROOT, 'studio-clinique.html'));
    await page.evaluate(() => { document.getElementById('cc-login-screen').style.display = 'none'; });
    for (const kind of ['fiche', 'carrousel', 'tableau', 'script', 'liens', 'presentation']) {
      const d = doc(kind);
      const nested = ['carrousel', 'presentation'].includes(kind);
      const writtenBlocks = [
        { id: 'q99', type: 'quote', content: { text: 'Une citation à commenter.' } },
        { id: 'c99', type: 'callout', content: { text: 'Un repère clinique.', visualRole: 'info' } },
        { id: 'l99', type: 'list', content: { items: ['Premier point'], ordered: false } },
        ...(!nested ? [{ id: 't99', type: 'table', content: { headers: ['Colonne'], rows: [['Valeur']] } }] : []),
      ].map(b => ({ ...b, citationIds: [], validation: {} }));
      const imageBlock = { id: 'image-99', type: 'image',
        content: { query: 'photo clinique', alt: 'Photo clinique', assetId: 'fixture-asset' },
        citationIds: [], validation: {} };
      if (nested) d.blocks[0].content.blocks.push(...writtenBlocks, imageBlock);
      else d.blocks.push(...writtenBlocks, imageBlock);
      if (['carrousel', 'presentation'].includes(kind)) {
        d.blocks[0].content.imageAssetId = 'fixture-asset';
        d.blocks[0].content.imageAlt = 'Image de couverture';
        d.blocks[0].content.imageDisplay = { heightPx: 300 };
      }
      const key = 'parity-' + kind;
      assert.equal(await open(page, d, key), true, kind + ' ne s’ouvre pas');
      if (kind === 'presentation') {
        await page.locator('#p1').scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        const point = await page.evaluate(() => {
          const el = document.getElementById('p1');
          el.scrollIntoView({ block: 'center' });
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          const node = walker.nextNode();
          const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(3, node.length));
          const r = range.getBoundingClientRect();
          return { x: r.left + 3, y: r.top + r.height / 2 };
        });
        await page.mouse.move(point.x, point.y); await page.mouse.down();
        await page.mouse.move(point.x + 55, point.y, { steps: 5 }); await page.mouse.up();
        assert((await page.evaluate(() => String(window.getSelection()))).length > 0, 'Sélection du texte gênée par la main');
      }
      const textTools = await page.evaluate(() => {
        document.getElementById('p1').click();
        const panel = document.querySelector('.cc-block-edit-panel');
        return {
          draft: /Rédiger ce paragraphe/.test(panel.textContent),
          rewrite: /Réécrire/.test(panel.textContent),
          reference: /Ajouter une référence/.test(panel.textContent),
          insert: /Insérer un bloc après/.test(panel.textContent),
        };
      });
      assert.deepEqual(textTools, { draft: true, rewrite: true, reference: true, insert: true }, kind);
      const parity = await page.evaluate(nested => ['h1', 'p1', 'q99', 'c99', 'l99', ...(!nested ? ['t99'] : [])].map(id => {
        document.getElementById(id).click();
        const panel = document.querySelector('.cc-block-edit-panel');
        const text = panel?.textContent || '';
        return { id, draft: /Rédiger ce (bloc|paragraphe)/.test(text), rewrite: /Réécrire/.test(text),
          sources: /Ajouter une référence/.test(text), insert: /Insérer un bloc après/.test(text),
          style: !!panel?.querySelector('[data-block-style]') || /Texte et mise en forme/.test(text) };
      }), nested);
      for (const item of parity) assert.deepEqual(item,
        { id: item.id, draft: true, rewrite: true, sources: true, insert: true, style: true },
        kind + ' : outils incomplets pour ' + item.id);
      const draft = await page.evaluate(async kind => {
        const originalFetch = window.fetch;
        let sent = '';
        window.fetch = async (_url, options) => {
          sent = JSON.parse(options.body).payload.messages[0].content;
          return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction',
            input: { text: 'Texte rédigé pour ' + kind + '.' } }] }), { status: 200 });
        };
        try {
          document.getElementById('p1').click();
          await window.adocRequestBlockCorrection('Rédiger ce paragraphe',
            'Rédige ce bloc avec les blocs voisins et le document entier.');
          const proposed = window._adocBlockEditState.pendingBlock?.content?.text;
          await window.adocConfirmBlockCorrection();
          const doc = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
          const block = kind === 'presentation' || kind === 'carrousel'
            ? doc.blocks[0].content.blocks.find(b => b.id === 'p1') : doc.blocks.find(b => b.id === 'p1');
          return { proposed, applied: block?.content?.text,
            context: sent.includes('Introduction') && sent.includes('Une citation à commenter.'),
            valid: window.adocValidateSchema('clinicalDocument', doc).valid };
        } finally { window.fetch = originalFetch; }
      }, kind);
      assert.deepEqual(draft, { proposed: 'Texte rédigé pour ' + kind + '.',
        applied: 'Texte rédigé pour ' + kind + '.', context: true, valid: true },
      kind + ' : rédaction contextuelle du bloc inopérante');
      const imageTools = await page.evaluate(() => {
        document.querySelector('#image-99 img').click();
        const button = document.querySelector('.cc-block-edit-panel [data-image-add-text]');
        return !!button && !button.hidden;
      });
      assert.equal(imageTools, true, kind + ' : ajout de texte sur image indisponible');
      if (['carrousel', 'presentation'].includes(kind)) {
        const before = await page.evaluate(() => window.adocPresentStepList(window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc).map(x => x.stepId));
        await page.evaluate(() => document.querySelector('.adoc-sc-card-img').click());
        assert.equal(await page.locator('.cc-block-edit-panel button[onclick*="adocAddTextToCardCover"]').count(), 1);
        await page.evaluate(() => document.querySelector('.cc-block-edit-panel button[onclick*="adocAddTextToCardCover"]').click());
        const result = await page.evaluate(() => {
          const d = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
          const overlay = d.blocks[0].content.blocks.find(b => /^covertext-\d+$/.test(b.id));
          const el = overlay && document.getElementById(overlay.id);
          return { valid: window.adocValidateSchema('clinicalDocument', d).valid,
            imageStillThere: !!document.querySelector('.adoc-sc-card-img'),
            overImage: !!el && el.classList.contains('adoc-sc-cover-text') && getComputedStyle(el).position === 'absolute',
            draft: !!document.querySelector('.cc-block-edit-panel') && /Rédiger ce paragraphe/.test(document.querySelector('.cc-block-edit-panel').textContent),
            steps: window.adocPresentStepList(d).map(x => x.stepId),
            overlayId: overlay && overlay.id };
        });
        assert.equal(result.valid, true, kind + ' : schéma');
        assert.equal(result.imageStillThere, true, kind + ' : image perdue');
        assert.equal(result.overImage, true, kind + ' : texte hors image');
        assert.equal(result.draft, true, kind + ' : rédaction absente');
        assert.deepEqual(result.steps, before, kind + ' : le texte décoratif crée une étape');
        if (kind === 'presentation') {
          assert.equal(await page.locator('.cc-block-edit-panel [data-editor-opacity]').first().evaluate(el => el.closest('details').open), true,
            'Les réglages d’opacité du texte sur image doivent être visibles dès la sélection');
          const opacity = await page.evaluate(() => {
            const input = document.querySelector('.cc-block-edit-panel [data-editor-opacity="backgroundOpacity"]');
            input.value = '25'; input.dispatchEvent(new Event('input', { bubbles: true }));
            const el = document.querySelector('.adoc-sc-cover-text');
            const block = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc.blocks[0].content.blocks.find(b => b.id === el.id);
            return { stored: block.style.backgroundOpacity, color: getComputedStyle(el).backgroundColor };
          });
          assert.deepEqual(opacity, { stored: 25, color: 'rgba(0, 0, 0, 0.25)' }, 'Opacité du fond superposé');
          const textOpacity = await page.evaluate(() => {
            const input = document.querySelector('.cc-block-edit-panel [data-editor-opacity="textOpacity"]');
            input.value = '40'; input.dispatchEvent(new Event('input', { bubbles: true }));
            const el = document.querySelector('.adoc-sc-cover-text');
            return { opacity: getComputedStyle(el.querySelector(':scope > .adoc-sc-fg-content')).opacity,
              handles: el.querySelectorAll(':scope > .cc-flow-resize-handle').length };
          });
          assert.deepEqual(textOpacity, { opacity: '0.4', handles: 8 }, 'Opacité des lettres et poignées indépendantes');
          for (const dir of ['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw']) {
            const el = page.locator('.adoc-sc-cover-text');
            await el.evaluate(e => {
              const block = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc.blocks[0].content.blocks.find(b => b.id === e.id);
              Object.assign(block.style, { x: 42, y: 42, width: 600, height: 80 });
              Object.assign(e.style, { left: '42px', top: '42px', width: '600px', height: '80px' });
            });
            await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
            const beforeRect = await el.boundingBox();
            const handle = el.locator('.cc-flow-resize-' + dir);
            const box = await handle.boundingBox();
            assert(box, 'Poignée ' + dir + ' absente');
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            const dx = dir.includes('w') ? -12 : dir.includes('e') ? 12 : 0;
            const dy = dir.includes('n') ? -12 : dir.includes('s') ? 12 : 0;
            await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 3 });
            await page.mouse.up();
            const afterRect = await el.boundingBox();
            if (dir.includes('w')) { assert(afterRect.x < beforeRect.x - 8, dir + ' : bord gauche'); assert(Math.abs(afterRect.x + afterRect.width - beforeRect.x - beforeRect.width) < 2, dir + ' : bord droit fixe'); }
            if (dir.includes('e')) assert(afterRect.width > beforeRect.width + 8, dir + ' : bord droit');
            if (dir.includes('n')) { assert(afterRect.y < beforeRect.y - 8, dir + ' : bord haut'); assert(Math.abs(afterRect.y + afterRect.height - beforeRect.y - beforeRect.height) < 2, dir + ' : bord bas fixe'); }
            if (dir.includes('s')) assert(afterRect.height > beforeRect.height + 8, dir + ' : bord bas');
          }
        }
        const rendered = await page.evaluate(async () => {
          const key = window._adocWsState.storeKey;
          const art = window._adocArtifacts[key];
          const r = await window.adocRenderClinicalDocument(art._adocStructuredDoc, art._adocStructuredSnapshot);
          return r.html;
        });
        assert.match(rendered, /adoc-sc-cover-text/, kind + ' : texte perdu au rendu partagé');
        assert.match(rendered, /adoc-sc-card-img/, kind + ' : image perdue au rendu partagé');
        if (kind === 'presentation') {
          assert.match(rendered, /rgba\(0, 0, 0, 0\.25\)/, 'Opacité du fond perdue au rendu');
          assert.match(rendered, /adoc-sc-fg-content[^>]*opacity:0\.4/, 'Opacité des lettres perdue au rendu');
        }
        if (kind === 'presentation') {
          const shown = await page.evaluate(async () => {
            const d = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
            await window.adocPresentOpenWithDoc(d);
            const el = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-cover-text');
            return { exists: !!el, visibility: el && getComputedStyle(el).visibility,
              reveal: el && el.classList.contains('adoc-sc-reveal'),
              total: window._adocPresentState.revealTotal };
          });
          assert.deepEqual(shown, { exists: true, visibility: 'visible', reveal: false, total: before.length }, 'Présentation : texte de couverture caché au premier affichage');
        }
      }
    }
    const cited = doc('fiche');
    cited.citations = [{ citationId: 'citation-001', sourceSnapshotEntryId: 'entry-001', displayLabel: 'Source test' }];
    cited.blocks[1].citationIds = ['citation-001'];
    cited.blocks[1].validation = { citationLinks: [{ citationId: 'citation-001',
      claimText: 'Contenu clinique de la diapositive.', claimSupport: 'pass' }] };
    assert.equal(await open(page, cited, 'parity-cited'), true, 'Fiche sourcée ne s’ouvre pas');
    const citedDraft = await page.evaluate(async () => {
      const originalFetch = window.fetch;
      window.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'tool_use',
        name: 'emit_block_correction', input: { text: 'Une correction clinique substantielle.' } }] }), { status: 200 });
      try {
        document.getElementById('p1').click();
        await window.adocRequestBlockCorrection('Rédiger ce paragraphe', 'Rédige ce bloc.');
        const pending = window._adocBlockEditState.pendingBlock;
        const status = pending?.validation?.citationLinks?.[0]?.claimSupport;
        await window.adocConfirmBlockCorrection();
        const doc = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
        return { status, valid: window.adocValidateSchema('clinicalDocument', doc).valid,
          savedStatus: doc.blocks[1].validation.citationLinks?.[0]?.claimSupport,
          noExtraFlag: !('citationReviewRequired' in doc.blocks[1].validation) };
      } finally { window.fetch = originalFetch; }
    });
    assert.deepEqual(citedDraft, { status: 'needs-review', valid: true,
      savedStatus: 'needs-review', noExtraFlag: true }, 'Les sources corrigées sortent du schéma');
    console.log('PASS parité : 6 types et blocs écrits ; rédaction contextuelle appliquée ; image et couverture ; citations conformes au schéma.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
