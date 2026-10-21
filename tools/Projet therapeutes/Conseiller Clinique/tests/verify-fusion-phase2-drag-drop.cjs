// STUDIO CLINIQUE — Fusion de documents, PHASE 2 : vrai geste de glisser-déposer B→A, EN
// COMPLÉMENT du clic "Copier" (Phase 1), jamais un remplacement. Preuve réelle des scénarios
// exigés par le CDC : glissement imbriqué→point précis, refus d'incompatibilité par glissement,
// coexistence du clic "Copier", non-régression Item 63f, verrou global anti-collision.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function baseDoc(id, title, documentKind, blocks) {
  return {
    schemaVersion: 1,
    documentId: id, versionId: id + '-v1', previousVersionId: null,
    requestId: 'request-' + id, sourceSnapshotId: 'snapshot-' + id,
    createdAt: '2026-09-28T09:00:00Z', language: 'fr', status: 'draft',
    title: title, purpose: 'supervision', audience: 'clinicien',
    documentKind: documentKind, renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }
function para(id, text) { return { id: id, type: 'paragraph', content: { text: text }, citationIds: [], validation: {} }; }
function tableBlock(id) { return { id: id, type: 'table', content: { headers: ['A', 'B'], rows: [['1', '2']] }, citationIds: [], validation: {} }; }
function imageBlock(id) { return { id: id, type: 'image', content: { query: 'portrait', alt: 'Portrait', assetId: 'asset-fusion-photo', imageDisplay: { fit: 'contain' } }, citationIds: [], validation: {} }; }
function card(id, title, nestedBlocks) { return { id: id, type: 'card', content: { title: title, imageRef: null, imageAlt: null, blocks: nestedBlocks }, citationIds: [], validation: {} }; }

