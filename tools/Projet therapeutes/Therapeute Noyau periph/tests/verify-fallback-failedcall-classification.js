// Correction rang 5 (dernier de l'audit chirurgical) — failedCall était toujours enregistré comme
// 2, quelle que soit l'origine réelle de l'exception atteignant le catch englobant du chemin
// structuré. Or ce même catch reçoit aussi des exceptions n'ayant AUCUN rapport avec un échec de
// l'appel 2 : contrôle qualité bloquant levé APRÈS un appel 2 pourtant réussi (exemple cité par
// l'audit, testé ici), échec de résolution de charte ou de rendu après coup (même famille), ou
// même une exception avant tout appel réseau (garde RAG vide). Corrigé via
// _adocClassifyFallbackOrigin, qui lit metrics1/metrics2 (tableaux de tentatives depuis la
// correction rang 4) pour distinguer honnêtement : 'pre-generation' (aucun appel jamais tenté),
// 2 (échec réel de l'appel 2), 'post-generation' (appel 2 réussi, échec survenu après).
//
// Tests obligatoires (Christophe, verbatim) :
//   1. Appel 2 réussit intégralement, suivi d'un échec après coup (ici : QC bloquant, l'exemple
//      cité par l'audit) → failedCall JAMAIS 2, et metrics2 de la dernière tentative montre
//      bien 'completed'.
//   2. Vrai échec de l'appel 2 (timeout/HTTP) → failedCall continue de l'identifier comme avant
//      (non-régression).
//   3. Vrai échec de l'appel 1 → failedCall reste correct (non-régression). Note : l'appel 1 ne
//      peut structurellement jamais, à lui seul, causer une exception dans ce catch (sa propre
//      boucle ne relance jamais — cf. rapport) ; ce scénario vérifie donc que lorsque l'appel 1
//      échoue ET que l'appel 2 échoue ensuite pour de vraies raisons, la classification reste
//      fidèle à la VRAIE cause (l'appel 2), jamais faussement attribuée à l'appel 1 ni ailleurs.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><body><h1>Fiche (secours)</h1><p>Contenu de repli.</p></body></html>';

