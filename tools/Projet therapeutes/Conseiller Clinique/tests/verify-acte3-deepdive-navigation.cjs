// Présentation ACTE 3 — navigation multi-niveaux dans la porte d'approfondissement.
//
// Éprouve DANS LE NAVIGATEUR, sur la vraie page : descente à 3 niveaux, remontée par "Reculer"
// un cran à la fois, retour direct par "Page maître" depuis le niveau 3, garde-fou cycle en
// navigation, Échap à plusieurs profondeurs, fil d'Ariane et sa troncature.
//
// Le point non négociable : `#cc-ws-present-slide-inner` doit rester STRICTEMENT intact — comparé
// byte pour byte avant et après chaque parcours. C'est ce qui garantit qu'aucun de ces gestes ne
// touche jamais à la diapositive de départ ni n'appelle adocPresentGoToInternal.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const lien = (text, targetId) => ({ text, targetId });
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'Essai ACTE 3', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{
    id: 'card-01', type: 'card',
    content: {
      title: 'Diapositive de départ', imageRef: null, imageAlt: '',
      blocks: [{
        id: 'paragraph-01', type: 'paragraph',
        content: { text: "Le stress chronique agit sur le corps entier." },
        citationIds: [], validation: {},
        deepDiveLinks: [lien('stress chronique', 'n1')],
      }],
    },
    citationIds: [], validation: {},
  }],
  deepDives: [
    { id: 'n1', title: 'Niveau 1 — le cortisol', paragraphs: [
        { text: "Le cortisol reste élevé et la boucle de retour s'émousse.", deepDiveLinks: [lien('boucle de retour', 'n2')] }] },
    { id: 'n2', title: 'Niveau 2 — la boucle de retour', paragraphs: [
        { text: "L'hippocampe cesse de freiner l'axe.", deepDiveLinks: [lien("l'axe", 'n3')] }] },
    { id: 'n3', title: 'Niveau 3 — axe HPA', paragraphs: [
        { text: "Trois organes en cascade, dont la surrénale.", deepDiveLinks: [lien('la surrénale', 'n4')] }] },
    { id: 'n4', title: 'Niveau 4 — la surrénale', paragraphs: ['Terminus de cette branche.'] },
    // Page qui tenterait de reboucler vers n1 : garde-fou de NAVIGATION (le filet de conversion
    // n'est pas en jeu ici, ce document est forgé, jamais converti).
    { id: 'boucle', title: 'Boucle', paragraphs: [{ text: 'retour au début', deepDiveLinks: [lien('retour au début', 'n1')] }] },
  ],
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [], avertissements = [];
    page.on('pageerror', e => erreurs.push(e.message));
    page.on('console', m => { if (m.type() === 'warning') avertissements.push(m.text()); });
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));

    const diapo = () => page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    const pile = () => page.evaluate(() => (window._adocPresentState.deepDiveStack || []).slice());
    const titre = () => page.evaluate(() => document.querySelector('.cc-ws-present-door-title')?.textContent);
    const chemin = () => page.evaluate(() => document.querySelector('.cc-ws-present-door-path')?.textContent);
    const porteOuverte = () => page.evaluate(() => document.getElementById('cc-ws-present-door').classList.contains('open'));
    const descendre = id => page.evaluate(i => window.adocPresentOpenDeepDive(i), id);

    const REFERENCE = await diapo();
    assert.ok(REFERENCE.length > 50, 'la diapositive doit être montée');

    // ── 1. DESCENTE à 3 niveaux, par le mécanisme réel (la puce du niveau précédent) ──
    await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').click());
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await titre(), 'Niveau 1 — le cortisol');
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    assert.equal(await titre(), 'Niveau 2 — la boucle de retour');
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    assert.equal(await titre(), 'Niveau 3 — axe HPA');
    assert.deepEqual(await pile(), ['n1', 'n2', 'n3']);
    assert.equal(await diapo(), REFERENCE, 'LA DIAPOSITIVE A ÉTÉ MODIFIÉE pendant la descente');
    console.log('PASS 1/8  descente à 3 niveaux par les puces réelles ; diapositive intacte byte pour byte.');

    // ── 2. FIL D'ARIANE — racine + un titre par niveau ──
    const c3 = await chemin();
    assert.ok(c3.includes('Diapositive 1'), 'la racine doit être la diapositive de départ : ' + c3);
    assert.ok(c3.includes('Niveau 3'), 'le niveau courant doit figurer : ' + c3);
    assert.ok(!c3.includes('…'), '4 segments : pas encore de troncature — ' + c3);
    console.log('PASS 2/8  fil d\'Ariane à 3 niveaux : "' + c3.replace(/\s+/g, ' ').trim() + '"');

    // ── 3. TRONCATURE au-delà de 4 segments ──
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    assert.equal(await titre(), 'Niveau 4 — la surrénale');
    const c4 = await chemin();
    assert.ok(c4.includes('…'), 'au-delà de 4 segments, le milieu doit être élidé : ' + c4);
    assert.ok(c4.includes('Diapositive 1') && c4.includes('Niveau 4'), 'racine et niveau courant doivent rester : ' + c4);
    console.log('PASS 3/8  troncature du fil d\'Ariane : "' + c4.replace(/\s+/g, ' ').trim() + '"');

    // ── 4. GARDE-FOU CYCLE EN NAVIGATION — rouvrir un id déjà dans le chemin est refusé ──
    avertissements.length = 0;
    const avant = await pile();
    await descendre('n1');
    assert.deepEqual(await pile(), avant, 'la pile ne doit pas bouger sur un refus');
    assert.equal(await titre(), 'Niveau 4 — la surrénale', 'le contenu affiché ne doit pas changer');
    assert.ok(avertissements.some(a => a.includes('déjà dans le chemin')), 'un avertissement console est attendu');
    console.log('PASS 4/8  garde-fou cycle en navigation : refus silencieux, aucun crash, pile inchangée.');

    // ── 5. RECULER, un cran à la fois, jusqu'à la fermeture ──
    for (const attendu of ['Niveau 3 — axe HPA', 'Niveau 2 — la boucle de retour', 'Niveau 1 — le cortisol']) {
      await page.evaluate(() => window.adocPresentDeepDiveBack());
      assert.equal(await titre(), attendu);
      assert.equal(await diapo(), REFERENCE, 'diapositive modifiée pendant le recul');
    }
    await page.evaluate(() => window.adocPresentDeepDiveBack());
    assert.equal(await porteOuverte(), false, 'pile vide → la porte se referme');
    assert.deepEqual(await pile(), []);
    assert.equal(await diapo(), REFERENCE, 'LA DIAPOSITIVE A ÉTÉ MODIFIÉE après Reculer ×4');
    console.log('PASS 5/8  Reculer ×4 : un cran à la fois puis fermeture ; diapositive intacte byte pour byte.');

    // ── 6. PAGE MAÎTRE depuis le niveau 3, en un seul geste ──
    await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').click());
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    assert.deepEqual(await pile(), ['n1', 'n2', 'n3']);
    await page.evaluate(() => window.adocPresentDeepDiveHome());
    assert.equal(await porteOuverte(), false, 'la porte doit être refermée');
    assert.deepEqual(await pile(), [], 'la pile doit être vidée d\'un coup');
    assert.equal(await diapo(), REFERENCE, 'LA DIAPOSITIVE A ÉTÉ MODIFIÉE par Page maître');
    console.log('PASS 6/8  Page maître depuis le niveau 3 : un seul geste ; diapositive intacte byte pour byte.');

    // ── 7. ÉCHAP — un niveau à la fois, comme "Reculer" ──
    await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').click());
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    assert.deepEqual(await pile(), ['n1', 'n2']);
    await page.keyboard.press('Escape');
    assert.equal(await titre(), 'Niveau 1 — le cortisol', 'Échap doit reculer d\'UN niveau');
    assert.equal(await porteOuverte(), true, 'la porte reste ouverte au niveau 1');
    await page.keyboard.press('Escape');
    assert.equal(await porteOuverte(), false, 'second Échap : la porte se referme');
    assert.equal(await page.evaluate(() => document.getElementById('cc-ws-present-overlay').classList.contains('open')), true,
      'le mode présentation NE doit PAS se fermer avec la porte');
    assert.equal(await diapo(), REFERENCE, 'diapositive modifiée par Échap');
    console.log('PASS 7/8  Échap : un niveau à la fois, présentation préservée, diapositive intacte.');

    // ── 8. AUCUN APPEL à adocPresentGoToInternal, à aucune profondeur ──
    const espion = await page.evaluate(async () => {
      let appels = 0;
      const vrai = window.adocPresentGoTo;
      // adocPresentGoToInternal n'est pas sur window : on espionne le seul chemin public qui y
      // mène, et on vérifie surtout que l'index de diapositive ne bouge jamais.
      window.adocPresentGoTo = function () { appels++; return vrai && vrai.apply(this, arguments); };
      const indexDepart = window._adocPresentState.index;
      window.adocPresentOpenDeepDive('n1');
      window.adocPresentOpenDeepDive('n2');
      window.adocPresentDeepDiveBack();
      window.adocPresentDeepDiveHome();
      const out = { appels: appels, indexDepart: indexDepart, indexFin: window._adocPresentState.index };
      window.adocPresentGoTo = vrai;
      return out;
    });
    assert.equal(espion.appels, 0, 'aucun de ces gestes ne doit changer de diapositive');
    assert.equal(espion.indexFin, espion.indexDepart, 'l\'index de diapositive ne doit jamais bouger');
    assert.equal(await diapo(), REFERENCE, 'diapositive modifiée pendant l\'espionnage');
    console.log('PASS 8/8  aucun changement de diapositive à aucune profondeur ; index inchangé.');

    assert.equal(erreurs.length, 0, 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('\nPASS verify-acte3-deepdive-navigation — 8/8.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
