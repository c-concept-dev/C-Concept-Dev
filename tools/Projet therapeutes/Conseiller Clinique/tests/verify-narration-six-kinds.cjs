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
      const blocks = ['carrousel', 'presentation'].includes(kind) ? d.blocks[0].content.blocks : d.blocks;
      blocks.push({ id: 'q1', type: 'quote', content: { text: 'Une citation à commenter.' }, citationIds: [], validation: {} });
      blocks.push({ id: 'c1', type: 'callout', content: { text: 'Un repère clinique.', visualRole: 'info' }, citationIds: [], validation: {} });
      blocks.push({ id: 'l1', type: 'list', content: { items: ['Premier point'], ordered: false }, citationIds: [], validation: {} });
      if (!['carrousel', 'presentation'].includes(kind)) blocks.push({ id: 't1', type: 'table', content: { headers: ['Colonne'], rows: [['Valeur']] }, citationIds: [], validation: {} });
      const key = 'narration-six-' + kind;
      assert.equal(await open(page, d, key), true, kind + ' : ouverture');
      const ui = await page.evaluate(() => {
        return ['h1', 'p1', 'q1', 'c1', 'l1', ...(['carrousel', 'presentation'].includes(window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc.documentKind) ? [] : ['t1'])].map(id => {
          document.getElementById(id).click();
          const panel = document.querySelector('.cc-editor-narration');
          const zone = panel?.querySelector('[data-editor-narration]');
          const button = panel?.querySelector('.nia-paragraphe-bouton');
          zone.value = 'Narration du bloc ' + id;
          zone.dispatchEvent(new Event('input', { bubbles: true }));
          return { id, visible: !!panel && !panel.hidden && !!button && !button.hidden,
            target: zone.dataset.stepId, label: panel.querySelector('summary').textContent };
        });
      });
      for (const item of ui) {
        assert.equal(item.visible, true, kind + '/' + item.id + ' : commande absente');
        assert.equal(item.target, item.id, kind + '/' + item.id + ' : mauvaise cible');
      }
      const result = await page.evaluate(key => {
        const d = window._adocArtifacts[key]._adocStructuredDoc;
        return { ids: window.adocNarrationStepList(d).map(e => e.stepId),
          notes: d.narration.map(n => n.stepId), valid: window.adocValidateSchema('clinicalDocument', d).valid,
          removed: window.adocNarrationPurge(d), after: d.narration.map(n => n.stepId),
          exportNotes: !!window.adocDocumentPourExport(d).narration };
      }, key);
      const expected = ['h1', 'p1', 'q1', 'c1', 'l1', ...(['carrousel', 'presentation'].includes(kind) ? [] : ['t1'])];
      assert.deepEqual(result.ids, expected, kind + ' : liste des blocs');
      assert.deepEqual(result.notes, expected, kind + ' : saisie');
      assert.deepEqual(result.removed, [], kind + ' : purge destructive');
      assert.deepEqual(result.after, result.notes, kind + ' : persistance');
      assert.equal(result.valid, true, kind + ' : schéma');
      assert.equal(result.exportNotes, false, kind + ' : notes de travail dans export');
      const prompt = await page.evaluate(async key => {
        const d = window._adocArtifacts[key]._adocStructuredDoc;
        let text = '';
        try {
          await window.NarrationIA.reecrireEtape(d, 'p1', '', {
            cible: 45, blocCible: { id: 'p1', type: 'paragraph', texte: 'Contenu clinique de la diapositive.' },
            transport: async request => { text = request.messages[0].content; throw new Error('transport de test'); },
          });
        } catch (e) { /* Le transport de test s'arrête après capture du prompt. */ }
        return text;
      }, key);
      assert.match(prompt, /Bloc immédiatement AVANT : Introduction/, kind + ' : voisin précédent');
      assert.match(prompt, /Bloc immédiatement APRÈS : Une citation à commenter/, kind + ' : voisin suivant');
      await page.evaluate(key => window.adocNarrationWrite(window._adocArtifacts[key]._adocStructuredDoc, 'p1', ''), key);
      const proposal = await page.evaluate(async () => {
        const text = 'Ce paragraphe présente le contenu clinique de la diapositive. Il suit une introduction et précède une citation à commenter. Vous pouvez relier ces trois éléments pour guider le public, puis laisser la citation ouvrir une réflexion sans lui attribuer un auteur absent du document.';
        window.NarrationIA._transportDEssai = async () => JSON.stringify([{ stepId: 'p1', text }]);
        document.getElementById('p1').click();
        const panel = document.querySelector('.cc-editor-narration');
        if (!panel.open) panel.querySelector('summary').click();
        panel.querySelector('.nia-paragraphe-bouton').click();
        panel.querySelector('.nia-paragraphe-generer').click();
        await new Promise(r => setTimeout(r, 120));
        return { status: panel.querySelector('.nia-paragraphe-panneau .nia-etat').textContent,
          enabled: !panel.querySelector('.nia-paragraphe-appliquer').disabled };
      });
      assert.equal(proposal.enabled, true, kind + ' : ' + proposal.status);
      const applied = await page.evaluate(key => {
        document.querySelector('.cc-editor-narration .nia-paragraphe-appliquer').click();
        const d = window._adocArtifacts[key]._adocStructuredDoc;
        return { note: window.adocNarrationRead(d, 'p1'), valid: window.adocValidateSchema('clinicalDocument', d).valid,
          dirty: document.querySelector('#cc-ws-save-status')?.textContent || '' };
      }, key);
      assert.match(applied.note, /Ce paragraphe présente le contenu clinique/, kind + ' : application');
      assert.equal(applied.valid, true, kind + ' : schéma après application');
      const serialized = await page.evaluate(key => JSON.parse(JSON.stringify(window._adocArtifacts[key]._adocStructuredDoc)), key);
      const fresh = await browser.newPage();
      try {
        await fresh.goto('file://' + path.join(ROOT, 'studio-clinique.html'));
        await fresh.evaluate(() => { document.getElementById('cc-login-screen').style.display = 'none'; });
        assert.equal(await open(fresh, serialized, key + '-fresh'), true, kind + ' : réouverture');
        const restored = await fresh.evaluate(key => {
          document.getElementById('p1').click();
          const panel = document.querySelector('.cc-editor-narration');
          return { value: panel.querySelector('[data-editor-narration]').value,
            visible: !panel.hidden, valid: window.adocValidateSchema('clinicalDocument', window._adocArtifacts[key]._adocStructuredDoc).valid };
        }, key + '-fresh');
        assert.equal(restored.value, applied.note, kind + ' : narration perdue à la réouverture');
        assert.equal(restored.visible, true, kind + ' : panneau masqué après réouverture');
        assert.equal(restored.valid, true, kind + ' : schéma après réouverture');
      } finally { await fresh.close(); }
    }
    console.log('PASS narration par bloc : fiche, carrousel, tableau, script, liens, présentation.');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
