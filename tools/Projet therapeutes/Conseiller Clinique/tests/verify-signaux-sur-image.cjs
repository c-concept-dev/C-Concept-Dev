// LES DEUX SIGNAUX REPOSENT SUR LA PHOTO, À TOUTE LARGEUR.
//
// DÉFAUT CORRIGÉ, mesuré avant : la pastille et la puce étaient ancrées à 14px du <figure>, qui
// occupe TOUTE la largeur de la diapositive, alors que l'image y est centrée dès que widthPercent
// < 100. Elles tombaient donc hors de la photo pour toute largeur inférieure à ~98 % — marge
// (figure − image)/2 de 38px dès 95 %, et de 680px à 10 %. Seuls 98 % et 100 % étaient corrects.
//
// L'image est désormais enveloppée dans un conteneur à SA largeur, qui porte le centrage et sur
// lequel les deux signaux s'ancrent. Ce test mesure l'inclusion par les boîtes réelles ET par
// elementFromPoint : une inclusion géométrique ne prouve pas qu'on désigne bien la photo.
//
// LA COUVERTURE DE CARTE n'avait PAS ce défaut et n'est pas enveloppée : .adoc-sc-card-img est en
// width:100% inconditionnel (cardContent n'a aucun champ de largeur) et object-fit:cover recadre le
// CONTENU sans réduire la BOÎTE — prouvé sur trois formats de source et trois fenêtres. Sa
// contrainte max-height:45%, qui avait motivé le refus d'enveloppe, n'a donc pas à être touchée.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const LARGEURS = [10, 20, 30, 50, 80, 90, 95, 98, 100];
// Arithmétique du seuil : pastille 14→44, puce de 113px à droite → il faut
// 14 + 30 + 8 + 113 + 14 = 179px pour les deux. Le seuil CSS est posé à 200px, d'où 10 % (151px)
// sans pastille et 20 % (302px) avec. Ce test l'affirme comme une DÉCISION, pas comme un hasard.
const SEUIL_PASTILLE_PX = 200;

// Une diapositive par largeur : empilées, les dernières passent sous la ligne de flottaison et
// elementFromPoint renvoie « hors » — artefact de mesure, et non défaut (constaté).
const DOC = {
  documentKind: 'presentation', title: 'Signaux', citations: [],
  blocks: LARGEURS.map((l) => ({ id: 'c' + l, type: 'card',
    content: { title: 'Largeur ' + l, imageRef: null, imageAlt: null, blocks: [
      { id: 'w' + l, type: 'image',
        content: { query: 'calm therapy room', alt: 'Une scène clinique', widthPercent: l },
        citationIds: [], validation: {}, deepDiveLinks: [{ text: 'renvoi', targetId: 'n1' }] }] } }))
    .concat([{ id: 'c-couv', type: 'card', content: { title: 'Couverture',
      imageRef: 'therapist office', imageAlt: 'Un cabinet',
      coverDeepDiveLinks: [{ text: 'cabinet', targetId: 'n1' }], blocks: [] } }]),
  deepDives: [{ id: 'n1', title: 'La page visée', imageQuery: '', imageAlt: '',
    paragraphs: ['Un paragraphe assez long pour être mis en page dans la colonne de la porte.'] }],
};

const horsReseau = (p) => p.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());

