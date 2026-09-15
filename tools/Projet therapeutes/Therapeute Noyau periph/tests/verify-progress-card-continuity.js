// Correction rang 6 — un repli depuis la Fiche structurée vers l'ancien moteur détruisait la
// carte riche de progression (icône animée, suivi en trois étapes) puis en recréait une toute
// nouvelle, séparée, vide — perdant toute continuité visuelle. Corrigé : la MÊME carte (même id
// DOM, typingId réutilisé comme streamMsgId) est transformée en place (légende "Passage à la
// génération standard…", 3e repère "Document composé" actif) plutôt que détruite+recréée.
//
// Tests obligatoires (Christophe, verbatim) :
//   1. Repli réel (échec structuré non transitoire) → AUCUN appel à adocRemoveTyping ne détruit
//      la carte à ce moment précis ; le même élément visuel persiste du tout début jusqu'à
//      l'apparition du document final, légende mise à jour au bon moment.
//   2. Génération structurée réussie SANS repli → non-régression.
//   3. Génération legacy directe (jamais passée par le structuré) → non-régression (destruction
//      puis recréation inchangées).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><body><h1>Fiche (secours)</h1><p>Contenu de repli.</p></body></html>';

function mockToolResponseSSE(input) {
  const inputJson = JSON.stringify(input);
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 50 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

function baseRoutes(page, onCall2) {
  return page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { onCall2(route); return; }
      if (body.includes('"max_tokens":16000')) {
        // Ralenti volontairement pour laisser une fenêtre d'observation large de l'état de la
        // carte APRÈS le repli mais AVANT que le tout premier fragment de texte legacy ne
        // remplace son contenu (cf. adocUpdateStreamMsg, qui écrase .adoc-bubble en entier).
        setTimeout(() => route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }), 1500);
        return;
      }
      const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1. Repli réel (échec structuré non transitoire, HTTP 400) ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await baseRoutes(page, (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé (non transitoire)' } }) }));
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);

    // Capture l'id de la VRAIE carte de progression d'adocSend — jamais celle, transitoire, de
    // adocRunClarityGate (créée puis détruite juste avant, "Vérification de la demande…", sans
    // rapport avec ce correctif) : on attend le label "Analyse de la demande…" (étape 1, propre
    // à adocSend lui-même) avant de capturer l'id, pour ne jamais confondre les deux cartes.
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.adoc-typing-label')].some(el => el.textContent.includes('Analyse de la demande')), { timeout: 5000 });
    const idsAfterSubmit = await page.evaluate(() => [...document.querySelectorAll('.adoc-msg.assistant')].map(el => el.id));
    log('1a. Exactement UNE carte de progression visible juste après l\'envoi', idsAfterSubmit.length === 1, idsAfterSubmit);
    const typingIdCaptured = idsAfterSubmit[0];

    // Laisse le repli se déclencher (échec structuré) puis observe l'état JUSTE APRÈS, avant
    // que le premier fragment de texte legacy n'arrive (le mock du moteur legacy est retardé
    // exprès pour cette fenêtre d'observation).
    await page.waitForFunction((typingId) => {
      const el = document.getElementById(typingId);
      return el && el.querySelector('.adoc-typing-label')?.textContent === 'Passage à la génération standard…';
    }, typingIdCaptured, { timeout: 5000 });
    const stateAfterFallback = await page.evaluate((typingId) => {
      const el = document.getElementById(typingId);
      const allMsgs = [...document.querySelectorAll('.adoc-msg.assistant')].map(e => e.id);
      return {
        sameElementStillPresent: !!el,
        totalMsgCount: allMsgs.length,
        allMsgIds: allMsgs,
        label: el ? (el.querySelector('.adoc-typing-label')?.textContent || null) : null,
        activeStep: el ? (el.querySelector('.sc-progress-steps .is-active')?.textContent || null) : null,
      };
    }, typingIdCaptured);
    log('2a. LE MÊME élément DOM (même id) persiste après le déclenchement du repli — jamais détruit', stateAfterFallback.sameElementStillPresent, stateAfterFallback);
    log('2b. Toujours exactement UNE carte affichée (jamais une 2e créée séparément)', stateAfterFallback.totalMsgCount === 1, stateAfterFallback.allMsgIds);
    log('2c. La légende reflète bien la transition ("Passage à la génération standard…")', stateAfterFallback.label === 'Passage à la génération standard…', stateAfterFallback.label);
    log('2d. Le 3e repère ("Document composé") est actif — jamais réinitialisé', stateAfterFallback.activeStep === 'Document composé', stateAfterFallback.activeStep);

    // Laisse la génération legacy (retardée) se terminer, puis vérifie la transition finale.
    await page.waitForTimeout(2000);
    const finalState = await page.evaluate((typingId) => {
      const artifacts = window._adocArtifacts || {};
      return {
        typingCardGone: !document.getElementById(typingId),
        hasLegacyArtifact: Object.values(artifacts).some(a => a._adocGenerationEngine === 'legacy-html'),
      };
    }, typingIdCaptured);
    log('3a. La carte de progression a bien disparu une fois le document produit (transition finale identique à une génération legacy directe)', finalState.typingCardGone);
    log('3b. Le document legacy final est bien livré (repli fonctionnel de bout en bout)', finalState.hasLegacyArtifact);
    log('3c. Aucune erreur JS', errors.length === 0, errors);

    // ═══ Ajout au rang 6 — hypothèse à vérifier, pas à supposer acquise : la carte finale
    //    d'artefact ("Charte"/"Plein écran"/"Exporter") serait-elle construite par un chemin
    //    différent (délégation de clic non posée) quand le document arrive après un repli ?
    //    Vérifié ici en conditions réelles, sur CE document précis, issu d'un vrai repli. ═══
    const buttonState = await page.evaluate(() => {
      const entry = Object.entries(window._adocArtifacts || {}).find(([, a]) => a._adocGenerationEngine === 'legacy-html');
      if (!entry) return { found: false };
      const [storeKey] = entry;
      const rethemeBtn = document.getElementById('retheme-btn-' + storeKey);
      const previewBtn = document.querySelector('[data-key="' + storeKey + '"][data-action="preview-html"]');
      const exportBtn = document.querySelector('[data-key="' + storeKey + '"][data-action="download-html"]');
      return {
        found: true, storeKey,
        rethemeBtnExists: !!rethemeBtn, previewBtnExists: !!previewBtn, exportBtnExists: !!exportBtn,
      };
    });
    log('6a. La carte finale (post-repli) contient bien les 3 boutons attendus', buttonState.found && buttonState.rethemeBtnExists && buttonState.previewBtnExists && buttonState.exportBtnExists, buttonState);

    const charteClick = await page.evaluate((storeKey) => {
      const btn = document.getElementById('retheme-btn-' + storeKey);
      let openCalled = false;
      const orig = window.adocOpenLegacyReThemePanel;
      window.adocOpenLegacyReThemePanel = function (...args) { openCalled = true; return orig.apply(this, args); };
      if (btn) { btn.hidden = false; btn.click(); }
      window.adocOpenLegacyReThemePanel = orig;
      const modal = document.getElementById('cc-legacy-retheme-modal');
      return { openCalled, modalOpen: modal ? modal.classList.contains('open') : false };
    }, buttonState.storeKey);
    log('6b. Clic "Charte" sur la carte post-repli — adocOpenLegacyReThemePanel bien appelée', charteClick.openCalled, charteClick);
    log('6c. Clic "Charte" sur la carte post-repli — la modale s\'ouvre réellement (classList "open")', charteClick.modalOpen, charteClick);

    const previewClick = await page.evaluate((storeKey) => {
      const btn = document.querySelector('[data-key="' + storeKey + '"][data-action="preview-html"]');
      let openCalled = false;
      const orig = window.adocOpenDocPopup;
      window.adocOpenDocPopup = function (...args) { openCalled = true; return orig.apply(this, args); };
      if (btn) btn.click();
      window.adocOpenDocPopup = orig;
      return { openCalled };
    }, buttonState.storeKey);
    log('6d. Clic "Plein écran" sur la carte post-repli — adocOpenDocPopup bien appelée', previewClick.openCalled, previewClick);

    const exportClick = await page.evaluate((storeKey) => {
      const btn = document.querySelector('[data-key="' + storeKey + '"][data-action="download-html"]');
      let downloadTriggered = false;
      const origCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = function (...args) { downloadTriggered = true; return origCreateObjectURL.apply(URL, args); };
      if (btn) btn.click();
      URL.createObjectURL = origCreateObjectURL;
      return { downloadTriggered };
    }, buttonState.storeKey);
    log('6e. Clic "Exporter" sur la carte post-repli — un téléchargement est bien déclenché', exportClick.downloadTriggered, exportClick);
    log('6f. Aucune erreur JS après les 3 clics', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 2. Non-régression — génération structurée réussie SANS repli ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await baseRoutes(page, (route) => {
      const doc = { title: 'Fiche test succès', purpose: 'supervision', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu qui se termine correctement.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }] };
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(doc) });
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => ({
      hasStructuredArtifact: Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc),
      typingCardsRemaining: document.querySelectorAll('[id^="adoc-typing-"]').length,
    }));
    log('4a. Non-régression — le document structuré est bien livré normalement (chemin succès jamais touché par ce correctif)', state.hasStructuredArtifact, state);
    log('4b. Aucune carte de progression résiduelle', state.typingCardsRemaining === 0, state.typingCardsRemaining);
    log('4c. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3. Non-régression — génération legacy DIRECTE (jamais passée par le structuré) ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const req = route.request();
      const url = req.url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = req.postData() || '';
        if (body.includes('evaluate_clarity')) {
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
          return;
        }
        // Demande "carrousel" explicite : intent classifié 'fiche' n'importe pas, jamais le
        // moteur structuré (documentKind explicite prioritaire, cf. correction rang 1).
        if (body.includes('"max_tokens":2000')) {
          const plan = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'sujet quelconque', deep_scan: false, max_tokens: 2000, images_only: false };
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
          return;
        }
        // Ajout au rang 6 — un vrai document HTML (pas du texte brut) pour produire une
        // carte finale avec les 3 mêmes boutons (Charte/Plein écran/Exporter) que le scénario
        // post-repli, condition nécessaire à une comparaison de non-régression significative.
        if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.click('#format-carousel');
    await page.fill('#clinical-question', 'Fais-moi un carrousel sur un sujet clinique quelconque');
    await page.click('#clinical-home-form button[type="submit"]');
    // Même précaution qu'au scénario 1 : capture la VRAIE carte d'adocSend ("Analyse de la
    // demande…"), jamais celle, transitoire, de adocRunClarityGate.
    await page.waitForFunction(() => [...document.querySelectorAll('.adoc-typing-label')].some(el => el.textContent.includes('Analyse de la demande')), { timeout: 5000 });
    const idsAfterSubmit = await page.evaluate(() => [...document.querySelectorAll('.adoc-msg.assistant')].map(el => el.id));
    const typingIdCaptured = idsAfterSubmit[0];
    await page.waitForTimeout(1200);
    const finalIds = await page.evaluate((typingId) => ({
      typingCardStillThere: !!document.getElementById(typingId),
      allIds: [...document.querySelectorAll('.adoc-msg.assistant')].map(el => el.id),
    }), typingIdCaptured);
    log('5a. Non-régression — la carte de typing initiale a bien été DÉTRUITE (comportement legacy direct inchangé, jamais réutilisée comme streamMsgId)', finalIds.typingCardStillThere === false, finalIds);
    log('5b. Une NOUVELLE bulle distincte a bien été créée pour le flux (comportement inchangé)', finalIds.allIds.length >= 1 && !finalIds.allIds.includes(typingIdCaptured), finalIds.allIds);
    log('5c. Aucune erreur JS', errors.length === 0, errors);

    // ═══ Comparaison de non-régression (Ajouts au rang 6) — le document ici n'est JAMAIS passé
    //    par le structuré (_adocGenerationEngine n'est donc jamais taggé 'legacy-html' : ce
    //    tag n'est posé que dans le cas d'un repli, cf. adocFinalizeGeneration). On retrouve
    //    l'artefact HTML unique produit par ce scénario pour vérifier que Charte/Plein
    //    écran/Exporter s'y comportent EXACTEMENT comme sur la carte post-repli du scénario 1. ═══
    const buttonStateDirect = await page.evaluate(() => {
      const entry = Object.entries(window._adocArtifacts || {}).find(([, a]) => a.fmt === 'html');
      if (!entry) return { found: false };
      const [storeKey] = entry;
      const rethemeBtn = document.getElementById('retheme-btn-' + storeKey);
      const previewBtn = document.querySelector('[data-key="' + storeKey + '"][data-action="preview-html"]');
      const exportBtn = document.querySelector('[data-key="' + storeKey + '"][data-action="download-html"]');
      return {
        found: true, storeKey,
        rethemeBtnExists: !!rethemeBtn, previewBtnExists: !!previewBtn, exportBtnExists: !!exportBtn,
      };
    });
    log('7a. Non-régression — la carte finale (chemin direct, sans repli) contient bien les 3 boutons attendus', buttonStateDirect.found && buttonStateDirect.rethemeBtnExists && buttonStateDirect.previewBtnExists && buttonStateDirect.exportBtnExists, buttonStateDirect);

    const charteClickDirect = await page.evaluate((storeKey) => {
      const btn = document.getElementById('retheme-btn-' + storeKey);
      let openCalled = false;
      const orig = window.adocOpenLegacyReThemePanel;
      window.adocOpenLegacyReThemePanel = function (...args) { openCalled = true; return orig.apply(this, args); };
      if (btn) { btn.hidden = false; btn.click(); }
      window.adocOpenLegacyReThemePanel = orig;
      const modal = document.getElementById('cc-legacy-retheme-modal');
      return { openCalled, modalOpen: modal ? modal.classList.contains('open') : false };
    }, buttonStateDirect.storeKey);
    log('7b. Non-régression — clic "Charte" (chemin direct) — adocOpenLegacyReThemePanel bien appelée, identique au scénario post-repli', charteClickDirect.openCalled, charteClickDirect);
    log('7c. Non-régression — clic "Charte" (chemin direct) — la modale s\'ouvre réellement, identique au scénario post-repli', charteClickDirect.modalOpen, charteClickDirect);

    const previewClickDirect = await page.evaluate((storeKey) => {
      const btn = document.querySelector('[data-key="' + storeKey + '"][data-action="preview-html"]');
      let openCalled = false;
      const orig = window.adocOpenDocPopup;
      window.adocOpenDocPopup = function (...args) { openCalled = true; return orig.apply(this, args); };
      if (btn) btn.click();
      window.adocOpenDocPopup = orig;
      return { openCalled };
    }, buttonStateDirect.storeKey);
    log('7d. Non-régression — clic "Plein écran" (chemin direct) — adocOpenDocPopup bien appelée, identique au scénario post-repli', previewClickDirect.openCalled, previewClickDirect);

    const exportClickDirect = await page.evaluate((storeKey) => {
      const btn = document.querySelector('[data-key="' + storeKey + '"][data-action="download-html"]');
      let downloadTriggered = false;
      const origCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = function (...args) { downloadTriggered = true; return origCreateObjectURL.apply(URL, args); };
      if (btn) btn.click();
      URL.createObjectURL = origCreateObjectURL;
      return { downloadTriggered };
    }, buttonStateDirect.storeKey);
    log('7e. Non-régression — clic "Exporter" (chemin direct) — un téléchargement est bien déclenché, identique au scénario post-repli', exportClickDirect.downloadTriggered, exportClickDirect);
    log('7f. Aucune erreur JS après les 3 clics (chemin direct)', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Correction rang 6, continuité de la carte de progression ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
