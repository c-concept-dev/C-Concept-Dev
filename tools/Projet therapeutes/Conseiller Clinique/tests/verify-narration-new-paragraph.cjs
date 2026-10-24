const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    page.on('dialog', dialog => dialog.accept());
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    const d = doc();
    d.narration = [{ stepId: 'h1', text: 'Narration existante de la première étape.' },
      { stepId: 'p1', text: 'Narration existante de la deuxième étape.' }];
    assert.equal(await open(page, d), true);
    await page.locator('#p1').click();
    assert.equal(await page.locator('.nia-paragraphe-bouton').isVisible(), true);
    assert.equal(await page.locator('.nia-bouton').isVisible(), true, 'la génération globale reste disponible');

    assert.equal(await page.evaluate(() => window.adocConfirmBlockInsert('after', 'paragraph', '')), true);
    const inserted = await page.evaluate(() => {
      const blocks = window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.blocks;
      return blocks[2].id;
    });
    assert.equal(await page.locator('.nia-paragraphe-bouton').isVisible(), true, 'l’option est visible sur le paragraphe inséré');
    await page.evaluate(() => {
      window.__narrationSingleCalls = [];
      window.NarrationIA.reecrireEtape = async (document, stepId, consigne, options) => {
        window.__narrationSingleCalls.push({ stepId, cible: options.cible, consigne });
        return { entree: { stepId, text: 'Voici une proposition de narration propre à ce paragraphe.' } };
      };
    });
    await page.locator('.nia-paragraphe-bouton').click();
    await page.locator('.nia-paragraphe-generer').click();
    assert.match(await page.locator('.nia-paragraphe-panneau .nia-etat').innerText(), /Rédigez d’abord le paragraphe/);
    assert.equal((await page.evaluate(() => window.__narrationSingleCalls)).length, 0, 'un paragraphe vide ne déclenche aucun appel');
    await page.locator('#' + inserted + ' [data-cc-editor-leaf]').fill('Un nouveau paragraphe consacré aux ressources du couple.');
    await page.locator('.nia-paragraphe-generer').click();
    await page.locator('.nia-paragraphe-appliquer').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.nia-paragraphe-appliquer').isEnabled(), true);
    const calls = await page.evaluate(() => window.__narrationSingleCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].stepId, inserted, 'la requête vise exclusivement le nouveau bloc');
    assert.equal(calls[0].cible, 45);
    let narrations = await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.narration);
    assert.equal(narrations.length, 2, 'la proposition n’écrit rien avant validation');
    await page.locator('.nia-paragraphe-appliquer').click();
    narrations = await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.narration);
    assert.deepEqual(narrations.slice(0, 2), d.narration, 'les deux narrations existantes restent identiques');
    assert.equal(narrations[2].stepId, inserted);
    await page.locator('.nia-paragraphe-annuler').click();
    narrations = await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.narration);
    assert.deepEqual(narrations, d.narration, 'annuler restaure exactement les autres étapes et retire la nouvelle');

    await page.locator('#h1').click();
    assert.equal(await page.locator('.nia-paragraphe-bouton').isVisible(), false, 'option masquée sur un titre');
    console.log('PASS narration isolée du nouveau paragraphe : aperçu, application, annulation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
