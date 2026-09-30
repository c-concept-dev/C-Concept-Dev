// STUDIO CLINIQUE — Correctif du mode aperçu vidéo (grille de recherche Médias).
// Cause confirmée par citation (studio-clinique-core.js, adocVideoRenderSearchGrid, avant
// correctif) : <video poster="..." src="..." onmouseenter="this.play()"
// onmouseleave="this.pause();this.currentTime=0;"> — le navigateur efface nativement le `poster`
// dès l'appel à play(), qu'il réussisse ou non, sans jamais distinguer succès/échec réel/refus
// d'autoplay. Ce test complète (jamais ne duplique) verify-video-search-storage.cjs (recherche,
// choix de stockage, persistance — inchangés par ce correctif) en vérifiant UNIQUEMENT le nouveau
// mécanisme d'aperçu déclenché par clic : les trois issues distinctes, l'aperçu unique actif à la
// fois, le filet de sécurité au changement de grille, et la non-régression de la recherche Photos.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');
// Fixtures binaires générées pour ce test (deux très courtes vidéos réellement décodables par
// Chromium — jamais un octet arbitraire) : vivent dans le scratchpad de session, jamais dans le
// dépôt, cf. rapport (fichiers temporaires de test, non versionnés). WebM/VP9, pas H.264/MP4 : ce
// Chromium headless n'embarque pas les codecs propriétaires (vérifié en investigation — H.264
// renvoie systématiquement MEDIA_ERR_SRC_NOT_SUPPORTED ici, WebM/VP9 se décode normalement). Ceci
// ne concerne que ce harnais de test, jamais l'application réelle (Pexels/Pixabay servent du
// H.264, lu normalement par un vrai navigateur).
// Fixtures générées au lancement dans un dossier ignoré par git (cf. fixtures-video.cjs), jamais un
// chemin absolu vers la machine de qui a écrit le test. Renseignées au début du scénario, avant que
// la moindre route ne puisse les servir.
const { assurerFixturesVideo } = require('./fixtures-video.cjs');
let VIDEO_A, VIDEO_B;

// Sert une vidéo en respectant une éventuelle requête Range (le lecteur <video> en émet une
// systématiquement) — jamais un simple 200 intégral, qui peut être refusé par le moteur média.
function fulfillVideo(route, buf) {
  const range = route.request().headers()['range'];
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : buf.length - 1;
    return route.fulfill({
      status: 206, contentType: 'video/webm',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': String(end - start + 1) },
      body: buf.slice(start, end + 1),
    });
  }
  return route.fulfill({ status: 200, contentType: 'video/webm', headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(buf.length) }, body: buf });
}

