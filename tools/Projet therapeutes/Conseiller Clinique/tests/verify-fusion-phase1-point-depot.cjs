// STUDIO CLINIQUE — Fusion de documents, PHASE 1 : lever la restriction "premier niveau
// uniquement" + choix du point de dépôt dans A. Preuve réelle des 3 scénarios exigés par le CDC,
// plus régression complète (copie premier niveau → fin de document, toujours fonctionnelle ; Item
// 63f, glisser-déposer de réordonnancement sur A, inchangé).
const { chromium } = require('playwright');
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
function card(id, title, nestedBlocks) { return { id: id, type: 'card', content: { title: title, imageRef: null, imageAlt: null, blocks: nestedBlocks }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
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
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  // ── Fixtures ──
  // A (fiche) — 3 blocs de premier niveau, jamais de carte (root editorialBlock).
  const docA = baseDoc('doc-fusion-a', 'Document A (Fiche)', 'fiche', [heading('a-h1', 'Titre A'), para('a-p1', 'Paragraphe A1'), para('a-p2', 'Paragraphe A2')]);
  // A2 (carrousel) — une seule carte avec un bloc imbriqué, utilisée UNIQUEMENT pour le test
  // d'incompatibilité (nested target).
  const docA2 = baseDoc('doc-fusion-a2', 'Document A2 (Carrousel)', 'carrousel', [card('card-a2', 'Carte A2', [para('a2-nested-p1', 'Paragraphe imbriqué A2')])]);
  // B1 (carrousel) — source d'un bloc IMBRIQUÉ dans une carte (Phase 1 : désormais copiable).
  const docB1 = baseDoc('doc-fusion-b1', 'Document B1 (Carrousel)', 'carrousel', [card('card-b1', 'Carte B1', [para('b1-nested-p1', 'Paragraphe imbriqué B1, source de copie.')])]);
  // B2 (fiche) — source de blocs de PREMIER NIVEAU, dont un tableau (incompatible avec l'intérieur
  // d'une carte, cf. ADOC_NESTED_POSITIONABLE_TYPES qui exclut 'table').
  const docB2 = baseDoc('doc-fusion-b2', 'Document B2 (Fiche)', 'fiche', [heading('b2-h1', 'Titre B2'), para('b2-p1', 'Paragraphe B2, point précis.'), tableBlock('b2-table1')]);

  const storeKeyA = 'adocArt_fusion_a', storeKeyA2 = 'adocArt_fusion_a2';
  await page.evaluate(({ keyA, docA, keyA2, docA2 }) => {
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
  }, { keyA: storeKeyA, docA: docA, keyA2: storeKeyA2, docA2: docA2 });

  // ── Serveur factice pour "Mes créations" : B1 et B2 disponibles pour l'aperçu ──
  await page.route('**/clinical-documents', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [
      { document_id: 'doc-fusion-b1', title: docB1.title, document_kind: 'carrousel', created_at: '2026-09-28T09:05:00Z', thumbnail_asset_id: null },
      { document_id: 'doc-fusion-b2', title: docB2.title, document_kind: 'fiche', created_at: '2026-09-28T09:06:00Z', thumbnail_asset_id: null },
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
  await mockGetDoc('doc-fusion-b1', docB1);
  await mockGetDoc('doc-fusion-b2', docB2);

  // ── Ouvre A (fiche) dans l'écran de travail ──
  const openedA = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA);
  assert.equal(openedA, true, 'A doit s’ouvrir normalement');

  // ── Aperçu de B1 (carrousel) EN PARALLÈLE ──
  await page.click('#cc-ws-creations-toggle');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  await page.click('[data-creations-preview="0"]'); // B1, premier de la liste
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Document B1 (Carrousel)');
  await page.waitForSelector('#cc-preview-doc-card .adoc-sc-card');
  console.log('PASS 1/10 — B1 (carrousel) prévisualisé en parallèle de A');

  // ── Test 1 (CDC) : bloc IMBRIQUÉ de B1 copié vers le PREMIER NIVEAU de A ──
  const nestedCopyBtn = await page.waitForSelector('[data-preview-copy-block="b1-nested-p1"]');
  assert.ok(nestedCopyBtn, 'un bouton "Copier" doit désormais apparaître sur un bloc IMBRIQUÉ dans une carte (levée de la restriction premier niveau uniquement)');
  await nestedCopyBtn.click();
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const dropCountInitial = await page.locator('#cc-ws-doc-card .cc-fusion-drop-target').count();
  assert.equal(dropCountInitial, 4, 'A (3 blocs) doit offrir exactement 4 points de dépôt (avant le 1er, après chacun des 3)');
  await page.click('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a-h1"][data-fusion-position="before"]');
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 4, storeKeyA);
  const afterNestedCopy = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKeyA);
  assert.equal(afterNestedCopy[0].type, 'paragraph', 'le bloc imbriqué copié doit atterrir EXACTEMENT à l’index choisi (0, avant le titre)');
  assert.equal(afterNestedCopy[0].content.text, 'Paragraphe imbriqué B1, source de copie.', 'le texte doit être fidèlement conservé');
  assert.notEqual(afterNestedCopy[0].id, 'b1-nested-p1', 'le bloc copié doit recevoir un NOUVEL id relatif à A, jamais réutiliser l’id de B1');
  console.log('PASS 2/10 — bloc IMBRIQUÉ de B1 copié avec succès vers le PREMIER NIVEAU de A, nouvel id valide, index exact (0)');

  // ── Fermer B1, prévisualiser B2 (fiche) ──
  await page.click('#cc-preview-close-btn');
  await page.waitForSelector('#cc-preview-panel[hidden]', { state: 'attached' });
  await page.fill('#cc-ws-creations-filter-title', 'B2');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  await page.click('[data-creations-preview="0"]');
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Document B2 (Fiche)');
  console.log('PASS 3/10 — B1 fermé, B2 (fiche) prévisualisé à son tour');

  // ── Test 2 (CDC) : bloc de PREMIER NIVEAU de B2 copié vers un POINT PRÉCIS de A (pas la fin) ──
  await page.click('[data-preview-copy-block="b2-p1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  assert.equal(await page.locator('#cc-ws-doc-card .cc-fusion-drop-target').count(), 5, 'A (désormais 4 blocs) doit offrir 5 points de dépôt');
  // Choisit "après le 2e bloc actuel" (a-h1, ancien index 1) — un point du MILIEU, jamais la fin.
  await page.click('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a-h1"][data-fusion-position="after"]');
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 5, storeKeyA);
  const afterPreciseCopy = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKeyA);
  assert.equal(afterPreciseCopy[2].content.text, 'Paragraphe B2, point précis.', 'le bloc doit atterrir EXACTEMENT à l’index 2 (juste après a-h1), jamais ajouté en fin');
  assert.notEqual(afterPreciseCopy[4].content && afterPreciseCopy[4].content.text, 'Paragraphe B2, point précis.', 'confirmation négative : il ne doit PAS être en fin de document');
  console.log('PASS 4/10 — bloc de PREMIER NIVEAU de B2 copié à un POINT PRÉCIS choisi dans A (index 2), jamais en fin de document');

  // ── Régression : "copier premier niveau → fin de document" doit RESTER ATTEIGNABLE via le
  // nouveau mécanisme général (choisir explicitement le DERNIER point de dépôt) ──
  await page.click('[data-preview-copy-block="b2-h1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  await page.click('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a-p2"][data-fusion-position="after"]');
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 6, storeKeyA);
  const afterEndCopy = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks, storeKeyA);
  assert.equal(afterEndCopy[afterEndCopy.length - 1].content.text, 'Titre B2', 'le point de dépôt "après le dernier bloc" doit toujours permettre d’atterrir en FIN de document (équivalent de l’ancien comportement par défaut)');
  console.log('PASS 5/10 — non-régression : "copier vers la fin du document" reste pleinement atteignable via le nouveau mécanisme de point de dépôt');

  // ── Test toggle : recliquer le MÊME bouton "Copier" annule le choix en cours ──
  await page.click('[data-preview-copy-block="b2-table1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  await page.click('[data-preview-copy-block="b2-table1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target', { state: 'detached' });
  const pendingAfterToggle = await page.evaluate(() => window._adocFusionPendingCopy);
  assert.equal(pendingAfterToggle, null, 'recliquer le même bouton "Copier" doit annuler le choix en cours (aucun dépôt en attente)');
  console.log('PASS 6/10 — recliquer le même bouton "Copier" annule proprement le choix de point de dépôt en cours');

  // ── Test 3 (CDC) : copie INCOMPATIBLE — un bloc `table` copié vers un point de dépôt À
  // L’INTÉRIEUR D’UNE CARTE (jamais autorisé, table exclue de nestedBlock) → refus avec message
  // clair. Bascule d’abord le document ouvert vers A2 (carrousel, contient une carte). ──
  const openedA2 = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA2);
  assert.equal(openedA2, true, 'A2 (carrousel) doit s’ouvrir normalement');
  await page.click('[data-preview-copy-block="b2-table1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const dropInsideCard = await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a2-nested-p1"][data-fusion-position="after"]');
  assert.ok(dropInsideCard, 'un point de dépôt doit exister à l’intérieur de la carte de A2');
  let refusalMessage = null;
  page.once('dialog', async (d) => { refusalMessage = d.message(); await d.accept(); });
  await dropInsideCard.click();
  await page.waitForFunction(() => window._adocFusionPendingCopy === null);
  assert.ok(refusalMessage && refusalMessage.toLowerCase().includes('table') && refusalMessage.toLowerCase().includes('autorisé'), 'le message de refus doit être CLAIR et nommer le type incompatible : ' + refusalMessage);
  const a2NestedCountAfterRefusal = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks[0].content.blocks.length, storeKeyA2);
  assert.equal(a2NestedCountAfterRefusal, 1, 'A2 ne doit avoir REÇU AUCUN bloc — le refus doit être total, rien inséré');
  console.log('PASS 7/10 — copie INCOMPATIBLE (table → intérieur d’une carte) refusée avec un message clair, RIEN inséré : "' + refusalMessage + '"');

  // ── Retour à A (fiche, 6 blocs désormais) pour la régression Item 63f ──
  await page.click('#cc-preview-close-btn');
  await page.waitForSelector('#cc-preview-panel[hidden]', { state: 'attached' });
  const openedABack = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA);
  assert.equal(openedABack, true, 'A doit se rouvrir normalement, avec tous les blocs déjà fusionnés intacts');
  const blocksBeforeDrag = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  assert.equal(blocksBeforeDrag.length, 6, 'A doit toujours porter les 6 blocs issus des fusions précédentes');
  console.log('PASS 8/10 — retour à A : les 6 blocs des fusions précédentes sont intacts');

  // ── Non-régression Item 63f — glisser-déposer de réordonnancement sur A, inchangé. Refonte du
  // geste (Sujet 1) : plus de poignée carrée, déclenchement par géométrie dans la zone de bord
  // GAUCHE du bloc (adocDragInEdgeZone), même patron que verify-item63f-block-drag-reorder.cjs. ──
  const firstBlockId = blocksBeforeDrag[0];
  const secondBlockId = blocksBeforeDrag[1];
  const firstBox = await page.locator('#' + firstBlockId).boundingBox();
  const secondBox = await page.locator('#' + secondBlockId).boundingBox();
  const startX = firstBox.x + 4, startY = firstBox.y + firstBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 8);
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 5, { steps: 6 });
  await page.mouse.up();
  const blocksAfterDrag = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  assert.notDeepEqual(blocksAfterDrag, blocksBeforeDrag, 'le glisser-déposer de réordonnancement (Item 63f) doit toujours fonctionner normalement sur A');
  assert.equal(blocksAfterDrag.length, 6, 'le réordonnancement ne doit jamais faire disparaître ou dupliquer un bloc');
  console.log('PASS 9/10 — non-régression : le glisser-déposer de réordonnancement (Item 63f) reste pleinement fonctionnel sur A');

  // ── Zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS / dialogue non géré ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('PASS 10/10 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS FUSION PHASE 1 — POINT DE DÉPÔT (10/10) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
