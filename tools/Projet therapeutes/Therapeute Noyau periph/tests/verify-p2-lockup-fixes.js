// Priorité 2 (audit systémique) — confirme que 3 chemins distincts déverrouillent bien
// adocThinking + le bouton d'envoi : (1) document long réussi (return sauté auparavant), (2)
// exception dans adocContinueGeneration, (3) exception dans adocKeepAsIs. Simule directement
// l'état interne (adocThinking, boutons, window._adocPendingContinuations) pour isoler
// précisément le comportement de verrouillage, sans dépendre d'un vrai flux réseau complet.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.continue());
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  // ── 1. Document long réussi : le `return` après adocLongDoc(...) sautait le nettoyage
  //    commun (adocThinking, bouton). Pipeline RÉEL exercé (planner + clarté + adocSend), seuls
  //    adocLongDoc (nested, lourd) et l'appel réseau de clarté (fail-open déjà existant si
  //    indisponible) sont substitués — exactement le patron déjà établi dans ce projet
  //    (verify-longdoc2.js appelle aussi adocLongDoc directement avec fetch mocké). ──
  const r1 = await page.evaluate(async () => {
    document.getElementById('adoc-send-btn').disabled = false;
    window.adocLongDoc = async () => 'DOCUMENT LONG MOCK (test P2.1)';
    window.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const payload = (body && body.payload) || {};
      const userMsg = (payload.messages && payload.messages[0] && payload.messages[0].content) || '';
      // Appel de clarté (adocEvaluateClarity) — échec délibéré : comportement fail-open déjà
      // établi (catch dans adocRunClarityGate), enchaîne directement sur adocSendOriginal().
      if (typeof userMsg === 'string' && userMsg.startsWith('DEMANDE DU THÉRAPEUTE')) {
        return new Response('Erreur simulée', { status: 500 });
      }
      // Appel planner (adocPlanQuery) — renvoie un plan qui déclenche _isLongDoc (intent
      // document, max_tokens>=4000 après le plancher à 8000 imposé par adocMultiPlan,
      // output_format hors pdf/docx/pptx/xlsx).
      if (typeof payload.system === 'string' && payload.system.includes('TÂCHE — Analyser la demande')) {
        const plan = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null,
          intent: 'document', clinical_intent: 'production', output_format: 'html-visual',
          audience_type: 'praticien', topic_summary: 'test p2', max_tokens: 5000 };
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }));
      }
      return new Response(JSON.stringify({}));
    };

    const input = document.getElementById('adoc-input');
    input.value = 'Fais-moi un document complet sur la restructuration cognitive';
    await window.adocSend();
    // Laisse toute micro-tâche encore en vol se résoudre (adocAutoSummarize/accumulate en
    // arrière-plan, marquées .catch(()=>{}) — sans rapport avec le verrouillage testé).
    await new Promise(r => setTimeout(r, 50));
    return {
      btnDisabledAfter: document.getElementById('adoc-send-btn').disabled,
      lastMessageHtml: document.getElementById('adoc-messages').lastElementChild ? document.getElementById('adoc-messages').lastElementChild.textContent : null,
    };
  });
  console.log('=== Test 1 — document long réussi (adocLongDoc mocké), pipeline réel adocSend ===');
  console.log(r1);
  console.log('=> Le bouton d\'envoi est réactivé après un document long réussi (plus jamais bloqué indéfiniment):', r1.btnDisabledAfter === false);

  // ── 2. adocContinueGeneration : exception dans adocRunContinuationRound doit quand même
  //    déverrouiller (try/finally). On remplace temporairement adocRunContinuationRound par une
  //    version qui lève, pour isoler exactement le comportement de verrouillage. ──
  const r2 = await page.evaluate(async () => {
    const streamMsgId = 'test-msg-p2-continue';
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    document.body.appendChild(msgEl);
    window._adocPendingContinuations[streamMsgId] = {
      workerUrl: 'https://fake', MODEL: 'x', systemPrompt: 's', contBaseMessages: [], reply: 'partiel',
      plan: { intent: 'fiche' }, ragResult: { chunks: [] }, round: 0, busy: false, fellBackFromStructured: false,
    };
    const sendBtn = document.getElementById('adoc-send-btn');
    sendBtn.disabled = false;

    // Remplace la fonction interne via un throw forcé : on ne peut pas la réassigner (portée
    // fermée), donc on simule l'exception EN AMONT en cassant volontairement fetch() pour cette
    // seule tentative — adocRunContinuationRound fera un fetch qui échoue, ce qui la fait
    // rejeter réellement (pas un throw synthétique déconnecté du vrai code).
    const origFetch = window.fetch;
    window.fetch = () => { throw new Error('Panne réseau simulée (test P2)'); };
    let threw = false;
    try {
      await window.adocContinueGeneration(streamMsgId);
    } catch (e) { threw = true; }
    window.fetch = origFetch;

    return {
      adocThinkingAfter: window.adocThinking !== undefined ? window.adocThinking : 'INCONNU (variable non exposée)',
      btnDisabledAfter: document.getElementById('adoc-send-btn').disabled,
      threwOutOfFunction: threw,
    };
  });
  console.log('=== Test 2 — adocContinueGeneration avec exception (fetch cassé) ===');
  console.log(r2);
  console.log('=> Le bouton d\'envoi est réactivé malgré l\'exception:', r2.btnDisabledAfter === false);
  console.log('=> Aucune exception ne fuit hors de adocContinueGeneration (catch interne):', r2.threwOutOfFunction === false);

  // ── 3. adocKeepAsIs : exception dans adocFinalizeGeneration doit quand même déverrouiller. ──
  const r3 = await page.evaluate(async () => {
    const streamMsgId = 'test-msg-p2-keepasis';
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    document.body.appendChild(msgEl);
    window._adocPendingContinuations[streamMsgId] = {
      workerUrl: 'https://fake', MODEL: 'x', systemPrompt: 's', contBaseMessages: [], reply: 'partiel',
      plan: { intent: 'fiche' }, ragResult: { chunks: [] }, round: 0, busy: false, fellBackFromStructured: false,
    };
    document.getElementById('adoc-send-btn').disabled = false;

    // adocFinalizeGeneration appelle adocHandleReply -> ... -> peut échouer si le DOM attendu
    // manque ; on force une exception franche et contrôlée en supprimant temporairement une
    // fonction dont adocFinalizeGeneration dépend nécessairement (adocHandleReply).
    const origHandleReply = window.adocHandleReply;
    window.adocHandleReply = undefined; // provoquera "adocHandleReply is not a function"
    let threw = false;
    try {
      await window.adocKeepAsIs(streamMsgId);
    } catch (e) { threw = true; }
    window.adocHandleReply = origHandleReply;

    return {
      btnDisabledAfter: document.getElementById('adoc-send-btn').disabled,
      threwOutOfFunction: threw,
    };
  });
  console.log('\n=== Test 3 — adocKeepAsIs avec exception (adocHandleReply cassé) ===');
  console.log(r3);
  console.log('=> Le bouton d\'envoi est réactivé malgré l\'exception:', r3.btnDisabledAfter === false);
  console.log('=> Aucune exception ne fuit hors de adocKeepAsIs (catch interne):', r3.threwOutOfFunction === false);

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
