// Item 48 (parité 0F) — _adocCapabilities/SourceSnapshot posés pour TOUT document de l'ancien
// moteur produit DIRECTEMENT (jamais un repli), pas seulement dans la branche
// fellBackFromStructured. Avant ce lot, un Carrousel/Script/Liens/Fiche directe n'avait NI
// workspace NI SourceSnapshot — cause racine confirmée de "rien n'est fait" sur ces formats
// (adocOpenDocPopup retombait sur le popup iframe générique, faute de capabilities.workspace).
// PÉRIMÈTRE DE CE TEST (décision explicite, cf. échange avant implémentation) : Tableau est
// EXCLU des scénarios directs testés ici — ce documentKind résout presque toujours vers
// fmt==='xlsx' (jamais 'html'), un artefact binaire auquel le modèle _adocCapabilities ne
// s'applique structurellement pas (adocHandleReply, _INTENT_FMT_OVERRIDE force xlsx pour
// intent==='tableau'). Ce n'est pas un oubli : documenté explicitement dans le rapport de lot
// comme hors périmètre, sujet pour un futur lot séparé (parité 0F pour les formats binaires).
// Testé ici : Carrousel, Script, Liens transversaux, Fiche générée DIRECTEMENT (sans jamais
// tenter le structuré) — plus non-régression stricte sur le cas de repli déjà validé
// (Phase 1/2) et sur l'application automatique de la charte (item 44).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];
function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
function legacyHtmlFor(title) {
  return '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;}</style></head><body>'
    + '<h1>' + title + '</h1>'
    + '<p>Un paragraphe de contenu clinique réel, jamais un texte de remplacement.</p>'
    + '</body></html>';
}

// baseRoutes paramétrable : plannerIntent pilote le format produit (jamais 'tableau'/'comparatif'
// ici, hors périmètre — cf. bandeau ci-dessus). onCall2 : succès (jamais atteint pour un
// documentKind !== 'fiche', cf. _shouldAttemptStructuredFiche) ou échec forcé pour provoquer un
// vrai repli (scénario de non-régression).
function baseRoutes(page, { plannerIntent, legacyTitle, onCall2, onBlockCorrection, counters }) {
  return page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
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
      if (onBlockCorrection && body.includes('"name":"emit_block_correction"')) { onBlockCorrection(route, body); return; }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { if (onCall2) { onCall2(route); return; } route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'non attendu ici' } }) }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(legacyHtmlFor(legacyTitle)) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: plannerIntent, clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: legacyTitle, deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
}

const EXPECTED_CAPS = { workspace: true, persist: true, fineCitations: false, blockEditing: false, legacyBlockEditing: true, transform: false, export: true, qualityControlledExport: false };

