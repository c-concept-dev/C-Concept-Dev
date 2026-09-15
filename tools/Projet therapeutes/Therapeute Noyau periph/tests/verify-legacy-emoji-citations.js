// P4 + P5 — vérifie que le pipeline "ancien moteur" (Carrousel, Liens transversaux) :
// (1) retire bien les emojis du HTML livré (adocStripEmoji maintenant appliqué au chemin
//     HTML-first, jusqu'ici jamais filtré pour ces formats — 24 emojis constatés sur un vrai
//     document Liens transversaux) ;
// (2) envoie bien au modèle l'instruction citation renforcée (interdiction explicite des
//     mentions nues type "(Young)", obligation du <sup title="Auteur, p.XX">n</sup>) — la
//     conformité du MODÈLE reste non garantie depuis un mock (c'est un LLM réel qui doit la
//     suivre), donc ce test vérifie que l'instruction part bien dans le prompt, pas que le
//     modèle réel l'appliquera.
const { chromium } = require('playwright');

const MOCK_RAG_CHUNKS = Array.from({ length: 5 }, (_, i) => ({
  content: 'Passage clinique fictif n°' + i + ' sur les schémas de Young.',
  book_title: 'Ouvrage ' + i, author: 'Young, Jeffrey', page_number: i + 1,
}));

// HTML modèle réaliste et volontairement emoji-laden (comme le vrai cas Liens transversaux :
// ronds de couleur + icônes de section) + une citation nue "(Young)" pour vérifier qu'elle
// n'est PAS convertie automatiquement (le test ne doit pas mentir sur ce point).
const MODEL_HTML_REPLY = '<!DOCTYPE html><html><head><style>body{background:#f6f2ea}</style></head><body>'
  + '<h1>🗺 Carte des liens transversaux</h1>'
  + '<p>🔴 Schéma d\'abandon — 🔵 Schéma de méfiance — ⚫ Schéma d\'imperfection</p>'
  + '<p>🔍 Analyse : Young pose 18 schémas (Young), en lien avec l\'attachement <sup title="Bowlby, p.42">1</sup>.</p>'
  + '<p>⚙ Mécanismes : 🎯 régulation, 📐 structure.</p>'
  + '</body></html>';

function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + 'data: [DONE]\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => console.log('  [console]', m.text()));

  let deliveredHtml = null;
  let mainCallSystemPrompt = null;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/search-library')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || '';
      let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const p = body.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'evaluate_clarity') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (bodyRaw.includes('needs_rag') || bodyRaw.includes('TÂCHE')) {
        const plan = { needs_rag: true, searches: [{ terms: ['Young', 'schémas'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'carrousel', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Carrousel sur les schémas de Young', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        mainCallSystemPrompt = p.system;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(MODEL_HTML_REPLY) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const r = document.getElementById('format-carousel');
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.fill('#clinical-question', "les schémas de Young et l'attachement");
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1500);

  deliveredHtml = await page.evaluate(() => {
    const keys = Object.keys(window._adocArtifacts || {});
    for (const k of keys) {
      const a = window._adocArtifacts[k];
      if (a.html) return a.html;
      if (a.htmlSource) return a.htmlSource; // fmt==='zip' (html-visual → zip) stocke ici
    }
    return null;
  });

  const bubbleTexts = await page.evaluate(() => Array.from(document.querySelectorAll('.adoc-bubble')).map(b => b.textContent));
  console.log('=== bulles de chat (diagnostic) ===', bubbleTexts);

  console.log('=== P4 — filtre emoji sur le chemin ancien moteur (Liens transversaux) ===');
  if (!deliveredHtml) {
    console.log('ÉCHEC — aucun artifact HTML livré.');
  } else {
    const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}️‍]/gu;
    const remaining = deliveredHtml.match(EMOJI_RE) || [];
    console.log('emojis restants dans le HTML livré:', remaining);
    console.log('=> AUCUN emoji restant (24 constatés en réel, 0 attendu ici):', remaining.length === 0);
    console.log('=> le texte réel est toujours présent (pas de perte de contenu, juste les emojis retirés):', deliveredHtml.includes("Schéma d'abandon") && deliveredHtml.includes('régulation'));
    console.log('=> la citation <sup title="Bowlby, p.42"> déjà correcte est préservée (pas touchée par le filtre):', deliveredHtml.includes('<sup title="Bowlby, p.42">1</sup>'));
  }

  console.log('\n=== P5 — instruction citation renforcée bien envoyée au modèle ===');
  if (!mainCallSystemPrompt) {
    console.log('ÉCHEC — system prompt de l\'appel principal non capté.');
  } else {
    console.log('=> interdiction explicite des mentions nues "(Young)"/"(Bowlby)" présente dans le prompt système:', mainCallSystemPrompt.includes('"(Young)"') && mainCallSystemPrompt.includes('CITATIONS OBLIGATOIRES'));
    console.log('=> NOTE : ceci vérifie seulement que l\'instruction est bien transmise — la conformité du modèle réel reste à confirmer en conditions réelles (LLM, pas garanti déterministe).');
  }

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
