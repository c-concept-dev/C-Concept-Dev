// ALIGNEMENT DU CLIC SUR IMAGE (option 4) — un seul contrat sur les DEUX porteurs :
//     le clic sur l'image AGRANDIT, la puce « ↳ Approfondir » est le SEUL accès au renvoi.
//
// ÉTAT MESURÉ AVANT CE LOT, et il contredisait le commentaire du code :
//   couverture de carte  → clic AUCUN, curseur auto, hors tabulation (avec ou sans renvoi)
//   bloc image en ligne  → clic AGRANDIR sans renvoi, clic PAGE avec renvoi (exclusifs)
// La couverture n'avait donc JAMAIS eu l'agrandissement, et sur le bloc le même clic changeait de
// sens selon la présence d'un lien — invisible au lecteur.
//
// CE QUE CE TEST DOIT PROUVER, et qu'une lecture du source ne prouve pas : que les deux gestes
// coexistent sans conflit de clic, par de VRAIS clics, dans la page vivante ET dans un export
// réellement construit et ouvert.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const lien = (text, targetId) => ({ text, targetId });
const img = (id, liens, largeur) => {
  const b = { id, type: 'image',
    content: { query: 'calm therapy room', alt: 'Une scène clinique', widthPercent: largeur || 100 },
    citationIds: [], validation: {} };
  if (liens) b.deepDiveLinks = liens;
  return b;
};
const DOC = {
  documentKind: 'presentation', title: 'Alignement', citations: [],
  blocks: [
    // Couverture AVEC renvoi : c'est le cas qui n'existait pas — agrandissement ET puce.
    { id: 'c-couv', type: 'card', content: { title: 'Couverture', imageRef: 'therapist office',
      // Objets {text, targetId}, et NON les chaînes fléchées « expression → id » : celles-ci sont la
      // forme ENTRANTE, résolue par resoudreLiensCouverture pendant la conversion. Au rendu,
      // adocRenderCardHTML lit l.targetId — une chaîne brute y donne 'undefined' et la puce ne
      // mène nulle part.
      imageAlt: 'Un cabinet', coverDeepDiveLinks: [{ text: 'cabinet', targetId: 'n1' }], blocks: [] } },
    { id: 'c-couv-nue', type: 'card', content: { title: 'Couverture nue', imageRef: 'therapist office',
      imageAlt: 'Un cabinet', blocks: [] } },
    { id: 'c-blocs', type: 'card', content: { title: 'Blocs', imageRef: null, imageAlt: null,
      blocks: [img('b-lien', [lien('renvoi', 'n1')]), img('b-nu', null)] } },
  ],
  deepDives: [{ id: 'n1', title: 'La page visée', imageQuery: '', imageAlt: '',
    paragraphs: ['Un paragraphe assez long pour être mis en page dans la colonne de la porte.'] }],
};

const horsReseau = (p) => p.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());

// Relevé commun aux deux porteurs : le geste réellement porté par l'image, la présence des deux
// signaux, et leur géométrie — croisement et inclusion mesurés sur les boîtes réelles.
const releve = (p, selecteurImage, selecteurPuce, selecteurPastille) => p.evaluate((s) => {
  const inner = document.getElementById('cc-ws-present-slide-inner');
  const im = inner.querySelector(s.im);
  const pu = inner.querySelector(s.pu);
  const pa = inner.querySelector(s.pa);
  const B = (e) => e ? e.getBoundingClientRect() : null;
  const bi = B(im), bp = B(pa), bq = B(pu);
  const croise = (a, c) => (a && c) ? !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom) : null;
  const oc = im ? (im.getAttribute('onclick') || '') : '';
  return {
    geste: /OpenImageDoor/.test(oc) ? 'AGRANDIR' : /OpenDeepDive/.test(oc) ? 'PAGE' : (oc ? 'autre' : 'AUCUN'),
    curseur: im ? getComputedStyle(im).cursor : null,
    clavier: im ? (im.getAttribute('tabindex') === '0' && im.getAttribute('role') === 'button') : null,
    etiquette: im ? (im.getAttribute('aria-label') || '') : null,
    pastille: !!pa, puce: !!pu,
    clicsPastille: pa ? getComputedStyle(pa).pointerEvents : null,
    // Le test de collision RÉEL : ce que le navigateur désigne au centre de la pastille.
    sousPastille: bp ? (function () {
      const e = document.elementFromPoint(bp.left + bp.width / 2, bp.top + bp.height / 2);
      return e ? e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '') : 'hors';
    })() : null,
    pastilleXpuce: croise(bp, bq),
    pastilleSurImage: (bp && bi) ? (bp.left >= bi.left && bp.right <= bi.right && bp.top >= bi.top && bp.bottom <= bi.bottom) : null,
    boites: { image: bi && [Math.round(bi.left), Math.round(bi.top), Math.round(bi.width), Math.round(bi.height)],
              pastille: bp && [Math.round(bp.left), Math.round(bp.top), Math.round(bp.width), Math.round(bp.height)],
              puce: bq && [Math.round(bq.left), Math.round(bq.top), Math.round(bq.width), Math.round(bq.height)] },
  };
}, { im: selecteurImage, pu: selecteurPuce, pa: selecteurPastille });

