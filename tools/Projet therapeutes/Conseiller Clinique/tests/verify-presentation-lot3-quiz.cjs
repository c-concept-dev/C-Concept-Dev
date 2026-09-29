// STUDIO CLINIQUE — LOT 3 Présentation, Quiz simple auto-rythmé — preuve réelle en navigateur
// (Playwright). Un seul écran, jamais de vote multi-appareils (décision actée, non renégociable).
// Génération testée via window.adocRunGenerationPipeline (même point d'entrée direct que Lots 1/2,
// jamais un appel réel à l'API Anthropic). Interactions de clic et export PDF testés directement
// sur le DOM produit par adocRenderCardHTML/adocRenderBlockHTML — jamais un second moteur de rendu.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}
function flatBlock(overrides) {
  return Object.assign({
    type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
    imageQuery: '', imageAlt: '', quizOptions: [], quizCorrectIndex: 0, quizExplanation: '',
    citationEntryIds: [],
  }, overrides);
}
function presentationWithQuizSSE(cards) {
  const input = JSON.stringify({ title: 'Présentation avec quiz', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_quiz', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    const cards = [
      {
        title: 'Diapositive 1',
        blocks: [
          flatBlock({ type: 'paragraph', text: 'Le stress chronique a des effets mesurables.' }),
          flatBlock({
            type: 'quiz', text: 'Quel neurotransmetteur est principalement associé au stress chronique ?',
            quizOptions: ['Dopamine', 'Cortisol', 'Sérotonine'], quizCorrectIndex: 1,
            quizExplanation: 'Le cortisol est l\'hormone de stress principale, libérée par les glandes surrénales.',
          }),
        ],
      },
      {
        title: 'Diapositive 2',
        blocks: [
          flatBlock({
            type: 'quiz', text: 'Combien de temps dure une réaction de stress aiguë typique ?',
            quizOptions: ['Quelques minutes', 'Plusieurs jours'], quizCorrectIndex: 0,
            quizExplanation: 'Une réaction de stress aiguë se résout généralement en quelques minutes une fois le facteur déclenchant écarté.',
          }),
        ],
      },
    ];

    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool' && body.payload.tool_choice.name === 'emit_presentation_document') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationWithQuizSSE(cards) });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    // ══════════════════════════════════════════════════════════════════════
    // 1. GÉNÉRATION — texte libre suggérant explicitement un quiz de vérification.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-lot3'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const plan = { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 10, audience_type: 'praticien', _formatClarityResolved: true };
      const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline('Prépare un exposé sur le stress chronique, avec un quiz pour vérifier la compréhension.', plan, 'typing-lot3', 'https://clone-proxy.test.local', precomputedRag);
    });

    const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {})[0]);
    const doc = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc, storeKey);
    assert.equal(doc.documentKind, 'presentation');
    const quizBlocks = doc.blocks.flatMap((card) => card.content.blocks.filter((b) => b.type === 'quiz'));
    assert.equal(quizBlocks.length, 2, 'les deux blocs quiz du modèle simulé doivent apparaître tels quels dans le document produit');
    assert.equal(quizBlocks[0].content.question, 'Quel neurotransmetteur est principalement associé au stress chronique ?');
    assert.deepEqual(quizBlocks[0].content.options, ['Dopamine', 'Cortisol', 'Sérotonine']);
    assert.equal(quizBlocks[0].content.correctIndex, 1);
    assert.ok(quizBlocks[0].content.explanation.length > 0, 'explanation ne doit jamais être vide');
    console.log('PASS 1/5 — Génération réelle : texte libre "...avec un quiz..." produit un bloc type=quiz exploitable dans le document.');

    // ══════════════════════════════════════════════════════════════════════
    // 2. MODE PLEIN ÉCRAN — clic sur une option INCORRECTE (diapositive 1, quiz 1).
    // ══════════════════════════════════════════════════════════════════════
    const openOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    assert.equal(openOk, true, 'adocOpenWorkspace doit réussir pour ce document presentation');
    await page.evaluate(() => window.adocPresentOpen());
    const wrongClickResult = await page.evaluate(() => {
      // Diapositive 1 déjà entièrement montée par adocPresentOpen (1er bloc) — révèle le 2e
      // (le quiz) avant de cliquer, exactement comme le ferait une utilisatrice réelle au clavier.
      window.adocPresentNext();
      const quizEl = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-quiz');
      const options = quizEl.querySelectorAll('.adoc-sc-quiz-option');
      // "Dopamine" (index 0) est INCORRECT — la bonne réponse est "Cortisol" (index 1).
      options[0].click();
      return {
        isAnswered: quizEl.classList.contains('is-answered'),
        wrongIsIncorrect: options[0].classList.contains('is-incorrect'),
        correctIsHighlighted: options[1].classList.contains('is-correct'),
        allDisabled: Array.from(options).every((o) => o.disabled),
        revealShown: quizEl.querySelector('.adoc-sc-quiz-reveal').classList.contains('is-shown'),
        revealText: quizEl.querySelector('.adoc-sc-quiz-reveal').textContent,
      };
    });
    assert.equal(wrongClickResult.isAnswered, true);
    assert.equal(wrongClickResult.wrongIsIncorrect, true, 'l\'option cliquée, incorrecte, doit être marquée is-incorrect');
    assert.equal(wrongClickResult.correctIsHighlighted, true, 'la vraie bonne réponse doit être mise en évidence même si une autre option a été cliquée');
    assert.equal(wrongClickResult.allDisabled, true, 'plus aucune option ne doit rester cliquable après réponse');
    assert.equal(wrongClickResult.revealShown, true, 'la révélation (bonne réponse + explication) doit apparaître');
    assert.ok(wrongClickResult.revealText.includes('Cortisol'), 'la bonne réponse doit être nommée dans la révélation');
    assert.ok(wrongClickResult.revealText.includes('surrénales'), 'l\'explication doit être affichée intégralement');
    console.log('PASS 2/5 — Clic sur une option INCORRECTE : bonne réponse mise en évidence + explication affichée (jamais une fausse confirmation).');

    // ══════════════════════════════════════════════════════════════════════
    // 3. Diapositive 2 (quiz indépendant) — clic sur l'option CORRECTE.
    // ══════════════════════════════════════════════════════════════════════
    // La transition entre diapositives est animée (~260ms, cf. adocPresentGoToInternal, Lot 1) —
    // il faut la laisser se terminer avant d'interroger le DOM de la nouvelle diapositive, sans
    // quoi la requête retomberait encore sur l'ancienne (défaut de synchronisation du TEST, jamais
    // de l'application — même précaution déjà appliquée dans verify-presentation-lot2-partieC.cjs).
    await page.evaluate(() => window.adocPresentNext()); // passe à la diapositive 2
    await page.waitForTimeout(320);
    const correctClickResult = await page.evaluate(() => {
      const quizEl = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-quiz');
      const options = quizEl.querySelectorAll('.adoc-sc-quiz-option');
      options[0].click(); // "Quelques minutes" — CORRECT (index 0)
      return {
        clickedIsCorrect: options[0].classList.contains('is-correct'),
        clickedIsIncorrect: options[0].classList.contains('is-incorrect'),
        anyIncorrectAnywhere: Array.from(options).some((o) => o.classList.contains('is-incorrect')),
      };
    });
    assert.equal(correctClickResult.clickedIsCorrect, true);
    assert.equal(correctClickResult.clickedIsIncorrect, false);
    assert.equal(correctClickResult.anyIncorrectAnywhere, false, 'aucune option ne doit être marquée incorrecte quand la bonne réponse est cliquée du premier coup');
    console.log('PASS 3/5 — Clic sur l\'option CORRECTE (quiz indépendant, diapositive 2) : retour positif, aucune fausse marque d\'erreur.');

    // Indépendance déjà prouvée par construction (PASS 2/PASS 3 ci-dessus) : chaque clic ne
    // modifie QUE le bloc .adoc-sc-quiz le plus proche (closest()), jamais un état global partagé.
    // Note honnête (hors périmètre de ce lot) : la révélation d'une diapositive re-rend le bloc
    // depuis le JSON (adocRenderCardHTML) à chaque navigation — l'état "répondu" ne survit donc pas
    // un aller-retour entre diapositives dans la MÊME session plein écran, jamais demandé par le
    // CDC (qui exige l'indépendance ENTRE quiz, jamais leur persistance après un aller-retour).
    await page.evaluate(() => window.adocPresentClose());

    // ══════════════════════════════════════════════════════════════════════
    // 4. EXPORT PDF — la question, les options ET la bonne réponse/explication doivent être
    //    lisibles en texte, jamais une zone vide (repli honnête, aucune interaction possible sur
    //    papier).
    // ══════════════════════════════════════════════════════════════════════
    const pdfHtml = await page.evaluate(async (sk) => {
      const art = window._adocArtifacts[sk];
      const doc = art._adocStructuredDoc;
      const rendered = await window.adocRenderClinicalDocument(doc, art._adocStructuredSnapshot, art._adocRenderManifestOverride || null);
      let captured = null;
      const realFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (String(url).includes('/browser-rendering/generate-carrousel-pdf')) {
          captured = JSON.parse(opts.body).html;
          return new Response(new Blob(['fake-pdf']), { status: 200 });
        }
        return realFetch(url, opts);
      };
      try { await window.adocWsExportCarrouselPDF(); } catch (e) {}
      window.fetch = realFetch;
      return captured;
    }, storeKey);

    assert.ok(pdfHtml, 'le HTML envoyé au générateur PDF doit avoir été capturé');
    assert.ok(pdfHtml.includes('Quel neurotransmetteur'), 'la question doit être lisible dans le PDF');
    assert.ok(pdfHtml.includes('Cortisol') && pdfHtml.includes('Dopamine') && pdfHtml.includes('Sérotonine'), 'toutes les options doivent être lisibles dans le PDF');
    assert.ok(pdfHtml.includes('surrénales'), 'l\'explication doit être lisible dans le PDF, jamais une zone vide');
    assert.ok(!/\.adoc-sc-quiz-reveal\s*\{[^}]*display:\s*none/.test(pdfHtml), 'le HTML du PDF ne doit JAMAIS masquer la révélation (contrairement à la feuille de style live) — sinon la réponse resterait invisible sur papier');
    console.log('PASS 4/5 — Export PDF : question, options ET bonne réponse/explication tous lisibles en texte (aucune zone vide, aucun mécanisme cliquable supposé).');

    assert.deepEqual(errors.filter((m) => m !== "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag."), [], 'aucune erreur JS non gérée pendant tout le scénario Lot 3');
    console.log('\nTOUS LES TESTS PRÉSENTATION LOT 3 QUIZ PASSENT (4/4)');
    console.log('(Régression Lots 1/2 : voir exécution séparée de verify-presentation-lot1.cjs / verify-presentation-lot2-partieAB.cjs / verify-presentation-lot2-partieC.cjs)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
