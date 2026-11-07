const assert = require('node:assert/strict');
const path = require('node:path');
const { webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(ROOT, 'studio-clinique.html'));
    for (const kind of ['fiche', 'carrousel', 'tableau', 'script', 'liens', 'presentation']) {
      const d = doc(kind);
      const imageBlock = { id: 'image-99', type: 'image',
        content: { query: 'photo clinique', alt: 'Photo clinique', assetId: 'fixture-asset' },
        citationIds: [], validation: {} };
      if (['carrousel', 'presentation'].includes(kind)) d.blocks[0].content.blocks.push(imageBlock);
      else d.blocks.push(imageBlock);
      if (['carrousel', 'presentation'].includes(kind)) {
        d.blocks[0].content.imageAssetId = 'fixture-asset';
        d.blocks[0].content.imageAlt = 'Image de couverture';
        d.blocks[0].content.imageDisplay = { heightPx: 300 };
      }
      const key = 'parity-' + kind;
      assert.equal(await open(page, d, key), true, kind + ' ne s’ouvre pas');
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
        const rendered = await page.evaluate(async () => {
          const key = window._adocWsState.storeKey;
          const art = window._adocArtifacts[key];
          const r = await window.adocRenderClinicalDocument(art._adocStructuredDoc, art._adocStructuredSnapshot);
          return r.html;
        });
        assert.match(rendered, /adoc-sc-cover-text/, kind + ' : texte perdu au rendu partagé');
        assert.match(rendered, /adoc-sc-card-img/, kind + ' : image perdue au rendu partagé');
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
    console.log('PASS parité : 6 types, rédaction de bloc ; texte sur couverture Présentation et Carrousel, schéma, étapes et export.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
