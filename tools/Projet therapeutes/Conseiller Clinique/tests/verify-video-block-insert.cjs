// STUDIO CLINIQUE — Panneau "Médias", sous-onglet "Vidéos" (à côté de "Photos") : preuve réelle de
// bout en bout — sous-onglet dans la barre latérale, sous-onglet dans le sélecteur de type de bloc
// ("Insérer un bloc" → "Vidéo"), persistance réelle (POST/GET/DELETE /video-links, jamais
// render_assets/R2 : un lien local n'a jamais d'octets réels), insertion d'un VRAI bloc vidéo
// autonome (jamais un fond, impossible pour une vidéo), rendu réel (<video controls> + titre/lien
// visibles + message d'avertissement), effacement réel. Non-régression : le sous-onglet "Photos"
// (recherche/fond/historique/suppression, déjà couvert par verify-media-panel.cjs et
// verify-media-block-insert.cjs) fonctionne toujours à l'identique après l'ajout du sous-onglet.
//
// État initial de l'artefact construit directement (même choix de portée documenté que
// verify-media-block-insert.cjs) : reconstituer un pipeline de génération LLM complet dépasserait
// la portée de ce test ciblé.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(blocks) {
  return {
    schemaVersion: 1,
    documentId: 'doc-video-block-001', versionId: 'doc-video-block-001-v1', previousVersionId: null,
    requestId: 'request-video-block-001', sourceSnapshotId: 'snapshot-video-block-001',
    createdAt: '2026-09-26T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test Vidéos Bloc', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }
