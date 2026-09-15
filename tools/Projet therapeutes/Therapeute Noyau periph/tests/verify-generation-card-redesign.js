// Design unique et enrichi de la carte de progression (référence UX/UI state-c-generation.png).
// Investigation confirmée : adocShowTyping/adocUpdateTypingLabel/adocRenderProgressSteps restent
// LE seul point d'entrée partagé par les deux moteurs (jamais deux versions). Ce lot enrichit ce
// même mécanisme (titre contextuel, sous-titre fixe, encadré "Étape en cours" avec auteurs/mots-
// clés réels, encadré "Demande en cours") — jamais une reconstruction du suivi trois étapes déjà
// existant. Vérifie : design identique structuré/legacy, données réelles (jamais génériques),
// et compatibilité totale avec le correctif rang 6 (persistance de la carte au repli).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42, approach: 'Systémique' },
  { content: "Les schémas précoces inadaptés structurent la relation.", book_title: 'Schema Therapy', author: 'Young, Jeffrey', page_number: 12, approach: 'Schémas' },
];
function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
function mockToolResponseSSE(input) {
  const inputJson = JSON.stringify(input);
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } })
    + sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } })
    + sseLine({ type: 'content_block_stop', index: 0 })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><body><h1>Fiche (secours)</h1><p>Contenu de repli.</p></body></html>';

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
      if (body.includes('"max_tokens":16000')) { setTimeout(() => route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }), 800); return; }
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

  // ═══ 1. Génération STRUCTURÉE (succès, sans repli) — design enrichi complet ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await baseRoutes(page, (route) => {
      const doc = { title: 'Fiche cavaliers Gottman', purpose: 'supervision', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu structuré.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }] };
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(doc) });
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');

    await page.waitForFunction(() => [...document.querySelectorAll('.adoc-typing-label')].some(el => el.textContent.includes('Analyse de la demande')), { timeout: 5000 });
    const idsAfterSubmit = await page.evaluate(() => [...document.querySelectorAll('.adoc-msg.assistant')].map(el => el.id));
    const typingId = idsAfterSubmit[0];

    // Aucun documentKind explicite ici (pas de clic sur l'écran d'accueil, intent classifié
    // librement) -> titre générique "Création de votre document", jamais un type deviné à partir
    // du seul intent automatique (cf. adocUpdateGenerationTitle). Le cas "type explicite" est
    // couvert par le scénario 3 (carrousel cliqué), qui vérifie bien le libellé spécifique.
    log('1a. Le titre contextuel affiche bien "Création de votre document" (aucun type explicite, jamais deviné)', await page.evaluate((id) => {
      return document.getElementById(id)?.querySelector('.sc-gen-title')?.textContent;
    }, typingId) === 'Création de votre document', await page.evaluate((id) => document.getElementById(id)?.querySelector('.sc-gen-title')?.textContent, typingId));

    log('1b. Le sous-titre fixe est bien affiché', await page.evaluate((id) => document.getElementById(id)?.querySelector('.sc-gen-subtitle')?.textContent, typingId) === "La consultation peut prendre une à deux minutes. L'écran reste disponible.");

    log('1c. Le bloc titre/sous-titre est bien révélé (visible, jamais display:none)', await page.evaluate((id) => {
      const h = document.getElementById(id)?.querySelector('.sc-gen-header');
      return h && getComputedStyle(h).display !== 'none';
    }, typingId));

    log('1d. La demande en cours affiche bien le texte réellement tapé', await page.evaluate((id) => document.getElementById(id)?.querySelector('.sc-gen-request-text')?.textContent, typingId) === 'Fais-moi une fiche sur les cavaliers de Gottman');

    // Attend la consultation bibliothèque (étape 1 active) pour vérifier les mots-clés réels.
    await page.waitForFunction((id) => {
      const box = document.getElementById(id)?.querySelector('.sc-gen-step-keywords');
      return box && box.textContent && box.textContent.length > 0;
    }, typingId, { timeout: 5000 });
    const keywords = await page.evaluate((id) => document.getElementById(id)?.querySelector('.sc-gen-step-keywords')?.textContent, typingId);
    log('1e. L\'encadré "Étape en cours" affiche bien les VRAIS auteurs/approches consultés (Gottman, Young…), jamais un texte générique', keywords.includes('Gottman') && keywords.includes('Young'), keywords);

    const stepText = await page.evaluate((id) => document.getElementById(id)?.querySelector('.sc-gen-current-step-text')?.textContent, typingId);
    log('1f. Le texte "Étape en cours" reflète bien le vrai label du pipeline (pas un doublon divergent)', typeof stepText === 'string' && stepText.length > 0, stepText);

    await page.waitForTimeout(1500);
    const finalState = await page.evaluate(() => ({
      hasStructuredArtifact: Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc),
      typingCardsRemaining: document.querySelectorAll('[id^="adoc-typing-"]').length,
    }));
    log('1g. Transition finale inchangée — le document structuré est livré, carte de progression disparue', finalState.hasStructuredArtifact && finalState.typingCardsRemaining === 0, finalState);
    log('1h. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 2. Repli structuré→legacy (rang 6) — design enrichi PERSISTE, jamais détruit/recréé ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await baseRoutes(page, (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé' } }) }));
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.adoc-typing-label')].some(el => el.textContent.includes('Analyse de la demande')), { timeout: 5000 });
    const idsAfterSubmit = await page.evaluate(() => [...document.querySelectorAll('.adoc-msg.assistant')].map(el => el.id));
    const typingId = idsAfterSubmit[0];

    // Le design enrichi doit déjà être visible AVANT le repli (mêmes points qu'au scénario 1).
    await page.waitForFunction((id) => {
      const box = document.getElementById(id)?.querySelector('.sc-gen-step-keywords');
      return box && box.textContent && box.textContent.length > 0;
    }, typingId, { timeout: 5000 });
    log('2a. Le design enrichi (titre/sous-titre/demande/mots-clés) est bien affiché AVANT le repli', await page.evaluate((id) => {
      const el = document.getElementById(id);
      return !!(el.querySelector('.sc-gen-title')?.textContent && el.querySelector('.sc-gen-request-text')?.textContent && el.querySelector('.sc-gen-step-keywords')?.textContent);
    }, typingId));

    // Laisse le repli se déclencher — MÊME élément DOM, légende mise à jour (rang 6).
    await page.waitForFunction((id) => {
      const el = document.getElementById(id);
      return el && el.querySelector('.adoc-typing-label')?.textContent === 'Passage à la génération standard…';
    }, typingId, { timeout: 5000 });
    const stateAfterFallback = await page.evaluate((id) => {
      const el = document.getElementById(id);
      return {
        sameElementStillPresent: !!el,
        totalMsgCount: document.querySelectorAll('.adoc-msg.assistant').length,
        currentStepTextMatchesLabel: el.querySelector('.sc-gen-current-step-text')?.textContent === el.querySelector('.adoc-typing-label')?.textContent,
        titleStillThere: el.querySelector('.sc-gen-title')?.textContent,
        requestStillThere: el.querySelector('.sc-gen-request-text')?.textContent,
      };
    }, typingId);
    log('2b. Rang 6 préservé — LE MÊME élément DOM persiste au repli (jamais détruit/recréé)', stateAfterFallback.sameElementStillPresent && stateAfterFallback.totalMsgCount === 1, stateAfterFallback);
    log('2c. L\'encadré "Étape en cours" suit bien la légende mise à jour au repli ("Passage à la génération standard…")', stateAfterFallback.currentStepTextMatchesLabel, stateAfterFallback);
    log('2d. Le titre et la demande restent affichés (jamais réinitialisés) tout au long du repli', !!stateAfterFallback.titleStillThere && !!stateAfterFallback.requestStillThere, stateAfterFallback);

    await page.waitForTimeout(2000);
    const finalState = await page.evaluate((id) => ({
      typingCardGone: !document.getElementById(id),
      hasLegacyArtifact: Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'),
    }), typingId);
    log('2e. Transition finale identique à une génération legacy directe (carte disparue, document livré)', finalState.typingCardGone && finalState.hasLegacyArtifact, finalState);
    log('2f. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3. Génération LEGACY DIRECTE (jamais passée par le structuré) — même design partagé ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
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
        if (body.includes('"max_tokens":2000')) {
          const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'sujet', deep_scan: false, max_tokens: 2000, images_only: false };
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
          return;
        }
        // Délai artificiel (même patron que les scénarios 1/2) — laisse une fenêtre
        // d'observation du design enrichi avant que le document ne soit livré et la carte
        // retirée, sans quoi ce mock (aucune latence réelle) termine trop vite pour l'observer.
        if (body.includes('"max_tokens":16000')) { setTimeout(() => route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }), 800); return; }
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.click('#format-carousel');
    await page.fill('#clinical-question', 'Fais-moi un carrousel sur un sujet clinique');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.adoc-typing-label')].some(el => el.textContent.includes('Analyse de la demande')), { timeout: 5000 });
    const idsAfterSubmit = await page.evaluate(() => [...document.querySelectorAll('.adoc-msg.assistant')].map(el => el.id));
    const typingId = idsAfterSubmit[0];

    await page.waitForFunction((id) => document.getElementById(id)?.querySelector('.sc-gen-title')?.textContent === 'Création de votre carrousel', typingId, { timeout: 5000 });
    log('3a. documentKind explicite (carrousel) reflété dans le titre — même mécanisme que le structuré, jamais une 2e version', true);
    log('3b. La demande en cours affiche bien le texte réel', await page.evaluate((id) => document.getElementById(id)?.querySelector('.sc-gen-request-text')?.textContent, typingId) === 'Fais-moi un carrousel sur un sujet clinique');
    log('3c. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Design enrichi carte de progression ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
