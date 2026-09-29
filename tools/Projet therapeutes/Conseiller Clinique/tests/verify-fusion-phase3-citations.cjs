// STUDIO CLINIQUE — Fusion de documents, PHASE 3 : préservation des citations/sources lors d'une
// copie (clic ET glissement, Phases 1+2), au lieu du retrait silencieux. Preuve réelle : citation
// fonctionnelle après fusion (marqueur cliquable + note de bas de document), aucune collision même
// quand A porte déjà une citation numérotée comme celle de B, deux citations distinctes coexistent
// proprement, validation/export ne cassent jamais avec des entrées de deux origines différentes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');
const ISO = '2026-09-28T09:00:00Z';
function sha256hex(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function baseDoc(id, title, documentKind, blocks, citations) {
  return {
    schemaVersion: 1,
    documentId: id, versionId: id + '-v1', previousVersionId: null,
    requestId: 'request-' + id, sourceSnapshotId: 'snapshot-' + id,
    createdAt: ISO, language: 'fr', status: 'draft',
    title: title, purpose: 'supervision', audience: 'clinicien',
    documentKind: documentKind, renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: citations || [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id, type: 'heading', content: { text, level: 2 }, citationIds: [], validation: {} }; }
function para(id, text, citationId, claimSupport) {
  const b = { id, type: 'paragraph', content: { text }, citationIds: [], validation: {} };
  if (citationId) {
    b.citationIds = [citationId];
    b.validation = { citationLinks: [{ citationId, claimText: text, claimSupport: claimSupport || 'pass' }] };
  }
  return b;
}
function card(id, title, nestedBlocks) { return { id, type: 'card', content: { title, imageRef: null, imageAlt: null, blocks: nestedBlocks }, citationIds: [], validation: {} }; }
function snapshotEntry(id, book, author, page, exactText) {
  return { sourceSnapshotEntryId: id, sourceType: 'library', sourceId: 'book-' + id, passageId: 'passage-' + id,
    exactText, contentChecksum: 'sha256:' + sha256hex(exactText), book, author,
    locator: { page, section: null }, retrievedAt: ISO };
}

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
  // A (fiche) — porte DÉJÀ une citation nommée 'citB1'/'entryB1' (collision DÉLIBÉRÉE avec les ids
  // que B1 utilise pour SA PROPRE citation, cf. CDC : "confirmer qu'aucune collision n'existe si A
  // avait déjà des citations numérotées de façon similaire à celles de B").
  const docA = baseDoc('doc-p3-a', 'Document A (Fiche)', 'fiche',
    [heading('a-h1', 'Titre A'), para('a-p1', 'Paragraphe A original.', 'citB1')],
    [{ citationId: 'citB1', sourceSnapshotEntryId: 'entryB1', displayLabel: 'Auteur A original, p.5' }]);
  const snapshotA = { sourceSnapshotId: 'snap-a', entries: [snapshotEntry('entryB1', 'Livre A', 'Auteur A original', 5, 'Texte source ORIGINAL de A, jamais touché par la fusion.')] };

  // B1 (carrousel) — bloc IMBRIQUÉ avec citation 'citB1' (même id que A, exprès) → test du clic.
  const docB1 = baseDoc('doc-p3-b1', 'Document B1 (Carrousel)', 'carrousel',
    [card('card-b1', 'Carte B1', [para('b1-nested-p1', 'Paragraphe imbriqué B1 avec citation.', 'citB1')])],
    [{ citationId: 'citB1', sourceSnapshotEntryId: 'entryB1', displayLabel: 'Auteur B1, p.12' }]);
  const snapshotB1 = { sourceSnapshotId: 'snap-b1', entries: [snapshotEntry('entryB1', 'Livre B1', 'Auteur B1', 12, 'Texte source B1, passage cité.')] };

  // B2 (fiche) — bloc de PREMIER NIVEAU avec citation DISTINCTE 'citB2' → test du glissement +
  // coexistence de deux citations fusionnées.
  const docB2 = baseDoc('doc-p3-b2', 'Document B2 (Fiche)', 'fiche',
    [heading('b2-h1', 'Titre B2'), para('b2-p1', 'Paragraphe B2 avec citation distincte.', 'citB2')],
    [{ citationId: 'citB2', sourceSnapshotEntryId: 'entryB2', displayLabel: 'Auteur B2, p.30' }]);
  const snapshotB2 = { sourceSnapshotId: 'snap-b2', entries: [snapshotEntry('entryB2', 'Livre B2', 'Auteur B2', 30, 'Texte source B2, second passage cité.')] };

  const storeKeyA = 'adocArt_p3_a';
  await page.evaluate(({ keyA, docA, snapshotA }) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[keyA] = {
      name: docA.title, _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      _adocStructuredDoc: docA, _adocStructuredSnapshot: snapshotA, _adocRenderManifestOverride: null,
    };
  }, { keyA: storeKeyA, docA, snapshotA });

  await page.route('**/clinical-documents', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [
      { document_id: 'doc-p3-b1', title: docB1.title, document_kind: 'carrousel', created_at: ISO, thumbnail_asset_id: null },
      { document_id: 'doc-p3-b2', title: docB2.title, document_kind: 'fiche', created_at: ISO, thumbnail_asset_id: null },
    ] }) });
  });
  function mockGetDoc(id, doc, snapshot) {
    return page.route('**/clinical-documents/' + id, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        document_id: id, title: doc.title, document_kind: doc.documentKind, created_at: ISO,
        current_version_id: id + '-v1', generation_engine: 'structured',
        version: { version_id: id + '-v1', previous_version_id: null, schema_version: 1, created_at: ISO, change_summary: null, generation_engine: 'structured',
          document: { schemaVersion: 1, clinicalDocument: doc, sourceSnapshot: snapshot, renderManifestOverride: null } },
      }) });
    });
  }
  await mockGetDoc('doc-p3-b1', docB1, snapshotB1);
  await mockGetDoc('doc-p3-b2', docB2, snapshotB2);

  // ── Ouvre A, confirme l'état initial (1 citation déjà présente) ──
  const openedA = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA);
  assert.equal(openedA, true, 'A doit s’ouvrir normalement');
  const initial = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    return { citCount: art._adocStructuredDoc.citations.length, entryCount: art._adocStructuredSnapshot.entries.length };
  }, storeKeyA);
  assert.deepEqual(initial, { citCount: 1, entryCount: 1 }, 'A doit démarrer avec sa propre citation (id volontairement identique à celle de B1)');
  console.log('PASS 1/13 — A démarre avec 1 citation propre, id délibérément identique à celle de B1 (préparation du test anti-collision)');

  // ── Aperçu de B1, CLIC "Copier" sur le bloc IMBRIQUÉ portant une citation ──
  await page.click('#cc-ws-creations-toggle');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  await page.click('[data-creations-preview="0"]'); // B1
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Document B1 (Carrousel)');
  console.log('PASS 2/13 — B1 (carrousel) prévisualisé en parallèle de A');

  await page.click('[data-preview-copy-block="b1-nested-p1"]');
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  await page.click('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-anchor="a-h1"][data-fusion-position="after"]');
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 3, storeKeyA);

  const afterClick = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    const doc = art._adocStructuredDoc;
    const newBlock = doc.blocks.find((b) => b.content && b.content.text === 'Paragraphe imbriqué B1 avec citation.');
    return {
      citations: doc.citations, entries: art._adocStructuredSnapshot.entries,
      newBlockCitationIds: newBlock ? newBlock.citationIds : null,
      newBlockLinks: newBlock ? newBlock.validation.citationLinks : null,
      newBlockId: newBlock ? newBlock.id : null,
    };
  }, storeKeyA);
  assert.equal(afterClick.citations.length, 2, 'A doit porter 2 citations après la fusion (la sienne + celle fusionnée de B1)');
  const originalCit = afterClick.citations.find((c) => c.citationId === 'citB1');
  assert.ok(originalCit, 'la citation ORIGINALE de A (id citB1) doit rester intacte, jamais écrasée par celle de B1');
  assert.equal(originalCit.displayLabel, 'Auteur A original, p.5', 'la citation originale de A ne doit jamais être modifiée par la fusion');
  const mergedCit = afterClick.citations.find((c) => c.citationId !== 'citB1');
  assert.ok(mergedCit, 'une NOUVELLE citation (id ≠ citB1, malgré la collision de noms avec B1) doit avoir été créée');
  assert.equal(mergedCit.displayLabel, 'Auteur B1, p.12', 'le displayLabel de la citation fusionnée doit provenir fidèlement de B1');
  assert.notEqual(mergedCit.sourceSnapshotEntryId, 'entryB1', 'la nouvelle citation doit pointer vers une entrée de snapshot NOUVELLE, jamais réutiliser entryB1 (déjà pris par A)');
  console.log('PASS 3/13 — aucune collision : la citation originale de A (citB1) reste intacte, une nouvelle citation distincte est créée pour B1');

  assert.equal(afterClick.entries.length, 2, 'le snapshot de A doit porter 2 entrées après la fusion');
  const originalEntry = afterClick.entries.find((e) => e.sourceSnapshotEntryId === 'entryB1');
  assert.equal(originalEntry.exactText, 'Texte source ORIGINAL de A, jamais touché par la fusion.', 'l’entrée originale de A ne doit jamais être modifiée');
  const mergedEntry = afterClick.entries.find((e) => e.sourceSnapshotEntryId === mergedCit.sourceSnapshotEntryId);
  assert.ok(mergedEntry, 'l’entrée de snapshot fusionnée doit exister sous son nouvel id');
  assert.equal(mergedEntry.exactText, 'Texte source B1, passage cité.', 'le texte exact de la source doit être fidèlement conservé, jamais réécrit');
  assert.equal(mergedEntry.book, 'Livre B1', 'les métadonnées de la source (livre/auteur/page) doivent être fidèlement conservées');
  console.log('PASS 4/13 — un seul snapshot final pour A (2 entrées), jamais deux sourceSnapshotId séparés — texte et métadonnées fidèlement conservés');

  assert.deepEqual(afterClick.newBlockCitationIds, [mergedCit.citationId], 'le bloc copié doit référencer le NOUVEL id, jamais l’ancien citB1 de B1');
  assert.equal(afterClick.newBlockLinks.length, 1, 'validation.citationLinks doit conserver exactement 1 lien (jamais retiré)');
  assert.equal(afterClick.newBlockLinks[0].citationId, mergedCit.citationId, 'citationLinks doit référencer le NOUVEL id');
  assert.equal(afterClick.newBlockLinks[0].claimText, 'Paragraphe imbriqué B1 avec citation.', 'claimText doit rester inchangé');
  assert.equal(afterClick.newBlockLinks[0].claimSupport, 'pass', 'claimSupport doit rester inchangé');
  console.log('PASS 5/13 — le bloc copié référence le NOUVEL id partout (citationIds ET validation.citationLinks), claimText/claimSupport préservés');

  // ── Preuve DOM réelle : marqueur cliquable + note de bas de document, jamais un lien mort ──
  const domCheck1 = await page.evaluate((info) => {
    const markerLink = document.querySelector('#' + info.blockId + ' a[href="#' + CSS.escape('cite-' + info.citationId) + '"]');
    const footerItem = document.getElementById('cite-' + info.citationId);
    return { markerFound: !!markerLink, footerFound: !!footerItem, footerText: footerItem ? footerItem.textContent : null };
  }, { blockId: afterClick.newBlockId, citationId: mergedCit.citationId });
  assert.ok(domCheck1.markerFound, 'le marqueur de citation ([1] cliquable, <sup class="adoc-sc-cite">) doit apparaître sur le bloc fusionné, jamais un lien mort');
  assert.ok(domCheck1.footerFound, 'la note de bas de document (<li id="cite-...">) doit exister pour la citation fusionnée');
  assert.ok(domCheck1.footerText.includes('Auteur B1'), 'la note de bas de document doit afficher le bon displayLabel : ' + domCheck1.footerText);
  console.log('PASS 6/13 — preuve DOM réelle : marqueur cliquable présent, note de bas de document présente et correcte (glisser-déposer copié par CLIC)');

  // ── Fermer B1, prévisualiser B2, GLISSER le bloc de PREMIER NIVEAU avec citation DISTINCTE ──
  await page.click('#cc-preview-close-btn');
  await page.waitForSelector('#cc-preview-panel[hidden]', { state: 'attached' });
  await page.fill('#cc-ws-creations-filter-title', 'B2');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  await page.click('[data-creations-preview="0"]');
  await page.waitForSelector('#cc-preview-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-preview-title').textContent === 'Document B2 (Fiche)');
  console.log('PASS 7/13 — B1 fermé, B2 (fiche) prévisualisé à son tour');

  // Refonte du geste (Sujet 1) — plus de poignée carrée : déclenchement par géométrie dans la
  // zone de bord GAUCHE du bloc (adocDragInEdgeZone), même patron que les autres suites de tests
  // déjà mises à jour (verify-item63f-block-drag-reorder.cjs, verify-fusion-phase2-drag-drop.cjs).
  async function dragHandleTo(blockId, targetPoint) {
    const blockBox = await page.locator('#' + blockId).boundingBox();
    const startX = blockBox.x + 4, startY = blockBox.y + blockBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 10, startY + 10);
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 8 });
  }
  const docCardBox = await page.locator('#cc-ws-doc-card').boundingBox();
  await dragHandleTo('b2-p1', { x: docCardBox.x + 20, y: docCardBox.y + 20 });
  await page.waitForSelector('#cc-ws-doc-card .cc-fusion-drop-target');
  const lastLine = page.locator('#cc-ws-doc-card .cc-fusion-drop-target[data-fusion-position="after"]').last();
  const lastBox = await lastLine.boundingBox();
  await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.length === 4, storeKeyA);
  console.log('PASS 8/13 — bloc de PREMIER NIVEAU de B2 (citation distincte) glissé avec succès dans A');

  const afterDrag = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    const doc = art._adocStructuredDoc;
    const newBlock = doc.blocks.find((b) => b.content && b.content.text === 'Paragraphe B2 avec citation distincte.');
    return {
      citations: doc.citations, entries: art._adocStructuredSnapshot.entries,
      newBlockCitationIds: newBlock ? newBlock.citationIds : null,
      newBlockId: newBlock ? newBlock.id : null,
      sourceSnapshotId: doc.sourceSnapshotId, artSnapshotId: art._adocStructuredSnapshot.sourceSnapshotId,
    };
  }, storeKeyA);
  assert.equal(afterDrag.citations.length, 3, 'A doit désormais porter 3 citations (originale + B1 fusionnée + B2 fusionnée)');
  const allIds = afterDrag.citations.map((c) => c.citationId);
  assert.equal(new Set(allIds).size, 3, 'les 3 citations doivent avoir des id STRICTEMENT DISTINCTS, aucune collision');
  const mergedCit2 = afterDrag.citations.find((c) => c.citationId !== 'citB1' && c.citationId !== mergedCit.citationId);
  assert.ok(mergedCit2, 'une TROISIÈME citation (celle de B2) doit exister, distincte des deux précédentes');
  assert.equal(mergedCit2.displayLabel, 'Auteur B2, p.30', 'le displayLabel de la citation B2 fusionnée doit être fidèle');
  assert.equal(afterDrag.entries.length, 3, 'le snapshot de A doit porter 3 entrées, toutes distinctes');
  assert.equal(new Set(afterDrag.entries.map((e) => e.sourceSnapshotEntryId)).size, 3, 'les 3 entrées de snapshot doivent avoir des id strictement distincts');
  const mergedEntry2 = afterDrag.entries.find((e) => e.sourceSnapshotEntryId === mergedCit2.sourceSnapshotEntryId);
  assert.equal(mergedEntry2.exactText, 'Texte source B2, second passage cité.', 'le texte exact de la source B2 doit être fidèlement conservé');
  assert.deepEqual(afterDrag.newBlockCitationIds, [mergedCit2.citationId], 'le bloc glissé doit référencer le nouvel id de la citation B2');
  assert.equal(afterDrag.sourceSnapshotId, afterDrag.artSnapshotId, 'doc.sourceSnapshotId doit rester synchronisé avec le SEUL snapshot final de A — jamais deux ids à résoudre en parallèle');
  console.log('PASS 9/13 — deux citations fusionnées (B1 par clic, B2 par glissement) coexistent proprement avec l’originale de A, ids et entrées tous distincts, un seul snapshot final');

  const domCheck2 = await page.evaluate((info) => {
    const items = Array.from(document.querySelectorAll('#cc-ws-doc-card .adoc-sc-citations-list li'));
    return { totalFooterItems: items.length, hasB2Footer: !!document.getElementById('cite-' + info.citationId) };
  }, { citationId: mergedCit2.citationId });
  assert.equal(domCheck2.totalFooterItems, 3, 'la note de bas de document doit afficher EXACTEMENT 3 sources (originale + 2 fusionnées)');
  assert.ok(domCheck2.hasB2Footer, 'la note de bas de document pour la citation B2 fusionnée doit exister');
  console.log('PASS 10/13 — preuve DOM réelle : les 3 sources apparaissent dans la note de bas de document (glisser-déposer)');

  // ── Régression : adocValidateClinicalDocument ne casse jamais avec des entrées de deux origines ──
  const validation = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    return window.adocValidateClinicalDocument(art._adocStructuredDoc, art._adocStructuredSnapshot).then((r) => ({
      invalidCitationIds: r.invalidCitationIds, checksumMismatchIds: r.checksumMismatchIds, orphanCitationIds: r.orphanCitationIds,
    }));
  }, storeKeyA);
  assert.deepEqual(validation.invalidCitationIds, [], 'aucune citation ne doit être signalée invalide après fusion de deux origines');
  assert.deepEqual(validation.checksumMismatchIds, [], 'aucun checksum ne doit diverger — le texte source copié verbatim doit rester cohérent avec son propre checksum copié verbatim');
  assert.deepEqual(validation.orphanCitationIds, [], 'aucune référence orpheline ne doit subsister après une fusion réussie');
  console.log('PASS 11/13 — non-régression : adocValidateClinicalDocument valide correctement un document dont le snapshot porte des entrées de DEUX origines différentes');

  // ── Régression : export (même pipeline que PDF/DOCX) ne casse jamais et contient les 2 citations fusionnées ──
  const exportResult = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    return window.adocExportClinicalDocumentHTML(art._adocStructuredDoc, art._adocStructuredSnapshot, null);
  }, storeKeyA);
  assert.equal(exportResult.blocked, false, 'l’export ne doit jamais être bloqué par un problème de qualité après une fusion de citations réussie : ' + JSON.stringify(exportResult.qc));
  assert.ok(exportResult.html.includes('cite-' + mergedCit.citationId), 'le HTML exporté (base du PDF/DOCX) doit contenir le marqueur de la citation B1 fusionnée');
  assert.ok(exportResult.html.includes('cite-' + mergedCit2.citationId), 'le HTML exporté doit contenir le marqueur de la citation B2 fusionnée');
  assert.ok(exportResult.html.includes('Auteur B1'), 'le HTML exporté doit afficher la source B1 dans les notes de bas de document');
  assert.ok(exportResult.html.includes('Auteur B2'), 'le HTML exporté doit afficher la source B2 dans les notes de bas de document');
  console.log('PASS 12/13 — non-régression export (pipeline PDF/DOCX) : jamais bloqué, les 2 citations fusionnées apparaissent fidèlement dans le document exporté');

  // ── Zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('PASS 13/13 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS FUSION PHASE 3 — PRÉSERVATION DES CITATIONS (13/13) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
