// Item 53 (parité 0F / §0.1 du CDC) — Tableau produit le rendu magazine HTML/PDF par défaut ;
// le format Excel n'est produit QUE si la demande le nomme explicitement (excel/xls/xlsx/tableur).
//
// Scénario A — "Fais-moi un tableau sur X" (SANS mot Excel) : doit désormais produire fmt==='html'
// (rendu magazine, même pipeline que Carrousel/Script/Liens déjà validé item 48), avec
// _adocCapabilities posé (workspace/persist/legacyBlockEditing), correction de bloc et insertion
// de bloc fonctionnelles, sauvegarde réussie avec sourceSnapshot non nul. Le planner mocké renvoie
// délibérément output_format:'xlsx' (reproduisant le comportement RÉEL non corrigé du plannerSystem,
// §5 : "TABLEAU COMPARATIF → xlsx OBLIGATOIREMENT") pour prouver que la décision finale ignore bien
// ce champ et se fonde uniquement sur plan._explicitXlsxRequested (texte brut) — sans quoi le bug
// identifié en investigation (site 3 traitant 'xlsx' comme "format explicite" du planner) referait
// surface silencieusement.
//
// Scénario B — "Fais-moi un tableau Excel sur X" : comportement STRICTEMENT inchangé par rapport
// à avant ce lot — fmt==='xlsx', xlsx-data extrait et envoyé à /generate-xlsx.
//
// Scénario C — non-régression : intent 'comparatif' (hors périmètre de ce lot) reste forcé sur
// xlsx même sans mot-clé Excel dans le texte.
//
// Item 70 Volet 2 (palier 2, clarté de format) — ce scénario a dû être adapté : son texte
// ("Fais-moi un comparatif EMDR ICV, sans mot Excel") correspond exactement au motif 1 de la
// nouvelle porte de clarté de format ("comparatif" sans mention de tableau/liste/colonnes), qui
// déclenche désormais une carte de clarification avant que le routage testé ici ne puisse se
// produire. Option retenue (b, texte ambigu conservé + résolution simulée) plutôt que (a, carte
// de type cliquée au préalable) : le point vérifié par ce scénario est le comportement de
// l'intent 'comparatif' auto-classifié (jamais un type explicitement cliqué), donc cliquer une
// carte AVANT l'envoi aurait changé ce qui est réellement testé. Après résolution du palier 2
// (choix "Tableau"), plan.intent reste 'comparatif' et plan._explicitXlsxRequested (calculé une
// fois sur le texte brut, avant le palier 2, jamais recalculé) est inchangé — le mécanisme
// vérifié ici (fmt xlsx forcé par _ADOC_XLSX_ELIGIBLE_INTENTS + _explicitXlsxRequested, ligne
// ~4508/6176) ne dépend que de plan.intent, jamais de documentKind : la résolution du palier 2
// ne modifie donc rien de ce que ce scénario vérifiait à l'origine.
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
    + '<table><tbody><tr><td>Approche</td><td>Indication</td></tr></tbody></table>'
    + '</body></html>';
}
const XLSX_DATA = { headers: ['Critère', 'A', 'B'], rows: [['Modèle', 'x', 'y']] };
function xlsxHtmlFor(title) {
  return '<!DOCTYPE html><html><head>'
    + '<script id="xlsx-data" type="application/json">' + JSON.stringify(XLSX_DATA) + '<' + '/script>'
    + '</head><body><h1>' + title + '</h1></body></html>';
}

const EXPECTED_CAPS = { workspace: true, persist: true, fineCitations: false, blockEditing: false, legacyBlockEditing: true, transform: false, export: true, qualityControlledExport: false };

