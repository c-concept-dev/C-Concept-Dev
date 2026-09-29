// STUDIO CLINIQUE — Présentation : garde-fou générique onclick/export autonome.
// Test générique, indépendant de toute fonctionnalité précise (proposé dans
// RAPPORT-INVESTIGATION-PORTES-PRESENTATION.md, point 5) : extrait par expression régulière tous
// les noms de fonction référencés par un attribut onclick="window.NomFonction(...)" dans le HTML
// RÉELLEMENT rendu du mode présentation, puis vérifie que chacun a bien une définition
// "window.NomFonction = " dans le script produit par adocBuildStandalonePresentationHTML (via
// window.adocWsExportStandalonePresentation, seul point d'accès exposé). Le détecteur est ensuite
// auto-testé contre un cas volontairement sabordé (une fonction renommée dans le script exporté)
// pour prouver qu'il détecte réellement une absence, jamais un test qui passerait trivialement.
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
  const input = JSON.stringify({ title: 'Présentation garde-fou export', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_guard', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Le détecteur lui-même — indépendant de toute liste codée en dur.
// ═══════════════════════════════════════════════════════════════════════════════
function findOnclickWindowFnNames(html) {
  const names = new Set();
  const re = /onclick="window\.(\w+)\(/g;
  let m;
  while ((m = re.exec(html))) names.add(m[1]);
  return [...names];
}
function findMissingDefinitions(fnNames, exportedScriptText) {
  return fnNames.filter((name) => !exportedScriptText.includes('window.' + name + ' = '));
}

const QUESTIONS = [
  { text: 'Question A', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
  { text: 'Question B', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
];
const PROFILES = [
  { label: 'A', minScore: 0, maxScore: 1, interpretation: 'x' },
  { label: 'B', minScore: 2, maxScore: 4, interpretation: 'y' },
];

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    page.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) errors.push(e.message); });
    page.on('dialog', (d) => d.dismiss());
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    const cards = [
      {
        title: 'Diapositive unique',
        blocks: [
          flatBlock({ type: 'heading', text: 'Titre', level: 2 }),
          flatBlock({ type: 'paragraph', text: 'Un paragraphe.' }),
          flatBlock({ type: 'quiz', text: 'Vrai ou faux ?', quizOptions: ['Vrai', 'Faux'], quizCorrectIndex: 0, quizExplanation: 'Explication.' }),
          flatBlock({ type: 'questionnaire', questionnaireQuestions: QUESTIONS, questionnaireProfiles: PROFILES, questionnaireTwoPartners: true }),
          flatBlock({ type: 'image', imageQuery: 'anatomy diagram detail', imageAlt: 'Diagramme anatomique' }),
        ],
      },
    ];

    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/fetch-image')) {
        const q = new URL(url).searchParams.get('q');
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ photos: [{ url: 'https://images.pexels.test/' + encodeURIComponent(q) + '.jpg' }] }),
        });
      }
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool' && body.payload.tool_choice.name === 'emit_presentation_document') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationSSE(cards) });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    const storeKey = await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-guard'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline(
        'Prépare un exposé exerçant tous les types de bloc interactifs.',
        { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
        'typing-guard', 'https://clone-proxy.test.local', precomputedRag
      );
      return Object.keys(window._adocArtifacts || {}).slice(-1)[0];
    });
    assert.ok(storeKey, 'un artefact Présentation doit avoir été créé');
    assert.equal(await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey), true, 'adocOpenWorkspace doit réussir');

    // ══════════════════════════════════════════════════════════════════════
    // 1. HTML réellement rendu du mode présentation — ouvre, révèle le sommaire (onclick de
    //    navigation), révèle la diapositive (quiz/questionnaire/image), ouvre la porte image.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => window.adocPresentOpen());
    await page.evaluate(() => window.adocPresentToggleToc()); // révèle les onclick des items du sommaire
    await page.evaluate(() => window.adocPresentToggleToc()); // referme (juste pour capturer le HTML au repos)
    await page.click('#cc-ws-present-slide-inner .adoc-sc-image img').catch(() => {});
    await page.waitForTimeout(50);
    const overlayHtml = await page.evaluate(() => document.getElementById('cc-ws-present-overlay').outerHTML);
    // Capture aussi le sommaire déployé (ses items onclick n'apparaissent que quand il est ouvert).
    await page.evaluate(() => window.adocPresentToggleToc());
    const tocHtml = await page.evaluate(() => document.getElementById('cc-ws-present-toc').outerHTML);
    await page.evaluate(() => window.adocPresentToggleToc());

    const fnNames = findOnclickWindowFnNames(overlayHtml + tocHtml);
    assert.ok(fnNames.length >= 8, 'le HTML réel doit exposer plusieurs fonctions onclick (trouvé : ' + fnNames.length + ')');
    for (const expected of ['adocQuizSelectOption', 'adocQuestionnaireSelectOption', 'adocQuestionnaireSwitchPartner', 'adocQuestionnaireCalculerResultat', 'adocPresentOpenImageDoor', 'adocPresentCloseImageDoor', 'adocPresentNext', 'adocPresentPrev', 'adocPresentToggleToc', 'adocPresentClose', 'adocPresentGoTo']) {
      assert.ok(fnNames.includes(expected), 'la détection doit trouver ' + expected + ' dans le HTML réel (sanity du test lui-même)');
    }
    console.log('PASS 1/3 — ' + fnNames.length + ' fonctions onclick réellement trouvées dans le HTML rendu : ' + fnNames.join(', '));

    // ══════════════════════════════════════════════════════════════════════
    // 2. Chacune a bien une définition dans le script de l'export autonome réel.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => {
      window.__capturedBlob = null;
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.__capturedBlob = blob; return orig.call(URL, blob); };
    });
    await page.evaluate(() => window.adocWsExportStandalonePresentation());
    const standaloneHtml = await page.evaluate(async () => window.__capturedBlob ? await window.__capturedBlob.text() : null);
    assert.ok(standaloneHtml, 'le HTML de l\'export autonome doit avoir été capturé');
    const scriptMatch = standaloneHtml.match(/<script>([\s\S]*)<\/script>/);
    assert.ok(scriptMatch, 'l\'export autonome doit contenir un <script>');
    const scriptText = scriptMatch[1];

    const missing = findMissingDefinitions(fnNames, scriptText);
    assert.deepEqual(missing, [], 'toutes les fonctions onclick du mode présentation doivent être définies dans l\'export autonome — manquantes : ' + missing.join(', '));
    console.log('PASS 2/3 — Toutes les ' + fnNames.length + ' fonctions onclick ont une définition dans l\'export autonome réel.');

    // ══════════════════════════════════════════════════════════════════════
    // 3. AUTO-TEST DU GARDE-FOU — sabote délibérément une définition, prouve que le détecteur la
    //    signale bien comme manquante (jamais un test qui passerait quel que soit l'export).
    // ══════════════════════════════════════════════════════════════════════
    const sabotagedScript = scriptText.replace('window.adocPresentOpenImageDoor = ', 'window.adocPresentOpenImageDoorRENOMMEE_PAR_SABOTAGE = ');
    assert.notEqual(sabotagedScript, scriptText, 'le sabotage doit avoir réellement modifié le texte (sinon le test ne prouve rien)');
    const missingAfterSabotage = findMissingDefinitions(fnNames, sabotagedScript);
    assert.ok(missingAfterSabotage.includes('adocPresentOpenImageDoor'), 'le garde-fou DOIT détecter la fonction volontairement retirée — sinon il ne détecte rien de réel');
    assert.equal(missingAfterSabotage.length, 1, 'seule la fonction sabotée doit être signalée manquante, jamais un faux positif sur les autres');
    console.log('PASS 3/3 — Auto-test : le garde-fou détecte bien une fonction volontairement retirée (adocPresentOpenImageDoor), sans faux positif ailleurs.');

    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant le scénario garde-fou');
    console.log('\nTOUS LES TESTS GARDE-FOU ONCLICK/EXPORT PASSENT (3/3)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
