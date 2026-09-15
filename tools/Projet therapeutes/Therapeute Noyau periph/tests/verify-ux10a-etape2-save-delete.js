// UX-10A Étape 2 — preuve réelle du bouton "Enregistrer" et de la suppression avec export
// proposé d'abord, dans l'écran de travail (#cc-workspace). Génère un vrai document structuré
// (planner + RAG + tool_use mockés, même patron que verify-live-fiche-mocked.js), puis exerce
// le vrai code client de sauvegarde/suppression contre un réseau mocké pour /clinical-documents.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_TOOL_INPUT = {
  title: "Les cavaliers de l'apocalypse — Gottman",
  purpose: 'supervision', audience: 'clinicien',
  blocks: [
    { type: 'heading', text: "Les cavaliers de l'apocalypse", level: 1, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
    { type: 'paragraph', text: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: ['entry-1'] },
  ],
};
function mockToolResponseSSE() {
  const inputJson = JSON.stringify(MOCK_TOOL_INPUT);
  const chunkSize = 37;
  const fragments = [];
  for (let i = 0; i < inputJson.length; i += chunkSize) fragments.push(inputJson.slice(i, i + chunkSize));
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 100 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'emit_fiche_document', input: {} } },
    ...fragments.map(f => ({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: f } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let createCallCount = 0, versionCallCount = 0, deleteCallCount = 0;
  let createdPayload = null, versionPayload = null;
  const SERVER_DOC_ID = 'clindoc-test-001';
  let serverVersionCounter = 0;

  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits') && method === 'GET') { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.endsWith('/clinical-documents') && method === 'POST') {
      createCallCount++;
      createdPayload = JSON.parse(req.postData() || '{}');
      serverVersionCounter = 1;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: SERVER_DOC_ID, version_id: 'v' + serverVersionCounter, created_at: new Date().toISOString() }) });
      return;
    }
    if (url.endsWith('/clinical-documents/' + SERVER_DOC_ID + '/versions') && method === 'POST') {
      versionCallCount++;
      versionPayload = JSON.parse(req.postData() || '{}');
      serverVersionCounter++;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: SERVER_DOC_ID, version_id: 'v' + serverVersionCounter, previous_version_id: 'v' + (serverVersionCounter - 1), created_at: new Date().toISOString() }) });
      return;
    }
    if (url.endsWith('/clinical-documents/' + SERVER_DOC_ID) && method === 'DELETE') {
      deleteCallCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ document_id: SERVER_DOC_ID, deleted: true }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE() }); return; }
      if (body.includes('"type":"auto"')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== 0. Génération d\'un vrai document structuré (planner + RAG + tool_use mockés) ===');
  const genResult = await page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('Fais-moi une fiche sur les cavaliers de Gottman', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    return { title: structured.doc.title, qcBlocking: rendered.qc.blocking.length };
  }, { chunks: MOCK_RAG_CHUNKS });
  console.log(genResult);

  // Livre l'artefact via le mécanisme réel (comme le fait le vrai chemin de génération).
  const storeKey = await page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    return await window.adocDeliverStructuredFicheArtifact(structured.doc, structured.sourceSnapshot, rendered, null);
  }, { chunks: MOCK_RAG_CHUNKS });
  console.log('Artefact livré, storeKey:', !!storeKey);

  console.log('\n=== 1. Ouverture de l\'espace de travail — statut initial "Non enregistré" ===');
  await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
  await page.waitForTimeout(150);
  const initialState = await page.evaluate(() => ({
    statusText: document.getElementById('cc-ws-save-status').textContent,
    statusClass: document.getElementById('cc-ws-save-status').className,
    deleteHidden: document.getElementById('cc-ws-delete-btn').hidden,
    deleteActuallyInvisible: getComputedStyle(document.getElementById('cc-ws-delete-btn')).display === 'none',
    saveLabel: document.querySelector('#cc-ws-save-btn span').textContent,
  }));
  console.log(initialState);

  console.log('\n=== 2. Clic "Enregistrer" — vrai POST /clinical-documents ===');
  await page.click('#cc-ws-save-btn');
  await page.waitForTimeout(200);
  console.log('POST /clinical-documents appelé une fois:', createCallCount === 1);
  console.log('Payload : title/documentKind/document.clinicalDocument présents:', {
    title: createdPayload?.title,
    documentKind: createdPayload?.documentKind,
    hasClinicalDocument: !!createdPayload?.document?.clinicalDocument,
    hasSourceSnapshot: !!createdPayload?.document?.sourceSnapshot,
  });
  const afterSaveState = await page.evaluate(() => ({
    statusText: document.getElementById('cc-ws-save-status').textContent,
    statusClass: document.getElementById('cc-ws-save-status').className,
    deleteHidden: document.getElementById('cc-ws-delete-btn').hidden,
    deleteActuallyVisible: getComputedStyle(document.getElementById('cc-ws-delete-btn')).display !== 'none',
    saveLabel: document.querySelector('#cc-ws-save-btn span').textContent,
  }));
  console.log(afterSaveState);

  console.log('\n=== 3. Re-clic "Enregistrer" — nouvelle VERSION, pas un nouveau document ===');
  await page.click('#cc-ws-save-btn');
  await page.waitForTimeout(200);
  console.log('POST /clinical-documents PAS rappelé (toujours 1), POST .../versions appelé une fois:', { createCallCount, versionCallCount });

  console.log('\n=== 4. "Supprimer" — écran de confirmation réel, PAS un confirm() générique ===');
  await page.click('#cc-ws-delete-btn');
  await page.waitForTimeout(100);
  const confirmVisible = await page.evaluate(() => document.getElementById('cc-ws-delete-confirm').classList.contains('open'));
  const confirmText = await page.evaluate(() => document.querySelector('.cc-ws-delete-confirm-panel p').textContent);
  console.log('Modal de confirmation ouverte:', confirmVisible);
  console.log('Rappelle explicitement la possibilité d\'exporter avant:', /export/i.test(confirmText));
  console.log('Bouton "Exporter d\'abord" présent:', await page.evaluate(() => !!document.querySelector('.cc-ws-delete-confirm-export')));

  console.log('\n=== 5. "Annuler" — ne supprime rien ===');
  await page.click('.cc-ws-delete-confirm-cancel');
  await page.waitForTimeout(100);
  console.log('Modal fermée, DELETE PAS appelé:', { modalOpen: await page.evaluate(() => document.getElementById('cc-ws-delete-confirm').classList.contains('open')), deleteCallCount });

  console.log('\n=== 6. "Supprimer" à nouveau, puis "Supprimer définitivement" ===');
  await page.click('#cc-ws-delete-btn');
  await page.waitForTimeout(100);
  await page.click('.cc-ws-delete-confirm-confirm');
  await page.waitForTimeout(200);
  console.log('DELETE /clinical-documents/:id appelé une fois:', deleteCallCount === 1);
  const afterDeleteState = await page.evaluate(() => ({
    statusText: document.getElementById('cc-ws-save-status').textContent,
    deleteHidden: document.getElementById('cc-ws-delete-btn').hidden,
    deleteActuallyInvisible: getComputedStyle(document.getElementById('cc-ws-delete-btn')).display === 'none',
    modalClosed: !document.getElementById('cc-ws-delete-confirm').classList.contains('open'),
  }));
  console.log(afterDeleteState);
  console.log('=> Retour à "Non enregistré" après suppression, bouton Supprimer RÉELLEMENT invisible (pas juste hidden=true en JS):', afterDeleteState.statusText === 'Non enregistré' && afterDeleteState.deleteActuallyInvisible === true);

  await page.screenshot({ path: OUT + '/ux10a-etape2-workspace.png', fullPage: false });

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