// Relevé d'un porteur : inclusion géométrique ET désignation réelle par elementFromPoint.
const mesurer = (p, selFig, selImg) => p.evaluate((s) => {
  const inner = document.getElementById('cc-ws-present-slide-inner');
  const fig = inner.querySelector(s.fig);
  if (!fig) return { absent: true };
  const im = inner.querySelector(s.img);
  const pa = fig.querySelector('.adoc-sc-image-zoom-badge') || inner.querySelector('.adoc-sc-card-zoom-badge');
  const pu = fig.querySelector('.adoc-sc-deepdive-chip') || inner.querySelector('.adoc-sc-card-cover-chip');
  const B = (e) => e && e.getBoundingClientRect();
  const bf = B(fig), bi = B(im), bp = B(pa), bq = B(pu);
  const dedans = (a, c) => (a && c) ? (a.left >= c.left - 0.5 && a.right <= c.right + 0.5
    && a.top >= c.top - 0.5 && a.bottom <= c.bottom + 0.5) : null;
  const croise = (a, c) => (a && c) ? !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom) : null;
  const sous = (bb) => bb ? (function () {
    const e = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
    if (!e) return 'hors';
    return e.tagName.toLowerCase() === 'img' ? 'img' : ((e.className || e.tagName).toString().split(' ')[0] || e.tagName.toLowerCase());
  })() : null;
  return {
    figure: bf && Math.round(bf.width), image: bi && Math.round(bi.width),
    pastilleRendue: !!(bp && bp.width > 0), puceRendue: !!(bq && bq.width > 0),
    pastilleSurImage: dedans(bp, bi), puceSurImage: dedans(bq, bi),
    croisent: croise(bp, bq), sousPastille: sous(bp), sousPuce: sous(bq),
    boites: { image: bi && [Math.round(bi.left), Math.round(bi.top), Math.round(bi.width), Math.round(bi.height)],
              pastille: bp && [Math.round(bp.left), Math.round(bp.top), Math.round(bp.width), Math.round(bp.height)],
              puce: bq && [Math.round(bq.left), Math.round(bq.top), Math.round(bq.width), Math.round(bq.height)] },
  };
}, { fig: selFig, img: selImg });

async function demarrer(browser, url, viaEcranDeDemarrage) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await horsReseau(page);
  await page.goto(url);
  if (viaEcranDeDemarrage) {
    await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
  } else {
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      document.getElementById('cc-workspace')?.classList.add('open');
    });
    await page.evaluate((d) => window.adocPresentOpenWithDoc(d), DOC);
  }
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
  await page.waitForTimeout(400);
  return { page, erreurs };
}

async function allerA(page, i, id) {
  if (i > 0) { await page.evaluate((n) => window.adocPresentGoTo(n), i); await page.waitForTimeout(430); }
  if (id) await page.locator('#cc-ws-present-slide-inner #' + id + ' img').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(120);
}

