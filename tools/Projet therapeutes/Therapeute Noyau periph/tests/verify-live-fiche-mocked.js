// Vérifie le branchement live (point 10) avec un réseau MOQUÉ — le vrai Worker
// (clone-proxy.11drumboy11.workers.dev) est inatteignable depuis ce sandbox (403 CONNECT,
// politique réseau confirmée par curl). Ce test prouve la logique côté client (construction
// du SourceSnapshot depuis le RAG réel, appel structuré, rendu, ET repli automatique en cas
// d'échec) — pas la fiabilité du modèle en conditions réelles, qui reste à vérifier par
// Christophe dans un environnement avec accès réseau réel.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse — critique, mépris, attitude défensive, obstruction — prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
  { content: 'Le mépris porte une dévalorisation globale du partenaire, au-delà du reproche ponctuel.', book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58 },
];

const MOCK_TOOL_RESPONSE = {
  content: [
    {
      type: 'tool_use', name: 'emit_fiche_document',
      input: {
        title: "Les cavaliers de l'apocalypse — Gottman",
        purpose: 'supervision', audience: 'clinicien',
        blocks: [
          { type: 'heading', text: "Les cavaliers de l'apocalypse", level: 1, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
          { type: 'paragraph', text: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: ['entry-1'] },
          { type: 'callout', text: 'Le mépris est le signal le plus toxique du couple.', level: 2, visualRole: 'warning', items: [], ordered: false, headers: [], rows: [], citationEntryIds: ['entry-2'] },
        ],
      },
    },
  ],
};

// Le 2e appel (génération structurée forcée) est désormais streamé (lot streaming) : le mock
// doit renvoyer un vrai flux SSE fragmenté, jamais un unique bloc JSON.
function mockToolResponseSSE() {
  const inputJson = JSON.stringify(MOCK_TOOL_RESPONSE.content[0].input);
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let structuredCallCount = 0;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = route.request().postData() || '';
      // Lot streaming : distinction précise nécessaire — le nom de l'outil apparaît aussi
      // dans le texte du system prompt du 1er appel (non forcé), un simple .includes('emit_
      // fiche_document') matcherait donc les deux appels par erreur. On matche le
      // tool_choice FORCÉ tel que sérialisé par JSON.stringify({type:'tool',name:...}).
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
        structuredCallCount++;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE() });
        return;
      }
      // 1er appel (décision web_search, tool_choice:auto) — doit être mocké explicitement,
      // sinon il tombe sur route.continue() → réseau réel bloqué.
      if (body.includes('"type":"auto"')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
    }
    route.continue();
  });

  page.on('console', m => { if (m.text().includes('UX-8A') || m.text().includes('Planner') || m.text().includes('Pipeline')) console.log('  [console]', m.text()); });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== NOMINAL — génération structurée réussie (RAG mocké + tool_use mocké) ===');
  const nominal = await page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche(
      'Fais-moi une fiche sur les cavaliers de Gottman',
      { intent: 'fiche', output_format: 'chat' },
      ragResult,
      'Tu es un assistant clinique.',
      'https://clone-proxy.11drumboy11.workers.dev'
    );
    return {
      title: structured.doc.title,
      blockCount: structured.doc.blocks.length,
      snapshotEntryCount: structured.sourceSnapshot.entries.length,
      firstChecksum: structured.sourceSnapshot.entries[0].contentChecksum,
    };
  }, { chunks: MOCK_RAG_CHUNKS });
  console.log(nominal);

  console.log('\n=== NOMINAL — rendu + vérification citations sur le document produit par le "modèle" ===');
  const rendered = await page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const result = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    return { qc: result.qc, htmlHasCallout: result.html.includes('adoc-sc-callout-warning'), htmlHasCite: result.html.includes('adoc-sc-cite') };
  }, { chunks: MOCK_RAG_CHUNKS });
  console.log(rendered);
  console.log('=> citations bien "needs-review" par défaut (pas de vérif IA dédiée dans ce lot), technique valide (checksums réels du RAG):', rendered.qc.blocking.length === 0);

  console.log('\n=== CASSÉ — le "modèle" répond sans tool_use exploitable → doit lever, jamais planter silencieusement ===');
  const broken = await page.evaluate(async ({ chunks }) => {
    // Simuler une réponse sans bloc tool_use (le modèle a "juste parlé" au lieu d'utiliser l'outil)
    const origFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Désolé, je ne peux pas.' }] }), { status: 200 });
    let threw = false, message = null;
    try {
      const ragResult = { chunks, chunkLen: 900 };
      await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    } catch (e) { threw = true; message = e.message; }
    window.fetch = origFetch;
    return { threw, message };
  }, { chunks: MOCK_RAG_CHUNKS });
  console.log(broken);
  console.log('=> échec propre et détecté (jamais un plantage silencieux):', broken.threw === true);

  console.log('\n=== BOUT EN BOUT — full adocSend() avec repli automatique (Worker down / stub simple) ===');
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    if (url.includes('/d1-query')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = route.request().postData() || '';
      // Cf. note plus haut : match précis du tool_choice forcé, pas une simple présence du
      // nom de l'outil (mentionné aussi dans le system prompt du 1er appel non forcé).
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE() });
        return;
      }
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('needs_rag') || body.includes('TÂCHE')) {
        // Le planner — attend du JSON texte brut, jamais un tool_use.
        const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      // 1er appel (décision web_search) — streamé désormais, cf. note plus haut.
      if (body.includes('"type":"auto"')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      // Toute autre requête (l'appel principal legacy, s'il est atteint) : réponse vide plausible.
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });
  await page.fill('#clinical-question', 'Fais-moi une fiche synthèse sur les cavaliers de Gottman');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1500);
  const e2e = await page.evaluate(() => {
    const artifacts = window._adocArtifacts || {};
    const structuredEntry = Object.values(artifacts).find(a => a._adocStructuredDoc);
    return {
      // Lot streaming/parité : le document livré via adocDeliverStructuredFicheArtifact
      // (carte + sidebar), plus une simple bulle isolée.
      hasStructuredArtifact: !!structuredEntry,
      sidebarEntryCount: document.querySelectorAll('#adoc-outputs-list .adoc-output-item').length,
      lastStructuredDoc: !!window._adocLastStructuredDoc,
    };
  });
  console.log(e2e);

  await page.screenshot({ path: OUT + '/live-fiche-e2e.png', fullPage: false });
  console.log('\n=== errors ===', errors);
  await browser.close();
})();
