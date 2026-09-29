// STUDIO CLINIQUE — Item 63f, construction : preuve réelle du glisser-déposer pour réordonner les
// blocs d'un document, sur les DEUX moteurs (structuré et legacy-html), avec seuil 3px, undo en un
// seul Ctrl+Z, restriction de conteneur (carte de Carrousel) et exclusion des cellules de tableau.
// Glissement réel via page.mouse (coordonnées écran réelles, :hover réel du navigateur pour révéler
// la poignée, jamais un événement synthétique aux coordonnées inventées).
//
// État initial des artefacts construit directement (même choix de portée documenté que
// verify-item63c-xlsx-grid.cjs/verify-item75-dette-overlap-guard.cjs) : reconstituer un pipeline de
// génération LLM complet dépasserait la portée de ce test ciblé sur le réordonnancement lui-même.
// Le document structuré est un ClinicalDocument réellement valide au sens du schéma AJV embarqué
// (adocRenderClinicalDocument valide réellement le document avant tout rendu, confirmé par lecture
// du code — un fixture non conforme ferait échouer adocOpenWorkspace, pas un simple avertissement).
//
// Non-régression Item 75 (positionnement de carte par glissement) : vérifiée séparément par la
// suite verify-item75-dette-overlap-guard.cjs, déjà existante et inchangée par ce lot — dupliquer
// ici son scénario détaillé serait hors périmètre (même raisonnement que les tests cités ci-dessus).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(blocks) {
  return {
    schemaVersion: 1,
    documentId: 'doc-63f-001', versionId: 'doc-63f-001-v1', previousVersionId: null,
    requestId: 'request-63f-001', sourceSnapshotId: 'snapshot-63f-001',
    createdAt: '2026-09-24T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test 63f', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function para(id, text) { return { id: id, type: 'paragraph', content: { text: text }, citationIds: [], validation: {} }; }
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }
function table(id) { return { id: id, type: 'table', content: { headers: ['A', 'B'], rows: [['x', 'y']] }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // ÉCRAN DE CONNEXION (construction ultérieure) — sans clé configurée, l'overlay #cc-login-screen
  // couvrirait toute la page et bloquerait les glissements réels (pointer-events) de ce test.
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);
  await page.evaluate(() => { window._adocWsState = window._adocWsState || {}; });

  // Refonte du geste (Sujet 1, étendue à Item 63f) — plus de poignée carrée visible : le
  // déclenchement se fait par géométrie, dans les ADOC_DRAG_EDGE_ZONE_PX (10px) le long du bord
  // GAUCHE de l'élément (bloc structuré OU enveloppe .adoc-sc-block-drag-wrap legacy — les deux
  // fonctionnent avec le même point de départ, jamais deux helpers séparés). Mêmes seuil 3px et
  // séquence mousedown/move/up que l'ancien helper.
  async function dragEdgeTo(blockLocatorSelector, targetY) {
    const blockBox = await page.locator(blockLocatorSelector).boundingBox();
    const startX = blockBox.x + 4, startY = blockBox.y + blockBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 8, startY + 8); // franchit le seuil de 3px
    await page.mouse.move(startX, targetY, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(60); // laisse adocOpenWorkspace (async) se terminer
  }

  // ═══════════════════════════════ TEST 1 — STRUCTURÉ ═══════════════════════════════
  const storeKeyA = 'adocArt_test63f_a';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      name: 'Test 63f A', _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, blockEditing: true },
    };
  }, storeKeyA);
  const docA = ficheDoc([heading('blk-a', 'Titre A'), para('blk-b', 'Paragraphe B.'), para('blk-c', 'Paragraphe C.'), table('blk-d'), para('blk-e', 'Paragraphe E.')]);
  await page.evaluate(({ key, doc }) => { window._adocArtifacts[key]._adocStructuredDoc = doc; }, { key: storeKeyA, doc: docA });
  let opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA);
  assert.equal(opened, true, 'adocOpenWorkspace (structuré) doit réussir sur un document valide');

  // Poignées présentes sur les blocs, ABSENTES sur les cellules d'un tableau (point 6 du CDC).
  const handleCoverage = await page.evaluate(() => ({
    blockHandles: document.querySelectorAll('.adoc-sc-block > .adoc-sc-block-drag-handle').length,
    cellHandles: document.querySelectorAll('td .adoc-sc-block-drag-handle, th .adoc-sc-block-drag-handle').length,
  }));
  assert.equal(handleCoverage.blockHandles, 5, 'chacun des 5 blocs de premier niveau doit porter sa poignée');
  assert.equal(handleCoverage.cellHandles, 0, 'aucune cellule de tableau ne doit porter de poignée de glissement');

  // Glisse le bloc 0 (Titre A) jusqu'après le bloc 2 (Paragraphe C) → 3ᵉ position.
  const cBoxBefore = await page.locator('#blk-c').boundingBox();
  const dBoxBefore = await page.locator('#blk-d').boundingBox();
  const targetY1 = (cBoxBefore.y + cBoxBefore.height + dBoxBefore.y) / 2;
  await dragEdgeTo('#blk-a', targetY1);

  const orderAfterDrag = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  assert.deepEqual(orderAfterDrag, ['blk-b', 'blk-c', 'blk-a', 'blk-d', 'blk-e'], 'blocks[] doit refléter le nouvel ordre (Titre A en 3ᵉ position), pas seulement à l\'écran');
  const domOrderAfterDrag = await page.evaluate(() => Array.from(document.querySelectorAll('#cc-ws-doc-card .adoc-sc-block')).map((el) => el.id));
  assert.deepEqual(domOrderAfterDrag, ['blk-b', 'blk-c', 'blk-a', 'blk-d', 'blk-e'], 'le DOM réaffiché doit aussi refléter le nouvel ordre');
  console.log('PASS 1/9 — structuré : glissement réel du 1er bloc vers la 3ᵉ position, blocks[] ET DOM reflètent le nouvel ordre');

  // ── Test 2 — undo en un seul Ctrl+Z (checkpoint unique par geste) ──
  // Même patron que le clavier réel de l'application (adocEditorContext() exige un bloc
  // sélectionné, cf. lr.addEventListener('keydown',...) — comportement PRÉEXISTANT, pas propre à
  // ce lot) : sélectionne d'abord un bloc (clic réel, rouvre son panneau), puis Ctrl+Z depuis son
  // texte — un seul Ctrl+Z doit annuler la totalité du geste de glissement, jamais un par pixel.
  await page.click('#blk-b');
  await page.evaluate(() => {
    const leaf = document.querySelector('#blk-b [data-cc-editor-leaf]');
    leaf.focus();
    leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  });
  await page.waitForTimeout(30);
  const orderAfterUndo = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  assert.deepEqual(orderAfterUndo, ['blk-a', 'blk-b', 'blk-c', 'blk-d', 'blk-e'], 'un seul Ctrl+Z doit annuler tout le geste de glissement (checkpoint unique, jamais un par pixel)');
  console.log('PASS 2/9 — structuré : un seul Ctrl+Z annule entièrement le geste de glissement');

  // ── Test 3 — seuil 3px : un clic normal (sans mouvement significatif) sur un bloc continue
  // d'ouvrir le panneau de correction — non-régression explicite Item 64. ──
  await page.evaluate(() => { document.querySelectorAll('.cc-block-edit-panel').forEach((p) => p.remove()); document.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected')); });
  await page.click('#blk-b');
  const panelAfterPlainClick = await page.evaluate(() => ({
    hasPanel: !!document.querySelector('.cc-block-edit-panel'),
    isSelected: document.getElementById('blk-b').classList.contains('is-selected'),
  }));
  assert.ok(panelAfterPlainClick.hasPanel && panelAfterPlainClick.isSelected, 'un clic normal (sans glissement) doit toujours ouvrir le panneau de correction (Item 64, non-régression)');
  const orderAfterPlainClick = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  assert.deepEqual(orderAfterPlainClick, ['blk-a', 'blk-b', 'blk-c', 'blk-d', 'blk-e'], 'un clic normal ne doit jamais déclencher de réordonnancement');
  console.log('PASS 3/9 — structuré : un clic normal (sans glissement) ouvre toujours le panneau de correction, aucun réordonnancement');

  // Même vérification pour un mousedown/mouseup DANS LA ZONE DE BORD elle-même, sans mouvement
  // réel : ne doit jamais réordonner (seuil respecté même déclenché depuis la zone de bord).
  await page.evaluate(() => { document.querySelectorAll('.cc-block-edit-panel').forEach((p) => p.remove()); document.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected')); });
  const aBox = await page.locator('#blk-a').boundingBox();
  await page.mouse.move(aBox.x + 4, aBox.y + aBox.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const orderAfterEdgeClick = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.map((b) => b.id), storeKeyA);
  assert.deepEqual(orderAfterEdgeClick, ['blk-a', 'blk-b', 'blk-c', 'blk-d', 'blk-e'], 'un clic dans la zone de bord sans mouvement réel ne doit jamais réordonner');
  console.log('PASS 4/9 — structuré : clic dans la zone de bord sans mouvement réel (seuil 3px) — aucun réordonnancement');

  // ═══════════════════════════════ TEST 5 — RESTRICTION DE CONTENEUR (Carrousel) ═══════════════════
  const storeKeyB = 'adocArt_test63f_carrousel';
  const carrouselDoc = {
    schemaVersion: 1, documentId: 'doc-63f-002', versionId: 'doc-63f-002-v1', previousVersionId: null,
    requestId: 'request-63f-002', sourceSnapshotId: 'snapshot-63f-002',
    createdAt: '2026-09-24T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test 63f Carrousel', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'carrousel', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: [
      { id: 'card-01', type: 'card', content: { title: 'Carte 1', imageRef: null, imageAlt: null, blocks: [para('c1-p1', 'Carte 1, paragraphe 1.'), para('c1-p2', 'Carte 1, paragraphe 2.')] }, citationIds: [], validation: {} },
      { id: 'card-02', type: 'card', content: { title: 'Carte 2', imageRef: null, imageAlt: null, blocks: [para('c2-p1', 'Carte 2, paragraphe 1.')] }, citationIds: [], validation: {} },
    ],
    citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
  await page.evaluate(({ key, doc }) => {
    window._adocArtifacts[key] = {
      name: 'Test 63f Carrousel', _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, blockEditing: true },
      _adocStructuredDoc: doc,
    };
  }, { key: storeKeyB, doc: carrouselDoc });
  opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyB);
  assert.equal(opened, true, 'adocOpenWorkspace (Carrousel) doit réussir');

  const card2Box = await page.locator('#card-02').boundingBox();
  // Cible délibérément TRÈS en dessous, dans la zone de la carte 2 — la restriction de conteneur
  // (point 5 du CDC) doit empêcher toute migration vers card-02.content.blocks.
  await dragEdgeTo('#c1-p1', card2Box.y + card2Box.height / 2);

  const carrouselState = await page.evaluate((key) => {
    const doc = window._adocArtifacts[key]._adocStructuredDoc;
    const card1 = doc.blocks.find((b) => b.id === 'card-01');
    const card2 = doc.blocks.find((b) => b.id === 'card-02');
    return {
      card1Ids: card1.content.blocks.map((b) => b.id).sort(),
      card2Ids: card2.content.blocks.map((b) => b.id),
    };
  }, storeKeyB);
  assert.deepEqual(carrouselState.card1Ids, ['c1-p1', 'c1-p2'], 'les deux blocs de la carte 1 doivent rester dans la carte 1 (jamais migrés)');
  assert.deepEqual(carrouselState.card2Ids, ['c2-p1'], 'la carte 2 ne doit recevoir aucun bloc étranger, même en pointant loin en dessous d\'elle');
  console.log('PASS 5/9 — restriction de conteneur : un bloc de carte reste dans SA carte même en pointant vers une autre carte');

  // ═══════════════════════════════ TEST 6 — LEGACY (ancien moteur) ═══════════════════
  const storeKeyC = 'adocArt_test63f_legacy';
  await page.evaluate((key) => {
    window._adocArtifacts[key] = {
      name: 'Test 63f Legacy', fmt: 'docx', _adocGenerationEngine: 'legacy-html',
      _adocCapabilities: { workspace: true, legacyBlockEditing: true },
      _adocDocumentKind: 'fiche',
      html: '<!DOCTYPE html><html><head></head><body>'
        + '<h1>Titre L</h1>'
        + '<p>Paragraphe LB.</p>'
        + '<p>Paragraphe LC.</p>'
        + '<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table>'
        + '<p>Paragraphe LE.</p>'
        + '</body></html>',
      url: 'https://fake.worker/out/original.docx',
    };
  }, storeKeyC);
  opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyC);
  assert.equal(opened, true, 'adocOpenWorkspace (legacy-html) doit réussir');

  const legacyHandleCoverage = await page.evaluate(() => ({
    wrapCount: document.querySelectorAll('.adoc-sc-block-drag-wrap').length,
    cellWrapCount: document.querySelectorAll('td.adoc-sc-block-drag-wrap, th.adoc-sc-block-drag-wrap, .adoc-sc-block-drag-wrap > td, .adoc-sc-block-drag-wrap > th').length,
    tableWrapped: !!document.querySelector('.adoc-sc-block-drag-wrap > table'),
  }));
  assert.equal(legacyHandleCoverage.wrapCount, 5, 'chacun des 5 blocs legacy (h1/p/p/table/p) doit être enveloppé pour porter sa zone de bord');
  assert.equal(legacyHandleCoverage.cellWrapCount, 0, 'aucune cellule de tableau ne doit être enveloppée (jamais de zone de bord sur une cellule)');
  assert.ok(legacyHandleCoverage.tableWrapped, 'le tableau ENTIER (jamais ses cellules) doit rester une cible de glissement valide');

  // Glisse le 1er bloc (Titre L) après le 3e (Paragraphe LC, index 2), symétrique du test structuré.
  const lb0 = 'div.adoc-sc-block-drag-wrap:has([data-cc-legacy-block-id="lb-0"])';
  const lb2Box = await page.locator('[data-cc-legacy-block-id="lb-2"]').boundingBox();
  const lb3Box = await page.locator('[data-cc-legacy-block-id="lb-3"]').boundingBox();
  const targetY2 = (lb2Box.y + lb2Box.height + lb3Box.y) / 2;
  await dragEdgeTo(lb0, targetY2);

  const legacyHtmlOrder = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    const parsed = new DOMParser().parseFromString(art.html, 'text/html');
    return Array.from(parsed.body.children).map((el) => el.tagName + ':' + (el.textContent || '').trim().slice(0, 20));
  }, storeKeyC);
  assert.deepEqual(
    legacyHtmlOrder,
    ['P:Paragraphe LB.', 'P:Paragraphe LC.', 'H1:Titre L', 'TABLE:H1H2xy', 'P:Paragraphe LE.'],
    'art.html (source canonique, jamais seulement l\'écran) doit refléter le nouvel ordre après le geste'
  );
  const legacyDomOrder = await page.evaluate(() => Array.from(document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')).map((el) => el.tagName));
  assert.deepEqual(legacyDomOrder, ['P', 'P', 'H1', 'TABLE', 'P'], 'le DOM réaffiché (ancien moteur) doit aussi refléter le nouvel ordre');
  console.log('PASS 6/9 — legacy : glissement réel du 1er bloc vers la 3ᵉ position, art.html ET DOM reflètent le nouvel ordre');

  // ── Test 7 — legacy : seuil 3px, non-régression Item 64 (clic normal → panneau) ──
  await page.evaluate(() => { document.querySelectorAll('.cc-block-edit-panel').forEach((p) => p.remove()); document.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected')); });
  await page.click('[data-cc-legacy-block-id="lb-0"]');
  const legacyPanelState = await page.evaluate(() => ({
    hasPanel: !!document.querySelector('.cc-block-edit-panel'),
    isSelected: document.querySelector('[data-cc-legacy-block-id="lb-0"]').classList.contains('is-selected'),
  }));
  assert.ok(legacyPanelState.hasPanel && legacyPanelState.isSelected, 'legacy : un clic normal doit toujours ouvrir le panneau de correction (non-régression)');
  console.log('PASS 7/9 — legacy : clic normal sans glissement ouvre toujours le panneau de correction');

  // ── Test 8 — legacy : undo en un seul Ctrl+Z ──
  await page.evaluate(() => { document.querySelectorAll('.cc-block-edit-panel').forEach((p) => p.remove()); document.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected')); });
  await page.evaluate(() => {
    const leaf = document.querySelector('[data-cc-legacy-block-id="lb-0"] [data-cc-editor-leaf]');
    leaf.focus();
    leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  });
  await page.waitForTimeout(30);
  const legacyHtmlAfterUndo = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    const parsed = new DOMParser().parseFromString(art.html, 'text/html');
    return Array.from(parsed.body.children).map((el) => el.tagName);
  }, storeKeyC);
  assert.deepEqual(legacyHtmlAfterUndo, ['H1', 'P', 'P', 'TABLE', 'P'], 'legacy : un seul Ctrl+Z doit annuler tout le geste de glissement');
  console.log('PASS 8/9 — legacy : un seul Ctrl+Z annule entièrement le geste de glissement');

  // ── Test 9 — aucune erreur JS levée pendant toute la session ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit être levée : ' + JSON.stringify(pageErrors));
  console.log('PASS 9/9 — aucune erreur JS levée pendant toute la session de test');

  console.log('\n=== TOUS LES TESTS ITEM 63F — GLISSER-DÉPOSER POUR RÉORDONNER (9/9) PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
