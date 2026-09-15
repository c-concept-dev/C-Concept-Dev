// Item 56, Étape 1 (recadrée à script/liens — document/cours reporté à item 56bis) —
// REPRODUCTION AVANT CORRECTIF (protocole v2, étape 0 : vérification réelle une fois).
//
// Confirme, sur le code NON modifié :
// (a) 'script' est dans l'énumération d'intents du planner mais ABSENT de _fmtFromIntent —
//     quand le planner (LLM) renvoie un output_format qu'il juge lui-même (ex. 'chat' pour un
//     texte jugé conversationnel), rien ne le corrige : fmt='chat', aucun artefact produit.
// (b) 'liens' n'apparaît même pas dans l'énumération d'intents du planner ni dans le
//     classifieur de repli local (adocBuildFallbackPlan) — un document "Liens transversaux"
//     explicitement cliqué peut donc se retrouver sans AUCUNE classification fiable, retombant
//     sur 'chat' dans le pire cas (repli local, ou LLM qui suit lui-même l'absence d'option).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><body><h1>Contenu</h1><p>Texte réel.</p></body></html>';

async function runScenario(browser, { formatButtonId, question, plannerIntent, plannerOutputFormat, label }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) {
        // Simule un modèle QUI SUIT ses instructions : ne produit un document HTML autonome
        // QUE si le system prompt le lui demande explicitement (_execContext "FORMAT : fichier
        // HTML autonome") — sinon (branche conversationnelle), répond en texte simple, jamais
        // un <!DOCTYPE html> non sollicité. Un mock qui renverrait toujours du HTML masquerait
        // exactement le risque documenté par ce lot (fmt='chat' → jamais d'artefact possible).
        const isHtmlInstructed = body.includes('FORMAT : fichier HTML autonome') || body.includes('FORMAT : HTML avec donnees embarquees');
        const reply = isHtmlInstructed ? LEGACY_HTML : 'Voici une réponse conversationnelle simple, sans balisage HTML, conforme aux instructions reçues.';
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(reply) });
        return;
      }
      // Simule le JUGEMENT LIBRE du planner LLM (aucune contrainte de schéma stricte, texte
      // JSON prose — vérifié par lecture de code : intent/output_format peuvent diverger du
      // "menu" documenté sans qu'aucune validation ne les corrige).
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: plannerIntent, clinical_intent: 'production', output_format: plannerOutputFormat, audience_type: 'praticien', registre: 'clinique', topic_summary: question.slice(0, 30), deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  if (formatButtonId) await page.click(formatButtonId);
  await page.fill('#clinical-question', question);
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1500);

  const artifactCount = await page.evaluate(() => Object.keys(window._adocArtifacts || {}).length);
  const fmts = await page.evaluate(() => Object.values(window._adocArtifacts || {}).map(a => a.fmt));
  const chatOnly = artifactCount === 0;
  console.log(`[${label}] artefacts produits: ${artifactCount} | fmts: ${JSON.stringify(fmts)} | AUCUN ARTEFACT (retombé en simple texte chat): ${chatOnly}`);
  console.log(`[${label}] erreurs JS:`, errors);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();

  console.log('=== REPRODUCTION — Item 56 Étape 1 (script/liens), code NON modifié ===\n');

  // (a) script : planner renvoie intent='script' (dans l'enum) mais output_format='chat' (jugement
  // libre du LLM, plausible pour un texte qu'il perçoit comme "à dire", pas un livrable) — rien ne
  // corrige ça aujourd'hui (_fmtFromIntent n'a pas d'entrée 'script').
  await runScenario(browser, {
    formatButtonId: '#format-script', question: 'Écris-moi un script verbatim pour accueillir un patient anxieux',
    plannerIntent: 'script', plannerOutputFormat: 'chat', label: 'script (LLM output_format=chat)',
  });

  // (b) liens : planner renvoie intent='liens' (HORS enum documenté) avec output_format='chat'.
  await runScenario(browser, {
    formatButtonId: '#format-links', question: 'Fais-moi une carte des liens transversaux entre EMDR et ICV',
    plannerIntent: 'liens', plannerOutputFormat: 'chat', label: 'liens (intent hors-enum, output_format=chat)',
  });

  // (c) liens via repli local (planner en échec réseau) — confirme que le classifieur de repli
  // (adocBuildFallbackPlan) n'a AUCUNE branche 'liens' et retombe sur 'chat'.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) { route.abort('failed'); return; } // force le repli
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.click('#format-links');
    await page.fill('#clinical-question', 'Fais-moi une carte des liens transversaux entre EMDR et ICV');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1500);
    const intentSeen = await page.evaluate(() => window.adocBuildFallbackPlan ? window.adocBuildFallbackPlan('Fais-moi une carte des liens transversaux entre EMDR et ICV').intent : 'FONCTION_INTROUVABLE');
    console.log(`[liens (repli local, planner en échec)] adocBuildFallbackPlan classe ce texte comme intent="${intentSeen}" (jamais 'liens' aujourd'hui)`);
    console.log('[liens (repli)] erreurs JS:', errors);
    await page.close();
  }

  await browser.close();
})();
