// Correction rang 4 — le traceur de replis écrasait les tentatives, perdant les vraies durées de
// chacune. window._adocLastStructAttemptMetrics.metrics1/metrics2 étaient un OBJET UNIQUE réécrit
// à chaque tentative (jusqu'à 2 autorisées par appel) : la 2e effaçait silencieusement la durée et
// l'issue de la 1re avant même d'atteindre le traceur persistant (cas réel observé : 138s puis
// 1104s sur l'appel 2, seule la 2e valeur survivait dans le dump final). Corrigé : metrics1/
// metrics2 sont désormais un TABLEAU, une entrée par tentative réellement effectuée (jamais un
// remplacement), chaque entrée portant attemptNumber et durationMs.
//
// Tests obligatoires (Christophe, verbatim) :
//   1. Scénario à 2 tentatives sur l'appel 2 (1re en échec transitoire après un délai mesurable,
//      2e qui échoue à son tour) → le traceur persistant final contient bien les DEUX tentatives
//      séparément identifiables, avec leurs durées respectives propres.
//   2. Scénario à une seule tentative (cas le plus courant) → fonctionne normalement, sans
//      changement de comportement visible.
//   3. adocDumpFallbackTrace() affiche correctement la nouvelle structure enrichie.
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

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1. Scénario à 2 tentatives — 1re transitoire (503, délai mesurable) puis 2e en échec
  //    définitif (400) — le traceur persistant final doit distinguer les DEUX. ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let structuredCallCount = 0;
    await page.route('**/*', route => {
      const req = route.request();
      const url = req.url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = req.postData() || '';
        if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
          structuredCallCount++;
          if (structuredCallCount === 1) {
            // 1re tentative — échec transitoire (503, retry autorisé), après un délai mesurable
            // (200ms) pour produire une durée distincte et vérifiable de la 2e tentative.
            setTimeout(() => {
              route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'surchargé (simulation transitoire)' } }) });
            }, 200);
            return;
          }
          // 2e tentative — échec définitif (400, non transitoire), quasi immédiat.
          route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec définitif (simulation, 2e tentative)' } }) });
          return;
        }
        if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
        if (body.includes('evaluate_clarity')) {
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
          return;
        }
        const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.continue();
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
    log('1b. Exactement 2 tentatives d\'appel 2 ont bien été effectuées (retry transitoire consommé)', structuredCallCount === 2, structuredCallCount);
    log('1c. metrics2 est un TABLEAU (jamais un objet unique) contenant EXACTEMENT 2 tentatives', entry && Array.isArray(entry.metrics2) && entry.metrics2.length === 2, entry && entry.metrics2);
    if (entry && Array.isArray(entry.metrics2) && entry.metrics2.length === 2) {
      const [a1, a2] = entry.metrics2;
      log('1d. La 1re tentative porte attemptNumber===1', a1.attemptNumber === 1, a1.attemptNumber);
      log('1e. La 2e tentative porte attemptNumber===2', a2.attemptNumber === 2, a2.attemptNumber);
      log('1f. La 1re tentative reflète bien son échec transitoire (finalState="http-error")', a1.finalState === 'http-error', a1.finalState);
      log('1g. La 2e tentative reflète bien son échec définitif (finalState="http-error", HTTP 400 cette fois — même finalState générique mais tentative distincte)', a2.finalState === 'http-error', a2.finalState);
      log('1h. Les DEUX tentatives ont chacune leur PROPRE durée mesurée (durationMs), jamais partagée', typeof a1.durationMs === 'number' && typeof a2.durationMs === 'number', { d1: a1.durationMs, d2: a2.durationMs });
      // Le délai artificiel de 200ms n'est appliqué qu'à la 1re tentative (mock) — sa durée doit
      // donc être nettement supérieure à celle, quasi immédiate, de la 2e : preuve directe que ce
      // ne sont pas deux mesures identiques ou une valeur dupliquée par erreur.
      log('1i. La durée de la 1re tentative (retardée à dessein) est bien supérieure à celle de la 2e (quasi immédiate) — preuve que ce sont deux mesures RÉELLES distinctes, jamais un doublon', a1.durationMs > a2.durationMs, { d1: a1.durationMs, d2: a2.durationMs });
      log('1j. La durée de la 1re tentative reflète bien le délai artificiel d\'au moins ~200ms introduit par le mock', a1.durationMs >= 150, a1.durationMs);
    }
    log('1k. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 2. Non-régression — scénario à une seule tentative (cas le plus courant) ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const req = route.request();
      const url = req.url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = req.postData() || '';
        // Appel 2 — échec NON transitoire dès la 1re tentative (400) : jamais de 2e tentative.
        if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
          route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec définitif, 1 seule tentative' } }) });
          return;
        }
        if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
        if (body.includes('evaluate_clarity')) {
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
          return;
        }
        const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1500);

    const entry = await page.evaluate(() => {
      const raw = localStorage.getItem('adocFallbackTrace');
      const list = raw ? JSON.parse(raw) : [];
      return list[list.length - 1] || null;
    });
    const legacyStillWorks = await page.evaluate(() => {
      const artifacts = window._adocArtifacts || {};
      return Object.values(artifacts).some(a => a._adocGenerationEngine === 'legacy-html');
    });

    log('2a. Une entrée de repli a bien été enregistrée (cas courant, non-régression)', !!entry, entry);
    log('2b. metrics2 contient EXACTEMENT 1 tentative (jamais de retry sur un échec non transitoire)', entry && Array.isArray(entry.metrics2) && entry.metrics2.length === 1, entry && entry.metrics2);
    log('2c. Cette unique tentative porte bien attemptNumber===1', entry && entry.metrics2 && entry.metrics2[0] && entry.metrics2[0].attemptNumber === 1, entry && entry.metrics2 && entry.metrics2[0] && entry.metrics2[0].attemptNumber);
    log('2d. Non-régression — le document de repli legacy-html est toujours produit normalement', legacyStillWorks);
    log('2e. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3. adocDumpFallbackTrace() affiche correctement la structure enrichie ═══
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.continue());
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      // Entrée réaliste reproduisant le cas cité par Christophe (audit du 06/09) : 1re tentative
      // à 138s (semantic-timeout), 2e à 1104s (semantic-timeout) — seule la 2e survivait avant ce
      // correctif dans le dump final.
      const entry = {
        timestamp: '2026-09-06T18:00:00.000Z', hourOfDay: 18, failedCall: 2, sourceCount: 12,
        ragChunkCount: 12, usedWebSearch: false,
        metrics1: [{ payloadBytes: 800, msToHttp200: 5, usefulContentFragmentCount: 1, lastEventType: 'message_stop', finalState: 'completed', attemptNumber: 1, durationMs: 8 }],
        metrics2: [
          { payloadBytes: 8764, usefulContentFragmentCount: 37, lastEventType: 'ping', finalState: 'semantic-timeout', attemptNumber: 1, durationMs: 138000 },
          { payloadBytes: 8764, usefulContentFragmentCount: 44, lastEventType: 'ping', finalState: 'semantic-timeout', attemptNumber: 2, durationMs: 1104000 },
        ],
        errorMessage: "Génération structurée : inactivité du flux (semantic-timeout), abandon.",
      };
      localStorage.setItem('adocFallbackTrace', JSON.stringify([entry]));
      const tableRows = [];
      const origTable = console.table;
      console.table = function (rows) { tableRows.push(...rows); };
      let threw = false;
      try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; }
      console.table = origTable;
      return { threw, row: tableRows[0] };
    });

    log('3a. adocDumpFallbackTrace() ne lève aucune erreur avec la structure enrichie (tableau de tentatives)', result.threw === false);
    log('3b. La colonne "attempts" affiche les DEUX tentatives, dans l\'ordre, avec numéro/durée/issue lisibles (cas réel 138s + 1104s)',
      result.row && result.row.attempts === '#1 138s (semantic-timeout) → #2 1104s (semantic-timeout)', result.row && result.row.attempts);
    log('3c. Les champs déjà existants (résumé = DERNIÈRE tentative) restent corrects — non-régression', result.row && result.row.payloadBytes === 8764 && result.row.usefulContentFragmentCount === 44, result.row);
    log('3d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Correction rang 4, traceur de replis multi-tentatives ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
