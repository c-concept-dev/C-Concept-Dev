// Investigation ciblée (Christophe, verbatim) — le lecteur de flux de l'appel 2 (Fiche
// structurée) enregistrait bien la réception de `message_stop` (_m2.receivedMessageStop) mais
// continuait d'attendre la fermeture complète du transport HTTP (`done:true` sur le reader, ou
// l'une des deux minuteries 45s/120s) avant de considérer la tentative comme terminée. Si la
// connexion reste ouverte après `message_stop` (comportement réseau normal), un document déjà
// complet et valide pouvait ainsi déclencher un abandon — pas un vrai échec de génération.
//
// Corrigé : `message_stop` + `stop_reason==='tool_use'` (déjà connu via `message_delta`, qui
// précède toujours `message_stop`) + JSON accumulé réellement validable (JSON.parse réussi)
// suffisent désormais à sortir immédiatement de la boucle de lecture (`_genEarlyComplete`),
// sans attendre `done:true`.
//
// Test obligatoire : un flux où `message_stop` arrive avec un JSON complet et valide, mais où
// la connexion HTTP reste ensuite ouverte ARTIFICIELLEMENT (jamais fermée avant un délai très
// supérieur à la fenêtre d'observation) → confirme que la génération est traitée comme un
// SUCCÈS, jamais un abandon, et bien AVANT la fermeture effective du transport.
//
// Contrainte technique : Playwright route.fulfill() ne peut pas simuler une connexion qui reste
// réellement ouverte (body fixe, fermeture immédiate une fois le corps envoyé) — un vrai serveur
// HTTP local est utilisé ici pour contrôler précisément quand la réponse se termine, tout en
// pointant l'application dessus via localStorage.workerUrl (mécanisme déjà prévu par
// adocGetWorkerUrl()).
const http = require('http');
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' })
    + 'data: [DONE]\n\n';
}
function ficheDoc(marker) {
  return { title: 'Fiche test — ' + marker, purpose: 'supervision', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu complet et valide, livré avant toute fermeture de transport.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }] };
}
function plannerPlan() {
  return { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
}

// holdOpenMs : délai AVANT res.end() une fois message_stop déjà écrit et envoyé au client — le
// coeur du scénario (0 = fermeture immédiate/contrôle, >0 = connexion maintenue artificiellement
// ouverte APRÈS message_stop, cas du bug).
function startServer(holdOpenMs) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Un vrai serveur HTTP local (pas un route.fulfill Playwright) subit la vraie politique
      // CORS du navigateur depuis une origine file:// — sans ces en-têtes, TOUTE requête
      // (preflight OPTIONS compris, déclenché par X-API-Key + Content-Type: application/json)
      // échoue silencieusement en "Failed to fetch", masquant totalement le scénario testé.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const url = req.url;
        if (url === '/library-stats') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] })); return; }
        if (url === '/brand-kits') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ brand_kits: [] })); return; }
        if (url === '/d1-query') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ results: MOCK_RAG_CHUNKS })); return; }
        if (url === '/' || url === '') {
          if (body.includes('evaluate_clarity')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }));
            return;
          }
          if (body.includes('"max_tokens":200')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(simpleTextSSE('ok')); return; }
          if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            const inputJson = JSON.stringify(ficheDoc('holdOpenMs=' + holdOpenMs));
            res.write(sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } }));
            res.write(sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } }));
            res.write(sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } }));
            res.write(sseLine({ type: 'content_block_stop', index: 0 }));
            res.write(sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } }));
            res.write(sseLine({ type: 'message_stop' }));
            server._messageStopSentAt = Date.now();
            // Connexion volontairement maintenue ouverte après message_stop (holdOpenMs > 0) —
            // jamais fermée avant un délai très supérieur à la fenêtre d'observation du test.
            setTimeout(() => { try { res.end(); } catch (e) { /* déjà close côté client, sans conséquence */ } }, holdOpenMs);
            return;
          }
          if (body.includes('"max_tokens":16000')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(simpleTextSSE('repli legacy — ne devrait jamais être atteint dans ce test')); return; }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plannerPlan()) }] }));
          return;
        }
        res.writeHead(404); res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function runScenario(browser, label, holdOpenMs, log) {
  const server = await startServer(holdOpenMs);
  const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript((p) => { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); }, port);
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
  const tSubmit = Date.now();
  await page.click('#clinical-home-form button[type="submit"]');

  // Attend la livraison RÉELLE du document structuré (succès) — jamais l'expiration du délai
  // artificiel de maintien de connexion, ni les minuteries 45s/120s.
  let succeeded = true;
  try {
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc), { timeout: 15000 });
  } catch (e) {
    succeeded = false;
  }
  const tOutcome = Date.now();
  const elapsedMs = tOutcome - tSubmit;

  const metrics = await page.evaluate(() => {
    const arr = (window._adocLastStructAttemptMetrics && window._adocLastStructAttemptMetrics.metrics2) || [];
    const last = arr[arr.length - 1];
    return last ? {
      finalState: last.finalState,
      receivedMessageStop: last.receivedMessageStop,
      receivedContentBlockStop: last.receivedContentBlockStop,
      stopReasonAtAbandon: last.stopReasonAtAbandon,
    } : null;
  });

  log(label + ' — 1. Le document structuré est bien livré (succès, jamais un repli/abandon)', succeeded, { succeeded, metrics });
  log(label + ' — 2. receivedMessageStop === true', !!(metrics && metrics.receivedMessageStop === true), metrics);
  log(label + ' — 3. finalState === "completed" (jamais sse-error/transport-timeout/network-error)', !!(metrics && metrics.finalState === 'completed'), metrics);
  log(label + ' — 4. Aucun abandon enregistré (stopReasonAtAbandon reste null — jamais passé par le chemin d\'échec)', !!(metrics && metrics.stopReasonAtAbandon === null), metrics);
  if (holdOpenMs > 0) {
    log(label + ' — 5. Le succès survient BIEN AVANT la fermeture artificielle du transport (' + holdOpenMs + 'ms) — la lecture ne l\'attend plus', elapsedMs < holdOpenMs - 1500, { elapsedMs, holdOpenMs });
  }
  // La carte finale d'artefact (adocShowArtifactCard) contient un <iframe sandbox="allow-scripts">
  // (sans allow-same-origin, restriction volontaire, préexistante, sans rapport avec l'appel 2)
  // pour son aperçu intégré — un script embarqué dans le document généré qui toucherait
  // localStorage y échoue par construction. Selon le timing exact du chargement lazy de cet
  // iframe face à la fermeture de la page dans CE harnais de test, l'erreur peut ou non avoir
  // le temps de se manifester avant la lecture de `errors` — confirmé indépendant de holdOpenMs
  // (observé aussi bien à 0 qu'à 6000ms) et de ce correctif (carte construite par un code
  // totalement différent, déjà établi hors de portée lors du rang 6). Filtrée ici pour ne pas
  // fausser la seule question posée dans cette investigation ciblée.
  const KNOWN_UNRELATED_IFRAME_SANDBOX_ERROR = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
  const unexpectedErrors = errors.filter(e => e !== KNOWN_UNRELATED_IFRAME_SANDBOX_ERROR);
  log(label + ' — 6. Aucune erreur JS inattendue (hors aperçu iframe sandboxé, préexistant, sans rapport)', unexpectedErrors.length === 0, errors);

  await page.close();
  await new Promise(r => server.close(r));
  return { elapsedMs, metrics };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ Scénario A (le bug ciblé) — message_stop reçu avec JSON complet/valide, MAIS la
  //    connexion reste ouverte 6000ms de plus (jamais de `done:true` avant cette échéance,
  //    bien au-delà de toute fenêtre d'observation raisonnable). ═══
  const a = await runScenario(browser, 'A (transport maintenu ouvert 6000ms après message_stop)', 6000, log);

  // ═══ Scénario B (contrôle / non-régression) — fermeture immédiate après message_stop, comme
  //    un flux "normal". Doit se comporter de façon strictement équivalente au scénario A sur le
  //    fond (succès, mêmes champs), seule la vitesse peut différer. ═══
  const b = await runScenario(browser, 'B (contrôle — fermeture immédiate après message_stop)', 0, log);

  console.log('=== Résultats — Investigation ciblée, message_stop vs fermeture transport (appel 2) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nScénario A — durée jusqu'au succès : ${a.elapsedMs}ms (délai artificiel de maintien : 6000ms)`);
  console.log(`Scénario B — durée jusqu'au succès : ${b.elapsedMs}ms (fermeture immédiate)`);
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
