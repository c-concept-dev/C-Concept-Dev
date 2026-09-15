// A14 (audit Codex, P1) — correction structurée sauvegardée même si son rendu échoue.
// AVANT ce lot : adocConfirmBlockCorrection mutait doc.blocks[idx] en mémoire, appelait
// adocOpenWorkspace (qui peut échouer sur re-rendu, ex. schéma invalide), PUIS appelait
// adocWsSave() inconditionnellement — une correction dont le rendu venait d'échouer était quand
// même persistée côté serveur. Reproduit AVANT correctif dans verify-a14-repro-before-fix.js
// (Régression #5 : bug confirmé sur le code non modifié avant toute correction).
//
// Ce lot : adocOpenWorkspace retourne désormais true (rendu affiché avec succès) ou false
// (échec, message déjà affiché par son alert() existant) ; adocConfirmBlockCorrection ne
// sauvegarde QUE si renderOk===true, et ANNULE la mutation en mémoire sinon (jamais une
// correction défaillante qui reste invisible dans le document tout en étant en attente d'être
// sauvegardée par un futur clic "Enregistrer" non lié).
//
// Scénario 1 — rendu réussi : comportement STRICTEMENT inchangé (même assertions que
// verify-ux11-block-correction.js scénario 1).
// Scénario 2 — rendu en échec forcé (exception simulée dans le chemin de rendu, option
// explicitement admise par le prompt) : AUCUNE sauvegarde, mutation annulée, message affiché.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];
const blockDefaults = { text: '', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] };
function b(o) { return Object.assign({}, blockDefaults, o); }
const FICHE_INPUT = {
  title: "Les cavaliers de l'apocalypse — Gottman", purpose: 'supervision', audience: 'clinicien',
  blocks: [
    b({ type: 'heading', text: "Les cavaliers de l'apocalypse", level: 1 }),
    b({ type: 'paragraph', text: "Le mépris est le prédicteur le plus fiable de rupture selon Gottman.", citationEntryIds: ['entry-1'] }),
    b({ type: 'paragraph', text: "La critique, la défensive, le mépris et le mutisme forment les quatre cavaliers." }),
    b({ type: 'list', items: ['Critique', 'Défensive', 'Mépris', 'Mutisme'], ordered: false }),
  ],
};

function mockToolResponseSSE(input, toolName) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 100 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: toolName, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

async function setupPage(browser, { blockCorrectionResponder } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  const state = { createCount: 0, versionCount: 0, created: null, versions: [] };
  const SERVER_DOC_ID = 'clindoc-a14-002';

  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits') && method === 'GET') { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.endsWith('/clinical-documents') && method === 'POST') {
      state.createCount++;
      state.created = JSON.parse(req.postData() || '{}');
      state.versions = [{ version_id: 'v1', content: state.created.document }];
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: SERVER_DOC_ID, version_id: 'v1', created_at: new Date().toISOString() }) });
      return;
    }
    if (url.endsWith('/clinical-documents/' + SERVER_DOC_ID + '/versions') && method === 'POST') {
      state.versionCount++;
      const payload = JSON.parse(req.postData() || '{}');
      const vid = 'v' + (state.versions.length + 1);
      state.versions.push({ version_id: vid, content: payload.document });
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: SERVER_DOC_ID, version_id: vid, created_at: new Date().toISOString() }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      let parsed = {}; try { parsed = JSON.parse(body); } catch (e) {}
      const p = parsed.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') { route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(FICHE_INPUT, 'emit_fiche_document') }); return; }
      if (p.tool_choice && p.tool_choice.name === 'emit_block_correction') {
        const responder = blockCorrectionResponder || (() => ({ text: 'texte corrigé' }));
        const input = responder(p);
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input }] }) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors, dialogs, state, SERVER_DOC_ID };
}

async function deliverStructuredArtifact(page) {
  return page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('Fais-moi une fiche sur les cavaliers de Gottman', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    return await window.adocDeliverStructuredFicheArtifact(structured.doc, structured.sourceSnapshot, rendered, null);
  }, { chunks: MOCK_RAG_CHUNKS });
}

