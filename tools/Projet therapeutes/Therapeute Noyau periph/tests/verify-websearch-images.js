// Vérifie le CORRECTIF UX-8A.2 : récupération du trio bibliothèque + web + IA (2 appels
// séparés) et le nouveau bloc "image" résolu via Pexels dans le pilote Fiche synthèse
// structurée. Réseau MOQUÉ (le vrai Worker clone-proxy.11drumboy11.workers.dev est
// inatteignable depuis ce sandbox — 403 CONNECT confirmé). Ce test prouve la logique
// côté client (2 appels distincts, extraction du complément web, résolution data-pexels
// via le mécanisme existant adocResolveImages) — pas la pertinence du modèle en conditions
// réelles (quand il choisit de chercher, ce qu'il trouve, la qualité des images choisies),
// qui reste à vérifier par Christophe en conditions réelles.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse — critique, mépris, attitude défensive, obstruction — prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

function toolResponse(blocks) {
  return {
    content: [
      {
        type: 'tool_use', name: 'emit_fiche_document',
        input: {
          title: 'Fiche test', purpose: 'supervision', audience: 'clinicien',
          blocks: blocks.map(b => Object.assign({
            type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
            headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [],
          }, b)),
        },
      },
    ],
  };
}

// Le 2e appel (génération structurée forcée) est désormais streamé (lot streaming) : le mock
// doit renvoyer un vrai flux SSE (data: {...}\n\n) avec le JSON de l'outil fragmenté en
// plusieurs deltas — jamais un unique bloc JSON non fragmenté — pour exercer réellement le
// code d'accumulation/parsing, pas seulement le chemin de repli.
function toolResponseSSE(blocks) {
  const resp = toolResponse(blocks);
  const inputJson = JSON.stringify(resp.content[0].input);
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

const WEB_SEARCH_USED_RESPONSE = {
  content: [
    { type: 'server_tool_use', id: 'srvtool_1', name: 'web_search', input: { query: 'gottman four horsemen 2024 research update' } },
    { type: 'web_search_tool_result', tool_use_id: 'srvtool_1', content: [
      { type: 'web_search_result', title: 'Gottman Institute — recherche récente', url: 'https://www.gottman.com/blog/recent-research/' },
    ] },
    { type: 'text', text: "Une étude 2024 confirme et affine la valeur prédictive des quatre cavaliers, avec un accent renforcé sur le mépris comme signal le plus critique." },
  ],
};

const WEB_SEARCH_NOT_USED_RESPONSE = {
  content: [
    { type: 'text', text: "Pas besoin de recherche complémentaire, la bibliothèque suffit." },
  ],
};

// Le 1er appel (décision web_search) est désormais AUSSI streamé (lot streaming appel 1) —
// encode une réponse "content" plate en flux SSE réaliste (server_tool_use +
// web_search_tool_result livrés entiers, text livré par deltas).
function encodeAsSSE(response) {
  const events = [{ type: 'message_start', message: { usage: { input_tokens: 10 } } }];
  (response.content || []).forEach(function(block, i) {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } });
      events.push({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: block.text } });
      events.push({ type: 'content_block_stop', index: i });
    } else {
      // server_tool_use / web_search_tool_result : livrés en un seul bloc, pas de delta.
      events.push({ type: 'content_block_start', index: i, content_block: block });
      events.push({ type: 'content_block_stop', index: i });
    }
  });
  events.push({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } });
  events.push({ type: 'message_stop' });
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('=== SCÉNARIO A — web_search DÉCLENCHÉ, complément intégré au 2e appel ===');
  {
    let callCount = 0;
    let capturedPayloads = [];
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
        return;
      }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || '';
        let body = {};
        try { body = JSON.parse(bodyRaw); } catch (e) {}
        callCount++;
        capturedPayloads.push(body.payload || {});
        const isSearchCall = body.payload && body.payload.tools && body.payload.tools[0] && body.payload.tools[0].name === 'web_search' && body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
        if (isSearchCall) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: encodeAsSSE(WEB_SEARCH_USED_RESPONSE) });
          return;
        }
        const isStructuredCall = body.payload && body.payload.tool_choice && body.payload.tool_choice.name === 'emit_fiche_document';
        if (isStructuredCall) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Les cavaliers de Gottman', level: 1 },
            { type: 'paragraph', text: 'Le mépris est le signal le plus toxique du couple.', citationEntryIds: ['entry-1'] },
          ]) });
          return;
        }
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);

    const consoleLines = [];
    page.on('console', m => { if (m.text().includes('UX-8A.2')) consoleLines.push(m.text()); });

    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const structured = await window.adocGenerateStructuredFiche(
        'Fais-moi une fiche sur les cavaliers de Gottman, avec la recherche récente si utile',
        { intent: 'fiche' }, ragResult, 'Tu es un assistant clinique.',
        'https://clone-proxy.11drumboy11.workers.dev'
      );
      return { title: structured.doc.title, blockCount: structured.doc.blocks.length };
    }, { chunks: MOCK_RAG_CHUNKS });

    console.log('résultat:', result);
    console.log('nombre d\'appels Worker:', callCount, '(attendu: 2 — décision web_search + structuré forcé)');
    console.log('logs [UX-8A.2]:', consoleLines);
    const secondCallSystem = capturedPayloads[1] && capturedPayloads[1].system || '';
    console.log('=> 2 appels distincts effectués:', callCount === 2);
    console.log('=> log confirme web_search utilisé:', consoleLines.some(l => l.includes('utilisé pour la Fiche')));
    console.log('=> complément web intégré au 2e appel (system prompt):', secondCallSystem.includes('COMPLÉMENT WEB') && secondCallSystem.includes('accent renforcé sur le mépris'));
    console.log('=> complément distingué des passages bibliothèque (paragraphe séparé):', secondCallSystem.includes('hors bibliothèque'));
  }

  console.log('\n=== SCÉNARIO B — web_search NON déclenché, 2e appel avec RAG seul ===');
  {
    let callCount = 0;
    let capturedPayloads = [];
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
        return;
      }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || '';
        let body = {};
        try { body = JSON.parse(bodyRaw); } catch (e) {}
        callCount++;
        capturedPayloads.push(body.payload || {});
        const isSearchCall = body.payload && body.payload.tools && body.payload.tools[0] && body.payload.tools[0].name === 'web_search' && body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
        if (isSearchCall) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: encodeAsSSE(WEB_SEARCH_NOT_USED_RESPONSE) });
          return;
        }
        const isStructuredCall = body.payload && body.payload.tool_choice && body.payload.tool_choice.name === 'emit_fiche_document';
        if (isStructuredCall) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Les cavaliers de Gottman', level: 1 },
            { type: 'paragraph', text: 'Le mépris est le signal le plus toxique du couple.', citationEntryIds: ['entry-1'] },
          ]) });
          return;
        }
      }
      route.continue();
    });
    await page.reload();
    await page.waitForTimeout(300);

    const consoleLines = [];
    page.on('console', m => { if (m.text().includes('UX-8A.2')) consoleLines.push(m.text()); });

    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const structured = await window.adocGenerateStructuredFiche(
        'Fais-moi une fiche sur les cavaliers de Gottman', { intent: 'fiche' }, ragResult,
        'Tu es un assistant clinique.', 'https://clone-proxy.11drumboy11.workers.dev'
      );
      return { title: structured.doc.title };
    }, { chunks: MOCK_RAG_CHUNKS });

    console.log('résultat:', result);
    console.log('nombre d\'appels Worker:', callCount);
    console.log('logs [UX-8A.2]:', consoleLines);
    const secondCallSystem = capturedPayloads[1] && capturedPayloads[1].system || '';
    console.log('=> 2 appels distincts effectués même sans usage web_search:', callCount === 2);
    console.log('=> log confirme web_search NON utilisé:', consoleLines.some(l => l.includes('non utilisé')));
    console.log('=> AUCUN complément web forcé dans le 2e appel:', !secondCallSystem.includes('COMPLÉMENT WEB'));
  }

  console.log('\n=== SCÉNARIO C — bloc image émis, résolu via Pexels (adocResolveImages) ===');
  {
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
        return;
      }
      if (url.includes('/fetch-image')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{ url: 'https://images.pexels.com/mock/couple-therapy-123.jpg' }] }) });
        return;
      }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || '';
        let body = {};
        try { body = JSON.parse(bodyRaw); } catch (e) {}
        const isSearchCall = body.payload && body.payload.tools && body.payload.tools[0] && body.payload.tools[0].name === 'web_search' && body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
        if (isSearchCall) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: encodeAsSSE(WEB_SEARCH_NOT_USED_RESPONSE) });
          return;
        }
        const isStructuredCall = body.payload && body.payload.tool_choice && body.payload.tool_choice.name === 'emit_fiche_document';
        if (isStructuredCall) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Les cavaliers de Gottman', level: 1 },
            { type: 'image', imageQuery: 'couple therapy session emotional distance', imageAlt: "Séance de thérapie de couple, distance émotionnelle visible" },
            { type: 'paragraph', text: 'Le mépris est le signal le plus toxique du couple.', citationEntryIds: ['entry-1'] },
          ]) });
          return;
        }
      }
      route.continue();
    });
    await page.reload();
    await page.waitForTimeout(300);

    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const structured = await window.adocGenerateStructuredFiche(
        'Fais-moi une fiche sur les cavaliers de Gottman avec une illustration pertinente',
        { intent: 'fiche' }, ragResult, 'Tu es un assistant clinique.',
        'https://clone-proxy.11drumboy11.workers.dev'
      );
      const imgBlock = structured.doc.blocks.find(b => b.type === 'image');
      const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
      return {
        imgBlockPresent: !!imgBlock,
        imgBlockQuery: imgBlock && imgBlock.content.query,
        imgBlockAlt: imgBlock && imgBlock.content.alt,
        qcBlocking: rendered.qc.blocking,
        htmlHasResolvedSrc: rendered.html.includes('src="https://images.pexels.com/mock/couple-therapy-123.jpg"'),
        htmlHasNoLeftoverDataPexels: !rendered.html.includes('data-pexels='),
        htmlHasAlt: rendered.html.includes('alt="Séance de thérapie de couple'),
      };
    }, { chunks: MOCK_RAG_CHUNKS });

    console.log(result);
    console.log('=> bloc image bien émis avec query+alt exploitables:', result.imgBlockPresent && !!result.imgBlockQuery && !!result.imgBlockAlt);
    console.log('=> QC non bloquant (alt présent):', result.qcBlocking.length === 0);
    console.log('=> data-pexels résolu en vraie URL (mock Pexels) via adocResolveImages:', result.htmlHasResolvedSrc);
    console.log('=> aucun data-pexels résiduel dans le HTML livré:', result.htmlHasNoLeftoverDataPexels);
    console.log('=> alt conservé dans le HTML final:', result.htmlHasAlt);
  }

  console.log('\n=== SCÉNARIO D — image SANS alt → QC bloquant (parité avec card.imageRef) ===');
  {
    const qcResult = await page.evaluate(async () => {
      const doc = {
        schemaVersion: 1, documentId: 'doc-test', versionId: 'doc-test-v1', previousVersionId: null,
        requestId: 'req-test', sourceSnapshotId: 'snap-test', createdAt: new Date().toISOString(),
        language: 'fr', status: 'draft', title: 'Test QC image', purpose: 'test', audience: 'clinicien',
        documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
        blocks: [
          { id: 'image-01', type: 'image', content: { query: 'therapy office', alt: '' }, citationIds: [], validation: {} },
        ],
        citations: [],
        validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
      };
      const qc = window.adocRunQualityContract(doc, [], [], []);
      return qc;
    });
    console.log(qcResult);
    console.log('=> alt vide sur bloc image détecté comme bloquant:', qcResult.blocking.some(m => m.includes('sans texte alternatif')));
  }

  await page.screenshot({ path: OUT + '/websearch-images-result.png', fullPage: false });
  console.log('\n=== errors ===', errors);
  await browser.close();
})();
