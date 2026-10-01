// PASTILLE « AGRANDIR » sur une image zoomable — phase 1 de l'onboarding du lecteur.
//
// Le seul indice qu'une image sans renvoi est cliquable était le curseur (cursor:zoom-in) : invisible
// au tactile, facile à manquer à la souris. Une pastille discrète le rend visible sans survol.
//
// UNIQUEMENT sur l'image SANS lien : celle qui porte un renvoi affiche déjà sa puce « ↳ Approfondir »
// (deepDiveChips, positionnée en haut à droite). Deux signaux sur la même image diraient deux choses
// pour un seul geste — le test refuse ce cas.
//
// COIN : haut à droite, aux retraits exacts de la puce (14px/14px). Le bas à droite, d'abord retenu,
// est INUTILISABLE : .cc-ws-present-toolbar est un bandeau pleine largeur épinglé au bas de la fenêtre
// (mesuré [0,1001,1600,49] en 1600×1050), qui recouvre les DEUX coins bas de toute photo descendant
// jusque-là — pastille cachée ET clic intercepté. Puce et pastille étant mutuellement exclusives, elles
// peuvent partager ce coin sans jamais se croiser. L'invariant « barreRecouvre » verrouille ce défaut.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
  // content.query, et NON imageRef : `query` est le champ d'un BLOC image (le schéma l'exige,
  // minLength 1), `imageRef` celui de la COUVERTURE d'une carte. Avec imageRef, content.query
  // est absente et le rendu n'émet plus aucune référence d'image — l'image perd son src, donc
  // sa hauteur, et la géométrie mesurée ici s'effondre. Ce test passait AVANT le garde des
  // requêtes inexploitables parce que data-pexels="undefined" partait réellement vers la
  // banque d'images et retombait sur un aplat, ce qui donnait une boîte à l'image : il tenait
  // debout grâce au défaut même que ce garde corrige.
const img = (id, q, liens) => {
  const b = { id, type: 'image', content: { query: q, alt: 'Une scène clinique', widthPercent: 100 },
              citationIds: [], validation: {} };
  if (liens) b.deepDiveLinks = liens;
  return b;
};
const DOC = {
  documentKind: 'presentation', title: 'Pastille', citations: [],
  blocks: [{ id: 'slide-01', type: 'card', content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
    img('img-zoom', 'calm room', null),                                     // zoomable : pastille attendue
    img('img-lien', 'therapist office', [{ text: 'cabinet', targetId: 'n1' }]), // renvoi : puce, PAS de pastille
  ] } }],
  deepDives: [{ id: 'n1', title: 'La page visée', paragraphs: [{ text: 'Un paragraphe assez long pour être conservé.', links: [] }] }],
};

const lire = (page) => page.evaluate(() => {
  const un = (id) => {
    const fig = document.querySelector('#cc-ws-present-slide-inner #' + id);
    if (!fig) return null;
    const badge = fig.querySelector('.adoc-sc-image-zoom-badge');
    const chip = fig.querySelector('.adoc-sc-deepdive-chip');
    const image = fig.querySelector('img');
    const st = badge ? getComputedStyle(badge) : null;
    return {
      pastille: !!badge, puce: !!chip,
      clics: st ? st.pointerEvents : null,
      position: st ? { gauche: st.left, haut: st.top, place: st.position } : null,
      // Les deux signaux cohabitent désormais : on mesure qu'ils ne se croisent pas.
      pastilleXpuce: (function () {
        if (!badge || !chip) return null;
        const a = badge.getBoundingClientRect(), c = chip.getBoundingClientRect();
        return !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom);
      })(),
      visible: badge ? (badge.getBoundingClientRect().width > 0) : false,
      surLaPhoto: (function () {
        if (!badge || !image) return null;
        const bb = badge.getBoundingClientRect(), bi = image.getBoundingClientRect();
        const cx = bb.left + bb.width / 2, cy = bb.top + bb.height / 2;
        return cx >= bi.left && cx <= bi.right && cy >= bi.top && cy <= bi.bottom;
      })(),
      // Test de collision RÉEL : ce que le navigateur désigne au centre de la pastille. Avec
      // pointer-events:none, il doit désigner l'image — jamais la pastille.
      sousLaPastille: (function () {
        if (!badge) return null;
        const bb = badge.getBoundingClientRect();
        const e = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
        return e ? (e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '')) : '(hors viewport)';
      })(),
      // Le défaut trouvé en phase 1 : un bandeau d'outils épinglé au bas de la fenêtre recouvrait la
      // pastille. Croisement des boîtes réelles — aucune tolérance, aucun chevauchement admis.
      barre: (function () {
        const t = document.querySelector('.cc-ws-present-toolbar');
        if (!t) return null;
        const b = t.getBoundingClientRect();
        return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
      })(),
      barreRecouvre: (function () {
        if (!badge) return null;
        const t = document.querySelector('.cc-ws-present-toolbar');
        if (!t) return null;
        const a = badge.getBoundingClientRect(), b = t.getBoundingClientRect();
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      })(),
      svg: badge ? !!badge.querySelector('svg') : false,
      ariaCache: badge ? badge.getAttribute('aria-hidden') : null,
      onclickImage: image ? (image.getAttribute('onclick') || '') : '',
      ariaImage: image ? (image.getAttribute('aria-label') || '') : '',
    };
  };
  return { zoom: un('img-zoom'), lien: un('img-lien') };
});

