// Correction rang 2 — images_only ne doit jamais avaler une demande mixte texte + images.
//
// Cause confirmée par audit : le plan fusionné (adocMultiPlan, FIX-MULTI-PLAN) calculait
// `images_only: plans.some(p => p.images_only === true)` — UNE SEULE sous-question classée
// visuelle suffisait à faire basculer TOUTE la demande fusionnée sur le chemin léger "images
// seules" (LOT 30), qui ne génère jamais de texte substantiel. Une demande mixte (partie texte
// réelle + partie "uniquement des photos") perdait donc silencieusement sa partie textuelle.
// Correctif : `.every()` — le chemin léger n'est emprunté QUE si TOUTES les sous-questions sont
// visuelles ; un mélange retombe sur le traitement standard (texte produit normalement).
//
// Trois scénarios obligatoires (Christophe, verbatim) :
//   1. Demande composée réellement mixte → chemin images seules JAMAIS emprunté, texte présent.
//   2. Demande composée entièrement visuelle → chemin images seules emprunté (non-régression LOT 30).
//   3. Demande simple, non composée, purement textuelle → aucun changement (non-régression totale).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

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

// adocMultiPlan appelle adocPlanQuery(q) PAR sous-question (une requête réseau par sous-
// question splittée) — le mock doit donc distinguer les sous-questions par leur contenu propre
// (transmis dans le corps de la requête), jamais par un simple compteur d'appel générique.
async function setupPage(browser, { planByQuestionMarker } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const calls = { plannerPerQuestion: 0, imagePlan: 0, chapterPlan: 0, longChapterGen: 0, standardGen: 0 };
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('/fetch-image')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{ url: 'https://example.test/photo.jpg' }] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      // Planificateur de chapitres (moteur de document long)
      if (body.includes('"max_tokens":800') && body.includes('Génère 4')) {
        calls.chapterPlan++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([{ titre: 'Chapitre 1', instructions: 'x' }]) }] }) });
        return;
      }
      if (body.includes('"max_tokens":16000') && (body.includes('Longueur cible') || body.includes('chapitre'))) {
        calls.longChapterGen++;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('Texte de chapitre simulé.') });
        return;
      }
      // Planificateur principal (adocPlanQuery), appelé UNE FOIS PAR sous-question. Le corps
      // embarque "Échanges récents : ... <TEXTE COMPLET ORIGINAL> ... Demande actuelle : <sous-
      // question>" — le texte complet (donc chaque marqueur, quelle que soit la sous-question
      // visée) apparaît TOUJOURS dans "Échanges récents", ce qui a fait échouer une première
      // version de ce test (elle ne distinguait pas les 2 appels, un même marqueur matchant les
      // deux). Seul le contenu du champ isolé "Demande actuelle : " identifie sans ambiguïté
      // LAQUELLE des sous-questions est réellement planifiée par cet appel précis.
      if (body.includes('"max_tokens":2000')) {
        const daIdx = body.indexOf('Demande actuelle : ');
        const currentQuestionText = daIdx >= 0 ? body.slice(daIdx + 'Demande actuelle : '.length) : '';
        for (const [marker, plan] of Object.entries(planByQuestionMarker || {})) {
          if (currentQuestionText.includes(marker)) {
            calls.plannerPerQuestion++;
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
            return;
          }
        }
        // Sous-question non reconnue : échec explicite plutôt qu'une réponse plausible qui
        // masquerait un mock mal aligné sur le texte réellement splitté.
        route.fulfill({ status: 500, body: 'unrecognized sub-question in mock' });
        return;
      }
      // Planification des images (adocVisualOnlyDoc)
      if (body.includes('"max_tokens":700')) {
        calls.imagePlan++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ title: 'Test', images: [
          { query: 'parent child bond photography', alt: 'Un parent et son enfant complices' },
        ] }) }] }) });
        return;
      }
      // Chemin standard (legacy, texte)
      calls.standardGen++;
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE("Texte réel sur la théorie de l'attachement, plusieurs paragraphes simulés ici pour le test de non-régression.") });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors, calls };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1. Demande composée MIXTE (une sous-question texte + une sous-question visuelle) ═══
  {
    const TEXT = "Fais-moi un résumé texte sur la théorie de l'attachement.\n\nEt fais-moi une planche de 3 photos illustrant le lien parent-enfant, sans texte.";
    const TEXT_PLAN = { needs_rag: true, searches: [{ terms: ['attachement'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'théorie attachement', deep_scan: false, max_tokens: 2000, images_only: false };
    const IMG_PLAN = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null, intent: 'document', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'photos lien parent-enfant', deep_scan: false, max_tokens: 4000, images_only: true };
    const { page, errors, calls } = await setupPage(browser, { planByQuestionMarker: { 'attachement': TEXT_PLAN, 'planche de 3 photos': IMG_PLAN } });
    await page.fill('#clinical-question', TEXT);
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({
      artifactCount: Object.keys(window._adocArtifacts || {}).length,
      lastMsg: (() => {
        const bubbles = document.querySelectorAll('.adoc-bubble');
        return bubbles.length ? bubbles[bubbles.length - 1].textContent : '';
      })(),
    }));
    log('1a. Les 2 sous-questions ont bien été planifiées séparément', calls.plannerPerQuestion === 2, calls.plannerPerQuestion);
    log('1b. Le chemin images seules N\'EST JAMAIS emprunté (mélange → traitement standard)', calls.imagePlan === 0, calls.imagePlan);
    log('1c. Le chemin standard (texte) EST emprunté', calls.standardGen >= 1, calls.standardGen);
    log('1d. Le texte réel demandé est bien présent dans le résultat final', state.lastMsg.includes("théorie de l'attachement") || state.lastMsg.includes('attachement'), state.lastMsg.slice(0, 200));
    log('1e. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 2. Demande composée ENTIÈREMENT VISUELLE (non-régression LOT 30) ═══
  {
    const TEXT = "Fais-moi une planche de photos sur le lien parent-enfant, sans texte.\n\nEt aussi une planche de photos sur la théorie de l'attachement, uniquement du visuel.";
    const IMG_PLAN_1 = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null, intent: 'document', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'photos lien parent-enfant', deep_scan: false, max_tokens: 4000, images_only: true };
    const IMG_PLAN_2 = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null, intent: 'document', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'photos théorie attachement', deep_scan: false, max_tokens: 4000, images_only: true };
    const { page, errors, calls } = await setupPage(browser, { planByQuestionMarker: { 'lien parent-enfant': IMG_PLAN_1, "théorie de l'attachement": IMG_PLAN_2 } });
    await page.fill('#clinical-question', TEXT);
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1500);
    log('2a. Les 2 sous-questions ont bien été planifiées séparément', calls.plannerPerQuestion === 2, calls.plannerPerQuestion);
    log('2b. Le chemin images seules EST emprunté (toutes les sous-questions visuelles)', calls.imagePlan >= 1, calls.imagePlan);
    log('2c. Aucun appel au planificateur de chapitres (moteur de document long jamais invoqué)', calls.chapterPlan === 0, calls.chapterPlan);
    log('2d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3. Demande simple, non composée, purement textuelle (non-régression totale) ═══
  {
    const TEXT = "Fais-moi un document complet sur l'attachement dans le couple, avec explications détaillées et références cliniques précises pour bien comprendre les enjeux.";
    const PLAN = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'document', clinical_intent: 'production', output_format: 'html-visual', audience_type: 'praticien', registre: 'clinique', topic_summary: 'attachement couple', deep_scan: false, max_tokens: 8000, images_only: false };
    const { page, errors, calls } = await setupPage(browser, { planByQuestionMarker: { '': PLAN } }); // question unique, non splittée → un seul plan
    await page.fill('#clinical-question', TEXT);
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(2000);
    log('3a. Une seule sous-question (jamais splittée) — un seul appel planificateur', calls.plannerPerQuestion === 1, calls.plannerPerQuestion);
    log('3b. Le moteur de document long est bien emprunté comme avant (intent=document, max_tokens>=4000)', calls.chapterPlan >= 1, calls.chapterPlan);
    log('3c. Le chemin images seules n\'est jamais emprunté pour une demande purement textuelle', calls.imagePlan === 0, calls.imagePlan);
    log('3d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Correction rang 2, images_only vs demande mixte ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