async function dragHandleTo(page, blockId, targetPoint) {
  // Refonte du geste (Sujet 1) — plus de poignée carrée : le déclenchement se fait par géométrie,
  // dans les ADOC_DRAG_EDGE_ZONE_PX (10px) le long du bord GAUCHE du bloc (adocDragInEdgeZone),
  // jamais un mouvement de survol préalable pour "révéler" quoi que ce soit.
  const blockBox = await page.locator('#' + blockId).boundingBox();
  const startX = blockBox.x + 4, startY = blockBox.y + blockBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Dépasse le seuil de 3px SANS encore survoler A — mouvement réel confirmé, verrou posé.
  await page.mouse.move(startX + 10, startY + 10);
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 8 });
}

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();
    if (url.endsWith('/media-assets') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: [] }) });
    }
    if (url.endsWith('/brand-kits')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) });
    }
    if (url.includes('/brand-assets/asset-fusion-photo')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
    }
    if (url.includes('/library-facets') || url.includes('/library-stats') || url.includes('/fetch-image?')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], items: [] }) });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  // ── Fixtures — mêmes documents que verify-fusion-phase1-point-depot.cjs (même périmètre) ──
  const docA = baseDoc('doc-fusion2-a', 'Document A (Fiche)', 'fiche', [heading('a-h1', 'Titre A'), para('a-p1', 'Paragraphe A1'), para('a-p2', 'Paragraphe A2')]);
  const docA2 = baseDoc('doc-fusion2-a2', 'Document A2 (Carrousel)', 'carrousel', [card('card-a2', 'Carte A2', [para('a2-nested-p1', 'Paragraphe imbriqué A2')])]);
  const docB1 = baseDoc('doc-fusion2-b1', 'Document B1 (Carrousel)', 'carrousel', [card('card-b1', 'Carte B1', [para('b1-nested-p1', 'Paragraphe imbriqué B1, source de glissement.')])]);
  const docB2 = baseDoc('doc-fusion2-b2', 'Document B2 (Fiche)', 'fiche', [heading('b2-h1', 'Titre B2'), para('b2-p1', 'Paragraphe B2, glissé au milieu.'), tableBlock('b2-table1'), imageBlock('b2-image')]);
  const docA3 = baseDoc('doc-fusion2-a3', 'Présentation A3', 'presentation', [card('card-a3', 'Diapositive A', [para('a3-p1', 'Contenu initial.')]), card('card-a3-empty', 'Diapositive vide', [])]);
  const docB3 = baseDoc('doc-fusion2-b3', 'Présentation B3', 'presentation', [card('card-b3', 'Diapositive B', [para('b3-p1', 'Contenu transféré.')])]);
  docB3.blocks[0].content.imageRef = 'thérapie de couple';
  docB3.blocks[0].content.imageAlt = 'Couple en entretien';
  docB3.blocks[0].content.imageDisplay = { fit: 'contain', focalX: 45, focalY: 35 };

  const storeKeyA = 'adocArt_fusion2_a', storeKeyA2 = 'adocArt_fusion2_a2', storeKeyA3 = 'adocArt_fusion2_a3';
  await page.evaluate(({ keyA, docA, keyA2, docA2, keyA3, docA3 }) => {
    window._adocArtifacts = window._adocArtifacts || {};
    function mk(doc) {
      return {
        name: doc.title, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
        _adocStructuredDoc: doc, _adocStructuredSnapshot: { sourceSnapshotId: 'snapshot-' + doc.documentId, entries: [] }, _adocRenderManifestOverride: null,
      };
    }
    window._adocArtifacts[keyA] = mk(docA);
    window._adocArtifacts[keyA2] = mk(docA2);
    window._adocArtifacts[keyA3] = mk(docA3);
  }, { keyA: storeKeyA, docA: docA, keyA2: storeKeyA2, docA2: docA2, keyA3: storeKeyA3, docA3: docA3 });

  await page.route('**/clinical-documents', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [
      { document_id: 'doc-fusion2-b1', title: docB1.title, document_kind: 'carrousel', created_at: '2026-09-28T09:05:00Z', thumbnail_asset_id: null },
      { document_id: 'doc-fusion2-b2', title: docB2.title, document_kind: 'fiche', created_at: '2026-09-28T09:06:00Z', thumbnail_asset_id: null },
      { document_id: 'doc-fusion2-b3', title: docB3.title, document_kind: 'presentation', created_at: '2026-09-28T09:07:00Z', thumbnail_asset_id: null },
    ] }) });
  });
  function mockGetDoc(id, doc) {
    return page.route('**/clinical-documents/' + id, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        document_id: id, title: doc.title, document_kind: doc.documentKind, created_at: '2026-09-28T09:05:00Z',
        current_version_id: id + '-v1', generation_engine: 'structured',
        version: { version_id: id + '-v1', previous_version_id: null, schema_version: 1, created_at: '2026-09-28T09:05:00Z', change_summary: null, generation_engine: 'structured',
          document: { schemaVersion: 1, clinicalDocument: doc, sourceSnapshot: { sourceSnapshotId: 'snapshot-' + id, entries: [] }, renderManifestOverride: null } },
      }) });
    });
  }
  await mockGetDoc('doc-fusion2-b1', docB1);
  await mockGetDoc('doc-fusion2-b2', docB2);
  await mockGetDoc('doc-fusion2-b3', docB3);

  // ── Ouvre A, prévisualise B1 EN PARALLÈLE ──
  const openedA = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA);
  assert.equal(openedA, true, 'A doit s’ouvrir normalement');
  await page.click('#cc-ws-creations-toggle');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  await page.click('[data-creations-preview="0"]'); // B1
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Document B1 (Carrousel)');
  await page.waitForSelector('#cc-preview-doc-card .adoc-sc-card');
  console.log('PASS 1/11 — B1 (carrousel) prévisualisé en parallèle de A');

  // ── Test CDC 1 : glisser un bloc IMBRIQUÉ de B1 jusqu’à un point de dépôt PRÉCIS de A ──
  const docCardBox1 = await page.locator('#cc-ws-doc-card').boundingBox();
  await dragHandleTo(page, 'b1-nested-p1', { x: docCardBox1.x + 20, y: docCardBox1.y + 20 });
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const draggingSourceVisible = await page.locator('#b1-nested-p1.cc-fusion-dragging-source').count();
  assert.equal(draggingSourceVisible, 1, 'le bloc source dans B doit recevoir un retour visuel (classe cc-fusion-dragging-source) pendant le glissement');
  const targetLine1 = page.locator('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a-h1"][data-fusion-position="before"]');
  const targetBox1 = await targetLine1.boundingBox();
  await page.mouse.move(targetBox1.x + targetBox1.width / 2, targetBox1.y + targetBox1.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 4, storeKeyA);
  const afterNestedDrag = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKeyA);
  assert.equal(afterNestedDrag[0].content.text, 'Paragraphe imbriqué B1, source de glissement.', 'le bloc imbriqué glissé doit atterrir EXACTEMENT au point choisi (index 0)');
  assert.notEqual(afterNestedDrag[0].id, 'b1-nested-p1', 'le bloc déposé doit recevoir un NOUVEL id relatif à A');
  const draggingSourceGone = await page.locator('.cc-fusion-dragging-source').count();
  assert.equal(draggingSourceGone, 0, 'le retour visuel doit disparaître après le dépôt (B jamais réellement modifié)');
  const dropLinesGone1 = await page.locator('#cc-ws-doc-card .cc-fusion-drop-target').count();
  assert.equal(dropLinesGone1, 0, 'les lignes de dépôt doivent disparaître après un dépôt réussi');
  console.log('PASS 2/11 — bloc IMBRIQUÉ de B1 glissé avec succès vers un point PRÉCIS de A, nouvel id valide, index exact (0)');

  // ── Fermer B1, prévisualiser B2 ──
  await page.click('#cc-preview-close-btn');
  await page.waitForSelector('#cc-preview-panel[hidden]', { state: 'attached' });
  await page.fill('#cc-ws-creations-filter-title', 'B2');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  await page.click('[data-creations-preview="0"]');
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Document B2 (Fiche)');
  console.log('PASS 3/11 — B1 fermé, B2 (fiche) prévisualisé à son tour');

  // ── Test CDC 2 : glisser un bloc de PREMIER NIVEAU de B2 à un point PRÉCIS (milieu, pas la fin) ──
  const docCardBox2 = await page.locator('#cc-ws-doc-card').boundingBox();
  await dragHandleTo(page, 'b2-p1', { x: docCardBox2.x + 20, y: docCardBox2.y + 20 });
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const targetLine2 = page.locator('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a-h1"][data-fusion-position="after"]');
  const targetBox2 = await targetLine2.boundingBox();
  await page.mouse.move(targetBox2.x + targetBox2.width / 2, targetBox2.y + targetBox2.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 5, storeKeyA);
  const afterPreciseDrag = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKeyA);
  assert.equal(afterPreciseDrag[2].content.text, 'Paragraphe B2, glissé au milieu.', 'le bloc glissé doit atterrir EXACTEMENT à l’index 2 (juste après a-h1), jamais en fin');
  console.log('PASS 4/11 — bloc de PREMIER NIVEAU de B2 glissé à un point PRÉCIS de A (index 2), jamais en fin de document');

  // ── Test CDC 3 : le clic "Copier" (Phase 1) fonctionne TOUJOURS à l’identique, en parallèle du
  // nouveau geste de glissement ──
  await page.click('[data-preview-copy-block="b2-h1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  await page.click('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a-p2"][data-fusion-position="after"]');
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 6, storeKeyA);
  const afterClickCopy = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKeyA);
  assert.equal(afterClickCopy[afterClickCopy.length - 1].content.text, 'Titre B2', 'le clic "Copier" (Phase 1) doit rester pleinement fonctionnel, à l’identique, après l’ajout du glissement');
  console.log('PASS 5/11 — non-régression : le clic "Copier" (Phase 1) fonctionne toujours à l’identique, en parallèle du glissement');

  // ── Test CDC 4 : glissement vers un point INCOMPATIBLE (table → intérieur d’une carte de A2) ──
  const openedA2 = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA2);
  assert.equal(openedA2, true, 'A2 (carrousel) doit s’ouvrir normalement');
  const docCardBoxA2 = await page.locator('#cc-ws-doc-card').boundingBox();
  await dragHandleTo(page, 'b2-table1', { x: docCardBoxA2.x + 20, y: docCardBoxA2.y + 20 });
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const dropInsideCard = page.locator('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a2-nested-p1"][data-fusion-position="after"]');
  const dropInsideCardBox = await dropInsideCard.boundingBox();
  assert.ok(dropInsideCardBox, 'un point de dépôt doit exister à l’intérieur de la carte de A2');
  await page.mouse.move(dropInsideCardBox.x + dropInsideCardBox.width / 2, dropInsideCardBox.y + dropInsideCardBox.height / 2, { steps: 4 });
  let refusalMessage = null;
  page.once('dialog', async (d) => { refusalMessage = d.message(); await d.accept(); });
  await page.mouse.up();
  await page.waitForFunction(() => window._adocFusionPendingCopy === null);
  assert.ok(refusalMessage && refusalMessage.toLowerCase().includes('table') && refusalMessage.toLowerCase().includes('autorisé'), 'le message de refus doit être CLAIR et nommer le type incompatible : ' + refusalMessage);
  const a2NestedCountAfterRefusal = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.blocks.length, storeKeyA2);
  assert.equal(a2NestedCountAfterRefusal, 1, 'A2 ne doit avoir REÇU AUCUN bloc — le refus par glissement doit être total, rien inséré');
  const draggingSourceAfterRefusal = await page.locator('.cc-fusion-dragging-source').count();
  assert.equal(draggingSourceAfterRefusal, 0, 'le retour visuel du glissement doit disparaître même après un refus');
  console.log('PASS 6/11 — glissement INCOMPATIBLE (table → intérieur d’une carte) refusé par relâchement, message clair, RIEN inséré : "' + refusalMessage + '"');

  // ── Retour à A pour la suite (6 blocs fusionnés) ──
  await page.click('#cc-preview-close-btn');
  await page.waitForSelector('#cc-preview-panel[hidden]', { state: 'attached' });
  const openedABack = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA);
  assert.equal(openedABack, true, 'A doit se rouvrir normalement');
  const blocksBeforeReorder = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  assert.equal(blocksBeforeReorder.length, 6, 'A doit toujours porter les 6 blocs issus des fusions précédentes');
  console.log('PASS 7/11 — retour à A : les 6 blocs des fusions précédentes sont intacts');

  // ── Test CDC 5 : le glisser-déposer de réordonnancement (Item 63f) sur A reste pleinement
  // fonctionnel quand AUCUN glissement B→A n’est en cours ──
  {
    const firstId = blocksBeforeReorder[0], secondId = blocksBeforeReorder[1];
    const firstBox = await page.locator('#' + firstId).boundingBox();
    const secondBox = await page.locator('#' + secondId).boundingBox();
    const startX = firstBox.x + 4, startY = firstBox.y + firstBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 8, startY + 8);
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 5, { steps: 6 });
    await page.mouse.up();
    const blocksAfterReorder = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
    assert.notDeepEqual(blocksAfterReorder, blocksBeforeReorder, 'le réordonnancement Item 63f doit toujours fonctionner sur A quand aucun glissement B→A n’est en cours');
    assert.equal(blocksAfterReorder.length, 6, 'le réordonnancement ne doit jamais faire disparaître ou dupliquer un bloc');
  }
  console.log('PASS 8/11 — non-régression : le glisser-déposer de réordonnancement (Item 63f) reste pleinement fonctionnel sur A hors glissement B→A');

  // ── Test CDC 6 : verrou global — un glissement A (Item 63f) tenté PENDANT qu’un glissement B→A
  // est déjà réellement en cours (mouvement confirmé) ne doit RIEN déclencher côté A ; le
  // glissement B→A en cours doit ensuite aboutir normalement, sans corruption. ──
  // Le panneau "Mes créations" est déjà ouvert depuis plus haut (jamais re-basculé — un second
  // clic sur #cc-ws-creations-toggle le refermerait, bug réel trouvé en testant).
  await page.fill('#cc-ws-creations-filter-title', 'B2');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  await page.click('[data-creations-preview="0"]');
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Document B2 (Fiche)');
  const blocksBeforeLockTest = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  // Démarre un glissement B→A réel (bloc restant de B2 : b2-table1) et le fait progresser jusqu’au
  // mouvement réel confirmé (verrou posé), SANS relâcher.
  const b2TableBox = await page.locator('#b2-table1').boundingBox();
  const b2StartX = b2TableBox.x + 4, b2StartY = b2TableBox.y + b2TableBox.height / 2;
  await page.mouse.move(b2StartX, b2StartY);
  await page.mouse.down();
  await page.mouse.move(b2StartX + 10, b2StartY + 10);
  await page.waitForFunction(() => window._adocAnyDragActive === true);
  // Tente, PENDANT ce glissement, de démarrer le glissement A (Item 63f) par un mousedown
  // synthétique direct DANS LA ZONE DE BORD d’un bloc de A — le verrou doit l’ignorer intégralement
  // (aucune ligne de dépôt de réordonnancement, aucun changement de blocks[]).
  const lockRespected = await page.evaluate((firstBlockId) => {
    const blockEl = document.getElementById(firstBlockId);
    const rect = blockEl.getBoundingClientRect();
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: rect.x + 4, clientY: rect.y + rect.height / 2 });
    blockEl.dispatchEvent(ev);
    return window._adocAnyDragActive === true; // doit être resté true (posé par le glissement B→A), jamais perturbé
  }, blocksBeforeLockTest[0]);
  assert.equal(lockRespected, true, 'le verrou window._adocAnyDragActive doit rester posé par le glissement B→A, jamais réinitialisé par une tentative concurrente sur A');
  const blocksDuringLock = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  assert.deepEqual(blocksDuringLock, blocksBeforeLockTest, 'la tentative de glissement A pendant un glissement B→A actif ne doit RIEN changer à A (verrou respecté)');
  const reorderDropLineDuringLock = await page.locator('#cc-ws-doc-card .adoc-sc-drop-line:not(.cc-fusion-drop-target)').count();
  assert.equal(reorderDropLineDuringLock, 0, 'aucune ligne de réordonnancement Item 63f ne doit apparaître : le verrou a bloqué son démarrage');
  // Termine PROPREMENT le glissement B→A d’origine — doit aboutir normalement, sans corruption due
  // à la tentative concurrente.
  const docCardBoxLock = await page.locator('#cc-ws-doc-card').boundingBox();
  await page.mouse.move(docCardBoxLock.x + 20, docCardBoxLock.y + 20, { steps: 4 });
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const lastDropLine = page.locator('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-position="after"]').last();
  const lastDropBox = await lastDropLine.boundingBox();
  await page.mouse.move(lastDropBox.x + lastDropBox.width / 2, lastDropBox.y + lastDropBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 7, storeKeyA);
  await page.waitForFunction(() => window._adocAnyDragActive === false);
  console.log('PASS 9/11 — verrou global respecté : une tentative de glissement A pendant un glissement B→A actif est ignorée, le glissement B→A d’origine aboutit ensuite normalement');

  // ── Régression : le panneau "Mes créations" (filtre) reste pleinement fonctionnel ──
  await page.fill('#cc-ws-creations-filter-title', '');
  await page.waitForFunction(() => document.querySelectorAll('#cc-ws-creations-results .cc-media-item').length === 3);
  console.log('PASS 10/11 — non-régression : le panneau "Mes créations" (filtre par titre) reste pleinement fonctionnel');

  // Une photo de B doit entrer dans une carte de A avec son asset et ses réglages d'affichage.
  assert.equal(await page.evaluate(key => window.adocOpenWorkspace(key), storeKeyA2), true);
  await page.waitForSelector('#cc-preview-doc-card #b2-image');
  const imageBox = await page.locator('#cc-preview-doc-card #b2-image').boundingBox();
  await page.mouse.move(imageBox.x + 4, imageBox.y + imageBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(imageBox.x + 14, imageBox.y + imageBox.height / 2 + 10);
  const a2Box = await page.locator('#cc-ws-doc-card').boundingBox();
  await page.mouse.move(a2Box.x + 20, a2Box.y + 20, { steps: 6 });
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const imageTarget = page.locator('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a2-nested-p1"][data-fusion-position="after"]');
  const imageTargetBox = await imageTarget.boundingBox();
  await page.mouse.move(imageTargetBox.x + imageTargetBox.width / 2, imageTargetBox.y + imageTargetBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(key => window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.blocks.length === 2, storeKeyA2);
  const copiedImage = await page.evaluate(key => window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.blocks[1], storeKeyA2);
  assert.equal(copiedImage.type, 'image');
  assert.equal(copiedImage.content.assetId, 'asset-fusion-photo');
  assert.deepEqual(copiedImage.content.imageDisplay, { fit: 'contain' });
  assert.notEqual(copiedImage.id, 'b2-image');
  assert.equal(await page.locator('#cc-preview-doc-card #b2-image').count(), 1, 'l’image source reste intacte');
  console.log('PASS photo — bloc image glissé de l’aperçu vers la carte, asset et cadrage conservés');

  // Le cas utilisateur : deux Présentations côte à côte, y compris la photo de couverture de B.
  await page.click('#cc-preview-close-btn');
  assert.equal(await page.evaluate(key => window.adocOpenWorkspace(key), storeKeyA3), true);
  await page.fill('#cc-ws-creations-filter-title', 'Présentation B3');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  await page.click('[data-creations-preview="0"]');
  await page.waitForSelector('#cc-preview-doc-card #b3-p1');
  await page.locator('#cc-preview-doc-card #b3-p1').scrollIntoViewIfNeeded();
  const nestedBox = await page.locator('#cc-preview-doc-card #b3-p1').boundingBox();
  await page.mouse.move(nestedBox.x + 4, nestedBox.y + nestedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(nestedBox.x + 14, nestedBox.y + nestedBox.height / 2 + 10);
  const a3Box = await page.locator('#cc-ws-doc-card').boundingBox();
  await page.mouse.move(a3Box.x + 20, a3Box.y + 20, { steps: 6 });
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  let nestedTarget = page.locator('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a3-p1"][data-fusion-position="after"]');
  let nestedTargetBox = await nestedTarget.boundingBox();
  await page.mouse.move(nestedTargetBox.x + nestedTargetBox.width / 2, nestedTargetBox.y + nestedTargetBox.height / 2);
  await page.mouse.up();
  await page.waitForFunction(key => window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.blocks.length === 2, storeKeyA3);
  assert.equal((await page.evaluate(key => window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.blocks[1].content.text, storeKeyA3)), 'Contenu transféré.');
  console.log('PASS Présentation — bloc texte transféré entre deux diapositives');

  const cover = page.locator('#cc-preview-doc-card #card-b3 > .adoc-sc-card-img');
  await cover.waitFor();
  await page.setViewportSize({ width: 1260, height: 900 });
  await cover.scrollIntoViewIfNeeded();
  const coverBox = await cover.boundingBox();
  await page.mouse.move(coverBox.x + coverBox.width / 2, coverBox.y + coverBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(coverBox.x + coverBox.width / 2 - 10, coverBox.y + coverBox.height / 2 + 10);
  const narrowedDocBox = await page.locator('#cc-ws-doc-card').boundingBox();
  await page.mouse.move(narrowedDocBox.x + 20, narrowedDocBox.y + 20, { steps: 6 });
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const destinationBlock = await page.locator('#cc-ws-doc-card #a3-p1').boundingBox();
  await page.mouse.move(destinationBlock.x + destinationBlock.width / 2, destinationBlock.y + 3, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(key => window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.blocks.length === 3, storeKeyA3);
  const copiedCover = await page.evaluate(key => window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.blocks[0], storeKeyA3);
  assert.equal(copiedCover.type, 'image');
  assert.equal(copiedCover.content.query, 'thérapie de couple');
  assert.equal(copiedCover.content.alt, 'Couple en entretien');
  assert.deepEqual(copiedCover.content.imageDisplay, { fit: 'contain', focalX: 45, focalY: 35 });
  console.log('PASS Présentation — photo de couverture transférée en bloc image, source intacte');

  // Une diapositive ne portant encore aucun bloc doit offrir un point d'insertion.
  await page.locator('#cc-preview-doc-card #b3-p1').scrollIntoViewIfNeeded();
  const sourceBox = await page.locator('#cc-preview-doc-card #b3-p1').boundingBox();
  await page.mouse.move(sourceBox.x + 4, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 14, sourceBox.y + sourceBox.height / 2 + 10);
  await page.mouse.move(a3Box.x + 20, a3Box.y + 20, { steps: 6 });
  const emptyTarget = page.locator('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="empty-card:card-a3-empty"]');
  await emptyTarget.waitFor();
  await emptyTarget.scrollIntoViewIfNeeded();
  const emptyBox = await emptyTarget.boundingBox();
  await page.mouse.move(emptyBox.x + emptyBox.width / 2, emptyBox.y + emptyBox.height / 2);
  await page.mouse.up();
  await page.waitForFunction(key => window._adocArtifacts[key]._adocStructuredDoc.blocks[1].content.blocks.length === 1, storeKeyA3);
  assert.equal(await page.evaluate(key => window._adocArtifacts[key]._adocStructuredDoc.blocks[1].content.blocks[0].content.text, storeKeyA3), 'Contenu transféré.');
  console.log('PASS Présentation — premier bloc inséré par glissement dans une diapositive vide');

  // ── Zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS / dialogue non géré ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('PASS 11/11 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS FUSION PHASE 2 — GLISSER-DÉPOSER B→A (11/11) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
