// STUDIO CLINIQUE — Panneau "Médias" (UX-8E, Volet 2), CHANGEMENT DE COMPORTEMENT : une image
// choisie dans le panneau (recherche ou historique) remplit désormais le FOND du bloc actuellement
// SÉLECTIONNÉ — jamais un nouveau bloc image séparé — en réutilisant EXACTEMENT le mécanisme déjà
// existant du glisser-déposer (adocHandleImageDrop → adocApplyImageAssetToDropTarget, extrait tel
// quel, jamais reconstruit). Persistance réelle (D1+R2) inchangée, déclenchée une seule fois par
// image. Le chemin d'insertion d'un VRAI bloc image autonome (adocConfirmBlockInsert, « Insérer un
// bloc » → type « image ») reste totalement inchangé et est vérifié en non-régression.
//
// État initial de l'artefact construit directement (même choix de portée documenté que
// verify-item63f-block-drag-reorder.cjs/verify-item63c-xlsx-grid.cjs) : reconstituer un pipeline de
// génération LLM complet dépasserait la portée de ce test ciblé sur le panneau Médias lui-même.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(blocks) {
  return {
    schemaVersion: 1,
    documentId: 'doc-media-001', versionId: 'doc-media-001-v1', previousVersionId: null,
    requestId: 'request-media-001', sourceSnapshotId: 'snapshot-media-001',
    createdAt: '2026-09-25T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test Médias', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }
