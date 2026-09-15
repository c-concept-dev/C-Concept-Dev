// Bug confirmé — la porte de clarté ignorait le type de document déjà choisi sur l'écran
// d'accueil. Cause confirmée par lecture de code AVANT correction (adocEvaluateClarity ne
// recevait jamais adocClarityDocumentKind). Corrigé : explicitDocumentKind transmis dans le
// context, injecté dans userContent ("TYPE DE DOCUMENT DÉJÀ CHOISI"), ADOC_CLARITY_SYSTEM_PROMPT
// instruit de ne jamais le questionner quand ce champ est présent.
//
// Flux RÉEL exercé de bout en bout (seul le réseau — réponses du Worker — est mocké, jamais la
// logique JS de l'app elle-même) : pour chaque type + le cas "aucun type", on inspecte le VRAI
// corps de requête envoyé à evaluate_clarity (preuve que l'information part bien), puis on
// simule un modèle qui respecte la consigne (clarifie sur un autre point, ou juge prêt) pour
// vérifier que le reste du pipeline s'enchaîne normalement jusqu'à la génération, avec le bon
// documentKind sur le plan final.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const MOCK_RAG_CHUNKS = [{ content: "x", book_title: 'y', author: 'z', page_number: 1 }];
function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><body><h1>Doc</h1><p>Contenu.</p></body></html>';

const HOME_BUTTON = { fiche: '#format-summary', carrousel: '#format-carousel', tableau: '#format-table', script: '#format-script', liens: '#format-links' };
const EXPECTED_LABEL = { fiche: 'fiche synthèse', carrousel: 'carrousel', tableau: 'tableau', script: 'script', liens: 'liens transversaux' };
// Snippet propre à chaque type dans _documentKindInstructions (adocBuildSystemPrompt) — preuve
// directe que documentKind a bien atteint le VRAI prompt système de génération, contrairement à
// _adocDocumentKind (uniquement posé lors d'un repli structuré->legacy, donc absent pour 4 des 5
// types qui ne tentent jamais le moteur structuré).
const EXPECTED_INSTRUCTION_SNIPPET = { fiche: 'Fiche de synthèse structurée', carrousel: 'Carrousel de diapositives', tableau: 'Tableau comparatif', script: 'Script verbatim', liens: 'Liens transversaux' };

function baseRoutes(page, onEvaluateClarity, onGenerate) {
  let clarityCallCount = 0;
  return page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        clarityCallCount++;
        onEvaluateClarity(route, body, clarityCallCount);
        return;
      }
      if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé' } }) }); return; }
      if (body.includes('"max_tokens":16000')) { if (onGenerate) onGenerate(body); route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
      const plan = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'sujet', deep_scan: false, max_tokens: 2000, images_only: false };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
}

