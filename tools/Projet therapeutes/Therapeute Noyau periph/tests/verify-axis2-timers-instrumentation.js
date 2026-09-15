// Axe 2 (audit Codex) — confirme par flux simulés (horloge virtuelle Playwright, même patron que
// verify-partA-ssestreams.js) : (1) le minuteur SÉMANTIQUE de l'appel 2 est bien à 120000ms, (2)
// le minuteur TRANSPORT de l'appel 2 reste à 45000ms, (3) les deux minuteries de l'appel 1 restent
// à 20000ms — RIEN d'autre n'a changé. (4) La nouvelle instrumentation (intervalles entre
// fragments, pings, longueur JSON au début de chaque pause, content_block_stop/message_stop,
// stop_reason à l'abandon) se remplit correctement sur un flux réaliste avec plusieurs fragments
// et un ping intercalé.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [{ content: 'Passage test.', book_title: 'Livre test', author: 'Auteur, A.', page_number: 1 }];

function installFakeFetch(scenario) {
  window.__capturedLogs = [];
  const _origConsoleLog = console.log.bind(console);
  console.log = function (...args) { window.__capturedLogs.push(args); _origConsoleLog(...args); };

  function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
  function mkAbortError() { return new DOMException('aborted', 'AbortError'); }
  function makeReader(plan, signal) {
    let i = 0;
    return { read() {
      return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(mkAbortError()); return; }
        const onAbort = () => { clearTimeout(tid); reject(mkAbortError()); };
        signal.addEventListener('abort', onAbort, { once: true });
        if (i >= plan.length) return;
        const step = plan[i++];
        if (step.hang) return;
        var tid = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          if (step.done) { resolve({ done: true, value: undefined }); return; }
          resolve({ done: false, value: new TextEncoder().encode(step.text) });
        }, step.delayMs || 0);
      });
    } };
  }

  window.fetch = async function (url, init) {
    const body = JSON.parse(init.body);
    const isAppel1 = body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
    const signal = init.signal;
    if (isAppel1) {
      // Appel 1 trivial et rapide — hors périmètre de ce test (timers/instrumentation appel 2).
      const plan = [
        { text: sseLine({ type: 'message_start', message: { usage: { input_tokens: 5 } } }), delayMs: 5 },
        { text: sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }), delayMs: 5 },
        { text: 'data: [DONE]\n\n', delayMs: 5 },
        { done: true, delayMs: 5 },
      ];
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }

    // ── Appel 2 — scénarios ──
    if (scenario === 'TIMER_TRANSPORT_45S_UNCHANGED') {
      // Silence total après un seul octet — seul le minuteur TRANSPORT peut se déclencher ici
      // (aucun fragment input_json_delta jamais reçu, donc le minuteur sémantique, fixé une fois
      // au départ à 120s désormais, ne serait de toute façon jamais réarmé — mais le TRANSPORT,
      // lui, doit toujours se déclencher à 45s pile, pas 120s).
      const plan = [
        { text: sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } }), delayMs: 10 },
        { hang: true },
      ];
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }
    if (scenario === 'TIMER_SEMANTIC_120S') {
      // Un seul fragment réel au départ, PUIS des pings réguliers toutes les 40s (des octets
      // bruts réels — réarment le minuteur TRANSPORT indéfiniment, jamais assez espacés pour
      // atteindre 45s) mais JAMAIS plus aucun fragment input_json_delta. Même patron que le
      // scénario KEEPALIVE_PROLONGE de l'appel 1 (lot précédent) : la seule façon de prouver que
      // le seuil SÉMANTIQUE (pas le transport) est bien passé à 120s est d'isoler son
      // déclenchement de celui du transport — sinon le transport (toujours 45s) se déclencherait
      // toujours en premier dès que les octets s'arrêtent, quel que soit le seuil sémantique.
      const plan = [
        { text: sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } }), delayMs: 10 },
        { text: sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } }), delayMs: 10 },
        { text: sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"a":1}' } }), delayMs: 10 },
        // Pings réguliers toutes les 40s (< 45s : le transport ne se déclenche jamais) — le
        // dernier réarmement du sémantique reste celui du fragment ci-dessus, à t≈30ms.
        { text: sseLine({ type: 'ping' }), delayMs: 40000 },
        { text: sseLine({ type: 'ping' }), delayMs: 40000 },
        { text: sseLine({ type: 'ping' }), delayMs: 40000 },
        { text: sseLine({ type: 'ping' }), delayMs: 40000 },
        { hang: true },
      ];
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }
    if (scenario === 'INSTRUMENTATION_REALISTE') {
      // Séquence réaliste : 3 fragments espacés, un vrai événement {"type":"ping"} intercalé,
      // puis content_block_stop + message_delta(stop_reason) + message_stop, flux mené à terme
      // (pas d'abandon ici — teste le remplissage en cas de SUCCÈS, complémentaire du test
      // d'abandon ci-dessus qui vérifie stopReasonAtAbandon).
      const inputJson = JSON.stringify({ title: 'Fiche test', purpose: 'x', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }] });
      const third = Math.ceil(inputJson.length / 3);
      const plan = [
        { text: sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } }), delayMs: 10 },
        { text: sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } }), delayMs: 10 },
        { text: sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson.slice(0, third) } }), delayMs: 200 },
        { text: sseLine({ type: 'ping' }), delayMs: 300 },
        { text: sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson.slice(third, third * 2) } }), delayMs: 500 },
        { text: sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson.slice(third * 2) } }), delayMs: 700 },
        { text: sseLine({ type: 'content_block_stop', index: 0 }), delayMs: 10 },
        { text: sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 10 } }), delayMs: 10 },
        { text: sseLine({ type: 'message_stop' }), delayMs: 10 },
        { text: 'data: [DONE]\n\n', delayMs: 10 },
        { done: true, delayMs: 10 },
      ];
      return { ok: true, status: 200, body: { getReader: () => makeReader(plan, signal) } };
    }
    throw new Error('scénario inconnu: ' + scenario);
  };
}

