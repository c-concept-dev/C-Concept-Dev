// Item 56, Étape 1 (recadrée à script/liens — document/cours reporté à item 56bis, décision
// explicite de Christophe : adocLongDoc/chapitrage doit rester intact, l'artefact-ification de
// son résultat est un chantier séparé).
//
// AVANT ce lot : 'script' (dans l'enum planner mais absent de _fmtFromIntent) et 'liens' (absent
// de l'enum ET du classifieur de repli) retombaient sur plan.output_format sans garde-fou —
// reproduit dans verify-item56-script-liens-repro-before-fix.js : un LLM jugeant lui-même
// output_format='chat' pour ces intents ne produisait AUCUN artefact, aucune personnalisation
// possible (régression confirmée, pas supposée).
//
// Ce lot : script/liens rejoignent le même override déterministe que tableau (fmt='html'
// garanti, cf. item 53) à 3 endroits (adocBuildFallbackPlan, adocBuildSystemPrompt,
// adocHandleReply) + 'liens' ajouté à l'enum du planner + détection mot-clé dans le repli local.
//
// Tests obligatoires : script ET liens générés directement produisent un fmt==='html'
// fonctionnel, personnalisation opérationnelle (bloc + police + couleurs), jamais d'insertion
// d'image proposée.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const BRAND_KIT_RED = { id: 'kit-red', name: 'Charte Rouge Vif', version: 1, colors: { primary: '#ff0000', accent: '#cc0000', background: '#fff0f0', text: '#330000', warning: '#aa0000' }, typography: { headingFont: 'Georgia', bodyFont: 'Arial' } };
const MOCK_RAG_CHUNKS = [
  { content: "Passage clinique réel pour ce test.", book_title: 'Ouvrage test', author: 'Auteur test', page_number: 7 },
];

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
function legacyHtmlFor(title) {
  return '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF;}body{font-family:"IBM Plex Sans";}h1{font-family:"Source Serif 4";}</style></head><body>'
    + '<h1>' + title + '</h1>'
    + '<p>Un paragraphe de contenu clinique réel, jamais un texte de remplacement.</p>'
    + '</body></html>';
}