function para(id, text) { return { id: id, type: 'paragraph', content: { text: text }, citationIds: [], validation: {} }; }
// assetId déjà posé (jamais null) — sinon le rendu déclencherait sa propre résolution Pexels
// automatique (adocResolveImages, mécanisme distinct et inchangé) dès l'ouverture du document,
// polluant le compteur d'appels /fetch-image de ce test avec un appel qui ne vient pas du panneau
// Médias.
function imageBlock(id, label) { return { id: id, type: 'image', content: { query: label, alt: label, assetId: 'preexisting-image-asset' }, citationIds: [], validation: {} }; }
function selectBlock(page, storeKey, blockId) {
  return page.evaluate(({ key, id }) => {
    window._adocBlockEditState = { storeKey: key, blockId: id, panelEl: null, pendingBlock: null, originalBlock: null, zone: null };
  }, { key: storeKey, id: blockId });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const dialogMessages = [];
  page.on('dialog', async (d) => { dialogMessages.push(d.message()); await d.accept(); });

  // ── Serveur factice : recherche Pexels + persistance render_assets, jamais le vrai Worker ──
  let fetchImageCalls = 0, fromUrlCalls = 0, useCalls = 0, mediaListCalls = 0, deleteCalls = 0;
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
      mediaListCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: mediaStore }) });
    }
    const deleteMatch = url.match(/\/media-assets\/([a-zA-Z0-9]+)$/);
    if (deleteMatch && req.method() === 'DELETE') {
      deleteCalls++;
      const idx = mediaStore.findIndex((r) => r.asset_id === deleteMatch[1]);
      if (idx === -1) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Media asset not found' }) });
      const row = mediaStore[idx];
      mediaStore.splice(idx, 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true, wasInUse: row.ref_count > 0, refCount: row.ref_count }) });
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

  const storeKey = 'adocArt_test_media';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = { name: 'Test Médias', _adocGenerationEngine: 'structured', _adocCapabilities: { workspace: true, blockEditing: true } };
  }, storeKey);
  // blk-a (titre), blk-b (paragraphe, cible du fond), blk-img (bloc image existant, pour vérifier
  // que ce cas précis remplace bien content.assetId — jamais style.backgroundAssetId).
  const doc = ficheDoc([heading('blk-a', 'Titre'), para('blk-b', 'Paragraphe existant.'), imageBlock('blk-img', 'Image existante')]);
  await page.evaluate(({ key, doc }) => { window._adocArtifacts[key]._adocStructuredDoc = doc; }, { key: storeKey, doc });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
  assert.equal(opened, true, 'adocOpenWorkspace doit réussir sur un document structuré valide');
  const blockCount = () => page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length, storeKey);
  const initialBlockCount = await blockCount();

  // ── Test 1 : le panneau Médias, replié par défaut, s'ouvre au clic et charge l'historique ──
  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');
  assert.equal(await page.getAttribute('#cc-ws-media-toggle', 'aria-expanded'), 'true');
  await page.waitForFunction(() => document.getElementById('cc-ws-media-history').textContent.includes('Aucune image'));
  assert.equal(mediaListCalls, 1, 'ouvrir le panneau doit charger l’historique réel (GET /media-assets)');
  console.log('PASS 1/14 — panneau Médias replié par défaut, s’ouvre au clic, historique vide chargé réellement');

  // ── Test 2 : recherche réelle → résultats affichés avec attribution photographe visible ──
  // Sélecteur scopé à #cc-ws-media-subpanel-photos (correctif — avertissement de seuil de stockage
  // R2, jamais lié à ce test) : un second bouton .cc-media-search-btn ("Vérifier l'espace utilisé")
  // vit désormais au niveau du panneau Médias, AVANT ce sous-panneau dans l'ordre du DOM — un
  // sélecteur non scopé cliquerait le mauvais bouton, jamais "Rechercher".
  await page.fill('#cc-ws-media-search-input', 'calme');
  await page.click('#cc-ws-media-subpanel-photos .cc-media-search-btn');
  await page.waitForSelector('[data-media-search-insert="0"]');
  assert.equal(fetchImageCalls, 1, 'la recherche doit appeler la route /fetch-image déjà existante, jamais une réimplémentation');
  const creditText = await page.locator('#cc-ws-media-search-results .cc-media-credit').first().textContent();
  // Correctif Pexels+Pixabay — jamais de nom de plateforme en dur dans le crédit affiché (un
  // résultat futur pourrait venir de Pixabay, cf. rapport) : seul le nom du photographe compte.
  assert.ok(creditText.includes('Jane Doe'), 'l’attribution photographe doit être visible sous la vignette, sans nom de plateforme en dur : "' + creditText + '"');
  console.log('PASS 2/14 — recherche réelle via /fetch-image, résultat affiché avec attribution photographe visible');

  // ── Test 3 : insertion refusée tant qu'aucun bloc n'est sélectionné (garde-fou explicite,
  // AVANT toute persistance — aucun appel réseau gaspillé) ──
  const blocksBeforeGuard = await blockCount();
  await page.click('[data-media-search-insert="0"]');
  await page.waitForTimeout(150);
  assert.equal(fromUrlCalls, 0, 'sans bloc sélectionné, aucune persistance ne doit être déclenchée (le dialogue d’alerte a été intercepté et accepté)');
  assert.equal(await blockCount(), blocksBeforeGuard, 'aucun bloc ne doit être ajouté ni modifié tant que le garde-fou bloque l’insertion');
  console.log('PASS 3/14 — insertion refusée (message explicite) tant qu’aucun bloc n’est sélectionné, aucune persistance déclenchée');

  // ── Test 4 : bloc de texte sélectionné (blk-b) + insertion depuis un résultat de recherche →
  // persistance réelle, image posée en FOND de CE bloc précis — JAMAIS un nouveau bloc ──
  await selectBlock(page, storeKey, 'blk-b');
  await page.click('[data-media-search-insert="0"]');
  await page.waitForFunction((key) => {
    const b = window._adocArtifacts[key]._adocStructuredDoc.blocks.find((x) => x.id === 'blk-b');
    return b && b.style && b.style.backgroundAssetId === 'assetfromurl1';
  }, storeKey);
  assert.equal(fromUrlCalls, 1, 'l’insertion depuis un résultat de recherche doit persister réellement (POST /media-assets/from-url)');
  assert.equal(await blockCount(), initialBlockCount, 'AUCUN nouveau bloc ne doit être créé — le nombre de blocs doit rester strictement inchangé');
  const blkB = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.find((b) => b.id === 'blk-b'), storeKey);
  assert.equal(blkB.type, 'paragraph', 'blk-b doit rester un bloc paragraphe ordinaire, jamais transformé en bloc image');
  assert.equal(blkB.style.backgroundAssetId, 'assetfromurl1', 'le fond doit référencer l’asset RÉELLEMENT persisté');
  const bgStyle = await page.locator('#blk-b .adoc-sc-bg-overlay').getAttribute('style');
  assert.ok(bgStyle && bgStyle.includes('/brand-assets/assetfromurl1'), 'le rendu doit afficher le fond via /brand-assets/:id (mécanisme déjà existant), jamais l’URL Pexels d’origine : ' + bgStyle);
  console.log('PASS 4/14 — insertion depuis la recherche : persistance réelle, image posée en FOND du bloc sélectionné, aucun nouveau bloc créé');

  // ── Test 5 : l'historique se rafraîchit automatiquement après une insertion réelle ──
  await page.waitForFunction(() => document.querySelectorAll('#cc-ws-media-history .cc-media-item').length === 1);
  assert.ok(mediaListCalls >= 2, 'l’historique doit être rechargé après une insertion réelle (nouvel appel GET /media-assets)');
  const historyCredit = await page.locator('#cc-ws-media-history .cc-media-credit').first().textContent();
  assert.ok(historyCredit.includes('Jane Doe'), 'l’attribution doit aussi être visible dans l’historique');
  console.log('PASS 5/14 — historique rafraîchi automatiquement après insertion, attribution visible');

  // ── Test 6 : réinsertion depuis l'historique, sur un AUTRE bloc (blk-a, un titre) → AUCUN
  // nouveau téléchargement, le MÊME asset devient le fond de blk-a — jamais un nouveau bloc ──
  await selectBlock(page, storeKey, 'blk-a');
  await page.click('[data-media-history-insert="0"]');
  await page.waitForFunction((key) => {
    const b = window._adocArtifacts[key]._adocStructuredDoc.blocks.find((x) => x.id === 'blk-a');
    return b && b.style && b.style.backgroundAssetId === 'assetfromurl1';
  }, storeKey);
  assert.equal(useCalls, 1, 'réinsérer depuis l’historique doit appeler /media-assets/:id/use');
  assert.equal(fromUrlCalls, 1, 'réinsérer depuis l’historique ne doit JAMAIS redéclencher un téléchargement (/media-assets/from-url)');
  assert.equal(await blockCount(), initialBlockCount, 'toujours aucun nouveau bloc créé');
  console.log('PASS 6/14 — réinsertion depuis l’historique sur un autre bloc : aucun nouveau téléchargement, même asset posé en fond, aucun nouveau bloc');

  // ── Test 7 : bloc de type IMAGE sélectionné (blk-img) → le mécanisme remplace bien
  // content.assetId (comme le ferait le glisser-déposer sur ce même type de bloc), JAMAIS
  // style.backgroundAssetId (réservé aux blocs non-image) ──
  await selectBlock(page, storeKey, 'blk-img');
  await page.fill('#cc-ws-media-search-input', 'calme');
  await page.click('#cc-ws-media-subpanel-photos .cc-media-search-btn');
  await page.waitForSelector('[data-media-search-insert="0"]');
  await page.click('[data-media-search-insert="0"]');
  await page.waitForFunction((key) => {
    const b = window._adocArtifacts[key]._adocStructuredDoc.blocks.find((x) => x.id === 'blk-img');
    return b && b.content.assetId === 'assetfromurl2';
  }, storeKey);
  assert.equal(fromUrlCalls, 2, 'un nouveau résultat de recherche doit être persisté séparément');
  const blkImg = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.find((b) => b.id === 'blk-img'), storeKey);
  assert.equal(blkImg.style, undefined, 'un bloc image ne doit jamais recevoir style.backgroundAssetId (son fond EST son contenu)');
  assert.equal(await blockCount(), initialBlockCount, 'toujours aucun nouveau bloc créé, même pour un bloc image cible');
  console.log('PASS 7/14 — bloc image sélectionné : content.assetId remplacé (jamais style.backgroundAssetId), aucun nouveau bloc');

  // ── Test 8 : garde-fou si le bloc sélectionné n'existe plus (état obsolète) — message clair,
  // jamais un fond posé au hasard sur un autre bloc ──
  await selectBlock(page, storeKey, 'bloc-fantome-inexistant');
  const blocksBeforeGhost = await page.evaluate((key) => JSON.stringify(window._adocArtifacts[key]._adocStructuredDoc.blocks), storeKey);
  await page.click('[data-media-history-insert="0"]');
  await page.waitForFunction(() => true); // laisse le temps à l'alerte d'être traitée
  await page.waitForTimeout(150);
  assert.equal(dialogMessages[dialogMessages.length - 1], 'Le bloc sélectionné est introuvable — sélectionnez-le à nouveau.', 'un blockId obsolète doit produire un message clair, jamais une erreur silencieuse');
  const blocksAfterGhost = await page.evaluate((key) => JSON.stringify(window._adocArtifacts[key]._adocStructuredDoc.blocks), storeKey);
  assert.equal(blocksAfterGhost, blocksBeforeGhost, 'aucun bloc existant ne doit être modifié quand le bloc sélectionné est introuvable');
  console.log('PASS 8/14 — bloc sélectionné introuvable : message clair, aucun fond posé au hasard');

  // ── Test 9 : non-régression — le chemin de description Pexels existant (adocConfirmBlockInsert)
  // fonctionne toujours à l’identique, crée bien un NOUVEAU bloc, jamais touché par ce lot ──
  await selectBlock(page, storeKey, 'blk-a');
  const countBeforeLegacyInsert = await blockCount();
  await page.evaluate(() => window.adocConfirmBlockInsert('after', 'image', 'illustration libre'));
  await page.waitForFunction((n) => document.querySelectorAll('.adoc-sc-block').length >= n, countBeforeLegacyInsert + 1);
  assert.equal(await blockCount(), countBeforeLegacyInsert + 1, '« Insérer un bloc » → image doit toujours créer un vrai nouveau bloc, mécanisme totalement distinct et inchangé');
  const legacyPathBlock = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks[1], storeKey);
  assert.equal(legacyPathBlock.type, 'image');
  assert.equal(legacyPathBlock.content.query, 'illustration libre', 'le chemin description → query (résolution Pexels à l’affichage, inchangé) doit continuer de fonctionner');
  assert.equal(legacyPathBlock.content.assetId, undefined, 'ce chemin ne doit jamais poser d’assetId à la création (mécanisme distinct et inchangé)');
  console.log('PASS 9/14 — non-régression : « Insérer un bloc » → image crée toujours un vrai bloc dédié, mécanisme inchangé');

  // ── Test 10 : le bouton "Effacer" n'existe QUE dans l'historique, jamais sur un résultat de
  // recherche (pas encore persisté tant qu'on ne clique pas "Insérer") ──
  assert.equal(await page.locator('#cc-ws-media-search-results .cc-media-delete-btn').count(), 0, 'aucun bouton Effacer sur un résultat de recherche');
  assert.ok(await page.locator('#cc-ws-media-history .cc-media-delete-btn').count() >= 1, 'un bouton Effacer doit exister sur chaque vignette de l’historique');
  console.log('PASS 10/14 — bouton "Effacer" présent uniquement dans l’historique, jamais sur les résultats de recherche');

  // ── Prépare deux entrées d'historique synthétiques (une jamais utilisée, une très utilisée)
  // pour tester distinctement les deux messages de confirmation exigés par le CDC du lot précédent. ──
  mediaStore.push({ asset_id: 'assetneverused', attribution: 'Photographe Jamais', ref_count: 0, created_at: new Date().toISOString() });
  mediaStore.push({ asset_id: 'assetheavilyused', attribution: 'Photographe Populaire', ref_count: 5, created_at: new Date().toISOString() });
  await page.evaluate(() => window.adocMediaLoadHistory());
  await page.waitForSelector('[data-media-item-history]:has-text("Photographe Populaire")');

  // ── Test 11 : suppression d'une image JAMAIS utilisée (ref_count=0) → message simple,
  // suppression réelle confirmée côté serveur, vignette retirée immédiatement ──
  const neverUsedRow = await page.locator('[data-media-item-history]', { hasText: 'Photographe Jamais' });
  const neverUsedIdx = await neverUsedRow.getAttribute('data-media-item-history');
  await neverUsedRow.locator('.cc-media-delete-btn').click();
  await page.waitForFunction((i) => !document.querySelector('[data-media-item-history="' + i + '"]'), neverUsedIdx);
  assert.equal(dialogMessages[dialogMessages.length - 1], 'Supprimer cette image ?', 'ref_count=0 doit produire le message simple, jamais le message renforcé');
  assert.equal(deleteCalls, 1, 'la suppression doit appeler réellement DELETE /media-assets/:id');
  assert.ok(!mediaStore.find((r) => r.asset_id === 'assetneverused'), 'l’image doit être réellement supprimée côté serveur, pas seulement retirée de l’affichage');
  console.log('PASS 11/14 — suppression d’une image jamais utilisée : message simple, suppression réelle, vignette retirée immédiatement');

  // ── Test 12 : suppression d'une image DÉJÀ utilisée (ref_count>0) → message renforcé,
  // suppression tout de même effective une fois confirmée (jamais bloquée) ──
  const heavilyUsedRow = await page.locator('[data-media-item-history]', { hasText: 'Photographe Populaire' });
  const heavilyUsedIdx = await heavilyUsedRow.getAttribute('data-media-item-history');
  await heavilyUsedRow.locator('.cc-media-delete-btn').click();
  await page.waitForFunction((i) => !document.querySelector('[data-media-item-history="' + i + '"]'), heavilyUsedIdx);
  const lastMsg = dialogMessages[dialogMessages.length - 1];
  assert.ok(lastMsg.includes('utilisée dans au moins un document déjà enregistré') && lastMsg.includes('disparaître'), 'ref_count>0 doit produire un message renforcé et explicite : "' + lastMsg + '"');
  assert.equal(deleteCalls, 2);
  assert.ok(!mediaStore.find((r) => r.asset_id === 'assetheavilyused'), 'la suppression doit être effective malgré ref_count>0 (Christophe reste seul juge)');
  console.log('PASS 12/14 — suppression d’une image déjà utilisée : message renforcé explicite, suppression tout de même effective');

  // ── Test 13 : régression — les vignettes NON supprimées (historique d’origine) restent
  // pleinement fonctionnelles après ces suppressions (jamais de désynchronisation d’index) ──
  await selectBlock(page, storeKey, 'blk-b');
  await page.click('[data-media-history-insert="0"]'); // le tout premier item d’historique (assetfromurl1), jamais touché par les suppressions
  await page.waitForFunction(() => true);
  await page.waitForTimeout(150);
  // useCalls=2 vient du test 8 (le clic sur l'historique y déclenche bien /use AVANT que le
  // garde-fou "bloc introuvable" n'agisse, cf. adocApplyMediaAssetToSelectedBlock — la persistance
  // est déjà acquise quand ce garde-fou s'applique) ; +1 ici confirme que ce chemin fonctionne
  // toujours normalement après les suppressions.
  assert.equal(useCalls, 3, 'la réinsertion de l’item d’historique d’origine doit encore fonctionner après les suppressions (aucune désynchronisation d’index)');
  console.log('PASS 13/14 — non-régression : les vignettes non supprimées restent pleinement fonctionnelles (aucune désynchronisation d’index)');

  // ── Test 14 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));
  console.log('PASS 14/14 — zéro erreur JS sur l’ensemble du scénario');

  console.log('\n=== TOUS LES TESTS PANNEAU MÉDIAS CLIENT (14/14) PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
