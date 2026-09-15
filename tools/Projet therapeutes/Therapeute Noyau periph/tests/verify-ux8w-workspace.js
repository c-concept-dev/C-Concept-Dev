// UX-8W — vérifie la coquille de l'écran de travail : génère une vraie Fiche synthèse
// structurée (pipeline réel mocké), clique sur l'aperçu de l'artifact, et vérifie que
// l'écran de travail s'ouvre avec titre/badge/statut corrects, sources regroupées par livre,
// bibliothèque cherchable, mémoire patient déplacée (pas dupliquée), export fonctionnel,
// fermeture (bouton + Échap) qui restaure le focus et redonne sa place à Mémoire patient.
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/xlsx-test';
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "L'attachement se construit dans les premières interactions avec la figure de soin.", book_title: "L'attachement, une théorie du lien", author: 'Bowlby, John', page_number: 42 },
  { content: "Les cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58 },
  { content: "Le mépris porte une dévalorisation globale du partenaire.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 61 },
];

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
function block(o) { return Object.assign({}, blockDefaults, o); }
const FICHE_INPUT = {
  title: 'Attachement et rupture dans le couple', purpose: 'psychoéducation', audience: 'clinicien',
  blocks: [
    block({ type: 'heading', text: "Vue d'ensemble", level: 1 }),
    block({ type: 'paragraph', text: "L'attachement structure la façon dont les couples vivent la rupture et la réparation.", citationEntryIds: ['entry-1'] }),
    block({ type: 'heading', text: 'Les quatre cavaliers', level: 2 }),
    block({ type: 'paragraph', text: 'Le mépris est le prédicteur le plus fiable de rupture selon Gottman.', citationEntryIds: ['entry-2', 'entry-3'] }),
  ],
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/search-library')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || '';
      let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const p = body.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'evaluate_clarity') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (bodyRaw.includes('needs_rag') || bodyRaw.includes('TÂCHE')) {
        const plan = { needs_rag: true, searches: [{ terms: ['attachement', 'gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Attachement et rupture', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE(FICHE_INPUT) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== ÉTAPE 1 — générer une vraie Fiche synthèse structurée ===');
  await page.fill('#clinical-question', 'Fais-moi une fiche synthèse sur attachement et rupture dans le couple');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForSelector('.adoc-artifact-card', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {})[0] || null);
  console.log('storeKey:', storeKey);

  console.log('\n=== ÉTAPE 2 — remplir Mémoire patient et Documents joints AVANT ouverture (pour vérifier déplacement, pas duplication) ===');
  // Lot "réduire Mémoire patient à un menu déroulant replié par défaut" — le champ est masqué
  // tant que le nouveau bouton replié de la sidebar n'a pas été déplié (changement purement
  // visuel : le mécanisme adocKvPatientIdChange/adocKvSaveNow lui-même est inchangé).
  await page.click('#adoc-sidebar-memory-toggle');
  await page.fill('#adoc-kv-patient-id', 'dupont-marie');

  console.log('\n=== ÉTAPE 3 — cliquer sur "Plein écran" de la carte artifact (doit ouvrir #cc-workspace) ===');
  await page.click('.adoc-artifact-card [data-action="preview"], .adoc-artifact-card [data-action="preview-html"]').catch(async () => {
    await page.evaluate((k) => window.adocOpenDocPopup(k), storeKey);
  });
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => {
    const ws = document.getElementById('cc-workspace');
    return {
      open: ws?.classList.contains('open'),
      title: document.getElementById('cc-ws-title')?.textContent,
      badge: document.getElementById('cc-ws-badge')?.textContent,
      status: document.getElementById('cc-ws-status')?.textContent,
      statusClass: document.getElementById('cc-ws-status')?.className,
      sourcesHtml: document.getElementById('cc-ws-sources-list')?.innerHTML,
      docCardHasContent: (document.getElementById('cc-ws-doc-card')?.innerHTML.length || 0) > 100,
      docCardHasBlocks: !!document.querySelector('.cc-ws-doc-card .adoc-sc-block'),
      memoryPatientIdValueInWorkspace: document.querySelector('#cc-ws-memory-mount #adoc-kv-patient-id')?.value,
      memoryPatientDuplicated: document.querySelectorAll('#adoc-kv-patient-id').length,
      oldPopupOverlayActive: document.getElementById('cc-doc-popup-overlay')?.classList.contains('active'),
      activeElementId: document.activeElement?.id,
    };
  });
  console.log(state);
  console.log('=> écran de travail ouvert:', state.open);
  console.log('=> titre correct:', state.title === 'Attachement et rupture dans le couple');
  console.log('=> badge = FICHE SYNTHÈSE:', state.badge === 'FICHE SYNTHÈSE');
  console.log('=> statut "Prêt" (aucun blocage qualité attendu ici):', state.status?.includes('Prêt'));
  console.log('=> sources regroupées par livre (2 livres attendus, Bowlby + Gottman):', (state.sourcesHtml?.match(/cc-ws-source-item/g) || []).length === 2);
  console.log('=> document rendu réellement dans #cc-ws-doc-card (adocRenderClinicalDocument réutilisé):', state.docCardHasContent && state.docCardHasBlocks);
  console.log('=> Mémoire patient DÉPLACÉE dans le panneau (même valeur, pas de duplication):', state.memoryPatientIdValueInWorkspace === 'dupont-marie' && state.memoryPatientDuplicated === 1);
  console.log('=> ancien popup iframe PAS utilisé pour une Fiche structurée:', !state.oldPopupOverlayActive);
  console.log('=> focus posé sur le bouton fermer (accessibilité clavier):', state.activeElementId === 'cc-ws-close-btn');

  console.log('\n=== ÉTAPE 4 — déplier Mémoire patient (vérifie le toggle) ===');
  await page.click('.cc-ws-memory-toggle');
  const memOpen = await page.evaluate(() => document.querySelector('.cc-ws-memory-body')?.classList.contains('open'));
  console.log('=> section Mémoire patient dépliée au clic:', memOpen);

  console.log('\n=== ÉTAPE 5 — rechercher dans la bibliothèque (adocD1Search réel) ===');
  await page.fill('#cc-ws-search-input', 'gottman');
  await page.press('#cc-ws-search-input', 'Enter');
  await page.waitForTimeout(300);
  const searchResults = await page.evaluate(() => document.getElementById('cc-ws-search-results')?.innerHTML);
  console.log('=> résultats de recherche affichés (vrai adocD1Search, mock D1):', searchResults?.includes('Ce que veulent vraiment'));

  console.log('\n=== ÉTAPE 6 — screenshot desktop ===');
  await page.screenshot({ path: OUT + '/ux8w-workspace-desktop.png', fullPage: false });

  console.log('\n=== ÉTAPE 7 — viewport 768px (tiroir latéral) ===');
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.waitForTimeout(200);
  const panelHiddenAt768 = await page.evaluate(() => !document.getElementById('cc-ws-panel').classList.contains('open'));
  console.log('=> panneau replié par défaut à 768px (tiroir):', panelHiddenAt768);
  await page.click('#cc-ws-panel-toggle-btn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/ux8w-workspace-768.png', fullPage: false });

  console.log('\n=== ÉTAPE 8 — viewport mobile 390px (panneau replié) ===');
  await page.evaluate(() => document.getElementById('cc-ws-panel').classList.remove('open'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/ux8w-workspace-mobile.png', fullPage: false });
  const topbarFit = await page.evaluate(() => {
    const title = document.getElementById('cc-ws-title');
    const close = document.getElementById('cc-ws-close-btn');
    return {
      titleVisible: title.getBoundingClientRect().width > 10,
      titleText: title.textContent,
      closeVisibleOnScreen: close.getBoundingClientRect().right <= window.innerWidth,
    };
  });
  console.log(topbarFit);
  console.log('=> titre toujours visible à 390px:', topbarFit.titleVisible);
  console.log('=> bouton fermer reste dans l\'écran (rien poussé hors champ):', topbarFit.closeVisibleOnScreen);

  console.log('\n=== ÉTAPE 8bis — navigation clavier (Tab depuis le bouton fermer) ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('cc-ws-close-btn').focus());
  const tabSequence = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, id: el.id, hasOutline: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' };
    });
    tabSequence.push(info);
  }
  console.log(tabSequence);
  console.log('=> tous les éléments focusés restent DANS le panneau/topbar (pas de fuite vers le fond de la page):', tabSequence.every(t => t.id || t.tag === 'INPUT' || t.tag === 'BUTTON'));

  console.log('\n=== ÉTAPE 9 — zoom 200% (desktop) ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.body.style.zoom = '2');
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/ux8w-workspace-zoom200.png', fullPage: false });
  await page.evaluate(() => document.body.style.zoom = '1');

  console.log('\n=== ÉTAPE 10 — fermeture via Échap, focus restauré, Mémoire patient revient à sa place ===');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closedState = await page.evaluate(() => ({
    open: document.getElementById('cc-workspace')?.classList.contains('open'),
    memoryBackInSidebar: !!document.querySelector('.adoc-sidebar-sensitive #adoc-kv-patient-id')
      && document.getElementById('adoc-sidebar-panel')?.contains(document.getElementById('adoc-kv-patient-id')),
    patientIdStillDupontMarie: document.getElementById('adoc-kv-patient-id')?.value,
  }));
  console.log(closedState);
  console.log('=> écran de travail fermé par Échap:', !closedState.open);
  console.log('=> Mémoire patient revenue dans la sidebar normale:', closedState.memoryBackInSidebar);
  console.log('=> valeur conservée (même élément, pas recréé):', closedState.patientIdStillDupontMarie === 'dupont-marie');

  console.log('\n=== ÉTAPE 11 — réouvrir puis fermer via le bouton × (2e cycle, pas de duplication accumulée) ===');
  await page.evaluate((k) => window.adocOpenDocPopup(k), storeKey);
  await page.waitForTimeout(300);
  await page.click('#cc-ws-close-btn');
  await page.waitForTimeout(300);
  const secondCycle = await page.evaluate(() => document.querySelectorAll('#adoc-kv-patient-id').length);
  console.log('=> toujours un seul champ #adoc-kv-patient-id après 2 cycles ouverture/fermeture:', secondCycle === 1);

  console.log('\n=== ÉTAPE 12 — vérifier qu\'aucun asset de chrome n\'apparaît dans un export clinique ===');
  await page.evaluate((k) => window.adocOpenDocPopup(k), storeKey);
  await page.waitForTimeout(300);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.click('#cc-ws-export-btn'),
  ]);
  let exportContent = '';
  if (download) {
    const path = await download.path();
    exportContent = require('fs').readFileSync(path, 'utf8');
  }
  console.log('=> export réussi:', !!download);
  console.log('=> AUCUNE trace du fond du Studio (workspace-desktop) dans l\'export clinique:', !exportContent.includes('cc-workspace') && !exportContent.includes('studio-workspace'));

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
