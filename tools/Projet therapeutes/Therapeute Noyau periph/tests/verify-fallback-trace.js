// Traceur persistant des replis — test réel : simule un vrai repli (échec non-transitoire de
// l'appel 2 structuré, HTTP 400) via le VRAI pipeline complet (window.adocSend(), planner +
// clarté + RAG mockés, même patron que verify-partB-legacy-e2e.js), puis vérifie que
// adocFallbackTrace (localStorage) reçoit une entrée correcte, que adocDumpFallbackTrace()
// fonctionne sans erreur à 0/1/plusieurs entrées, et que adocClearFallbackTrace() vide bien tout.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
  { content: 'Le mépris porte une dévalorisation globale.', book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58 },
  { content: "L'attitude défensive bloque la réparation.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 61 },
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

async function setupPageWithFallback(browser) {
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
      // Appel 2 structuré — échec non transitoire (HTTP 400), déclenche le repli.
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
        route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'simulation échec structuré (non transitoire)' } }) });
        return;
      }
      // Appel 1 structuré (décision web_search, max_tokens:200) — succès trivial.
      if (body.includes('"max_tokens":200')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      // Appel principal du moteur legacy (repli) — produit le document de secours.
      if (body.includes('"max_tokens":16000')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) });
        return;
      }
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      // Le planificateur prend un chemin différent (plus court) dès qu'un historique de
      // conversation existe (observé : intent devient "chat" sans ce mock) — plutôt que de
      // chercher à matcher chaque variante exacte du prompt, cette fiche de plan couvre
      // TOUTE requête de planification atteignant ce point (aucune autre route ci-dessus ne
      // matche un appel de planification), pour garantir intent='fiche' à chaque itération du
      // test, quelle que soit l'étape de la conversation.
      const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors };
}

