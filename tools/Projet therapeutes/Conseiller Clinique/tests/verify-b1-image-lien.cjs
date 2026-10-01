// LOT B1 — une image peut mener à une page d'approfondissement.
//
// Trois plans, du plus isolé au plus réel :
//   1. la fonction pure de filtrage (adocFilterBlockDeepDiveLinks) : c'est là que vit le repli de
//      libellé, le cas qu'aucun contrôle visuel ne révèle ;
//   2. la page vivante : attributs rendus, puce « ↳ Approfondir » sous l'image, vrais clics ;
//   3. le FICHIER EXPORTÉ, réellement écrit, ouvert, et cliqué jusqu'au niveau 3 — seul plan qui
//      voit une fonction interne oubliée d'engineFnRefs (trois précédents) ou un élément absent de
//      la coquille codée en dur.
//
// Invariant non négociable, repris de l'Acte 3 : #cc-ws-present-slide-inner reste STRICTEMENT
// intact, comparé byte pour byte avant et après chaque parcours.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-b1-image-lien.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lien = (text, targetId) => ({ text, targetId });

const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'B1 image lien', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{
    id: 'card-01', type: 'card',
    content: {
      title: 'Diapositive de départ', imageRef: null, imageAlt: '',
      blocks: [
        { id: 'paragraph-01', type: 'paragraph', content: { text: 'Une phrase sans aucun renvoi.' }, citationIds: [], validation: {} },
        // L'image PORTEUSE de renvoi.
        { id: 'image-01', type: 'image', content: { query: 'cortisol', alt: 'Coupe du cerveau' },
          citationIds: [], validation: {}, deepDiveLinks: [lien('Coupe du cerveau', 'n1')] },
        // Une seconde image SANS renvoi : son agrandissement doit rester intact.
        { id: 'image-02', type: 'image', content: { query: 'couple', alt: 'Deux mains' }, citationIds: [], validation: {} },
      ],
    },
    citationIds: [], validation: {},
  }],
  deepDives: [
    { id: 'n1', title: 'Niveau 1 — le cortisol', paragraphs: [
        { text: "Le cortisol reste élevé et la boucle de retour s'émousse.", deepDiveLinks: [lien('boucle de retour', 'n2')] }] },
    { id: 'n2', title: 'Niveau 2 — la boucle', paragraphs: [
        { text: "L'hippocampe cesse de freiner l'axe.", deepDiveLinks: [lien("l'axe", 'n3')] }] },
    { id: 'n3', title: 'Niveau 3 — axe HPA', paragraphs: ['Terminus de cette branche.'] },
  ],
};

const CAPTURES = path.join(os.tmpdir(), 'cc-b1-captures');

// Un bloc non encore révélé porte pointer-events:none : aucun clic ne peut l'atteindre, et c'est
// le comportement voulu. Le parcours RÉEL est donc celui de la présentatrice — révéler, puis
// cliquer. On avance la révélation par la vraie touche, jamais en forçant le clic ni en touchant
// au DOM : un test qui contournerait pointer-events ne prouverait rien de ce qu'elle vivra.
async function revelerJusqua(page, selecteur) {
  // Critère d'arrêt : un clic au centre de l'élément l'ATTEINDRAIT réellement. Ni la classe
  // (elle ne dit pas si pointer-events laisse passer) ni la « visibilité » au sens de Playwright
  // (opacity:0 y reste visible) ne suffisent — c'est elementFromPoint qui tranche, exactement
  // comme le navigateur le fera sous le doigt de la présentatrice. On avance par la vraie touche,
  // sans jamais forcer le clic ni toucher au DOM.
  for (let i = 0; i <= 12; i++) {
    const atteignable = await page.evaluate(sel => {
      const e = document.querySelector(sel);
      if (!e) return false;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const sous = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      // `sous.contains(e)` serait un piège : quand pointer-events:none laisse passer le clic
      // jusqu'au conteneur, elementFromPoint rend un ANCÊTRE — qui contient bien l'élément visé,
      // sans que le clic l'atteigne pour autant. Seuls l'élément lui-même ou l'un de ses
      // descendants comptent.
      return !!sous && (sous === e || e.contains(sous));
    }, selecteur);
    if (atteignable) return i;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(280);
  }
  throw new Error('le clic n\'atteint jamais : ' + selecteur);
}

