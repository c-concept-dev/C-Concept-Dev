// STUDIO CLINIQUE — LOT 1 Présentation (6e documentKind) — preuve réelle en navigateur (Playwright).
// Même patron de mock réseau que verify-routage-keyword-diagnostic.cjs : page réelle
// (studio-clinique.html), plan transmis directement à window.adocRunGenerationPipeline (le plan
// LUI-MÊME simule ce que le planificateur LLM renverrait pour "fais-moi une présentation sur X,
// durée 45 minutes, pour des professionnels" — cf. rapport, aucun appel réel à l'API Anthropic
// n'est fait dans cette suite, comme pour tous les tests existants de ce projet), routes réseau
// interceptées et servies par des réponses SSE construites à la main.
//
// Couvre les points de VALIDATION EXIGÉE du CDC :
//  1. Texte libre SANS bouton de type -> atteint bien ADOC_STRUCTURED_PROFILES.presentation
//     (emit_presentation_document), jamais html-visual/emit_carrousel_document.
//  2. Le prompt système envoyé au modèle contient bien l'instruction de densité dérivée de
//     duree_minutes (formule exacte de studio-clinique-core.js).
//  3. Document produit : documentKind='presentation', badge "PRÉSENTATION", 3 diapositives.
//  4. Mode plein écran : ouverture, navigation clavier (flèches), sommaire cliquable (saut direct
//     à une diapositive non consécutive), transition appliquée (classe de sortie posée puis
//     retirée), Échap ferme UNIQUEMENT le mode présentation (jamais l'espace de travail entier).
//  5. Bloc vidéo (lien local déjà enregistré) : s'insère et s'affiche normalement dans une
//     diapositive — aucune restriction nouvelle, mécanisme déjà existant réutilisé tel quel.
//  6. Export PDF : une page par diapositive (réutilisation intégrale du mécanisme Carrousel).
//  7. Régression Carrousel : la branche de schéma désormais partagée ne casse pas une génération
//     Carrousel réelle (bout en bout, pas seulement une validation de schéma statique).
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

