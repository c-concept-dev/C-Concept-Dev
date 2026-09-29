// STUDIO CLINIQUE — LOT VIDÉO-1 : preuve réelle bout-en-bout de la recherche Pexels Vidéos +
// aperçu réel + choix "Stockage local" dans le sous-onglet "Vidéos" du panneau Médias.
// Complète (jamais ne duplique) verify-video-block-insert.cjs (lien manuel, insertion de bloc,
// rendu, sous-onglet Photos — tout ça reste inchangé et re-testé séparément là-bas) et
// Worker/tests/verify-fetch-video-worker.cjs (choix réel du fichier ~360p/~1080p côté Worker,
// à partir d'une réponse Pexels brute). Ici : le CLIENT consomme correctement previewUrl (jamais
// downloadUrl) pour l'aperçu, downloadUrl pour le lien copié, et le flux "Stockage local" persiste
// réellement titre+attribution via les champs manuels déjà existants (décision confirmée : le
// lien Pexels lui-même n'est jamais stocké tel quel comme URL finale, cf. rapport).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(blocks) {
  return {
    schemaVersion: 1,
    documentId: 'doc-video-search-001', versionId: 'doc-video-search-001-v1', previousVersionId: null,
    requestId: 'request-video-search-001', sourceSnapshotId: 'snapshot-video-search-001',
    createdAt: '2026-09-27T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test Recherche Vidéo', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const FIXTURE = {
    id: 42,
    photographer: 'Jane Doe',
    duration: 14,
    previewUrl: 'https://videos.pexels.com/video-files/42/42-360.mp4',
    downloadUrl: 'https://videos.pexels.com/video-files/42/42-1080.mp4',
    thumbUrl: 'https://images.pexels.com/videos/42/pic-1.jpeg?w=480',
  };

  let fetchVideoCalls = 0, videoCreateCalls = 0, videoListCalls = 0;
  let lastCreateBody = null;
  const videoStore = [];
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();
    if (url.includes('/fetch-video')) {
      fetchVideoCalls++;
      const q = new URL(url).searchParams.get('q');
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ videos: [FIXTURE], total: 1, query: q }),
      });
    }
    if (url.endsWith('/video-links') && req.method() === 'POST') {
      videoCreateCalls++;
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      lastCreateBody = body;
      if (!body.url || !body.title) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'url/title required' }) });
      const row = { id: 'video-id-' + videoCreateCalls, url: body.url, title: body.title, attribution: body.attribution || null, storage_type: 'local', created_at: new Date().toISOString() };
      videoStore.unshift(row);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) });
    }
    if (url.endsWith('/video-links') && req.method() === 'GET') {
      videoListCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: videoStore }) });
    }
    // Correctif aperçu (clic sur "▶ Aperçu") — répond réellement à FIXTURE.previewUrl plutôt que
    // de laisser échouer une vraie requête réseau bloquée dans ce bac à sable : jamais une course
    // entre lecture de l'attribut src et l'échec réseau qui le viderait avant l'assertion. Le
    // contenu réel du flux n'est pas testé ici (déjà couvert par verify-video-preview-click.cjs).
    if (url === FIXTURE.previewUrl) return route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from([0]) });
    return route.continue();
  });

  // Presse-papier — mock déterministe (jamais tributaire des permissions navigateur réelles sur
  // une origine file://, cf. rapport) : capture la valeur exacte passée à writeText.
  await page.addInitScript(() => {
    window._copiedTexts = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { window._copiedTexts.push(t); return Promise.resolve(); } },
      configurable: true,
    });
  });
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  // Ouvrir un espace de travail minimal — le panneau Médias vit dans #cc-workspace, invisible
  // avant l'ouverture d'un document (même patron que verify-video-block-insert.cjs).
  const storeKey = 'adocArt_test_video_search';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = { name: 'Test Recherche Vidéo', _adocGenerationEngine: 'structured', _adocCapabilities: { workspace: true, blockEditing: true } };
  }, storeKey);
  const doc = ficheDoc([heading('blk-a', 'Titre')]);
  await page.evaluate(({ key, doc }) => { window._adocArtifacts[key]._adocStructuredDoc = doc; }, { key: storeKey, doc });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
  assert.equal(opened, true, 'adocOpenWorkspace doit réussir sur un document structuré valide');

  // Ouvrir le panneau Médias → sous-onglet Vidéos (même geste que verify-video-block-insert.cjs).
  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');
  await page.click('#cc-ws-media-subtab-videos');
  await page.waitForSelector('#cc-ws-media-subpanel-videos:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-ws-video-history').children.length >= 1);

  // ── Test 1 : recherche réelle, un résultat avec un vrai aperçu allégé (poster) + vidéo ~360p ──
  // Correctif aperçu (déclenchement par clic, plus par survol) : rien ne se télécharge tant que
  // "▶ Aperçu" n'a pas été cliqué explicitement — le src n'apparaît qu'à ce moment-là, jamais posé
  // eagerly dans le HTML généré. Détail du nouveau mécanisme (trois issues, aperçu unique, filet de
  // sécurité) testé séparément et en profondeur dans verify-video-preview-click.cjs — ce test-ci ne
  // vérifie ici que la non-régression du contenu consommé (previewUrl/downloadUrl/attribution).
  await page.fill('#cc-ws-video-search-input', 'respiration');
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Rechercher$/ }).click();
  await page.waitForSelector('#cc-ws-video-search-results [data-video-search-item="0"]');
  assert.equal(fetchVideoCalls, 1, 'la recherche doit appeler réellement /fetch-video');
  const previewSrcBeforeClick = await page.locator('#cc-ws-video-search-results video').first().getAttribute('src');
  assert.equal(previewSrcBeforeClick, null, 'aucun téléchargement ne doit démarrer avant le clic explicite sur "▶ Aperçu" (correctif — plus de survol)');
  const previewPoster = await page.locator('#cc-ws-video-search-results video').first().getAttribute('poster');
  assert.equal(previewPoster, FIXTURE.thumbUrl, 'l’image fixe avant lecture doit être la vignette allégée renvoyée par le Worker');
  await page.click('#cc-video-preview-btn-0');
  const previewSrc = await page.locator('#cc-ws-video-search-results video').first().getAttribute('src');
  assert.equal(previewSrc, FIXTURE.previewUrl, 'le clic sur "▶ Aperçu" doit charger le fichier ~360p (previewUrl), jamais downloadUrl (~1080p)');
  assert.notEqual(previewSrc, FIXTURE.downloadUrl, 'jamais la définition lourde comme source d’aperçu');
  const creditText1 = await page.locator('#cc-ws-video-search-results .cc-media-credit').first().textContent();
  // Correctif Pexels+Pixabay — jamais de nom de plateforme en dur (un résultat futur pourrait
  // venir de Pixabay) : seul le nom du photographe/vidéaste est affiché.
  assert.equal(creditText1, 'Vidéo : Jane Doe', 'l’attribution doit être visible sur le résultat de recherche, sans nom de plateforme en dur');
  console.log('PASS 1/9 — recherche réelle (/fetch-video), aperçu = fichier ~360p (jamais ~1080p) chargé au clic, vignette allégée en poster avant clic, attribution visible');

  // ── Test 2 : "Choisir" révèle le choix de stockage, bouton Cloudflare visible et actif ──
  // LOT VIDÉO-2 — le bouton "Stockage Cloudflare" est désormais réellement fonctionnel (jamais
  // désactivé) : son comportement complet (upload serveur, progression, insertion, rendu, Range)
  // est couvert par le test dédié verify-video-cloudflare-storage.cjs, jamais dupliqué ici — ce
  // test-ci ne vérifie que la non-régression de la présence/activation du bouton lui-même.
  await page.click('[data-video-search-choose="0"]');
  await page.waitForSelector('#cc-video-storage-choice-0:not([hidden])');
  const cloudBtn = page.locator('#cc-video-storage-choice-0 button', { hasText: /^Stockage Cloudflare$/ });
  assert.equal(await cloudBtn.count(), 1, 'le bouton "Stockage Cloudflare" doit être visible');
  assert.equal(await cloudBtn.isDisabled(), false, 'le bouton "Stockage Cloudflare" doit désormais être réellement cliquable (Lot Vidéo-2)');
  console.log('PASS 2/9 — choix de stockage révélé, bouton Cloudflare visible et réellement actif (Lot Vidéo-2)');

  // ── Test 3 : "Stockage local" affiche le lien ~1080p et pré-remplit le titre manuel (jamais un
  // second champ de titre) ──
  await page.click('[data-video-choose-local="0"]');
  await page.waitForSelector('#cc-video-local-panel-0:not([hidden])');
  const downloadLinkValue = await page.locator('#cc-video-download-link-0').inputValue();
  assert.equal(downloadLinkValue, FIXTURE.downloadUrl, 'le lien affiché doit être la qualité ~1080p (downloadUrl), jamais le ~360p de l’aperçu');
  const prefilledTitle = await page.locator('#cc-ws-video-title-input').inputValue();
  assert.equal(prefilledTitle, 'respiration', 'le champ titre EXISTANT doit être pré-rempli avec la requête, jamais un second champ créé');
  console.log('PASS 3/9 — "Stockage local" affiche le lien ~1080p (distinct de l’aperçu) et pré-remplit le titre manuel existant');

  // ── Test 4 : "Copier ce lien" copie exactement le lien ~1080p, jamais l’aperçu ──
  await page.click('[data-video-copy="0"]');
  const copied = await page.evaluate(() => window._copiedTexts);
  assert.deepEqual(copied, [FIXTURE.downloadUrl], 'le presse-papier doit recevoir exactement le lien ~1080p, une seule fois');
  console.log('PASS 4/9 — "Copier ce lien" copie exactement le lien ~1080p');

  // ── Test 5 : le lien Pexels n’est PAS lui-même persisté tant qu’on ne clique pas "Ajouter" —
  // aucun appel POST /video-links déclenché par le seul choix "Stockage local" ──
  assert.equal(videoCreateCalls, 0, 'choisir "Stockage local" ne doit jamais persister quoi que ce soit tout seul');
  console.log('PASS 5/9 — aucune persistance automatique tant que "Ajouter" n’a pas été cliqué explicitement');

  // ── Test 6 : coller le lien local (obtenu de VideoBox, simulé ici) et cliquer "Ajouter" (bouton
  // manuel déjà existant) persiste réellement titre + attribution + l’URL réellement collée ──
  await page.fill('#cc-ws-video-url-input', 'http://localhost:47823/respiration-locale.mp4');
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Ajouter$/ }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('#cc-ws-video-history .cc-media-credit');
    return el && el.textContent.includes('Vidéo : Jane Doe');
  });
  assert.equal(videoCreateCalls, 1, 'Ajouter doit persister réellement (POST /video-links)');
  assert.equal(lastCreateBody.url, 'http://localhost:47823/respiration-locale.mp4', 'l’URL persistée doit être celle réellement collée (lien local VideoBox), jamais le lien Pexels lui-même');
  assert.equal(lastCreateBody.title, 'respiration');
  assert.equal(lastCreateBody.attribution, 'Vidéo : Jane Doe', 'l’attribution mise en attente par "Stockage local" doit être transmise à cet ajout, sans nom de plateforme en dur');
  const creditText6 = await page.locator('#cc-ws-video-history .cc-media-credit').first().textContent();
  assert.equal(creditText6, 'respiration — Vidéo : Jane Doe', 'titre ET attribution doivent être visibles dans la grille "Vidéos enregistrées"');
  console.log('PASS 6/9 — "Ajouter" persiste réellement l’URL locale collée + titre + attribution en attente, visibles dans la grille');

  // ── Test 7 : l’attribution en attente est consommée UNE SEULE FOIS — un second ajout manuel
  // (lien tapé directement, sans repasser par "Stockage local") ne doit jamais hériter de
  // l’attribution du premier ──
  await page.fill('#cc-ws-video-url-input', 'http://localhost:1/autre.mp4');
  await page.fill('#cc-ws-video-title-input', 'Autre vidéo sans attribution');
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Ajouter$/ }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('#cc-ws-video-history .cc-media-credit');
    return el && el.textContent === 'Autre vidéo sans attribution';
  });
  assert.equal(lastCreateBody.attribution, null, 'un ajout manuel ultérieur ne doit jamais hériter de l’attribution du choix précédent');
  console.log('PASS 7/9 — l’attribution en attente est consommée une seule fois, jamais héritée par un ajout manuel ultérieur non lié');

  // ── Test 8 : repli honnête sur la grille "Vidéos enregistrées" — un lien local injoignable
  // (aucun serveur VideoBox réel dans ce test) bascule vers l’icône + texte, jamais une vignette
  // cassée silencieuse ──
  await page.waitForFunction(() => {
    const items = document.querySelectorAll('#cc-ws-video-history .cc-media-item');
    return Array.from(items).some((it) => it.querySelector('.cc-media-video-fallback-text'));
  }, { timeout: 10000 });
  const fallbackText = await page.locator('#cc-ws-video-history .cc-media-video-fallback-text').first().textContent();
  assert.ok(fallbackText.includes('VideoBox'), 'le message de repli doit être honnête et nommer la cause probable (VideoBox non lancé)');
  console.log('PASS 8/9 — repli honnête (icône + texte) quand un lien local est injoignable, jamais une vignette cassée silencieuse');

  // ── Test 9 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));
  console.log('PASS 9/9 — zéro erreur JS sur l’ensemble du scénario');

  console.log('\n=== TOUS LES TESTS "RECHERCHE VIDÉO + STOCKAGE" (9/9) PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
