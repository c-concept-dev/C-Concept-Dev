// CORRECTIF PRÉCIS — vérifie que searchDecisionSystemPrompt (1er appel) ne dépend plus DU TOUT
// de `systemPrompt` (qui embarque le texte intégral RAG via adocBuildRAGCtx), sur un scénario
// RÉALISTE (25 passages fictifs, pas 2) — pour que l'écart avant/après ait un sens à l'échelle
// réelle. Passe par le VRAI pipeline (adocSend() complet : planner → RAG (/d1-query) →
// adocBuildSystemPrompt) plutôt qu'un system prompt fabriqué à la main, pour mesurer la taille
// RÉELLE produite par le code de production, pas une approximation.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

// 25 passages fictifs, livres distincts (pas de plafond par livre), ~500 caractères chacun
// (CHUNK_LEN réel pour l'intent 'fiche' dans adocExecutePlan).
const FAKE_CHUNKS = Array.from({ length: 25 }, (_, i) => ({
  book_title: 'Ouvrage clinique fictif n°' + (i + 1),
  author: 'Auteur ' + (i + 1),
  page_number: 10 + i,
  content: ('Passage clinique fictif numéro ' + (i + 1) + ' — ').padEnd(60, 'x') +
    ' Ce passage décrit en détail un mécanisme thérapeutique représentatif, avec suffisamment ' +
    'de texte pour approcher la longueur réelle des extraits RAG utilisés en production (environ ' +
    'cinq cents caractères par passage), afin que la mesure avant/après soit réaliste et non ' +
    'artificiellement petite comme dans un test à seulement deux passages. Fin du passage ' + (i + 1) + '.',
}));

function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + 'data: [DONE]\n\n';
}
function toolResponseSSE(input) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }) + 'data: [DONE]\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let call1Payload = null, call2Payload = null;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    if (url.includes('/d1-query')) {
      // Renvoie les 25 passages fictifs pour toute requête D1 (recherche structurée ET sweep
      // éventuel) — dédupliqués par adocExecutePlan (book_title+contenu), donc le total final
      // reste borné à 25 quel que soit le nombre d'appels /d1-query déclenchés.
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: FAKE_CHUNKS }) });
      return;
    }
    if (url.includes('/search-library')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || '';
      let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const isSearch = body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
      const isStructured = body.payload && body.payload.tool_choice && body.payload.tool_choice.name === 'emit_fiche_document';
      if (isSearch) {
        call1Payload = body.payload;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      if (isStructured) {
        call2Payload = body.payload;
        const input = { title: 'Fiche test', purpose: 'psychoéducation', audience: 'clinicien', blocks: [
          { type: 'heading', text: 'Titre', level: 1, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
          { type: 'paragraph', text: 'Contenu valide et complet.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
        ] };
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE(input) });
        return;
      }
      const bodyStr = bodyRaw;
      if (bodyStr.includes('needs_rag') || bodyStr.includes('TÂCHE')) {
        // Le planner — attend du JSON texte brut. intent:'fiche' → MAX_CHUNKS=50 dans
        // adocExecutePlan (le plafond réel de production pour ce pilote).
        const plan = {
          needs_rag: true,
          searches: [{ terms: ['gottman', 'couple', 'mépris', 'attachement', 'schéma'], term_match: 'any', authors: [], approaches: [], limit: 50 }],
          vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production',
          output_format: 'chat', audience_type: 'praticien', registre: 'clinique',
          topic_summary: 'synthèse clinique sur les dynamiques de couple', deep_scan: false, max_tokens: 2000,
        };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  const pipelineLogs = [];
  page.on('console', m => { if (m.text().includes('[RAG') || m.text().includes('[Pipeline')) pipelineLogs.push(m.text()); });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'Fais-moi une fiche synthèse complète sur les dynamiques de couple selon Gottman');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(2000);

  console.log('=== Logs pipeline (nombre réel de chunks RAG intégrés) ===');
  pipelineLogs.forEach(l => console.log(' ', l));

  if (!call1Payload || !call2Payload) {
    console.log('ÉCHEC — un des deux appels structurés n\'a pas été capté.', { call1: !!call1Payload, call2: !!call2Payload });
  } else {
    const call1Size = call1Payload.system.length;
    const call2Size = call2Payload.system.length;
    console.log('\n=== Mesure réelle (scénario 25 passages fictifs, ~500 car. chacun) ===');
    console.log('taille system prompt appel 1 (décision web_search) :', call1Size, 'caractères');
    console.log('taille system prompt appel 2 (génération complète) :', call2Size, 'caractères');
    console.log('ratio appel1/appel2 :', (call1Size / call2Size * 100).toFixed(1) + '%');
    console.log('=> appel 1 NE contient AUCUN passage RAG intégral (aucun extrait fictif présent):',
      !FAKE_CHUNKS.some(c => call1Payload.system.includes(c.content.slice(0, 80))));
    console.log('=> appel 1 NE contient PAS systemPrompt (aucune trace du bandeau BIBLIOTHÈQUE DOCUMENTAIRE):',
      !call1Payload.system.includes('BIBLIOTHÈQUE DOCUMENTAIRE'));
    console.log('=> appel 1 contient bien les titres des ouvrages (résumé minimal) :',
      call1Payload.system.includes('Ouvrage clinique fictif n°1'));
    console.log('=> appel 2 contient bien le texte intégral des passages (nécessaire à la génération) :',
      FAKE_CHUNKS.some(c => call2Payload.system.includes(c.content.slice(0, 80))));
    console.log('=> appel 1 sensiblement et réellement plus léger que appel 2 (à cette échelle) :', call1Size < call2Size * 0.5);
  }

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
