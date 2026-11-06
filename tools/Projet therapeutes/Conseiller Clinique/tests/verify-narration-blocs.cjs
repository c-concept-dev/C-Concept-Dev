const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => !!window.NarrationIA && !!window.adocPresentStepList);
    const d = doc();
    d.blocks[0].content.blocks.push({ id: 'q1', type: 'quote',
      content: { text: 'Une citation à commenter.' }, citationIds: [], validation: {} });
    await open(page, d, 'narration-blocs');
    await page.evaluate(() => { window._adocWsState.storeKey = 'narration-blocs'; });
    const result = await page.evaluate(() => {
      const ids = ['root:card-title:card-01', 'h1', 'p1', 'q1'];
      return ids.map((id) => {
        const el = document.getElementById(id);
        if (!el) return { id, absent: true };
        el.click();
        const panel = document.querySelector('.cc-editor-narration');
        const zone = panel.querySelector('[data-editor-narration]');
        const button = panel.querySelector('.nia-paragraphe-bouton');
        const shown = !panel.hidden && button && !button.hidden;
        zone.value = 'Narration individuelle de ' + id;
        zone.dispatchEvent(new Event('input', { bubbles: true }));
        return { id, shown, target: zone.dataset.stepId, label: button && button.textContent };
      });
    });
    assert.equal(result.length, 4);
    for (const item of result) {
      assert.equal(item.absent, undefined, item.id + ' absent');
      assert.equal(item.shown, true, item.id + ' sans bouton individuel');
      assert.equal(item.target, item.id, item.id + ' cible une autre étape');
      assert.equal(item.label, 'Rédiger la narration de ce bloc');
    }
    const data = await page.evaluate(() => {
      const d = window._adocArtifacts['narration-blocs']._adocStructuredDoc;
      return { narration: d.narration, valid: window.adocValidateSchema('clinicalDocument', d).valid,
        export: window.adocStructureNarration(d) };
    });
    assert.equal(data.valid, true);
    assert.equal(data.narration.length, 4);
    for (const id of ['root:card-title:card-01', 'h1', 'p1', 'q1']) {
      assert.equal(data.narration.find((n) => n.stepId === id).text, 'Narration individuelle de ' + id);
    }
    assert.ok(JSON.stringify(data.export).includes('Narration individuelle de root:card-title:card-01'));
    const context = await page.evaluate(async () => {
      const d = window._adocArtifacts['narration-blocs']._adocStructuredDoc;
      let prompt = '';
      const words = 'Cette citation invite à réfléchir à la manière dont une relation se construit dans le temps. Elle rejoint le titre de la diapositive et prépare le développement clinique qui suit, sans répéter les mots affichés ni ajouter un fait étranger au document. Laissez un temps de réflexion avant de poursuivre.';
      await window.NarrationIA.reecrireEtape(d, 'q1', 'Commentez seulement cette citation.', {
        cible: 45, blocCible: { id: 'q1', type: 'quote', texte: 'Une citation à commenter.' },
        transport: async (req) => {
          prompt = req.messages[0].content;
          return JSON.stringify([{ stepId: 'q1', text: words }]);
        },
      });
      return prompt;
    });
    assert.match(context, /Bloc immédiatement AVANT : Contenu clinique de la diapositive/);
    assert.match(context, /Contexte de la présentation, dans l’ordre/);
    assert.match(context, /Ne commentez que ce bloc/);
    console.log('PASS narration individuelle : titre, en-tête, paragraphe, citation ; schéma et export.');
  } finally { await browser.close(); }
})().catch((e) => { console.error('FAIL', e); process.exitCode = 1; });
