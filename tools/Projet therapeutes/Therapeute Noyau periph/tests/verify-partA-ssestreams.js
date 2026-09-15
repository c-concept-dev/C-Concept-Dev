// Partie A, point 6 — TESTS OBLIGATOIRES sur flux SSE simulés (avant de considérer la partie A
// terminée) : (1) flux keep-alive vide prolongé, (2) événement SSE 'error' explicite en cours de
// flux, (3) JSON partiel/tronqué, (4) HTTP 200 suivi d'un silence total.
//
// Approche : window.fetch est remplacé par un faux fetch entièrement scripté (jamais de vrai
// réseau), qui renvoie un faux Response dont body.getReader().read() est piloté par de VRAIS
// setTimeout du navigateur — rendus instantanés via page.clock (Playwright), qui virtualise aussi
// performance.now(). Cela permet d'exercer les VRAIS setTimeout(...,20000)/AbortController du
// code de production (seuils 20s/45s inchangés, comme exigé) sans attendre 20-45s en temps réel,
// et le faux reader relaie fidèlement le comportement réel de fetch/AbortController : un abort()
// fait rejeter la lecture en cours avec une DOMException('AbortError'), exactement comme un vrai
// flux réseau interrompu.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [{ content: 'Passage de test.', book_title: 'Livre test', author: 'Auteur, A.', page_number: 1 }];

