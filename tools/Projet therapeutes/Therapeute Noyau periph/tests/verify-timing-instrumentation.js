const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const MOCK_RAG_CHUNKS = [{ content: "Texte de test suffisant pour un passage RAG.", book_title: 'Livre test', author: 'Auteur', page_number: 1 }];
function toolResponse() {
  return { content: [{ type: 'tool_use', name: 'emit_fiche_document', input: { title: 'T', purpose: 'p', audience: 'a', blocks: [{ type: 'paragraph', text: 'Contenu valide.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }] } }] };
}
// Le 2e appel (génération structurée forcée) est désormais streamé (lot streaming).
function toolResponseSSE() {
  const inputJson = JSON.stringify(toolResponse().content[0].input);
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
// Le 1er appel (décision web_search) est désormais AUSSI streamé (lot streaming appel 1).
function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => { if (m.text().includes('[timing]')) logs.push(m.text()); });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 1, total_chunks: 1, by_approach: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || ''; let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const isSearch = body.payload && body.payload.tools && body.payload.tools[0] && body.payload.tools[0].name === 'web_search';
      if (isSearch) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
      } else {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE() });
      }
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
  }, { chunks: MOCK_RAG_CHUNKS });
  console.log('=== logs de timing capturés ===');
  logs.forEach(l => console.log(l));
  console.log('=> nombre d\'étapes journalisées (attendu >= 6):', logs.length, logs.length >= 6);
  await browser.close();
})();
