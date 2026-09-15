// PHASE 2 (monobloc) — l'ancien moteur doit garantir la même fiabilité de cycle d'envoi que le
// moteur structuré. Recense les 4 chemins de fin de génération de l'ancien moteur (succès
// simple, succès avec continuation, échec, repli depuis le structuré — ce dernier est en fait
// exercé PAR CONSTRUCTION dans les 3 scénarios ci-dessous, puisque emit_fiche_document échoue
// systématiquement, forçant toujours un repli avant d'atteindre l'ancien moteur) et vérifie,
// pour chacun, que la remise à zéro de l'état d'envoi est aussi rigoureusement garantie que pour
// le moteur structuré — via une VRAIE deuxième génération avec clarification, jamais une simple
// inspection de variables internes.
//
// Investigation : _adocResetSendState() (adocThinking + réactivation du bouton) était déjà
// appelée sur les 4 sorties de la fonction principale (adocSendOriginal), mais 3 endroits
// dupliquaient encore ces deux lignes à la main (adocContinueGeneration, adocKeepAsIs,
// adocRunClarityGate) sans passer par la fonction commune — corrigé pour réutiliser
// _adocResetSendState() partout, cohérence/prévention plutôt que correction d'un bug observé :
// un test de bout en bout rigoureux (voir plus bas, avec un mock qui ne fausse jamais la 2e
// génération) n'a reproduit AUCUN cas d'interface bloquée avant comme après ce nettoyage.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const MOCK_RAG_CHUNKS = [{ content: "x", book_title: 'y', author: 'z', page_number: 1 }];
function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function textSSE(text, stopReason) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const HTML_OK = '<!DOCTYPE html><html><body><h1>Doc</h1><p>Contenu complet.</p></body></html>';

// gen1Behavior(callNumber, body) décide comment répondre au N-ième appel max_tokens:16000
// (1-based). Seul le(s) tout premier(s) appel(s) — ceux de la DEMANDE 1 — exercent le chemin
// testé ; tout appel ultérieur (demande 2, y compris sa propre suite éventuelle) répond
// normalement, pour que le test de la demande 2 soit un test valide de bout en bout, jamais
// faussé par le même mock qui aurait aussi cassé la demande 2 par construction.
function baseRoutes(page, gen1Behavior) {
  let clarityCallCount = 0;
  let gen16kCallCount = 0;
  return page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/clinical-documents')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ document_id: 'd1', version_id: 'v1' }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        clarityCallCount++;
        if (clarityCallCount === 2) {
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'needs_clarification', understood_so_far: 'Compris.', missing: ['précision'], question: 'Pour qui ce document ?', quick_replies: ['Praticiens', 'Patients'], assumptions_if_proceeding: [] } }] }) });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        }
        return;
      }
      if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: textSSE('ok', 'end_turn') }); return; }
      // emit_fiche_document échoue TOUJOURS — chaque legacy ci-dessous est donc systématiquement
      // atteint via un repli depuis le structuré (4e chemin recensé), jamais un accès direct.
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé' } }) }); return; }
      if (body.includes('"max_tokens":16000')) {
        gen16kCallCount++;
        route.fulfill(gen1Behavior(gen16kCallCount, body));
        return;
      }
      const plan = { needs_rag: true, searches: [{ terms: ['x'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'sujet', deep_scan: false, max_tokens: 2000, images_only: false };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
}

async function runScenario(browser, label, gen1Behavior, log) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await baseRoutes(page, gen1Behavior);
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  await page.fill('#clinical-question', 'Premiere demande, scenario ' + label);
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(4000); // laisse le chemin 1 (repli + succès/échec/troncature) se terminer entièrement

  const artifactCountBefore = await page.evaluate(() => Object.keys(window._adocArtifacts || {}).length);
  await page.fill('#adoc-input', 'Deuxieme demande qui va necessiter une clarification');
  await page.click('#adoc-send-btn');
  let cardAppeared = true;
  try {
    await page.waitForSelector('.cc-clarity-reply-btn', { timeout: 10000 });
  } catch (e) { cardAppeared = false; }
  log(label + ' — 1. La carte de clarification de la 2e demande apparaît bien', cardAppeared);

  let secondGenDelivered = false;
  if (cardAppeared) {
    await page.click('.cc-clarity-reply-btn >> nth=0');
    try {
      await page.waitForFunction((before) => Object.keys(window._adocArtifacts || {}).length > before, artifactCountBefore, { timeout: 10000 });
      secondGenDelivered = true;
    } catch (e) { /* pas livré */ }
  }
  log(label + ' — 2. Le clic sur le quick-reply aboutit bien à une 2e génération complète (boutons non inertes)', secondGenDelivered);
  log(label + ' — 3. Aucune erreur JS sur l\'ensemble du scénario', errors.length === 0, errors);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  await runScenario(browser, 'repli + succès simple', (n) =>
    ({ status: 200, contentType: 'text/event-stream', body: textSSE(HTML_OK, 'end_turn') }), log);

  await runScenario(browser, 'repli + échec dur', (n) => n === 1
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec dur simulé' } }) }
    : { status: 200, contentType: 'text/event-stream', body: textSSE(HTML_OK, 'end_turn') }, log);

  await runScenario(browser, 'repli + succès avec continuation (troncature persistante)', (n) => {
    if (n === 1) return { status: 200, contentType: 'text/event-stream', body: textSSE('<!DOCTYPE html><html><body><h1>Tronqué</h1><p>Contenu partiel', 'max_tokens') };
    if (n === 2) return { status: 200, contentType: 'text/event-stream', body: textSSE(' — suite tronquée aussi.', 'max_tokens') }; // suite automatique, encore tronquée -> adocRenderContinueChoice, jamais adocFinalizeGeneration
    return { status: 200, contentType: 'text/event-stream', body: textSSE(HTML_OK, 'end_turn') };
  }, log);

  console.log('=== Résultats — Phase 2, fiabilité du cycle d\'envoi (ancien moteur) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