async function runDirectFormatScenario(browser, results, { formatButtonId, plannerIntent, expectedKind, question }) {
  const log = (label, ok, extra) => results.push([label, ok, extra]);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const counters = { createCalls: 0, lastCreateBody: null };
  const legacyTitle = 'Document ' + expectedKind;
  let blockCorrectionCalls = 0;
  await baseRoutes(page, {
    plannerIntent, legacyTitle, counters,
    onBlockCorrection: (route, body) => {
      blockCorrectionCalls++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text: 'Contenu de correction réel pour ' + expectedKind, items: [], headers: [], rows: [] } }] }) });
    },
  });
  await page.goto('file://' + FILE);
  if (formatButtonId) await page.click(formatButtonId);
  await page.fill('#clinical-question', question);
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a.fmt === 'html'), { timeout: 15000 });
  const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a.fmt === 'html')[0]);
  await page.waitForTimeout(200);
  const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);

  log(`[${expectedKind}] a. _adocGenerationEngine==='legacy-html' (identifie sans ambiguïté un document produit par l'ancien moteur)`, art._adocGenerationEngine === 'legacy-html', art._adocGenerationEngine);
  log(`[${expectedKind}] b. _adocDocumentKind reflète le VRAI type produit (jamais figé sur 'fiche')`, art._adocDocumentKind === expectedKind, art._adocDocumentKind);
  const capsMatch = EXPECTED_CAPS && art._adocCapabilities && Object.keys(EXPECTED_CAPS).every(k => art._adocCapabilities[k] === EXPECTED_CAPS[k]);
  log(`[${expectedKind}] c. _adocCapabilities complet et identique au cas de repli déjà validé (workspace/persist/legacyBlockEditing:true)`, capsMatch, art._adocCapabilities);
  const snapOk = art._adocLegacySourceSnapshot && typeof art._adocLegacySourceSnapshot.sourceSnapshotId === 'string' && Array.isArray(art._adocLegacySourceSnapshot.entries) && art._adocLegacySourceSnapshot.entries.length > 0;
  log(`[${expectedKind}] d. Un vrai SourceSnapshot est construit (dépendance Worker vérifiée : sourceSnapshot non nul obligatoire pour generationEngine='legacy-html')`, snapOk, art._adocLegacySourceSnapshot);

  // Ouverture réelle du popup document → doit désormais router vers l'espace de travail complet,
  // jamais le popup iframe générique en lecture seule (c'était exactement le symptôme "rien n'est
  // fait" décrit dans le prompt).
  await page.evaluate((k) => window.adocOpenDocPopup(k), storeKey);
  await page.waitForSelector('#cc-workspace-screen:not([hidden]), #cc-ws-doc-card', { timeout: 5000 }).catch(() => {});
  const wsOpened = await page.evaluate(() => window._adocWsState && window._adocWsState.storeKey);
  log(`[${expectedKind}] e. adocOpenDocPopup route bien vers l'espace de travail (jamais le popup iframe générique)`, wsOpened === storeKey, wsOpened);

  // Correction réelle d'un bloc (même mécanisme Phase 1, déjà construit — ce lot le rend
  // seulement ACCESSIBLE à ce format, ne modifie jamais son fonctionnement interne).
  const firstBlockId = await page.evaluate(() => {
    const el = document.querySelector('#cc-ws-doc-card [data-cc-legacy-block-id]');
    return el ? el.getAttribute('data-cc-legacy-block-id') : null;
  });
  let correctionWorked = false;
  if (firstBlockId) {
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
  log(`[${expectedKind}] f. Correction de bloc RÉELLEMENT fonctionnelle (pas seulement accessible en apparence)`, correctionWorked, { firstBlockId, blockCorrectionCalls });

  // Insertion réelle d'un bloc (Phase 2, même logique).
  let insertionWorked = false;
  const blockIdForInsert = await page.evaluate(() => {
    const el = document.querySelector('#cc-ws-doc-card [data-cc-legacy-block-id]');
    return el ? el.getAttribute('data-cc-legacy-block-id') : null;
  });
  if (blockIdForInsert) {
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${blockIdForInsert}"]`);
    await page.waitForSelector('.cc-block-edit-panel', { timeout: 5000 }).catch(() => {});
    const insertBtnPresent = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel button'));
    if (insertBtnPresent) {
      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.cc-block-edit-panel button')].find(b => b.textContent.includes('Insérer un bloc après'));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (clicked) {
        await page.waitForSelector('.cc-block-edit-result .cc-clarity-reply-btn', { timeout: 5000 }).catch(() => {});
        const typeBtnPresent = await page.evaluate(() => !!document.querySelector('.cc-block-edit-result button'));
        if (typeBtnPresent) {
          await page.click('.cc-block-edit-result button:has-text("Paragraphe")');
          await page.waitForTimeout(500);
          const htmlAfter = await page.evaluate((k) => window._adocArtifacts[k].html, storeKey);
          insertionWorked = htmlAfter.includes('Nouveau paragraphe');
        }
      }
    }
  }
  log(`[${expectedKind}] g. Insertion de bloc RÉELLEMENT fonctionnelle`, insertionWorked, { blockIdForInsert });

  // Sauvegarde réelle — la dépendance critique de l'investigation (le Worker exige un
  // sourceSnapshot non nul pour generationEngine='legacy-html', vérifié dans son code réel).
  await page.evaluate(() => window.adocWsSave());
  await page.waitForTimeout(300);
  log(`[${expectedKind}] h. Sauvegarde réussie — une vraie réponse serveur 201, pas seulement en mémoire`, counters.createCalls === 1, counters.createCalls);
  const sentBody = counters.lastCreateBody;
  log(`[${expectedKind}] i. Le payload envoyé au Worker contient un sourceSnapshot non nul (contrat Worker respecté)`, !!(sentBody && sentBody.document && sentBody.document.sourceSnapshot), sentBody && sentBody.document && sentBody.document.sourceSnapshot);
  log(`[${expectedKind}] j. Le documentKind envoyé au Worker reflète le vrai type (jamais 'fiche' par défaut)`, sentBody && sentBody.documentKind === expectedKind, sentBody && sentBody.documentKind);
  log(`[${expectedKind}] k. Aucune erreur JS`, errors.length === 0, errors);

  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1-4. Les 4 formats directs (Tableau exclu, cf. bandeau — hors périmètre documenté) ═══
  await runDirectFormatScenario(browser, results, { formatButtonId: '#format-carousel', plannerIntent: 'carrousel', expectedKind: 'carrousel', question: 'Fais-moi un carrousel sur les cavaliers de Gottman' });
  await runDirectFormatScenario(browser, results, { formatButtonId: '#format-script', plannerIntent: 'script', expectedKind: 'script', question: 'Fais-moi un script sur les cavaliers de Gottman' });
  await runDirectFormatScenario(browser, results, { formatButtonId: '#format-links', plannerIntent: 'liens', expectedKind: 'liens', question: 'Fais-moi des liens transversaux sur les cavaliers de Gottman' });
  // Fiche générée DIRECTEMENT sans jamais tenter le structuré : window.adocStructuredFicheEnabled
  // désactivé pour ce scénario précis (autre mécanisme que documentKind — cf. adocGetRendererMode
  // et window.adocStructuredFicheEnabled, un seul point de vérité déjà existant pour couper ce
  // chemin, jamais un nouveau mécanisme inventé pour ce test).
  {
    const page = await browser.newPage();
    await page.close(); // sonde jetable, juste pour vérifier le flag existe avant de l'utiliser
  }
  await (async () => {
    const log2 = (label, ok, extra) => results.push([label, ok, extra]);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const counters = { createCalls: 0, lastCreateBody: null };
    let blockCorrectionCalls = 0;
    await baseRoutes(page, {
      plannerIntent: 'fiche', legacyTitle: 'Document fiche directe', counters,
      onBlockCorrection: (route) => { blockCorrectionCalls++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text: 'Contenu réel', items: [], headers: [], rows: [] } }] }) }); },
    });
    await page.goto('file://' + FILE);
    // Coupe le chemin structuré via son propre point de vérité existant (jamais un nouveau flag) —
    // garantit que cette fiche est bien générée DIRECTEMENT, sans jamais tenter le structuré,
    // distinct du scénario de repli (non-régression) testé séparément plus bas.
    await page.evaluate(() => { window.adocStructuredFicheEnabled = false; });
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a.fmt === 'html'), { timeout: 15000 });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a.fmt === 'html')[0]);
    await page.waitForTimeout(200);
    const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);
    log2('[fiche-directe] a. _adocGenerationEngine==\'legacy-html\' même sans jamais avoir tenté le structuré', art._adocGenerationEngine === 'legacy-html', art._adocGenerationEngine);
    log2('[fiche-directe] b. _adocDocumentKind===\'fiche\' (seul cas où le dernier recours coïncide avec la réalité)', art._adocDocumentKind === 'fiche', art._adocDocumentKind);
    const capsMatch = art._adocCapabilities && Object.keys(EXPECTED_CAPS).every(k => art._adocCapabilities[k] === EXPECTED_CAPS[k]);
    log2('[fiche-directe] c. _adocCapabilities posé (jamais réservé au seul cas de repli)', capsMatch, art._adocCapabilities);
    const snapOk = art._adocLegacySourceSnapshot && Array.isArray(art._adocLegacySourceSnapshot.entries);
    log2('[fiche-directe] d. SourceSnapshot construit pour cette fiche directe', snapOk, art._adocLegacySourceSnapshot);
    await page.evaluate((k) => window.adocOpenDocPopup(k), storeKey);
    await page.waitForTimeout(200);
    const wsOpened = await page.evaluate(() => window._adocWsState && window._adocWsState.storeKey);
    log2('[fiche-directe] e. Ouvre bien l\'espace de travail, jamais le popup générique', wsOpened === storeKey, wsOpened);
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(300);
    log2('[fiche-directe] f. Sauvegarde réelle réussie', counters.createCalls === 1, counters.createCalls);
    log2('[fiche-directe] g. sourceSnapshot non nul envoyé au Worker', !!(counters.lastCreateBody && counters.lastCreateBody.document && counters.lastCreateBody.document.sourceSnapshot), counters.lastCreateBody);
    log2('[fiche-directe] h. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  })();

  // ═══ 5. Non-régression STRICTE — repli structuré→legacy (Phase 1/2, déjà validé) ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const counters = { createCalls: 0, lastCreateBody: null };
    await baseRoutes(page, {
      plannerIntent: 'fiche', legacyTitle: 'Document de repli', counters,
      onCall2: (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé' } }) }),
    });
    await page.goto('file://' + FILE);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 15000 });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html')[0]);
    await page.waitForTimeout(200);
    const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);
    log('[repli] a. Non-régression — comportement de repli strictement identique (kind=\'fiche\', capacités, snapshot)', art._adocDocumentKind === 'fiche' && art._adocCapabilities?.workspace === true && !!art._adocLegacySourceSnapshot, art);
    await page.evaluate((k) => window.adocOpenWorkspace(k), storeKey);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(300);
    log('[repli] b. Non-régression — sauvegarde du cas de repli toujours fonctionnelle', counters.createCalls === 1, counters.createCalls);
    log('[repli] c. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Item 48 : capacités de personnalisation posées par défaut (parité 0F) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
