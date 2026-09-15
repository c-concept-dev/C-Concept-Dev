// A2 (audit Codex, P2) — vérifier si déjà résolu par effet de bord d'item 48.
// A2 signalait : un document legacy DIRECT (jamais un repli) sans SourceSnapshot pouvait
// échouer en HTTP 400 lors d'un ré-habillage manuel de charte (adocConfirmLegacyRetheme →
// adocWsSave → le Worker exige document.sourceSnapshot non nul pour generationEngine
// ==='legacy-html'). Depuis item 48, _adocLegacySourceSnapshot ET _adocCapabilities sont
// construits systématiquement dans adocFinalizeGeneration pour TOUT document fmt==='html', dès
// sa génération — avant même toute action de ré-habillage.
//
// Ce test reproduit le scénario EXACT d'A2 sur le code ACTUEL (post item 48) : un document
// legacy généré DIRECTEMENT (Script, ne tente jamais le moteur structuré), jamais un repli,
// puis un ré-habillage manuel de charte via adocConfirmLegacyRetheme. Un seul test suffit, tel
// que demandé — pas de cycle de correction complet, cette investigation n'appelle qu'à
// confirmer ou infirmer.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const BRAND_KIT_RED = { id: 'kit-red', name: 'Charte Rouge Vif', version: 1, colors: { primary: '#ff0000', accent: '#cc0000', background: '#fff0f0', text: '#330000', warning: '#aa0000' }, typography: { headingFont: 'Georgia', bodyFont: 'Arial' } };
const MOCK_RAG_CHUNKS = [
  { content: "Passage clinique réel sur le script verbatim.", book_title: 'Ouvrage test', author: 'Auteur test', page_number: 12 },
];

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF;}body{font-family:"IBM Plex Sans";}h1{font-family:"Source Serif 4";}</style></head><body>'
  + '<h1>Script verbatim — accueil du patient</h1>'
  + '<p>Bonjour, je suis heureux de vous accueillir aujourd\'hui.</p>'
  + '</body></html>';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const counters = { createCalls: 0, lastCreateBody: null };

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
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-a2-1', version_id: 'v1', created_at: new Date().toISOString() }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
      // Plan : intent='script' — jamais 'fiche', donc _shouldAttemptStructuredFiche est faux,
      // le moteur structuré n'est JAMAIS tenté (document DIRECT, jamais un repli — condition
      // exacte du scénario A2).
      const plan = { needs_rag: true, searches: [{ terms: ['script'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'script', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Script accueil patient', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });

  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  await page.goto('file://' + FILE);
  await page.click('#format-script');
  await page.fill('#clinical-question', 'Fais-moi un script pour accueillir un patient');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a.fmt === 'html'), { timeout: 15000 });
  const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a.fmt === 'html')[0]);
  await page.waitForTimeout(200);

  // ═══ Précondition (confirme le mécanisme item 48, avant toute action de ré-habillage) ═══
  const pre = await page.evaluate((sk) => {
    const a = window._adocArtifacts[sk];
    return {
      generationEngine: a._adocGenerationEngine,
      hasCapabilities: !!a._adocCapabilities,
      hasSnapshot: !!a._adocLegacySourceSnapshot,
      snapshotEntries: a._adocLegacySourceSnapshot ? (a._adocLegacySourceSnapshot.entries || []).length : 0,
    };
  }, storeKey);
  log('0a. Document DIRECT (jamais un repli) : _adocGenerationEngine==="legacy-html"', pre.generationEngine === 'legacy-html', pre);
  log('0b. _adocCapabilities DÉJÀ présent AVANT tout ré-habillage (item 48, à la génération)', pre.hasCapabilities === true, pre);
  log('0c. _adocLegacySourceSnapshot DÉJÀ construit AVANT tout ré-habillage, avec de vraies entrées (item 48)', pre.hasSnapshot === true && pre.snapshotEntries > 0, pre);

  // ═══ Scénario A2 — ré-habillage manuel de charte sur ce document direct ═══
  await page.evaluate((sk) => window.adocOpenLegacyReThemePanel(sk), storeKey);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.adocPreviewLegacyRetheme('kit-red'));
  await page.waitForTimeout(150);
  const previewReady = await page.evaluate(() => !!window._adocLegacyReThemeCandidate);
  log('1a. Aperçu de ré-habillage préparé avec succès (couleur retrouvée et applicable)', previewReady === true, previewReady);

  await page.evaluate(() => window.adocConfirmLegacyRetheme());
  await page.waitForTimeout(300);

  log('1b. AUCUN échec HTTP 400 — sauvegarde réussie (POST /clinical-documents, 201)', counters.createCalls === 1, counters.createCalls);
  const sentBody = counters.lastCreateBody;
  log('1c. Le payload envoyé au Worker contient un sourceSnapshot NON NUL (le contrat exigé par le Worker est respecté)', !!(sentBody && sentBody.document && sentBody.document.sourceSnapshot), sentBody && sentBody.document && sentBody.document.sourceSnapshot);
  log('1d. generationEngine==="legacy-html" bien envoyé (le cas précis que le Worker valide strictement)', sentBody && sentBody.generationEngine === 'legacy-html', sentBody && sentBody.generationEngine);
  log('1e. La charte a bien été appliquée (couleur rouge dans le HTML sauvegardé)', sentBody && JSON.stringify(sentBody.document).includes('#ff0000') || JSON.stringify(sentBody && sentBody.document).toLowerCase().includes('ff0000'), null);
  log('1f. Aucune erreur JS', errors.length === 0, errors);

  console.log('=== Résultats — A2 : vérification post item 48 (ré-habillage manuel, document legacy direct) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  console.log(failCount === 0
    ? '\nCONCLUSION : A2 est déjà résolu par effet de bord d\'item 48 — aucune correction fonctionnelle nécessaire.'
    : '\nCONCLUSION : A2 N\'EST PAS résolu — voir les échecs ci-dessus, à documenter avant tout correctif.');
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