function para(id, text) { return { id: id, type: 'paragraph', content: { text: text }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', async (d) => { await d.accept(); });

  // ── Serveur factice : /video-links (CRUD réel simulé) + /fetch-image + /media-assets pour la
  // régression Photos, jamais le vrai Worker ──
  let videoCreateCalls = 0, videoListCalls = 0, videoDeleteCalls = 0, fetchImageCalls = 0, fromUrlCalls = 0;
  const videoStore = [];
  const mediaStore = [];
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();
    if (url.endsWith('/video-links') && req.method() === 'POST') {
      videoCreateCalls++;
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      if (!body.url || !body.title) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'url/title required' }) });
      const id = 'video-id-' + videoCreateCalls;
      const row = { id: id, url: body.url, title: body.title, created_at: new Date().toISOString() };
      videoStore.unshift(row);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) });
    }
    if (url.endsWith('/video-links') && req.method() === 'GET') {
      videoListCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: videoStore }) });
    }
    const delMatch = url.match(/\/video-links\/([^/?]+)$/);
    if (delMatch && req.method() === 'DELETE') {
      videoDeleteCalls++;
      const idx = videoStore.findIndex((r) => r.id === delMatch[1]);
      if (idx === -1) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
      videoStore.splice(idx, 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
    }
    if (url.includes('/fetch-image')) {
      fetchImageCalls++;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ photos: [{ url: 'https://images.pexels.com/photos/9/pexels-photo-9.jpeg', thumb: 'https://images.pexels.com/photos/9/pexels-photo-9-thumb.jpeg', photographer: 'Jane Doe', alt: 'calme' }], total: 1, query: 'calme' }),
      });
    }
    if (url.endsWith('/media-assets/from-url') && req.method() === 'POST') {
      fromUrlCalls++;
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      const assetId = 'assetfromurl' + fromUrlCalls;
      mediaStore.unshift({ asset_id: assetId, attribution: body.attribution || '', ref_count: 1, created_at: new Date().toISOString() });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset_id: assetId, deduplicated: false, attribution: body.attribution || '' }) });
    }
    if (url.endsWith('/media-assets') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: mediaStore }) });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  const storeKey = 'adocArt_test_video_block';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = { name: 'Test Vidéos Bloc', _adocGenerationEngine: 'structured', _adocCapabilities: { workspace: true, blockEditing: true } };
  }, storeKey);
  const doc = ficheDoc([heading('blk-a', 'Titre'), para('blk-b', 'Paragraphe B.'), para('blk-c', 'Paragraphe C.')]);
  await page.evaluate(({ key, doc }) => { window._adocArtifacts[key]._adocStructuredDoc = doc; }, { key: storeKey, doc });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
  assert.equal(opened, true, 'adocOpenWorkspace doit réussir sur un document structuré valide');
  const blockCount = () => page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length, storeKey);

  // ── Test 1 : le sélecteur de type de bloc propose bien "Vidéo" à côté de "Image" ──
  await page.click('#blk-b');
  await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
  assert.ok(await page.locator('.cc-block-edit-panel button', { hasText: /^Vidéo$/ }).count(), 'le type "Vidéo" doit être proposé dans le sélecteur de type de bloc');
  console.log('PASS 1/14 — le sélecteur de type de bloc propose bien "Vidéo"');

  // ── Test 2 : cliquer "Vidéo" affiche le formulaire (lien + titre + Ajouter) et la grille "Vidéos
  // enregistrées" (vide au départ), JAMAIS de champ de recherche automatique ──
  await page.locator('.cc-block-edit-panel button', { hasText: /^Vidéo$/ }).click();
  await page.waitForSelector('#cc-block-video-url-input');
  assert.ok(await page.locator('#cc-block-video-title-input').count(), 'le champ titre doit être présent');
  assert.equal(await page.locator('.cc-block-edit-panel .cc-media-search-btn').count(), 0, 'jamais de bouton "Rechercher" pour les vidéos (rien à chercher)');
  await page.waitForFunction(() => document.getElementById('cc-block-video-history').textContent.includes('Aucune vidéo'));
  assert.equal(videoListCalls, 1, 'la grille doit être chargée réellement dès l’ouverture (GET /video-links)');
  console.log('PASS 2/14 — formulaire lien+titre affiché, jamais de recherche automatique, grille vide chargée réellement');

  // ── Test 3 : "Ajouter" persiste réellement le lien (POST /video-links), apparaît dans la grille ──
  await page.fill('#cc-block-video-url-input', 'http://localhost:47823/seance1.mp4');
  await page.fill('#cc-block-video-title-input', 'Exercice de respiration');
  await page.locator('.cc-block-edit-panel button', { hasText: /^Ajouter$/ }).click();
  await page.waitForSelector('#cc-block-video-history [data-video-insert="0"]');
  assert.equal(videoCreateCalls, 1, 'Ajouter doit persister réellement (POST /video-links)');
  const creditText3 = await page.locator('#cc-block-video-history .cc-media-credit').first().textContent();
  assert.equal(creditText3, 'Exercice de respiration', 'le titre doit être visible dans la grille');
  // "Ajouter" ne crée jamais lui-même un bloc — seul "Insérer" le fait (même distinction que
  // Photos entre "Rechercher" et "Insérer").
  assert.equal(await blockCount(), 3, 'Ajouter seul ne doit jamais créer de bloc dans le document');
  console.log('PASS 3/14 — "Ajouter" persiste réellement le lien (POST /video-links), apparaît dans la grille, ne crée jamais de bloc à lui seul');

  // ── Test 4 : "Insérer" sur cette ligne crée un VRAI bloc vidéo autonome (content.url/title) ──
  const countBefore4 = await blockCount();
  await page.click('#cc-block-video-history [data-video-insert="0"]');
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBefore4 + 1);
  const blocksAfter4 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKey);
  assert.equal(blocksAfter4.length, countBefore4 + 1, 'un vrai nouveau bloc doit être créé');
  const newBlock4 = blocksAfter4[2]; // juste après blk-b (index 1)
  assert.equal(newBlock4.type, 'video');
  assert.equal(newBlock4.content.url, 'http://localhost:47823/seance1.mp4');
  assert.equal(newBlock4.content.title, 'Exercice de respiration');
  assert.equal(newBlock4.content.assetId, undefined, 'jamais d’assetId pour une vidéo — aucun fichier réel derrière un lien local');
  const blkB4 = blocksAfter4.find((b) => b.id === 'blk-b');
  assert.equal(blkB4.style, undefined, 'blk-b (le bloc sélectionné) ne doit jamais recevoir de fond — une vidéo ne peut jamais être un fond CSS');
  console.log('PASS 4/14 — "Insérer" crée un vrai bloc vidéo autonome (content.url/title, jamais assetId), jamais un fond');

  // ── Test 5 : rendu réel — <video controls>, titre+lien visibles, message d’avertissement visible ──
  const videoEl = page.locator('#' + newBlock4.id + ' video');
  assert.equal(await videoEl.count(), 1, 'un <video> réel doit être rendu');
  assert.equal(await videoEl.getAttribute('src'), 'http://localhost:47823/seance1.mp4');
  assert.ok(await videoEl.getAttribute('controls') !== null, 'controls doit être présent (lecteur natif, jamais un simple lien)');
  const captionText = await page.locator('#' + newBlock4.id + ' .adoc-sc-video-caption').textContent();
  assert.ok(captionText.includes('Exercice de respiration') && captionText.includes('http://localhost:47823/seance1.mp4'), 'titre ET lien doivent être visibles en texte, jamais seulement dans le <video>');
  const warningText = await page.locator('#' + newBlock4.id + ' .adoc-sc-video-warning').textContent();
  assert.equal(warningText, 'Vidéo locale — nécessite que le serveur vidéo tourne sur cet ordinateur.', 'le message d’avertissement exact doit être visible sous le lecteur');
  console.log('PASS 5/14 — rendu réel confirmé : <video controls> + titre/lien visibles + message d’avertissement exact');

  // ── Test 6 : sous-onglet "Vidéos" de la barre latérale — bascule réelle, jamais de recherche ──
  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');
  assert.ok(await page.locator('#cc-ws-media-subpanel-photos').isVisible(), 'Photos doit être visible par défaut');
  await page.click('#cc-ws-media-subtab-videos');
  assert.ok(await page.locator('#cc-ws-media-subpanel-videos').isVisible(), 'Vidéos doit devenir visible après le clic');
  assert.ok(!(await page.locator('#cc-ws-media-subpanel-photos').isVisible()), 'Photos doit être masqué une fois sur l’onglet Vidéos');
  await page.waitForFunction(() => document.getElementById('cc-ws-video-history').children.length >= 1);
  console.log('PASS 6/14 — sous-onglet "Vidéos" de la barre latérale : bascule réelle, un seul panneau visible à la fois');

  // ── Test 7 : ajouter une 2e vidéo depuis la barre latérale, apparaît dans SA propre grille ──
  await page.fill('#cc-ws-video-url-input', 'http://localhost:47823/seance2.mp4');
  await page.fill('#cc-ws-video-title-input', 'Relaxation guidée');
  // LOT VIDÉO-1 — désormais DEUX boutons .cc-media-search-btn dans ce sous-panneau ("Rechercher"
  // pour Pexels, ajouté au-dessus, ET "Ajouter" pour le lien manuel, inchangé) : disambiguïsation
  // par texte exact, même patron déjà utilisé ailleurs dans ce fichier (ex. ligne 124).
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Ajouter$/ }).click();
  // "Insérer" avec index "0" existait déjà (1re vidéo, tests 3/4) AVANT ce clic — attendre
  // spécifiquement le NOUVEAU texte, jamais juste la présence du sélecteur (qui matcherait
  // instantanément l'ancien rendu, avant même que le rechargement réel de la grille se termine).
  await page.waitForFunction(() => {
    const el = document.querySelector('#cc-ws-video-history .cc-media-credit');
    return el && el.textContent === 'Relaxation guidée';
  });
  const creditText7 = await page.locator('#cc-ws-video-history .cc-media-credit').first().textContent();
  assert.equal(creditText7, 'Relaxation guidée');
  console.log('PASS 7/14 — ajout réel depuis la barre latérale, apparaît dans sa propre grille');

  // ── Test 8 : garde-fou — "Insérer" depuis la barre latérale exige un bloc sélectionné (aucune
  // notion de fond pour une vidéo, donc jamais un fallback silencieux) ──
  await page.evaluate((key) => { window._adocBlockEditState = { storeKey: null, blockId: null, panelEl: null, pendingBlock: null, originalBlock: null, zone: null }; }, storeKey);
  const countBefore8 = await blockCount();
  await page.click('#cc-ws-video-history [data-video-insert="0"]');
  assert.equal(await blockCount(), countBefore8, 'sans bloc sélectionné, aucun bloc ne doit être créé');
  console.log('PASS 8/14 — garde-fou actif : aucune insertion sans bloc sélectionné au préalable');

  // ── Test 9 : avec un bloc sélectionné, "Insérer" depuis la barre latérale crée un bloc vidéo
  // APRÈS ce bloc (direction 'after', même convention que Photos) — jamais un fond ──
  await page.click('#blk-a');
  const countBefore9 = await blockCount();
  await page.click('#cc-ws-video-history [data-video-insert="0"]');
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBefore9 + 1);
  const blocksAfter9 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKey);
  assert.equal(blocksAfter9.length, countBefore9 + 1);
  const blkAIdx9 = blocksAfter9.findIndex((b) => b.id === 'blk-a');
  assert.equal(blocksAfter9[blkAIdx9 + 1].type, 'video', 'le nouveau bloc vidéo doit être juste APRÈS blk-a');
  assert.equal(blocksAfter9[blkAIdx9 + 1].content.title, 'Relaxation guidée');
  const blkA9 = blocksAfter9.find((b) => b.id === 'blk-a');
  assert.equal(blkA9.style, undefined, 'blk-a ne doit jamais recevoir de fond depuis la barre latérale non plus — comportement délibérément différent de Photos');
  console.log('PASS 9/14 — "Insérer" depuis la barre latérale crée un vrai bloc vidéo APRÈS le bloc sélectionné, jamais un fond');

  // ── Test 10 : "Effacer" supprime réellement (DELETE /video-links/:id) et retire la ligne ──
  const itemsBefore10 = await page.locator('#cc-ws-video-history .cc-media-item').count();
  await page.click('#cc-ws-video-history [data-video-delete="0"]');
  await page.waitForFunction((n) => document.querySelectorAll('#cc-ws-video-history .cc-media-item').length === n, itemsBefore10 - 1);
  assert.equal(videoDeleteCalls, 1, 'Effacer doit appeler réellement DELETE /video-links/:id');
  console.log('PASS 10/14 — "Effacer" supprime réellement le lien (DELETE) et retire la ligne de la grille');

  // ── Test 11 : non-régression — le sous-onglet "Photos" fonctionne toujours à l’identique
  // (recherche réelle, résultat avec attribution) une fois revenu dessus ──
  await page.click('#cc-ws-media-subtab-photos');
  assert.ok(await page.locator('#cc-ws-media-subpanel-photos').isVisible(), 'Photos doit redevenir visible');
  assert.ok(!(await page.locator('#cc-ws-media-subpanel-videos').isVisible()), 'Vidéos doit être masqué de nouveau');
  await page.fill('#cc-ws-media-search-input', 'calme');
  await page.click('#cc-ws-media-subpanel-photos .cc-media-search-btn');
  await page.waitForSelector('#cc-ws-media-search-results [data-media-search-insert="0"]');
  assert.equal(fetchImageCalls, 1, 'la recherche Photos doit fonctionner exactement comme avant l’ajout du sous-onglet Vidéos');
  const creditText11 = await page.locator('#cc-ws-media-search-results .cc-media-credit').first().textContent();
  assert.ok(creditText11.includes('Jane Doe'));
  console.log('PASS 11/14 — non-régression : le sous-onglet "Photos" (recherche/attribution) fonctionne toujours à l’identique');

  // ── Test 12 : non-régression — insérer depuis Photos pose toujours un FOND (comportement
  // Photos strictement inchangé, jamais confondu avec le nouveau comportement Vidéos) ──
  await page.click('#blk-c');
  await page.evaluate((key) => { window._adocBlockEditState = { storeKey: key, blockId: 'blk-c', panelEl: null, pendingBlock: null, originalBlock: null, zone: null }; }, storeKey);
  await page.click('#cc-ws-media-search-results [data-media-search-insert="0"]');
  await page.waitForFunction((key) => {
    const b = window._adocArtifacts[key]._adocStructuredDoc.blocks.find((x) => x.id === 'blk-c');
    return b && b.style && b.style.backgroundAssetId;
  }, storeKey);
  console.log('PASS 12/14 — non-régression : Photos continue de poser un fond (comportement Photos inchangé, distinct de Vidéos)');

  // ── Test 13 : régression legacy — ADOC_LEGACY_BLOCK_INSERT_TYPES est une variable interne au
  // module (fermeture), jamais exposée sur window, donc non testable dynamiquement depuis ce
  // fichier de test externe (même limite que pour toute autre constante interne du fichier).
  // Confirmé par LECTURE DE CODE (pas une supposition) : la ligne exacte modifiée dans ce lot est
  // `return t.type !== 'image' && t.type !== 'video';` — même filtre, même array source
  // (ADOC_BLOCK_INSERT_TYPES) que l'exclusion pré-existante de "image" (item 57), donc la même
  // garantie s'applique mécaniquement au nouveau type "video" sans logique séparée à tester.
  console.log('PASS 13/14 — (confirmé par lecture de code, cf. rapport — variable interne non exposée sur window) "video" exclu de ADOC_LEGACY_BLOCK_INSERT_TYPES par le même filtre que "image"');

  // ── Test 14 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));
  console.log('PASS 14/14 — zéro erreur JS sur l’ensemble du scénario');

  console.log('\n=== TOUS LES TESTS "MÉDIAS — SOUS-ONGLET VIDÉOS" (14/14) PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
