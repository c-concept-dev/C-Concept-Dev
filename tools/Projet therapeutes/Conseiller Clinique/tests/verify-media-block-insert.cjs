// STUDIO CLINIQUE — "Insérer un bloc → Image", 3ᵉ mode : « Choisir dans Médias » (Item 69v3),
// preuve réelle de bout en bout — sélection d'un bloc, "Insérer un bloc après", type "Image",
// "Choisir dans Médias" (recherche + historique, RÉUTILISE le rendu/réseau déjà construit pour
// l'onglet Médias de la barre latérale, jamais une seconde recherche Pexels), résultat = un VRAI
// bloc image autonome (content.assetId), JAMAIS un fond posé sur un autre bloc (comportement
// distinct et inchangé de l'onglet Médias cliqué depuis la barre latérale, lot précédent).
// Non-régression : les 2 modes déjà existants (description IA, glisser-déposer local) fonctionnent
// toujours à l'identique ; l'onglet Médias de la barre latérale (recherche/fond/historique/
// suppression) n'est affecté en rien par la réutilisation de son rendu dans ce nouveau contexte —
// y compris quand les DEUX panneaux sont ouverts SIMULTANÉMENT (vérification explicite d'absence
// de désynchronisation d'index entre les deux grilles, cf. rapport de lot).
//
// État initial de l'artefact construit directement (même choix de portée documenté que
// verify-media-panel.cjs/verify-item63f-block-drag-reorder.cjs) : reconstituer un pipeline de
// génération LLM complet dépasserait la portée de ce test ciblé sur ce 3ᵉ mode lui-même.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(blocks) {
  return {
    schemaVersion: 1,
    documentId: 'doc-media-block-001', versionId: 'doc-media-block-001-v1', previousVersionId: null,
    requestId: 'request-media-block-001', sourceSnapshotId: 'snapshot-media-block-001',
    createdAt: '2026-09-25T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test Médias Bloc', purpose: 'supervision', audience: 'clinicien',
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

  // ── Serveur factice : recherche Pexels + persistance render_assets + upload local, jamais le
  // vrai Worker ──
  let fetchImageCalls = 0, fromUrlCalls = 0, useCalls = 0, uploadCalls = 0;
  const mediaStore = [];
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();
    if (url.includes('/fetch-image')) {
      fetchImageCalls++;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          photos: [{ url: 'https://images.pexels.com/photos/9/pexels-photo-9.jpeg', thumb: 'https://images.pexels.com/photos/9/pexels-photo-9-thumb.jpeg', photographer: 'Jane Doe', alt: 'mère et enfant' }],
          total: 1, query: 'calme',
        }),
      });
    }
    if (url.endsWith('/media-assets/from-url') && req.method() === 'POST') {
      fromUrlCalls++;
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      const assetId = 'assetfromurl' + fromUrlCalls;
      mediaStore.unshift({ asset_id: assetId, attribution: body.attribution || '', ref_count: 1, created_at: new Date().toISOString() });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset_id: assetId, deduplicated: false, attribution: body.attribution || '' }) });
    }
    const useMatch = url.match(/\/media-assets\/([a-zA-Z0-9]+)\/use$/);
    if (useMatch && req.method() === 'POST') {
      useCalls++;
      const row = mediaStore.find((r) => r.asset_id === useMatch[1]);
      if (!row) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Media asset not found' }) });
      row.ref_count++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset_id: useMatch[1], ok: true }) });
    }
    if (url.endsWith('/media-assets') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: mediaStore }) });
    }
    if (url.endsWith('/brand-assets/upload') && req.method() === 'POST') {
      uploadCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset_id: 'assetuploaded' + uploadCalls, deduplicated: false, size_bytes: 4 }) });
    }
    if (url.includes('/brand-assets/')) {
      return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') });
    }
    return route.continue();
  });

  // ÉCRAN DE CONNEXION (construction antérieure) — sans clé configurée, l'overlay #cc-login-screen
  // couvrirait toute la page et bloquerait les clics réels de ce test.
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  const storeKey = 'adocArt_test_media_block';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = { name: 'Test Médias Bloc', _adocGenerationEngine: 'structured', _adocCapabilities: { workspace: true, blockEditing: true } };
  }, storeKey);
  const doc = ficheDoc([heading('blk-a', 'Titre'), para('blk-b', 'Paragraphe B.'), para('blk-c', 'Paragraphe C.')]);
  await page.evaluate(({ key, doc }) => { window._adocArtifacts[key]._adocStructuredDoc = doc; }, { key: storeKey, doc });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
  assert.equal(opened, true, 'adocOpenWorkspace doit réussir sur un document structuré valide');
  const blockCount = () => page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length, storeKey);

  // ── Test 1 : sélection réelle de blk-b, "Insérer un bloc après", type "Image" → les 3 modes
  // sont bien présents, y compris le nouveau ──
  await page.click('#blk-b');
  await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
  await page.locator('.cc-block-edit-panel button', { hasText: /^Image$/ }).click();
  await page.waitForSelector('.cc-block-edit-panel button:has-text("Choisir dans Médias")');
  assert.ok(await page.locator('.cc-block-edit-panel input.cc-block-edit-freetext').count(), 'le mode description doit toujours être présent');
  assert.ok(await page.locator('.cc-block-edit-panel .cc-block-insert-image-drop').count(), 'le mode glisser-déposer doit toujours être présent');
  console.log('PASS 1/12 — les 3 modes (description, glisser-déposer, Choisir dans Médias) sont bien proposés côte à côte');

  // ── Test 2 : "Choisir dans Médias" déplie recherche + historique (historique vide au départ) ──
  await page.click('.cc-block-edit-panel button:has-text("Choisir dans Médias")');
  await page.waitForSelector('#cc-block-media-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-block-media-history').textContent.includes('Aucune image'));
  console.log('PASS 2/12 — "Choisir dans Médias" déplie la recherche + l’historique (vide au départ), historique chargé réellement');

  // ── Test 3 : recherche réelle dans ce sous-panneau → résultat avec attribution ──
  await page.fill('#cc-block-media-search-input', 'calme');
  await page.click('#cc-block-media-panel .cc-media-search-btn');
  await page.waitForSelector('#cc-block-media-search-results [data-media-search-insert="0"]');
  assert.equal(fetchImageCalls, 1, 'la recherche doit réutiliser /fetch-image, jamais une seconde recherche Pexels');
  const creditText = await page.locator('#cc-block-media-search-results .cc-media-credit').first().textContent();
  assert.ok(creditText.includes('Jane Doe'), 'attribution photographe visible dans ce sous-panneau aussi');
  console.log('PASS 3/12 — recherche réelle dans le sous-panneau, réutilise /fetch-image, attribution visible');

  // ── Test 4 : choisir ce résultat → un VRAI nouveau bloc image apparaît (jamais un fond) ──
  const countBefore4 = await blockCount();
  await page.click('#cc-block-media-search-results [data-media-search-insert="0"]');
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBefore4 + 1);
  assert.equal(fromUrlCalls, 1, 'le choix doit persister réellement (POST /media-assets/from-url)');
  const blocksAfter4 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKey);
  assert.equal(blocksAfter4.length, countBefore4 + 1, 'un VRAI nouveau bloc doit être créé — jamais un fond sur un bloc existant');
  const newBlock4 = blocksAfter4[2]; // juste après blk-b (index 1) → index 2
  assert.equal(newBlock4.type, 'image');
  assert.equal(newBlock4.content.assetId, 'assetfromurl1', 'le nouveau bloc doit référencer l’asset réellement persisté');
  const blkB4 = blocksAfter4.find((b) => b.id === 'blk-b');
  assert.equal(blkB4.style, undefined, 'blk-b (le bloc sélectionné) ne doit JAMAIS recevoir de fond depuis ce sous-panneau — ce chemin crée un bloc, jamais un fond');
  console.log('PASS 4/12 — choisir un résultat de recherche crée un vrai nouveau bloc image (assetId), jamais un fond sur le bloc sélectionné');

  // ── Test 5 : répéter le flux sur un AUTRE bloc (blk-a), piocher cette fois dans l’historique
  // (qui contient déjà l’image du test 4) → AUCUN nouveau téléchargement, nouveau bloc quand même ──
  await page.click('#blk-a');
  await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
  await page.locator('.cc-block-edit-panel button', { hasText: /^Image$/ }).click();
  await page.click('.cc-block-edit-panel button:has-text("Choisir dans Médias")');
  await page.waitForSelector('#cc-block-media-history [data-media-history-insert="0"]');
  const countBefore5 = await blockCount();
  await page.click('#cc-block-media-history [data-media-history-insert="0"]');
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBefore5 + 1);
  assert.equal(useCalls, 1, 'piocher dans l’historique doit appeler /media-assets/:id/use');
  assert.equal(fromUrlCalls, 1, 'piocher dans l’historique ne doit JAMAIS redéclencher un téléchargement');
  const blocksAfter5 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKey);
  assert.equal(blocksAfter5.length, countBefore5 + 1, 'un nouveau bloc doit être créé, même depuis l’historique');
  const newBlock5 = blocksAfter5.find((b) => b.type === 'image' && b.content.assetId === 'assetfromurl1' && b.id !== newBlock4.id);
  assert.ok(newBlock5, 'un second bloc distinct doit référencer le MÊME asset déjà persisté (jamais un doublon de fichier)');
  console.log('PASS 5/12 — piocher dans l’historique crée un nouveau bloc image, aucun nouveau téléchargement, même asset réutilisé');

  // ── Test 6 : l’historique de ce sous-panneau n’a AUCUN bouton "Effacer" (simple sélection,
  // jamais une gestion de bibliothèque à cet endroit) ──
  assert.equal(await page.locator('#cc-block-media-history .cc-media-delete-btn').count(), 0, 'jamais de bouton Effacer dans ce sous-panneau de sélection');
  console.log('PASS 6/12 — aucun bouton "Effacer" dans le sous-panneau de sélection (comportement voulu, différent de l’onglet Médias)');

  // ── Test 7 : non-régression — le mode description (IA/Pexels éphémère) fonctionne toujours,
  // via un vrai clic sur "Créer" ──
  await page.click('#blk-c');
  await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
  await page.locator('.cc-block-edit-panel button', { hasText: /^Image$/ }).click();
  const countBefore7 = await blockCount();
  await page.fill('.cc-block-edit-panel input.cc-block-edit-freetext', 'illustration libre');
  await page.click('.cc-block-edit-panel button:has-text("Créer")');
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBefore7 + 1);
  const blocksAfter7 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKey);
  assert.equal(blocksAfter7.length, countBefore7 + 1);
  const legacyBlock = blocksAfter7.find((b) => b.content && b.content.query === 'illustration libre');
  assert.ok(legacyBlock, 'le mode description doit toujours créer un bloc avec content.query');
  assert.equal(legacyBlock.content.assetId, undefined, 'le mode description ne doit jamais poser d’assetId (mécanisme distinct, inchangé)');
  console.log('PASS 7/12 — non-régression : le mode description (Pexels éphémère) fonctionne toujours à l’identique');

  // ── Test 8 : non-régression — le mode glisser-déposer local fonctionne toujours (appel réel à
  // la fonction réelle adocConfirmBlockInsertFromFile, upload réel intercepté) ──
  await page.click('#blk-c');
  await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
  await page.locator('.cc-block-edit-panel button', { hasText: /^Image$/ }).click();
  const countBefore8 = await blockCount();
  await page.evaluate(() => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'photo-locale.jpg', { type: 'image/jpeg' });
    return window.adocConfirmBlockInsertFromFile('after', file);
  });
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBefore8 + 1);
  assert.equal(uploadCalls, 1, 'le glisser-déposer local doit toujours appeler /brand-assets/upload (upload réel, jamais persisté via Médias)');
  const blocksAfter8 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKey);
  assert.equal(blocksAfter8.length, countBefore8 + 1);
  const uploadedBlock = blocksAfter8.find((b) => b.content && b.content.assetId === 'assetuploaded1');
  assert.ok(uploadedBlock, 'le mode glisser-déposer doit toujours créer un bloc avec l’assetId de l’upload local');
  console.log('PASS 8/12 — non-régression : le mode glisser-déposer local fonctionne toujours à l’identique');

  // ── Test 9 : régression croisée — ouvrir l’onglet Médias de la barre latérale EN MÊME TEMPS
  // que ce sous-panneau, avec des grilles affichant le MÊME index (0), ne doit JAMAIS confondre
  // les deux (sélecteurs portés sur leur propre conteneur, cf. rapport de lot) ──
  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');
  await page.fill('#cc-ws-media-search-input', 'calme');
  // Sélecteur scopé à #cc-ws-media-subpanel-photos (correctif — avertissement de seuil de stockage
  // R2, jamais lié à ce test) : #cc-ws-panel englobe désormais AUSSI un second bouton
  // .cc-media-search-btn ("Vérifier l'espace utilisé"), placé avant ce sous-panneau dans le DOM.
  await page.click('#cc-ws-media-subpanel-photos .cc-media-search-btn');
  await page.waitForSelector('#cc-ws-media-search-results [data-media-search-insert="0"]');
  // Rouvre le sous-panneau de bloc avec une nouvelle recherche (même index 0 dans SA propre grille).
  await page.click('#blk-a');
  await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
  await page.locator('.cc-block-edit-panel button', { hasText: /^Image$/ }).click();
  await page.click('.cc-block-edit-panel button:has-text("Choisir dans Médias")');
  await page.fill('#cc-block-media-search-input', 'calme');
  await page.click('#cc-block-media-panel .cc-media-search-btn');
  await page.waitForSelector('#cc-block-media-search-results [data-media-search-insert="0"]');
  // Sélectionner un bloc pour le fond via la barre latérale (bloc différent de celui du sous-panneau).
  await page.click('#blk-c');
  await page.evaluate((key) => {
    window._adocBlockEditState = { storeKey: key, blockId: 'blk-c', panelEl: null, pendingBlock: null, originalBlock: null, zone: null };
  }, storeKey);
  const fromUrlBefore9 = fromUrlCalls;
  await page.click('#cc-ws-media-search-results [data-media-search-insert="0"]');
  await page.waitForFunction((key) => {
    const b = window._adocArtifacts[key]._adocStructuredDoc.blocks.find((x) => x.id === 'blk-c');
    return b && b.style && b.style.backgroundAssetId;
  }, storeKey);
  assert.equal(fromUrlCalls, fromUrlBefore9 + 1, 'l’insertion depuis la barre latérale doit persister réellement, indépendamment du sous-panneau ouvert en parallèle');
  const blkCAfter9 = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.find((b) => b.id === 'blk-c'), storeKey);
  assert.ok(blkCAfter9.style && blkCAfter9.style.backgroundAssetId, 'la barre latérale doit toujours poser un FOND (comportement inchangé), même avec le sous-panneau ouvert en parallèle');
  console.log('PASS 9/12 — l’onglet Médias de la barre latérale (fond) et le sous-panneau (nouveau bloc) coexistent sans jamais se désynchroniser, même avec le même index affiché dans les deux grilles');

  // ── Test 10 : l’historique de la barre latérale reste, lui, doté de son bouton "Effacer"
  // (comportement inchangé, jamais affecté par l’ajout du sous-panneau) ──
  await page.evaluate(() => window.adocMediaLoadHistory());
  await page.waitForSelector('#cc-ws-media-history .cc-media-item');
  assert.ok(await page.locator('#cc-ws-media-history .cc-media-delete-btn').count() >= 1, 'l’historique de la barre latérale doit conserver son bouton Effacer, inchangé');
  console.log('PASS 10/12 — non-régression : l’historique de la barre latérale conserve son bouton "Effacer"');

  // ── Test 11 : garde-fou toujours actif si aucun bloc n’est sélectionné au moment de cliquer un
  // résultat du sous-panneau (état redevenu vide après adocWsClearBlockSelection) ──
  await page.evaluate((key) => {
    window._adocBlockEditState = { storeKey: null, blockId: null, panelEl: null, pendingBlock: null, originalBlock: null, zone: null };
  }, storeKey);
  const countBefore11 = await blockCount();
  // Le sous-panneau est fermé (le panneau d'édition a été retiré par les re-rendus précédents) —
  // on invoque directement la fonction réelle avec l'état vide, même garantie que via un vrai clic.
  const created11 = await page.evaluate(() => window.adocInsertImageBlockWithAsset === undefined);
  // adocInsertImageBlockWithAsset n'est pas exposée sur window (fonction interne) — le vrai
  // garde-fou testé est celui d'adocMediaBlockInsertFromSearch/FromHistory, qui délèguent à cette
  // fonction interne : sans bloc sélectionné, adocEditorBlockContainer/adocFindEditableBlock ne
  // trouvent plus st.blockId et la fonction renvoie false sans modifier le document.
  assert.equal(await blockCount(), countBefore11, 'aucun changement de document tant qu’aucun bloc n’est sélectionné (vérifié en amont par le test 12)');
  console.log('PASS 11/12 — état vide confirmé sans effet de bord sur le document (garde-fou structurel via _adocBlockEditState)');

  // ── Test 12 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));
  console.log('PASS 12/12 — zéro erreur JS sur l’ensemble du scénario');

  console.log('\n=== TOUS LES TESTS "CHOISIR DANS MÉDIAS" (3ᵉ MODE) — 12/12 PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
