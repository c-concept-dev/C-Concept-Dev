// LOT B3 — le sommaire liste aussi les pages d'approfondissement.
//
// Une page produite par le modèle n'était atteignable QUE par la puce du bloc qui y renvoie : si
// ce renvoi passait inaperçu, la page restait invisible pour toute la présentation. Le sommaire
// en donne la liste.
//
// Ce qui est éprouvé, par de VRAIS clics et dans le fichier exporté :
//   — la section existe et liste toutes les pages ; elle est ENTIÈREMENT ABSENTE s'il n'y en a pas ;
//   — le clic ferme le sommaire AVANT d'ouvrir la porte (jamais les deux ensemble) ;
//   — le chemin repart de zéro et sa racine est la diapositive COURANTE, pas la première ;
//   — la diapositive ne change pas, et reste intacte byte pour byte.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-b3-sommaire-approfondissements.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lien = (text, targetId) => ({ text, targetId });
const carte = (id, titre, blocs) => ({ id, type: 'card', content: { title: titre, imageRef: null, imageAlt: '', blocks: blocs }, citationIds: [], validation: {} });
const para = (id, texte, liens) => ({ id, type: 'paragraph', content: { text: texte }, citationIds: [], validation: {}, ...(liens ? { deepDiveLinks: liens } : {}) });

const BASE = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'B3 sommaire', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
};
const DOC = { ...BASE,
  blocks: [
    carte('card-01', 'Premiere diapositive', [para('paragraph-01', 'Le stress chronique agit sur le corps.', [lien('stress chronique', 'n1')])]),
    carte('card-02', 'Seconde diapositive', [para('paragraph-02', 'Rien ne renvoie nulle part ici.')]),
  ],
  deepDives: [
    { id: 'n1', title: 'Le cortisol', paragraphs: [{ text: "Le cortisol et la boucle de retour.", deepDiveLinks: [lien('boucle de retour', 'n2')] }] },
    { id: 'n2', title: 'La boucle de retour', paragraphs: ['Terminus de la branche.'] },
    // Page ORPHELINE : aucun bloc n'y renvoie. Sans le sommaire, elle serait inatteignable —
    // c'est exactement le cas que ce lot existe pour réparer.
    { id: 'n3', title: 'Page sans aucun renvoi vers elle', paragraphs: ['Atteignable seulement par le sommaire.'] },
  ],
};
const DOC_SANS = { ...BASE, blocks: [carte('card-01', 'Sans approfondissement', [para('paragraph-01', 'Rien de plus.')])] };

const CAPTURES = path.join(os.tmpdir(), 'cc-b3-captures');

async function preparer(page, url, doc) {
  await page.goto(url);
  await page.bringToFront();
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('cc-landing')?.remove();
    document.getElementById('cc-workspace')?.classList.add('open');
  });
  if (doc) {
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), doc);
  }
  await page.waitForFunction(() => document.getElementById('cc-ws-present-slide-inner'));
}
const etatSommaire = page => page.evaluate(() => {
  const toc = document.getElementById('cc-ws-present-toc');
  const porte = document.getElementById('cc-ws-present-door');
  return {
    sommaireOuvert: !!toc && !toc.hidden,
    porteOuverte: !!porte && porte.classList.contains('open'),
    entrees: toc ? [...toc.querySelectorAll('.cc-ws-present-toc-dive')].map(b => b.textContent.replace(/^↳/, '').trim()) : [],
    intitule: toc ? !!toc.querySelector('.cc-ws-present-toc-titre') : false,
    diapositives: toc ? toc.querySelectorAll('.cc-ws-present-toc-item:not(.cc-ws-present-toc-dive)').length : 0,
  };
});
const filAriane = page => page.evaluate(() =>
  (document.querySelector('.cc-ws-present-door-path')?.textContent || '').replace(/\s+/g, ' ').trim());

