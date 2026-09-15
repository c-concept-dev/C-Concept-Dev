// Correction rang 1 — documentKind (choix explicite sur l'écran d'accueil) doit devenir
// l'AUTORITÉ DE ROUTAGE prioritaire sur intent (classification automatique), pas seulement
// une influence de texte en aval (documentKindCtx, déjà en place avant ce correctif).
//
// Trois scénarios obligatoires (Christophe, verbatim) :
//   1. documentKind='fiche' explicite + intent classifié 'document' (mésaligné) →
//      le moteur structuré DOIT être tenté en priorité, jamais le document long.
//   2. documentKind='carrousel' explicite + intent classifié 'fiche' (mésaligné) →
//      le moteur structuré NE DOIT JAMAIS être déclenché, route legacy/carrousel empruntée.
//   3. Aucun documentKind (champ libre, aucune carte cliquée) → comportement de classification
//      automatique par intent EXACTEMENT identique à avant ce correctif (non-régression totale),
//      vérifié dans les deux directions (intent='fiche' → structuré ; intent='document' avec
//      max_tokens>=4000 → document long).
//
// Bonus (articulation investigation point 3, documentKind vs images_only) : un documentKind
// explicite doit rester prioritaire même quand le planner renvoie aussi images_only=true —
// le chemin visuel dédié (LOT 30) ne doit jamais court-circuiter un type explicitement choisi.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

// adocGenerateStructuredFiche lève immédiatement ("Aucun passage RAG disponible") si
// sourceSnapshot.entries est vide, AVANT tout appel réseau — repli silencieux vers le moteur
// legacy qui, dans CE test précis, masquerait la vraie question posée (le routage a-t-il été
// tenté ?). Chaque scénario où une tentative structurée est attendue doit donc fournir de
// vrais chunks RAG (même patron que verify-live-fiche-mocked.js, déjà validé).
const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

// Même patron exact que verify-live-fiche-mocked.js (déjà validé) : le 2e appel forcé
// (emit_fiche_document) est streamé, fragmenté en input_json_delta.
function mockToolResponseSSE() {
  const input = {
    title: 'Fiche test routage', purpose: 'supervision', audience: 'clinicien',
    blocks: [
      { type: 'heading', text: 'Fiche test routage', level: 1, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
      { type: 'paragraph', text: 'Contenu de test.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
    ],
  };
  const inputJson = JSON.stringify(input);
  const chunkSize = 37;
  const fragments = [];
  for (let i = 0; i < inputJson.length; i += chunkSize) fragments.push(inputJson.slice(i, i + chunkSize));
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 100 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'emit_fiche_document', input: {} } },
    ...fragments.map(f => ({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: f } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

async function setupPage(browser, { plannerPlan }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const calls = { planner: 0, chapterPlan: 0, longChapterGen: 0, structuredForced: 0, autoDecision: 0, evaluateClarity: 0, generic: 0 };
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/fetch-image')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{ url: 'https://example.test/photo.jpg' }] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        calls.evaluateClarity++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      // Appel forcé de génération structurée (emit_fiche_document) — jamais confondu avec la
      // simple mention du nom d'outil dans le system prompt du 1er appel (tool_choice:auto).
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
        calls.structuredForced++;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE() });
        return;
      }
      // Planificateur de chapitres du moteur de document long
      if (body.includes('"max_tokens":800') && body.includes('Génère 4')) {
        calls.chapterPlan++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([{ titre: 'Chapitre 1', instructions: 'x' }, { titre: 'Chapitre 2', instructions: 'x' }]) }] }) });
        return;
      }
      if (body.includes('"max_tokens":16000') && (body.includes('Longueur cible') || body.includes('chapitre'))) {
        calls.longChapterGen++;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('Texte de chapitre normal simulé.') });
        return;
      }
      // Planificateur principal (adocPlanQuery)
      if (body.includes('"max_tokens":2000')) {
        calls.planner++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plannerPlan) }] }) });
        return;
      }
      // Décision web_search (tool_choice:auto) — utilisée par plusieurs chemins (structuré,
      // legacy standard) ; contenu neutre, seul compte qu'elle ne bloque jamais le pipeline.
      if (body.includes('"type":"auto"')) {
        calls.autoDecision++;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      // Chemin legacy standard (fallback universel) ou tout autre appel non distingué ci-dessus.
      calls.generic++;
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('Réponse générique legacy (carrousel/tableau/etc.).') });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors, calls };
}