function readyJudgment() {
  return { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] };
}
function clarifyOnAudience() {
  return { status: 'needs_clarification', understood_so_far: 'Compris.', missing: ['public visé'], question: 'Pour qui ce document est-il destiné ?', quick_replies: ['Praticiens', 'Patients'], assumptions_if_proceeding: [] };
}
function fulfillClarity(route, judgment) {
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: judgment }] }) });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1-5. Chacun des 5 types cliqué explicitement — la requête envoyée au modèle porte bien
  //    "TYPE DE DOCUMENT DÉJÀ CHOISI", et le pipeline continue normalement (clarification sur un
  //    AUTRE point acceptée, puis génération avec le bon documentKind). ═══
  for (const kind of Object.keys(HOME_BUTTON)) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let firstCallBody = null;
    let genRequestBody = null;
    await baseRoutes(page, (route, body, n) => {
      if (n === 1) { firstCallBody = body; fulfillClarity(route, clarifyOnAudience()); return; }
      fulfillClarity(route, readyJudgment());
    }, (body) => { if (!genRequestBody) genRequestBody = body; });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.click(HOME_BUTTON[kind]);
    await page.fill('#clinical-question', 'Fais-moi un document sur un sujet clinique quelconque');
    await page.click('#clinical-home-form button[type="submit"]');

    await page.waitForSelector('.cc-clarity-reply-btn', { timeout: 10000 });
    log(kind + ' — 1. La requête envoyée à evaluate_clarity contient bien "TYPE DE DOCUMENT DÉJÀ CHOISI : ' + EXPECTED_LABEL[kind] + '"', firstCallBody && firstCallBody.includes('TYPE DE DOCUMENT DÉJÀ CHOISI') && firstCallBody.includes(EXPECTED_LABEL[kind]), firstCallBody ? firstCallBody.slice(firstCallBody.indexOf('DEMANDE DU')) : null);

    const cardQuestion = await page.evaluate(() => document.querySelector('.cc-clarity-question span')?.textContent);
    log(kind + ' — 2. La clarification affichée porte bien sur un AUTRE point (public visé), jamais le type', cardQuestion === 'Pour qui ce document est-il destiné ?', cardQuestion);

    // Répond à la clarification (sur le public visé) — le pipeline doit continuer normalement.
    await page.click('.cc-clarity-reply-btn >> nth=0');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html' || a.fmt === 'html'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    // _adocDocumentKind n'est posé que sur le repli structuré->legacy (fiche uniquement) — preuve
    // directe et fiable pour TOUS les types : le vrai prompt système de génération porte bien le
    // snippet _documentKindInstructions propre au type choisi.
    log(kind + ' — 3. Le document final est bien généré avec les instructions système propres au type explicitement choisi (jamais perdu en route)', genRequestBody && genRequestBody.includes(EXPECTED_INSTRUCTION_SNIPPET[kind]), genRequestBody ? genRequestBody.slice(genRequestBody.indexOf('"system"'), genRequestBody.indexOf('"system"') + 400) : null);
    log(kind + ' — 4. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 6. AUCUNE carte cliquée — comportement STRICTEMENT inchangé (non-régression) ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let firstCallBody = null;
    await baseRoutes(page, (route, body, n) => {
      if (n === 1) { firstCallBody = body; fulfillClarity(route, { status: 'needs_clarification', understood_so_far: 'Compris.', missing: ['type de document'], question: 'Quel type de document clinique souhaitez-vous produire ?', quick_replies: ['Fiche', 'Tableau', 'Script'], assumptions_if_proceeding: [] }); return; }
      fulfillClarity(route, readyJudgment());
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    // Aucun clic sur une carte de type — champ libre uniquement.
    await page.fill('#clinical-question', 'Fais-moi un document sur un sujet clinique quelconque');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForSelector('.cc-clarity-reply-btn', { timeout: 10000 });

    // Note : "TYPE DE DOCUMENT DÉJÀ CHOISI" seul apparaît désormais TOUJOURS dans le prompt système
    // (nom générique de la section évoquée dans la consigne), qu'un type ait été choisi ou non — ce
    // n'est donc pas ce qu'il faut chercher ici. Seule l'injection RÉELLE dans userContent porte le
    // suffixe " (irrévocable" ; sa présence/absence est le seul signal fiable de non-régression.
    log('Aucun type — 1. La requête NE contient PAS l\'injection "TYPE DE DOCUMENT DÉJÀ CHOISI (irrévocable" (rien à transmettre, comportement inchangé)', firstCallBody && !firstCallBody.includes('TYPE DE DOCUMENT DÉJÀ CHOISI (irrévocable'), firstCallBody ? firstCallBody.slice(firstCallBody.indexOf('DEMANDE DU')) : null);
    const cardQuestion = await page.evaluate(() => document.querySelector('.cc-clarity-question span')?.textContent);
    log('Aucun type — 2. La question sur le TYPE de document peut toujours être posée (comportement strictement inchangé)', cardQuestion === 'Quel type de document clinique souhaitez-vous produire ?', cardQuestion);
    log('Aucun type — 3. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Bug clarté ignore documentKind déjà choisi ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