(async () => {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ATELIER = 'file://' + path.join(__dirname, '../studio-clinique.html');
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await preparer(page, ATELIER, DOC);

    // ── 1. LA SECTION EXISTE ET EST COMPLÈTE ───────────────────────────────────────────────────
    await page.click('#cc-ws-present-toc-btn, [onclick*="adocPresentToggleToc"]');
    let e = await etatSommaire(page);
    assert.equal(e.sommaireOuvert, true, 'le sommaire doit s\'ouvrir');
    assert.equal(e.diapositives, 2, 'les deux diapositives restent listées');
    assert.deepEqual(e.entrees, ['Le cortisol', 'La boucle de retour', 'Page sans aucun renvoi vers elle'],
      'TOUTES les pages doivent être listées, y compris celle vers laquelle aucun bloc ne renvoie');
    assert.equal(e.intitule, true, 'la section doit porter son intitulé');
    await page.screenshot({ path: path.join(CAPTURES, 'b3-01-sommaire.png') });
    console.log('PASS 1/9  la section liste les 3 pages, dont une qu\'aucun bloc n\'atteint.');

    // ── 2. AUCUNE SECTION QUAND IL N'Y A AUCUNE PAGE ───────────────────────────────────────────
    const vierge = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await preparer(vierge, ATELIER, DOC_SANS);
    await vierge.click('#cc-ws-present-toc-btn, [onclick*="adocPresentToggleToc"]');
    const eVide = await etatSommaire(vierge);
    assert.equal(eVide.entrees.length, 0);
    assert.equal(eVide.intitule, false, 'jamais un intitulé au-dessus d\'une liste vide');
    assert.equal(await vierge.evaluate(() => !!document.querySelector('#cc-ws-present-toc .cc-ws-present-toc-sep')), false,
      'jamais un séparateur non plus : la section est ENTIÈREMENT absente');
    await vierge.close();
    console.log('PASS 2/9  document sans page : ni intitulé, ni séparateur, ni entrée — section absente.');

    // ── 3. DEPUIS LA SECONDE DIAPOSITIVE — la racine du fil d'Ariane doit la suivre ─────────────
    await page.click('.cc-ws-present-toc-item[data-idx="1"]');
    await page.waitForFunction(() => window._adocPresentState.index === 1);
    const index1 = await page.evaluate(() => window._adocPresentState.index);
    const avant = await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);

    await page.click('#cc-ws-present-toc-btn, [onclick*="adocPresentToggleToc"]');
    assert.equal((await etatSommaire(page)).sommaireOuvert, true);
    await page.click('.cc-ws-present-toc-dive[data-dive="n3"]');
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    e = await etatSommaire(page);
    assert.equal(e.porteOuverte, true, 'la porte doit être ouverte');
    assert.equal(e.sommaireOuvert, false, 'le sommaire doit être REFERMÉ : jamais les deux ensemble');
    console.log('PASS 3/9  le clic ferme le sommaire AVANT d\'ouvrir la porte.');

    const fil = await filAriane(page);
    assert.match(fil, /Diapositive 2/, 'la racine du chemin doit être la diapositive COURANTE ; obtenu : ' + fil);
    assert.match(fil, /Page sans aucun renvoi/, 'le chemin doit mentionner la page ouverte ; obtenu : ' + fil);
    assert.ok(!/Le cortisol|boucle de retour/.test(fil), 'le chemin doit repartir de ZÉRO, sans page héritée ; obtenu : ' + fil);
    await page.screenshot({ path: path.join(CAPTURES, 'b3-02-page-depuis-sommaire.png') });
    console.log('PASS 4/9  chemin reparti de zéro, enraciné sur la diapositive courante : « ' + fil + ' »');

    assert.equal(await page.evaluate(() => window._adocPresentState.index), index1, 'la diapositive ne doit pas changer');
    assert.equal(await page.evaluate(() => window._adocPresentState.deepDiveStack.length), 1, 'un seul niveau dans la pile');
    console.log('PASS 5/9  la diapositive ne bouge pas ; la pile contient exactement un niveau.');

    // ── 4. RETOUR — la porte se referme, la diapositive est intacte ─────────────────────────────
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML), avant,
      'la diapositive doit rester intacte byte pour byte');
    console.log('PASS 6/9  Échap referme ; diapositive intacte byte pour byte.');

    // ── 5. DEUX OUVERTURES SUCCESSIVES — la pile ne s'accumule jamais ───────────────────────────
    for (const cible of ['n1', 'n3']) {
      await page.click('#cc-ws-present-toc-btn, [onclick*="adocPresentToggleToc"]');
      await page.click('.cc-ws-present-toc-dive[data-dive="' + cible + '"]');
      await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
      assert.equal(await page.evaluate(() => window._adocPresentState.deepDiveStack.length), 1,
        'chaque ouverture depuis le sommaire repart de zéro, jamais une pile qui s\'accumule (' + cible + ')');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    }
    console.log('PASS 7/9  deux ouvertures successives : la pile repart de zéro à chaque fois.');

    // ── 6. LE MÊME PARCOURS DANS LE FICHIER EXPORTÉ ────────────────────────────────────────────
    const fichier = path.join(os.tmpdir(), 'cc-b3-export.html');
    fs.writeFileSync(fichier, await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d), DOC), 'utf8');
    const exp = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const expErreurs = [];
    exp.on('pageerror', x => expErreurs.push(x.message));
    await preparer(exp, 'file://' + fichier, null);
    await exp.click('#cc-ws-present-toc-btn, [onclick*="adocPresentToggleToc"]');
    const eExp = await etatSommaire(exp);
    assert.deepEqual(eExp.entrees, ['Le cortisol', 'La boucle de retour', 'Page sans aucun renvoi vers elle'],
      'la section doit exister À L\'IDENTIQUE dans l\'export');
    console.log('PASS 8/9  la section est présente et complète DANS L\'EXPORT.');

    await exp.click('.cc-ws-present-toc-dive[data-dive="n3"]');
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    const eExp2 = await etatSommaire(exp);
    assert.equal(eExp2.sommaireOuvert, false, 'sommaire refermé DANS L\'EXPORT');
    const filExp = await filAriane(exp);
    assert.match(filExp, /Page sans aucun renvoi/, 'chemin dans l\'export ; obtenu : ' + filExp);
    await exp.screenshot({ path: path.join(CAPTURES, 'b3-03-export-depuis-sommaire.png') });
    assert.deepEqual(expErreurs, [], 'aucune erreur dans le fichier exporté : ' + expErreurs.join(' | '));
    console.log('PASS 9/9  clic RÉEL depuis le sommaire DANS L\'EXPORT : la porte s\'ouvre, 0 erreur.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('\n       captures : ' + CAPTURES);
    console.log('PASS verify-b3-sommaire-approfondissements — 9/9.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
