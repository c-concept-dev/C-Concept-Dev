// FIL 1 (priorité) — reproduit EXACTEMENT le scénario rapporté : générer une Fiche structurée
// avec succès, PUIS demander un Tableau comparatif qui déclenche une clarification, et vérifier
// si les boutons de suggestion répondent au clic. Diagnostic par inspection réelle
// (elementFromPoint, adocThinking, spy sur adocSend) — pas une supposition.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_RAG_CHUNKS = [
  { content: "Passage clinique fictif suffisant pour un test de bout en bout.", book_title: 'Livre test', author: 'Auteur', page_number: 1 },
];

function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + 'data: [DONE]\n\n';
}
function toolResponseSSE(input) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }) + 'data: [DONE]\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.text().includes('UX-8A') || m.text().includes('Clarity') || m.text().includes('Planner')) console.log('  [console]', m.text()); });

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/search-library')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || '';
      let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const p = body.payload || {};

      // evaluate_clarity — distingue la 1re demande (Fiche, prête) de la 2e (Tableau, floue)
      if (p.tool_choice && p.tool_choice.name === 'evaluate_clarity') {
        const isTableauReq = bodyRaw.includes('EMDR');
        if (isTableauReq) {
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: {
            status: 'needs_clarification', understood_so_far: 'Comparer EMDR, ICV et IFS.',
            missing: ['niveau de détail'], question: 'Quel niveau de détail souhaitez-vous pour ce tableau comparatif ?',
            quick_replies: ['Vue synthétique (grandes lignes)', 'Comparaison détaillée (indications, techniques, durée)'],
            assumptions_if_proceeding: [],
          } }] }) });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: {
            status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [],
          } }] }) });
        }
        return;
      }
      // 1er appel structuré (décision web_search, tool_choice:auto)
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      // 2e appel structuré (génération forcée)
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') {
        const input = { title: 'Fiche test', purpose: 'psychoéducation', audience: 'clinicien', blocks: [
          { type: 'heading', text: 'Titre', level: 1, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
          { type: 'paragraph', text: 'Contenu valide et complet.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
        ] };
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE(input) });
        return;
      }
      // Planner
      if (bodyRaw.includes('needs_rag') || bodyRaw.includes('TÂCHE')) {
        const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'test', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== ÉTAPE 1 — générer une Fiche structurée jusqu\'au succès complet ===');
  await page.fill('#clinical-question', 'Fais-moi une fiche synthèse sur un sujet clinique quelconque');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1500);
  const step1 = await page.evaluate(() => ({
    hasStructuredArtifact: Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc),
    adocThinking: window.adocThinking, // probablement undefined si non exposée — informatif seulement
    sendBtnDisabled: document.getElementById('adoc-send-btn')?.disabled,
  }));
  console.log(step1);
  console.log('=> Fiche générée avec succès (artifact présent):', step1.hasStructuredArtifact);

  console.log('\n=== ÉTAPE 2 — SANS recharger, demander un Tableau comparatif EMDR/ICV/IFS ===');
  await page.fill('#adoc-input', 'Fais-moi un tableau comparatif EMDR / ICV / IFS');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(800);

  const cardState = await page.evaluate(() => {
    const card = document.querySelector('.cc-clarity-card');
    const btn = card ? card.querySelector('.cc-clarity-reply-btn') : null;
    return {
      cardPresent: !!card,
      btnPresent: !!btn,
      btnText: btn ? btn.textContent : null,
      inputValueBefore: document.getElementById('adoc-input')?.value,
    };
  });
  console.log(cardState);
  console.log('=> carte de clarification affichée:', cardState.cardPresent);

  if (cardState.cardPresent && cardState.btnPresent) {
    console.log('\n=== ÉTAPE 3 — DIAGNOSTIC : le clic sur le bouton de suggestion a-t-il un effet ? ===');
    const diag = await page.evaluate(() => {
      const btn = document.querySelector('.cc-clarity-card .cc-clarity-reply-btn');
      const rect = btn.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const elAtPoint = document.elementFromPoint(cx, cy);
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        elAtPointIsButton: elAtPoint === btn,
        elAtPointTag: elAtPoint ? elAtPoint.tagName + (elAtPoint.className ? '.' + elAtPoint.className.toString().replace(/\s+/g, '.') : '') : null,
        elAtPointHTML: elAtPoint ? elAtPoint.outerHTML.slice(0, 200) : null,
      };
    });
    console.log(diag);
    console.log('=> elementFromPoint retourne bien LE BOUTON lui-même (pas un élément intercepteur):', diag.elAtPointIsButton);

    // Espionne adocSend et adocClarityQuickReply pour savoir s'ils sont appelés.
    await page.evaluate(() => {
      window._diag = { quickReplyCalled: false, sendCalled: false };
      const origQuickReply = window.adocClarityQuickReply;
      window.adocClarityQuickReply = function (text) {
        window._diag.quickReplyCalled = true;
        return origQuickReply(text);
      };
      const origSend = window.adocSend;
      window.adocSend = function () {
        window._diag.sendCalled = true;
        window._diag.sendBtnDisabledAtCall = document.getElementById('adoc-send-btn')?.disabled;
        return origSend.apply(this, arguments);
      };
    });

    console.log('\n=== ÉTAPE 3bis — VRAI clic Playwright (hit-testing réel, pas btn.click() synthétique) ===');
    let realClickError = null;
    try {
      await page.locator('.cc-clarity-card .cc-clarity-reply-btn').first().click({ timeout: 5000 });
    } catch (e) {
      realClickError = e.message;
    }
    await page.waitForTimeout(400);
    const clickResult = await page.evaluate(() => {
      const result = Object.assign({}, window._diag, {
        inputValueAfter: document.getElementById('adoc-input')?.value,
        cardStillPresent: !!document.querySelector('.cc-clarity-card'),
        answerAppended: !!document.querySelector('.cc-clarity-answer'),
      });
      return result;
    });
    console.log('erreur de clic Playwright (hit-testing réel):', realClickError);
    console.log(clickResult);
    console.log('=> le VRAI clic Playwright a réussi sans erreur d\'interception:', !realClickError);
    console.log('=> adocClarityQuickReply(this.textContent) a bien été appelé par le onclick:', clickResult.quickReplyCalled);
    console.log('=> adocSend() a bien été appelé ensuite:', clickResult.sendCalled);
    console.log("=> le bouton d'envoi était DÉSACTIVÉ au moment de l'appel (adocThinking probablement resté true) :", clickResult.sendBtnDisabledAtCall);
    console.log('=> une réponse a bien été enregistrée (answerAppended) — clic FONCTIONNEL:', clickResult.answerAppended);
  }

  await page.screenshot({ path: OUT + '/bug-clarity-after-fiche.png', fullPage: true });
  console.log('\n=== errors ===', errors);
  await browser.close();
})();
