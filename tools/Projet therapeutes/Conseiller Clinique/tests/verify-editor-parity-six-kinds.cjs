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
