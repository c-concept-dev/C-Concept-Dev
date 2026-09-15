// Audit correctif — Partie B, TEST BOUT-EN-BOUT OBLIGATOIRE : simule un échec du moteur
// structuré → confirme le repli legacy → confirme l'étiquetage generationEngine='legacy-html'
// avec SourceSnapshot → ouvre dans l'écran de travail (avec le message du point 11) → clique
// Enregistrer (vrai POST /clinical-documents) → ferme l'espace de travail → recharge depuis D1
// (mocké) → exporte proprement. Passe par le VRAI pipeline complet (window.adocSend(), planner +
// clarté + RAG mockés), même patron que verify-live-fiche-mocked.js, jamais un appel isolé de
// adocGenerateStructuredFiche seul — pour prouver le VRAI chemin utilisateur de bout en bout.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
  { content: 'Le mépris porte une dévalorisation globale du partenaire.', book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58 },
];

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><body><h1>Fiche (moteur de secours)</h1><p>Les quatre cavaliers de Gottman prédisent la rupture du couple.</p></body></html>';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let createCallCount = 0, createdPayload = null;
  const SERVER_DOC_ID = 'clindoc-legacy-e2e-001';
  const SERVER_VERSION_ID = 'v1-legacy';

  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits') && method === 'GET') { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }

    // ── POST /clinical-documents (Enregistrer) ──
    if (url.endsWith('/clinical-documents') && method === 'POST') {
      createCallCount++;
      createdPayload = JSON.parse(req.postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: SERVER_DOC_ID, version_id: SERVER_VERSION_ID, created_at: new Date().toISOString(), generation_engine: 'legacy-html' }) });
      return;
    }
    // ── GET /clinical-documents/:id (rechargement depuis D1, après fermeture) ──
    if (url.endsWith('/clinical-documents/' + SERVER_DOC_ID) && method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        document_id: SERVER_DOC_ID, title: createdPayload?.title, document_kind: createdPayload?.documentKind,
        created_at: new Date().toISOString(), current_version_id: SERVER_VERSION_ID, generation_engine: 'legacy-html',
        version: { version_id: SERVER_VERSION_ID, previous_version_id: null, schema_version: 1, created_at: new Date().toISOString(), change_summary: null, generation_engine: 'legacy-html', document: createdPayload?.document },
      }) });
      return;
    }

    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      // Le second appel du moteur structuré (sortie forcée) — échoue de façon NON transitoire
      // (HTTP 400, jamais 429/502/503/504) : une seule tentative, jamais de retry, repli
      // automatique immédiat et propre sur le moteur legacy (catch autour de
      // adocGenerateStructuredFiche dans window.adocSend).
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
        route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'simulation échec structuré (non transitoire)' } }) });
        return;
      }
      // Premier appel du moteur structuré (décision web_search, max_tokens:200) — succès trivial,
      // sans recherche web (on ne teste pas ce chemin ici, seul l'échec du 2e appel importe).
      if (body.includes('"max_tokens":200')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      // Appel principal du moteur LEGACY (mixte, max_tokens:16000) — celui qui doit produire le
      // document de repli réellement affiché/enregistré dans ce test.
      if (body.includes('"max_tokens":16000')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) });
        return;
      }
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('needs_rag') || body.includes('TÂCHE')) {
        const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== 1. Requête réelle via window.adocSend() — le moteur structuré doit échouer et le repli legacy doit produire le document ===');
  await page.fill('#clinical-question', 'Fais-moi une fiche synthèse sur les cavaliers de Gottman');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1500);

  const afterSend = await page.evaluate(() => {
    const artifacts = window._adocArtifacts || {};
    const legacyEntry = Object.entries(artifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html');
    return {
      totalArtifacts: Object.keys(artifacts).length,
      hasLegacyArtifact: !!legacyEntry,
      storeKey: legacyEntry ? legacyEntry[0] : null,
      capabilities: legacyEntry ? legacyEntry[1]._adocCapabilities : null,
      hasSourceSnapshot: legacyEntry ? !!(legacyEntry[1]._adocLegacySourceSnapshot && legacyEntry[1]._adocLegacySourceSnapshot.entries.length) : false,
      htmlMatches: legacyEntry ? legacyEntry[1].html.includes('Fiche (moteur de secours)') : false,
      noStructuredDoc: legacyEntry ? !legacyEntry[1]._adocStructuredDoc : null,
    };
  });
  console.log(afterSend);
  console.log('=> Repli confirmé : document produit, étiqueté legacy-html, avec un vrai SourceSnapshot (jamais un ClinicalDocument fabriqué) :',
    afterSend.hasLegacyArtifact && afterSend.hasSourceSnapshot && afterSend.htmlMatches && afterSend.noStructuredDoc === true);

  const storeKey = afterSend.storeKey;

  console.log('\n=== 2. Ouverture dans l\'écran de travail — capacités.workspace suffit (plus besoin de _adocStructuredDoc) ===');
  await page.evaluate((sk) => window.adocOpenDocPopup(sk), storeKey);
  await page.waitForTimeout(150);
  const wsState = await page.evaluate(() => ({
    open: document.getElementById('cc-workspace').classList.contains('open'),
    docCardHtml: document.getElementById('cc-ws-doc-card').innerHTML,
    bannerHidden: document.getElementById('cc-ws-legacy-banner').hidden,
    bannerActuallyInvisible: getComputedStyle(document.getElementById('cc-ws-legacy-banner')).display === 'none',
    bannerText: document.querySelector('#cc-ws-legacy-banner span').textContent,
    saveStatus: document.getElementById('cc-ws-save-status').textContent,
  }));
  console.log(wsState);
  console.log('=> Écran de travail ouvert avec le VRAI HTML de repli :', wsState.open && wsState.docCardHtml.includes('Fiche (moteur de secours)'));
  console.log("=> Message explicite du point 11 VISIBLE (pas juste hidden=false en JS, réellement affiché) et mentionne citations fines + édition par bloc :",
    !wsState.bannerHidden && !wsState.bannerActuallyInvisible && /citations fines/i.test(wsState.bannerText) && /édition par bloc/i.test(wsState.bannerText));

  console.log('\n=== 3. Clic "Enregistrer" — vrai POST /clinical-documents avec generationEngine=legacy-html ===');
  await page.click('#cc-ws-save-btn');
  await page.waitForTimeout(200);
  console.log('POST /clinical-documents appelé une fois:', createCallCount === 1);
  console.log('Payload : html+sourceSnapshot présents, JAMAIS de clinicalDocument fabriqué:', {
    generationEngine: createdPayload?.generationEngine,
    hasHtml: !!createdPayload?.document?.html,
    hasSourceSnapshot: !!createdPayload?.document?.sourceSnapshot,
    hasNoClinicalDocument: !('clinicalDocument' in (createdPayload?.document || {})),
  });
  const afterSave = await page.evaluate(() => document.getElementById('cc-ws-save-status').textContent);
  console.log('Statut passé à "Enregistré":', afterSave === 'Enregistré');

  console.log('\n=== 4. Fermeture de l\'espace de travail ===');
  await page.click('#cc-ws-close-btn');
  await page.waitForTimeout(100);
  console.log('Fermé:', !(await page.evaluate(() => document.getElementById('cc-workspace').classList.contains('open'))));

  console.log('\n=== 5. Rechargement depuis D1 (GET mocké) — reconstruction d\'un artefact ré-ouvrable ===');
  // Le codebase n'a pas encore d'écran "Mes créations" pour parcourir les documents enregistrés
  // (absence déjà documentée, hors périmètre de ce lot) — ce test prouve donc directement le
  // contrat de persistance : ce que le serveur a stocké se relit et se rouvre à l'identique.
  const reload = await page.evaluate(async (sk) => {
    const workerUrl = 'https://clone-proxy.11drumboy11.workers.dev';
    const r = await fetch(workerUrl + '/clinical-documents/clindoc-legacy-e2e-001', { headers: { 'X-API-Key': localStorage.getItem('workerApiKey') || '7005f3fe8b04dfde1299be47d75a6648f65c4f06c178b2c8' } });
    const body = await r.json();
    // adocDeliverArtifact n'est pas exposée sur window (fonction interne) — reconstruction
    // manuelle de l'entrée artefact avec EXACTEMENT la même forme qu'elle produit pour fmt='html'
    // (voir son code : {html, name, blobUrl, fmt:'html'}), pour exercer le VRAI adocOpenWorkspace/
    // adocOpenDocPopup sur un artefact "rechargé depuis D1" sans dupliquer sa logique de rendu.
    const newStoreKey = 'adocArt_reload_' + Date.now();
    const blobUrl = URL.createObjectURL(new Blob([body.version.document.html], { type: 'text/html;charset=utf-8' }));
    if (!window._adocArtifacts) window._adocArtifacts = {};
    window._adocArtifacts[newStoreKey] = {
      html: body.version.document.html, name: 'fiche-rechargee', blobUrl, fmt: 'html',
      _adocGenerationEngine: body.generation_engine,
      _adocLegacySourceSnapshot: body.version.document.sourceSnapshot,
      _adocDocumentKind: body.document_kind,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: false, blockEditing: false, transform: false },
      _adocClinicalDocumentId: body.document_id,
      _adocClinicalVersionId: body.version.version_id,
    };
    return { status: r.status, newStoreKey, htmlMatches: body.version.document.html.includes('Fiche (moteur de secours)'), sourceSnapshotEntryCount: body.version.document.sourceSnapshot.entries.length };
  }, storeKey);
  console.log(reload);

  await page.evaluate((sk) => window.adocOpenDocPopup(sk), reload.newStoreKey);
  await page.waitForTimeout(150);
  const reopened = await page.evaluate(() => ({
    open: document.getElementById('cc-workspace').classList.contains('open'),
    docCardHtml: document.getElementById('cc-ws-doc-card').innerHTML,
    saveStatus: document.getElementById('cc-ws-save-status').textContent,
    deleteVisible: getComputedStyle(document.getElementById('cc-ws-delete-btn')).display !== 'none',
  }));
  console.log(reopened);
  console.log('=> Document rechargé depuis D1 rouvert à l\'identique, déjà marqué "Enregistré" (a un _adocClinicalDocumentId):',
    reopened.open && reopened.docCardHtml.includes('Fiche (moteur de secours)') && reopened.saveStatus === 'Enregistré' && reopened.deleteVisible);

  console.log('\n=== 6. Export propre depuis le document rechargé (téléchargement direct, pas de re-rendu/QC) ===');
  const downloadPromise = page.waitForEvent('download').catch(() => null);
  await page.click('#cc-ws-export-btn');
  const download = await downloadPromise;
  console.log('Téléchargement déclenché sans erreur:', !!download);
  if (download) {
    const path = await download.path();
    const fs = require('fs');
    const content = fs.readFileSync(path, 'utf-8');
    console.log('Contenu exporté correspond au HTML de repli enregistré:', content.includes('Fiche (moteur de secours)'));
  }

  await page.screenshot({ path: OUT + '/partB-legacy-e2e-workspace.png', fullPage: false });
  console.log('\n=== errors ===', errors);
  await browser.close();
})();
