// BUG CRITIQUE — SyntaxError cassant le rendu de Script verbatim (intent=script, fmt=txt) dès
// qu'une apostrophe française apparaît dans les données de citation (titre/auteur d'un livre
// réellement cité, ex. "L'attachement" ou "Bowlby, John") OU dans le texte généré lui-même
// ("n'oublie pas"). Reproduit le VRAI pipeline (adocSend réel) avec des données RAG et un texte
// modèle contenant délibérément apostrophes, guillemets français « » et [REF:n], puis vérifie
// (a) qu'aucune erreur JS n'est levée, (b) que les [REF:n] sont bien convertis en <sup> cliquables
// (pas laissés bruts), (c) qu'un clic ouvre le bon panneau de référence avec les bonnes données.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

// Données volontairement piégeuses : apostrophes françaises dans titre ET auteur, comme le vrai
// cas rapporté (livre de Bowlby, John).
const MOCK_RAG_CHUNKS = [
  { content: "L'attachement se construit dans les premières interactions.", book_title: "L'attachement, une théorie du lien", author: 'Bowlby, John', page_number: 42 },
  { content: "La rupture n'efface pas le lien, elle le transforme.", book_title: 'Amour et rupture, les destins des couples', author: "d'Aubigné, Marie", page_number: 118 },
];

// Texte modèle réaliste, avec apostrophes/guillemets partout, deux [REF:n], et une phrase
// contenant exactement le mot piège du rapport ("n'oublie").
const MODEL_REPLY = "SCÈNE 1\n\nTHÉRAPEUTE : N'oublie pas que l'attachement [REF:1] se rejoue "
  + "ici, c'est-à-dire dans « l'instant présent » de la séance. La rupture n'efface pas le lien "
  + "[REF:2], elle le transforme — d'où l'importance d'un cadre sécurisant.\n\n"
  + "PATIENT·E : C'est-à-dire que je n'ai pas à « tout reconstruire » ?\n";

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
        const plan = { needs_rag: true, searches: [{ terms: ['attachement'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'script', clinical_intent: 'production', output_format: 'txt', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Script de séance sur attachement et rupture', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(MODEL_REPLY) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'Écris-moi un script de séance sur l\'attachement et la rupture');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1500);

  console.log('=== errors (attendu : aucune) ===', errors);
  console.log('=> AUCUNE SyntaxError levée:', !errors.some(e => /SyntaxError/.test(e)));

  const state = await page.evaluate(() => {
    const bubble = document.querySelector('.adoc-bubble');
    const rawText = bubble ? bubble.innerHTML : '';
    const refs = Array.from(document.querySelectorAll('.adoc-ref'));
    return {
      bubblePresent: !!bubble,
      containsRawRefMarker: rawText.includes('[REF:1]') || rawText.includes('[REF:2]'),
      refSupCount: refs.length,
      refTexts: refs.map(r => r.textContent),
      bodyContainsApostropheText: rawText.includes('N’oublie') || rawText.includes("N'oublie") || rawText.includes('oublie'),
    };
  });
  console.log('\n=== état du rendu ===', state);
  console.log('=> aucun marqueur [REF:n] laissé brut dans le texte:', !state.containsRawRefMarker);
  console.log('=> les 2 [REF:n] ont bien été convertis en <sup class="adoc-ref">:', state.refSupCount === 2);

  if (state.refSupCount >= 1) {
    console.log('\n=== clic sur le 1er marqueur de référence (apostrophes dans book_title ET author) ===');
    let clickError = null;
    try {
      await page.locator('.adoc-ref').first().click({ timeout: 5000 });
    } catch (e) { clickError = e.message; }
    await page.waitForTimeout(300);
    const panel = await page.evaluate(() => {
      const p = document.getElementById('adoc-ref-panel');
      return p ? { present: true, html: p.innerHTML } : { present: false };
    });
    console.log('erreur de clic:', clickError);
    console.log('panneau de référence ouvert:', panel.present);
    console.log('=> contient bien le titre réel (avec son apostrophe) "L\'attachement":', panel.html?.includes('attachement'));
    console.log('=> contient bien l\'auteur réel "Bowlby, John":', panel.html?.includes('Bowlby'));
  }

  const dupState = await page.evaluate(() => ({
    // 2 bulles .adoc-bubble attendues normalement : la question de l'utilisatrice + la
    // réponse de l'assistant (pas un signe de doublon en soi) — le vrai signal de duplication
    // est sceneOccurrences (le texte de la réponse apparaissant deux fois).
    bubbleCount: document.querySelectorAll('.adoc-bubble').length,
    assistantBubbleCount: document.querySelectorAll('.adoc-msg.assistant').length,
    sceneOccurrences: (document.body.textContent.match(/SCÈNE 1/g) || []).length,
  }));
  console.log('\n=== conséquence #2 rapportée — contenu dupliqué ? ===', dupState);
  console.log('=> une seule bulle assistant, une seule occurrence du texte (pas de doublon streaming/final):', dupState.assistantBubbleCount === 1 && dupState.sceneOccurrences === 1);

  console.log('\n=== point 5 — pied de citations (.adoc-citations), titre/auteur avec apostrophes ===');
  const citeState = await page.evaluate(() => {
    const el = document.querySelector('.adoc-citations');
    return el ? { present: true, html: el.innerHTML } : { present: false };
  });
  console.log(citeState);
  if (citeState.present) {
    console.log('=> titre complet "Amour et rupture, les destins des couples" présent SANS troncature:', citeState.html.includes('Amour et rupture, les destins des couples'));
    console.log('=> auteur "d\'Aubigné, Marie" apparaît UNE SEULE fois (pas de duplication):', (citeState.html.match(/d.Aubigné, Marie/g) || []).length === 1);
    console.log('=> aucun score affiché (champ c.score vs c._score — voir rapport):', !/adoc-cite-score">\d/.test(citeState.html));
  }

  await page.screenshot({ path: '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/xlsx-test/ref-injection-fixed.png', fullPage: true });
  console.log('\n=== errors (final) ===', errors);
  await browser.close();
})();