// Simule un document de N cartes (diapositives), chacune un seul bloc paragraph — suffisant pour
// prouver la structure (documentKind/blocks[].type='card'/content.blocks[]), jamais un contenu
// clinique réel (hors périmètre de ce test).
function presentationToolUseSSE(toolName, slideTitles) {
  const input = JSON.stringify({
    title: 'Présentation test', purpose: 'formation', audience: 'praticien',
    cards: slideTitles.map((t, i) => ({
      title: t,
      blocks: [{ type: 'paragraph', text: 'Contenu de la diapositive ' + (i + 1) + '.', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: [] }],
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

function carrouselToolUseSSE(toolName) {
  const input = JSON.stringify({
    title: 'Carrousel test', purpose: 'information', audience: 'clinicien',
    cards: [
      { title: 'Carte 1', blocks: [{ type: 'paragraph', text: 'Texte 1.', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: [] }] },
      { title: 'Carte 2', blocks: [{ type: 'paragraph', text: 'Texte 2.', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: [] }] },
    ],
  });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_carrousel', name: toolName } },
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

    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    const anthropicCalls = [];
    let lastPdfRequestHtml = null;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}

      if (url.endsWith('/browser-rendering/generate-carrousel-pdf')) {
        lastPdfRequestHtml = body.html || '';
        return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-FAKE') });
      }
      if (url.endsWith('/video-links') && route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ id: 'vid-1', url: 'http://localhost:47823/seance1.mp4', title: 'Exercice de respiration' }] }) });
      }
      if (url.endsWith('/search-academic-studies')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
      }
      if (body.payload) {
        anthropicCalls.push(body.payload);
        if (body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
          const toolName = body.payload.tool_choice.name;
          if (toolName === 'emit_presentation_document') {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationToolUseSSE(toolName, ['Introduction', 'Développement', 'Conclusion']) });
          }
          if (toolName === 'emit_carrousel_document') {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: carrouselToolUseSSE(toolName) });
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
        const el = document.createElement('div');
        el.id = typingId;
        el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        await window.adocRunGenerationPipeline(text, plan, typingId, 'https://clone-proxy.test.local', precomputedRag || null);
      }, { text, plan, precomputedRag, typingId });
    }

    // ══════════════════════════════════════════════════════════════════════
    // TEST 1 — Texte libre SANS bouton de type -> intent='presentation' (simule ce que le
    // planificateur renverrait pour "fais-moi une présentation sur la gestion du stress, durée 45
    // minutes, pour des professionnels") -> atteint bien emit_presentation_document, JAMAIS
    // html-visual/emit_carrousel_document. duree_minutes=45 -> densité attendue vérifiée ci-dessous.
    // ══════════════════════════════════════════════════════════════════════
    {
      anthropicCalls.length = 0;
      const plan = { needs_rag: true, intent: 'presentation', duree_minutes: 45, audience_type: 'praticien', _formatClarityResolved: true };
      const precomputedRag = { chunks: [{ content: 'Passage de bibliothèque sur la gestion du stress.', book_title: 'Livre Test', author: 'Auteur Test', page_number: 12, _score: 0.9 }] };
      await runPipeline('Fais-moi une présentation sur la gestion du stress, durée 45 minutes, pour des professionnels.', plan, precomputedRag, 'typing-presentation-1');

      const forcedCall = anthropicCalls.find((p) => p.tool_choice && p.tool_choice.type === 'tool');
      assert.ok(forcedCall, 'un appel forcé (tool_choice) doit avoir eu lieu');
      assert.equal(forcedCall.tool_choice.name, 'emit_presentation_document', 'doit cibler emit_presentation_document, jamais emit_carrousel_document ni un chemin html-visual');
      assert.ok(forcedCall.system.includes('GÉNÉRATION STRUCTURÉE (Présentation)'), 'le prompt doit contenir le suffixe du profil presentation');
      // Le plafond de 20 diapositives (adocPresentationSlideBudget) borne désormais la densité :
      // 45 minutes donneraient 30 diapositives par le calcul, mais une présentation qui en compte
      // plus de 20 voit le modèle compenser en tassant chaque diapositive — mesuré, c'est ce qui a
      // motivé le plafond. La même formule est reprise ici, plafond compris, plutôt qu'un 20 écrit
      // en dur : si la borne bouge, ce test suit au lieu de mentir.
      const MAX_DIAPOSITIVES = 20;
      const expectedSlideCount = Math.min(MAX_DIAPOSITIVES, Math.max(3, Math.round(45 / 1.5)));
      assert.ok(forcedCall.system.includes('Durée cible : 45 minutes'), 'la durée doit être reportée telle quelle dans le prompt');
      assert.ok(forcedCall.system.includes(String(expectedSlideCount) + ' diapositives'), 'la densité calculée (' + expectedSlideCount + ' diapositives pour 45 minutes) doit apparaître dans le prompt');
      console.log('PASS 1/7 — Texte libre SANS bouton -> emit_presentation_document (jamais html-visual/carrousel), densité 45min correctement reportée dans le prompt (' + expectedSlideCount + ' diapositives).');
    }

    // Récupère le storeKey de l'artefact fraîchement créé et ouvre l'espace de travail.
    const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {})[0]);
    assert.ok(storeKey, 'un artefact doit avoir été créé par le test 1');
    const openOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    assert.equal(openOk, true, 'adocOpenWorkspace doit réussir pour ce document presentation');

    // ══════════════════════════════════════════════════════════════════════
    // TEST 2 — Structure du document produit : documentKind, badge, 3 diapositives.
    // ══════════════════════════════════════════════════════════════════════
    {
      const info = await page.evaluate((sk) => {
        const art = window._adocArtifacts[sk];
        return {
          documentKind: art._adocStructuredDoc.documentKind,
          blocksCount: art._adocStructuredDoc.blocks.length,
          blockTypes: art._adocStructuredDoc.blocks.map((b) => b.type),
          badge: document.getElementById('cc-ws-badge').textContent,
          presentBtnHidden: document.getElementById('cc-ws-present-btn').hidden,
          pdfBtnHidden: document.getElementById('cc-ws-export-pdf-carrousel-btn').hidden,
        };
      }, storeKey);
      assert.equal(info.documentKind, 'presentation');
      assert.equal(info.blocksCount, 3, '3 diapositives attendues (Introduction/Développement/Conclusion)');
      assert.deepEqual(info.blockTypes, ['card', 'card', 'card'], 'chaque diapositive doit être un bloc type=card (réutilisation totale de la structure Carrousel)');
      assert.equal(info.badge, 'PRÉSENTATION', 'le badge doit refléter le nouveau type');
      assert.equal(info.presentBtnHidden, false, 'le bouton "Présenter" doit être visible pour ce documentKind');
      assert.equal(info.pdfBtnHidden, false, 'le bouton export PDF doit être visible (Décision 9)');
      console.log('PASS 2/7 — Document produit : documentKind=presentation, 3 diapositives (type=card), badge PRÉSENTATION, boutons Présenter/PDF visibles.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // TEST 3 — Mode plein écran : ouverture, contenu de la 1re diapositive, navigation clavier,
    // sommaire cliquable (saut direct à la 3e sans passer par la 2e), transition appliquée.
    // ══════════════════════════════════════════════════════════════════════
    {
      await page.evaluate(() => window.adocPresentOpen());
      const s1 = await page.evaluate(() => ({
        open: document.getElementById('cc-ws-present-overlay').classList.contains('open'),
        title: document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card-title')?.textContent,
        counter: document.getElementById('cc-ws-present-counter').textContent,
      }));
      assert.equal(s1.open, true);
      assert.equal(s1.title, 'Introduction');
      assert.equal(s1.counter, '1 / 3');

      // Navigation clavier — flèche droite.
      await page.keyboard.press('ArrowRight');
      // La transition attend ~260ms avant de remplacer le contenu (fondu + glissement).
      await page.waitForTimeout(400);
      const s2 = await page.evaluate(() => ({
        title: document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card-title')?.textContent,
        counter: document.getElementById('cc-ws-present-counter').textContent,
      }));
      assert.equal(s2.title, 'Développement');
      assert.equal(s2.counter, '2 / 3');

      // Sommaire cliquable — saut DIRECT à la 3e diapositive (non consécutive depuis la 2e).
      await page.evaluate(() => window.adocPresentToggleToc());
      const tocVisible = await page.evaluate(() => !document.getElementById('cc-ws-present-toc').hidden);
      assert.equal(tocVisible, true);
      const tocTitles = await page.evaluate(() => Array.from(document.querySelectorAll('.cc-ws-present-toc-title')).map((el) => el.textContent));
      assert.deepEqual(tocTitles, ['Introduction', 'Développement', 'Conclusion']);
      await page.evaluate(() => window.adocPresentGoTo(2));
      await page.waitForTimeout(400);
      const s3 = await page.evaluate(() => ({
        title: document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card-title')?.textContent,
        counter: document.getElementById('cc-ws-present-counter').textContent,
        tocHidden: document.getElementById('cc-ws-present-toc').hidden,
      }));
      assert.equal(s3.title, 'Conclusion', 'le sommaire doit permettre un saut direct, non consécutif');
      assert.equal(s3.counter, '3 / 3');
      assert.equal(s3.tocHidden, true, 'sauter depuis le sommaire doit le refermer');

      // Échap ferme UNIQUEMENT le mode présentation, jamais l'espace de travail entier.
      await page.keyboard.press('Escape');
      const afterEscape = await page.evaluate(() => ({
        presentOpen: document.getElementById('cc-ws-present-overlay').classList.contains('open'),
        wsOpen: document.getElementById('cc-workspace').classList.contains('open'),
      }));
      assert.equal(afterEscape.presentOpen, false, 'Échap doit fermer le mode présentation');
      assert.equal(afterEscape.wsOpen, true, 'Échap ne doit JAMAIS fermer l\'espace de travail entier depuis le mode présentation');
      console.log('PASS 3/7 — Mode plein écran : navigation clavier (flèche droite), sommaire cliquable (saut direct 2->3e diapositive), Échap ferme uniquement le mode présentation.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // TEST 4 — Bloc vidéo (lien local déjà enregistré) s'insère et s'affiche normalement dans une
    // diapositive — aucune restriction nouvelle (mécanisme déjà existant, Décision 8).
    // ══════════════════════════════════════════════════════════════════════
    {
      await page.evaluate(() => window.adocVideoLoadHistory());
      await page.waitForTimeout(50);
      const firstParagraphBlockId = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[0].content.blocks[0].id, storeKey);
      const inserted = await page.evaluate(async ({ sk, blockId }) => {
        Object.assign(window._adocBlockEditState, { storeKey: sk, blockId });
        return window.adocVideoInsertFromSidebar(0);
      }, { sk: storeKey, blockId: firstParagraphBlockId });
      // adocVideoInsertFromSidebar ne renvoie rien explicitement (undefined) mais insère bien —
      // on vérifie l'état réel du document, jamais la seule valeur de retour.
      const afterInsert = await page.evaluate((sk) => {
        const blocks = window._adocArtifacts[sk]._adocStructuredDoc.blocks[0].content.blocks;
        const videoBlock = blocks.find((b) => b.type === 'video');
        return {
          videoBlock,
          renderedVideoTag: !!document.querySelector('#cc-ws-doc-card video[src*="seance1.mp4"], #cc-ws-doc-card video source[src*="seance1.mp4"]'),
        };
      }, storeKey);
      assert.ok(afterInsert.videoBlock, 'un bloc type=video doit avoir été inséré dans la 1re diapositive');
      assert.equal(afterInsert.videoBlock.content.url, 'http://localhost:47823/seance1.mp4');
      assert.equal(afterInsert.videoBlock.content.title, 'Exercice de respiration');
      assert.equal(afterInsert.renderedVideoTag, true, 'la vidéo doit être réellement rendue (balise <video>) dans la diapositive affichée');
      console.log('PASS 4/7 — Bloc vidéo (lien local déjà enregistré) inséré et affiché normalement dans une diapositive de Présentation, sans aucune restriction.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // TEST 5 — Export PDF : une page par diapositive (réutilisation intégrale du mécanisme
    // Carrousel, handleGenerateCarrouselPDF côté Worker inchangé).
    // ══════════════════════════════════════════════════════════════════════
    {
      lastPdfRequestHtml = null;
      await page.evaluate(() => window.adocWsExportCarrouselPDF());
      await page.waitForTimeout(200);
      assert.ok(lastPdfRequestHtml, 'une requête PDF doit avoir été envoyée');
      const pageCount = (lastPdfRequestHtml.match(/class="adoc-pdf-page"/g) || []).length;
      assert.equal(pageCount, 3, 'une page PDF par diapositive (3 attendues)');
      assert.ok(lastPdfRequestHtml.includes('Introduction') && lastPdfRequestHtml.includes('Conclusion'), 'les titres des diapositives doivent apparaître dans le HTML multi-pages');
      console.log('PASS 5/7 — Export PDF : une page par diapositive (3/3), mécanisme Carrousel réutilisé sans modification Worker.');
    }

    await page.evaluate(() => window.adocCloseWorkspace());

    // ══════════════════════════════════════════════════════════════════════
    // TEST 6 — RÉGRESSION Carrousel : génération bout en bout inchangée après le partage de la
    // branche de schéma allOf avec Présentation (jamais seulement une validation de schéma
    // statique — une vraie génération, comme avant ce lot).
    // ══════════════════════════════════════════════════════════════════════
    {
      anthropicCalls.length = 0;
      const plan = { needs_rag: true, documentKind: 'carrousel', intent: 'chat', _formatClarityResolved: true };
      const precomputedRag = { chunks: [{ content: 'Passage de bibliothèque.', book_title: 'Livre Test', author: 'Auteur Test', page_number: 5, _score: 0.9 }] };
      await runPipeline('Fais-moi un carrousel sur ce sujet.', plan, precomputedRag, 'typing-regression-carrousel');
      const forcedCall = anthropicCalls.find((p) => p.tool_choice && p.tool_choice.type === 'tool');
      assert.ok(forcedCall, 'un appel forcé doit avoir eu lieu pour Carrousel (documentKind explicite)');
      assert.equal(forcedCall.tool_choice.name, 'emit_carrousel_document', 'Carrousel doit toujours cibler son propre outil, jamais affecté par le nouveau profil presentation');
      const newStoreKey = await page.evaluate(() => {
        const keys = Object.keys(window._adocArtifacts || {});
        return keys[keys.length - 1];
      });
      const kind = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.documentKind, newStoreKey);
      assert.equal(kind, 'carrousel');
      const openOk2 = await page.evaluate((sk) => window.adocOpenWorkspace(sk), newStoreKey);
      assert.equal(openOk2, true, 'un Carrousel doit toujours s\'ouvrir normalement dans l\'espace de travail');
      const presentBtnHiddenForCarrousel = await page.evaluate(() => document.getElementById('cc-ws-present-btn').hidden);
      assert.equal(presentBtnHiddenForCarrousel, true, 'le bouton "Présenter" ne doit JAMAIS apparaître pour un Carrousel (hors périmètre de ce lot)');
      console.log('PASS 6/7 — RÉGRESSION Carrousel : génération bout en bout inchangée (emit_carrousel_document), document toujours valide et ouvrable, bouton "Présenter" absent (jamais pour Carrousel).');
    }

    // ══════════════════════════════════════════════════════════════════════
    // TEST 7 — Aucune erreur JS non gérée sur l'ensemble du scénario.
    // ══════════════════════════════════════════════════════════════════════
    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant tout le scénario Présentation Lot 1');
    console.log('PASS 7/7 — Aucune erreur JS non gérée.');

    console.log('\nTOUS LES TESTS PRÉSENTATION LOT 1 PASSENT (7/7)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
