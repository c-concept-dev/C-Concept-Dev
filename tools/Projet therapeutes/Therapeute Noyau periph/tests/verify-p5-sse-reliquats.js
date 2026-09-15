// Priorité 5 (audit systémique) — simule un événement 'error' explicite en DERNIER fragment
// SANS retour à la ligne terminal (reliquat final), sur le parseur LEGACY (moteur principal) ET
// sur le parseur de CONTINUATION — confirme dans les deux cas que l'erreur remonte correctement
// (jamais avalée par le catch de JSON.parse). Confirme aussi la non-perte d'un dernier
// text_delta légitime dans le reliquat de continuation (bug distinct, même zone).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseNoTrailingNewline(events) {
  // Construit un flux SSE dont le TOUT DERNIER événement n'est PAS suivi de \n\n — reproduit
  // exactement le reliquat qui reste dans sseBuffer/contBuffer après le découpage sur '\n'.
  return events.map(e => 'data: ' + JSON.stringify(e)).join('\n\n');
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // ══════════════════════════════════════════════════════════════════════
  // TEST 1 — reliquat final du moteur LEGACY (boucle principale de adocSend), événement
  // 'error' en dernier fragment sans '\n' terminal.
  // ══════════════════════════════════════════════════════════════════════
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyStr = req.postData() || '';
      let parsed = {};
      try { parsed = JSON.parse(bodyStr); } catch (e) {}
      const p = parsed.payload || {};
      const userMsg = (p.messages && p.messages[0] && p.messages[0].content) || '';
      if (typeof userMsg === 'string' && userMsg.startsWith('DEMANDE DU THÉRAPEUTE')) {
        route.fulfill({ status: 500, body: 'fail' }); // fail-open clarté
        return;
      }
      if (typeof p.system === 'string' && p.system.includes('TÂCHE — Analyser la demande')) {
        const plan = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null,
          intent: 'chat', clinical_intent: 'chat', output_format: 'chat', audience_type: 'praticien',
          topic_summary: 'test p5', max_tokens: 1000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      // Génération legacy principale (tool_choice:'auto', pas de tool_choice.name précis) —
      // reliquat final = un événement 'error' EXPLICITE, jamais suivi de '\n\n'.
      if (p.tools && p.tool_choice && p.tool_choice.type === 'auto') {
        const events = [
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Début de réponse. ' } },
          { type: 'error', error: { type: 'overloaded_error', message: 'Service Anthropic surchargé (simulation P5).' } },
        ];
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseNoTrailingNewline(events) });
        return;
      }
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const legacyResult = await page.evaluate(async () => {
    const input = document.getElementById('adoc-input');
    input.value = 'Question simple sans RAG';
    await window.adocSend();
    await new Promise(r => setTimeout(r, 100));
    const messages = [...document.querySelectorAll('#adoc-messages > *')].map(el => el.textContent);
    return { lastMessages: messages.slice(-2), btnDisabled: document.getElementById('adoc-send-btn').disabled };
  });
  console.log('=== Test 1 — reliquat final LEGACY, événement error en dernier fragment sans \\n ===');
  console.log(legacyResult);
  console.log('=> L\'erreur remonte bien à l\'utilisatrice (jamais avalée silencieusement), message "Erreur :" affiché:',
    legacyResult.lastMessages.some(m => m.includes('Erreur') && m.includes('overloaded') || m.includes('Erreur : Stream error')));
  console.log('=> Interface débloquée malgré l\'erreur:', legacyResult.btnDisabled === false);

  // ══════════════════════════════════════════════════════════════════════
  // TEST 2 — reliquat final de la CONTINUATION (adocRunContinuationRound), même bug pattern.
  // ══════════════════════════════════════════════════════════════════════
  const contErrorResult = await page.evaluate(async () => {
    const streamMsgId = 'p5-cont-error-test';
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    msgEl.innerHTML = '<div class="adoc-bubble"></div>';
    document.body.appendChild(msgEl);

    const origFetch = window.fetch;
    window.fetch = async () => {
      const events = [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Suite partielle. ' } },
        { type: 'error', error: { type: 'api_error', message: 'Erreur API simulée (P5, continuation).' } },
      ];
      const body = events.map(e => 'data: ' + JSON.stringify(e)).join('\n\n'); // pas de \n final
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };

    // adocRunContinuationRound n'est pas exposée sur window — testée via adocContinueGeneration
    // (exposée), qui l'appelle réellement en interne.
    window._adocPendingContinuations[streamMsgId] = {
      workerUrl: 'https://fake', MODEL: 'x', systemPrompt: 's', contBaseMessages: [], reply: 'Début. ',
      plan: { intent: 'fiche' }, ragResult: { chunks: [] }, round: 0, busy: false, fellBackFromStructured: false,
    };
    let threw = false;
    try { await window.adocContinueGeneration(streamMsgId); } catch (e) { threw = true; }
    window.fetch = origFetch;

    const stillPending = !!window._adocPendingContinuations[streamMsgId];
    return { threw, finalHtml: msgEl.innerHTML, stillPending };
  });
  console.log('\n=== Test 2 — reliquat final CONTINUATION, événement error en dernier fragment sans \\n ===');
  console.log(contErrorResult);
  console.log('=> adocRunContinuationRound gère l\'erreur en interne (return, pas de throw — comportement établi), aucune fuite:', contErrorResult.threw === false);
  console.log('=> Le contenu reçu AVANT l\'erreur ("Suite partielle.") reste visible (résilience déjà établie, non régressée):', contErrorResult.finalHtml.includes('Suite partielle'));

  // ══════════════════════════════════════════════════════════════════════
  // TEST 3 — reliquat final de la CONTINUATION, dernier text_delta LÉGITIME (pas une erreur)
  // perdu si le flux se ferme sans '\n' terminal — bug distinct corrigé dans ce même lot.
  // ══════════════════════════════════════════════════════════════════════
  const contLostFragmentResult = await page.evaluate(async () => {
    const streamMsgId = 'p5-cont-lastfrag-test';
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    msgEl.innerHTML = '<div class="adoc-bubble"></div>';
    document.body.appendChild(msgEl);

    const origFetch = window.fetch;
    window.fetch = async () => {
      const events = [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Début de la suite. ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'DERNIER FRAGMENT JAMAIS PERDU.' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      ];
      // Le TOUT dernier événement (message_delta, stop_reason) n'est jamais suivi de '\n\n' —
      // reproduit exactement le reliquat contBuffer non traité avant ce correctif.
      const body = events.map(e => 'data: ' + JSON.stringify(e)).join('\n\n');
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };

    window._adocPendingContinuations[streamMsgId] = {
      workerUrl: 'https://fake', MODEL: 'x', systemPrompt: 's', contBaseMessages: [], reply: '',
      plan: { intent: 'fiche' }, ragResult: { chunks: [] }, round: 0, busy: false, fellBackFromStructured: false,
    };
    await window.adocContinueGeneration(streamMsgId);
    window.fetch = origFetch;
    return { finalHtml: msgEl.innerHTML, stillPending: !!window._adocPendingContinuations[streamMsgId] };
  });
  console.log('\n=== Test 3 — reliquat final CONTINUATION, dernier text_delta légitime (pas une erreur) ===');
  console.log(contLostFragmentResult);
  console.log('=> Le texte du DERNIER fragment (resté dans contBuffer sans \\n final) n\'est plus perdu:',
    contLostFragmentResult.finalHtml.includes('DERNIER FRAGMENT JAMAIS PERDU'));
  console.log('=> stop_reason (end_turn) du reliquat traité — plus de suite en attente (finalisée normalement):', contLostFragmentResult.stillPending === false);

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