function mockToolResponseSSE(input) {
  const inputJson = JSON.stringify(input);
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 50 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

function commonRoutes(page, opts) {
  return page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200')) { opts.onCall1 && opts.onCall1(route, body); if (!route._handled) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); } return; }
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { opts.onCall2(route, body); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1. Appel 2 réussit intégralement, QC bloquant après coup (contenu tronqué) ═══
  // → failedCall JAMAIS 2, metrics2 dernière tentative montre 'completed'.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await commonRoutes(page, {
      onCall2: (route) => {
        // Document techniquement valide et LIVRÉ par l'appel 2 (flux mené à terme, JSON
        // exploitable) — mais dont le texte ne se termine par aucune ponctuation finale
        // (adocRunQualityContract, "contenu apparemment tronqué"), un déclencheur QC bloquant
        // déterministe et indépendant de la résolution de citations. Reproduit fidèlement le cas
        // cité par l'audit : contrôle qualité bloquant levé APRÈS un appel 2 pourtant réussi.
        const doc = {
          title: 'Fiche test QC bloquant', purpose: 'supervision', audience: 'clinicien',
          blocks: [
            { type: 'paragraph', text: 'Contenu qui ne se termine pas correctement', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
          ],
        };
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(doc) });
      },
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(2000);

    const entry = await page.evaluate(() => {
      const raw = localStorage.getItem('adocFallbackTrace');
      const list = raw ? JSON.parse(raw) : [];
      return list[list.length - 1] || null;
    });
    log('1a. Une entrée de repli a bien été enregistrée', !!entry, entry);
    log('1b. failedCall N\'EST JAMAIS 2 pour ce cas (appel 2 réussi, échec post-génération)', entry && entry.failedCall !== 2, entry && entry.failedCall);
    log('1c. failedCall vaut explicitement "post-generation" (jamais deviné, déduit des données)', entry && entry.failedCall === 'post-generation', entry && entry.failedCall);
    log('1d. metrics2 de la DERNIÈRE tentative montre bien finalState==="completed" (l\'appel 2 a réellement réussi)', entry && Array.isArray(entry.metrics2) && entry.metrics2.length > 0 && entry.metrics2[entry.metrics2.length - 1].finalState === 'completed', entry && entry.metrics2);
    log('1e. L\'errorMessage reflète bien le QC bloquant (citation invalide), pas un échec réseau', entry && /QC bloquant|[Cc]itation invalide/.test(entry.errorMessage || ''), entry && entry.errorMessage);
    log('1f. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 2. Vrai échec de l'appel 2 (HTTP 400 non transitoire) → failedCall reste 2 ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await commonRoutes(page, {
      onCall2: (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec réel de l\'appel 2 (simulation)' } }) }),
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(2000);

    const entry = await page.evaluate(() => {
      const raw = localStorage.getItem('adocFallbackTrace');
      const list = raw ? JSON.parse(raw) : [];
      return list[list.length - 1] || null;
    });
    log('2a. Une entrée de repli a bien été enregistrée', !!entry, entry);
    log('2b. failedCall===2 pour un vrai échec de l\'appel 2 (non-régression)', entry && entry.failedCall === 2, entry && entry.failedCall);
    log('2c. metrics2 de la dernière tentative NE montre PAS "completed" (échec réel confirmé par les données)', entry && Array.isArray(entry.metrics2) && entry.metrics2.length > 0 && entry.metrics2[entry.metrics2.length - 1].finalState !== 'completed', entry && entry.metrics2);
    log('2d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3. Vrai échec de l'appel 1, PUIS vrai échec de l'appel 2 → failedCall reste fidèle à
  //    la VRAIE cause (l'appel 2), jamais faussement attribué à l'appel 1 (structurellement
  //    impossible aujourd'hui — cf. rapport — mais la classification ne doit jamais le suggérer
  //    à tort). ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await commonRoutes(page, {
      onCall1: (route) => { route._handled = true; route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec réel de l\'appel 1 (simulation)' } }) }); },
      onCall2: (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec réel de l\'appel 2 (simulation)' } }) }),
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(3000);

    const entry = await page.evaluate(() => {
      const raw = localStorage.getItem('adocFallbackTrace');
      const list = raw ? JSON.parse(raw) : [];
      return list[list.length - 1] || null;
    });
    log('3a. Une entrée de repli a bien été enregistrée', !!entry, entry);
    log('3b. metrics1 montre bien l\'échec réel de l\'appel 1 (au moins une tentative, finalState≠"completed")', entry && Array.isArray(entry.metrics1) && entry.metrics1.length > 0 && entry.metrics1[entry.metrics1.length - 1].finalState !== 'completed', entry && entry.metrics1);
    log('3c. failedCall reste fidèlement 2 (la VRAIE cause), JAMAIS 1 malgré l\'échec réel de l\'appel 1', entry && entry.failedCall === 2, entry && entry.failedCall);
    log('3d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 4. adocDumpFallbackTrace() reste lisible avec les 3 catégories mélangées ═══
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.continue());
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const entries = [
        { timestamp: '2026-09-11T10:00:00.000Z', hourOfDay: 10, failedCall: 2, sourceCount: 5, ragChunkCount: 5, usedWebSearch: false, metrics1: [{ attemptNumber: 1, durationMs: 10, finalState: 'completed' }], metrics2: [{ attemptNumber: 1, durationMs: 5000, finalState: 'http-error' }], errorMessage: 'échec appel 2 réel' },
        { timestamp: '2026-09-11T11:00:00.000Z', hourOfDay: 11, failedCall: 'post-generation', sourceCount: 5, ragChunkCount: 5, usedWebSearch: false, metrics1: [{ attemptNumber: 1, durationMs: 10, finalState: 'completed' }], metrics2: [{ attemptNumber: 1, durationMs: 3000, finalState: 'completed' }], errorMessage: 'QC bloquant' },
        { timestamp: '2026-09-11T12:00:00.000Z', hourOfDay: 12, failedCall: 'pre-generation', sourceCount: 0, ragChunkCount: 0, usedWebSearch: null, metrics1: [], metrics2: [], errorMessage: 'Aucun passage RAG disponible' },
      ];
      localStorage.setItem('adocFallbackTrace', JSON.stringify(entries));
      const tableRows = [];
      const logs = [];
      const origTable = console.table;
      const origLog = console.log;
      console.table = function (rows) { tableRows.push(...rows); };
      console.log = function (...a) { logs.push(a.map(String).join(' ')); origLog.apply(console, a); };
      let threw = false;
      try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; }
      console.table = origTable;
      console.log = origLog;
      return { threw, tableRows, logs };
    });

    log('4a. adocDumpFallbackTrace() ne lève aucune erreur avec les 3 catégories mélangées', result.threw === false);
    log('4b. La ligne "échec réel appel 2" affiche bien failedCall===2', result.tableRows[0] && result.tableRows[0].failedCall === 2, result.tableRows[0]);
    log('4c. La ligne "post-generation" affiche bien failedCall==="post-generation" (jamais 2)', result.tableRows[1] && result.tableRows[1].failedCall === 'post-generation', result.tableRows[1]);
    log('4d. La ligne "pre-generation" affiche bien failedCall==="pre-generation" sans planter (metrics vides)', result.tableRows[2] && result.tableRows[2].failedCall === 'pre-generation', result.tableRows[2]);
    log('4e. Le résumé distingue bien les 4 catégories (appel 1/appel 2/pré-génération/post-génération), aucune fondue dans une autre', result.logs.some(l => l.includes('pré-génération') && l.includes('post-génération') && l.includes('appel 2')), result.logs.find(l => l.includes('Répartition')));
    log('4f. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Correction rang 5, classification honnête de failedCall ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
