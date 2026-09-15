// A14 (audit Codex, P1) — REPRODUCTION AVANT CORRECTIF (Régression #5 : ne rien corriger avant
// d'avoir la preuve). Force un échec de rendu volontaire (exception simulée dans
// window.adocRenderClinicalDocument, option explicitement admise par le prompt) juste après la
// mutation `doc.blocks[idx] = st.pendingBlock` dans adocConfirmBlockCorrection, et vérifie que
// le code ACTUEL (non modifié) sauvegarde quand même côté serveur.
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
  const SERVER_DOC_ID = 'clindoc-a14-001';

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

// Force un échec de rendu déterministe pour le PROCHAIN appel qui contient le bloc corrigé
// portant le marqueur sentinelle — option explicitement admise par le prompt ("exception
// simulée dans le chemin de rendu"), sans toucher au reste de la fonction réelle.
async function armRenderFailureSentinel(page) {
  await page.evaluate(() => {
    const orig = window.adocRenderClinicalDocument;
    window.__adocOrigRender = orig;
    window.adocRenderClinicalDocument = async function (doc, snapshot, override) {
      const hasSentinel = (doc.blocks || []).some((b) => JSON.stringify(b.content || {}).includes('__A14_FORCE_RENDER_FAIL__'));
      if (hasSentinel) throw new Error('Échec de rendu simulé (A14 — reproduction avant correctif)');
      return orig(doc, snapshot, override);
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const { page, errors, dialogs, state } = await setupPage(browser, {
    blockCorrectionResponder: () => ({ text: '__A14_FORCE_RENDER_FAIL__ contenu corrigé malformé' }),
  });
  const storeKey = await deliverStructuredArtifact(page);
  await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
  await page.waitForTimeout(150);

  // Document déjà enregistré une première fois (cas réaliste, même précondition que
  // verify-ux11-block-correction.js) — la confirmation empruntera la branche "nouvelle version".
  await page.evaluate(() => window.adocWsSave());
  await page.waitForTimeout(200);
  console.log('Pré-condition — createCount===1 :', state.createCount === 1);

  await armRenderFailureSentinel(page);

  await page.click('#paragraph-02');
  await page.waitForTimeout(100);
  await page.click('.cc-block-edit-panel .cc-clarity-reply-btn'); // "Réécrire"
  await page.waitForTimeout(200);
  await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
  await page.waitForTimeout(400);

  const afterBlockText = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].content.text, storeKey);
  console.log('\n=== REPRODUCTION (code NON modifié) ===');
  console.log('a. Le rendu a bien échoué (alerte affichée) :', dialogs.some((m) => m.includes('Échec de rendu simulé') || m.includes('Impossible d\'afficher')), JSON.stringify(dialogs));
  console.log('b. Le bloc en mémoire est déjà muté vers le contenu malformé (avant toute vérification de rendu) :', afterBlockText.includes('__A14_FORCE_RENDER_FAIL__'), afterBlockText);
  console.log('c. BUG CONFIRMÉ — une sauvegarde a quand même eu lieu malgré l\'échec de rendu (versionCount) :', state.versionCount, state.versionCount >= 1);
  if (state.versions.length) {
    const savedText = state.versions[state.versions.length - 1].content.clinicalDocument.blocks[1].content.text;
    console.log('d. Le contenu malformé a bien été envoyé au serveur :', savedText.includes('__A14_FORCE_RENDER_FAIL__'), savedText);
  }
  console.log('errors:', errors);

  await browser.close();
})();
