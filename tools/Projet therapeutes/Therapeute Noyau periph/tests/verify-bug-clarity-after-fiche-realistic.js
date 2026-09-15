// FIL 1 (priorité) — reprise du test précédent (verify-bug-clarity-after-fiche.js, qui n'a PAS
// reproduit le bug) avec un scénario BEAUCOUP plus proche des conditions réelles rapportées par
// Christophe : Fiche structurée RICHE (bloc image de couverture → déclenche réellement
// adocResolveImages/fetch-image, comme en production — le test précédent utilisait 2 blocs sans
// image et ne passait donc jamais par ce code), plusieurs sections, table, liste — pour vérifier
// si la RICHESSE du contenu réel (taille du DOM, appel réseau image, mise en page) est la
// condition manquante qui, dans le test minimal précédent, empêchait de reproduire le bug.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_RAG_CHUNKS = Array.from({ length: 15 }, (_, i) => ({
  content: 'Passage clinique fictif n°' + i + ' — mécanisme thérapeutique décrit en détail, suffisant pour un test réaliste.',
  book_title: 'Ouvrage clinique ' + i, author: 'Auteur ' + i, page_number: 10 + i,
}));

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

const blockDefaults = { text: '', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] };
function block(overrides) { return Object.assign({}, blockDefaults, overrides); }

const RICH_FICHE_INPUT = {
  title: 'Approches de régulation émotionnelle en thérapie de couple',
  purpose: 'psychoéducation', audience: 'clinicien',
  blocks: [
    block({ type: 'image', imageQuery: 'therapy office warm light', imageAlt: 'Cabinet de thérapie', level: 1 }),
    block({ type: 'heading', text: 'Vue d\'ensemble', level: 1 }),
    block({ type: 'paragraph', text: 'Ce document synthétise les grands principes de régulation émotionnelle applicables en séance de couple, avec un focus sur les mécanismes physiologiques et relationnels en jeu.'.repeat(2) }),
    block({ type: 'heading', text: 'Mécanismes clés', level: 2 }),
    block({ type: 'list', items: ['Flooding émotionnel et ses signes physiologiques', 'Stratégies de pause structurée (time-out)', 'Reconnexion après rupture de dialogue', 'Rôle du système nerveux autonome'] }),
    block({ type: 'heading', text: 'Comparatif synthétique', level: 2 }),
    block({ type: 'table', headers: ['Approche', 'Cible principale', 'Durée typique'], rows: [
      ['Gottman', 'Communication et mépris', '12-20 séances'],
      ['EFT', 'Cycle d\'attachement', '8-20 séances'],
    ] }),
    block({ type: 'paragraph', text: 'Ces éléments doivent être adaptés au contexte clinique spécifique de chaque couple suivi, en tenant compte de l\'historique relationnel.' }),
  ],
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.text().includes('UX-8A') || m.text().includes('Clarity') || m.text().includes('Pexels') || m.text().includes('pageerror')) console.log('  [console]', m.text()); });

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/search-library')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('/fetch-image')) {
      // Simule une vraie latence réseau Pexels (pas instantané comme le reste des mocks).
      return new Promise(resolve => setTimeout(() => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{ src: { large: 'https://images.example/fake.jpg' } }] }) });
        resolve();
      }, 600));
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || '';
      let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const p = body.payload || {};

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
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE(RICH_FICHE_INPUT) });
        return;
      }
      if (bodyRaw.includes('needs_rag') || bodyRaw.includes('TÂCHE')) {
        const plan = { needs_rag: true, searches: [{ terms: ['couple', 'régulation'], term_match: 'any', authors: [], approaches: [], limit: 15 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'régulation émotionnelle en couple', deep_scan: false, max_tokens: 2000 };
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

  console.log('=== ÉTAPE 1 — générer une Fiche RICHE (image de couverture + 7 blocs) jusqu\'au succès complet ===');
  const t0 = Date.now();
  await page.fill('#clinical-question', 'Fais-moi une fiche synthèse complète sur la régulation émotionnelle en couple');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForSelector('.adoc-artifact-card', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log('temps écoulé génération Fiche:', ((Date.now() - t0) / 1000).toFixed(1) + 's');

  const step1 = await page.evaluate(() => ({
    hasStructuredArtifact: Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc),
    messagesHeight: document.getElementById('adoc-messages')?.scrollHeight,
    scrollTop: document.getElementById('adoc-messages')?.scrollTop,
    imgResolved: !!document.querySelector('.adoc-artifact-card img'),
  }));
  console.log(step1);
  console.log('=> Fiche riche générée avec succès (artifact présent):', step1.hasStructuredArtifact);

  // Pause réaliste avant la 2e demande (une thérapeute lit/scrolle avant de continuer),
  // contrairement au test précédent qui enchaînait quasi instantanément.
  await page.waitForTimeout(2500);

  console.log('\n=== ÉTAPE 2 — SANS recharger, demander un Tableau comparatif EMDR/ICV/IFS ===');
  await page.fill('#adoc-input', 'Fais-moi un tableau comparatif EMDR / ICV / IFS');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(800);

  const cardState = await page.evaluate(() => {
    const card = document.querySelector('.cc-clarity-card');
    const btn = card ? card.querySelector('.cc-clarity-reply-btn') : null;
    return { cardPresent: !!card, btnPresent: !!btn, messagesHeight: document.getElementById('adoc-messages')?.scrollHeight };
  });
  console.log(cardState);
  console.log('=> carte de clarification affichée:', cardState.cardPresent);

  if (cardState.cardPresent && cardState.btnPresent) {
    console.log('\n=== ÉTAPE 3 — diagnostic hit-testing réel + clic Playwright réel ===');
    const diag = await page.evaluate(() => {
      const btn = document.querySelector('.cc-clarity-card .cc-clarity-reply-btn');
      const rect = btn.getBoundingClientRect();
      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
      const elAtPoint = document.elementFromPoint(cx, cy);
      return {
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        inViewport: rect.y >= 0 && rect.y <= window.innerHeight,
        elAtPointIsButton: elAtPoint === btn,
        elAtPointTag: elAtPoint ? elAtPoint.tagName + '.' + (elAtPoint.className || '') : null,
      };
    });
    console.log(diag);

    await page.evaluate(() => {
      window._diag = { quickReplyCalled: false, sendCalled: false };
      const origQuickReply = window.adocClarityQuickReply;
      window.adocClarityQuickReply = function (text) { window._diag.quickReplyCalled = true; return origQuickReply(text); };
      const origSend = window.adocSend;
      window.adocSend = function () { window._diag.sendCalled = true; return origSend.apply(this, arguments); };
    });

    let realClickError = null;
    try {
      await page.locator('.cc-clarity-card .cc-clarity-reply-btn').first().click({ timeout: 5000 });
    } catch (e) { realClickError = e.message; }
    await page.waitForTimeout(400);
    const clickResult = await page.evaluate(() => Object.assign({}, window._diag, {
      answerAppended: !!document.querySelector('.cc-clarity-answer'),
    }));
    console.log('erreur de clic Playwright (hit-testing réel):', realClickError);
    console.log(clickResult);
    console.log('=> le VRAI clic Playwright a réussi sans erreur d\'interception:', !realClickError);
    console.log('=> réponse enregistrée (clic fonctionnel):', clickResult.answerAppended);
  }

  await page.screenshot({ path: OUT + '/bug-clarity-after-fiche-realistic.png', fullPage: true });
  console.log('\n=== errors ===', errors);
  await browser.close();
})();
