// LOT B6 — les deux gestes de retour passent en icônes, sans rien perdre.
//
// Le texte « ‹ Reculer » / « ⌂ Page maître » se lisait mal en vidéoprojection, et « ⌂ » est un
// caractère typographique dont le dessin varie d'une police à l'autre. Deux icônes dessinées, donc.
// Ce qu'un tel changement fait perdre en silence, et que ce test interdit :
//   — le LIBELLÉ, s'il disparaissait au lieu de passer en aria-label et title ;
//   — la CIBLE, si le bouton rétrécissait à la taille du dessin ;
//   — l'un des deux GESTES, si l'on profitait du remaniement pour n'en garder qu'un.
// Tout est mesuré dans le navigateur, et refait dans le fichier exporté.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-b6-icones-retour.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lien = (text, targetId) => ({ text, targetId });
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'B6 icones', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{ id: 'card-01', type: 'card', content: { title: 'Diapositive', imageRef: null, imageAlt: '', blocks: [
    { id: 'paragraph-01', type: 'paragraph', content: { text: 'Le stress chronique agit.' }, citationIds: [], validation: {},
      deepDiveLinks: [lien('stress chronique', 'n1')] }] }, citationIds: [], validation: {} }],
  deepDives: [
    { id: 'n1', title: 'Niveau 1', paragraphs: [{ text: 'Vers le niveau 2.', deepDiveLinks: [lien('niveau 2', 'n2')] }] },
    { id: 'n2', title: 'Niveau 2', paragraphs: [{ text: 'Vers le niveau 3.', deepDiveLinks: [lien('niveau 3', 'n3')] }] },
    { id: 'n3', title: 'Niveau 3', paragraphs: ['Terminus.'] },
  ],
};
const CAPTURES = path.join(os.tmpdir(), 'cc-b6-captures');

