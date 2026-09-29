// STUDIO CLINIQUE — LOT 5 Présentation, questionnaire à score cumulé type magazine — preuve
// réelle en navigateur (Playwright). Génération testée via window.adocRunGenerationPipeline (même
// point d'entrée direct que les Lots 1/2/3 Présentation, jamais un appel réel à l'API Anthropic).
// Le quiz simple (Lot 3) est mêlé au document généré pour prouver la non-régression EN PLUS de
// l'exécution séparée de verify-presentation-lot3-quiz.cjs (régression complète).
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
    questionnaireQuestions: [], questionnaireProfiles: [], questionnaireTwoPartners: false,
    citationEntryIds: [],
  }, overrides);
}
function presentationSSE(cards) {
  const input = JSON.stringify({ title: 'Présentation avec questionnaire', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_q5', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

// Barème DÉLIBÉRÉMENT incohérent (chevauchement Faible/Moyen, trou entre Moyen et Élevé, et
// Élevé ne couvre pas le score maximal atteignable 6) — preuve du filet défensif réel
// (adocRepairQuestionnaireProfiles), jamais une simple formalité de schéma.
const BROKEN_PROFILES = [
  { label: 'Faible', minScore: 0, maxScore: 2, interpretation: 'Profil peu marqué, rien d\'alarmant.' },
  { label: 'Moyen', minScore: 1, maxScore: 3, interpretation: 'Profil intermédiaire, à surveiller.' },
  { label: 'Élevé', minScore: 5, maxScore: 5, interpretation: 'Profil marqué, mérite discussion.' },
];
// Q1/Q2 : options 0/2. Q3 : options 0/1/2. Total achievable 0..6, tous les entiers atteignables.
const QUESTIONS = [
  { text: 'Ressentez-vous souvent de la tension le matin ?', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
  { text: 'Le sujet revient-il dans vos pensées en journée ?', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
  { text: 'À quelle fréquence en parlez-vous à votre entourage ?', options: [{ text: 'Non', points: 0 }, { text: 'Parfois', points: 1 }, { text: 'Oui', points: 2 }] },
];

const TWO_PARTNER_QUESTIONS = [
  { text: 'Vous sentez-vous écouté(e) au quotidien ?', options: [{ text: 'Rarement', points: 0 }, { text: 'Souvent', points: 3 }] },
  { text: 'Diriez-vous partager les mêmes projets ?', options: [{ text: 'Rarement', points: 0 }, { text: 'Souvent', points: 3 }] },
];
const TWO_PARTNER_PROFILES = [
  { label: 'Distance', minScore: 0, maxScore: 2, interpretation: 'Un espace de dialogue pourrait être utile.' },
  { label: 'Proximité', minScore: 3, maxScore: 6, interpretation: 'Une bonne base de connexion.' },
];

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Filet de test : un alert() (ex. échec d'export) bloquerait sinon indéfiniment le navigateur
    // headless — jamais laissé sans réponse.
    page.on('dialog', (d) => d.dismiss());
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    const cards = [
      {
        title: 'Diapositive 1',
        blocks: [
          flatBlock({ type: 'paragraph', text: 'Un sujet qui revient souvent mérite un vrai temps de mesure.' }),
          flatBlock({
            type: 'quiz', text: 'Le stress chronique agit-il sur le système immunitaire ?',
            quizOptions: ['Oui', 'Non'], quizCorrectIndex: 0,
            quizExplanation: 'Le stress chronique dérègle la réponse immunitaire par une exposition prolongée au cortisol.',
          }),
          flatBlock({
            type: 'questionnaire', questionnaireQuestions: QUESTIONS, questionnaireProfiles: BROKEN_PROFILES, questionnaireTwoPartners: false,
          }),
        ],
      },
      {
        title: 'Diapositive 2',
        blocks: [
          flatBlock({
            type: 'questionnaire', questionnaireQuestions: TWO_PARTNER_QUESTIONS, questionnaireProfiles: TWO_PARTNER_PROFILES, questionnaireTwoPartners: true,
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
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationSSE(cards) });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    // ══════════════════════════════════════════════════════════════════════
    // 1. GÉNÉRATION + FILET DÉFENSIF — un barème incohérent doit être RECALCULÉ en tranches
    //    contiguës couvrant toute la plage atteignable, jamais rejeté ni laissé incohérent.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-lot5'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const plan = { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 10, audience_type: 'praticien', _formatClarityResolved: true };
      const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline('Prépare un exposé avec un questionnaire à score sur ce sujet, et un quiz de vérification.', plan, 'typing-lot5', 'https://clone-proxy.test.local', precomputedRag);
    });

    const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {})[0]);
    const doc = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc, storeKey);
    assert.equal(doc.documentKind, 'presentation');
    const allBlocks = doc.blocks.flatMap((card) => card.content.blocks);
    const quizBlocks = allBlocks.filter((b) => b.type === 'quiz');
    const qBlocks = allBlocks.filter((b) => b.type === 'questionnaire');
    assert.equal(quizBlocks.length, 1, 'régression Lot 3 — le quiz mêlé au même document doit apparaître tel quel');
    assert.equal(qBlocks.length, 2, 'les deux blocs questionnaire doivent apparaître dans le document produit');

    const repaired = qBlocks[0].content.profiles;
    assert.equal(repaired.length, 3);
    const byLabel = Object.fromEntries(repaired.map((p) => [p.label, p]));
    assert.equal(byLabel.Faible.maxScore, 2, 'Faible doit conserver son maxScore d\'origine (2)');
    assert.ok(byLabel.Faible.minScore < 0, 'Faible doit absorber tout score inférieur (borne basse repoussée)');
    assert.equal(byLabel.Moyen.minScore, 3, 'Moyen doit démarrer juste après Faible (3), sans chevauchement');
    assert.equal(byLabel.Moyen.maxScore, 3, 'Moyen doit s\'arrêter juste avant Élevé (3), sans trou ni chevauchement');
    assert.equal(byLabel.Élevé.minScore, 4, 'Élevé doit démarrer juste après Moyen (4), comblant le trou d\'origine');
    assert.ok(byLabel.Élevé.maxScore > 6, 'Élevé doit absorber tout score supérieur, y compris le score maximal réellement atteignable (6)');
    console.log('PASS 1/7 — Génération réelle + filet défensif : barème incohérent recalculé en tranches contiguës couvrant 0 à 6, aucun trou ni chevauchement, aucun rejet du bloc.');

    // ══════════════════════════════════════════════════════════════════════
    // 2. OUVERTURE + RENDU — les questions, options ET les points sont visibles.
    // ══════════════════════════════════════════════════════════════════════
    const openOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    assert.equal(openOk, true, 'adocOpenWorkspace doit réussir pour ce document presentation');
    await page.evaluate(() => window.adocPresentOpen());
    await page.evaluate(() => window.adocPresentNext()); // révèle le quiz
    await page.evaluate(() => window.adocPresentNext()); // révèle le questionnaire (diapositive 1)
    const qEl = page.locator('#cc-ws-present-slide-inner .adoc-sc-questionnaire').first();
    await assert.doesNotReject(qEl.waitFor({ state: 'visible', timeout: 5000 }));
    const questionCount = await qEl.locator('.adoc-sc-questionnaire-question').count();
    assert.equal(questionCount, 3, 'les 3 questions doivent être toutes affichées simultanément, jamais un flux séquentiel');
    console.log('PASS 2/7 — Rendu réel : les 3 questions du questionnaire sont toutes affichées ensemble (jamais séquentiel).');

    // ══════════════════════════════════════════════════════════════════════
    // 3. INCOMPLET — cliquer "Voir mon résultat" sans tout répondre ne doit JAMAIS produire un
    //    score ni un crash, seulement un message honnête.
    // ══════════════════════════════════════════════════════════════════════
    const incompleteResult = await page.evaluate(() => {
      const block = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-questionnaire');
      block.querySelector('.adoc-sc-questionnaire-submit').click();
      const resultEl = block.querySelector('.adoc-sc-questionnaire-result');
      return { hidden: resultEl.hidden, text: resultEl.textContent };
    });
    assert.equal(incompleteResult.hidden, false);
    assert.ok(incompleteResult.text.includes('répondre'), 'le message doit demander de répondre à toutes les questions, jamais afficher un score partiel');
    console.log('PASS 3/7 — Filet honnête : "Voir mon résultat" sans réponse complète affiche un message clair, jamais un score ni un crash.');

    // ══════════════════════════════════════════════════════════════════════
    // 4. SCORES RÉELS — bornes basse/haute/milieu de la plage, via les tranches réellement
    //    RECALCULÉES (preuve que le calcul en direct utilise bien le filet défensif, pas le
    //    barème brut incohérent produit par le modèle).
    // ══════════════════════════════════════════════════════════════════════
    async function answerAndCompute(choices) {
      return page.evaluate((choicesArg) => {
        const block = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-questionnaire');
        const questions = block.querySelectorAll('.adoc-sc-questionnaire-question');
        questions.forEach((q, i) => {
          const options = q.querySelectorAll('.adoc-sc-questionnaire-option');
          options[choicesArg[i]].click();
        });
        block.querySelector('.adoc-sc-questionnaire-submit').click();
        const resultEl = block.querySelector('.adoc-sc-questionnaire-result');
        return resultEl.textContent;
      }, choices);
    }
    // Non/Non/Non = 0+0+0 = 0 → Faible (borne basse).
    const lowText = await answerAndCompute([0, 0, 0]);
    assert.ok(lowText.includes('Score : 0'), 'score attendu 0');
    assert.ok(lowText.includes('Faible'), 'score 0 doit tomber dans le profil Faible');
    // Non/Oui/Parfois = 0+2+1 = 3 → Moyen (tranche étroite [3,3], preuve la plus fine du filet défensif).
    const midText = await answerAndCompute([0, 1, 1]);
    assert.ok(midText.includes('Score : 3'), 'score attendu 3');
    assert.ok(midText.includes('Moyen'), 'score 3 doit tomber EXACTEMENT dans la tranche recalculée de Moyen (preuve fine du filet défensif)');
    // Oui/Oui/Oui = 2+2+2 = 6 → Élevé (borne haute, au-delà du maxScore=5 d'origine du modèle).
    const highText = await answerAndCompute([1, 1, 2]);
    assert.ok(highText.includes('Score : 6'), 'score attendu 6');
    assert.ok(highText.includes('Élevé'), 'le score maximal réellement atteignable (6), au-delà du maxScore=5 produit par le modèle, doit être rattrapé par le filet défensif et tomber dans Élevé');
    console.log('PASS 4/7 — Scores réels (bornes basse/haute/milieu de plage) : profil correct affiché pour chacun, y compris la tranche étroite recalculée.');

    // ══════════════════════════════════════════════════════════════════════
    // 5. MODE DEUX PARTENAIRES — bascule, indépendance des réponses, résultats côte à côte.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => window.adocPresentNext()); // diapositive 2 (questionnaire deux partenaires)
    await page.waitForTimeout(320);
    const twoPartnerResult = await page.evaluate(() => {
      const block = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-questionnaire');
      const panels = block.querySelectorAll('.adoc-sc-questionnaire-partner-panel');
      const switchBtns = block.querySelectorAll('.adoc-sc-questionnaire-partner-btn');
      // Partenaire 1 (panneau actif par défaut) — répond "Souvent" aux deux (score 6, Proximité).
      panels[0].querySelectorAll('.adoc-sc-questionnaire-question').forEach((q) => q.querySelectorAll('.adoc-sc-questionnaire-option')[1].click());
      // Bascule vers Partenaire 2.
      switchBtns[1].click();
      const panel1HiddenAfterSwitch = panels[0].hidden;
      const panel2VisibleAfterSwitch = !panels[1].hidden;
      // Partenaire 2 — répond "Rarement" aux deux (score 0, Distance) : réponses INDÉPENDANTES.
      panels[1].querySelectorAll('.adoc-sc-questionnaire-question').forEach((q) => q.querySelectorAll('.adoc-sc-questionnaire-option')[0].click());
      block.querySelector('.adoc-sc-questionnaire-submit').click();
      const resultText = block.querySelector('.adoc-sc-questionnaire-result').textContent;
      // Reviens sur Partenaire 1 : ses réponses doivent être intactes (jamais perdues).
      switchBtns[0].click();
      const partner1StillSelected = Array.from(panels[0].querySelectorAll('.adoc-sc-questionnaire-question')).every(
        (q) => q.querySelector('.adoc-sc-questionnaire-option.is-selected')
      );
      return { panel1HiddenAfterSwitch, panel2VisibleAfterSwitch, resultText, partner1StillSelected };
    });
    assert.equal(twoPartnerResult.panel1HiddenAfterSwitch, true, 'le panneau du partenaire 1 doit se masquer au clic sur "Partenaire 2"');
    assert.equal(twoPartnerResult.panel2VisibleAfterSwitch, true, 'le panneau du partenaire 2 doit apparaître au clic');
    assert.ok(twoPartnerResult.resultText.includes('Partenaire 1') && twoPartnerResult.resultText.includes('Partenaire 2'), 'les deux résultats doivent être affichés côte à côte, jamais un seul résultat fusionné');
    assert.ok(twoPartnerResult.resultText.includes('Proximité') && twoPartnerResult.resultText.includes('Distance'), 'chaque partenaire doit obtenir SON propre profil, preuve d\'un calcul réellement indépendant');
    assert.ok(twoPartnerResult.resultText.includes('diffèrent'), 'des profils différents doivent produire la mention neutre de divergence, jamais un diagnostic fabriqué');
    assert.equal(twoPartnerResult.partner1StillSelected, true, 'les réponses du partenaire 1 ne doivent JAMAIS être perdues en revenant sur son panneau après bascule');
    console.log('PASS 5/7 — Mode deux partenaires : bascule réelle, réponses indépendantes et mémorisées, résultats affichés côte à côte, comparaison honnête.');

    await page.evaluate(() => window.adocPresentClose());

    // ══════════════════════════════════════════════════════════════════════
    // 6. EXPORT PDF — questions, options, POINTS (barème) et grille des profils tous lisibles en
    //    texte (calcul manuel possible sur papier), jamais une zone vide ni masquée.
    // ══════════════════════════════════════════════════════════════════════
    // Note (découverte incidente, cf. rapport) : adocWsExportCarrouselPDF appelle adocEditorSync()
    // en premier, qui écrit un champ `editor` (annotation d'édition directe, cf. Item 68/57c-57f)
    // sur le bloc paragraph voisin — la validation AJV réelle (adocRenderClinicalDocument) tourne
    // donc ici sur un document légèrement différent de celui inspecté au test 1, exactement comme
    // en usage réel. C'est ce chemin exact qui a révélé la désynchronisation schéma disque/embarqué
    // pré-existante (cf. rapport, "editorPresentation" absent de la copie disque depuis l'origine,
    // Item 68/A9) — corrigée dans la copie embarquée ci-joint, jamais dans la copie disque
    // (volontairement minimale par décision A9 déjà actée, non rouverte ici).
    const pdfHtml = await page.evaluate(async (sk) => {
      const art = window._adocArtifacts[sk];
      const doc2 = art._adocStructuredDoc;
      await window.adocRenderClinicalDocument(doc2, art._adocStructuredSnapshot, art._adocRenderManifestOverride || null);
      let captured = null;
      const realFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (String(url).includes('/browser-rendering/generate-carrousel-pdf')) {
          captured = JSON.parse(opts.body).html;
          return new Response(new Blob(['fake-pdf']), { status: 200 });
        }
        return realFetch(url, opts);
      };
      let caughtErr = null;
      try { await window.adocWsExportCarrouselPDF(); } catch (e) { caughtErr = e && e.message; }
      window.fetch = realFetch;
      return { captured, caughtErr };
    }, storeKey);
    const pdfCaptured = pdfHtml.captured;
    assert.equal(pdfHtml.caughtErr, null, 'l\'export PDF ne doit lever aucune erreur (schéma ou autre)' + (pdfHtml.caughtErr ? (' : ' + pdfHtml.caughtErr) : ''));

    assert.ok(pdfCaptured, 'le HTML envoyé au générateur PDF doit avoir été capturé' + (pdfHtml.caughtErr ? (' (erreur : ' + pdfHtml.caughtErr + ')') : ''));
    assert.ok(pdfCaptured.includes('Ressentez-vous souvent de la tension'), 'la question doit être lisible dans le PDF');
    assert.ok(pdfCaptured.includes('(+2)') && pdfCaptured.includes('(+1)'), 'le barème (points) doit être visible dans le PDF pour un calcul manuel');
    assert.ok(pdfCaptured.includes('Profil peu marqué') && pdfCaptured.includes('Profil marqué'), 'la grille des profils (interprétations) doit être lisible dans le PDF');
    assert.ok(!/\.adoc-sc-questionnaire-scale\s*\{[^}]*display:\s*none/.test(pdfCaptured), 'le HTML du PDF ne doit JAMAIS masquer la grille des profils (contrairement à la feuille de style interactive) — sinon aucun calcul manuel ne serait possible sur papier');
    console.log('PASS 6/7 — Export PDF : questions, options, barème (points) ET grille des profils tous lisibles en texte, calcul manuel possible.');

    // ══════════════════════════════════════════════════════════════════════
    // 7. Aucune erreur JS non gérée sur tout le scénario.
    // ══════════════════════════════════════════════════════════════════════
    assert.deepEqual(errors.filter((m) => m !== "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag."), [], 'aucune erreur JS non gérée pendant tout le scénario Lot 5');
    console.log('PASS 7/7 — Zéro erreur JS non gérée.');

    console.log('\nTOUS LES TESTS PRÉSENTATION LOT 5 QUESTIONNAIRE PASSENT (7/7)');
    console.log('(Régression Lots 1/2/3 : voir exécution séparée de verify-presentation-lot1.cjs / verify-presentation-lot2-partieAB.cjs / verify-presentation-lot2-partieC.cjs / verify-presentation-lot3-quiz.cjs)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
