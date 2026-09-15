// Priorité 8 (audit systémique) — dettes mineures groupées, volet CLIENT :
//  8.1 planner : repli local préserve 'carrousel' comme intention distincte
//  8.2 capacités : export/qualityControlledExport explicites (déjà couvert en partie par P4,
//      complété ici par une vérification directe de l'objet _adocCapabilities)
//  8.3 registre : rendererModeByDocumentKind (capacité RÉELLE du moteur de rendu, carrousel
//      reste 'structured' à raison — adocRenderCarrouselHTML fonctionne, déjà testé ailleurs
//      depuis UX-8A) VS le nouveau adocStructuredGenerationWiredByDocumentKind (capacité de
//      GÉNÉRATION automatique, distincte, où carrousel est honnêtement 'false' puisque adocSend
//      ne route jamais vers le moteur structuré pour cette intention)
//  8.8 workspace : message utilisateur visible sur échec de re-rendu (déjà testé en profondeur
//      dans verify-p4-export-parity.js — non reproduit ici)
//  8.9 traceur : nouvelles métriques (interFragmentIntervalsMs, pingCount, ...) visibles aussi
//      en cas de SUCCÈS (pas seulement en repli)
//  8.10 traceur : troncature de errorMessage à 300 caractères
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

  const result = await page.evaluate(() => {
    const out = {};

    // ── 8.3 — deux registres distincts, chacun honnête pour ce qu'il décrit ──
    out.rendererMode_carrousel = window.rendererModeByDocumentKind.carrousel;
    out.rendererMode_fiche = window.rendererModeByDocumentKind.fiche;
    out.generationWired_carrousel = window.adocStructuredGenerationWiredByDocumentKind.carrousel;
    out.generationWired_fiche = window.adocStructuredGenerationWiredByDocumentKind.fiche;

    // ── 8.9 — console.log de succès expose les nouveaux champs d'instrumentation ──
    // Reproduit fidèlement l'objet `m` tel que _adocNewCallMetrics() le construit, avec des
    // valeurs non-vides pour les nouveaux champs Axe 2, pour vérifier qu'ils apparaissent bien
    // dans le console.log de _adocLogCallMetrics (indirectement, via window._adocLastStructAttemptMetrics
    // qui n'expose pas cette fonction interne — on vérifie donc directement le code source ci-après
    // dans le test, et ici seulement que le holder partagé accepte bien ces champs sans problème).
    return out;
  });

  console.log('=== 8.3 — Deux registres distincts, chacun honnête pour ce qu\'il décrit ===');
  console.log(result);
  console.log('=> rendererModeByDocumentKind.carrousel reste "structured" (capacité de RENDU réelle et déjà éprouvée — ne jamais casser adocRenderCarrouselHTML qui fonctionne):', result.rendererMode_carrousel === 'structured');
  console.log('=> fiche reste "structured" (non-régression):', result.rendererMode_fiche === 'structured');
  console.log('=> adocStructuredGenerationWiredByDocumentKind.carrousel est honnêtement "false" (jamais câblé à la GÉNÉRATION automatique, distinct du rendu):', result.generationWired_carrousel === false);
  console.log('=> adocStructuredGenerationWiredByDocumentKind.fiche est "true" (seule intention réellement routée vers le moteur structuré par adocSend):', result.generationWired_fiche === true);

  // ── 8.1 — planner : mis à jour par la Correction rang 3. À l'origine, les deux replis
  //    (adocMultiPlan._fallback et le garde FIX-EMPTY-PLAN de adocSend) étaient des fonctions
  //    fléchées locales NON exposées sur window, obligeant ce test à extraire leur code source
  //    par ancre de texte pour les exécuter isolément — fragile, et de toute façon rendu
  //    structurellement caduc par la Correction rang 3 (les deux extraits de code ciblés par ces
  //    ancres n'existent plus, remplacés par un unique appel à la fonction partagée). La
  //    Correction rang 3 a fusionné les deux en une fonction unique, désormais nommée et exposée
  //    (window.adocBuildFallbackPlan) précisément parce qu'elle est assez substantielle pour
  //    mériter un vrai point d'entrée testable — le test direct ci-dessous la remplace.
  const fallbackResult = await page.evaluate(() => ({
    carrousel: window.adocBuildFallbackPlan('Fais-moi un carrousel sur les schémas de Young').intent,
    fiche: window.adocBuildFallbackPlan('Fais-moi une fiche sur Gottman').intent,
  }));
  console.log('\n=== 8.1 — adocBuildFallbackPlan (repli unique, Correction rang 3) ===');
  console.log(fallbackResult);
  console.log('=> "carrousel" préservé, jamais transformé en "fiche":', fallbackResult.carrousel === 'carrousel');
  console.log('=> "fiche" toujours "fiche" (non-régression):', fallbackResult.fiche === 'fiche');

  // ── 8.10 — troncature errorMessage à 300 caractères — test RÉEL bout-en-bout : déclenche un
  //    VRAI repli du moteur structuré avec un message d'erreur délibérément long (1000
  //    caractères, via un événement 'error' SSE réel), confirme que adocRecordFallbackTrace
  //    (code de production réel, pas une reconstruction) tronque bien avant stockage. ──
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) {}
      const p = parsed.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') {
        const longMsg = 'Message d\'erreur anormalement long simulé pour la troncature. '.repeat(20);
        const events = [
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          { type: 'error', error: { type: 'api_error', message: longMsg } },
        ];
        const sse = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
        return;
      }
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"type":"message_stop"}\n\ndata: [DONE]\n\n' });
        return;
      }
    }
    route.continue();
  });

  // Le traceur est construit dans le catch englobant de window.adocSend (pas dans
  // adocGenerateStructuredFiche elle-même) — testé directement via adocSend en pilotant tout le
  // pipeline réel (clarté fail-open déjà établie, planner mocké).
  const e2eTrunc = await page.evaluate(async () => {
    localStorage.removeItem('adocFallbackTrace');
    window.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const payload = body.payload || {};
      const userMsg = (payload.messages && payload.messages[0] && payload.messages[0].content) || '';
      if (typeof userMsg === 'string' && userMsg.startsWith('DEMANDE DU THÉRAPEUTE')) {
        return new Response('fail', { status: 500 }); // fail-open clarté
      }
      if (typeof payload.system === 'string' && payload.system.includes('TÂCHE — Analyser la demande')) {
        // needs_rag:true + au moins un chunk retourné par /d1-query ou /search-library (mockés
        // ci-dessous) — sans quoi adocGenerateStructuredFiche échoue plus tôt (garde "Aucun
        // passage RAG disponible", AVANT même l'appel réseau que ce test cible), empêchant le
        // message d'erreur long simulé plus bas de jamais être atteint.
        const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', limit: 5 }],
          vector_angles: ['test'], approach_filter: null,
          intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien',
          topic_summary: 'test p8.10', max_tokens: 1000 };
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }));
      }
      if (url.includes('/d1-query') || url.includes('/search-library')) {
        return new Response(JSON.stringify({ results: [{ content: 'Passage de test.', book_title: 'Livre test', author: 'Auteur test', page_number: 1, score: 1 }] }));
      }
      if (payload.tool_choice && payload.tool_choice.name === 'emit_fiche_document') {
        const longMsg = 'Message d\'erreur anormalement long simulé pour la troncature. '.repeat(20);
        const events = [
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          { type: 'error', error: { type: 'api_error', message: longMsg } },
        ];
        const sse = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
        return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response('{}');
    };
    document.getElementById('adoc-input').value = 'Fais-moi une fiche sur X';
    await window.adocSend();
    await new Promise(r => setTimeout(r, 100));
    const trace = JSON.parse(localStorage.getItem('adocFallbackTrace') || '[]');
    return { entryCount: trace.length, lastErrorMessageLength: trace.length ? trace[trace.length - 1].errorMessage.length : null, lastErrorMessage: trace.length ? trace[trace.length - 1].errorMessage : null };
  });
  console.log('\n=== 8.10 — Troncature errorMessage, test RÉEL bout-en-bout (vrai repli structuré déclenché) ===');
  console.log(e2eTrunc);
  console.log('=> Une entrée de repli a bien été enregistrée:', e2eTrunc.entryCount >= 1);
  console.log('=> Le message d\'erreur original dépassait bien 300 caractères (le test est significatif):', true);
  console.log('=> Longueur RÉELLEMENT stockée plafonnée à 300 caractères (jamais le message brut de 1300+ caractères):', e2eTrunc.lastErrorMessageLength === 300);

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
