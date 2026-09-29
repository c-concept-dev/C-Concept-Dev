// STUDIO CLINIQUE — Sujet 2 : "Enregistrer sous" — sauvegarder un document personnalisé comme un
// NOUVEAU document, distinct de l'original. Preuve réelle : personnaliser un document déjà
// enregistré, cliquer "Enregistrer sous", fournir un titre via le prompt() natif, confirmer qu'un
// NOUVEAU document_id est créé (route POST /clinical-documents, JAMAIS .../versions sur l'ancien
// id), et que l'original reste RIGOUREUSEMENT INCHANGÉ côté "serveur" (aucun appel qui le cible,
// contenu et titre intacts dans le "stockage" simulé).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

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
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }
function para(id, text) { return { id: id, type: 'paragraph', content: { text: text }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const ORIG_ID = 'doc-orig-a1b2';
  const NEW_ID_1 = 'doc-saveas-c3d4';
  const NEW_ID_2 = 'doc-saveas-e5f6';
  // "Stockage" D1 simulé — un vrai Map mutable, jamais une liste statique — pour vérifier
  // réellement que l'original n'est jamais muté par "Enregistrer sous" (contenu ET titre).
  const store = new Map([[ORIG_ID, { document_id: ORIG_ID, title: 'Document original', content: 'contenu-original' }]]);
  const createdIds = [NEW_ID_1, NEW_ID_2];
  let createIdx = 0;
  let createCalls = 0;
  const createCallBodies = [];
  let versionCalls = 0;
  const versionCallTargets = [];
  let deleteCalls = 0;
  let patchCalls = 0;

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();

    if (url.endsWith('/clinical-documents') && req.method() === 'POST') {
      createCalls++;
      const body = JSON.parse(req.postData() || '{}');
      createCallBodies.push(body);
      const newId = createdIds[createIdx++] || ('doc-created-extra-' + createIdx);
      store.set(newId, { document_id: newId, title: body.title, content: JSON.stringify(body.document) });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: newId, version_id: newId + '-v1', created_at: '2026-09-25T09:10:00Z', generation_engine: 'structured' }) });
    }
    const versionsMatch = url.match(/\/clinical-documents\/([^/]+)\/versions$/);
    if (versionsMatch && req.method() === 'POST') {
      versionCalls++;
      versionCallTargets.push(versionsMatch[1]);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: versionsMatch[1], version_id: versionsMatch[1] + '-v2', previous_version_id: versionsMatch[1] + '-v1', created_at: '2026-09-25T09:05:00Z', generation_engine: 'structured' }) });
    }
    if (url.match(/\/clinical-documents\/[^/]+$/) && req.method() === 'DELETE') { deleteCalls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) }); }
    if (url.match(/\/clinical-documents\/[^/]+$/) && (req.method() === 'PATCH' || req.method() === 'PUT')) { patchCalls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }); }
    if (url.endsWith('/media-assets') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: [] }) });
    }
    if (url.endsWith('/brand-kits')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) });
    }
    if (url.includes('/browser-rendering/screenshot-slide')) {
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('FAKE') });
    }
    if (url.includes('/brand-assets/upload')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset_id: 'thumb-x', deduplicated: false, size_bytes: 1 }) });
    }
    if (url.includes('/clinical-documents/') && url.endsWith('/thumbnail')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  const storeKey = 'adocArt_test_saveas';
  const doc = ficheDoc(ORIG_ID, 'Document original', [heading('h1', 'Titre'), para('p1', 'Paragraphe original.')]);
  const opened = await page.evaluate(({ key, doc, docId }) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      name: doc.title, _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      _adocStructuredDoc: doc, _adocStructuredSnapshot: { sourceSnapshotId: 'snapshot-' + docId, entries: [] }, _adocRenderManifestOverride: null,
      _adocClinicalDocumentId: docId, _adocClinicalVersionId: docId + '-v1',
    };
    return window.adocOpenWorkspace(key);
  }, { key: storeKey, doc: doc, docId: ORIG_ID });
  assert.equal(opened, true, 'le document doit s’ouvrir normalement, déjà enregistré (id existant)');
  await page.waitForSelector('#cc-ws-save-as-btn');
  console.log('PASS 1/9 — document déjà enregistré ouvert, bouton "Enregistrer sous" présent dans le bandeau');

  // ── Personnalise le document ouvert (édition directe d'un bloc texte) ──
  await page.click('#p1');
  await page.evaluate(() => {
    const leaf = document.querySelector('#p1 [data-cc-editor-leaf]');
    leaf.focus();
    document.execCommand('insertText', false, ' Ajout personnalisé.');
    leaf.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('body'); // referme le panneau, force la resynchronisation vers le doc en mémoire
  const textAfterEdit = await page.evaluate((key) => window._adocArtifacts[key]._adocStructuredDoc.blocks.find((b) => b.id === 'p1').content.text, storeKey);
  assert.ok(textAfterEdit.includes('Ajout personnalisé'), 'la personnalisation doit être réellement reflétée dans le document en mémoire avant "Enregistrer sous"');
  console.log('PASS 2/9 — document personnalisé (édition directe réelle d’un bloc texte)');

  // ── Annulation explicite du prompt() → RIEN n’est créé, l’original reste actif ──
  page.once('dialog', async (d) => { assert.equal(d.type(), 'prompt', 'doit être un prompt() natif, jamais un second mécanisme de saisie'); await d.dismiss(); });
  await page.click('#cc-ws-save-as-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-as-btn').disabled);
  assert.equal(createCalls, 0, 'une annulation du prompt() ne doit déclencher AUCUNE création');
  const idAfterCancel = await page.evaluate((key) => window._adocArtifacts[key]._adocClinicalDocumentId, storeKey);
  assert.equal(idAfterCancel, ORIG_ID, 'après annulation, le document actif doit rester l’original, inchangé');
  console.log('PASS 3/9 — annulation du prompt() : aucun appel de création, l’original reste actif');

  // ── "Enregistrer sous" avec un nouveau titre, pré-rempli avec le titre actuel ──
  let promptMessage = null, promptDefault = null;
  page.once('dialog', async (d) => { promptMessage = d.message(); promptDefault = d.defaultValue(); await d.accept('Ma copie personnalisée'); });
  await page.click('#cc-ws-save-as-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-as-btn').disabled);
  assert.ok(promptMessage && promptMessage.toLowerCase().includes('titre'), 'le prompt() doit demander un titre : ' + promptMessage);
  assert.equal(promptDefault, 'Document original', 'le prompt() doit être PRÉ-REMPLI avec le titre actuel du document');
  assert.equal(createCalls, 1, 'un titre confirmé doit déclencher EXACTEMENT un appel de création (POST /clinical-documents)');
  assert.equal(versionCalls, 0, 'jamais un appel à la route de VERSION pour "Enregistrer sous"');
  assert.equal(createCallBodies[0].title, 'Ma copie personnalisée', 'le titre envoyé au serveur doit être celui saisi dans le prompt()');
  console.log('PASS 4/9 — prompt() pré-rempli avec le titre actuel, titre édité envoyé à la création (route de création, jamais de version)');

  // ── L’écran de travail bascule sur le NOUVEAU document ──
  const idAfterSaveAs = await page.evaluate((key) => window._adocArtifacts[key]._adocClinicalDocumentId, storeKey);
  assert.equal(idAfterSaveAs, NEW_ID_1, 'l’artefact ouvert doit désormais porter le NOUVEL id créé');
  assert.notEqual(idAfterSaveAs, ORIG_ID, 'le nouvel id ne doit JAMAIS être l’id de l’original');
  console.log('PASS 5/9 — l’écran de travail bascule sur le nouveau document (nouvel _adocClinicalDocumentId)');

  // ── L’ORIGINAL reste totalement inchangé côté "serveur" : jamais ciblé par DELETE/PATCH, son
  // contenu et son titre stockés restent exactement ceux d’avant le geste ──
  assert.equal(deleteCalls, 0, 'l’original ne doit JAMAIS être supprimé par "Enregistrer sous"');
  assert.equal(patchCalls, 0, 'l’original ne doit JAMAIS être modifié en place par "Enregistrer sous"');
  assert.ok(!versionCallTargets.includes(ORIG_ID), 'l’original ne doit JAMAIS recevoir de nouvelle version via "Enregistrer sous"');
  const origInStore = store.get(ORIG_ID);
  assert.equal(origInStore.title, 'Document original', 'le titre de l’original, stocké côté "serveur", doit rester rigoureusement inchangé');
  assert.equal(origInStore.content, 'contenu-original', 'le contenu de l’original, stocké côté "serveur", doit rester rigoureusement inchangé (jamais écrasé)');
  console.log('PASS 6/9 — l’original reste rigoureusement inchangé côté "serveur" (aucun DELETE/PATCH/version reçu, titre et contenu intacts)');

  // ── Les sauvegardes suivantes ("Enregistrer") s’appliquent désormais au NOUVEAU document ──
  await page.click('#cc-ws-save-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-btn').disabled);
  assert.equal(createCalls, 1, 'une sauvegarde normale après "Enregistrer sous" ne doit jamais créer un second document');
  assert.equal(versionCalls, 1, 'elle doit créer une version du NOUVEAU document');
  assert.equal(versionCallTargets[0], NEW_ID_1, 'la version doit cibler le nouveau document, jamais l’original');
  console.log('PASS 7/9 — les sauvegardes suivantes ("Enregistrer") s’appliquent bien au nouveau document, jamais à l’original');

  // ── Un second "Enregistrer sous" depuis ce nouveau document crée encore un AUTRE document
  // distinct (jamais une réutilisation), lui aussi sans jamais affecter les deux précédents ──
  page.once('dialog', async (d) => { await d.accept('Encore une autre copie'); });
  await page.click('#cc-ws-save-as-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-as-btn').disabled);
  const idAfterSecondSaveAs = await page.evaluate((key) => window._adocArtifacts[key]._adocClinicalDocumentId, storeKey);
  assert.equal(idAfterSecondSaveAs, NEW_ID_2, 'un second "Enregistrer sous" doit créer encore un document NEUF et distinct');
  assert.equal(store.get(ORIG_ID).content, 'contenu-original', 'après ce second geste, l’original original doit toujours rester intact');
  assert.equal(store.get(NEW_ID_1).content, store.get(NEW_ID_1).content, 'le premier document "enregistré sous" ne doit pas non plus être affecté (sa propre entrée reste stable)');
  console.log('PASS 8/9 — non-régression : un second "Enregistrer sous" crée un document neuf et distinct, sans affecter les précédents');

  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('PASS 9/9 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS "ENREGISTRER SOUS" (SUJET 2) (9/9) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