// Force un échec de rendu déterministe pour le prochain appel dont le bloc corrigé porte le
// marqueur sentinelle — "exception simulée dans le chemin de rendu", option explicitement admise
// par le prompt (§ investigation point 1) — sans toucher au reste de adocRenderClinicalDocument.
async function armRenderFailureSentinel(page) {
  await page.evaluate(() => {
    const orig = window.__adocOrigRender || window.adocRenderClinicalDocument;
    window.__adocOrigRender = orig;
    window.adocRenderClinicalDocument = async function (doc, snapshot, override) {
      const hasSentinel = (doc.blocks || []).some((b) => JSON.stringify(b.content || {}).includes('__A14_FORCE_RENDER_FAIL__'));
      if (hasSentinel) throw new Error('Échec de rendu simulé (A14)');
      return orig(doc, snapshot, override);
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 1 — rendu réussi → comportement STRICTEMENT inchangé
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, dialogs, state } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: "Le mépris demeure, selon Gottman, l'indicateur le plus fiable d'une rupture à venir." }),
    });
    const storeKey = await deliverStructuredArtifact(page);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(200);
    log('[1] 0. Pré-condition — document déjà enregistré une première fois', state.createCount === 1);

    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel .cc-clarity-reply-btn');
    await page.waitForTimeout(200);
    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(400);

    const afterText = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].content.text, storeKey);
    log('[1] a. Le bloc a bien été corrigé', afterText === "Le mépris demeure, selon Gottman, l'indicateur le plus fiable d'une rupture à venir.", afterText);
    log('[1] b. Nouvelle version créée (sauvegarde a bien eu lieu, comportement inchangé)', state.versionCount === 1, state.versionCount);
    log('[1] c. Aucune alerte affichée (rien n\'a échoué)', dialogs.length === 0, dialogs);
    log('[1] d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 2 — rendu en échec forcé → AUCUNE sauvegarde, mutation annulée
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, dialogs, state } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: '__A14_FORCE_RENDER_FAIL__ contenu corrigé malformé' }),
    });
    const storeKey = await deliverStructuredArtifact(page);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(200);
    log('[2] 0. Pré-condition — document déjà enregistré une première fois', state.createCount === 1);

    const originalText = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].content.text, storeKey);

    await armRenderFailureSentinel(page);
    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel .cc-clarity-reply-btn');
    await page.waitForTimeout(200);
    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(400);

    const afterText = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].content.text, storeKey);
    log('[2] a. Message clair affiché à l\'utilisatrice (réutilise l\'alerte déjà existante d\'adocOpenWorkspace)', dialogs.some((m) => m.includes('Échec de rendu simulé')), dialogs);
    log('[2] b. La mutation en mémoire a été ANNULÉE — le bloc reste identique à avant la tentative', afterText === originalText, { afterText, originalText });
    log('[2] c. BUG A14 CORRIGÉ — AUCUNE sauvegarde n\'a eu lieu (versionCount reste à 0)', state.versionCount === 0, state.versionCount);
    log('[2] d. Aucun second document créé non plus', state.createCount === 1, state.createCount);
    log('[2] e. Aucune erreur JS (l\'échec est géré proprement, pas une exception non interceptée)', errors.length === 0, errors);

    // Non-régression : une correction SUIVANTE, sans le marqueur, doit à nouveau fonctionner
    // normalement (l'échec précédent n'a pas laissé l'état de sélection/document corrompu).
    await page.evaluate(() => { window.adocRenderClinicalDocument = window.__adocOrigRender; });
    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    const panelPresent = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel .cc-block-edit-freetext'));
    log('[2] f. Non-régression — le panneau de correction reste utilisable ensuite (pas d\'état bloqué)', panelPresent === true, panelPresent);

    await page.close();
  }

  console.log('=== Résultats — A14 : correction structurée sauvegardée même si son rendu échoue ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