// plannerOutputFormat : ce que le planner LLM mocké renvoie dans son JSON output_format —
// délibérément 'xlsx' en scénario A pour prouver que la décision finale l'ignore.
function baseRoutes(page, { plannerIntent, plannerOutputFormat, legacyTitle, reply, onBlockCorrection, onGenerateXlsx, counters }) {
  return page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/generate-xlsx')) {
      if (onGenerateXlsx) onGenerateXlsx(route);
      else route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'fake', url: 'https://example/get-file/fake?dl=1', url_preview: 'https://example/get-file/fake', filename: 'test.xlsx', size: 123 }) });
      return;
    }
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
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(reply) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: plannerIntent, clinical_intent: 'production', output_format: plannerOutputFormat, audience_type: 'praticien', registre: 'clinique', topic_summary: legacyTitle, deep_scan: false, max_tokens: 2000 };
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

  // ═══ Scénario A — "Fais-moi un tableau sur les cavaliers de Gottman" (SANS "Excel") ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const counters = { createCalls: 0, lastCreateBody: null };
    let blockCorrectionCalls = 0;
    let generateXlsxCalled = false;
    const legacyTitle = 'Tableau des cavaliers de Gottman';
    await baseRoutes(page, {
      plannerIntent: 'tableau', plannerOutputFormat: 'xlsx', // ← stale LLM guess, doit être ignoré
      legacyTitle, reply: legacyHtmlFor(legacyTitle), counters,
      onGenerateXlsx: () => { generateXlsxCalled = true; },
      onBlockCorrection: (route) => {
        blockCorrectionCalls++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text: 'Contenu de correction réel pour tableau', items: [], headers: [], rows: [] } }] }) });
      },
    });
    await page.goto('file://' + FILE);
    await page.click('#format-table');
    await page.fill('#clinical-question', 'Fais-moi un tableau sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.keys(window._adocArtifacts || {}).length > 0, { timeout: 15000 });
    await page.waitForTimeout(300);
    const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts)[0]);
    const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);

    log('[A] a. fmt==="html" (rendu magazine par défaut, jamais xlsx — malgré plan.output_format="xlsx" côté planner)', art.fmt === 'html', art.fmt);
    log('[A] b. Rendu magazine cohérent (charte CSS + tableau HTML réel, pas un template générique)', typeof art.html === 'string' && art.html.includes('--mer:') && art.html.includes('<table>'), art.html && art.html.slice(0, 120));
    log('[A] c. Aucun appel à /generate-xlsx (jamais de fichier Excel produit par défaut)', generateXlsxCalled === false, generateXlsxCalled);
    log('[A] d. _adocGenerationEngine==="legacy-html"', art._adocGenerationEngine === 'legacy-html', art._adocGenerationEngine);
    log('[A] e. _adocDocumentKind==="tableau" (jamais figé sur \'fiche\')', art._adocDocumentKind === 'tableau', art._adocDocumentKind);
    const capsMatch = art._adocCapabilities && Object.keys(EXPECTED_CAPS).every(k => art._adocCapabilities[k] === EXPECTED_CAPS[k]);
    log('[A] f. _adocCapabilities posé (item 48 — parité 0F, Tableau entre désormais dans le périmètre fmt===html)', capsMatch, art._adocCapabilities);
    const snapOk = art._adocLegacySourceSnapshot && typeof art._adocLegacySourceSnapshot.sourceSnapshotId === 'string' && Array.isArray(art._adocLegacySourceSnapshot.entries) && art._adocLegacySourceSnapshot.entries.length > 0;
    log('[A] g. SourceSnapshot réel construit (dépendance Worker vérifiée)', snapOk, art._adocLegacySourceSnapshot);

    await page.evaluate((k) => window.adocOpenDocPopup(k), storeKey);
    await page.waitForSelector('#cc-workspace-screen:not([hidden]), #cc-ws-doc-card', { timeout: 5000 }).catch(() => {});
    const wsOpened = await page.evaluate(() => window._adocWsState && window._adocWsState.storeKey);
    log('[A] h. adocOpenDocPopup route vers l\'espace de travail complet (jamais le popup iframe générique)', wsOpened === storeKey, wsOpened);

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
    log('[A] i. Correction de bloc RÉELLEMENT fonctionnelle', correctionWorked, { firstBlockId, blockCorrectionCalls });

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
    log('[A] j. Insertion de bloc RÉELLEMENT fonctionnelle', insertionWorked, { blockIdForInsert });

    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(300);
    log('[A] k. Sauvegarde réussie (réponse serveur 201)', counters.createCalls === 1, counters.createCalls);
    const sentBody = counters.lastCreateBody;
    log('[A] l. Payload envoyé au Worker contient un sourceSnapshot non nul', !!(sentBody && sentBody.document && sentBody.document.sourceSnapshot), sentBody && sentBody.document && sentBody.document.sourceSnapshot);
    log('[A] m. documentKind envoyé au Worker === "tableau"', sentBody && sentBody.documentKind === 'tableau', sentBody && sentBody.documentKind);
    log('[A] n. Aucune erreur JS', errors.length === 0, errors);

    await page.close();
  }

  // ═══ Scénario B — "Fais-moi un tableau Excel sur les cavaliers de Gottman" ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const counters = { createCalls: 0, lastCreateBody: null };
    let generateXlsxBody = null;
    const legacyTitle = 'Tableau Excel des cavaliers de Gottman';
    await baseRoutes(page, {
      plannerIntent: 'tableau', plannerOutputFormat: 'chat', // le planner peut se tromper dans l'autre sens aussi — sans effet
      legacyTitle, reply: xlsxHtmlFor(legacyTitle), counters,
      onGenerateXlsx: (route) => { generateXlsxBody = JSON.parse(route.request().postData() || '{}'); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'fake', url: 'https://example/get-file/fake?dl=1', url_preview: 'https://example/get-file/fake', filename: 'test.xlsx', size: 123 }) }); },
    });
    await page.goto('file://' + FILE);
    await page.click('#format-table');
    await page.fill('#clinical-question', 'Fais-moi un tableau Excel sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => !!window.__adocXlsxDelivered || Object.keys(window._adocArtifacts || {}).length > 0, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    log('[B] a. /generate-xlsx appelé — fmt==="xlsx" strictement inchangé (comportement pré-lot 53)', !!generateXlsxBody, !!generateXlsxBody);
    log('[B] b. Les données xlsx (headers/rows) sont bien transmises au Worker', !!(generateXlsxBody && generateXlsxBody.content), generateXlsxBody && generateXlsxBody.content);
    log('[B] c. Aucune erreur JS', errors.length === 0, errors);

    await page.close();
  }

  // ═══ Scénario C — non-régression : intent "comparatif" reste forcé xlsx (hors périmètre) ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const counters = { createCalls: 0, lastCreateBody: null };
    let generateXlsxBody = null;
    const legacyTitle = 'Comparatif EMDR ICV';
    await baseRoutes(page, {
      plannerIntent: 'comparatif', plannerOutputFormat: 'chat',
      legacyTitle, reply: xlsxHtmlFor(legacyTitle), counters,
      onGenerateXlsx: (route) => { generateXlsxBody = JSON.parse(route.request().postData() || '{}'); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'fake', url: 'https://example/get-file/fake?dl=1', url_preview: 'https://example/get-file/fake', filename: 'test.xlsx', size: 123 }) }); },
    });
    await page.goto('file://' + FILE);
    await page.fill('#clinical-question', 'Fais-moi un comparatif EMDR ICV, sans mot Excel');
    await page.click('#clinical-home-form button[type="submit"]');
    // Item 70 Volet 2 — motif 1 ("comparatif" sans tableau/liste/colonnes) déclenche désormais le
    // palier 2 avant le routage xlsx testé ici. Résolution : choisir "Tableau" (candidat proposé
    // par le motif), ce qui pose adocClarityDocumentKind='tableau' SANS toucher plan.intent
    // ('comparatif' inchangé) ni plan._explicitXlsxRequested (déjà calculé sur le texte brut,
    // jamais recalculé) — le mécanisme vérifié par ce scénario reste donc exercé à l'identique.
    const clarityCardShown = await page.waitForFunction(() => !!document.querySelector('#adoc-messages .cc-clarity-card'), { timeout: 3000 }).then(() => true).catch(() => false);
    log('[C] a0. Le palier 2 se déclenche bien (motif "comparatif" sans tableau/liste/colonnes)', clarityCardShown);
    if (clarityCardShown) {
      await page.click('#adoc-messages .cc-clarity-reply-btn:has-text("Tableau")');
    }
    await page.waitForTimeout(1500);
    log('[C] a. intent "comparatif" reste forcé xlsx même sans mot-clé Excel (hors périmètre item 53, non-régression)', !!generateXlsxBody, !!generateXlsxBody);
    log('[C] b. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Item 53 : Tableau HTML/PDF magazine par défaut, Excel sur demande explicite ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
