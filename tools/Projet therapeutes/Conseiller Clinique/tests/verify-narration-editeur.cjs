// NARRATION PAR ÉTAPE (lot 1a) — le champ dans l'éditeur.
//
// Éprouve le panneau RÉEL, monté par le vrai clic de sélection (jamais un panneau forgé) : c'est
// le seul moyen de vérifier qu'il n'apparaît que là où il doit, et qu'une frappe atteint vraiment
// le document.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-narration-editeur.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { doc, open } = require('./presentation-edit-fixtures.cjs');

// Les deux visages d'un emoji dans une chaîne : le pictogramme lui-même, et le sélecteur de
// variante qui l'accompagne souvent. Aucun des deux n'a sa place dans cette interface.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  let n = 0;
  const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocPresentStepList === 'function');

    // Une Présentation à deux blocs dans une carte : deux étapes, donc un rang sur deux.
    const presentation = doc('presentation');
    await open(page, presentation, 'p');
    await page.evaluate(() => { window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'p' }); });

    // ── 1. Le champ apparaît sur un bloc d'une Présentation ───────────────────────────────────
    const vue = await page.evaluate(() => {
      document.getElementById('h1').click();
      const boite = document.querySelector('.cc-editor-narration');
      return { present: !!boite, cache: boite ? boite.hidden : null,
               etape: boite ? boite.querySelector('.cc-editor-narration-etape').textContent : null,
               compte: boite ? boite.querySelector('.cc-editor-narration-compte').textContent : null,
               titre: boite ? boite.querySelector('strong').textContent : null };
    });
    assert.equal(vue.present, true, 'le champ doit exister dans le panneau');
    assert.equal(vue.cache, false, 'et être visible sur un bloc de Présentation');
    assert.equal(vue.etape, 'Diapositive « Diapositive initiale », étape 1 sur 2.', 'libellé d\'étape : ' + vue.etape);
    assert.equal(vue.compte, 'Aucun mot pour l\'instant.', 'compte initial : ' + vue.compte);
    assert.equal(vue.titre, 'Narration');
    pass('champ visible sur un bloc de Présentation, étape nommée, compte à zéro.');

    // ── 2. Vouvoiement, aucun emoji ───────────────────────────────────────────────────────────
    const textes = await page.evaluate(() => {
      const b = document.querySelector('.cc-editor-narration');
      return { tout: b.textContent, place: b.querySelector('[data-editor-narration]').placeholder,
               aria: b.querySelector('[data-editor-narration]').getAttribute('aria-label') };
    });
    assert.equal(EMOJI.test(textes.tout + textes.place + textes.aria), false, 'aucun emoji dans le champ');
    assert.equal(/\btu\b|\bton\b|\btes\b/i.test(textes.tout + textes.place), false, 'vouvoiement');
    assert.equal(textes.place, 'Ce que vous direz pendant cette étape.', 'invite au vouvoiement : ' + textes.place);
    pass('vouvoiement respecté, aucun emoji, invite explicite.');

    // ── 3. La frappe atteint le document, et le compte suit ───────────────────────────────────
    const frappe = await page.evaluate(async () => {
      const zone = document.querySelector('[data-editor-narration]');
      zone.value = 'Vous ouvrez sur une question ouverte, puis vous laissez venir.';
      zone.dispatchEvent(new Event('input', { bubbles: true }));
      const d = window._adocArtifacts['p']._adocStructuredDoc;
      return { narration: d.narration, compte: document.querySelector('.cc-editor-narration-compte').textContent,
               stepId: zone.dataset.stepId };
    });
    assert.equal(frappe.stepId, 'h1', 'le champ vise l\'étape sélectionnée');
    assert.deepEqual(frappe.narration, [{ stepId: 'h1', text: 'Vous ouvrez sur une question ouverte, puis vous laissez venir.' }],
      'la frappe entre dans le document : ' + JSON.stringify(frappe.narration));
    assert.equal(frappe.compte, '10 mots — environ 4 s à voix haute. Estimation indicative, sur une moyenne de 2,5 mots par seconde.',
      'compte et durée : ' + frappe.compte);
    pass('la frappe entre dans le document, le compte et la durée indicative suivent.');

    // ── 4. Changer d'étape change ce qu'on lit, sans mélanger les deux ────────────────────────
    const seconde = await page.evaluate(() => {
      document.getElementById('p1').click();
      const zone = document.querySelector('[data-editor-narration]');
      const vide = zone.value;
      zone.value = 'Vous enchaînez sur le contenu clinique.';
      zone.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('h1').click();
      const relu = document.querySelector('[data-editor-narration]').value;
      return { vide, relu, etape: document.querySelector('.cc-editor-narration-etape').textContent,
               narration: window._adocArtifacts['p']._adocStructuredDoc.narration };
    });
    assert.equal(seconde.vide, '', 'la seconde étape commence vide, jamais avec le texte de la première');
    assert.equal(seconde.relu, 'Vous ouvrez sur une question ouverte, puis vous laissez venir.',
      'revenir sur la première étape retrouve son texte');
    assert.equal(seconde.etape, 'Diapositive « Diapositive initiale », étape 1 sur 2.');
    assert.equal(seconde.narration.length, 2, 'deux narrations distinctes coexistent');
    pass('deux étapes, deux narrations : aucune ne déborde sur l\'autre.');

    // ── 5. Une étape SANS narration reste parfaitement valide ─────────────────────────────────
    const sansNarration = await page.evaluate(() => {
      const d = window._adocArtifacts['p']._adocStructuredDoc;
      const etapes = window.adocPresentStepList(d);
      window.adocNarrationWrite(d, 'p1', '');
      const r = window.adocValidateSchema('clinicalDocument', d);
      return { etapes: etapes.length, narrees: (d.narration || []).length, valide: !!r.valid, skipped: !!r.skipped };
    });
    assert.equal(sansNarration.etapes, 2);
    assert.equal(sansNarration.narrees, 1, 'une seule étape sur deux est narrée');
    assert.equal(sansNarration.skipped, false, 'AJV doit être actif');
    assert.equal(sansNarration.valide, true, 'un document dont une étape n\'est pas narrée reste valide');
    pass('une étape sans narration reste valide : le document aussi.');

    // ── 6. Masqué partout ailleurs : Fiche, et moteur legacy ──────────────────────────────────
    const fiche = doc('fiche');
    await open(page, fiche, 'f');
    const ailleurs = await page.evaluate(() => {
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'f' });
      document.getElementById('h1').click();
      const b = document.querySelector('.cc-editor-narration');
      return { cache: b ? b.hidden : null, etapes: window.adocPresentStepList(window._adocArtifacts['f']._adocStructuredDoc).length };
    });
    assert.equal(ailleurs.etapes, 0, 'une Fiche n\'a pas d\'étape');
    assert.equal(ailleurs.cache, true, 'et le champ Narration y reste masqué');
    pass('hors Présentation, aucune étape et champ masqué.');

    console.log('\nPASS verify-narration-editeur — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
