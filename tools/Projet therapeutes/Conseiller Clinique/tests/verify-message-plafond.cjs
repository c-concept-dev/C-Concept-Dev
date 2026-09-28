// Le message qui annonce un plafonnement — sans lui, l'utilisatrice découvre la limite en comptant
// les diapositives reçues, et ne sait pas quoi faire pour un cours long.
//
// Deux exigences : il n'apparaît QUE si la borne a mordu, et il vient de la MÊME source que la
// consigne réellement envoyée au modèle (adocPresentationSlideBudget) — jamais d'un second libellé
// qui finirait par annoncer autre chose que ce qui a été demandé.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-message-plafond.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocPresentationBudgetNotice === 'function');
    const message = plan => page.evaluate(p => window.adocPresentationBudgetNotice(p), plan);
    const budget = plan => page.evaluate(p => window.adocPresentationSlideBudget(p), plan);

    // ── 1. AUCUN message quand la borne ne mord pas ───────────────────────────────────────────
    for (const plan of [{}, { duree_minutes: 20 }, { duree_minutes: 25 }, { presentation_options: { slideCount: 12 } }]) {
      assert.equal(await message(plan), '', 'aucun message attendu pour ' + JSON.stringify(plan));
    }
    console.log('PASS 1/5  aucun message quand la demande tient dans le plafond.');

    // ── 2. LE message, quand elle mord ────────────────────────────────────────────────────────
    const attendu = 'Présentation condensée en 20 diapositives ; pour un cours long, prévois plusieurs modules.';
    assert.equal(await message({ duree_minutes: 180 }), attendu);
    assert.equal(await message({ duree_minutes: 45 }), attendu);
    assert.equal(await message({ presentation_options: { slideCount: 40 } }), attendu);
    console.log('PASS 2/5  message exact quand la borne mord (durée comme nombre explicite).');

    // ── 3. LE MESSAGE DIT LE MÊME NOMBRE QUE LA CONSIGNE ──────────────────────────────────────
    for (const plan of [{ duree_minutes: 180 }, { presentation_options: { slideCount: 50 } }]) {
      const b = await budget(plan);
      assert.match(await message(plan), new RegExp('condensée en ' + b.cible + ' diapositives'),
        'le message doit annoncer EXACTEMENT le nombre demandé au modèle');
    }
    console.log('PASS 3/5  le message annonce le nombre réellement demandé au modèle.');

    // ── 4. POSÉ puis RETIRÉ dans l'écran de génération ────────────────────────────────────────
    // Une génération suivante qui ne plafonne pas ne doit pas hériter du message de la précédente.
    const cycle = await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'essai-gen';
      d.innerHTML = '<div class="sc-gen-header"><h3 class="sc-gen-title">t</h3></div>';
      document.body.appendChild(d);
      const lire = () => { const e = d.querySelector('.sc-gen-budget-notice'); return e ? e.textContent : null; };
      window.adocUpdateGenerationNotice('essai-gen', { duree_minutes: 180 });
      const apresPlafond = lire();
      window.adocUpdateGenerationNotice('essai-gen', { duree_minutes: 20 });
      const apresNormal = lire();
      window.adocUpdateGenerationNotice('essai-gen', { presentation_options: { slideCount: 40 } });
      const aNouveau = lire();
      d.remove();
      return { apresPlafond, apresNormal, aNouveau };
    });
    assert.match(cycle.apresPlafond, /condensée en 20 diapositives/);
    assert.equal(cycle.apresNormal, null, 'le message doit être RETIRÉ quand la borne ne mord plus');
    assert.match(cycle.aNouveau, /condensée en 20 diapositives/, 'et réapparaître si elle mord de nouveau');
    console.log('PASS 4/5  posé, retiré, puis reposé dans l\'écran de génération.');

    // ── 5. AUCUN plantage sur un identifiant inconnu ──────────────────────────────────────────
    const sansCible = await page.evaluate(() => {
      try { window.adocUpdateGenerationNotice('identifiant-qui-n-existe-pas', { duree_minutes: 180 }); return 'ok'; }
      catch (e) { return 'a levé : ' + e.message; }
    });
    assert.equal(sansCible, 'ok', 'un identifiant inconnu ne doit jamais faire échouer une génération');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    console.log('PASS 5/5  identifiant inconnu : sans effet, jamais une génération cassée.');

    console.log('\nPASS verify-message-plafond — 5/5.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
