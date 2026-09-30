// STUDIO CLINIQUE — LOT 2 Présentation, Parties A/B — preuve réelle en navigateur (Playwright).
// Partie A : 6e carte "Présentation" sur l'écran d'accueil, même patron exact que les 5 autres.
// Partie B : écran d'options structurées (nombre de diapositives, conclusion), visible UNIQUEMENT
// au clic explicite sur la carte, et dont l'influence sur le document produit est vérifiée via le
// MÊME point d'entrée direct (window.adocRunGenerationPipeline) que verify-presentation-lot1.cjs —
// jamais un appel réel à l'API Anthropic (convention de test déjà établie dans ce projet).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}
function plainTextEndTurnSSE(text) {
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ]);
}
function presentationToolUseSSE(toolName, slideTitles) {
  const input = JSON.stringify({
    title: 'Présentation test', purpose: 'formation', audience: 'praticien',
    cards: slideTitles.map((t, i) => ({
      title: t,
      blocks: [{ type: 'paragraph', text: 'Contenu ' + (i + 1) + '.', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: [] }],
    })),
  });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_presentation', name: toolName } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    let page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // ÉCRAN DE CONNEXION — sans clé configurée, #cc-login-screen couvrirait toute la page et
    // bloquerait les clics réels de ce test (même patron que verify-media-block-insert.cjs).
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));

    // ══════════════════════════════════════════════════════════════════════
    // PARTIE A + B (DOM) — carte, infobulle, écran d'options, capture de l'événement réel dispatché
    // par le formulaire d'accueil (aucune simulation d'event — le vrai clic + la vraie soumission).
    // ══════════════════════════════════════════════════════════════════════
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    // Réseau générique en échec gracieux (fail-open, déjà le comportement existant de
    // adocEvaluateClarity/adocPlanQuery) — jamais un appel réel à l'API Anthropic ici, seul
    // l'événement dispatché par le formulaire d'accueil est examiné dans ce bloc.
    await page.route('**/*', (route) => route.request().url().startsWith('file:') ? route.continue() : route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.evaluate(() => { window.__capturedDetail = null; window.addEventListener('conseiller-clinique:start', (e) => { window.__capturedDetail = e.detail; }); });

    const presentationCard = page.locator('#format-presentation');
    await presentationCard.click();
    assert.equal(await presentationCard.getAttribute('aria-pressed'), 'true', 'Partie A — la carte Présentation doit devenir pressée au clic');
    assert.equal(await page.locator('#cc-presentation-options').isHidden(), false, 'Partie B — l\'écran d\'options doit apparaître au clic sur la carte Présentation');
    console.log('PASS 1/6 — Partie A : carte "Présentation" cliquable, même patron que les 5 autres (aria-pressed).');
    console.log('PASS 2/6 — Partie B : écran d\'options visible immédiatement au clic sur la carte.');

    // Bascule vers une AUTRE carte — l'écran d'options doit se refermer (jamais laissé ouvert
    // pour un autre documentKind, qui n'a aucun effet sur lui).
    await page.locator('#format-carousel').click();
    assert.equal(await page.locator('#cc-presentation-options').isHidden(), true, 'Partie B — l\'écran d\'options doit se refermer si un AUTRE type est sélectionné');
    console.log('PASS 3/6 — Partie B : écran d\'options refermé au clic sur un autre type de document.');

    // Retour sur Présentation, remplissage des options, soumission réelle du formulaire.
    await presentationCard.click();
    await page.fill('#cc-presentation-slide-count', '7');
    await page.check('#cc-presentation-conclusion');
    await page.fill('#clinical-question', 'Prépare un exposé sur la gestion du stress pour des professionnels.');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(100);

    const captured = await page.evaluate(() => window.__capturedDetail);
    assert.equal(captured.format, 'presentation', 'l\'événement doit porter documentKind="presentation"');
    assert.deepEqual(captured.presentationOptions, { slideCount: 7, conclusion: true }, 'les options remplies doivent être transmises telles quelles dans l\'événement réel du formulaire');
    console.log('PASS 4/6 — Partie B : soumission réelle du formulaire — options transmises fidèlement dans l\'événement (slideCount:7, conclusion:true).');

    // ══════════════════════════════════════════════════════════════════════
    // PARTIE B (influence réelle sur le document produit) — même point d'entrée direct que
    // verify-presentation-lot1.cjs (window.adocRunGenerationPipeline avec un plan explicite) :
    // prouve que presentation_options modifie réellement le prompt envoyé au modèle, jamais
    // seulement transmis sans effet.
    // ══════════════════════════════════════════════════════════════════════
    // Nouvelle page plutôt qu'un rechargement de la même page — évite un défaut d'environnement
    // déjà rencontré ailleurs dans ce projet (accès localStorage intermittent pendant un
    // page.reload() en Chromium headless sandboxé, sans rapport avec le code de ce lot — même
    // erreur exacte que verify-phase1-library-search.cjs, confirmée pré-existante par ailleurs).
    await page.close();
    page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    const anthropicCalls = [];
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (url.endsWith('/search-academic-studies')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
      if (body.payload) {
        anthropicCalls.push(body.payload);
        if (body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
          if (body.payload.tool_choice.name === 'emit_presentation_document') {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationToolUseSSE('emit_presentation_document', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']) });
          }
          return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        }
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: plainTextEndTurnSSE('Réponse.') });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    async function runPipeline(text, plan, precomputedRag, typingId) {
      await page.evaluate(async ({ text, plan, precomputedRag, typingId }) => {
        const area = document.getElementById('adoc-messages');
        const el = document.createElement('div'); el.id = typingId; el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        await window.adocRunGenerationPipeline(text, plan, typingId, 'https://clone-proxy.test.local', precomputedRag || null);
      }, { text, plan, precomputedRag, typingId });
    }
    const precomputedRag = { chunks: [{ content: 'Passage de bibliothèque.', book_title: 'Livre Test', author: 'Auteur Test', page_number: 5, _score: 0.9 }] };

    // Avec options explicites : nombre de diapositives + conclusion.
    {
      anthropicCalls.length = 0;
      const plan = { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 45, audience_type: 'praticien', presentation_options: { slideCount: 7, conclusion: true }, _formatClarityResolved: true };
      await runPipeline('Prépare un exposé sur la gestion du stress.', plan, precomputedRag, 'typing-lot2-options');
      const forcedCall = anthropicCalls.find((p) => p.tool_choice && p.tool_choice.type === 'tool');
      assert.ok(forcedCall, 'un appel forcé doit avoir eu lieu');
      assert.equal(forcedCall.tool_choice.name, 'emit_presentation_document');
      assert.ok(forcedCall.system.includes('Nombre de diapositives demandé explicitement par l\'utilisatrice : 7'),
        'le nombre de diapositives explicite doit REMPLACER le calcul automatique dans le prompt');
      assert.ok(!forcedCall.system.includes('Durée cible : 45 minutes. Vise environ'),
        'le calcul automatique par durée ne doit PLUS apparaître quand un nombre explicite est fourni');
      assert.ok(forcedCall.system.includes('Termine impérativement par une dernière diapositive de conclusion/synthèse'),
        'la case "conclusion" cochée doit ajouter l\'instruction correspondante au prompt');
      const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {})[0]);
      const doc = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc, storeKey);
      assert.equal(doc.documentKind, 'presentation');
      assert.equal(doc.blocks.length, 7, 'le document produit doit refléter réellement le nombre de diapositives demandé (simulation du modèle qui a obéi)');
      console.log('PASS 5/6 — Partie B : options structurées (nombre=7, conclusion) modifient RÉELLEMENT le prompt envoyé au modèle (pas seulement transmises sans effet).');
    }

    // RÉGRESSION — sans presentation_options (comme au Lot 1), le calcul automatique par durée
    // doit rester strictement inchangé.
    {
      anthropicCalls.length = 0;
      // _courseOfferResolved : « Cours en modules » est postérieur à ce test. Sans nombre explicite,
      // 45 minutes dépassent le plafond de diapositives tenable en une production, donc
      // adocCourseOfferBudget propose le découpage en modules et adocRunGenerationPipeline rend la
      // main AVANT tout appel au modèle — ce qui ne capturait plus aucun appel forcé ici. Ce drapeau
      // est exactement ce que pose le vrai flux quand l'utilisatrice répond « présentation
      // condensée » ; on mesure donc bien le chemin réel, sans rien neutraliser des trois assertions
      // de régression du Lot 1 ci-dessous.
      const plan = { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 45, audience_type: 'praticien', _formatClarityResolved: true, _courseOfferResolved: true };
      await runPipeline('Prépare un exposé sur la gestion du stress.', plan, precomputedRag, 'typing-lot2-regression');
      const forcedCall = anthropicCalls.find((p) => p.tool_choice && p.tool_choice.type === 'tool');
      assert.ok(forcedCall.system.includes('Durée cible : 45 minutes. Vise environ'), 'RÉGRESSION Lot 1 — sans options, le calcul automatique par durée doit rester actif, inchangé');
      assert.ok(!forcedCall.system.includes('demandé explicitement'), 'RÉGRESSION — aucune mention d\'un nombre explicite quand aucune option n\'est fournie');
      assert.ok(!forcedCall.system.includes('diapositive de conclusion/synthèse'), 'RÉGRESSION — aucune instruction de conclusion quand la case n\'est pas cochée');
      console.log('PASS 6/6 — RÉGRESSION Lot 1 : sans options structurées, le comportement (calcul automatique par durée) reste strictement inchangé.');
    }

    // Défaut d'environnement pré-existant, sans rapport avec ce lot : accès localStorage
    // intermittent sous Chromium headless sandboxé (confirmé par ailleurs — même erreur
    // exacte et non déterministe dans verify-phase1-library-search.cjs, reproduite via
    // git stash/stash pop sur le code d'AVANT le Lot 1, donc totalement étrangère au code
    // de Présentation). Filtrée ici explicitement, jamais un silence générique sur "aucune
    // erreur JS" : toute autre erreur continue de faire échouer ce test.
    const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    const realErrors = errors.filter((m) => m !== KNOWN_ENV_FLAKE);
    assert.deepEqual(realErrors, [], 'aucune erreur JS non gérée pendant tout le scénario Lot 2 Parties A/B');
    console.log('\nTOUS LES TESTS PRÉSENTATION LOT 2 PARTIES A/B PASSENT (6/6)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