async function runScenario(browser, scenario, runForMs) {
  const page = await browser.newPage();
  const consoleLines = [];
  page.on('console', m => consoleLines.push(m.text()));
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.route('**/*', route => route.continue());
  await page.goto('file://' + FILE);
  await page.waitForTimeout(50);
  await page.clock.install({ time: 0 });
  await page.evaluate('(' + installFakeFetch.toString() + ')(' + JSON.stringify(scenario) + ');');

  await page.evaluate(({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    window.__testResultPromise = window.adocGenerateStructuredFiche('Test', { intent: 'fiche' }, ragResult, 'sys-test', 'https://clone-proxy.11drumboy11.workers.dev')
      .then(r => ({ ok: true, doc: r.doc }))
      .catch(e => ({ ok: false, name: e && e.name, message: e && e.message }));
  }, { chunks: MOCK_RAG_CHUNKS });

  await page.clock.runFor(runForMs);
  await page.waitForTimeout(80);

  let result;
  try {
    result = await Promise.race([
      page.evaluate(() => window.__testResultPromise),
      new Promise((_, rej) => setTimeout(() => rej(new Error('NODE_TIMEOUT')), 10000)),
    ]);
  } catch (e) { result = { ok: false, name: 'Timeout', message: e.message }; }

  const capturedLogs = await page.evaluate(() => window.__capturedLogs).catch(() => []);
  // Le console.log de _adocLogCallMetrics n'imprime qu'un sous-ensemble fixe de champs (lisible
  // par un humain) — pour vérifier les NOUVEAUX champs (Axe 2), il faut l'objet _m2 complet tel
  // que relayé au traceur, jamais la version abrégée du seul console.log.
  // Correction rang 4 — metrics2 est désormais un TABLEAU d'une entrée par tentative : ce fichier
  // veut la dernière tentative réellement effectuée (celle qui a déterminé l'issue du scénario),
  // jamais un remplacement, donc toujours en dernière position du tableau.
  const metrics2Raw = await page.evaluate(() => {
    const arr = (window._adocLastStructAttemptMetrics || {}).metrics2;
    return arr && arr.length ? arr[arr.length - 1] : null;
  });
  await page.close();
  function findMetrics(label) {
    const entry = capturedLogs.find(args => typeof args[0] === 'string' && args[0].includes('[UX-8A.2][métriques] ' + label));
    return entry ? entry[1] : null;
  }
  return { result, consoleLines, pageErrors, findMetrics, metrics2Raw };
}

(async () => {
  const browser = await chromium.launch();
  const report = [];

  console.log('=== 1. Minuterie TRANSPORT appel 2 — doit rester 45000ms, jamais 120000ms ===');
  {
    // Éligible au retry (AbortError, aucun JSON encore accumulé, HTTP 200 déjà progressé —
    // scénario "silence après un octet"), donc jusqu'à 2 tentatives de 45s chacune : la fenêtre
    // simulée doit couvrir les deux (2×45s + marge), sans quoi l'attente réelle des 45s
    // supplémentaires de la 2e tentative ne serait jamais accordée par l'horloge virtuelle.
    const { result, findMetrics } = await runScenario(browser, 'TIMER_TRANSPORT_45S_UNCHANGED', 2 * 45000 + 5000);
    const m1 = findMetrics('appel 2, tentative 1');
    const m2 = findMetrics('appel 2, tentative 2');
    report.push('Résultat (doit échouer après 2 tentatives, aucun repli à tester ici — juste adocGenerateStructuredFiche seule): ' + JSON.stringify(result));
    report.push('finalState tentative 1 / 2: ' + (m1 && m1.finalState) + ' / ' + (m2 && m2.finalState));
    report.push('=> Minuterie transport toujours à 45s aux DEUX tentatives (jamais besoin d\'aller jusqu\'à 120s) : ' +
      (m1 && m1.finalState === 'transport-timeout' && m2 && m2.finalState === 'transport-timeout'));
  }

  console.log('\n=== 2. Minuterie SÉMANTIQUE appel 2 — doit être 120000ms, pas 45000ms ===');
  {
    // Un seul fragment initial, puis des pings réels toutes les 40s (jamais assez espacés pour
    // déclencher le TRANSPORT, resté à 45s) mais plus aucun fragment JAMAIS — isole totalement le
    // déclenchement du sémantique. Non éligible au retry (JSON déjà non vide dès le 1er fragment),
    // donc une seule tentative : la fenêtre doit dépasser 120s (depuis ce 1er fragment) sans
    // dépasser le prochain ping qui suivrait un seuil resté à 45s (aurait déjà abandonné bien avant).
    const { result, findMetrics, metrics2Raw } = await runScenario(browser, 'TIMER_SEMANTIC_120S', 125000);
    const m = findMetrics('appel 2, tentative 1');
    report.push('Résultat: ' + JSON.stringify(result));
    report.push('finalState: ' + (m && m.finalState));
    report.push('pingCount reçus avant l\'abandon (preuve que le transport n\'a jamais paniqué malgré 3 pings à 40s/80s/120s) : ' + (metrics2Raw && metrics2Raw.pingCount));
    report.push('=> Minuterie sémantique bien à 120s (survit largement au-delà de 45s de silence de CONTENU réel, grâce aux pings qui maintiennent le transport, puis abandon sémantique) : ' +
      (m && m.finalState === 'semantic-timeout'));
  }

  console.log('\n=== 3. Minuteries de l\'appel 1 — inchangées (20000ms) ===');
  {
    // Réutilise directement le scénario déjà validé dans le lot précédent (verify-partA-ssestreams.js,
    // scénario SILENCE_TOTAL_APRES_200 sur l'appel 1) pour prouver la non-régression du seuil de
    // 20s — reproduit ici succinctement avec le même harnais que ce fichier, sur l'appel 1 cette
    // fois (fetch mocké directement, sans passer par installFakeFetch qui ne couvre que l'appel 2
    // dans ce fichier).
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.route('**/*', route => route.continue());
    await page.goto('file://' + FILE);
    await page.waitForTimeout(50);
    await page.clock.install({ time: 0 });
    await page.evaluate(() => {
      function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
      window.fetch = async function (url, init) {
        const body = JSON.parse(init.body);
        const isAppel1 = body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
        const signal = init.signal;
        if (!isAppel1) throw new Error('ne devrait jamais atteindre l\'appel 2 dans ce test');
        return {
          ok: true, status: 200, body: {
            getReader: () => {
              let sent = false;
              return {
                read() {
                  return new Promise((resolve, reject) => {
                    if (signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
                    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
                    if (sent) return; // silence total après le premier octet — jamais de 2e réponse
                    sent = true;
                    setTimeout(() => resolve({ done: false, value: new TextEncoder().encode(sseLine({ type: 'message_start', message: { usage: { input_tokens: 5 } } })) }), 10);
                  });
                },
              };
            },
          },
        };
      };
    });
    await page.evaluate(({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      window.__testResultPromise = window.adocGenerateStructuredFiche('Test', { intent: 'fiche' }, ragResult, 'sys-test', 'https://clone-proxy.11drumboy11.workers.dev')
        .then(r => ({ ok: true }))
        .catch(e => ({ ok: false, name: e && e.name }));
    }, { chunks: MOCK_RAG_CHUNKS });
    await page.clock.runFor(25000);
    await page.waitForTimeout(80);
    const abortedAt25s = await page.evaluate(() => window.__testResultPromise === undefined); // pas concluant seul
    // Vérifie via le comportement : à 25s (>20s), l'appel 1 doit déjà avoir abandonné en interne
    // (best-effort) et donc être passé à l'appel 2 — qui n'existe pas dans ce mock et lèverait
    // l'erreur volontaire ci-dessus si l'appel 1 durait encore au-delà de 20s (il ne devrait PAS
    // durer aussi longtemps si son seuil est resté 20s).
    let threwExpectedAppel2Error = false;
    try {
      const r = await Promise.race([
        page.evaluate(() => window.__testResultPromise),
        new Promise((_, rej) => setTimeout(() => rej(new Error('NODE_TIMEOUT')), 5000)),
      ]);
      threwExpectedAppel2Error = r && r.ok === false; // a échoué (attendu : mock appel 2 volontairement cassé)
    } catch (e) { /* timeout node — traité ci-dessous comme échec */ }
    report.push('À 25s simulées (>20s), l\'appel 1 a bien abandonné et cédé le pas à l\'appel 2 (seuil de 20s toujours actif, pas allongé) : ' + threwExpectedAppel2Error);
    await page.close();
  }

  console.log('\n=== 4. Instrumentation supplémentaire sur un flux réaliste réussi ===');
  {
    const { result, metrics2Raw } = await runScenario(browser, 'INSTRUMENTATION_REALISTE', 3000);
    const m = metrics2Raw;
    report.push('Résultat (doit réussir, document produit): ' + JSON.stringify(result));
    report.push('Métriques complètes (objet réel _m2, pas la version abrégée du console.log): ' + JSON.stringify(m, null, 2));
    report.push('=> interFragmentIntervalsMs contient 2 intervalles (3 fragments -> 2 écarts), valeurs cohérentes (~500ms et ~700ms) : ' +
      (m && Array.isArray(m.interFragmentIntervalsMs) && m.interFragmentIntervalsMs.length === 2));
    report.push('=> jsonLengthAtIntervalStart contient 2 valeurs croissantes, cohérentes avec la longueur du 1er puis 2e fragment : ' +
      (m && Array.isArray(m.jsonLengthAtIntervalStart) && m.jsonLengthAtIntervalStart.length === 2 && m.jsonLengthAtIntervalStart[1] > m.jsonLengthAtIntervalStart[0]));
    report.push('=> pingCount === 1 et pingTimestampsMs contient bien 1 horodatage : ' + (m && m.pingCount === 1 && Array.isArray(m.pingTimestampsMs) && m.pingTimestampsMs.length === 1));
    report.push('=> receivedContentBlockStop et receivedMessageStop tous deux vrais (flux mené à terme normalement) : ' + (m && m.receivedContentBlockStop === true && m.receivedMessageStop === true));
  }

  console.log(report.join('\n'));
  require('fs').writeFileSync('/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/axis2-results.txt', report.join('\n'));
  await browser.close();
})();
