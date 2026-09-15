// Lot request-id — volet client : mocke la réponse du WORKER (jamais Anthropic directement,
// le client ne lui parle jamais) avec l'en-tête X-Anthropic-Request-Id tel que le Worker le
// renverrait après son propre correctif, et confirme que adocGenerateStructuredFiche le
// capture bien dans _m2, qu'il traverse automatiquement window._adocLastStructAttemptMetrics
// (relais déjà établi, aucune plomberie nouvelle nécessaire), et qu'une entrée de repli
// simulée l'affiche dans adocDumpFallbackTrace().
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];
const FAKE_REQUEST_ID = 'req_01TestClientCapture999';

const MOCK_TOOL_INPUT = { title: 'Fiche test', purpose: 'test', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }] };
function mockToolResponseSSE() {
  const inputJson = JSON.stringify(MOCK_TOOL_INPUT);
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 50 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) {}
      const p = parsed.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') {
        // Simule EXACTEMENT ce que le Worker corrigé renvoie désormais : l'en-tête
        // X-Anthropic-Request-Id, en plus du flux SSE normal — jamais testé côté Anthropic
        // directement (le client ne lui parle jamais).
        // Access-Control-Allow-Origin + Access-Control-Expose-Headers reproduits ici tels que
        // le Worker corrigé les renvoie réellement (objet CORS) — sans ça, un VRAI navigateur
        // (cross-origin depuis file://) rendrait cet en-tête invisible à fetch(), ce test
        // n'aurait alors rien prouvé de réaliste.
        route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'X-Anthropic-Request-Id': FAKE_REQUEST_ID, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'X-Anthropic-Request-Id' }, body: mockToolResponseSSE() });
        return;
      }
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"type":"message_stop"}\n\ndata: [DONE]\n\n' });
        return;
      }
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const captured = await page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    const structuredPrompt = window.adocBuildSystemPrompt('', '', { intent: 'fiche', output_format: 'html' }, null, { forStructuredTool: true });
    await window.adocGenerateStructuredFiche('Fais-moi une fiche sur les cavaliers de Gottman', { intent: 'fiche' }, ragResult, structuredPrompt, 'https://clone-proxy.11drumboy11.workers.dev');
    // Correction rang 4 — metrics2 est désormais un TABLEAU d'une entrée par tentative (jamais
    // plus un objet unique réécrit) : la tentative pertinente ici (réussie du premier coup) est
    // la dernière (et seule) du tableau.
    const arr = window._adocLastStructAttemptMetrics ? window._adocLastStructAttemptMetrics.metrics2 : null;
    return arr && arr.length ? arr[arr.length - 1] : null;
  }, { chunks: MOCK_RAG_CHUNKS });

  console.log('=== Capture dans _m2 (via le relais existant window._adocLastStructAttemptMetrics.metrics2) ===');
  console.log('anthropicRequestId capturé:', captured ? captured.anthropicRequestId : null);
  console.log('=> Capture correcte, sans plomberie nouvelle (relais déjà établi):', !!captured && captured.anthropicRequestId === FAKE_REQUEST_ID);

  // Simule maintenant un repli réel (comme le ferait window.adocSend lors d'un abandon), pour
  // confirmer que adocDumpFallbackTrace() affiche bien ce nouveau champ sur une VRAIE entrée
  // construite à partir de metrics2, exactement comme le code de production le ferait.
  const dumpResult = await page.evaluate(({ requestId }) => {
    const entry = {
      timestamp: new Date().toISOString(), hourOfDay: 20, failedCall: 2, sourceCount: 12,
      ragChunkCount: 12, usedWebSearch: false,
      metrics1: { payloadBytes: 800, msToHttp200: 5, usefulContentFragmentCount: 1, lastEventType: 'message_stop', finalState: 'completed' },
      metrics2: { payloadBytes: 27500, usefulContentFragmentCount: 40, lastEventType: 'ping', finalState: 'semantic-timeout', msSinceLastSemanticActivity: 45000, anthropicRequestId: requestId },
      errorMessage: 'Simulation — repli appel 2 avec request-id capturé.',
    };
    localStorage.setItem('adocFallbackTrace', JSON.stringify([entry]));
    const tableRows = [];
    const origTable = console.table;
    console.table = function (rows) { tableRows.push(...rows); };
    let threw = false;
    try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; }
    console.table = origTable;
    return { threw, row: tableRows[0] };
  }, { requestId: FAKE_REQUEST_ID });

  console.log('\n=== Ligne affichée par adocDumpFallbackTrace() ===');
  console.log(dumpResult.row);
  console.log('adocDumpFallbackTrace() ne lève aucune erreur:', dumpResult.threw === false);
  console.log('=> anthropicRequestId visible dans le tableau de sortie:', dumpResult.row && dumpResult.row.anthropicRequestId === FAKE_REQUEST_ID);

  // Non-régression : une entrée SANS ce champ (format d'avant ce lot) doit toujours s'afficher
  // sans planter (champ simplement null, jamais "undefined" qui casserait un tri/filtre futur).
  const oldFormatResult = await page.evaluate(() => {
    const oldEntry = {
      timestamp: new Date().toISOString(), hourOfDay: 20, failedCall: 2, sourceCount: 12,
      ragChunkCount: 12, usedWebSearch: false,
      metrics1: { payloadBytes: 800, usefulContentFragmentCount: 1, lastEventType: 'message_stop', finalState: 'completed' },
      metrics2: { payloadBytes: 27500, usefulContentFragmentCount: 40, lastEventType: 'ping', finalState: 'semantic-timeout', msSinceLastSemanticActivity: 45000 },
      errorMessage: 'Ancienne entrée (avant ce lot) — pas de champ anthropicRequestId.',
    };
    localStorage.setItem('adocFallbackTrace', JSON.stringify([oldEntry]));
    const tableRows = [];
    const origTable = console.table;
    console.table = function (rows) { tableRows.push(...rows); };
    let threw = false;
    try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; }
    console.table = origTable;
    return { threw, row: tableRows[0] };
  });
  console.log('\n=== Non-régression — entrée ancien format (sans anthropicRequestId) ===');
  console.log(oldFormatResult.row);
  console.log('=> Aucune erreur, champ affiché null (pas undefined, pas de crash):', oldFormatResult.threw === false && oldFormatResult.row.anthropicRequestId === null);

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
