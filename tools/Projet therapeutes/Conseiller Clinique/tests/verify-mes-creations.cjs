// STUDIO CLINIQUE — "Mes créations" (UX-10B), preuve réelle de bout en bout : génération (état
// initial construit directement, même choix de portée documenté que verify-media-panel.cjs) →
// sauvegarde réelle (adocWsSave, INCHANGÉ) → capture + persistance RÉELLE d'une miniature (jamais
// un texte générique) → apparition dans "Mes créations" avec cette vraie miniature → réouverture
// RÉELLE via l'adaptateur (adocOpenSavedClinicalDocument) EXACTEMENT comme au moment de la
// génération (titre, badge, charte, capacités de bloc) → filtre par titre/type → non-régression :
// une nouvelle sauvegarde sur le document rouvert crée une VERSION (jamais un second document).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(blocks, brandKitRef) {
  return {
    schemaVersion: 1,
    documentId: 'doc-creations-001', versionId: 'doc-creations-001-v1', previousVersionId: null,
    requestId: 'request-creations-001', sourceSnapshotId: 'snapshot-creations-001',
    createdAt: '2026-09-25T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Titre Test Créations', purpose: 'supervision', audience: 'clinicien',
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

  // ── Serveur factice : clinical-documents (création/liste/lecture/miniature), Browser Rendering
  // (capture), brand-assets (upload miniature + lecture), brand-kits (nom de charte) — jamais le
  // vrai Worker. ──
  let createCalls = 0, versionCalls = 0, screenshotCalls = 0, thumbUploadCalls = 0, thumbSetCalls = 0, listCalls = 0, getDocCalls = 0, brandKitCalls = 0;
  let thumbAssetId = null;
  let lastThumbSetBody = null;
  let lastScreenshotBody = null;
  const DOCUMENT_ID = 'doc-creations-server-1';
  const VERSION_ID = 'v1-creations';
  const BRAND_KIT_ID = 'bk-creations-test';

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();

    if (url.endsWith('/clinical-documents') && req.method() === 'POST') {
      createCalls++;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: DOCUMENT_ID, version_id: VERSION_ID, created_at: '2026-09-25T09:05:00Z', generation_engine: 'structured' }) });
    }
    if (url.endsWith('/clinical-documents/' + DOCUMENT_ID + '/versions') && req.method() === 'POST') {
      versionCalls++;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: DOCUMENT_ID, version_id: 'v2-creations', previous_version_id: VERSION_ID, created_at: '2026-09-25T09:20:00Z', generation_engine: 'structured' }) });
    }
    if (url.endsWith('/clinical-documents') && req.method() === 'GET') {
      listCalls++;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ documents: [{ document_id: DOCUMENT_ID, title: 'Titre Test Créations', document_kind: 'fiche', created_at: '2026-09-25T09:05:00Z', thumbnail_asset_id: thumbAssetId }] }),
      });
    }
    if (url.endsWith('/clinical-documents/' + DOCUMENT_ID) && req.method() === 'GET') {
      getDocCalls++;
      const doc = ficheDoc([heading('blk-a', 'Titre'), para('blk-b', 'Paragraphe original.')]);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          document_id: DOCUMENT_ID, title: 'Titre Test Créations', document_kind: 'fiche', created_at: '2026-09-25T09:05:00Z',
          current_version_id: VERSION_ID, generation_engine: 'structured',
          version: {
            version_id: VERSION_ID, previous_version_id: null, schema_version: 1, created_at: '2026-09-25T09:05:00Z', change_summary: null, generation_engine: 'structured',
            document: { schemaVersion: 1, clinicalDocument: doc, sourceSnapshot: { sourceSnapshotId: 'snapshot-creations-001', entries: [] }, renderManifestOverride: { id: 'manifest-brandkit-x', schemaVersion: 1, rendererVersion: '1.0.0', templateRef: { id: 'fiche-editoriale', version: 1 }, brandKitRef: { id: BRAND_KIT_ID, version: 1 }, tokensSnapshotId: 'toksnap-1', assetsSnapshotId: null, createdAt: '2026-09-25T09:00:00Z', manifestChecksum: 'sha256:' + '0'.repeat(64) } },
          },
        }),
      });
    }
    if (url.endsWith('/clinical-documents/' + DOCUMENT_ID + '/thumbnail') && req.method() === 'POST') {
      thumbSetCalls++;
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      lastThumbSetBody = body;
      thumbAssetId = body.assetId;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ document_id: DOCUMENT_ID, thumbnail_asset_id: body.assetId }) });
    }
    if (url.includes('/browser-rendering/screenshot-slide') && req.method() === 'POST') {
      screenshotCalls++;
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      lastScreenshotBody = body;
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('FAKE_JPEG_THUMBNAIL_BYTES') });
    }
    if (url.includes('/brand-assets/upload') && req.method() === 'POST') {
      thumbUploadCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset_id: 'thumb-asset-real-1', deduplicated: false, size_bytes: 25 }) });
    }
    if (url.endsWith('/brand-kits/' + BRAND_KIT_ID) && req.method() === 'GET') {
      brandKitCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: BRAND_KIT_ID, name: 'Charte Test Créations', version: 1 }) });
    }
    // Non-régression (test 8) — le panneau Médias de la barre latérale appelle GET /media-assets
    // pour son historique ; jamais mocké ailleurs dans ce fichier, donc explicitement ici (liste
    // vide, comportement neutre) plutôt que de laisser la requête réelle échouer.
    if (url.endsWith('/media-assets') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: [] }) });
    }
    if (url.includes('/brand-assets/')) {
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('FAKE_JPEG_THUMBNAIL_BYTES') });
    }
    if (url.endsWith('/brand-kits')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  const storeKey = 'adocArt_test_creations';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      name: 'Titre Test Créations', _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
    };
  }, storeKey);
  const doc = ficheDoc([heading('blk-a', 'Titre'), para('blk-b', 'Paragraphe original.')]);
  await page.evaluate(({ key, doc }) => {
    window._adocArtifacts[key]._adocStructuredDoc = doc;
    window._adocArtifacts[key]._adocStructuredSnapshot = { sourceSnapshotId: 'snapshot-creations-001', entries: [] };
    window._adocArtifacts[key]._adocRenderManifestOverride = null;
  }, { key: storeKey, doc });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
  assert.equal(opened, true, 'adocOpenWorkspace doit réussir sur un document structuré valide');

  // ── Test 1 : sauvegarde réelle → miniature réelle capturée et persistée (jamais un texte
  // générique), le tout SANS bloquer la réactivation du bouton "Enregistrer" ──
  // Armer l’attente avant le clic : une réponse locale peut précéder le retour de click().
  const thumbnailSaved = page.waitForResponse((r) => r.url().endsWith('/clinical-documents/' + DOCUMENT_ID + '/thumbnail') && r.request().method() === 'POST');
  await page.click('#cc-ws-save-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-btn').disabled);
  assert.equal(createCalls, 1, 'la sauvegarde doit créer réellement le document (POST /clinical-documents)');
  // La capture de miniature est fire-and-forget (jamais attendue par le bouton) : on attend ICI
  // spécifiquement la fin de la chaîne capture→upload→association, preuve qu'elle a bien lieu.
  await thumbnailSaved;
  assert.equal(screenshotCalls, 1, 'une vraie capture (POST /browser-rendering/screenshot-slide) doit avoir eu lieu');
  // CORRECTIF miniature (cause confirmée : fullPage:true capturait la page ENTIÈRE du document,
  // recadrée ensuite par le CSS autour de son centre vertical, jamais du bandeau titre+couverture
  // en tête) — fullPage:false doit être explicitement demandé, jamais le true implicite d'Item 58/78.
  assert.equal(lastScreenshotBody.fullPage, false, 'la capture de miniature doit explicitement demander fullPage:false (correctif cadrage sur le haut du document)');
  assert.equal(thumbUploadCalls, 1, 'la miniature capturée doit être réellement persistée (POST /brand-assets/upload, role=thumbnail)');
  assert.equal(thumbSetCalls, 1, 'l’asset_id de la miniature doit être réellement associé au document (POST .../thumbnail)');
  assert.equal(lastThumbSetBody.assetId, 'thumb-asset-real-1', 'l’assetId associé doit être exactement celui renvoyé par l’upload, jamais un id inventé');
  console.log('PASS 1/9 — sauvegarde réelle non bloquée par une capture de miniature réelle (screenshot → upload → association), asset_id cohérent de bout en bout');

  // ── Test 2 : ouvrir "Mes créations" → la vraie miniature apparaît (jamais un repli textuel
  // puisqu'elle est désormais disponible) ──
  await page.click('#cc-ws-creations-toggle');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  assert.equal(listCalls, 1, 'GET /clinical-documents doit être appelé réellement à l’ouverture du panneau');
  const thumbImgSrc = await page.locator('#cc-ws-creations-results .cc-media-thumb').first().getAttribute('src');
  assert.ok(thumbImgSrc && thumbImgSrc.includes('thumb-asset-real-1'), 'la vignette doit afficher la VRAIE miniature capturée, jamais un repli générique');
  const creditText = await page.locator('#cc-ws-creations-results .cc-media-credit').first().textContent();
  assert.ok(creditText.includes('Titre Test Créations') && creditText.includes('Fiche synthèse'), 'titre + type doivent être visibles sous la miniature');
  console.log('PASS 2/9 — "Mes créations" affiche la vraie miniature capturée (jamais un repli textuel générique) avec titre et type');

  // ── Test 3 : filtre par titre (aucune correspondance) → message vide, jamais une erreur ──
  await page.fill('#cc-ws-creations-filter-title', 'zzz-inexistant');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-empty');
  const emptyMsg = await page.locator('#cc-ws-creations-results .cc-media-empty').textContent();
  assert.ok(emptyMsg.includes('Aucune création'), 'un filtre sans résultat doit afficher un message clair, jamais une erreur JS');
  await page.fill('#cc-ws-creations-filter-title', '');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  console.log('PASS 3/9 — filtre par titre fonctionnel (message clair sans résultat, liste réelle restaurée en l’effaçant)');

  // ── Test 4 : filtre par type (aucun carrousel dans la liste) → même comportement ──
  await page.selectOption('#cc-ws-creations-filter-kind', 'carrousel');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-empty');
  await page.selectOption('#cc-ws-creations-filter-kind', 'fiche');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  console.log('PASS 4/9 — filtre par type fonctionnel (même comportement que le filtre par titre)');

  // ── Test 5 : réouverture RÉELLE — titre, badge, charte ET capacités de bloc restaurés
  // EXACTEMENT comme à la génération ──
  await page.click('[data-creations-open="0"]');
  await page.waitForFunction(() => document.getElementById('cc-ws-title').textContent === 'Titre Test Créations');
  assert.equal(getDocCalls, 1, 'la réouverture doit appeler réellement GET /clinical-documents/:id');
  const badgeText = await page.locator('#cc-ws-badge').textContent();
  assert.equal(badgeText, 'FICHE SYNTHÈSE', 'le badge de type doit refléter le documentKind réel du document rouvert');
  await page.waitForFunction(() => (document.getElementById('cc-ws-brandkit') || {}).textContent === 'Charte Test Créations');
  assert.equal(brandKitCalls, 1, 'le nom de charte doit être reconstruit via une vraie résolution GET /brand-kits/:id (jamais deviné)');
  const bodyText = await page.locator('#cc-ws-doc-card').textContent();
  assert.ok(bodyText.includes('Paragraphe original.'), 'le contenu réel du document doit être fidèlement affiché après réouverture');
  const capsCheck = await page.evaluate(() => {
    const st = window._adocWsState;
    const art = window._adocArtifacts[st.storeKey];
    return { blockEditing: art._adocCapabilities.blockEditing, hasDocId: !!art._adocClinicalDocumentId, docId: art._adocClinicalDocumentId };
  });
  assert.equal(capsCheck.blockEditing, true, 'les capacités restaurées doivent être EXACTEMENT celles de la génération (blockEditing:true pour un document structuré)');
  assert.equal(capsCheck.docId, DOCUMENT_ID, '_adocClinicalDocumentId doit être restauré (condition d’une ré-sauvegarde en NOUVELLE VERSION, pas un nouveau document)');
  console.log('PASS 5/9 — réouverture fidèle : titre, badge, charte réelle ET capacités de bloc restaurés exactement comme à la génération');

  // ── Test 6 : édition de bloc toujours possible sur le document rouvert (capacité blockEditing
  // réellement effective, pas seulement déclarée) ──
  await page.click('#blk-b');
  await page.waitForSelector('.cc-block-edit-panel');
  console.log('PASS 6/9 — l’édition de bloc fonctionne réellement sur le document rouvert (panneau de correction accessible)');
  await page.evaluate(() => window.adocCancelBlockCorrection && window.adocCancelBlockCorrection());

  // ── Test 7 : non-régression — une nouvelle sauvegarde sur le document ROUVERT crée une
  // NOUVELLE VERSION du MÊME document, jamais un second document ──
  await page.click('#cc-ws-save-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-btn').disabled);
  assert.equal(versionCalls, 1, 'la ré-sauvegarde doit créer une nouvelle version (POST .../versions), jamais un second POST /clinical-documents');
  assert.equal(createCalls, 1, 'aucun second document ne doit avoir été créé par la ré-sauvegarde');
  console.log('PASS 7/9 — non-régression : ré-enregistrer le document rouvert crée une VERSION du même document, jamais un doublon');

  // ── Test 8 : non-régression — le panneau Médias de la barre latérale reste pleinement
  // fonctionnel après l’ajout de "Mes créations" au même endroit du panneau gauche ──
  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-ws-media-history').textContent.includes('Aucune image'));
  console.log('PASS 8/9 — non-régression : le panneau Médias de la barre latérale reste pleinement fonctionnel à côté de "Mes créations"');

  // ── Test 9 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('PASS 9/9 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS "MES CRÉATIONS" (9/9) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
