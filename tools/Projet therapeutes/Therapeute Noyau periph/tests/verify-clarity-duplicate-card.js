// Bug de clarification bloquée — reproduction fidèle du repro de Christophe : génère un premier
// document jusqu'au succès (donc au moins 1 entrée dans "Fichiers générés"), PUIS déclenche une
// clarification sur une DEUXIÈME demande. Vérifie l'hypothèse n°1 de son diagnostic : un doublon
// de carte de clarification jamais nettoyée (adocRenderClarityCard ne retire jamais l'ancienne
// carte avant d'en ajouter une nouvelle — confirmé en lisant le code, cf. adocClarityCardEl=null
// à la ligne ~8129 qui n'efface QUE la référence JS, jamais l'élément DOM lui-même).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
const DOC_HTML = '<!DOCTYPE html><html><body><h1>Liens transversaux — Gottman</h1><p>Contenu du premier document.</p></body></html>';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1510, height: 900 } }); // même largeur que le repro de Christophe
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let clarityCallCount = 0;

  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage test.', book_title: 'Livre test', author: 'Auteur, A.', page_number: 1 }] }) }); return; }

    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        clarityCallCount++;
        // Impaire = 1er jugement d'une nouvelle demande (round 0→1) → besoin de clarification.
        // Paire = ré-évaluation après réponse de la thérapeute → prête, génère normalement.
        const needsClarification = clarityCallCount % 2 === 1;
        const judgment = needsClarification
          ? { status: 'needs_clarification', understood_so_far: 'Une fiche pour les couples.', missing: ['contexte'], question: 'Pour quel contexte souhaitez-vous ce document (demande #' + Math.ceil(clarityCallCount / 2) + ') ?', quick_replies: ['Pour expliquer aux couples en consultation', 'Pour ma propre pratique'], assumptions_if_proceeding: [] }
          : { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: judgment }] }) });
        return;
      }
      if (body.includes('needs_rag') || body.includes('TÂCHE')) {
        const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'liens', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'liens transversaux', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      if (body.includes('"max_tokens":16000') || body.includes('"type":"auto"')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(DOC_HTML) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== 1. Première demande — clarification, réponse, génération jusqu\'au succès ===');
  await page.fill('#clinical-question', 'Fais-moi un document sur les cavaliers de Gottman');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(600);
  const round1Cards = await page.evaluate(() => document.querySelectorAll('.cc-clarity-card').length);
  console.log('Cartes de clarification affichées après la 1ère demande:', round1Cards);
  await page.click('.cc-clarity-reply-btn'); // clique le 1er bouton de suggestion — ajoute is-selected
  await page.waitForTimeout(1200);

  const afterFirstDoc = await page.evaluate(() => ({
    sidebarCount: document.querySelectorAll('#adoc-outputs-list .adoc-output-item').length,
    cardsStillInDom: document.querySelectorAll('.cc-clarity-card').length,
  }));
  console.log('Après génération du 1er document:', afterFirstDoc);
  console.log('=> Le document a bien été livré (sidebar non vide):', afterFirstDoc.sidebarCount >= 1);
  console.log('=> La carte de clarification round 1 est TOUJOURS dans le DOM après usage (jamais retirée):', afterFirstDoc.cardsStillInDom >= 1);

  console.log('\n=== 2. Ajout de contenu pour pousser la carte hors champ (comme dans un vrai historique) ===');
  // Pousse suffisamment de contenu sous la carte pour reproduire un scroll réaliste — le
  // comportement du bug ne dépend pas de CE mécanisme précis, seulement du fait que la carte
  // n'est jamais retirée du DOM et finit hors du viewport une fois assez de contenu accumulé.
  await page.evaluate(() => {
    const area = document.getElementById('adoc-messages');
    for (let i = 0; i < 15; i++) {
      const filler = document.createElement('div');
      filler.className = 'adoc-msg';
      filler.style.height = '120px';
      filler.textContent = 'Message de remplissage ' + i;
      area.appendChild(filler);
    }
  });

  console.log('\n=== 3. Deuxième demande, distincte — nouvelle clarification déclenchée ===');
  await page.fill('#adoc-input', 'Fais-moi un autre document sur un sujet différent');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(600);

  console.log('\n=== 4. DIAGNOSTIC — comptage des cartes, rect de chacune, sélecteur générique ===');
  const diagnostic = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.cc-clarity-card'));
    const winH = window.innerHeight;
    const cardsInfo = cards.map((c, i) => {
      const r = c.getBoundingClientRect();
      const btn = c.querySelector('.cc-clarity-reply-btn');
      return {
        index: i,
        rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height },
        visible: r.bottom > 0 && r.top < winH,
        firstButtonText: btn ? btn.textContent : null,
        firstButtonHasIsSelected: btn ? btn.classList.contains('is-selected') : null,
      };
    });
    // Reproduit EXACTEMENT le sélecteur générique utilisé par Christophe dans son diagnostic.
    const genericMatch = document.querySelector('.cc-clarity-card button, [class*="clarity"] button');
    const genericRect = genericMatch ? genericMatch.getBoundingClientRect() : null;
    return {
      totalCards: cards.length,
      cardsInfo,
      genericSelectorFoundText: genericMatch ? genericMatch.textContent : null,
      genericSelectorRectTop: genericRect ? genericRect.top : null,
      genericSelectorIsVisible: genericRect ? (genericRect.bottom > 0 && genericRect.top < window.innerHeight) : null,
    };
  });
  console.log(JSON.stringify(diagnostic, null, 2));

  console.log('\n=== CONCLUSION ===');
  console.log('Nombre de cartes de clarification simultanément dans le DOM (attendu >1 si doublon confirmé):', diagnostic.totalCards);
  console.log('=> DOUBLON CONFIRMÉ (>1 carte jamais nettoyée):', diagnostic.totalCards > 1);
  const oldCard = diagnostic.cardsInfo[0];
  console.log('=> La carte la PLUS ANCIENNE (index 0, celle du round 1) est hors champ (top très négatif ou hors fenêtre):', oldCard && !oldCard.visible);
  console.log('=> Son bouton porte déjà "is-selected" (résidu du clic précédent, jamais réinitialisé):', oldCard && oldCard.firstButtonHasIsSelected === true);
  console.log('=> Le sélecteur générique attrape bien la VIEILLE carte hors champ, pas la nouvelle visible (bug exact reproduit):',
    diagnostic.genericSelectorIsVisible === false && diagnostic.genericSelectorFoundText === (oldCard && oldCard.firstButtonText));

  await page.screenshot({ path: OUT + '/clarity-duplicate-card-diagnostic.png', fullPage: false });
  console.log('\n=== errors ===', errors);
  await browser.close();
})();
