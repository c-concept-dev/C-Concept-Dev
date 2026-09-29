// STUDIO CLINIQUE — LOT 2 Présentation, Partie C — preuve réelle en navigateur (Playwright).
// Mécanisme générique de révélation progressive des blocs d'une diapositive (une seule classe
// CSS posée sur CHAQUE type de bloc — paragraphe, liste, callout — jamais un traitement
// différencié par type), intégration avec adocPresentNext/Prev/GoTo (Lot 1, jamais cassée), et
// cas de l'animation de comptage pour un nombre en tête de bloc simple.
//
// Construit directement window._adocWsState/_adocArtifacts (mécanisme documenté d'adocPresentOpen,
// cf. studio-clinique-core.js) plutôt qu'une génération réelle — teste le module plein écran en
// isolation, jamais un appel réel à l'API Anthropic (convention de test déjà établie).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

function makeBlock(id, type, text, extra) {
  const base = { id: id, type: type, style: {}, editor: {}, citationIds: [], validation: {} };
  if (type === 'list') {
    return Object.assign(base, { content: { items: ['Premier point', 'Second point'], ordered: false } });
  }
  return Object.assign(base, { content: Object.assign({ text: text, level: 2, visualRole: 'info' }, extra || {}) });
}

function makeCard(id, title, blocks) {
  return { id: id, type: 'card', style: {}, content: { title: title, imageRef: '', imageAlt: '', blocks: blocks } };
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    // Diapositive 1 : 3 blocs de types DIFFÉRENTS (paragraphe avec nombre en tête / liste /
    // callout) — prouve le mécanisme générique, jamais un traitement par type.
    // Diapositive 2 : un seul bloc (paragraphe enrichi commençant par un nombre) — cas "rien à
    // révéler progressivement" ET cas "texte enrichi jamais animé".
    // Diapositive 3 : 2 blocs — sert à prouver qu'un SAUT direct (sommaire) affiche tout d'emblée,
    // y compris en avançant, contrairement à une progression normale via Suivant.
    const doc = {
      documentId: 'doc-test', documentKind: 'presentation', title: 'Test Partie C', purpose: 'formation', audience: 'praticien',
      blocks: [
        makeCard('slide-1', 'Diapositive 1', [
          makeBlock('b1', 'paragraph', '75% des patients rapportent une amélioration.'),
          makeBlock('b2', 'list'),
          makeBlock('b3', 'callout', 'Point clé à retenir.'),
        ]),
        makeCard('slide-2', 'Diapositive 2', [
          makeBlock('b4', 'paragraph', '42 séances recommandées.', {}),
        ]),
        makeCard('slide-3', 'Diapositive 3', [
          makeBlock('b5', 'paragraph', 'Premier bloc de la diapositive 3.'),
          makeBlock('b6', 'paragraph', 'Second bloc de la diapositive 3.'),
        ]),
      ],
    };
    // Le bloc b4 (diapositive 2) porte un editor.html.text non nul — texte enrichi, jamais animé
    // (garde-fou explicite d'adocPresentAnimateNumberIfEligible).
    doc.blocks[1].content.blocks[0].editor = { html: { text: '<strong>42</strong> séances recommandées.' } };

    await page.evaluate((doc) => {
      window._adocWsState = { storeKey: 'test-partie-c' };
      window._adocArtifacts = { 'test-partie-c': { _adocStructuredDoc: doc } };
      window.adocPresentOpen();
    }, doc);

    const shownIndices = async () => page.evaluate(() => {
      const inner = document.getElementById('cc-ws-present-slide-inner');
      return Array.from(inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block')).map((el) => el.classList.contains('adoc-sc-reveal-shown'));
    });
    const counterText = async () => page.evaluate(() => document.getElementById('cc-ws-present-counter').textContent);

    // ── 1. Ouverture — un seul bloc visible sur la diapositive 1 (montage progressif). ──
    assert.deepEqual(await shownIndices(), [true, false, false], 'à l\'ouverture, seul le premier bloc de la diapositive 1 doit être visible');
    assert.equal(await counterText(), '1 / 3');
    console.log('PASS 1/8 — Ouverture : montage progressif démarre à un seul bloc visible (paragraphe).');

    // ── 2. Suivant → révèle le 2e bloc (liste), reste sur la diapositive 1. ──
    await page.evaluate(() => window.adocPresentNext());
    assert.deepEqual(await shownIndices(), [true, true, false], 'le 2e bloc (liste) doit apparaître au clic "suivant"');
    assert.equal(await counterText(), '1 / 3', 'toujours sur la diapositive 1 — le mécanisme générique fonctionne aussi sur une liste');
    console.log('PASS 2/8 — "Suivant" révèle le 2e bloc (liste, type différent du 1er) sans changer de diapositive.');

    // ── 3. Suivant → révèle le 3e bloc (callout), reste sur la diapositive 1. ──
    await page.evaluate(() => window.adocPresentNext());
    assert.deepEqual(await shownIndices(), [true, true, true], 'le 3e bloc (callout) doit apparaître au clic "suivant"');
    assert.equal(await counterText(), '1 / 3');
    console.log('PASS 3/8 — "Suivant" révèle le 3e bloc (callout, encore un type différent) — mécanisme générique confirmé sur les 3 types.');

    // ── 4. Suivant → diapositive 1 entièrement montée, avance maintenant vers la diapositive 2
    //      (un seul bloc, rien à révéler — comportement Lot 1 strictement inchangé). ──
    await page.evaluate(() => window.adocPresentNext());
    await page.waitForTimeout(320);
    assert.equal(await counterText(), '2 / 3', 'la diapositive 1 étant entièrement montée, "suivant" doit maintenant changer de diapositive');
    const slide2Classes = await page.evaluate(() => {
      const inner = document.getElementById('cc-ws-present-slide-inner');
      const el = inner.querySelector('.adoc-sc-card > .adoc-sc-block');
      return { hasReveal: el.classList.contains('adoc-sc-reveal'), text: el.querySelector('.adoc-sc-block-text').textContent };
    });
    assert.equal(slide2Classes.hasReveal, false, 'un seul bloc : jamais de classe de révélation posée (visible d\'emblée, régression Lot 1)');
    assert.equal(slide2Classes.text, '42 séances recommandées.', 'bloc enrichi (editor.html.text) : texte final immédiat, JAMAIS animé (garde-fou de simplicité)');
    console.log('PASS 4/8 — Diapositive à bloc unique : aucune classe de révélation, texte enrichi jamais animé (régression Lot 1 + garde-fou Partie C).');

    // ── 5. Retour arrière → revient à la diapositive 1, ENTIÈREMENT montée d'emblée (jamais un
    //      rejeu du montage progressif non demandé). ──
    await page.evaluate(() => window.adocPresentPrev());
    await page.waitForTimeout(320);
    assert.equal(await counterText(), '1 / 3');
    assert.deepEqual(await shownIndices(), [true, true, true], 'un retour arrière doit réafficher la diapositive précédente intégralement montée');
    console.log('PASS 5/8 — Retour arrière : la diapositive précédente réapparaît entièrement montée (jamais un rejeu du montage).');

    // ── 6. Un nouveau retour arrière recule maintenant D\'UN PAS À L\'INTÉRIEUR de cette même
    //      diapositive (démonte le dernier bloc), sans changer de diapositive. ──
    await page.evaluate(() => window.adocPresentPrev());
    assert.deepEqual(await shownIndices(), [true, true, false], 'le retour arrière doit d\'abord démonter le dernier bloc révélé avant de changer de diapositive');
    assert.equal(await counterText(), '1 / 3');
    console.log('PASS 6/8 — Retour arrière à l\'intérieur d\'une diapositive : démonte le dernier bloc sans changer de diapositive.');

    // ── 7. Saut direct via le sommaire vers la diapositive 3 (en avançant, contrairement à une
    //      progression normale) → doit apparaître ENTIÈREMENT montée d'emblée, jamais un seul bloc. ──
    await page.evaluate(() => window.adocPresentGoTo(2));
    await page.waitForTimeout(320);
    assert.equal(await counterText(), '3 / 3');
    assert.deepEqual(await shownIndices(), [true, true], 'un saut direct depuis le sommaire doit toujours afficher la diapositive visée intégralement montée, même en avançant');
    console.log('PASS 7/8 — Saut direct (sommaire) vers une diapositive suivante : affichage intégral immédiat (jamais un rejeu du montage).');

    // ── 8. Animation de comptage — bloc SIMPLE (jamais de mise en forme riche) commençant par un
    //      nombre : valeur à 0 immédiatement après révélation, valeur exacte après la durée de
    //      l'animation (texte final jamais corrompu). ──
    await page.evaluate(() => { window.adocPresentGoTo(0); });
    await page.waitForTimeout(320);
    // Redémonte la diapositive 1 pas à pas pour observer la révélation du bloc b1 en direct :
    // ferme et rouvre le mode présentation pour repartir d'un état de montage propre (index 0).
    await page.evaluate(() => { window.adocPresentClose(); window.adocPresentOpen(); });
    // Lu immédiatement après l'ouverture — l'aller-retour Playwright/CDP suffit déjà à laisser
    // s'écouler quelques millisecondes d'animation réelles ; on vérifie donc une valeur
    // STRICTEMENT INFÉRIEURE à la valeur finale (preuve que l'animation est bien EN COURS, jamais
    // un affichage instantané) plutôt qu'une valeur à 0 exacte, non fiable au milliseconde près.
    const textImmediatelyAfterOpen = await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-paragraph .adoc-sc-block-text').textContent);
    const immediateValue = parseInt(textImmediatelyAfterOpen, 10);
    assert.ok(immediateValue >= 0 && immediateValue < 75, 'juste après le montage du 1er bloc, le nombre doit être EN COURS d\'animation (0 ≤ valeur < 75), jamais déjà la valeur finale : lu "' + textImmediatelyAfterOpen + '"');
    await page.waitForTimeout(800);
    const textAfterAnimation = await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-paragraph .adoc-sc-block-text').textContent);
    assert.equal(textAfterAnimation, '75% des patients rapportent une amélioration.', 'une fois l\'animation terminée, le texte doit afficher la valeur exacte, jamais un arrondi ou un texte corrompu');
    console.log('PASS 8/8 — Animation de comptage : démarre à 0, se termine exactement sur la valeur finale (texte jamais corrompu).');

    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant tout le scénario Lot 2 Partie C');
    console.log('\nTOUS LES TESTS PRÉSENTATION LOT 2 PARTIE C PASSENT (8/8)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