// plannerOutputFormat volontairement 'chat' — reproduit exactement le jugement libre du LLM qui
// causait le bug (cf. verify-item56-script-liens-repro-before-fix.js), pour prouver que la
// correction l'ignore bien.
async function runScenario(browser, results, { formatButtonId, plannerIntent, expectedKind, question }) {
  const log = (label, ok, extra) => results.push([label, ok, extra]);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const counters = { createCalls: 0, lastCreateBody: null };
  const legacyTitle = 'Document ' + expectedKind;
  let blockCorrectionCalls = 0;

  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [BRAND_KIT_RED] }) }); return; }
    if (url.includes('/brand-kits/')) {
      const id = decodeURIComponent(url.split('/brand-kits/')[1]);
      route.fulfill({ status: id === BRAND_KIT_RED.id ? 200 : 404, contentType: 'application/json', body: JSON.stringify(id === BRAND_KIT_RED.id ? BRAND_KIT_RED : { error: 'introuvable' }) });
      return;
    }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.endsWith('/clinical-documents') && req.method() === 'POST') {
      counters.createCalls++;
      counters.lastCreateBody = JSON.parse(req.postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-' + counters.createCalls, version_id: 'v1', created_at: new Date().toISOString() }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"name":"emit_block_correction"')) {
        blockCorrectionCalls++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text: 'Contenu de correction réel pour ' + expectedKind, items: [], headers: [], rows: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(legacyHtmlFor(legacyTitle)) }); return; }
      // Le planner LLM lui-même juge 'chat' — exactement le scénario qui causait le bug.
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: plannerIntent, clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: legacyTitle, deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  if (formatButtonId) await page.click(formatButtonId);
  await page.fill('#clinical-question', question);
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a.fmt === 'html'), { timeout: 15000 });
  const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a.fmt === 'html')[0]);
  await page.waitForTimeout(200);
  const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);

  log(`[${expectedKind}] a. fmt==='html' malgré plan.output_format='chat' côté planner LLM (bug reproduit corrigé)`, art.fmt === 'html', art.fmt);
  log(`[${expectedKind}] b. _adocGenerationEngine==='legacy-html'`, art._adocGenerationEngine === 'legacy-html', art._adocGenerationEngine);
  log(`[${expectedKind}] c. _adocDocumentKind reflète le vrai type produit`, art._adocDocumentKind === expectedKind, art._adocDocumentKind);
  const EXPECTED_CAPS = { workspace: true, persist: true, fineCitations: false, blockEditing: false, legacyBlockEditing: true, transform: false, export: true, qualityControlledExport: false };
  const capsMatch = art._adocCapabilities && Object.keys(EXPECTED_CAPS).every(k => art._adocCapabilities[k] === EXPECTED_CAPS[k]);
  log(`[${expectedKind}] d. _adocCapabilities complet (item 48, hérité automatiquement via fmt==='html')`, capsMatch, art._adocCapabilities);
  const snapOk = art._adocLegacySourceSnapshot && Array.isArray(art._adocLegacySourceSnapshot.entries) && art._adocLegacySourceSnapshot.entries.length > 0;
  log(`[${expectedKind}] e. SourceSnapshot réel construit`, snapOk, art._adocLegacySourceSnapshot);

  // Personnalisation — correction de bloc.
  await page.evaluate((k) => window.adocOpenWorkspace(k), storeKey);
  await page.waitForTimeout(200);
  const firstBlockId = await page.evaluate(() => {
    const el = document.querySelector('#cc-ws-doc-card [data-cc-legacy-block-id]');
    return el ? el.getAttribute('data-cc-legacy-block-id') : null;
  });
  let correctionWorked = false;
  let noImageInsertOffered = true;
  if (firstBlockId) {
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${firstBlockId}"]`);
    await page.waitForSelector('.cc-block-edit-panel', { timeout: 5000 }).catch(() => {});
    // Vérifie qu'aucune option "image" n'est jamais proposée dans l'insertion de bloc.
    const insertBtnClicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.cc-block-edit-panel button')].find(b => b.textContent.includes('Insérer un bloc après'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (insertBtnClicked) {
      await page.waitForTimeout(150);
      const typeLabels = await page.evaluate(() => [...document.querySelectorAll('.cc-block-edit-result button')].map(b => b.textContent.toLowerCase()));
      noImageInsertOffered = !typeLabels.some(l => l.includes('image'));
      // Revient au panneau de correction (annule l'insertion en cours) pour tester la correction ensuite.
      await page.evaluate(() => { const c = document.querySelector('.cc-block-edit-panel button[onclick*="adocCancelLegacyBlockCorrection"], .cc-block-edit-panel button[onclick*="adocCancelBlockCorrection"]'); if (c) c.click(); });
    }
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${firstBlockId}"]`);
    await page.waitForSelector('.cc-block-edit-panel', { timeout: 5000 }).catch(() => {});
    const panelPresent = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel'));
    if (panelPresent) {
      await page.fill('.cc-block-edit-freetext', 'reformule ce paragraphe');
      await page.click('.cc-block-edit-panel button:has-text("Envoyer")');
      await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 }).catch(() => {});
      const confirmPresent = await page.evaluate(() => !!document.querySelector('.cc-block-edit-actions button'));
      if (confirmPresent) {
        await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
        await page.waitForFunction(() => document.querySelector('.cc-block-edit-panel') == null, { timeout: 10000 }).catch(() => {});
        correctionWorked = blockCorrectionCalls > 0;
      }
    }
  }
  log(`[${expectedKind}] f. Correction de bloc RÉELLEMENT fonctionnelle`, correctionWorked, { firstBlockId, blockCorrectionCalls });
  log(`[${expectedKind}] g. Jamais d'insertion d'image proposée (item 57 hors périmètre)`, noImageInsertOffered, null);

  // Personnalisation — charte (couleurs + police), même mécanisme qu'item 44/LOT 11.
  await page.evaluate((k) => window.adocOpenLegacyReThemePanel(k), storeKey);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.adocPreviewLegacyRetheme('kit-red'));
  await page.waitForTimeout(150);
  const previewReady = await page.evaluate(() => !!window._adocLegacyReThemeCandidate);
  log(`[${expectedKind}] h. Aperçu de charte préparé avec succès (couleurs retrouvées et applicables)`, previewReady === true, previewReady);
  await page.evaluate(() => window.adocConfirmLegacyRetheme());
  await page.waitForTimeout(300);
  const artAfterRetheme = await page.evaluate((k) => window._adocArtifacts[k], storeKey);
  log(`[${expectedKind}] i. La charte (couleur) a bien été appliquée au document`, (artAfterRetheme.html || '').includes('#ff0000'), null);

  // Sauvegarde réelle.
  await page.evaluate(() => window.adocWsSave());
  await page.waitForTimeout(300);
  log(`[${expectedKind}] j. Sauvegarde réussie (réponse serveur 201)`, counters.createCalls >= 1, counters.createCalls);
  const sentBody = counters.lastCreateBody;
  log(`[${expectedKind}] k. Le payload envoyé au Worker contient un sourceSnapshot non nul`, !!(sentBody && sentBody.document && sentBody.document.sourceSnapshot), null);
  log(`[${expectedKind}] l. Aucune erreur JS`, errors.length === 0, errors);

  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  const results = [];

  await runScenario(browser, results, { formatButtonId: '#format-script', plannerIntent: 'script', expectedKind: 'script', question: 'Écris-moi un script verbatim pour accueillir un patient anxieux' });
  await runScenario(browser, results, { formatButtonId: '#format-links', plannerIntent: 'liens', expectedKind: 'liens', question: 'Fais-moi une carte des liens transversaux entre EMDR et ICV' });

  console.log('=== Résultats — Item 56 Étape 1 : script/liens rejoignent fmt==="html" déterministe ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
