// LOT 30 — chemin dédié pour une demande "images seules, sans texte" : jamais routée vers le
// générateur de document long (chapitres, plancher de 8000 tokens, instruction "800-1500 mots
// par chapitre"). Vérifie : reconnaissance images_only, chemin adocVisualOnlyDoc emprunté seul,
// zéro appel au planificateur de chapitres, résultat livré comme un document HTML normal
// (export/colonne), ET non-régression totale du moteur de document long pour une demande
// textuelle classique.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

async function setupPage(browser, { plannerPlan, chapterCallCount, longChapterCallCount } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const calls = { planner: 0, imagePlan: 0, chapterPlan: 0, longChapterGen: 0, fetchImage: 0, evaluateClarity: 0 };
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/fetch-image')) {
      calls.fetchImage++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{ url: 'https://example.test/photo.jpg' }] }) });
      return;
    }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        calls.evaluateClarity++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      // Planificateur de chapitres du moteur de document long — max_tokens:800 (chapPrompt)
      if (body.includes('"max_tokens":800') && body.includes('Génère 4')) {
        calls.chapterPlan++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([{ titre: 'Chapitre 1', instructions: 'x' }, { titre: 'Chapitre 2', instructions: 'x' }]) }] }) });
        return;
      }
      // Génération d'un chapitre du moteur de document long — max_tokens:16000 dans ce contexte
      if (body.includes('"max_tokens":16000') && (body.includes('Longueur cible') || body.includes('chapitre'))) {
        calls.longChapterGen++;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('Texte de chapitre normal, plusieurs centaines de mots simulés ici pour le test.') });
        return;
      }
      // Planificateur principal (adocPlanQuery) — max_tokens:2000
      if (body.includes('"max_tokens":2000')) {
        calls.planner++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plannerPlan) }] }) });
        return;
      }
      // Planification des images (adocVisualOnlyDoc) — max_tokens:700
      if (body.includes('"max_tokens":700')) {
        calls.imagePlan++;
        const targetCount = /(\d+)/.test(body) ? undefined : undefined;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ title: 'Attachement dans le couple', images: [
          { query: 'couple holding hands therapy', alt: 'Un couple se tenant la main en séance' },
          { query: 'couple eye contact emotional connection', alt: 'Un couple en contact visuel émotionnel' },
          { query: 'therapist couple session room', alt: 'Une salle de séance de thérapie de couple' },
          { query: 'couple comfort embrace support', alt: 'Un couple se réconfortant par une étreinte' },
        ] }) }] }) });
        return;
      }
      // Tout autre appel générique (ex. génération standard hors document long) — SSE vide
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('Réponse générique de test.') });
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

  // ═══ 2. Test obligatoire — demande visuelle pure, bout en bout, planner en échec (repli local) ═══
  // plannerPlan:null force adocPlanQuery à échouer (texte "null" non parsable), ce qui exerce
  // le VRAI code de _fallback (jamais un simulacre) — exactement le repli visé par le lot.
  {
    const TEXT = "Fais-moi 4 pages de photos sur l'attachement dans le couple, pas de texte";
    const { page, errors, calls } = await setupPage(browser, { plannerPlan: null }); // planner renvoie null → repli local _fallback
    await page.fill('#clinical-question', TEXT);
    // Sélection explicite "Fiche synthèse" évitée : ce test veut la classification NATURELLE
    // (intent=document, comme documenté dans le rapport d'audit du lot).
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({
      artifactCount: Object.keys(window._adocArtifacts || {}).length,
      firstArtifactHtml: Object.values(window._adocArtifacts || {})[0]?.html || null,
      // adocThinking est une variable de portée module (IIFE), jamais exposée sur window —
      // le bouton d'envoi est le proxy externe fiable de son état (cf. _adocResetSendState).
      sendBtnDisabled: document.getElementById('adoc-send-btn')?.disabled,
    }));
    const imgCount = state.firstArtifactHtml ? (state.firstArtifactHtml.match(/<img /g) || []).length : 0;
    log('2a. Un artefact HTML est bien produit (chemin visuel emprunté)', state.artifactCount >= 1, state.artifactCount);
    log('2b. Aucun appel au planificateur de chapitres (moteur de document long jamais invoqué)', calls.chapterPlan === 0, calls.chapterPlan);
    log('2c. Aucun appel de génération de chapitre "Longueur cible"', calls.longChapterGen === 0, calls.longChapterGen);
    log('2d. Le chemin léger de planification d\'images a bien été appelé', calls.imagePlan >= 1, calls.imagePlan);
    log('2e. Le document produit contient des balises <img> (images résolues)', imgCount > 0, imgCount);
    log('2f. Bouton d\'envoi réactivé après coup (jamais bloqué indéfiniment)', state.sendBtnDisabled === false, state.sendBtnDisabled);
    log('2g. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3. Non-régression — demande de document normale (avec texte) reste sur le moteur long ═══
  {
    const NORMAL_PLAN = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'document', clinical_intent: 'production', output_format: 'html-visual', audience_type: 'praticien', registre: 'clinique', topic_summary: 'attachement couple', deep_scan: false, max_tokens: 8000, images_only: false };
    const { page, errors, calls } = await setupPage(browser, { plannerPlan: NORMAL_PLAN });
    await page.fill('#clinical-question', 'Fais-moi un document complet sur l\'attachement dans le couple, avec explications détaillées');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(2500);
    log('3a. Le planificateur de chapitres EST appelé (moteur de document long inchangé)', calls.chapterPlan >= 1, calls.chapterPlan);
    log('3b. Le chemin de planification d\'images n\'est jamais emprunté pour une demande normale', calls.imagePlan === 0, calls.imagePlan);
    log('3c. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — LOT 30, chemin "images seules, sans texte" ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
