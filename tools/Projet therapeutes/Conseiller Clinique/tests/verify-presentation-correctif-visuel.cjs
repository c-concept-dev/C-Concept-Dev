// STUDIO CLINIQUE — Présentation, CORRECTIF COMPLET couche visuelle — preuve réelle en navigateur
// (Playwright), captures d'écran INCLUSES (exigence explicite du CDC : une assertion "élément
// présent"/"classe appliquée" seule n'est jamais suffisante pour ce lot — c'est exactement ce qui a
// laissé passer les deux défauts corrigés ici).
//
// Génère un document via le point d'entrée direct déjà établi (window.adocRunGenerationPipeline,
// même convention que Lots 1/2/3 — jamais un appel réel à l'API Anthropic) pour obtenir un artefact
// COMPLET (capacités, snapshot structuré) que adocOpenWorkspace accepte réellement — contrairement à
// un artefact minimal construit à la main, qui échoue silencieusement (leçon apprise pendant cette
// investigation même).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

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
function presentationSSE(cards) {
  const input = JSON.stringify({ title: 'Présentation — correctif visuel', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_visuel', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}
function carrouselSSE(cards) {
  const input = JSON.stringify({ title: 'Carrousel régression', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_carr', name: 'emit_carrousel_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

const outDir = process.env.ADOC_SCREENSHOT_DIR || '/tmp/screenshots-presentation-correctif';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    page.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) errors.push(e.message); });
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    const presentationCards = [
      {
        title: 'Diapositive complète — tous les types de bloc',
        blocks: [
          flatBlock({ type: 'heading', text: 'Le stress chronique', level: 2 }),
          flatBlock({ type: 'paragraph', text: 'Ce paragraphe doit rester parfaitement lisible en plein écran, sur fond clair, texte sombre.' }),
          flatBlock({ type: 'list', items: ['Premier symptôme observé', 'Second symptôme observé'], ordered: false }),
          flatBlock({ type: 'callout', text: 'Point clé à retenir pendant la présentation.', visualRole: 'warning' }),
          flatBlock({ type: 'image', imageQuery: 'stress management', imageAlt: 'Illustration du stress' }),
          flatBlock({
            type: 'quiz', text: 'Quelle hormone est associée au stress chronique ?',
            quizOptions: ['Dopamine', 'Cortisol'], quizCorrectIndex: 1,
            quizExplanation: 'Le cortisol est l\'hormone de stress principale.',
          }),
        ],
      },
      {
        title: 'Deuxième diapositive — preuve empilement vertical',
        blocks: [flatBlock({ type: 'paragraph', text: 'Cette diapositive doit apparaître AU-DESSOUS de la première en vue d\'édition, jamais à côté.' })],
      },
    ];
    const carrouselCards = [
      { title: 'Carte 1 régression', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu carte 1.' })] },
      { title: 'Carte 2 régression', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu carte 2.' })] },
    ];

    let currentSSE = null;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/video-links') && route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ id: 'vid-1', url: 'http://localhost:47823/seance1.mp4', title: 'Exercice de respiration' }] }) });
      }
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: currentSSE });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    async function generate(text, plan, sseBody, typingId) {
      currentSSE = sseBody;
      await page.evaluate(async ({ text, plan, typingId }) => {
        const area = document.getElementById('adoc-messages');
        const el = document.createElement('div'); el.id = typingId; el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
        await window.adocRunGenerationPipeline(text, plan, typingId, 'https://clone-proxy.test.local', precomputedRag);
      }, { text, plan, typingId });
      return page.evaluate(() => Object.keys(window._adocArtifacts || {}).slice(-1)[0]);
    }

    // ══════════════════════════════════════════════════════════════════════
    // 1. Génère la Présentation, ouvre l'espace de travail (VUE D'ÉDITION).
    // ══════════════════════════════════════════════════════════════════════
    const presKey = await generate(
      'Prépare un exposé sur le stress chronique, avec un quiz.',
      { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 10, audience_type: 'praticien', _formatClarityResolved: true },
      presentationSSE(presentationCards), 'typing-visuel-1'
    );
    assert.ok(presKey, 'un artefact Présentation doit avoir été créé');
    const openOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), presKey);
    assert.equal(openOk, true, 'adocOpenWorkspace doit réussir pour ce document presentation');

    const editViewGeometry = await page.evaluate(() => {
      const slides = Array.from(document.querySelectorAll('#cc-ws-doc-card .adoc-sc-presentation-slide'));
      return {
        count: slides.length,
        stackedVertically: slides.length === 2 && slides[1].getBoundingClientRect().top > slides[0].getBoundingClientRect().bottom - 5,
        docCardMaxWidth: getComputedStyle(document.getElementById('cc-ws-doc-card')).maxWidth,
        slideNum0: slides[0]?.querySelector('.adoc-sc-presentation-slide-num')?.textContent,
        slideNum1: slides[1]?.querySelector('.adoc-sc-presentation-slide-num')?.textContent,
      };
    });
    assert.equal(editViewGeometry.count, 2, 'les 2 diapositives doivent être présentes en vue d\'édition (.adoc-sc-presentation-slide, jamais .adoc-sc-card seul)');
    assert.equal(editViewGeometry.stackedVertically, true, 'la 2e diapositive doit apparaître AU-DESSOUS de la 1re (empilement vertical), jamais à côté');
    assert.equal(editViewGeometry.docCardMaxWidth, 'none', 'la vue d\'édition doit occuper la largeur utile (max-width:none), jamais la largeur "page" 760px héritée de Fiche');
    assert.equal(editViewGeometry.slideNum0, 'Diapositive 1 / 2', 'indicateur de numéro de diapositive attendu sur la 1re');
    assert.equal(editViewGeometry.slideNum1, 'Diapositive 2 / 2', 'indicateur de numéro de diapositive attendu sur la 2e');
    console.log('PASS 1/7 — Vue d\'édition : empilement vertical pleine largeur confirmé (2 diapositives, indicateurs de numéro corrects).');

    const editScreenshotPath = path.join(outDir, '1-vue-edition-presentation.png');
    await page.screenshot({ path: editScreenshotPath, fullPage: false });
    console.log('CAPTURE — ' + editScreenshotPath);

    // ══════════════════════════════════════════════════════════════════════
    // 2. RÉGRESSION — Carrousel classique en édition : DOIT rester côte à côte, inchangé.
    // ══════════════════════════════════════════════════════════════════════
    const carrKey = await generate(
      'Fais-moi un carrousel sur un sujet clinique.',
      { needs_rag: true, documentKind: 'carrousel', intent: 'chat', audience_type: 'praticien', _formatClarityResolved: true },
      carrouselSSE(carrouselCards), 'typing-visuel-2'
    );
    assert.ok(carrKey, 'un artefact Carrousel doit avoir été créé');
    const openCarrOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), carrKey);
    assert.equal(openCarrOk, true, 'adocOpenWorkspace doit réussir pour ce document carrousel');
    const carrGeometry = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#cc-ws-doc-card .adoc-sc-carrousel > .adoc-sc-card'));
      const container = document.querySelector('#cc-ws-doc-card .adoc-sc-carrousel');
      return {
        count: cards.length,
        sideBySide: cards.length === 2 && Math.abs(cards[0].getBoundingClientRect().top - cards[1].getBoundingClientRect().top) < 5,
        containerDisplay: container ? getComputedStyle(container).flexDirection : null,
        docCardMaxWidth: getComputedStyle(document.getElementById('cc-ws-doc-card')).maxWidth,
        hasPresentationClasses: !!document.querySelector('#cc-ws-doc-card .adoc-sc-presentation, #cc-ws-doc-card .adoc-sc-presentation-slide'),
      };
    });
    assert.equal(carrGeometry.count, 2);
    assert.equal(carrGeometry.sideBySide, true, 'RÉGRESSION — les cartes du Carrousel doivent rester côte à côte (même hauteur de départ), strictement inchangé');
    assert.equal(carrGeometry.containerDisplay, 'row', 'RÉGRESSION — .adoc-sc-carrousel doit rester flex-direction:row (défaut), jamais column');
    assert.equal(carrGeometry.docCardMaxWidth, '760px', 'RÉGRESSION — .cc-ws-doc-card doit garder sa largeur "page" 760px pour Carrousel, jamais élargi');
    assert.equal(carrGeometry.hasPresentationClasses, false, 'RÉGRESSION — un Carrousel ne doit JAMAIS recevoir les classes dédiées à Présentation');
    console.log('PASS 2/7 — RÉGRESSION Carrousel : édition strictement inchangée (côte à côte, largeur 760px, jamais les classes Présentation).');

    const carrScreenshotPath = path.join(outDir, '2-regression-carrousel-edition.png');
    await page.screenshot({ path: carrScreenshotPath, fullPage: false });
    console.log('CAPTURE — ' + carrScreenshotPath);

    // ══════════════════════════════════════════════════════════════════════
    // 3. MODE PLEIN ÉCRAN — retour sur la Présentation, ouverture, révélation complète de la
    //    diapositive 1 (tous les types de bloc), capture d'écran + vérification de couleur réelle.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), presKey);
    await page.evaluate(() => window.adocPresentOpen());
    // Révèle chaque bloc successif de la diapositive 1 (heading/paragraph/list/callout/image/quiz)
    // un par un, comme le ferait une vraie navigation au clavier. 6 blocs au total — le 1er est
    // déjà montré à l'ouverture (revealIndex=0), donc 5 appels "Suivant" suffisent à tout révéler
    // SANS avancer vers la diapositive 2 (un 6e appel ferait avancer, cf. adocPresentRevealNext).
    // Note — la vidéo n'est pas incluse ici (insertion manuelle uniquement, jamais générée par le
    // modèle) : déjà couverte par verify-presentation-lot1.cjs, et sa légende porte déjà une
    // couleur EXPLICITE indépendante de .adoc-sc-doc (.adoc-sc-video-caption), jamais affectée par
    // ce défaut (cf. rapport d'audit).
    for (let i = 0; i < 5; i++) { await page.evaluate(() => window.adocPresentNext()); await page.waitForTimeout(30); }
    await page.waitForTimeout(300);

    const fullscreenCheck = await page.evaluate(() => {
      function colorInfo(sel) {
        const el = document.querySelector(sel);
        if (!el) return { sel, missing: true };
        const cs = getComputedStyle(el);
        return { sel, color: cs.color, visible: el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 };
      }
      return {
        overlayOpen: document.getElementById('cc-ws-present-overlay').classList.contains('open'),
        hasDocWrapper: !!document.querySelector('#cc-ws-present-slide-inner .adoc-sc-doc'),
        heading: colorInfo('#cc-ws-present-slide-inner .adoc-sc-heading'),
        paragraph: colorInfo('#cc-ws-present-slide-inner .adoc-sc-paragraph'),
        list: colorInfo('#cc-ws-present-slide-inner .adoc-sc-list'),
        callout: colorInfo('#cc-ws-present-slide-inner .adoc-sc-callout'),
        quizQuestion: colorInfo('#cc-ws-present-slide-inner .adoc-sc-quiz-question'),
        quizOption: colorInfo('#cc-ws-present-slide-inner .adoc-sc-quiz-option'),
        cardBg: getComputedStyle(document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card')).backgroundColor,
      };
    });
    assert.equal(fullscreenCheck.overlayOpen, true);
    assert.equal(fullscreenCheck.hasDocWrapper, true, 'le rendu plein écran doit désormais être enveloppé dans .adoc-sc-doc');
    // Aucune des couleurs de texte ne doit être blanche (rgb(255, 255, 255)) sur le fond clair
    // de la carte — c'est EXACTEMENT le défaut corrigé ici, vérifié pour CHAQUE type de bloc,
    // jamais seulement le titre (qui, lui, n'a jamais été affecté, cf. rapport d'audit).
    const white = 'rgb(255, 255, 255)';
    for (const key of ['heading', 'paragraph', 'list', 'callout', 'quizQuestion', 'quizOption']) {
      const info = fullscreenCheck[key];
      assert.ok(!info.missing, 'bloc ' + key + ' doit être présent dans le DOM plein écran');
      assert.equal(info.visible, true, 'bloc ' + key + ' doit avoir une taille réelle non nulle');
      assert.notEqual(info.color, white, 'bloc ' + key + ' ne doit JAMAIS être blanc sur le fond clair de la carte (' + fullscreenCheck.cardBg + ') — texte invisible sinon');
    }
    console.log('PASS 3/7 — Plein écran : TOUS les types de bloc (heading/paragraph/list/callout/quiz) ont une couleur de texte réelle, jamais blanc sur fond clair.');

    const fullscreenScreenshotPath = path.join(outDir, '3-plein-ecran-tous-blocs.png');
    await page.screenshot({ path: fullscreenScreenshotPath, fullPage: false });
    console.log('CAPTURE — ' + fullscreenScreenshotPath);

    // ══════════════════════════════════════════════════════════════════════
    // 4. Le mécanisme de révélation progressive et le clic du quiz fonctionnent TOUJOURS
    //    identiquement (comportement intact, seule l'apparence a changé).
    // ══════════════════════════════════════════════════════════════════════
    const quizClickResult = await page.evaluate(() => {
      const quizEl = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-quiz');
      const options = quizEl.querySelectorAll('.adoc-sc-quiz-option');
      options[0].click(); // "Dopamine" — incorrect, la bonne réponse est "Cortisol" (index 1)
      return {
        answered: quizEl.classList.contains('is-answered'),
        wrongMarked: options[0].classList.contains('is-incorrect'),
        correctMarked: options[1].classList.contains('is-correct'),
        revealShown: quizEl.querySelector('.adoc-sc-quiz-reveal').classList.contains('is-shown'),
      };
    });
    assert.deepEqual(quizClickResult, { answered: true, wrongMarked: true, correctMarked: true, revealShown: true },
      'le mécanisme de clic/révélation du quiz doit fonctionner IDENTIQUEMENT après le correctif visuel');
    console.log('PASS 4/7 — Mécanisme de clic/révélation du quiz : comportement strictement intact après le correctif.');

    // Sommaire cliquable + navigation toujours fonctionnels (régression Lot 1/2, saut direct).
    await page.evaluate(() => window.adocPresentGoTo(1));
    await page.waitForTimeout(320);
    const tocJumpOk = await page.evaluate(() => document.getElementById('cc-ws-present-counter').textContent === '2 / 2');
    assert.equal(tocJumpOk, true, 'RÉGRESSION — le saut direct via le sommaire doit toujours fonctionner après le correctif');
    console.log('PASS 5/7 — RÉGRESSION — sommaire cliquable / saut direct toujours fonctionnel.');
    await page.evaluate(() => window.adocPresentClose());

    // ══════════════════════════════════════════════════════════════════════
    // 5. EXPORT PDF — confirmer explicitement (pas supposer) que le contenu reste lisible :
    //    l'enveloppe séparée (adocBuildCarrouselPdfPagesHTML) n'est jamais affectée par ce
    //    correctif (elle n'utilise jamais adocPresentRenderSlideHTML).
    // ══════════════════════════════════════════════════════════════════════
    const pdfHtml = await page.evaluate(async (sk) => {
      const art = window._adocArtifacts[sk];
      const doc = art._adocStructuredDoc;
      const rendered = await window.adocRenderClinicalDocument(doc, art._adocStructuredSnapshot, art._adocRenderManifestOverride || null);
      let captured = null;
      const realFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (String(url).includes('/browser-rendering/generate-carrousel-pdf')) { captured = JSON.parse(opts.body).html; return new Response(new Blob(['fake-pdf']), { status: 200 }); }
        return realFetch(url, opts);
      };
      try { await window.adocWsExportCarrouselPDF(); } catch (e) {}
      window.fetch = realFetch;
      return captured;
    }, presKey);
    assert.ok(pdfHtml, 'le HTML envoyé au générateur PDF doit avoir été capturé');
    assert.ok(pdfHtml.includes('Le stress chronique'), 'le titre de section doit être lisible dans le PDF');
    assert.ok(pdfHtml.includes('Quelle hormone'), 'la question du quiz doit être lisible dans le PDF');
    // Correctif Lot A (export Présentation autonome) — la découverte incidente de l'investigation
    // (ni l'export HTML classique ni l'export PDF n'embarquaient les styles .adoc-sc-presentation*/
    // .adoc-sc-quiz*/.adoc-sc-card-img) a été corrigée : la RÈGLE CSS `.adoc-sc-presentation{...}`
    // apparaît désormais légitimement dans le <style> du PDF (texte de règle, jamais appliquée —
    // aucun élément du corps ne porte cette classe). L'invariant réel à vérifier reste inchangé :
    // le BALISAGE de la vue d'édition (`class="adoc-sc-presentation-slide"` sur un <div>, posé
    // uniquement par adocRenderPresentationHTML) n'apparaît jamais dans le corps du PDF
    // (adocBuildCarrouselPdfPagesHTML appelle directement adocRenderCardHTML par carte, jamais
    // adocRenderPresentationHTML) — enveloppes toujours séparées, jamais partagées.
    assert.ok(!pdfHtml.includes('class="adoc-sc-presentation-slide"'), 'l\'export PDF utilise sa PROPRE enveloppe (adocBuildCarrouselPdfPagesHTML), jamais le balisage de la vue d\'édition (adocRenderPresentationHTML)');
    console.log('PASS 6/7 — Export PDF confirmé non affecté par le correctif visuel (enveloppe séparée, contenu toujours lisible).');

    // ══════════════════════════════════════════════════════════════════════
    // 6. Vérification finale — aucune erreur JS.
    // ══════════════════════════════════════════════════════════════════════
    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant tout le scénario du correctif visuel');
    console.log('PASS 7/7 — Aucune erreur JS non gérée.');

    console.log('\nTOUS LES TESTS DU CORRECTIF VISUEL PASSENT (7/7)');
    console.log('Captures d\'écran enregistrées dans : ' + outDir);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
