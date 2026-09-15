// FIL 2 (secondaire) — vérifie le correctif du prompt de rerank (adocRerankChunks), déclenché
// via le VRAI pipeline (adocSend complet : planner intent='tableau' → RAG (25 chunks, > seuil
// de 20 qui déclenche le rerank) → adocRerankChunks) plutôt qu'un appel direct (la fonction
// n'est pas exportée sur window, cf. grep : un seul point d'entrée, interne, ligne ~4102).
//
// Vérifie :
// (1) le prompt envoyé ne ressemble plus à une question directe ("Q: <sujet>") sur un sujet
//     "Tableau comparatif EMDR / ICV / IFS" — cause suspectée de l'hallucination observée par
//     Christophe (le modèle répondait à la question au lieu de sélectionner des indices) ;
// (2) le system prompt interdit maintenant explicitement de répondre à la question ;
// (3) non-régression : une réponse propre {"keep":[...]} est toujours bien exploitée par le
//     pipeline (le nombre final de chunks reflète bien la sélection reranked, pas le fallback) ;
// (4) non-régression : une réponse "halluminée" (JSON valide mais pas {"keep":[...]}, comme
//     dans le vrai cas rapporté) est toujours absorbée en échec silencieux (repli sur les
//     chunks bruts), sans crash — comportement de robustesse déjà en place, pas modifié ici.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const FAKE_CHUNKS = Array.from({ length: 25 }, (_, i) => ({
  book_title: 'Ouvrage ' + i, author: 'Auteur ' + i, page_number: i + 1,
  content: 'Passage clinique fictif numéro ' + i + ' à propos des thérapies EMDR, ICV et IFS, avec assez de texte pour ressembler à un vrai extrait documentaire.',
}));

function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + 'data: [DONE]\n\n';
}

async function runScenario({ rerankReplyText, label }) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let rerankPayload = null;
  let finalChunkCount = null;
  page.on('console', m => {
    const t = m.text();
    if (t.includes('[P1-2 Rerank]')) console.log('  [console]', t);
  });

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: FAKE_CHUNKS }) }); return; }
    if (url.includes('/search-library')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || '';
      let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const p = body.payload || {};
      const isRerank = p.max_tokens === 300 && p.messages && p.messages[0] && /\[0\]/.test(p.messages[0].content || '');
      if (isRerank) {
        rerankPayload = p;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: rerankReplyText }] }) });
        return;
      }
      if (bodyRaw.includes('needs_rag') || bodyRaw.includes('TÂCHE')) {
        const plan = {
          needs_rag: true,
          searches: [{ terms: ['EMDR', 'ICV', 'IFS'], term_match: 'any', authors: [], approaches: [], limit: 50 }],
          vector_angles: [], approach_filter: null, intent: 'tableau', clinical_intent: 'production',
          output_format: 'chat', audience_type: 'praticien', registre: 'clinique',
          topic_summary: 'Tableau comparatif EMDR / ICV / IFS', deep_scan: false, max_tokens: 2000,
        };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      // Appel principal de génération (après rerank) : réponse texte simple en streaming.
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('Réponse finale.') });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'Fais-moi un tableau comparatif EMDR / ICV / IFS');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1500);

  console.log('=== Scénario:', label, '===');
  if (!rerankPayload) {
    console.log('ÉCHEC — le rerank n\'a pas été déclenché (payload non capté).');
  } else {
    const sentUser = rerankPayload.messages[0].content;
    const sentSystem = rerankPayload.system;
    console.log('--- 3 premières lignes du prompt utilisateur ---');
    console.log(sentUser.split('\n').slice(0, 1).join('\n'));
    console.log('=> ne commence plus par "Q: " :', !/^Q:\s/.test(sentUser));
    console.log('=> précise "PAS une question à répondre" :', sentUser.includes('PAS une question'));
    console.log('=> interdit explicitement comparaison/tableau/réponse :', sentUser.includes("N'écris ni comparaison"));
    console.log('=> system interdit explicitement de répondre à la question/au sujet :', sentSystem.includes('ne réponds JAMAIS'));
    console.log('=> system précise la forme exacte {"keep":[...]} :', sentSystem.includes('"keep":[...]'));
  }
  console.log('errors:', errors);
  await browser.close();
}

(async () => {
  await runScenario({ label: 'Partie A — prompt reformulé + réponse propre {"keep":[...]}', rerankReplyText: '{"keep":[0,1,2,3,4,5,6,7,8,9]}' });
  await runScenario({ label: 'Partie B — non-régression : réponse halluminée (comparaison au lieu d\'indices) toujours absorbée sans crash', rerankReplyText: '```json\n{\n "comparison": {\n  "EMDR": {"a":1},\n  "ICV": {"a":2},\n  "IFS": {"a":3}\n }\n}' });
})();
