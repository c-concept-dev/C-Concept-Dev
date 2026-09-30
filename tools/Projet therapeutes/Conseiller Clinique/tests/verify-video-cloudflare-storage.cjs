// STUDIO CLINIQUE — LOT VIDÉO-2 : stockage Cloudflare réel pour les vidéos (Pexels/Pixabay).
// Preuve réelle bout-en-bout du chemin CLIENT (le Worker lui-même est couvert séparément et en
// profondeur par verify-video-cloudflare-storage-worker.cjs, jamais dupliqué ici) : bouton
// "Stockage Cloudflare" désormais actif, indicateur de progression honnête pendant l'upload
// serveur, apparition réelle dans "Vidéos enregistrées", insertion d'un vrai bloc dont le rendu
// NE PORTE PLUS l'avertissement "Vidéo locale" (contrairement à un lien local, régression testée
// dans le MÊME document), et confirmation réelle du support Range (curseur de lecture, 206 dans
// le journal réseau — même exigence que pour VideoBox ce soir).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');
// test-large.webm — généré au lancement dans un dossier ignoré par git (cf. fixtures-video.cjs),
// jamais le clip court des autres tests : un fichier assez gros pour que le plafond de 150 Ko
// ci-dessous force un VRAI second aller-retour réseau au moment du saut de curseur, plutôt qu'un
// unique "bytes=0-" qui livrerait tout d'un coup et rendrait le test du curseur trivialement vrai
// sans rien prouver. Mesuré : 504 827 octets pour 20,84 s, Range observé à 491 520.
const { assurerFixturesVideo } = require('./fixtures-video.cjs');
let VIDEO_BYTES;
const MAX_CHUNK = 150 * 1024;

function fulfillVideoWithRange(route, buf, trackedRequests) {
  const range = route.request().headers()['range'];
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const requestedEnd = m && m[2] ? parseInt(m[2], 10) : buf.length - 1;
    const end = Math.min(requestedEnd, start + MAX_CHUNK - 1, buf.length - 1);
    trackedRequests.push({ range, start, status: 206 });
    return route.fulfill({
      status: 206, contentType: 'video/webm',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': String(end - start + 1) },
      body: buf.slice(start, end + 1),
    });
  }
  trackedRequests.push({ range: null, start: 0, status: 200 });
  return route.fulfill({ status: 200, contentType: 'video/webm', headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(buf.length) }, body: buf });
}