async function submitViaLanding(page, { kindButtonId, text }) {
  // Sélection explicite d'un type sur l'écran d'accueil (#cc-landing), même flux réel qu'un
  // thérapeute cliquant une carte — jamais un raccourci de test qui poserait plan.documentKind
  // directement, pour exercer le vrai chemin window.adocPendingDocumentKind → adocClarityDocumentKind.
  if (kindButtonId) await page.click('#' + kindButtonId);
  await page.fill('#clinical-question', text);
  await page.click('#clinical-home-form button[type="submit"]');
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1. documentKind='fiche' explicite + intent classifié 'document' (mésaligné) ═══
  // → le moteur structuré doit être TENTÉ en priorité, jamais le document long.
  {
    const PLAN = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'document', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'test routage', deep_scan: false, max_tokens: 8000, images_only: false };
    const { page, errors, calls } = await setupPage(browser, { plannerPlan: PLAN });
    await submitViaLanding(page, { kindButtonId: 'format-summary', text: 'Fais-moi un document complet sur un sujet clinique quelconque' });
    await page.waitForTimeout(1500);
    log('1a. Le moteur structuré EST tenté (emit_fiche_document forcé appelé)', calls.structuredForced >= 1, calls.structuredForced);
    log('1b. Le planificateur de chapitres N\'EST JAMAIS appelé (documentKind prioritaire sur intent="document")', calls.chapterPlan === 0, calls.chapterPlan);
    log('1c. Aucune génération de chapitre "Longueur cible"', calls.longChapterGen === 0, calls.longChapterGen);
    log('1d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 2. documentKind='carrousel' explicite + intent classifié 'fiche' (mésaligné) ═══
  // → le moteur structuré ne doit JAMAIS être déclenché, route legacy/carrousel empruntée.
  {
    const PLAN = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'test routage', deep_scan: false, max_tokens: 2000, images_only: false };
    const { page, errors, calls } = await setupPage(browser, { plannerPlan: PLAN });
    await submitViaLanding(page, { kindButtonId: 'format-carousel', text: 'Fais-moi une fiche synthèse sur un sujet clinique quelconque' });
    await page.waitForTimeout(1500);
    log('2a. Le moteur structuré n\'est JAMAIS tenté (documentKind="carrousel" prioritaire sur intent="fiche")', calls.structuredForced === 0, calls.structuredForced);
    log('2b. Le planificateur de chapitres n\'est pas appelé non plus (carrousel ≠ document long)', calls.chapterPlan === 0, calls.chapterPlan);
    log('2c. La route legacy standard est bien empruntée (au moins un appel générique)', calls.generic >= 1, calls.generic);
    log('2d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3a. Non-régression — aucun documentKind, intent='fiche' → structuré comme avant ═══
  {
    const PLAN = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'test routage', deep_scan: false, max_tokens: 2000, images_only: false };
    const { page, errors, calls } = await setupPage(browser, { plannerPlan: PLAN });
    await submitViaLanding(page, { kindButtonId: null, text: 'Fais-moi une fiche synthèse sur un sujet clinique quelconque' });
    await page.waitForTimeout(1500);
    log('3a. Sans documentKind, intent="fiche" déclenche bien le moteur structuré (inchangé)', calls.structuredForced >= 1, calls.structuredForced);
    log('3b. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3b. Non-régression — aucun documentKind, intent='document' + max_tokens>=4000 → doc long ═══
  {
    const PLAN = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null, intent: 'document', clinical_intent: 'production', output_format: 'html-visual', audience_type: 'praticien', registre: 'clinique', topic_summary: 'test routage', deep_scan: false, max_tokens: 8000, images_only: false };
    const { page, errors, calls } = await setupPage(browser, { plannerPlan: PLAN });
    await submitViaLanding(page, { kindButtonId: null, text: 'Fais-moi un document complet sur un sujet clinique quelconque' });
    await page.waitForTimeout(1500);
    log('3c. Sans documentKind, intent="document" + max_tokens>=4000 déclenche le document long (inchangé)', calls.chapterPlan >= 1, calls.chapterPlan);
    log('3d. Le moteur structuré n\'est pas tenté dans ce cas (inchangé)', calls.structuredForced === 0, calls.structuredForced);
    log('3e. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 4. Bonus — articulation documentKind / images_only (investigation point 3) ═══
  // Un documentKind explicite reste prioritaire même si le planner renvoie aussi
  // images_only=true : le chemin visuel dédié (LOT 30) ne doit jamais s'appliquer ici.
  {
    const PLAN = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'document', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'test routage', deep_scan: false, max_tokens: 8000, images_only: true };
    const { page, errors, calls } = await setupPage(browser, { plannerPlan: PLAN });
    let imagePlanCalls = 0;
    await page.route('**/*', (route) => {
      const body = route.request().postData() || '';
      if ((route.request().url().includes('clone-proxy') || route.request().url().includes('workers.dev')) && body.includes('"max_tokens":700')) {
        imagePlanCalls++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ title: 'Test', images: [] }) }] }) });
        return;
      }
      route.fallback();
    });
    await submitViaLanding(page, { kindButtonId: 'format-summary', text: 'Fais-moi 4 pages de photos sur un sujet clinique, pas de texte' });
    await page.waitForTimeout(1500);
    log('4a. documentKind="fiche" explicite prioritaire sur images_only=true (chemin visuel LOT 30 jamais emprunté)', imagePlanCalls === 0, imagePlanCalls);
    log('4b. Le moteur structuré est bien tenté à la place', calls.structuredForced >= 1, calls.structuredForced);
    log('4c. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Correction rang 1, documentKind comme autorité de routage ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