// Laquelle des deux portes est ouverte. Le TITRE seul ne suffit pas, et c'est un piège mesuré :
// adocPresentOpenImageDoor masque .cc-ws-present-door-text sans réécrire son contenu, si bien que le
// titre de la page précédemment ouverte y reste — lisible par querySelector alors qu'il n'est plus
// affiché. Un test qui s'y fie voit « PAGE » là où l'agrandissement est en fait à l'écran. C'est
// `hidden`, le signal que la production elle-même emploie, qui tranche.
const porteOuverte = (p) => p.evaluate(() => {
  const door = document.getElementById('cc-ws-present-door');
  const textEl = door ? door.querySelector('.cc-ws-present-door-text') : null;
  const pageVisible = !!(textEl && !textEl.hidden);
  return {
    ouverte: !!(door && door.classList.contains('open')),
    sorte: pageVisible ? 'PAGE' : 'AGRANDISSEMENT',
    titre: pageVisible ? (textEl.querySelector('.cc-ws-present-door-title')?.textContent || null) : null,
  };
});
const fermerPorte = async (p) => {
  await p.evaluate(() => window.adocPresentCloseImageDoor());
  await p.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
};

async function ouvrirVivant(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await horsReseau(page);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('assistdoc-screen')?.classList.add('active');
    document.getElementById('cc-workspace')?.classList.add('open');
  });
  await page.evaluate((d) => window.adocPresentOpenWithDoc(d), DOC);
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
  await page.waitForTimeout(400);
  return { page, erreurs };
}

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'alignement-'));
  let n = 0;
  try {
    const { page, erreurs } = await ouvrirVivant(browser);
    const COUV = { im: 'img.adoc-sc-card-img', pu: '.adoc-sc-card-cover-chip', pa: '.adoc-sc-card-zoom-badge' };

    // ── 1 — LA COUVERTURE GAGNE L'AGRANDISSEMENT, et garde sa puce ──────────────────────────
    let r = await releve(page, COUV.im, COUV.pu, COUV.pa);
    assert.equal(r.geste, 'AGRANDIR',
      'la couverture de carte doit désormais agrandir au clic — elle ne portait AUCUN onclick avant '
      + 'ce lot, contrairement à ce qu\'affirmait le commentaire du code');
    assert.equal(r.curseur, 'zoom-in', 'et le dire par son curseur');
    assert.equal(r.clavier, true,
      'accès clavier posé EN MÊME TEMPS que l\'onclick, jamais après : c\'est l\'oubli exact qu\'il a '
      + 'fallu rattraper pour le bloc en ligne, et en vidéoprojection il n\'y a souvent qu\'un clavier');
    assert.match(r.etiquette, /^Agrandir l'image : Un cabinet$/, 'étiquette : ' + r.etiquette);
    assert.equal(r.pastille, true, 'et porter la pastille');
    assert.equal(r.puce, true, 'tout en gardant sa puce : les deux coexistent, c\'est tout l\'objet');
    console.log('PASS ' + (++n) + '/7 — couverture : agrandissement + clavier + pastille, sans perdre sa puce.');

    // ── 2 — GÉOMÉTRIE SUR LA COUVERTURE 1511×374 ────────────────────────────────────────────
    assert.deepEqual(r.boites.image.slice(2), [1511, 374],
      'préalable : la couverture mesure bien 1511×374 dans cette fenêtre — ' + JSON.stringify(r.boites));
    assert.equal(r.pastilleSurImage, true,
      'la pastille doit reposer SUR la couverture, jamais flotter à côté. Elle est ancrée sur '
      + '.adoc-sc-card (32px = 18px de padding + 14px de retrait) et NON sur une enveloppe de '
      + 'l\'image, dont le max-height:45% deviendrait indéfini : si le padding de la carte change, '
      + 'cette assertion échoue au lieu de laisser la pastille dériver en silence. '
      + JSON.stringify(r.boites));
    assert.equal(r.pastilleXpuce, false,
      'et ne croiser à aucun endroit la puce, qui est SOUS l\'image, dans le flux : '
      + JSON.stringify(r.boites));
    assert.equal(r.clicsPastille, 'none', 'pointer-events:none : la pastille n\'intercepte pas le clic');
    assert.equal(r.sousPastille, 'img.adoc-sc-card-img',
      'au centre de la pastille, le navigateur doit désigner l\'IMAGE — preuve directe que le clic '
      + 'traverse. Reçu : ' + r.sousPastille);
    console.log('PASS ' + (++n) + '/7 — couverture 1511×374 : pastille sur l\'image, aucun croisement avec la puce, clic traversant.');

    // ── 3 — LES DEUX GESTES, PAR DE VRAIS CLICS, SANS CONFLIT ───────────────────────────────
    await page.locator('#cc-ws-present-slide-inner img.adoc-sc-card-img').click();
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    let porte = await porteOuverte(page);
    assert.equal(porte.sorte, 'AGRANDISSEMENT', 'un clic sur la couverture ouvre l\'AGRANDISSEMENT, pas une page');
    await fermerPorte(page);

    await page.locator('#cc-ws-present-slide-inner .adoc-sc-card-cover-chip').click();
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    porte = await porteOuverte(page);
    assert.deepEqual([porte.sorte, porte.titre], ['PAGE', 'La page visée'],
      'et un clic sur la puce ouvre la PAGE : deux cibles, deux gestes, aucun conflit');
    await fermerPorte(page);
    console.log('PASS ' + (++n) + '/7 — couverture : vrais clics, agrandissement par l\'image et page par la puce.');

    // ── 4 — LA COUVERTURE SANS RENVOI garde l'agrandissement et n'invente pas de puce ───────
    await page.evaluate(() => window.adocPresentGoTo(1));
    await page.waitForTimeout(500);
    r = await releve(page, COUV.im, COUV.pu, COUV.pa);
    assert.equal(r.geste, 'AGRANDIR', 'sans renvoi, la couverture agrandit toujours');
    assert.equal(r.pastille, true, 'et porte la pastille');
    assert.equal(r.puce, false, 'sans puce, puisqu\'il n\'y a aucun renvoi à annoncer');
    assert.equal(r.pastilleSurImage, true, 'pastille toujours sur l\'image : ' + JSON.stringify(r.boites));
    console.log('PASS ' + (++n) + '/7 — couverture sans renvoi : agrandissement conservé, aucune puce inventée.');

    // ── 5 — LE BLOC EN LIGNE : l'agrandissement ne disparaît PLUS quand un renvoi existe ────
    await page.evaluate(() => window.adocPresentGoTo(2));
    await page.waitForTimeout(500);
    const BL = { im: '#b-lien img', pu: '#b-lien .adoc-sc-deepdive-chip', pa: '#b-lien .adoc-sc-image-zoom-badge' };
    r = await releve(page, BL.im, BL.pu, BL.pa);
    assert.equal(r.geste, 'AGRANDIR',
      'AVEC un renvoi, le clic doit désormais AGRANDIR — c\'était le ternaire à retirer : le même '
      + 'clic changeait de sens selon la présence d\'un lien');
    assert.equal(r.curseur, 'zoom-in', 'curseur aligné sur le geste');
    assert.match(r.etiquette, /^Agrandir l'image : Une scène clinique$/,
      'et l\'étiquette aussi : le renvoi est annoncé par SA puce, qui est un bouton atteignable au '
      + 'clavier avec son propre libellé. Reçu : ' + r.etiquette);
    assert.equal(r.pastille, true,
      'la pastille s\'affiche désormais MÊME avec un renvoi : sa condition !imgLienActif n\'était pas '
      + 'un choix de conception, mais la conséquence de la disparition de l\'agrandissement');
    assert.equal(r.puce, true, 'et la puce reste, seul accès au renvoi');
    assert.equal(r.pastilleXpuce, false,
      'les deux signaux ne se croisent pas : pastille en haut à GAUCHE, puce en haut à DROITE — '
      + JSON.stringify(r.boites));
    assert.equal(r.sousPastille, 'img', 'et le clic traverse la pastille jusqu\'à l\'image');
    console.log('PASS ' + (++n) + '/7 — bloc en ligne avec renvoi : agrandit, pastille ET puce, sans croisement.');

    // ── 6 — LES DEUX GESTES SUR LE BLOC, PAR DE VRAIS CLICS ─────────────────────────────────
    await page.locator('#b-lien img').click();
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    porte = await porteOuverte(page);
    assert.equal(porte.sorte, 'AGRANDISSEMENT', 'clic sur l\'image du bloc : agrandissement');
    await fermerPorte(page);
    await page.locator('#b-lien .adoc-sc-deepdive-chip').click();
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    porte = await porteOuverte(page);
    assert.deepEqual([porte.sorte, porte.titre], ['PAGE', 'La page visée'], 'clic sur la puce du bloc : la page');
    await fermerPorte(page);
    // Et le bloc NU reste exactement ce qu'il était.
    const nu = await releve(page, '#b-nu img', '#b-nu .adoc-sc-deepdive-chip', '#b-nu .adoc-sc-image-zoom-badge');
    assert.equal(nu.geste, 'AGRANDIR', 'un bloc sans renvoi agrandit, comme avant ce lot');
    assert.equal(nu.puce, false, 'sans puce');
    assert.equal(nu.pastille, true, 'avec pastille');
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/7 — bloc en ligne : vrais clics sur les deux cibles, et le cas sans renvoi intact.');
    await page.close();

    // ── 7 — DANS UN EXPORT RÉELLEMENT CONSTRUIT ET OUVERT ───────────────────────────────────
    const atelier = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    const errAtelier = [];
    atelier.on('pageerror', (e) => errAtelier.push(e.message));
    await horsReseau(atelier);
    await atelier.goto(PAGE);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    await atelier.close();
    // Le graphe d'export : adocIconeLoupeHTML est une fonction INTERNE appelée au rendu de chaque
    // diapositive. Son absence d'engineFnRefs lèverait une ReferenceError que le garde-fou onclick
    // ne voit pas — trois précédents.
    assert.match(html, /adocIconeLoupeHTML/, 'adocIconeLoupeHTML doit être sérialisée dans l\'export');
    assert.match(html, /adoc-sc-card-zoom-badge\{/, 'et la CSS de position de la pastille de couverture');
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');

    const exp = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    const errExp = [];
    exp.on('pageerror', (e) => errExp.push(e.message));
    await horsReseau(exp);
    await exp.goto('file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await exp.waitForTimeout(500);
    const rExp = await releve(exp, COUV.im, COUV.pu, COUV.pa);
    assert.equal(rExp.geste, 'AGRANDIR', 'dans l\'export aussi, la couverture agrandit');
    assert.equal(rExp.pastille, true, 'et porte sa pastille');
    assert.equal(rExp.pastilleSurImage, true, 'posée sur l\'image : ' + JSON.stringify(rExp.boites));
    assert.equal(rExp.pastilleXpuce, false, 'sans croiser la puce');
    await exp.locator('#cc-ws-present-slide-inner img.adoc-sc-card-img').click();
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal((await porteOuverte(exp)).sorte, 'AGRANDISSEMENT', 'clic image → agrandissement, dans l\'export');
    await fermerPorte(exp);
    await exp.locator('#cc-ws-present-slide-inner .adoc-sc-card-cover-chip').click();
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.deepEqual([(await porteOuverte(exp)).sorte, (await porteOuverte(exp)).titre], ['PAGE', 'La page visée'],
      'clic puce → la page, dans l\'export');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    assert.deepEqual(errAtelier, [], 'ni à la construction : ' + errAtelier.join(' | '));
    console.log('PASS ' + (++n) + '/7 — export construit et ouvert : les deux gestes sans conflit, 0 erreur.');
    await exp.close();

    console.log('\nTOUS LES TESTS D\'ALIGNEMENT PASSENT (' + n + '/7)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