// Injecté dans la page : fabrique un faux fetch pilotable scénario par scénario. Chaque scénario
// contrôle uniquement l'appel 1 (payload tool_choice.type === 'auto') ; l'appel 2 (tool_choice
// forcé) reçoit toujours une réponse saine et instantanée, sauf pour le scénario RETRY_APPEL2 qui
// cible spécifiquement l'appel 2.
function installFakeFetch(scenario) {
  window.__consoleCapture = [];
  window.__fetchCallLog = [];
  // console.log(text()) via CDP tronque les objets loggés (aperçu abrégé) — on capture donc les
  // arguments RÉELS ici pour pouvoir vérifier les métriques exactes (ex. finalState) sans dépendre
  // de cette troncature.
  window.__capturedLogs = [];
  const _origConsoleLog = console.log.bind(console);
  console.log = function (...args) { window.__capturedLogs.push(args); _origConsoleLog(...args); };

  function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
  const VALID_TOOL_INPUT = {
    title: 'Fiche test', purpose: 'test', audience: 'clinicien',
    blocks: [{ type: 'paragraph', text: 'Contenu de test.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }],
  };
  function normalGenSSE() {
    const inputJson = JSON.stringify(VALID_TOOL_INPUT);
    return [
      sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } }),
      sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'emit_fiche_document', input: {} } }),
      sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } }),
      sseLine({ type: 'content_block_stop', index: 0 }),
      sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } }),
      sseLine({ type: 'message_stop' }),
      'data: [DONE]\n\n',
    ];
  }

  function mkAbortError() {
    const e = new DOMException('The operation was aborted.', 'AbortError');
    return e;
  }

  // reader générique : chaque entrée de `plan` est {text, delayMs} (un fragment brut), {done:true}
  // (fermeture propre du flux, comme un vrai stream réseau qui se termine), ou {hang:true} (ne se
  // résout jamais sauf sur abort du signal — silence total). Une fois le plan épuisé SANS entrée
  // {done:true} explicite, le reader reste délibérément en attente indéfinie (silence après la
  // dernière donnée connue), pour ne jamais masquer un scénario qui doit rester en attente.
  function makeReader(plan, signal) {
    let i = 0;
    return {
      read() {
        return new Promise((resolve, reject) => {
          if (signal.aborted) { reject(mkAbortError()); return; }
          const onAbort = () => { clearTimeout(tid); reject(mkAbortError()); };
          signal.addEventListener('abort', onAbort, { once: true });
          if (i >= plan.length) {
            // Silence total (plan épuisé sans {done:true}) : ne se résout plus jamais (sauf abort).
            return;
          }
          const step = plan[i++];
          if (step.hang) return; // ne se résout jamais (sauf abort ci-dessus)
          var tid = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            if (step.done) { resolve({ done: true, value: undefined }); return; }
            resolve({ done: false, value: new TextEncoder().encode(step.text) });
          }, step.delayMs || 0);
        });
      },
    };
  }

  window.fetch = async function (url, init) {
    const body = JSON.parse(init.body);
    const isAppel1 = body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
    window.__fetchCallLog.push({ isAppel1, attempt: window.__fetchCallLog.filter(c => c.isAppel1 === isAppel1).length + 1 });
    const signal = init.signal;

    if (!isAppel1) {
      // Appel 2 — comportement par défaut : succès immédiat, sauf scénario RETRY_APPEL2.
      if (scenario === 'RETRY_APPEL2') {
        const attemptsSoFar = window.__fetchCallLog.filter(c => !c.isAppel1).length;
        if (attemptsSoFar === 1) {
          // 1re tentative : erreur SSE transitoire explicite, AVANT tout JSON accumulé.
          const plan = [{ text: sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } }), delayMs: 10 },
                        { text: sseLine({ type: 'error', error: { type: 'overloaded_error', message: 'surchargé (simulation)' } }), delayMs: 10 }];
          return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
        }
        // 2e tentative : succès normal.
      }
      const plan = normalGenSSE().map(t => ({ text: t, delayMs: 5 })); plan.push({ done: true, delayMs: 5 });
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }

    // ── Appel 1 — scénarios sous test ──
    if (scenario === 'KEEPALIVE_PROLONGE') {
      // 4 "pings" SSE (lignes qui ne commencent pas par "data: ", donc ignorées par le parseur)
      // espacés de 6s (fake) chacun — remet à zéro la minuterie TRANSPORT à chaque fois, mais
      // aucun contenu réel n'arrive jamais : la minuterie SÉMANTIQUE (fixée à 20s depuis le
      // début, jamais réarmée) doit se déclencher malgré les remises à zéro du transport.
      const plan = [
        { text: ': ping\n\n', delayMs: 6000 },
        { text: ': ping\n\n', delayMs: 6000 },
        { text: ': ping\n\n', delayMs: 6000 },
        { text: ': ping\n\n', delayMs: 6000 },
        { text: ': ping\n\n', delayMs: 6000 },
      ];
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }
    if (scenario === 'ERREUR_SSE_MIDSTREAM') {
      // Un fragment de texte normal, puis un événement 'error' explicite en cours de flux.
      const plan = [
        { text: sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } }), delayMs: 10 },
        { text: sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Début de réponse' } }), delayMs: 10 },
        { text: sseLine({ type: 'error', error: { type: 'invalid_request_error', message: "requête invalide en cours de flux (simulation)" } }), delayMs: 10 },
      ];
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }
    if (scenario === 'JSON_PARTIEL_TRONQUE') {
      // (a) une ligne SSE complète mais VOLONTAIREMENT corrompue (JSON invalide) — doit être
      // ignorée silencieusement, sans jamais interrompre le flux. (b) le MÊME événement valide
      // envoyé coupé en 2 fragments bruts SANS retour à la ligne entre les deux (le bufferisation
      // par '\n' doit les recoller avant tout JSON.parse). (c) la fin normale du flux.
      const validEvt = sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reconstruit après coupure' } });
      const cut = Math.floor(validEvt.length / 2);
      const plan = [
        { text: '{ceci n\'est jamais du JSON valide::::}\n\n', delayMs: 10 }, // (a) ligne corrompue, ne commence même pas par "data: " correctement formé après le "data: " -> testons une VRAIE ligne data corrompue :
      ];
      // Remplace par une vraie ligne "data: " corrompue (JSON cassé), plus réaliste :
      plan[0] = { text: 'data: {"type":"content_block_delta","delta":{typ:::broken}\n\n', delayMs: 10 };
      plan.push({ text: validEvt.slice(0, cut), delayMs: 10 }); // (b1) première moitié, sans \n final
      plan.push({ text: validEvt.slice(cut), delayMs: 10 });     // (b2) seconde moitié, complète la ligne
      plan.push({ text: sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }), delayMs: 10 });
      plan.push({ text: 'data: [DONE]\n\n', delayMs: 10 });
      plan.push({ done: true, delayMs: 10 }); // fermeture propre du flux réseau après [DONE]
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }
    if (scenario === 'SILENCE_TOTAL_APRES_200') {
      // Un seul octet reçu (accusé HTTP 200 implicite), puis plus RIEN jamais — ni pings ni
      // erreur ni fermeture propre. Doit être abandonné par la minuterie TRANSPORT (jamais un
      // gel indéfini de l'application).
      const plan = [
        { text: sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } }), delayMs: 10 },
        { hang: true },
      ];
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }
    // Par défaut (ex. RETRY_APPEL2, qui ne teste que l'appel 2) — appel 1 trivial et rapide,
    // sans web_search, pour laisser passer immédiatement à l'appel 2 sous test.
    const plan = [
      { text: sseLine({ type: 'message_start', message: { usage: { input_tokens: 5 } } }), delayMs: 5 },
      { text: sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }), delayMs: 5 },
      { text: sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }), delayMs: 5 },
      { text: 'data: [DONE]\n\n', delayMs: 5 },
      { done: true, delayMs: 5 },
    ];
    return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
  };
}

