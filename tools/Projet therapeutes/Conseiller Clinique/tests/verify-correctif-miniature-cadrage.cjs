// STUDIO CLINIQUE — CORRECTIF miniature "Mes créations" : preuve VISUELLE réelle que le recadrage
// de la vignette (.cc-media-thumb, object-fit:cover) montre désormais le HAUT de l'image capturée
// (là où vit le bandeau titre+couverture d'un document réel), jamais son centre par défaut — cause
// confirmée du défaut signalé par Christophe (une capture fullPage:true d'un document long produit
// une image bien plus haute que large ; recadrée par le CSS autour de son centre vertical, elle
// tombe systématiquement en plein milieu du texte du document, jamais sur le bandeau).
//
// Preuve construite avec une image de synthèse (SVG), jamais un vrai document — mais RIEN n'est
// simulé dans la mesure : rendu réel par le vrai moteur Chromium (CSS object-fit/object-position
// réellement appliqués par le navigateur, pas recalculés à la main), capture RÉELLE de l'élément
// affiché (page.screenshot), pixels RÉELLEMENT décodés depuis cette capture (canvas+getImageData
// dans le navigateur, jamais une bibliothèque de décodage PNG côté Node — indisponible dans ce
// dépôt, confirmé). L'image de synthèse a un bandeau vert (#00FF00) dans son tout premier 7,5%
// (150px sur 2000px de haut) et du blanc partout ailleurs — exactement le rapport bandeau/corps
// d'un vrai document clinique (un bandeau court en tête d'un document potentiellement long).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');
// Captures écrites dans le scratchpad de session (jamais dans le dépôt) — répertoire fourni en
// variable d'environnement par l'appelant, repli sur /tmp si absent (ex. exécution manuelle locale).
const OUT_DIR = process.env.ADOC_TEST_SCRATCHPAD || '/tmp';

// SVG 200×2000 : 150px de vert en tête (le "bandeau"), blanc partout en dessous (le "corps de
// texte") — encodé en base64 pour un data URI stable (jamais de caractères spéciaux à échapper).
const SVG_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="2000">
  <rect x="0" y="0" width="200" height="2000" fill="#ffffff"/>
  <rect x="0" y="0" width="200" height="150" fill="#00ff00"/>
</svg>`;
const SVG_DATA_URI = 'data:image/svg+xml;base64,' + Buffer.from(SVG_SOURCE).toString('base64');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  // ── Construit 2 vignettes IDENTIQUES (même image source, même classe .cc-media-thumb, même
  // taille) — la SEULE différence est leur conteneur : l'une sous #cc-ws-creations-results
  // (nouvelle règle scopée), l'autre hors de tout conteneur "Mes créations" (représentant une
  // photo Pexels du panneau Médias, qui ne doit JAMAIS être affectée par ce correctif). ──
  await page.evaluate((svgUri) => {
    const wrap = document.createElement('div');
    wrap.style.position = 'fixed'; wrap.style.top = '0'; wrap.style.left = '0'; wrap.style.zIndex = '99999'; wrap.style.background = '#fff';
    wrap.innerHTML =
      '<div id="cc-ws-creations-results" style="display:inline-block;">' +
        '<div class="cc-media-item" style="width:200px;">' +
          '<img class="cc-media-thumb" id="scoped-thumb" style="width:200px;" src="' + svgUri + '">' +
        '</div>' +
      '</div>' +
      '<div style="display:inline-block;">' +
        '<div class="cc-media-item" style="width:200px;">' +
          '<img class="cc-media-thumb" id="unscoped-thumb" style="width:200px;" src="' + svgUri + '">' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
  }, SVG_DATA_URI);
  await page.waitForFunction(() => {
    const a = document.getElementById('scoped-thumb'), b = document.getElementById('unscoped-thumb');
    return a && a.complete && a.naturalWidth > 0 && b && b.complete && b.naturalWidth > 0;
  });

  // ── Test 1 : la règle CSS scopée s'applique bien où attendu, et NULLE PART ailleurs ──
  const objectPositions = await page.evaluate(() => ({
    scoped: getComputedStyle(document.getElementById('scoped-thumb')).objectPosition,
    unscoped: getComputedStyle(document.getElementById('unscoped-thumb')).objectPosition,
  }));
  assert.equal(objectPositions.scoped, '50% 0%', 'la vignette "Mes créations" (#cc-ws-creations-results) doit recevoir object-position:top (= "50% 0%" calculé)');
  assert.notEqual(objectPositions.unscoped, '50% 0%', 'une vignette HORS "Mes créations" (ex. photo Pexels du panneau Médias) ne doit JAMAIS recevoir ce recadrage — comportement centré par défaut préservé');
  console.log('PASS 1/3 — la règle CSS scopée (object-position:top) s’applique EXCLUSIVEMENT aux vignettes "Mes créations", jamais aux photos Pexels du panneau Médias');

  // ── Test 2 : preuve VISUELLE réelle — capture RÉELLE de chaque vignette rendue, pixels RÉELLEMENT
  // décodés (canvas+getImageData dans le navigateur) ──
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const scopedPath = path.join(OUT_DIR, 'vignette-mes-creations-apres-correctif.png');
  const unscopedPath = path.join(OUT_DIR, 'vignette-medias-non-affectee.png');
  await page.locator('#scoped-thumb').screenshot({ path: scopedPath });
  await page.locator('#unscoped-thumb').screenshot({ path: unscopedPath });

  async function samplePixel(imgPath) {
    const dataUri = 'data:image/png;base64,' + fs.readFileSync(imgPath).toString('base64');
    return page.evaluate((uri) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        // Échantillon au centre de la vignette capturée — représentatif de ce que l'œil voit,
        // jamais un pixel de bord qui pourrait tomber sur un artefact d'anti-aliasing.
        const { data } = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1);
        resolve({ r: data[0], g: data[1], b: data[2] });
      };
      img.onerror = reject;
      img.src = uri;
    }), dataUri);
  }

  const scopedPixel = await samplePixel(scopedPath);
  const unscopedPixel = await samplePixel(unscopedPath);
  console.log('   pixel vignette "Mes créations" (après correctif) :', JSON.stringify(scopedPixel));
  console.log('   pixel vignette panneau Médias (non affectée)     :', JSON.stringify(unscopedPixel));

  // Recadré en haut → doit tomber dans le bandeau vert (0,255,0), jamais dans le blanc du "corps".
  assert.ok(scopedPixel.g > 200 && scopedPixel.r < 100 && scopedPixel.b < 100, 'la vignette "Mes créations" doit RÉELLEMENT afficher le bandeau (vert), preuve du recadrage sur le HAUT — pixel obtenu : ' + JSON.stringify(scopedPixel));
  // Centré par défaut (comportement Médias inchangé) → doit tomber dans le blanc du "corps", jamais dans le bandeau vert.
  assert.ok(unscopedPixel.r > 200 && unscopedPixel.g > 200 && unscopedPixel.b > 200, 'la vignette hors "Mes créations" doit rester centrée (blanc), confirmant l’absence de régression sur les photos Pexels — pixel obtenu : ' + JSON.stringify(unscopedPixel));
  console.log('PASS 2/3 — PREUVE VISUELLE RÉELLE : la vignette "Mes créations" affiche désormais le bandeau (vert) là où elle affichait avant le milieu du "document" (blanc) — captures : ' + scopedPath + ' / ' + unscopedPath);

  // ── Test 3 : zéro erreur JS ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));
  console.log('PASS 3/3 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS CORRECTIF CADRAGE MINIATURE (3/3) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