(async () => {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocFilterBlockDeepDiveLinks === 'function');
    // L'atelier est masqué (#cc-workspace sans .open → display:none) tant qu'aucun document n'est
    // ouvert : tout y mesurerait 0×0 et aucun clic de SOURIS ne pourrait atterrir. On ouvre donc
    // l'atelier par le mécanisme de l'application elle-même (adocOpenWorkspace fait exactement
    // ceci), afin que les clics de ce test soient de VRAIS clics à des coordonnées réelles, et
    // non des .click() programmatiques qui court-circuitent visibilité et pointer-events.
    await page.evaluate(() => {
      // L'écran de connexion (#cc-login-screen) est modal et intercepte tous les clics. Il est
      // simplement RETIRÉ DU CHEMIN : la présentation ne se joue jamais avant connexion, et ce
      // test ne porte pas sur l'authentification — aucune connexion n'est simulée ici.
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('cc-landing')?.remove();
      document.getElementById('cc-workspace').classList.add('open');
    });

    // ══ PLAN 1 — LA FONCTION PURE ══════════════════════════════════════════════════════════════
    const filtrer = (b, ids, titres) => page.evaluate(
      ([bb, ii, tt]) => window.adocFilterBlockDeepDiveLinks(bb, new Set(ii), tt), [b, ids, titres]);
    const TITRES = { n1: 'Niveau 1 — le cortisol' };
    const IDS = ['n1'];

    assert.deepEqual(
      await filtrer({ type: 'image', content: { alt: 'Coupe du cerveau' }, deepDiveLinks: [lien('libellé explicite', 'n1')] }, IDS, TITRES),
      [{ text: 'libellé explicite', targetId: 'n1' }],
      'un libellé fourni est conservé tel quel');
    console.log('PASS  1/12 image avec libellé : conservé tel quel.');

    assert.deepEqual(
      await filtrer({ type: 'image', content: { alt: 'Coupe du cerveau' }, deepDiveLinks: [lien('', 'n1')] }, IDS, TITRES),
      [{ text: 'Coupe du cerveau', targetId: 'n1' }],
      "libellé vide : repli sur l'alt de l'image, JAMAIS une suppression muette du renvoi");
    console.log("PASS  2/12 image sans libellé : repli sur l'alt.");

    assert.deepEqual(
      await filtrer({ type: 'image', content: { alt: '   ' }, deepDiveLinks: [lien('', 'n1')] }, IDS, TITRES),
      [{ text: 'Niveau 1 — le cortisol', targetId: 'n1' }],
      'libellé ET alt vides : repli sur le titre de la page visée');
    console.log('PASS  3/12 image sans libellé ni alt : repli sur le titre de la page visée.');

    assert.deepEqual(
      await filtrer({ type: 'image', content: { alt: 'x' }, deepDiveLinks: [lien('x', 'inexistant')] }, IDS, TITRES),
      [], 'une cible inexistante est retirée, comme partout ailleurs dans ce pipeline');
    console.log('PASS  4/12 image visant une page inexistante : renvoi retiré.');

    assert.deepEqual(
      await filtrer({ type: 'paragraph', content: { text: 'du texte' }, deepDiveLinks: [lien('', 'n1')] }, IDS, TITRES),
      [], "pour la PROSE, un libellé vide fait toujours tomber le renvoi : rien à souligner");
    console.log('PASS  5/12 prose sans libellé : renvoi retiré (comportement inchangé).');

    assert.deepEqual(
      await filtrer({ type: 'image', content: { alt: '' }, deepDiveLinks: [lien('', 'n1')] }, IDS, {}),
      [], 'aucun libellé possible du tout : renvoi retiré plutôt qu\'une puce vide');
    console.log('PASS  6/12 aucun libellé possible : renvoi retiré, jamais de puce vide.');

    // ══ PLAN 2 — LA PAGE VIVANTE ═══════════════════════════════════════════════════════════════
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    const nbImages = await page.evaluate(() =>
      document.querySelectorAll('#cc-ws-present-slide-inner .adoc-sc-image img').length);
    assert.equal(nbImages, 2, 'les deux images doivent être rendues');

    const etat = await page.evaluate(() => {
      const fig = id => document.querySelector('#cc-ws-present-slide-inner #' + id);
      const lire = id => {
        const f = fig(id); const img = f && f.querySelector('img');
        return {
          onclick: (img && img.getAttribute('onclick')) || null,
          curseur: (img && img.style.cursor) || null,
          puces: f ? Array.from(f.querySelectorAll('.adoc-sc-deepdive-chip')).map(c => c.getAttribute('onclick')) : null,
        };
      };
      return { avecLien: lire('image-01'), sansLien: lire('image-02') };
    });
    // ALIGNEMENT (option 4, décision explicite) — l'exclusivité est LEVÉE : l'image agrandit
    // toujours, la puce est le seul accès au renvoi. Ce test affirmait l'inverse, et c'était le
    // contrat d'alors : le même clic changeait de sens selon la présence d'un lien, invisible au
    // lecteur, alors que la règle tenue partout ailleurs est « jamais deux sens pour un seul geste ».
    // L'assertion n'est pas retirée mais RETOURNÉE, et renforcée du négatif correspondant.
    assert.match(etat.avecLien.onclick, /adocPresentOpenImageDoor\(this\)/,
      "l'image porteuse AGRANDIT désormais, même en portant un renvoi : " + etat.avecLien.onclick);
    assert.doesNotMatch(etat.avecLien.onclick, /adocPresentOpenDeepDive/,
      "et le renvoi ne doit JAMAIS être capté par l'image : c'est la puce qui y mène, elle seule");
    assert.equal(etat.avecLien.curseur, 'zoom-in', 'curseur zoom-in : le geste annoncé est l\'agrandissement');
    assert.equal(etat.avecLien.puces.length, 1, "la puce « ↳ Approfondir » doit exister sous l'image");
    assert.match(etat.avecLien.puces[0], /adocPresentOpenDeepDive\('n1'\)/);
    // Présente ne suffit pas : elle doit être VUE. Une image de diapositive déborde la hauteur
    // utile de la carte, et une puce placée après elle — ou en bas de l'image — tombe sous le
    // pli : dans le DOM, atteignable au clavier, jamais aperçue. Mesuré, pas supposé.
    const puceVue = await page.evaluate(() => {
      const c = document.querySelector('#cc-ws-present-slide-inner #image-01 .adoc-sc-deepdive-chip');
      const carte = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
      if (!c || !carte) return null;
      const r = c.getBoundingClientRect(), rc = carte.getBoundingClientRect();
      return { dedans: r.top >= rc.top && r.bottom <= rc.bottom + 1, puce: Math.round(r.top) + '-' + Math.round(r.bottom), carte: Math.round(rc.top) + '-' + Math.round(rc.bottom) };
    });
    assert.ok(puceVue && puceVue.dedans,
      'la puce doit tomber DANS la zone visible de la carte ; mesuré ' + JSON.stringify(puceVue));
    console.log('PASS  7/12 image porteuse : clic vers la page, curseur pointeur, puce présente ET visible.');

    assert.match(etat.sansLien.onclick, /adocPresentOpenImageDoor/, "sans renvoi, l'agrandissement est intact");
    assert.equal(etat.sansLien.curseur, 'zoom-in');
    assert.equal(etat.sansLien.puces.length, 0, 'aucune puce sur une image sans renvoi');
    console.log("PASS  8/12 image sans renvoi : agrandissement inchangé, aucune puce.");

    // Hors mode présentation, RIEN ne doit changer : ni porte, ni puce. Éprouvé sur l'export HTML
    // clinique, qui partage adocRenderBlockHTML avec la présentation mais n'active jamais le
    // drapeau — c'est précisément le partage de cette fonction qui rendait le risque réel.
    const horsPresentation = await page.evaluate(async d => {
      const r = await window.adocRenderClinicalDocument(d, { sourceSnapshotId: 's', entries: [] });
      return r.html;
    }, DOC);
    assert.ok(/image-01/.test(horsPresentation), "l'export clinique doit bien contenir le bloc image");
    assert.ok(!/adocPresentOpenDeepDive|adocPresentOpenImageDoor/.test(horsPresentation),
      'hors mode présentation, aucun onclick de porte ne doit apparaître');
    assert.ok(!/adoc-sc-deepdive-chip/.test(horsPresentation), 'hors présentation, aucune puce');
    console.log('PASS  9/12 hors présentation (export clinique réel) : ni onclick de porte ni puce.');

    const revelations = await revelerJusqua(page, '#cc-ws-present-slide-inner #image-01 img');
    const avant = await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    // ALIGNEMENT (option 4) — le clic sur l'image AGRANDIT désormais, quel que soit le renvoi. On
    // l'éprouve ici, puis on referme et on repart de la PUCE, seul accès au renvoi, pour le parcours
    // de pages qui suit (niveaux 2 et 3, inchangé).
    //
    // La sorte de porte se lit sur `hidden` de .cc-ws-present-door-text, JAMAIS sur la présence d'un
    // titre : adocPresentOpenImageDoor masque cet élément sans réécrire son contenu, si bien qu'un
    // titre de page déjà ouverte y reste lisible par querySelector alors qu'il n'est plus affiché.
    const sorteDePorte = () => page.evaluate(() => {
      const t = document.querySelector('#cc-ws-present-door .cc-ws-present-door-text');
      return (t && !t.hidden) ? 'PAGE' : 'AGRANDISSEMENT';
    });
    await page.click('#cc-ws-present-slide-inner #image-01 img');
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await sorteDePorte(), 'AGRANDISSEMENT',
      "le clic RÉEL sur l'image ouvre l'AGRANDISSEMENT, jamais une page — c'est la puce qui y mène");
    await page.evaluate(() => window.adocPresentCloseImageDoor());
    await page.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));

    await page.click('#cc-ws-present-slide-inner #image-01 .adoc-sc-deepdive-chip');
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    let titre = await page.evaluate(() => document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '');
    assert.equal(await sorteDePorte(), 'PAGE', 'et le clic sur la puce ouvre bien une PAGE');
    assert.match(titre, /Niveau 1/, "le clic RÉEL sur la PUCE doit ouvrir la page de niveau 1 ; obtenu : " + titre);
    await page.screenshot({ path: path.join(CAPTURES, 'b1-01-niveau1-depuis-puce.png') });
    console.log('PASS 10/12 clics RÉELS (après ' + revelations + ' révélation(s)) : l\'image agrandit, la puce ouvre le niveau 1.');

    for (const attendu of [/Niveau 2/, /Niveau 3/]) {
      await page.click('#cc-ws-present-door .adoc-sc-deepdive-chip, #cc-ws-present-door .cc-ws-deepdive-link');
      await page.waitForFunction(t => (document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '').includes(t),
        attendu.source.replace(/\\/g, '').replace(/[\/]/g, ''));
      titre = await page.evaluate(() => document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '');
      assert.match(titre, attendu, 'descente attendue ; obtenu : ' + titre);
    }
    await page.screenshot({ path: path.join(CAPTURES, 'b1-02-niveau3.png') });
    const apres = await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    assert.equal(apres, avant, 'la diapositive de départ doit rester intacte byte pour byte');
    console.log('PASS 11/12 descente à 3 niveaux depuis l\'image ; diapositive intacte byte pour byte.');

    // ══ PLAN 3 — LE FICHIER EXPORTÉ ════════════════════════════════════════════════════════════
    const fichier = path.join(os.tmpdir(), 'cc-b1-export.html');
    const html = await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d), DOC);
    fs.writeFileSync(fichier, html, 'utf8');

    const expPage = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const expErreurs = [];
    expPage.on('pageerror', e => expErreurs.push(e.message));
    await expPage.goto('file://' + fichier);
    // Depuis la phase 3, un fichier exporté ne s'ouvre PLUS tout seul : il attend le geste
    // « ▶ Démarrer », sans lequel aucun navigateur n'accorde le plein écran à un fichier ouvert
    // au double-clic. Sans effet sur une page live, qui n'a pas cet écran.
    await expPage.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await expPage.waitForFunction(() => document.getElementById('cc-ws-present-slide-inner'));
    await expPage.evaluate(() => document.getElementById('cc-workspace')?.classList.add('open'));
    await revelerJusqua(expPage, '#cc-ws-present-slide-inner #image-01 img');

    const expAvant = await expPage.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    // ALIGNEMENT (option 4) — dans l'export aussi, le clic sur l'image AGRANDIT : on l'éprouve, on
    // referme, puis on part de la PUCE pour la descente à trois niveaux qui suit.
    await expPage.click('#cc-ws-present-slide-inner #image-01 img');
    await expPage.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await expPage.evaluate(() => {
      const t = document.querySelector('#cc-ws-present-door .cc-ws-present-door-text');
      return (t && !t.hidden) ? 'PAGE' : 'AGRANDISSEMENT';
    }), 'AGRANDISSEMENT', "dans l'export, le clic sur l'image ouvre l'agrandissement");
    await expPage.evaluate(() => window.adocPresentCloseImageDoor());
    await expPage.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    await expPage.click('#cc-ws-present-slide-inner #image-01 .adoc-sc-deepdive-chip');
    await expPage.waitForFunction(() => (document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '').includes('Niveau 1'));
    for (const attendu of ['Niveau 2', 'Niveau 3']) {
      await expPage.click('#cc-ws-present-door .adoc-sc-deepdive-chip, #cc-ws-present-door .cc-ws-deepdive-link');
      await expPage.waitForFunction(t => (document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '').includes(t), attendu);
    }
    const expTitre = await expPage.evaluate(() => document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '');
    assert.match(expTitre, /Niveau 3/, 'trois niveaux DANS L\'EXPORT ; obtenu : ' + expTitre);
    await expPage.screenshot({ path: path.join(CAPTURES, 'b1-03-export-niveau3.png') });
    const expApres = await expPage.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    assert.equal(expApres, expAvant, 'diapositive intacte DANS L\'EXPORT');
    assert.deepEqual(expErreurs, [], 'aucune erreur dans le fichier exporté : ' + expErreurs.join(' | '));
    console.log('PASS 12/12 export réellement ouvert et cliqué : 3 niveaux depuis l\'image, 0 erreur.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('\n       fichier exporté : ' + Math.round(html.length / 1024) + ' Ko');
    console.log('       captures : ' + CAPTURES);
    console.log('PASS verify-b1-image-lien — 12/12.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