async function preparer(page, url, doc) {
  await page.goto(url);
  // Depuis la phase 3, un fichier exporté attend le geste « ▶ Démarrer » et ne s'ouvre plus
  // seul. Sans effet sur une page live, qui n'a pas cet écran.
  await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
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
  await page.waitForSelector('#cc-ws-present-slide-inner #paragraph-01');
}
const descendre = async (page, niveaux) => {
  await page.evaluate(() => window.adocPresentOpenDeepDive('n1'));
  await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
  for (let i = 2; i <= niveaux; i++) {
    await page.evaluate(n => window.adocPresentOpenDeepDive('n' + n), i);
    await page.waitForFunction(n => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('Niveau ' + n), i);
  }
};
const titre = page => page.evaluate(() => document.querySelector('.cc-ws-present-door-title')?.textContent || '');
const gestes = page => page.evaluate(() => [...document.querySelectorAll('.cc-ws-present-door-btn')].map(b => {
  const r = b.getBoundingClientRect(); const svg = b.querySelector('svg');
  return { label: b.getAttribute('aria-label'), title: b.getAttribute('title'), texte: b.textContent.trim(),
           svg: !!svg, svgCache: svg ? svg.getAttribute('aria-hidden') : null,
           l: Math.round(r.width), h: Math.round(r.height) };
}));

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
    await descendre(page, 3);

    // ── 1. LES DEUX GESTES, EN ICÔNES, NOMMÉS ──────────────────────────────────────────────────
    const g = await gestes(page);
    assert.equal(g.length, 2, 'les DEUX gestes doivent subsister, jamais un seul');
    assert.ok(g.every(b => b.svg), 'chaque bouton doit porter une icône dessinée, jamais un caractère typographique');
    assert.deepEqual(g.map(b => b.label), ["Reculer d'un niveau", 'Revenir à la diapositive'],
      'le libellé doit survivre en aria-label : ' + JSON.stringify(g.map(b => b.label)));
    assert.deepEqual(g.map(b => b.title), g.map(b => b.label), 'le même libellé doit être donné en infobulle');
    assert.ok(g.every(b => b.texte === ''), 'plus de texte visible : ce sont bien des icônes');
    console.log('PASS 1/8  deux icônes dessinées, libellés conservés en aria-label ET title.');

    // ── 2. L'ICÔNE NE DOIT PAS ÊTRE ANNONCÉE EN PLUS DU LIBELLÉ ────────────────────────────────
    assert.ok(g.every(b => b.svgCache === 'true'),
      'le SVG doit être aria-hidden, sinon certains lecteurs d\'écran annoncent le dessin EN PLUS du libellé');
    console.log('PASS 2/8  le dessin est masqué aux lecteurs d\'écran : le libellé est annoncé une seule fois.');

    // ── 3. LA CIBLE — mesurée dans la vraie mise en page ───────────────────────────────────────
    assert.ok(g.every(b => b.l >= 40 && b.h >= 40),
      'chaque cible doit faire au moins 40 px de côté ; mesuré ' + JSON.stringify(g.map(b => b.l + 'x' + b.h)));
    await page.screenshot({ path: path.join(CAPTURES, 'b6-01-icones-niveau3.png') });
    console.log('PASS 3/8  cibles mesurées à ' + g.map(b => b.l + '×' + b.h).join(' et ') + ' px.');

    // ── 4. RECULER — un cran à la fois, par de VRAIS clics ─────────────────────────────────────
    const avant = await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    await page.locator('.cc-ws-present-door-btn').first().click();
    await page.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('Niveau 2'));
    assert.match(await titre(page), /Niveau 2/, 'le premier bouton doit reculer d\'UN cran');
    await page.locator('.cc-ws-present-door-btn').first().click();
    await page.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('Niveau 1'));
    console.log('PASS 4/8  clic RÉEL sur la flèche : recul d\'un cran à la fois.');

    // ── 5. MAISON — retour direct depuis la profondeur ─────────────────────────────────────────
    await descendre(page, 3);
    await page.locator('.cc-ws-present-door-btn').nth(1).click();
    await page.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await page.evaluate(() => window._adocPresentState.deepDiveStack.length), 0, 'la pile doit être vidée');
    assert.equal(await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML), avant,
      'la diapositive doit rester intacte byte pour byte');
    console.log('PASS 5/8  clic RÉEL sur la maison depuis le niveau 3 : retour direct, diapositive intacte.');

    // ── 6. ÉCHAP INCHANGÉ — un niveau à la fois ────────────────────────────────────────────────
    await descendre(page, 3);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('Niveau 2'));
    assert.match(await titre(page), /Niveau 2/, 'Échap doit toujours reculer d\'UN niveau, jamais tout fermer');
    assert.equal(await page.evaluate(() => window._adocPresentState.deepDiveStack.length), 2);
    console.log('PASS 6/8  Échap inchangé : un niveau à la fois, comme avant les icônes.');

    // ── 7. LE MÊME DANS LE FICHIER EXPORTÉ ─────────────────────────────────────────────────────
    const fichier = path.join(os.tmpdir(), 'cc-b6-export.html');
    fs.writeFileSync(fichier, await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d), DOC), 'utf8');
    const exp = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const expErreurs = [];
    exp.on('pageerror', e => expErreurs.push(e.message));
    await preparer(exp, 'file://' + fichier, null);
    await descendre(exp, 3);
    const ge = await gestes(exp);
    assert.equal(ge.length, 2, 'deux gestes DANS L\'EXPORT');
    assert.ok(ge.every(b => b.svg && b.svgCache === 'true'), 'icônes dessinées et masquées aux lecteurs d\'écran DANS L\'EXPORT');
    assert.deepEqual(ge.map(b => b.label), ["Reculer d'un niveau", 'Revenir à la diapositive'], 'libellés DANS L\'EXPORT');
    assert.ok(ge.every(b => b.l >= 40 && b.h >= 40), 'cibles DANS L\'EXPORT : ' + JSON.stringify(ge.map(b => b.l + 'x' + b.h)));
    await exp.screenshot({ path: path.join(CAPTURES, 'b6-02-export-icones.png') });
    console.log('PASS 7/8  export : deux icônes, libellés, cibles ' + ge.map(b => b.l + '×' + b.h).join(' et ') + ' px.');

    const expAvant = await exp.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    await exp.locator('.cc-ws-present-door-btn').first().click();
    await exp.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('Niveau 2'));
    await exp.locator('.cc-ws-present-door-btn').nth(1).click();
    await exp.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await exp.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML), expAvant,
      'diapositive intacte DANS L\'EXPORT');
    assert.deepEqual(expErreurs, [], 'aucune erreur dans le fichier exporté : ' + expErreurs.join(' | '));
    console.log('PASS 8/8  les deux gestes fonctionnent par vrais clics DANS L\'EXPORT ; 0 erreur.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('\n       captures : ' + CAPTURES);
    console.log('PASS verify-b6-icones-retour — 8/8.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