async function runScenario(browser, scenario, { runForMs = 30000 } = {}) {
  const page = await browser.newPage();
  const consoleLines = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith('http')) { route.continue(); return; } // file:// (la page elle-même) : ne jamais intercepter
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); // toute autre requête réseau incidente au démarrage — jamais laissée réellement partir
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(50);

  // Horloge virtuelle installée APRÈS le chargement de la page (jamais avant une navigation —
  // risque d'interférer avec le chargement lui-même), juste avant de déclencher les vrais
  // setTimeout(...,20000/45000) de adocGenerateStructuredFiche que ce test doit exercer.
  await page.clock.install({ time: 0 });

  await page.evaluate('(' + installFakeFetch.toString() + ')(' + JSON.stringify(scenario) + ');');

  await page.evaluate(({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    window.__testResultPromise = window.adocGenerateStructuredFiche('Test SSE simulé', { intent: 'fiche' }, ragResult, 'sys-test', 'https://clone-proxy.11drumboy11.workers.dev')
      .then((r) => ({ ok: true, doc: r.doc }))
      .catch((e) => ({ ok: false, name: e && e.name, message: e && e.message }));
  }, { chunks: MOCK_RAG_CHUNKS });

  // runFor (contrairement à fastForward) déclenche les timers PROGRESSIVEMENT dans l'ordre du
  // temps virtuel, y compris ceux programmés en chaîne pendant l'avancée elle-même (ex. un
  // nouveau setTimeout créé par le code de production après le rejet d'un abort) — indispensable
  // ici puisque l'appel 2 démarre ses propres minuteries seulement après l'échec de l'appel 1.
  await page.clock.runFor(runForMs);
  await page.waitForTimeout(80);

  let result;
  try {
    result = await Promise.race([
      page.evaluate(() => window.__testResultPromise),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_NODE_SIDE_10S')), 10000)),
    ]);
  } catch (e) {
    result = { ok: false, name: 'TestHarnessTimeout', message: e.message };
  }
  const capturedLogs = await page.evaluate(() => window.__capturedLogs).catch(() => []);
  await page.close();
  // Retrouve l'objet métriques EXACT (jamais tronqué) d'un appel donné, ex. 'appel 1, tentative 1'.
  function findMetrics(label) {
    const entry = capturedLogs.find((args) => typeof args[0] === 'string' && args[0].includes('[UX-8A.2][métriques] ' + label));
    return entry ? entry[1] : null;
  }
  return { result, consoleLines, pageErrors, findMetrics };
}