function ficheDoc(blocks) {
  return {
    schemaVersion: 1,
    documentId: 'doc-video-preview-001', versionId: 'doc-video-preview-001-v1', previousVersionId: null,
    requestId: 'request-video-preview-001', sourceSnapshotId: 'snapshot-video-preview-001',
    createdAt: '2026-09-27T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test Aperçu Vidéo', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }

(async () => {
  const FIXTURES_DIR = await assurerFixturesVideo();
  VIDEO_A = fs.readFileSync(path.join(FIXTURES_DIR, 'test-a.webm'));
  VIDEO_B = fs.readFileSync(path.join(FIXTURES_DIR, 'test-b.webm'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Trois résultats : deux vidéos réellement lisibles (a, b — pour le test de bascule propre) et
  // une vidéo dont le lien renvoie 404 (échec réel de chargement, jamais un cadre vide silencieux).
  const FIXTURES = [
    { id: 1, photographer: 'Alpha Films', duration: 1, previewUrl: 'https://videos.pexels.com/video-files/1/1-360.mp4', downloadUrl: 'https://videos.pexels.com/video-files/1/1-1080.mp4', thumbUrl: 'https://images.pexels.com/videos/1/pic-1.jpeg?w=480' },
    { id: 2, photographer: 'Beta Studio', duration: 1, previewUrl: 'https://videos.pexels.com/video-files/2/2-360.mp4', downloadUrl: 'https://videos.pexels.com/video-files/2/2-1080.mp4', thumbUrl: 'https://images.pexels.com/videos/2/pic-2.jpeg?w=480' },
    { id: 3, photographer: 'Gamma Broken Link', duration: 1, previewUrl: 'https://videos.pexels.com/video-files/3/3-404.mp4', downloadUrl: 'https://videos.pexels.com/video-files/3/3-1080.mp4', thumbUrl: 'https://images.pexels.com/videos/3/pic-3.jpeg?w=480' },
  ];

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();
    if (url.includes('/fetch-video')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: FIXTURES, total: FIXTURES.length, query: 'respiration' }) });
    }
    if (url === FIXTURES[0].previewUrl) return fulfillVideo(route, VIDEO_A);
    if (url === FIXTURES[1].previewUrl) return fulfillVideo(route, VIDEO_B);
    if (url === FIXTURES[2].previewUrl) return route.fulfill({ status: 404, body: 'Not Found' });
    if (url.endsWith('/video-links')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [] }) });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  const storeKey = 'adocArt_test_video_preview';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = { name: 'Test Aperçu Vidéo', _adocGenerationEngine: 'structured', _adocCapabilities: { workspace: true, blockEditing: true } };
  }, storeKey);
  const doc = ficheDoc([heading('blk-a', 'Titre')]);
  await page.evaluate(({ key, doc }) => { window._adocArtifacts[key]._adocStructuredDoc = doc; }, { key: storeKey, doc });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
  assert.equal(opened, true, 'adocOpenWorkspace doit réussir sur un document structuré valide');

  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');
  await page.click('#cc-ws-media-subtab-videos');
  await page.waitForSelector('#cc-ws-media-subpanel-videos:not([hidden])');

  await page.fill('#cc-ws-video-search-input', 'respiration');
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Rechercher$/ }).click();
  await page.waitForSelector('#cc-ws-video-search-results [data-video-search-item="2"]');

  // ── Test 1 : rien ne se télécharge tant que "▶ Aperçu" n'a pas été cliqué ────────────────────
  const src0Before = await page.locator('#cc-video-preview-0').getAttribute('src');
  const poster0Before = await page.locator('#cc-video-preview-0').getAttribute('poster');
  assert.equal(src0Before, null, 'aucun src ne doit être posé avant le clic sur "▶ Aperçu" (correctif — plus de survol)');
  assert.equal(poster0Before, FIXTURES[0].thumbUrl, 'le poster doit rester affiché nativement avant tout clic');
  const btn0TextBefore = await page.locator('#cc-video-preview-btn-0').textContent();
  assert.equal(btn0TextBefore, '▶ Aperçu', 'le bouton de déclenchement explicite doit être visible avant tout clic');
  console.log('PASS 1/8 — aucun téléchargement avant clic explicite, poster natif affiché, bouton "▶ Aperçu" présent');

  // ── Test 2 : cas SUCCÈS — clic sur le résultat 0 charge et joue réellement le fichier ─────────
  await page.click('#cc-video-preview-btn-0');
  await page.waitForFunction(() => {
    const v = document.getElementById('cc-video-preview-0');
    return v && v.readyState >= 2; // HAVE_CURRENT_DATA : une frame réelle est décodée
  }, { timeout: 10000 });
  const src0After = await page.locator('#cc-video-preview-0').getAttribute('src');
  assert.equal(src0After, FIXTURES[0].previewUrl, 'le clic doit charger réellement previewUrl (jamais downloadUrl)');
  const btn0Hidden = await page.locator('#cc-video-preview-btn-0').isHidden();
  assert.equal(btn0Hidden, true, 'le bouton doit se masquer une fois la lecture engagée avec succès');
  const error0Hidden = await page.locator('#cc-video-preview-error-0').isHidden();
  assert.equal(error0Hidden, true, 'aucun message d’échec ne doit apparaître sur un chargement réussi');
  console.log('PASS 2/8 — cas succès : clic charge et joue réellement previewUrl, bouton masqué, aucune erreur affichée');

  // ── Test 3 : bascule propre — cliquer l’aperçu du résultat 1 arrête proprement le résultat 0 ──
  await page.click('#cc-video-preview-btn-1');
  await page.waitForFunction(() => {
    const v = document.getElementById('cc-video-preview-1');
    return v && v.readyState >= 2;
  }, { timeout: 10000 });
  const video0State = await page.evaluate(() => {
    const v = document.getElementById('cc-video-preview-0');
    return { src: v.getAttribute('src'), paused: v.paused };
  });
  assert.equal(video0State.src, null, 'démarrer un nouvel aperçu doit vider le src du précédent (jamais un simple masquage — sinon téléchargement fantôme en arrière-plan)');
  assert.equal(video0State.paused, true, 'le précédent aperçu doit être réellement mis en pause');
  const btn0RestoredText = await page.locator('#cc-video-preview-btn-0').textContent();
  assert.equal(btn0RestoredText, '▶ Aperçu', 'le bouton du précédent résultat doit redevenir "▶ Aperçu" (poster natif à nouveau visible), jamais rester masqué');
  const btn0RestoredHidden = await page.locator('#cc-video-preview-btn-0').isHidden();
  assert.equal(btn0RestoredHidden, false, 'le bouton du précédent résultat doit redevenir visible');
  console.log('PASS 3/8 — un seul aperçu actif à la fois : en démarrer un nouveau relâche proprement le précédent (src vidé, en pause, bouton restauré)');

  // ── Test 4 : cas ÉCHEC RÉEL — un lien 404 réaffiche le poster, jamais un cadre vide, avec un
  // message honnête et un bouton "Réessayer" ──
  await page.click('#cc-video-preview-btn-2');
  await page.waitForSelector('#cc-video-preview-error-2:not([hidden])', { timeout: 10000 });
  const video2State = await page.evaluate(() => {
    const v = document.getElementById('cc-video-preview-2');
    return { src: v.getAttribute('src'), poster: v.getAttribute('poster') };
  });
  assert.equal(video2State.src, null, 'un échec réel doit vider le src (repli vers le poster natif, jamais un cadre vide figé sur une frame cassée)');
  assert.equal(video2State.poster, FIXTURES[2].thumbUrl, 'le poster doit rester intact et redevenir visible après un échec');
  const btn2Text = await page.locator('#cc-video-preview-btn-2').textContent();
  assert.equal(btn2Text, '▶ Réessayer', 'le bouton doit proposer explicitement de réessayer après un échec réel');
  const btn2Hidden = await page.locator('#cc-video-preview-btn-2').isHidden();
  assert.equal(btn2Hidden, false, 'le bouton "Réessayer" doit rester visible (jamais masqué comme en cas de succès)');
  const errorText2 = await page.locator('#cc-video-preview-error-2').textContent();
  assert.ok(errorText2 && errorText2.length > 0, 'un message d’échec honnête doit être affiché, jamais un silence');
  console.log('PASS 4/8 — cas échec réel (404) : poster natif restauré (jamais un cadre vide), message honnête, bouton "Réessayer"');

  // ── Test 5 : isolation — le résultat 0 (relâché proprement au Test 3, jamais retouché depuis)
  // reste dans l’état restauré ("▶ Aperçu" visible, aucun src) : l’échec du résultat 2 ne doit
  // affecter QUE le résultat 2 lui-même, jamais un autre résultat de la même grille. (Cliquer
  // "▶ Aperçu" sur le résultat 2 a lui-même déjà relâché le résultat 1, alors actif — comportement
  // ATTENDU du principe "un seul aperçu actif à la fois", pas un effet de bord de cet échec.) ──
  const video0Untouched = await page.evaluate(() => {
    const v = document.getElementById('cc-video-preview-0');
    const btn = document.getElementById('cc-video-preview-btn-0');
    return { src: v.getAttribute('src'), btnHidden: btn.hidden, btnText: btn.textContent };
  });
  assert.equal(video0Untouched.src, null, 'le résultat 0, déjà relâché et non retouché depuis, doit rester sans src');
  assert.equal(video0Untouched.btnHidden, false, 'le bouton du résultat 0 doit rester visible, non affecté par l’échec du résultat 2');
  assert.equal(video0Untouched.btnText, '▶ Aperçu', 'le bouton du résultat 0 ne doit jamais afficher "Réessayer" pour un échec qui n’est pas le sien');
  console.log('PASS 5/8 — l’échec d’un résultat n’affecte jamais un AUTRE résultat de la grille (isolation)');

  // ── Test 6 : filet de sécurité — une nouvelle recherche pendant une lecture active la relâche
  // proprement (jamais un flux téléchargé en arrière-plan pour un élément qui va être détruit) ──
  await page.fill('#cc-ws-video-search-input', 'autre requête');
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Rechercher$/ }).click();
  await page.waitForSelector('#cc-ws-video-search-results [data-video-search-item="2"]');
  // Le résultat 1 précédent n’existe plus dans le DOM (grille reconstruite) — vérifie seulement
  // qu’aucune erreur JS n’a été levée en tentant de relâcher un aperçu dont l’élément a disparu.
  const activePreviewAfterNewSearch = await page.evaluate(() => window._adocVideoActivePreview);
  assert.equal(activePreviewAfterNewSearch, null, 'une nouvelle recherche doit relâcher tout aperçu actif de la grille précédente');
  console.log('PASS 6/8 — filet de sécurité : une nouvelle recherche relâche proprement tout aperçu actif de la grille précédente');

  // ── Test 7 : refus d’autoplay ignoré silencieusement — jamais confondu avec un échec réel ──
  await page.evaluate(() => {
    const proto = window.HTMLMediaElement.prototype;
    proto.play = function () { return Promise.reject(new DOMException('Autoplay refusé (simulation)', 'NotAllowedError')); };
  });
  await page.click('#cc-video-preview-btn-0');
  // Laisser le temps à la promesse rejetée d’être traitée par le .catch() du correctif.
  await page.waitForTimeout(300);
  const state0AfterRejectedAutoplay = await page.evaluate(() => {
    const v = document.getElementById('cc-video-preview-0');
    const err = document.getElementById('cc-video-preview-error-0');
    const btn = document.getElementById('cc-video-preview-btn-0');
    return { hasSrc: !!v.getAttribute('src'), errorHidden: err.hidden, btnHidden: btn.hidden, btnText: btn.textContent };
  });
  assert.equal(state0AfterRejectedAutoplay.hasSrc, true, 'un refus d’autoplay ne doit jamais vider le src : la vidéo (contrôles natifs) reste utilisable manuellement');
  assert.equal(state0AfterRejectedAutoplay.errorHidden, true, 'un refus d’autoplay n’est jamais un échec réel : aucun message d’erreur ne doit apparaître');
  assert.equal(state0AfterRejectedAutoplay.btnHidden, true, 'le bouton reste masqué (la vidéo, déjà chargée avec ses contrôles, est considérée comme l’aperçu actif)');
  console.log('PASS 7/8 — refus d’autoplay ignoré silencieusement : jamais confondu avec un échec réel, vidéo/contrôles natifs restent affichés');

  // ── Test 8 : non-régression — la recherche Photos reste inchangée par ce correctif ────────────
  await page.click('#cc-ws-media-subtab-photos');
  await page.waitForSelector('#cc-ws-media-subpanel-photos:not([hidden])');
  const photoGridHtmlSample = await page.evaluate(() => {
    const el = document.getElementById('cc-ws-media-search-results');
    return el ? el.outerHTML.includes('onmouseenter') : null;
  });
  assert.equal(photoGridHtmlSample, false, 'la grille Photos ne doit jamais avoir été affectée par ce correctif (aucun survol vidéo n’y existait déjà)');
  console.log('PASS 8/8 — non-régression : la recherche Photos (adocMediaRenderGrid) reste totalement inchangée');

  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));

  console.log('\n=== TOUS LES TESTS "APERÇU VIDÉO PAR CLIC" (8/8) PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
