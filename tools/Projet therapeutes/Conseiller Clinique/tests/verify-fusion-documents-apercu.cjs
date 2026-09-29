// STUDIO CLINIQUE — Fusion de documents depuis l'aperçu, CONSTRUCTION : preuve réelle que le
// document A (ouvert dans l'écran de travail) et un document B ("Mes créations") peuvent être
// consultés EN PARALLÈLE — jamais l'un à la place de l'autre — via le nouveau panneau de lecture
// seule (#cc-preview-panel, adocPreviewSavedClinicalDocument), et qu'un bloc de premier niveau de
// B peut être copié dans A (citation RENUMÉROTÉE ET CONSERVÉE depuis Phase 3, jamais plus retirée
// silencieusement comme avant — cf. verify-fusion-phase3-citations.cjs pour la preuve dédiée et
// complète de ce mécanisme ; ce fichier vérifie seulement la non-régression du cas simple ; image
// copiée telle quelle, assetId déjà persisté réutilisé sans nouvel upload). Couvre les 5 points
// actés par Christophe : (1) A et B visibles simultanément, (2) bouton "Copier ce bloc" (jamais une
// extension du glisser-déposer Item 63f), (3) image copiée sans nouvel appel réseau d'upload,
// (4) B strictement en lecture seule, jamais modifié ni sauvegardé par cette consultation,
// (5) restriction "premier niveau uniquement" (jamais un bloc imbriqué dans une carte Carrousel).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');
function sha256hex(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function ficheDoc(id, title, blocks) {
  return {
    schemaVersion: 1,
    documentId: id, versionId: id + '-v1', previousVersionId: null,
    requestId: 'request-' + id, sourceSnapshotId: 'snapshot-' + id,
    createdAt: '2026-09-25T09:00:00Z', language: 'fr', status: 'draft',
    title: title, purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function carrouselDoc(id, title, blocks) {
  const d = ficheDoc(id, title, blocks);
  d.documentKind = 'carrousel';
  return d;
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }
function para(id, text) { return { id: id, type: 'paragraph', content: { text: text }, citationIds: [], validation: {} }; }
function paraCite(id, text, citationId) {
  return { id: id, type: 'paragraph', content: { text: text }, citationIds: [citationId], validation: { citationLinks: [{ citationId: citationId, claimText: text, claimSupport: 'pass' }] } };
}
function image(id, assetId, alt) { return { id: id, type: 'image', content: { query: alt, alt: alt, assetId: assetId }, citationIds: [], validation: {} }; }
function card(id, title, nestedBlocks) { return { id: id, type: 'card', content: { title: title, imageRef: null, imageAlt: null, blocks: nestedBlocks }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', async (d) => { pageErrors.push('DIALOG INATTENDU : ' + d.message()); await d.accept(); });

  const DOC_B1 = 'doc-fusion-b1';
  const DOC_B2 = 'doc-fusion-b2';
  const docB1 = ficheDoc(DOC_B1, 'Titre Document B', [
    heading('b-h1', 'Titre B'),
    paraCite('b-p1', 'Paragraphe avec citation.', 'citation-1'),
    image('b-img1', 'asset-shared-1', 'Image partagée'),
  ]);
  // Fusion Phase 3 (préservation des citations) — 'citation-1' doit être une VRAIE citation
  // résolvable dans B (citations[] + snapshot.entries[]), jamais seulement une référence déclarée
  // sur le bloc : un document réel a toujours les deux en cohérence, et Phase 3 lit désormais
  // réellement docB.citations/snapshot.entries pour renumeroter puis conserver.
  docB1.citations.push({ citationId: 'citation-1', sourceSnapshotEntryId: 'entry-b-1', displayLabel: 'Auteur B, p.1' });
  const B1_SOURCE_TEXT = 'Texte source pour la citation copiée depuis B.';
  const snapshotB1 = { sourceSnapshotId: 'snapshot-' + DOC_B1, entries: [
    { sourceSnapshotEntryId: 'entry-b-1', sourceType: 'library', sourceId: 'book-b', passageId: 'passage-b',
      exactText: B1_SOURCE_TEXT, contentChecksum: 'sha256:' + sha256hex(B1_SOURCE_TEXT), book: 'Livre B', author: 'Auteur B',
      locator: { page: 1, section: null }, retrievedAt: '2026-09-25T09:05:00Z' },
  ] };
  const docB2 = carrouselDoc(DOC_B2, 'Titre Document B2 (Carrousel)', [
    card('card-01', 'Carte 1', [para('c1-p1', 'Contenu de carte, imbriqué (copiable depuis la Phase 1 de la fusion).')]),
  ]);

  let listCalls = 0;
  const getDocCalls = { [DOC_B1]: 0, [DOC_B2]: 0 };
  let assetGetCalls = 0, assetPostCalls = 0, thumbSetCalls = 0, versionCalls = 0;

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();

    if (url.endsWith('/clinical-documents') && req.method() === 'GET') {
      listCalls++;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ documents: [
          { document_id: DOC_B1, title: docB1.title, document_kind: 'fiche', created_at: '2026-09-25T09:05:00Z', thumbnail_asset_id: null },
          { document_id: DOC_B2, title: docB2.title, document_kind: 'carrousel', created_at: '2026-09-25T09:06:00Z', thumbnail_asset_id: null },
        ] }),
      });
    }
    if (url.endsWith('/clinical-documents/' + DOC_B1) && req.method() === 'GET') {
      getDocCalls[DOC_B1]++;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          document_id: DOC_B1, title: docB1.title, document_kind: 'fiche', created_at: '2026-09-25T09:05:00Z',
          current_version_id: DOC_B1 + '-v1', generation_engine: 'structured',
          version: { version_id: DOC_B1 + '-v1', previous_version_id: null, schema_version: 1, created_at: '2026-09-25T09:05:00Z', change_summary: null, generation_engine: 'structured',
            document: { schemaVersion: 1, clinicalDocument: docB1, sourceSnapshot: snapshotB1, renderManifestOverride: null } },
        }),
      });
    }
    if (url.endsWith('/clinical-documents/' + DOC_B2) && req.method() === 'GET') {
      getDocCalls[DOC_B2]++;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          document_id: DOC_B2, title: docB2.title, document_kind: 'carrousel', created_at: '2026-09-25T09:06:00Z',
          current_version_id: DOC_B2 + '-v1', generation_engine: 'structured',
          version: { version_id: DOC_B2 + '-v1', previous_version_id: null, schema_version: 1, created_at: '2026-09-25T09:06:00Z', change_summary: null, generation_engine: 'structured',
            document: { schemaVersion: 1, clinicalDocument: docB2, sourceSnapshot: { sourceSnapshotId: 'snapshot-' + DOC_B2, entries: [] }, renderManifestOverride: null } },
        }),
      });
    }
    // Sauvegarde d'un document — NE DOIT JAMAIS être appelée pour B dans ce lot (lecture seule
    // stricte, cf. test dédié) : présente ici uniquement pour détecter un appel accidentel.
    if (url.includes('/clinical-documents/') && url.endsWith('/thumbnail') && req.method() === 'POST') {
      thumbSetCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
    if (url.includes('/clinical-documents/') && url.endsWith('/versions') && req.method() === 'POST') {
      versionCalls++;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({}) });
    }
    if (url.endsWith('/brand-assets/asset-shared-1') && req.method() === 'GET') {
      assetGetCalls++;
      // PNG 1×1 réel (jamais un placeholder texte) : l'assertion vérifie un AFFICHAGE réel de
      // l'image copiée, un décodage échoué (onerror) masquerait le test plutôt que le faire échouer.
      const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
      return route.fulfill({ status: 200, contentType: 'image/png', body: onePixelPng });
    }
    if (url.includes('/brand-assets/upload') && req.method() === 'POST') {
      assetPostCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset_id: 'should-never-be-called', deduplicated: false, size_bytes: 1 }) });
    }
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

  // ── Document A : injecté directement (comme les autres tests de ce dépôt), déjà ouvert dans
  // l'écran de travail AVANT toute interaction avec "Mes créations". ──
  const storeKeyA = 'adocArt_test_fusion_a';
  const docA = ficheDoc('doc-fusion-a', 'Titre Document A', [heading('a-h1', 'Titre A'), para('a-p1', 'Paragraphe A original.')]);
  await page.evaluate(({ key, doc }) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      name: doc.title, _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      _adocStructuredDoc: doc, _adocStructuredSnapshot: { sourceSnapshotId: 'snapshot-doc-fusion-a', entries: [] }, _adocRenderManifestOverride: null,
    };
  }, { key: storeKeyA, doc: docA });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA);
  assert.equal(opened, true, 'le document A doit s’ouvrir normalement dans l’écran de travail');

  // ── Test 1 : ouvrir "Mes créations" (panneau latéral) → bouton "Aperçu" présent sur chaque
  // création, EN PLUS de "Ouvrir" (jamais à sa place) ──
  await page.click('#cc-ws-creations-toggle');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  assert.equal(listCalls, 1, 'GET /clinical-documents doit être appelé réellement');
  await page.waitForSelector('[data-creations-preview="0"]');
  await page.waitForSelector('[data-creations-open="0"]');
  console.log('PASS 1/14 — "Mes créations" (panneau latéral) affiche un bouton "Aperçu" à côté de "Ouvrir" sur chaque création');

  // ── Test 2 : clic "Aperçu" → panneau B s’ouvre, A reste affiché, les DEUX sont visibles
  // SIMULTANÉMENT (jamais l’un masquant l’autre) ──
  await page.click('[data-creations-preview="0"]');
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Titre Document B');
  assert.equal(getDocCalls[DOC_B1], 1, 'l’aperçu doit appeler réellement GET /clinical-documents/:id pour B');
  const aVisible = await page.locator('#cc-ws-doc-card').isVisible();
  const bVisible = await page.locator('#cc-preview-doc-card').isVisible();
  assert.ok(aVisible && bVisible, 'le document A (écran de travail) ET l’aperçu B doivent être visibles SIMULTANÉMENT');
  const aBox = await page.locator('.cc-ws-doc-area').boundingBox();
  const bBox = await page.locator('#cc-preview-panel').boundingBox();
  assert.ok(aBox.x + aBox.width <= bBox.x + 1, 'le panneau B (droite) ne doit jamais chevaucher/masquer la zone de document A (gauche/centre) : A se termine avant que B ne commence');
  console.log('PASS 2/14 — le panneau B s’ouvre EN PARALLÈLE de A, les deux réellement visibles et non superposés (' + JSON.stringify({ aRight: aBox.x + aBox.width, bLeft: bBox.x }) + ')');

  // ── Test 3 : B affiche fidèlement son contenu, y compris la citation (marqueur [1] cliquable) ──
  const bBodyText = await page.locator('#cc-preview-doc-card').textContent();
  assert.ok(bBodyText.includes('Titre B') && bBodyText.includes('Paragraphe avec citation.'), 'le contenu réel de B doit être fidèlement affiché dans l’aperçu');
  await page.waitForSelector('#cc-preview-doc-card a[href="#cite-citation-1"]');
  console.log('PASS 3/14 — B affiche fidèlement son contenu, y compris le marqueur de citation [1]');

  // ── Test 4 : B est STRICTEMENT en lecture seule — cliquer sur un bloc de B n’ouvre JAMAIS le
  // panneau de correction contextuelle (contrairement à un clic sur un bloc de A, cf. test 12) ──
  await page.click('#b-p1');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.cc-block-edit-panel').count(), 0, 'aucun mécanisme d’édition ne doit jamais s’activer sur un bloc de B (lecture seule stricte)');
  console.log('PASS 4/14 — B est strictement en lecture seule : cliquer sur un de ses blocs n’ouvre jamais le panneau de correction');

  // ── Test 5 : copier le bloc paragraphe AVEC citation → Phase 3 : la citation est RENUMÉROTÉE ET
  // CONSERVÉE (jamais plus retirée silencieusement), le texte est conservé, jamais un nouveau
  // réordonnancement ou une extension du glisser-déposer. Mise à jour Phase 1 (choix du point de
  // dépôt) : le clic "Copier" ouvre désormais le choix du point de dépôt, jamais un ajout direct —
  // choisir explicitement "après le dernier bloc de A" reproduit fidèlement le comportement observé
  // par ce test avant la Phase 1. Preuve complète et dédiée du mécanisme de préservation des
  // citations : verify-fusion-phase3-citations.cjs (ce test-ci vérifie seulement la non-régression
  // du cas simple, un seul document B, une seule citation). ──
  let blocksA = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length, storeKeyA);
  assert.equal(blocksA, 2, 'A doit démarrer avec exactement 2 blocs (état initial)');
  await page.click('[data-preview-copy-block="b-p1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const lastBlockIdBeforeTest5 = await page.evaluate((key) => { const bs = window._adocArtifacts[key]._adocStructuredDoc.blocks; return bs[bs.length - 1].id; }, storeKeyA);
  await page.click('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="' + lastBlockIdBeforeTest5 + '"][data-fusion-position="after"]');
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 3, storeKeyA);
  const afterCopy5 = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    const blocks = art._adocStructuredDoc.blocks;
    return { copiedTextBlock: blocks[blocks.length - 1], citations: art._adocStructuredDoc.citations, entries: art._adocStructuredSnapshot.entries };
  }, storeKeyA);
  const copiedTextBlock = afterCopy5.copiedTextBlock;
  assert.equal(copiedTextBlock.type, 'paragraph', 'le bloc copié doit garder son type d’origine');
  assert.equal(copiedTextBlock.content.text, 'Paragraphe avec citation.', 'le TEXTE doit être conservé tel quel');
  assert.equal(copiedTextBlock.citationIds.length, 1, 'Phase 3 : citationIds doit être CONSERVÉ (1 citation), jamais retiré');
  assert.notEqual(copiedTextBlock.citationIds[0], 'citation-1', 'le bloc copié doit référencer un NOUVEL id de citation, jamais réutiliser celui de B tel quel');
  assert.equal(copiedTextBlock.validation.citationLinks.length, 1, 'validation.citationLinks doit être CONSERVÉ (1 lien), jamais retiré');
  assert.equal(copiedTextBlock.validation.citationLinks[0].citationId, copiedTextBlock.citationIds[0], 'citationLinks doit référencer le MÊME nouvel id que citationIds');
  assert.equal(copiedTextBlock.validation.citationLinks[0].claimText, 'Paragraphe avec citation.', 'claimText doit rester fidèle au texte d’origine');
  assert.notEqual(copiedTextBlock.id, 'b-p1', 'le bloc copié doit recevoir un NOUVEL id relatif à A (adocNextBlockId), jamais réutiliser l’id de B');
  const mergedCitation5 = afterCopy5.citations.find((c) => c.citationId === copiedTextBlock.citationIds[0]);
  assert.ok(mergedCitation5, 'la nouvelle citation doit exister dans A.citations');
  assert.equal(mergedCitation5.displayLabel, 'Auteur B, p.1', 'le displayLabel doit être fidèlement conservé depuis B');
  const mergedEntry5 = afterCopy5.entries.find((e) => e.sourceSnapshotEntryId === mergedCitation5.sourceSnapshotEntryId);
  assert.ok(mergedEntry5, 'la nouvelle entrée de snapshot doit exister dans A');
  assert.equal(mergedEntry5.exactText, 'Texte source pour la citation copiée depuis B.', 'le texte source exact doit être fidèlement conservé, jamais réécrit');
  await page.waitForFunction(() => document.querySelector('#cc-ws-doc-card a[href="#cite-citation-1"]') === null);
  await page.waitForFunction((newId) => !!document.getElementById('cite-' + newId), copiedTextBlock.citationIds[0]);
  console.log('PASS 5/14 — copie d’un bloc texte AVEC citation : texte conservé, citation Phase 3 RENUMÉROTÉE ET CONSERVÉE (jamais plus retirée), nouvel id attribué relativement à A, note de bas de document présente');

  // ── Test 6 : B n’a JAMAIS été modifié par cette copie (clone profond, jamais une référence) ──
  const bStillIntact = await page.evaluate((id) => {
    const b = window._adocPreviewState.art._adocStructuredDoc.blocks.find((x) => x.id === 'b-p1');
    return { citationIds: b.citationIds, hasCitationLinks: !!(b.validation && b.validation.citationLinks) };
  });
  assert.deepEqual(bStillIntact.citationIds, ['citation-1'], 'le bloc ORIGINAL de B ne doit jamais être modifié par la copie (clone profond, pas une référence)');
  assert.equal(bStillIntact.hasCitationLinks, true, 'validation.citationLinks de B doit rester intact');
  assert.equal(thumbSetCalls, 0, 'B ne doit jamais être sauvegardé (aucun appel de persistance) par cette simple consultation/copie');
  assert.equal(versionCalls, 0, 'aucune nouvelle version ne doit jamais être créée pour B par cette consultation/copie');
  console.log('PASS 6/14 — B reste rigoureusement intact après la copie (clone profond) : aucune mutation, aucune sauvegarde accidentelle');

  // ── Test 7 : copier le bloc image → assetId réutilisé TEL QUEL (déjà persisté), affichage
  // immédiat, JAMAIS un nouvel appel d’upload. Même mise à jour Phase 1 qu’au test 5 : choisir
  // explicitement "après le dernier bloc de A". ──
  const assetPostBefore = assetPostCalls;
  await page.click('[data-preview-copy-block="b-img1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const lastBlockIdBeforeTest7 = await page.evaluate((key) => { const bs = window._adocArtifacts[key]._adocStructuredDoc.blocks; return bs[bs.length - 1].id; }, storeKeyA);
  await page.click('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="' + lastBlockIdBeforeTest7 + '"][data-fusion-position="after"]');
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 4, storeKeyA);
  const copiedImageBlock = await page.evaluate((key) => {
    const blocks = window._adocArtifacts[key]._adocStructuredDoc.blocks;
    return blocks[blocks.length - 1];
  }, storeKeyA);
  assert.equal(copiedImageBlock.type, 'image', 'le bloc copié doit être une image');
  assert.equal(copiedImageBlock.content.assetId, 'asset-shared-1', 'l’assetId doit être réutilisé TEL QUEL, jamais régénéré');
  await page.waitForSelector('#cc-ws-doc-card img[src*="asset-shared-1"]');
  assert.equal(assetPostCalls, assetPostBefore, 'AUCUN nouvel appel d’upload (POST /brand-assets/upload) ne doit avoir lieu pour copier une image déjà persistée');
  console.log('PASS 7/14 — copie d’un bloc image : assetId déjà persisté réutilisé tel quel, affichage immédiat, zéro nouvel appel d’upload');

  // ── Test 8 : fermeture EXPLICITE — jamais un clic extérieur (décision actée : ne pas perdre une
  // session de copie multi-blocs en cours) ──
  await page.click('#cc-ws-doc-card');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#cc-preview-panel').isHidden(), false, 'un clic EXTÉRIEUR au panneau B ne doit jamais le fermer (perte possible d’une copie multi-blocs en cours)');
  console.log('PASS 8/14 — non-régression décision actée : un clic à l’extérieur du panneau B ne le ferme jamais');

  await page.click('#cc-preview-close-btn');
  await page.waitForSelector('#cc-preview-panel[hidden]', { state: 'attached' });
  const stateAfterClose = await page.evaluate(() => ({
    cardEmpty: document.getElementById('cc-preview-doc-card').innerHTML === '',
    previewState: window._adocPreviewState,
  }));
  assert.equal(stateAfterClose.cardEmpty, true, 'le contenu de B doit être vidé à la fermeture');
  assert.equal(stateAfterClose.previewState, null, 'window._adocPreviewState doit être réinitialisé à la fermeture explicite');
  console.log('PASS 9/14 — "Fermer l’aperçu" (bouton explicite) : panneau masqué, contenu vidé, état réinitialisé');

  // ── Test 10 (mis à jour Phase 1 — levée de la restriction "premier niveau uniquement") : un
  // document Carrousel n’offre TOUJOURS aucun bouton "Copier" sur la CARTE elle-même (structurel,
  // .adoc-sc-card n’est jamais .adoc-sc-block), mais offre désormais bien un bouton sur son
  // CONTENU IMBRIQUÉ (nouveauté de cette phase) ──
  await page.click('[data-creations-preview="1"]');
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Titre Document B2 (Carrousel)');
  assert.equal(getDocCalls[DOC_B2], 1, 'l’aperçu du second document doit appeler réellement GET /clinical-documents/:id');
  await page.waitForSelector('#cc-preview-doc-card .adoc-sc-card');
  const copyBtnOnCardItself = await page.locator('#cc-preview-doc-card [data-preview-copy-block="card-01"]').count();
  assert.equal(copyBtnOnCardItself, 0, 'la carte elle-même ne doit JAMAIS exposer de bouton "Copier" (.adoc-sc-card n’est jamais .adoc-sc-block, structurel)');
  const copyBtnOnNested = await page.locator('#cc-preview-doc-card [data-preview-copy-block="c1-p1"]').count();
  assert.equal(copyBtnOnNested, 1, 'Phase 1 — le contenu IMBRIQUÉ dans une carte doit désormais exposer un bouton "Copier" (restriction "premier niveau uniquement" levée)');
  console.log('PASS 10/14 — Phase 1 confirmée : la carte elle-même reste non copiable (structurel), son contenu imbriqué l’est désormais');
  await page.click('#cc-preview-close-btn');
  await page.waitForSelector('#cc-preview-panel[hidden]', { state: 'attached' });

  // ── Test 11 : non-régression — le glisser-déposer Item 63f reste en place sur A (poignées de
  // réordonnancement toujours présentes, structure jamais perturbée par ce nouveau panneau) ──
  const dragHandleCount = await page.locator('#cc-ws-doc-card .adoc-sc-block-drag-handle').count();
  assert.ok(dragHandleCount >= 4, 'les poignées de glisser-déposer (Item 63f) doivent rester présentes sur tous les blocs de A après ces opérations : ' + dragHandleCount);
  console.log('PASS 11/14 — non-régression : le glisser-déposer Item 63f reste pleinement en place sur A');

  // ── Test 12 : non-régression — le panneau de correction contextuelle reste pleinement
  // fonctionnel sur A (contrairement à B, cf. test 4) ──
  await page.click('#a-p1');
  await page.waitForSelector('.cc-block-edit-panel');
  console.log('PASS 12/14 — non-régression : le panneau de correction contextuelle reste pleinement fonctionnel sur A');
  await page.evaluate(() => window.adocCancelBlockCorrection && window.adocCancelBlockCorrection());

  // ── Test 13 : non-régression — "Mes créations" (panneau latéral) reste pleinement
  // fonctionnel : filtre par titre toujours opérationnel après tout ce scénario (panneau déjà
  // ouvert depuis le test 1, jamais refermé entre-temps) ──
  await page.waitForSelector('#cc-ws-creations-panel:not([hidden])');
  await page.fill('#cc-ws-creations-filter-title', 'zzz-inexistant');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-empty');
  await page.fill('#cc-ws-creations-filter-title', '');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  console.log('PASS 13/14 — non-régression : le panneau "Mes créations" (filtre par titre) reste pleinement fonctionnel');

  // ── Test 14 : zéro erreur JS (et zéro dialogue inattendu) sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS / dialogue inattendu ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('PASS 14/14 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS FUSION DE DOCUMENTS DEPUIS L’APERÇU (14/14) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