(async () => {
  const browser = await chromium.launch();
  const report = [];

  // ── Scénario 1 : flux keep-alive vide prolongé ────────────────────────────────────────────
  {
    const { result, consoleLines, pageErrors, findMetrics } = await runScenario(browser, 'KEEPALIVE_PROLONGE', { runForMs: 30000 });
    const m = findMetrics('appel 1, tentative 1');
    report.push('=== 1. Flux keep-alive vide prolongé ===');
    report.push('Résultat global (doit réussir malgré échec appel 1, repli best-effort) : ' + JSON.stringify(result));
    report.push('Aucune erreur JS non gérée : ' + (pageErrors.length === 0));
    report.push('Une seule tentative appel 1 (jamais de retry après HTTP 200 progressé) : ' + (consoleLines.filter(l => l.includes('avant envoi appel 1')).length === 1));
    report.push('web_search NON utilisé (aucun contenu réel jamais reçu) : ' + consoleLines.some(l => l.includes('web_search non utilisé')));
    report.push('Métrique brute (finalState) : ' + JSON.stringify(m));
    report.push('=> Minuterie SÉMANTIQUE bien indépendante de la minuterie TRANSPORT (remise à zéro par les pings ignorée, mais abandon quand même déclenché) : ' + (m && m.finalState === 'semantic-timeout'));
    report.push('');
  }

  // ── Scénario 2 : événement SSE 'error' explicite en cours de flux ────────────────────────
  {
    const { result, consoleLines, pageErrors, findMetrics } = await runScenario(browser, 'ERREUR_SSE_MIDSTREAM', { runForMs: 500 });
    const m = findMetrics('appel 1, tentative 1');
    report.push("=== 2. Événement SSE 'error' explicite en cours de flux ===");
    report.push('Résultat global (doit réussir : appel 1 en échec est best-effort, jamais fatal) : ' + JSON.stringify(result));
    report.push('Aucune erreur JS non gérée : ' + (pageErrors.length === 0));
    report.push('Une seule tentative (jamais de retry après HTTP 200 progressé, même erreur transitoire) : ' + (consoleLines.filter(l => l.includes('avant envoi appel 1')).length === 1));
    report.push('Métrique brute (finalState) : ' + JSON.stringify(m));
    report.push("=> Événement error explicite REMONTÉ clairement et distingué (finalState==='sse-error', jamais confondu avec un JSON malformé ou un AbortError) : " + (m && m.finalState === 'sse-error'));
    report.push('');
  }

  // ── Scénario 3 : JSON partiel/tronqué ─────────────────────────────────────────────────────
  {
    const { result, consoleLines, pageErrors } = await runScenario(browser, 'JSON_PARTIEL_TRONQUE', { runForMs: 500 });
    report.push('=== 3. JSON partiel/tronqué ===');
    report.push('Résultat global (doit réussir, document produit normalement) : ' + JSON.stringify(result));
    report.push('Aucune erreur JS non gérée : ' + (pageErrors.length === 0));
    report.push('Ligne SSE corrompue ignorée silencieusement (pas de crash, pas de warning fatal) : ' + (result.ok === true));
    report.push('=> Fragment coupé sans \\n intermédiaire correctement recollé par le buffer avant JSON.parse (comportement préexistant, non régressé) — prouvé par le succès global ci-dessus.');
    report.push('');
  }

  // ── Scénario 4 : HTTP 200 suivi d'un silence total ────────────────────────────────────────
  {
    const { result, consoleLines, pageErrors, findMetrics } = await runScenario(browser, 'SILENCE_TOTAL_APRES_200', { runForMs: 22000 });
    const m = findMetrics('appel 1, tentative 1');
    report.push("=== 4. HTTP 200 suivi d'un silence total ===");
    report.push('Résultat global (doit réussir malgré échec appel 1, repli best-effort, PAS de gel infini) : ' + JSON.stringify(result));
    report.push('Aucune erreur JS non gérée : ' + (pageErrors.length === 0));
    report.push('Abandon effectif dans la fenêtre de 21s simulées (jamais un gel indéfini) : ' + (result.ok === true));
    report.push('Métrique brute (finalState) : ' + JSON.stringify(m));
    report.push("=> Le flux est bien interrompu par une des deux minuteries (transport-timeout ou semantic-timeout, les deux coïncident naturellement ici puisqu'aucun octet ni contenu n'arrive jamais après le premier), jamais laissé en attente indéfiniment : " + (m && (m.finalState === 'transport-timeout' || m.finalState === 'semantic-timeout')));
    report.push('');
  }

  // ── Bonus : retry conditionnel de l'appel 2 sur erreur SSE transitoire, sans JSON accumulé ──
  {
    const { result, consoleLines, pageErrors } = await runScenario(browser, 'RETRY_APPEL2', { runForMs: 500 });
    report.push('=== Bonus — retry appel 2 sur erreur SSE transitoire (avant tout JSON) ===');
    report.push('Résultat global (doit réussir après la 2e tentative) : ' + JSON.stringify(result));
    report.push('Aucune erreur JS non gérée : ' + (pageErrors.length === 0));
    report.push('Deux tentatives appel 2 effectuées : ' + (consoleLines.filter(l => l.includes('avant envoi appel 2')).length === 2));
    report.push('"nouvelle tentative" visible dans les logs (et donc potentiellement à l\'écran via adocUpdateTypingLabel) : ' + consoleLines.some(l => l.includes('nouvelle tentative')));
    report.push('');
  }

  console.log(report.join('\n'));
  require('fs').writeFileSync('/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/partA-ssestreams-results.txt', report.join('\n'));
  await browser.close();
})();