// Parcours de la gamme, partagé par la page vivante et l'export : un seul corps, jamais deux.
async function parcourirGamme(page, etiquette) {
  const releves = [];
  for (let i = 0; i < LARGEURS.length; i++) {
    const l = LARGEURS[i];
    await allerA(page, i, 'w' + l);
    const m = await mesurer(page, '#w' + l, '#w' + l + ' img');
    assert.ok(!m.absent, etiquette + ' : le bloc à ' + l + ' % doit être rendu');

    // GÉOMÉTRIE INCHANGÉE : l'enveloppe ne doit pas avoir déplacé l'image. Sa largeur rendue reste
    // N % de celle du figure — c'est ce qui garantit qu'aucune mise en page ne bouge.
    const attendue = Math.round(m.figure * l / 100);
    assert.ok(Math.abs(m.image - attendue) <= 2,
      etiquette + ' : à ' + l + ' %, la largeur rendue de l\'image doit rester ' + l + ' % du figure — '
      + 'attendu ~' + attendue + ' px, obtenu ' + m.image + ' px. L\'enveloppe ne doit RIEN déplacer.');

    // LA PUCE, à toute largeur sans exception.
    assert.equal(m.puceRendue, true, etiquette + ' : puce rendue à ' + l + ' %');
    assert.equal(m.puceSurImage, true,
      etiquette + ' : à ' + l + ' % (image ' + m.image + ' px), la puce doit reposer SUR la photo — '
      + 'c\'est le défaut corrigé : ancrée au figure pleine largeur, elle tombait à côté dès 95 %. '
      + JSON.stringify(m.boites));
    assert.equal(m.sousPuce, 'adoc-sc-deepdive-chip',
      etiquette + ' : et le navigateur doit la désigner en son centre ; reçu ' + m.sousPuce);

    // LA PASTILLE : sur la photo dès que la photo peut l'accueillir avec la puce.
    if (m.image >= SEUIL_PASTILLE_PX) {
      assert.equal(m.pastilleRendue, true, etiquette + ' : pastille rendue à ' + l + ' %');
      assert.equal(m.pastilleSurImage, true,
        etiquette + ' : à ' + l + ' %, la pastille doit reposer SUR la photo. ' + JSON.stringify(m.boites));
      assert.equal(m.sousPastille, 'img',
        etiquette + ' : et le clic doit la traverser jusqu\'à l\'image (pointer-events:none) ; reçu '
        + m.sousPastille);
    } else {
      // DÉCISION, pas un oubli : sous 200 px la photo ne peut pas porter les deux signaux sans
      // qu'ils se recouvrent (il faut 14+30+8+113+14 = 179 px). C'est la pastille qui s'efface —
      // elle n'est qu'un indice pour un geste qui reste disponible, la puce porte une destination.
      assert.equal(m.pastilleRendue, false,
        etiquette + ' : sous ' + SEUIL_PASTILLE_PX + ' px (image ' + m.image + ' px), la pastille '
        + 's\'efface au profit de la puce — deux signaux s\'y recouvriraient. ' + JSON.stringify(m.boites));
    }

    // ET DANS TOUS LES CAS : jamais de recouvrement entre les deux.
    assert.notEqual(m.croisent, true,
      etiquette + ' : les deux signaux ne doivent à AUCUNE largeur se recouvrir — à ' + l + ' %, '
      + JSON.stringify(m.boites));
    releves.push({ l: l, image: m.image, pastille: m.pastilleRendue, puce: m.puceRendue });
  }
  return releves;
}

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'signaux-'));
  let n = 0;
  try {
    // ── 1 — LA GAMME COMPLÈTE, PAGE VIVANTE ──────────────────────────────────────────────────
    const { page, erreurs } = await demarrer(browser, PAGE, false);
    const vivant = await parcourirGamme(page, 'page vivante');
    console.log('PASS ' + (++n) + '/5 — gamme ' + LARGEURS.join('/') + ' % : les signaux reposent sur la photo, aucun recouvrement.');
    console.log('        ' + vivant.map((r) => r.l + '%:' + r.image + 'px' + (r.pastille ? '+P' : '  ')).join('  '));

    // ── 2 — LA COUVERTURE DE CARTE ───────────────────────────────────────────────────────────
    await allerA(page, LARGEURS.length, null);
    await page.waitForTimeout(200);
    const couv = await mesurer(page, '.adoc-sc-card', 'img.adoc-sc-card-img');
    assert.equal(couv.pastilleRendue, true, 'la couverture porte sa pastille');
    assert.equal(couv.pastilleSurImage, true,
      'et elle repose SUR la couverture, sans enveloppe : .adoc-sc-card-img est en width:100% '
      + 'inconditionnel, et object-fit:cover recadre le contenu sans réduire la boîte. '
      + JSON.stringify(couv.boites));
    assert.equal(couv.sousPastille, 'img', 'le clic la traverse jusqu\'à l\'image ; reçu ' + couv.sousPastille);
    // La puce de couverture est SOUS l'image, dans le flux : décision explicite du lot précédent
    // (« la couverture étant trop basse pour absorber une puce superposée sans manger l'image »).
    // Ce n'est donc pas un défaut d'ancrage, et ce test l'affirme comme tel plutôt que de le taire.
    assert.equal(couv.puceRendue, true, 'la couverture porte sa puce');
    assert.equal(couv.puceSurImage, false,
      'laquelle reste SOUS l\'image, dans le flux — décision explicite, non un défaut d\'ancrage : '
      + 'une puce superposée mangerait une couverture qui ne fait que 374 px de haut. '
      + JSON.stringify(couv.boites));
    assert.notEqual(couv.croisent, true, 'et les deux ne se recouvrent pas');
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/5 — couverture : pastille sur l\'image sans enveloppe, puce sous l\'image par décision.');

    // ── 3 — NON-RÉGRESSION DE L'OPTION 4, à une largeur étroite ─────────────────────────────
    await allerA(page, 1, 'w20');  // 20 % : les deux signaux présents, le cas le plus serré
    const sorte = () => page.evaluate(() => {
      const t = document.querySelector('#cc-ws-present-door .cc-ws-present-door-text');
      return (t && !t.hidden) ? 'PAGE' : 'AGRANDISSEMENT';
    });
    await page.locator('#cc-ws-present-slide-inner #w20 img').click();
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await sorte(), 'AGRANDISSEMENT', 'à 20 % aussi, le clic sur l\'image agrandit');
    await page.evaluate(() => window.adocPresentCloseImageDoor());
    await page.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    await page.locator('#cc-ws-present-slide-inner #w20 .adoc-sc-deepdive-chip').click();
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await sorte(), 'PAGE', 'et le clic sur la puce ouvre la page');
    assert.equal(await page.evaluate(() => document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent), 'La page visée');
    console.log('PASS ' + (++n) + '/5 — option 4 intacte sur une image étroite : l\'image agrandit, la puce mène à la page.');
    await page.close();

    // ── 4 — HORS PRÉSENTATION : l'enveloppe ne doit rien changer à la mise en page ───────────
    const atelier = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    const errAtelier = [];
    atelier.on('pageerror', (e) => errAtelier.push(e.message));
    await horsReseau(atelier);
    await atelier.goto(PAGE);
    await atelier.waitForFunction(() => typeof window.adocRenderClinicalDocument === 'function');
    // adocRenderClinicalDocument valide contre clinical-document.schema.json : il faut un document
    // COMPLET, pas la coquille de présentation qui suffit à adocPresentOpenWithDoc. On en forge un
    // minimal et valide, avec une seule image à 10 % — la largeur la plus parlante.
    const DOC_CLINIQUE = {
      schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
      requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
      language: 'fr', status: 'draft', title: 'Signaux', purpose: 'p', audience: 'clinicien',
      documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
      citations: [],
      validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                    accessibility: 'pending', humanClinicalReview: 'required' },
      blocks: [{ id: 'card-01', type: 'card', content: { title: 'D', imageRef: null, imageAlt: '',
        blocks: [{ id: 'image-01', type: 'image',
          content: { query: 'calm therapy room', alt: 'Une scène clinique', widthPercent: 10 },
          citationIds: [], validation: {}, deepDiveLinks: [{ text: 'Une scène clinique', targetId: 'n1' }] }] },
        citationIds: [], validation: {} }],
      // Forme exigée par clinical-document.schema.json : paragraphs en chaînes (ou {text,
      // deepDiveLinks}), et ni imageQuery ni imageAlt — ceux-là appartiennent au schéma d'OUTIL,
      // pas au document validé. Constaté à la validation, pas deviné.
      deepDives: [{ id: 'n1', title: 'La page visée', paragraphs: ['Un paragraphe.'] }],
    };
    const horsPresentation = await atelier.evaluate(async (d) => {
      const r = await window.adocRenderClinicalDocument(d, { sourceSnapshotId: 's', entries: [] });
      return r.html;
    }, DOC_CLINIQUE);
    assert.ok(/adoc-sc-image-cadre/.test(horsPresentation),
      'l\'enveloppe existe aussi hors présentation : elle porte la largeur et le centrage de l\'image, '
      + 'donc elle ne peut pas être propre au mode présentation sans déplacer la mise en page de l\'atelier');
    assert.ok(!/adoc-sc-image-zoom-badge|adoc-sc-deepdive-chip/.test(horsPresentation),
      'mais aucun signal hors présentation : là, l\'image n\'est pas cliquable');
    assert.ok(/width:10%/.test(horsPresentation) && /width:100%;border-radius/.test(horsPresentation),
      'la largeur est bien passée sur l\'enveloppe, l\'image remplissant celle-ci');
    assert.deepEqual(errAtelier, [], 'aucune erreur JS : ' + errAtelier.join(' | '));
    console.log('PASS ' + (++n) + '/5 — hors présentation : enveloppe présente, aucun signal, largeur portée par l\'enveloppe.');

    // ── 5 — DANS UN EXPORT RÉELLEMENT CONSTRUIT ET OUVERT ───────────────────────────────────
    const html = await atelier.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    await atelier.close();
    assert.ok(/@container \(max-width:200px\)/.test(html),
      'la requête de conteneur doit voyager dans l\'export : sans elle, les deux signaux se '
      + 'recouvriraient sur une image étroite du fichier distribué');
    assert.ok(/adoc-sc-image-cadre\{container-type:inline-size/.test(html),
      'et la déclaration de conteneur avec elle, sans quoi la requête ne s\'appliquerait à rien');
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    const { page: exp, erreurs: errExp } = await demarrer(browser, 'file://' + fichier, true);
    const dansExport = await parcourirGamme(exp, 'export ouvert');
    assert.deepEqual(dansExport.map((r) => [r.l, r.pastille, r.puce]), vivant.map((r) => [r.l, r.pastille, r.puce]),
      'l\'export doit se comporter EXACTEMENT comme la page vivante sur toute la gamme');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    console.log('PASS ' + (++n) + '/5 — export construit et ouvert : gamme identique à la page vivante, 0 erreur.');
    await exp.close();

    console.log('\nTOUS LES TESTS DE SIGNAUX SUR IMAGE PASSENT (' + n + '/5)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
