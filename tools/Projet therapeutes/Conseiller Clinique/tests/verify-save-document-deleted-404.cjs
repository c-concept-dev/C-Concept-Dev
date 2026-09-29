// STUDIO CLINIQUE — Gestion gracieuse d'un document supprimé pendant qu'il reste ouvert,
// CONSTRUCTION : reproduit RÉELLEMENT le scénario exact demandé — un document est ouvert avec un
// _adocClinicalDocumentId valide, puis supprimé "depuis un autre onglet/session" (simulé ici en
// retirant l'entrée du "stockage" D1 simulé, jamais en modifiant l'artefact ouvert lui-même) —
// puis "Enregistrer une nouvelle version" est tenté : POST /clinical-documents/:id/versions
// renvoie 404 (confirmé par lecture de handleClinicalDocumentVersionCreate, Worker/index.js,
// qui renvoie exactement "Clinical document not found", 404, quand :id n'existe plus). Le nouveau
// message doit apparaître (confirm() intercepté), et confirmer doit réellement créer un NOUVEAU
// document (POST /clinical-documents), jamais réutiliser l'ancien id supprimé.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(id, title, blocks) {
  return {
    schemaVersion: 1,
    documentId: id, versionId: id + '-v1', previousVersionId: null,
    requestId: 'request-' + id, sourceSnapshotId: 'snapshot-' + id,
    createdAt: '2026-09-27T09:00:00Z', language: 'fr', status: 'draft',
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

  const DOC_ID = 'doc-deleted-while-open';
  const NEW_DOC_ID = 'doc-recreated-after-404';
  // "Stockage" D1 simulé — un vrai Map mutable, jamais une liste statique — pour que la
  // suppression "depuis un autre onglet" ait un effet RÉEL sur ce que le Worker répondrait ensuite,
  // exactement comme en production.
  const store = new Map([[DOC_ID, { document_id: DOC_ID }]]);
  let createCalls = 0, versionCalls = 0, versionCallsOn404Id = 0;
  // Chaque création réelle doit recevoir un id RÉELLEMENT NEUF et être RÉELLEMENT enregistrée dans
  // le "stockage" simulé (jamais un id fixe partagé entre deux créations distinctes, jamais un id
  // "créé" qui resterait absent du stockage — sinon la version suivante retomberait à tort en 404,
  // ce qui fausserait silencieusement ce test lui-même).
  const createdIds = [NEW_DOC_ID, 'doc-never-deleted-created'];
  let createIdx = 0;

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();

    if (url.endsWith('/clinical-documents') && req.method() === 'POST') {
      createCalls++;
      const newId = createdIds[createIdx++] || ('doc-created-extra-' + createIdx);
      store.set(newId, { document_id: newId });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: newId, version_id: newId + '-v1', created_at: '2026-09-27T09:10:00Z', generation_engine: 'structured' }) });
    }
    const versionsMatch = url.match(/\/clinical-documents\/([^\/]+)\/versions$/);
    if (versionsMatch && req.method() === 'POST') {
      versionCalls++;
      const targetId = versionsMatch[1];
      if (!store.has(targetId)) {
        versionCallsOn404Id++;
        // Fidèle au Worker réel (handleClinicalDocumentVersionCreate) : 404 exact quand le
        // document n'existe plus, jamais une autre cause (réseau, 500...).
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Clinical document not found' }) });
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: targetId, version_id: targetId + '-v2', previous_version_id: targetId + '-v1', created_at: '2026-09-27T09:05:00Z', generation_engine: 'structured' }) });
    }
    // Suppression "depuis un autre onglet/session" — un appel DELETE réel, jamais un raccourci
    // côté test qui modifierait directement l'artefact ouvert (ce qui ne prouverait rien de réel).
    const delMatch = url.match(/\/clinical-documents\/([^\/]+)$/);
    if (delMatch && req.method() === 'DELETE') {
      store.delete(delMatch[1]);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
    }
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

  // ── Document ouvert avec un _adocClinicalDocumentId DÉJÀ VALIDE (comme demandé : "document
  // ouvert avec un _adocClinicalDocumentId valide au moment de l'ouverture") ──
  const storeKey = 'adocArt_test_404save';
  const doc = ficheDoc(DOC_ID, 'Document ouvert puis supprimé ailleurs', [heading('h1', 'Titre'), para('p1', 'Paragraphe original.')]);
  const opened = await page.evaluate(({ key, doc, docId }) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      name: doc.title, _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      _adocStructuredDoc: doc, _adocStructuredSnapshot: { sourceSnapshotId: 'snapshot-' + docId, entries: [] }, _adocRenderManifestOverride: null,
      _adocClinicalDocumentId: docId, _adocClinicalVersionId: docId + '-v1',
    };
    return window.adocOpenWorkspace(key);
  }, { key: storeKey, doc: doc, docId: DOC_ID });
  assert.equal(opened, true, 'le document doit s’ouvrir normalement, déjà enregistré (id existant)');
  await page.waitForFunction(() => !document.getElementById('cc-ws-delete-btn').hidden);
  const saveLabelBefore = await page.locator('#cc-ws-save-btn span').textContent();
  assert.equal(saveLabelBefore, 'Enregistrer une nouvelle version', 'le bouton doit refléter un document déjà enregistré avant la suppression');
  console.log('PASS 1/9 — document ouvert avec un id déjà valide (état initial, avant toute suppression)');

  // ── Suppression RÉELLE "depuis un autre onglet/session" — le document ouvert ici ne le sait
  // pas encore (aucune notification, exactement le scénario réel) ──
  await page.evaluate((docId) => fetch('https://clone-proxy.11drumboy11.workers.dev/clinical-documents/' + docId, {
    method: 'DELETE', headers: { 'X-API-Key': 'test-key' },
  }), DOC_ID);
  console.log('PASS 2/9 — suppression réelle simulée "depuis un autre onglet/session" (le document ouvert n’en sait toujours rien)');

  // ── Tentative "Enregistrer une nouvelle version" → 404 réel → message de confirmation clair,
  // citant explicitement la ré-création en nouveau document (jamais une erreur brute) ──
  let dialogMessage = null;
  page.once('dialog', async (d) => { dialogMessage = d.message(); await d.dismiss(); });
  await page.click('#cc-ws-save-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-btn').disabled);
  assert.equal(versionCalls, 1, 'la tentative doit appeler réellement POST .../versions (route de VERSION, pas de création, en premier lieu)');
  assert.equal(versionCallsOn404Id, 1, 'cet appel doit bien cibler l’id du document supprimé (404 réel, pas simulé autrement)');
  assert.ok(dialogMessage && dialogMessage.includes('supprimé') && dialogMessage.toLowerCase().includes('nouveau document'), 'le message doit être clair et proposer explicitement de l’enregistrer comme un nouveau document : ' + dialogMessage);
  console.log('PASS 3/9 — 404 réel détecté sur la route de version → message clair proposant la ré-création en nouveau document (jamais une erreur brute) : "' + dialogMessage + '"');

  // ── Refus explicite → RIEN n'est perdu, l'état reste EXACTEMENT celui d'avant la tentative
  // (aucun nouveau document créé, l'ancien id supprimé reste tel quel sur l'artefact) ──
  assert.equal(createCalls, 0, 'un refus ne doit déclencher AUCUN appel de création');
  const stateAfterRefusal = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    return { docId: art._adocClinicalDocumentId, dirty: !!art._ccEditorDirty };
  }, storeKey);
  assert.equal(stateAfterRefusal.docId, DOC_ID, 'après un refus, l’ancien id (supprimé) doit rester tel quel sur l’artefact — rien n’est perdu ni modifié');
  const bodyTextAfterRefusal = await page.locator('#cc-ws-doc-card').textContent();
  assert.ok(bodyTextAfterRefusal.includes('Paragraphe original.'), 'le contenu du document doit rester intact après un refus');
  console.log('PASS 4/9 — refus explicite : aucun appel de création, l’état reste exactement celui d’avant la tentative (rien perdu)');

  // ── Nouvelle tentative, cette fois en ACCEPTANT → ré-enregistrement RÉEL comme un NOUVEAU
  // document (POST /clinical-documents, jamais la route de version sur l’ancien id) ──
  page.once('dialog', async (d) => { dialogMessage = d.message(); await d.accept(); });
  await page.click('#cc-ws-save-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-btn').disabled);
  assert.equal(createCalls, 1, 'accepter doit déclencher un appel réel de CRÉATION (POST /clinical-documents), jamais une réutilisation de l’ancien id supprimé');
  assert.equal(versionCalls, 2, 'la tentative (2e appel) doit toujours être passée par la route de version en premier lieu, avant le repli');
  const stateAfterAccept = await page.evaluate((key) => window._adocArtifacts[key]._adocClinicalDocumentId, storeKey);
  assert.equal(stateAfterAccept, NEW_DOC_ID, 'le document doit désormais porter le NOUVEL id renvoyé par la création, jamais l’ancien id supprimé');
  assert.notEqual(stateAfterAccept, DOC_ID, 'le nouvel id ne doit JAMAIS être l’ancien id supprimé');
  console.log('PASS 5/9 — accepter : ré-enregistrement réel comme un NOUVEAU document (nouvel id, jamais l’ancien id supprimé)');

  // ── Non-régression — une sauvegarde normale ensuite (le nouveau document existe bien réellement
  // côté "serveur") crée une VERSION de CE nouveau document, jamais un second nouveau document ──
  await page.click('#cc-ws-save-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-btn').disabled);
  assert.equal(createCalls, 1, 'une sauvegarde normale ultérieure ne doit JAMAIS créer un second document');
  assert.equal(versionCalls, 3, 'elle doit créer une nouvelle version du nouveau document');
  console.log('PASS 6/9 — non-régression : une sauvegarde normale après la ré-création crée une VERSION du nouveau document, jamais un doublon');

  // ── Non-régression — sauvegarde normale d’un document JAMAIS supprimé (scénario standard,
  // sans aucun 404) : comportement strictement inchangé ──
  const storeKeyB = 'adocArt_test_404save_normal';
  const docB = ficheDoc('doc-never-deleted', 'Document normal', [heading('bh1', 'Titre B')]);
  const openedB = await page.evaluate(({ key, doc }) => {
    window._adocArtifacts[key] = {
      name: doc.title, _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      _adocStructuredDoc: doc, _adocStructuredSnapshot: { sourceSnapshotId: 'snapshot-b', entries: [] }, _adocRenderManifestOverride: null,
    };
    return window.adocOpenWorkspace(key);
  }, { key: storeKeyB, doc: docB });
  assert.equal(openedB, true, 'un document tout neuf (jamais encore enregistré) doit s’ouvrir normalement');
  await page.click('#cc-ws-save-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-btn').disabled);
  assert.equal(createCalls, 2, 'la première sauvegarde d’un document neuf doit créer réellement (comportement standard, inchangé)');
  await page.click('#cc-ws-save-btn');
  await page.waitForFunction(() => !document.getElementById('cc-ws-save-btn').disabled);
  assert.equal(versionCalls, 4, 'la ré-sauvegarde d’un document jamais supprimé doit créer une version normalement, sans jamais déclencher le repli 404');
  // 2 tentatives 404 légitimes ont déjà eu lieu (test 3 : la détection initiale ; test 5 : le
  // second clic "Enregistrer", avant que la confirmation acceptée ne bascule sur la création) —
  // le compteur ne doit plus JAMAIS augmenter au-delà pour un document sain comme B.
  assert.equal(versionCallsOn404Id, 2, 'le compteur de 404 ne doit plus jamais augmenter au-delà des 2 tentatives légitimes déjà comptabilisées (document sain B jamais concerné)');
  console.log('PASS 7/9 — non-régression : sauvegarde normale (création puis version) d’un document jamais supprimé, comportement strictement inchangé');

  // ── Non-régression — le bouton "Supprimer" déjà existant du bandeau continue de fonctionner ──
  await page.click('#cc-ws-delete-btn');
  await page.waitForSelector('#cc-ws-delete-confirm.open');
  await page.click('.cc-ws-delete-confirm-confirm');
  await page.waitForFunction(() => {
    const st = window._adocWsState;
    return window._adocArtifacts[st.storeKey]._adocClinicalDocumentId === null;
  });
  console.log('PASS 8/9 — non-régression : le bouton "Supprimer" existant du bandeau de travail fonctionne toujours à l’identique');

  // ── Zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('PASS 9/9 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS GESTION GRACIEUSE DOCUMENT SUPPRIMÉ (404) (9/9) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
