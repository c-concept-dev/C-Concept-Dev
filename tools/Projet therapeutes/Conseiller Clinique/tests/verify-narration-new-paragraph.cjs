const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    const d = doc();
    d.blocks.push({ id: 'card-02', type: 'card', content: { title: 'Diapositive suivante', imageRef: null,
      imageAlt: null, blocks: [{ id: 'p-apres', type: 'paragraph',
        content: { text: 'Une conséquence clinique exposée sur la diapositive suivante.' },
        citationIds: [], validation: {} }] }, citationIds: [], validation: {} });
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
      window.NarrationIA.__reecrireEtapeOriginal = window.NarrationIA.reecrireEtape;
      window.NarrationIA.reecrireEtape = async (document, stepId, consigne, options) => {
        window.__narrationSingleCalls.push({ stepId, cible: options.cible, consigne,
          contexte: options.contexteNouveauParagraphe });
        return { entree: { stepId, text: 'Voici une proposition [pause] de narration propre à ce paragraphe.' } };
      };
    });
    await page.locator('.nia-paragraphe-bouton').click();
    await page.locator('.nia-paragraphe-generer').click();
    assert.match(await page.locator('.nia-paragraphe-panneau .nia-etat').innerText(), /toute la présentation/);
    let calls = await page.evaluate(() => window.__narrationSingleCalls);
    assert.equal(calls.length, 1, 'le nouveau paragraphe déclenche une proposition contextuelle');
    assert.equal(calls[0].contexte, true);
    const prompt = await page.evaluate(async ({ stepId }) => {
      const d = window._adocArtifacts['test-doc']._adocStructuredDoc;
      let message = '';
      try {
        await window.NarrationIA.__reecrireEtapeOriginal(d, stepId, 'Narration ciblée', {
          cible: 45, contexteNouveauParagraphe: true,
          transport: async input => { message = input.messages[0].content; throw new Error('arrêt du test'); },
        });
      } catch (e) { if (e.message !== 'arrêt du test') throw e; }
      return message;
    }, { stepId: inserted });
    assert.match(prompt, /AVANT, même diapositive.*Contenu clinique de la diapositive/);
    assert.match(prompt, /APRÈS, autre diapositive.*conséquence clinique/);
    assert.doesNotMatch(prompt, /contenu de cette étape : Nouveau paragraphe/);
    assert.equal(await page.locator('#' + inserted + ' [data-cc-editor-leaf]').innerText(), 'Nouveau paragraphe.',
      'la proposition seule ne modifie pas le bloc');
    await page.waitForFunction(() => !document.querySelector('.nia-paragraphe-appliquer').disabled);
    await page.locator('.nia-paragraphe-appliquer').click();
    let snapshot = await page.evaluate(stepId => {
      const d = window._adocArtifacts['test-doc']._adocStructuredDoc;
      const block = d.blocks[0].content.blocks.find(b => b.id === stepId);
      return { text: block.content.text, narration: d.narration.find(n => n.stepId === stepId)?.text };
    }, inserted);
    assert.equal(snapshot.text, 'Voici une proposition de narration propre à ce paragraphe.',
      'le texte provisoire est remplacé sans marque de pause');
    assert.match(snapshot.narration, /\[pause\]/, 'la marque de pause reste dans la narration orale');
    assert.equal(await page.locator('#' + inserted + ' [data-cc-editor-leaf]').innerText(), snapshot.text,
      'le changement est visible immédiatement');
    const rendered = await page.evaluate(async () => {
      const art = window._adocArtifacts['test-doc'];
      return (await window.adocRenderClinicalDocument(art._adocStructuredDoc, art._adocStructuredSnapshot)).html;
    });
    assert.match(rendered, /Voici une proposition de narration propre à ce paragraphe/,
      'le rendu depuis le JSON contient le texte, pas seulement le DOM de l’éditeur');
    await page.locator('.nia-paragraphe-annuler').click();
    snapshot = await page.evaluate(stepId => {
      const d = window._adocArtifacts['test-doc']._adocStructuredDoc;
      return { text: d.blocks[0].content.blocks.find(b => b.id === stepId).content.text,
        narrations: d.narration };
    }, inserted);
    assert.equal(snapshot.text, 'Nouveau paragraphe.', 'annuler restaure le texte provisoire');
    assert.deepEqual(snapshot.narrations, d.narration, 'annuler restaure les narrations précédentes');
    await page.locator('#' + inserted + ' [data-cc-editor-leaf]').fill('Un nouveau paragraphe consacré aux ressources du couple.');
    await page.locator('.nia-paragraphe-generer').click();
    await page.locator('.nia-paragraphe-appliquer').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.nia-paragraphe-appliquer').isEnabled(), true);
    calls = await page.evaluate(() => window.__narrationSingleCalls);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].stepId, inserted, 'la requête vise exclusivement le nouveau bloc');
    assert.equal(calls[1].cible, 45);
    assert.equal(calls[1].contexte, false, 'le texte rédigé remplace le contexte de secours');
    let narrations = await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.narration);
    assert.equal(narrations.length, 2, 'la proposition n’écrit rien avant validation');
    await page.locator('.nia-paragraphe-appliquer').click();
    assert.equal((await page.locator('#' + inserted + ' [data-cc-editor-leaf]').innerText()).trim(),
      'Un nouveau paragraphe consacré aux ressources du couple.', 'un vrai paragraphe n’est pas remplacé');
    narrations = await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.narration);
    assert.deepEqual(narrations.slice(0, 2), d.narration, 'les deux narrations existantes restent identiques');
    assert.equal(narrations[2].stepId, inserted);
    await page.locator('.nia-paragraphe-annuler').click();
    narrations = await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.narration);
    assert.deepEqual(narrations, d.narration, 'annuler restaure exactement les autres étapes et retire la nouvelle');

    await page.locator('#h1').click();
    assert.equal(await page.locator('.nia-paragraphe-bouton').isVisible(), false, 'option masquée sur un titre');
    assert.deepEqual(pageErrors, [], 'aucune erreur JavaScript pendant les gestes');
    console.log('PASS narration isolée du nouveau paragraphe : aperçu, application, annulation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