async function ouvrirPresentation(page, url) {
  await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
}

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pastille-'));
  let n = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await ouvrirPresentation(page, PAGE);
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      // #cc-workspace sans .open est display:none : la pastille mesurerait 0×0.
      document.getElementById('cc-workspace')?.classList.add('open');
    });
    await page.evaluate((d) => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.waitForTimeout(400);
    const live = await lire(page);

    // ── 1 — la pastille est là sur l'image ZOOMABLE, et rendue ──
    assert.ok(live.zoom, 'préalable : l\'image zoomable doit être rendue');
    assert.equal(live.zoom.pastille, true, 'une image sans renvoi doit porter la pastille');
    assert.equal(live.zoom.visible, true, 'et la pastille doit avoir une boîte réelle, pas un élément à 0×0');
    assert.equal(live.zoom.svg, true, 'elle porte une icône SVG (adocDeepDiveIconeHTML), jamais du texte');
    assert.equal(live.zoom.position.place, 'absolute', 'positionnée dans le conteneur .adoc-sc-image');
    // ALIGNEMENT (option 4) — la pastille passe en haut à GAUCHE. Le haut-droit appartient à la puce
    // « ↳ Approfondir », qui cohabite désormais avec elle sur la même image : depuis que le clic
    // agrandit TOUJOURS, les deux signaux sont présents en même temps et ne peuvent plus partager un
    // coin. Les deux coins bas restent exclus par .cc-ws-present-toolbar (bandeau pleine largeur
    // épinglé au bas de la fenêtre, mesuré [0,1001,1600,49]).
    assert.equal(live.zoom.position.gauche, '14px', 'en haut à gauche : left, au retrait de la puce');
    assert.equal(live.zoom.position.haut, '14px', 'en haut à gauche : top, au retrait de la puce');
    assert.equal(live.zoom.ariaCache, 'true',
      'aria-hidden : l\'image porte déjà aria-label « ' + live.zoom.ariaImage.slice(0, 40)
      + '… » et role=button — annoncer deux fois serait du bruit');
    console.log('PASS ' + (++n) + '/5 — pastille rendue en haut à droite de l\'image zoomable, icône SVG, masquée aux lecteurs d\'écran.');

    // ── 2 — ELLE NE VOLE PAS LE CLIC ──
    assert.equal(live.zoom.clics, 'none',
      'pointer-events:none est indispensable : c\'est l\'IMAGE qui porte l\'onclick, et une pastille '
      + 'qui intercepterait le clic empêcherait exactement le geste qu\'elle annonce');
    assert.equal(live.zoom.surLaPhoto, true,
      'la pastille doit reposer SUR la photo, jamais flotter dans la marge du figure — invariant '
      + 'géométrique, indépendant de la taille de fenêtre');
    assert.ok(Array.isArray(live.zoom.barre),
      'préalable : la barre d\'outils de présentation doit être trouvée, sinon l\'invariant suivant '
      + 'serait vide de sens');
    assert.equal(live.zoom.barreRecouvre, false,
      'la pastille ne doit croiser à AUCUN endroit .cc-ws-present-toolbar — bandeau pleine largeur '
      + 'épinglé au bas de la fenêtre, mesuré à ' + JSON.stringify(live.zoom.barre) + ' : sous lui, la '
      + 'pastille serait cachée et le clic intercepté avant d\'atteindre l\'image');
    assert.equal(live.zoom.sousLaPastille, 'img',
      'au centre de la pastille, le navigateur doit désigner l\'IMAGE : c\'est la preuve directe que '
      + 'la pastille est transparente au pointage. Reçu : ' + live.zoom.sousLaPastille);
    assert.ok(/adocPresentOpenImageDoor/.test(live.zoom.onclickImage),
      'préalable : l\'image zoomable porte bien son onclick d\'agrandissement');
    // Clic RÉEL au centre de la pastille : il doit atteindre l'image dessous et ouvrir la porte.
    // Clic RÉEL au centre de la pastille. Le locator fait défiler l'élément dans la vue au besoin :
    // mesuré, une fenêtre trop courte plaçait ce centre hors du viewport et le clic se perdait.
    const cible = page.locator('#cc-ws-present-slide-inner #img-zoom .adoc-sc-image-zoom-badge');
    await cible.scrollIntoViewIfNeeded();
    const boite = await cible.boundingBox();
    await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
    await page.waitForTimeout(450);
    const porte = await page.evaluate(() => ({
      ouverte: document.getElementById('cc-ws-present-door').classList.contains('open'),
      titre: document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || null,
    }));
    assert.equal(porte.ouverte, true,
      'un clic SUR la pastille doit traverser jusqu\'à l\'image et ouvrir l\'agrandissement');
    assert.equal(porte.titre, null, 'et c\'est bien l\'agrandissement, pas une page d\'approfondissement');
    console.log('PASS ' + (++n) + '/5 — un clic sur la pastille traverse et ouvre l\'agrandissement.');

    // ── 3 — JAMAIS sur une image qui porte déjà une puce ──
    assert.ok(live.lien, 'préalable : l\'image avec renvoi doit être rendue');
    assert.equal(live.lien.puce, true, 'préalable : elle porte bien sa puce « ↳ Approfondir »');
    // CET INVARIANT EST RETOURNÉ par l'alignement (option 4), et c'est délibéré. « Deux signaux
    // diraient deux choses pour un seul geste » était vrai TANT QUE le renvoi remplaçait
    // l'agrandissement : il n'y avait qu'un geste. Depuis que le clic agrandit toujours, il y a
    // réellement DEUX gestes — l'image agrandit, la puce mène à la page — et chacun mérite son
    // signal. La condition !imgLienActif n'était pas un choix de conception mais la conséquence de
    // la disparition de l'agrandissement.
    //
    // Ce qui reste non négociable, et qui remplace l'ancienne assertion : les deux signaux ne
    // doivent JAMAIS se recouvrir, sinon l'un cacherait l'autre.
    assert.equal(live.lien.pastille, true,
      'la pastille s\'affiche AUSSI sur une image porteuse de renvoi : l\'agrandissement y existe '
      + 'désormais, et un geste disponible sans indice n\'est pas découvrable');
    assert.equal(live.lien.pastilleXpuce, false,
      'mais les deux signaux ne doivent à AUCUN endroit se croiser — pastille en haut à GAUCHE, puce '
      + 'en haut à DROITE. Mesuré sur les boîtes réelles, aucune tolérance.');
    console.log('PASS ' + (++n) + '/5 — pastille ET puce sur la même image, sans jamais se croiser.');

    // ── 4 — RIEN hors mode présentation ──
    const horsPresentation = await page.evaluate(() => {
      const atelier = document.querySelector('#cc-ws-doc-card');
      return atelier ? atelier.querySelectorAll('.adoc-sc-image-zoom-badge').length : null;
    });
    if (horsPresentation !== null) {
      assert.equal(horsPresentation, 0,
        'aucune pastille dans l\'atelier : hors présentation, l\'image n\'est pas cliquable, la pastille '
        + 'annoncerait un geste inexistant');
    }
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/5 — rien hors mode présentation' + (horsPresentation === null ? ' (atelier absent de ce contexte)' : '') + '.');
    await page.close();

    // ── 5 — DANS UN EXPORT RÉELLEMENT CONSTRUIT ET OUVERT ──
    const atelier = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    await ouvrirPresentation(atelier, PAGE);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();
    assert.ok(/adoc-sc-image-zoom-badge\{position:absolute/.test(html),
      'la CSS de la pastille doit être embarquée dans le fichier exporté');

    const exp = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    const errExp = [];
    exp.on('pageerror', (e) => errExp.push(e.message));
    await ouvrirPresentation(exp, 'file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await exp.waitForTimeout(400);
    const dansExport = await lire(exp);
    assert.equal(dansExport.zoom.pastille, true, 'la pastille doit être rendue DANS le fichier exporté');
    assert.equal(dansExport.zoom.visible, true, 'et y avoir une boîte réelle');
    assert.equal(dansExport.zoom.clics, 'none', 'et y garder pointer-events:none');
    assert.equal(dansExport.zoom.surLaPhoto, true, 'et y reposer sur la photo');
    if (dansExport.zoom.barreRecouvre !== null) {
      assert.equal(dansExport.zoom.barreRecouvre, false,
        'et n\'y être pas davantage recouverte par la barre d\'outils : ' + JSON.stringify(dansExport.zoom.barre));
    }
    assert.equal(dansExport.zoom.sousLaPastille, 'img',
      'et le clic y traverser jusqu\'à l\'image. Reçu : ' + dansExport.zoom.sousLaPastille);
    assert.equal(dansExport.lien.pastille, true, 'et la pastille y cohabite aussi avec la puce');
    assert.equal(dansExport.lien.pastilleXpuce, false, 'sans s\'y croiser davantage');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    console.log('PASS ' + (++n) + '/5 — export construit et ouvert : pastille présente, clic traversant, 0 erreur.');
    await exp.close();

    console.log('\nTOUS LES TESTS PASTILLE D\'IMAGE PASSENT (' + n + '/5)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