async function triggerOneFallback(page, question) {
  const chatVisible = await page.evaluate(() => {
    const el = document.getElementById('adoc-input');
    return !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
  });
  if (chatVisible) {
    await page.fill('#adoc-input', question);
    await page.click('#adoc-send-btn');
  } else {
    await page.fill('#clinical-question', question);
    await page.click('#clinical-home-form button[type="submit"]');
  }
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const report = [];

  console.log('=== 1. Avant tout repli — adocDumpFallbackTrace() avec 0 entrée ===');
  {
    const { page, errors } = await setupPageWithFallback(browser);
    const dump0 = await page.evaluate(() => {
      const logs = [];
      const orig = console.log;
      console.log = (...a) => { logs.push(a.map(String).join(' ')); orig.apply(console, a); };
      let threw = false;
      try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; }
      console.log = orig;
      return { threw, logs };
    });
    report.push('adocDumpFallbackTrace() avec 0 entrée ne lève aucune erreur: ' + (dump0.threw === false));
    report.push('Message "Aucun repli enregistré" affiché: ' + dump0.logs.some(l => l.includes('Aucun repli enregistré')));
    report.push('Erreurs JS: ' + JSON.stringify(errors));
    await page.close();
  }

  console.log('\n=== 2. Un repli réel déclenché via le VRAI pipeline (window.adocSend) ===');
  let page1Errors;
  {
    const { page, errors } = await setupPageWithFallback(browser);
    page1Errors = errors;
    await triggerOneFallback(page, 'Fais-moi une fiche sur les cavaliers de Gottman');

    const traceState = await page.evaluate(() => {
      const raw = localStorage.getItem('adocFallbackTrace');
      const list = raw ? JSON.parse(raw) : [];
      return { count: list.length, entry: list[0] || null };
    });
    report.push('Une entrée ajoutée après le repli: ' + (traceState.count === 1));
    const e = traceState.entry || {};
    report.push('Champs attendus tous présents et cohérents (pas de undefined/null inattendu): ' + JSON.stringify({
      timestamp: typeof e.timestamp === 'string' && e.timestamp.length > 0,
      hourOfDay: typeof e.hourOfDay === 'number' && e.hourOfDay >= 0 && e.hourOfDay <= 23,
      failedCall: e.failedCall === 2,
      sourceCount: typeof e.sourceCount === 'number' && e.sourceCount > 0,
      ragChunkCount: typeof e.ragChunkCount === 'number' && e.ragChunkCount > 0,
      sourceCountMatchesRagChunkCount: e.sourceCount === e.ragChunkCount, // cohérence interne attendue dans ce scénario simple
      usedWebSearch: typeof e.usedWebSearch === 'boolean',
      // Correction rang 4 — metrics1/metrics2 sont désormais un TABLEAU d'une entrée par
      // tentative réellement effectuée (jamais plus un objet unique réécrit) : ce scénario ne
      // déclenche qu'une seule tentative de chaque appel (appel 1 réussit du premier coup, appel
      // 2 échoue avec un HTTP 400 non transitoire, donc jamais de retry) — chaque tableau doit
      // donc contenir EXACTEMENT 1 élément, portant lui-même attemptNumber===1.
      hasMetrics1: Array.isArray(e.metrics1) && e.metrics1.length === 1 && typeof e.metrics1[0].payloadBytes === 'number' && e.metrics1[0].attemptNumber === 1,
      hasMetrics2: Array.isArray(e.metrics2) && e.metrics2.length === 1 && typeof e.metrics2[0].payloadBytes === 'number' && e.metrics2[0].finalState === 'http-error' && e.metrics2[0].attemptNumber === 1,
      errorMessage: typeof e.errorMessage === 'string' && e.errorMessage.length > 0,
    }));
    report.push('metrics2[0].finalState (doit refléter le VRAI échec HTTP simulé): ' + JSON.stringify(e.metrics2 && e.metrics2[0] && e.metrics2[0].finalState));
    report.push('metrics2[0].durationMs mesuré et positif (durée réelle de cette tentative, jamais absente): ' + JSON.stringify(e.metrics2 && e.metrics2[0] && typeof e.metrics2[0].durationMs === 'number' && e.metrics2[0].durationMs >= 0));
    report.push('errorMessage réel capturé: ' + JSON.stringify(e.errorMessage));
    report.push('Entrée complète: ' + JSON.stringify(e, null, 2));

    // Confirme aussi que le repli legacy-html (lot précédent) fonctionne toujours normalement —
    // ce lot ne doit RIEN changer à ce comportement, juste observer en plus.
    const legacyStillWorks = await page.evaluate(() => {
      const artifacts = window._adocArtifacts || {};
      return Object.values(artifacts).some(a => a._adocGenerationEngine === 'legacy-html');
    });
    report.push('=> Non-régression : le document de repli legacy-html est TOUJOURS produit normalement en plus de la trace: ' + legacyStillWorks);

    console.log('\n=== 3. adocDumpFallbackTrace() avec 1 entrée ===');
    const dump1 = await page.evaluate(() => {
      let threw = false;
      try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; }
      return { threw };
    });
    report.push('adocDumpFallbackTrace() avec 1 entrée ne lève aucune erreur: ' + (dump1.threw === false));

    console.log('\n=== 4. Plusieurs replis — vérifie l\'accumulation et le résumé ===');
    // Un rechargement complet de page (page.reload()) simule une thérapeute qui revient un autre
    // jour — même origine file://, localStorage réellement persistant (vérifié : contrairement à
    // 3 pages Playwright fraîches et distinctes, qui n'ont PAS partagé le même stockage dans ce
    // sandbox — limite de l'outillage de test, pas du mécanisme localStorage réel du navigateur).
    // Les routes déjà enregistrées sur `page` restent actives après un reload.
    for (let i = 0; i < 2; i++) {
      await page.reload();
      await page.waitForTimeout(300);
      await triggerOneFallback(page, 'Demande n°' + i + ' sur un sujet clinique quelconque');
    }
    const multi = await page.evaluate(() => {
      const raw = localStorage.getItem('adocFallbackTrace');
      const list = raw ? JSON.parse(raw) : [];
      let threw = false;
      const logs = [];
      const orig = console.log;
      console.log = (...a) => { logs.push(a.map(String).join(' ')); orig.apply(console, a); };
      try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; }
      console.log = orig;
      return { count: list.length, threw, summaryLine: logs.find(l => l.includes('Total')) };
    });
    report.push('3 replis déclenchés (1 + 2 après reload) -> 3 entrées accumulées: ' + (multi.count === 3) + ' (compte réel: ' + multi.count + ')');
    report.push('adocDumpFallbackTrace() avec plusieurs entrées ne lève aucune erreur: ' + (multi.threw === false));
    report.push('Ligne de résumé "Total" affichée: ' + !!multi.summaryLine);

    console.log('\n=== 5. adocClearFallbackTrace() ===');
    const cleared = await page.evaluate(() => {
      window.adocClearFallbackTrace();
      const raw = localStorage.getItem('adocFallbackTrace');
      return { rawAfter: raw };
    });
    report.push('Après adocClearFallbackTrace(), la clé localStorage est bien vidée: ' + (cleared.rawAfter === null));

    await page.close();
  }

  console.log('\n=== 6. Limite à 100 entrées (jamais de croissance illimitée) ===');
  {
    const { page, errors } = await setupPageWithFallback(browser);
    await page.evaluate(() => {
      // Pré-remplit directement 100 fausses entrées minimales (sans repasser par tout le
      // pipeline 105 fois, trop lent) pour vérifier UNIQUEMENT le comportement de la limite.
      const list = Array.from({ length: 100 }, (_, i) => ({ timestamp: 'fake-' + i, hourOfDay: 0, failedCall: 2, sourceCount: 1, ragChunkCount: 1, usedWebSearch: false, metrics1: null, metrics2: null, errorMessage: 'fake' }));
      localStorage.setItem('adocFallbackTrace', JSON.stringify(list));
    });
    await triggerOneFallback(page, 'Une 101e demande qui déclenche encore un repli');
    const afterLimit = await page.evaluate(() => {
      const raw = localStorage.getItem('adocFallbackTrace');
      const list = raw ? JSON.parse(raw) : [];
      return { count: list.length, oldestStillPresent: list.some(e => e.timestamp === 'fake-0'), newestPresent: list.some(e => e.timestamp !== 'fake-0' && !String(e.timestamp).startsWith('fake-')) };
    });
    report.push('Le tableau reste plafonné à 100 entrées (jamais 101): ' + (afterLimit.count === 100));
    report.push('La plus ancienne entrée (fake-0) a bien été retirée (tableau.shift()): ' + (afterLimit.oldestStillPresent === false));
    report.push('La toute nouvelle entrée est bien présente: ' + afterLimit.newestPresent);
    report.push('Erreurs JS: ' + JSON.stringify(errors));
    await page.close();
  }

  console.log(report.join('\n'));
  await browser.close();
})();