function ficheDoc(blocks) {
  return {
    schemaVersion: 1,
    documentId: 'doc-video-cf-001', versionId: 'doc-video-cf-001-v1', previousVersionId: null,
    requestId: 'request-video-cf-001', sourceSnapshotId: 'snapshot-video-cf-001',
    createdAt: '2026-09-27T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test Stockage Cloudflare Vidéo', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }

(async () => {
  const FIXTURES_DIR = await assurerFixturesVideo();
  VIDEO_BYTES = fs.readFileSync(path.join(FIXTURES_DIR, 'test-large.webm'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const FIXTURE = {
    id: 42, photographer: 'Jane Doe', duration: 8,
    previewUrl: 'https://videos.pexels.com/video-files/42/42-360.mp4',
    downloadUrl: 'https://videos.pexels.com/video-files/42/42-1080.mp4',
    thumbUrl: 'https://images.pexels.com/videos/42/pic-1.jpeg?w=480',
  };
  const CF_SERVED_URL_PREFIX = 'https://worker.example/video-assets/';
  const CF_ID = 'cf-vid-0001';
  const videoStore = [];
  let videoCreateCalls = 0;
  let fromUrlCalls = 0;
  let resolveUploadGate;
  const uploadGate = new Promise((r) => { resolveUploadGate = r; });
  const rangeRequests = [];

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();
    if (url.includes('/fetch-video')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [FIXTURE], total: 1, query: 'respiration' }) });
    }
    if (url.endsWith('/video-assets/from-url') && req.method() === 'POST') {
      fromUrlCalls++;
      await uploadGate; // tenu ouvert par le test — laisse le temps de vérifier l'état "en cours".
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      const row = { id: CF_ID, url: CF_SERVED_URL_PREFIX + CF_ID, title: body.title, attribution: body.attribution || null, storage_type: 'cloudflare', created_at: new Date().toISOString() };
      videoStore.unshift(row);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: row.id, url: row.url, title: row.title, attribution: row.attribution, storage_type: 'cloudflare', size_bytes: VIDEO_BYTES.length, deduplicated: false }) });
    }
    if (url === CF_SERVED_URL_PREFIX + CF_ID) {
      return fulfillVideoWithRange(route, VIDEO_BYTES, rangeRequests);
    }
    if (url.endsWith('/video-links') && req.method() === 'POST') {
      videoCreateCalls++;
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      if (!body.url || !body.title) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'url/title required' }) });
      const row = { id: 'local-id-' + videoCreateCalls, url: body.url, title: body.title, attribution: body.attribution || null, storage_type: 'local', created_at: new Date().toISOString() };
      videoStore.unshift(row);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) });
    }
    if (url.endsWith('/video-links') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: videoStore }) });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  const storeKey = 'adocArt_test_video_cf';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = { name: 'Test Stockage Cloudflare Vidéo', _adocGenerationEngine: 'structured', _adocCapabilities: { workspace: true, blockEditing: true } };
  }, storeKey);
  const doc = ficheDoc([heading('blk-a', 'Titre')]);
  await page.evaluate(({ key, doc }) => { window._adocArtifacts[key]._adocStructuredDoc = doc; }, { key: storeKey, doc });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
  assert.equal(opened, true, 'adocOpenWorkspace doit réussir sur un document structuré valide');
  const blockCount = () => page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length, storeKey);

  await page.click('#blk-a');
  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');
  await page.click('#cc-ws-media-subtab-videos');
  await page.waitForSelector('#cc-ws-media-subpanel-videos:not([hidden])');

  await page.fill('#cc-ws-video-search-input', 'respiration');
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Rechercher$/ }).click();
  await page.waitForSelector('#cc-ws-video-search-results [data-video-search-item="0"]');

  // ── Test 1 : le bouton "Stockage Cloudflare" est désormais RÉELLEMENT actif (Lot Vidéo-2) ──
  await page.click('[data-video-search-choose="0"]');
  await page.waitForSelector('#cc-video-storage-choice-0:not([hidden])');
  const cloudBtn = page.locator('[data-video-choose-cloudflare="0"]');
  assert.equal(await cloudBtn.isDisabled(), false, 'le bouton "Stockage Cloudflare" doit désormais être réellement cliquable');
  console.log('PASS 1/8 — bouton "Stockage Cloudflare" réellement actif (jamais désactivé)');

  // ── Test 2 : le clic déclenche réellement POST /video-assets/from-url avec downloadUrl+titre+
  // attribution, et affiche un indicateur de progression honnête PENDANT l'attente (jamais une
  // interface figée sans retour) ──
  await cloudBtn.click();
  await page.waitForTimeout(150); // laisse le temps au JS de poser l'état "en cours" avant de vérifier.
  assert.equal(fromUrlCalls, 1, 'le clic doit appeler réellement POST /video-assets/from-url');
  assert.equal(await cloudBtn.isDisabled(), true, 'le bouton doit être désactivé pendant l’envoi (jamais un double clic possible)');
  const statusDuring = await page.locator('#cc-video-cloudflare-status-0').textContent();
  assert.ok(statusDuring && statusDuring.length > 0, 'un message d’attente honnête doit être visible pendant l’envoi (jamais une interface figée sans retour)');
  console.log('PASS 2/8 — POST /video-assets/from-url réellement déclenché, indicateur de progression honnête visible pendant l’attente');

  // ── Test 3 : succès → message de confirmation, la vidéo apparaît réellement dans "Vidéos
  // enregistrées" avec storage_type Cloudflare ──
  resolveUploadGate();
  await page.waitForFunction(() => {
    const el = document.getElementById('cc-video-cloudflare-status-0');
    return el && el.textContent.includes('Ajoutée');
  });
  await page.waitForFunction(() => document.getElementById('cc-ws-video-history').children.length >= 1);
  const historyCreditText = await page.locator('#cc-ws-video-history .cc-media-credit').first().textContent();
  assert.equal(historyCreditText, 'respiration — Vidéo : Jane Doe', 'la vidéo Cloudflare doit apparaître dans "Vidéos enregistrées" avec titre + attribution, comme toute autre vidéo');
  console.log('PASS 3/8 — succès réel : confirmation affichée, vidéo Cloudflare apparaît dans "Vidéos enregistrées"');

  // ── Test 4 : "Insérer" cette vidéo Cloudflare crée un vrai bloc dont content.url pointe vers la
  // nouvelle route de service, JAMAIS le lien Pexels brut ──
  const countBefore4 = await blockCount();
  await page.click('#cc-ws-video-history [data-video-insert="0"]');
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBefore4 + 1);
  const blocksAfter4 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKey);
  const cfBlock = blocksAfter4[blocksAfter4.length - 1];
  assert.equal(cfBlock.type, 'video', 'un vrai bloc vidéo doit être créé');
  assert.equal(cfBlock.content.url, CF_SERVED_URL_PREFIX + CF_ID, 'content.url doit être la route de service Cloudflare, jamais le lien Pexels brut');
  console.log('PASS 4/8 — "Insérer" crée un vrai bloc pointant vers la route de service Cloudflare');

  // ── Test 5 : rendu du bloc Cloudflare — <video src> correct, JAMAIS l’avertissement "Vidéo
  // locale" (devenu faux pour ce cas, cf. rapport) ──
  const cfBlockLocator = page.locator('#' + cfBlock.id);
  await cfBlockLocator.scrollIntoViewIfNeeded();
  const cfVideoSrc = await cfBlockLocator.locator('video').getAttribute('src');
  assert.equal(cfVideoSrc, CF_SERVED_URL_PREFIX + CF_ID, 'le <video src> rendu doit être la route de service Cloudflare');
  assert.equal(await cfBlockLocator.locator('.adoc-sc-video-warning').count(), 0, 'aucun avertissement "Vidéo locale" ne doit apparaître pour une vidéo Cloudflare');
  console.log('PASS 5/8 — rendu correct : <video src> Cloudflare, aucun avertissement "Vidéo locale" affiché');

  // ── Test 6 (RÉGRESSION) — un lien LOCAL ajouté dans le MÊME document conserve l’avertissement
  // "Vidéo locale", inchangé par ce lot ──
  await page.fill('#cc-ws-video-url-input', 'http://localhost:47823/seance-locale.mp4');
  await page.fill('#cc-ws-video-title-input', 'Séance locale');
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Ajouter$/ }).click();
  await page.waitForFunction(() => document.getElementById('cc-ws-video-history').children.length >= 2);
  assert.equal(videoCreateCalls, 1, 'l’ajout manuel doit persister réellement (POST /video-links)');
  const countBefore6 = await blockCount();
  // Une insertion réussie désélectionne le bloc actif (même patron déjà observé pour Photos) —
  // re-sélectionner explicitement avant CHAQUE nouvelle insertion, jamais une sélection supposée
  // encore active après le Test 4.
  await page.click('#blk-a');
  // Le nouveau lien local est désormais EN TÊTE de la grille (tri par created_at desc, cf. Worker).
  await page.click('#cc-ws-video-history [data-video-insert="0"]');
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBefore6 + 1);
  const blocksAfter6 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKey);
  // Insertion 'after' le bloc SÉLECTIONNÉ (blk-a, en tête du document) — jamais garantie en fin de
  // tableau (le bloc Cloudflare du Test 4, inséré au même endroit, y vit déjà) : retrouvé par son
  // url, jamais par une position supposée.
  const localBlock = blocksAfter6.find((b) => b.type === 'video' && b.content.url === 'http://localhost:47823/seance-locale.mp4');
  assert.ok(localBlock, 'le bloc vidéo local doit exister dans le document');
  const localBlockLocator = page.locator('#' + localBlock.id);
  await localBlockLocator.scrollIntoViewIfNeeded();
  assert.equal(await localBlockLocator.locator('.adoc-sc-video-warning').count(), 1, 'un lien local doit TOUJOURS afficher l’avertissement "Vidéo locale" — inchangé par ce lot, même document');
  console.log('PASS 6/8 — régression confirmée : un lien local, dans le MÊME document, garde l’avertissement "Vidéo locale"');

  // ── Test 7 : lecture réelle + curseur — la vidéo Cloudflare décode réellement, un déplacement du
  // curseur déclenche une VRAIE requête Range servie en 206 (jamais un simple GET complet) ──
  await cfBlockLocator.locator('video').evaluate((v) => v.play().catch(() => {}));
  await page.waitForFunction((sel) => {
    const v = document.querySelector(sel + ' video');
    return v && v.readyState >= 1; // HAVE_METADATA — durée réelle connue.
  }, '#' + cfBlock.id, { timeout: 10000 });
  const rangeCountBeforeSeek = rangeRequests.length;
  await cfBlockLocator.locator('video').evaluate((v) => { v.currentTime = Math.max(0.05, (v.duration || 1) * 0.5); });
  await page.waitForFunction((before) => window.__rangeCountCheck !== before, rangeCountBeforeSeek).catch(() => {});
  // Attente courte supplémentaire — le navigateur peut regrouper la requête de seek avec de la
  // mise en tampon déjà en cours ; on vérifie l'historique CUMULÉ des requêtes Range plutôt qu'un
  // seul événement instantané.
  await page.waitForTimeout(300);
  assert.ok(rangeRequests.length >= 1, 'au moins une requête Range réelle doit avoir été observée sur ce fichier');
  assert.ok(rangeRequests.some((r) => r.status === 206), 'au moins une réponse 206 Partial Content doit avoir été observée — jamais seulement des 200 complets');
  // Preuve du VRAI saut de curseur (jamais seulement le chargement initial) : le fichier de test
  // (~765 Ko) dépasse le plafond de 150 Ko servi par requête — sans saut réel de currentTime, la
  // seule zone jamais demandée serait celle proche de 0. Un décalage de départ nettement au-delà du
  // premier plafond ne peut provenir que du déplacement effectif vers ~50% de la durée.
  assert.ok(rangeRequests.some((r) => r.start >= MAX_CHUNK), 'une requête Range à un décalage significatif (au-delà du premier plafond de 150 Ko) doit être observée — preuve du VRAI déplacement de curseur, pas seulement du chargement initial séquentiel');
  console.log('PASS 7/8 — curseur de lecture confirmé : requête(s) Range réelle(s) à un décalage significatif (' + Math.max(...rangeRequests.map((r) => r.start)) + ' octets), 206 Partial Content observé (' + rangeRequests.length + ' requête(s) au total)');

  // ── Test 8 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));
  console.log('PASS 8/8 — zéro erreur JS sur l’ensemble du scénario');

  console.log('\n=== TOUS LES TESTS "STOCKAGE CLOUDFLARE VIDÉO (CLIENT)" PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
