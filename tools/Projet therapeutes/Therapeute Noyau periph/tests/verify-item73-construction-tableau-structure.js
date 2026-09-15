// Item 73 CONSTRUCTION — câblage Tableau au structuré (bloc minimal, exclusion xlsx du
// périmètre structuré, normalisation 'comparatif').
//
// 1. Génération réelle d'un Tableau structuré (documentKind explicite, aucune mention Excel) :
//    moteur structuré aboutit, classe CSS adoc-sc-tableau, couleur ardoise dédiée.
// 2. TEST LE PLUS CRITIQUE — demande Excel explicite ("tableau Excel...") : DOIT passer par
//    legacy (jamais le structuré), DOIT produire un vrai fichier .xlsx (non-régression item 67
//    complète, y compris columnSummaries/legend/notes).
// 3. 'comparatif' en texte libre SANS mention Excel : DOIT être routé vers le structuré
//    (normalisation _structuredAttemptKind).
// 4. Édition directe bannière + corps sur un Tableau structuré.
// 5. Non-régression Fiche/Carrousel/Script (rendu direct, capacités inchangées).
// 6. Régression #6 — aucune duplication (grep).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
function mockToolResponseSSE(toolName, input) {
  const inputJson = JSON.stringify(input);
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } })
    + sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: toolName, input: {} } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } })
    + sseLine({ type: 'content_block_stop', index: 0 })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}

const structuredTableau = {
  title: 'Comparatif TCC / EFT / Systémique', purpose: 'tableau comparatif', audience: 'clinicien',
  blocks: [
    { type: 'heading', text: 'Vue d’ensemble', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
    { type: 'table', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
      headers: ['Critère', 'TCC', 'EFT', 'Systémique'],
      rows: [['Modèle', 'Cognitivo-comportemental', 'Attachement émotionnel', 'Interactions familiales']],
      imageQuery: '', imageAlt: '', citationEntryIds: ['entry-1'] },
  ],
};

function baseRoutes(page, { onEmitTableau, onGenerateXlsx, mainLegacyReplySSE, planIntent }) {
  let capturedEmitTableau = false;
  page.route('**/*', route => {
    const req = route.request(); const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.includes('/generate-xlsx')) {
      if (onGenerateXlsx) onGenerateXlsx(JSON.parse(req.postData() || '{}'));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'fake', url: 'https://example/get-file/fake?dl=1', url_preview: 'https://example/get-file/fake', filename: 'test.xlsx', size: 123 }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) }); return; }
      if (body.includes('"type":"tool","name":"emit_tableau_document"')) { capturedEmitTableau = true; if (onEmitTableau) onEmitTableau(); route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE('emit_tableau_document', structuredTableau) }); return; }
      // ATTENTION test : '"max_tokens":200' est une SOUS-CHAÎNE de '"max_tokens":2000' (l'appel
      // planificateur) — lookahead négatif pour ne jamais confondre les deux appels.
      if (/"max_tokens":200(?!\d)/.test(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"stream":true')) {
        if (mainLegacyReplySSE) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: mainLegacyReplySSE }); return; }
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('<!DOCTYPE html><html><body><p>Legacy.</p></body></html>') });
        return;
      }
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: planIntent || 'tableau', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Comparatif', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
  return () => capturedEmitTableau;
}

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════════════════ 1. Génération réelle Tableau structuré (documentKind explicite) ═══════════════════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const getCaptured = baseRoutes(page, {});
    await page.goto('file://' + FILE);
    await page.click('#format-table');
    await page.fill('#clinical-question', 'Fais-moi un tableau comparatif TCC / EFT / Systémique');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc || a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const art1 = await page.evaluate(() => {
      const [key, a] = Object.entries(window._adocArtifacts)[0];
      return { key, engine: a._adocGenerationEngine, doc: a._adocStructuredDoc || null };
    });
    log('1a. Le Tableau a bien tenté le moteur structuré (payload emit_tableau_document capturé)', getCaptured(), getCaptured());
    log('1b. Génération STRUCTURÉE aboutie SANS repli vers legacy', art1.engine === 'structured', art1);
    log('1c. documentKind du document produit est bien "tableau"', art1.doc && art1.doc.documentKind === 'tableau', art1.doc && art1.doc.documentKind);

    const openedWs = await page.evaluate((k) => window.adocOpenWorkspace(k), art1.key);
    log('1d. adocOpenWorkspace réussit avec le document Tableau réellement généré', openedWs === true, openedWs);

    const cssInfo = await page.evaluate(() => {
      const docEl = document.querySelector('.adoc-sc-doc');
      return {
        hasTableauClass: !!docEl && docEl.classList.contains('adoc-sc-tableau'),
        hasFicheClass: !!docEl && docEl.classList.contains('adoc-sc-fiche'),
        hasScriptClass: !!docEl && docEl.classList.contains('adoc-sc-script'),
        coverBg: docEl ? getComputedStyle(document.querySelector('.adoc-sc-cover')).backgroundColor : null,
      };
    });
    log('1e. Le document rendu porte la classe adoc-sc-tableau', cssInfo.hasTableauClass, cssInfo);
    log('1f. Le document rendu NE porte PAS adoc-sc-fiche (identité distincte)', !cssInfo.hasFicheClass, cssInfo);
    log('1g. Le document rendu NE porte PAS adoc-sc-script (identité distincte)', !cssInfo.hasScriptClass, cssInfo);
    log('1h. La bannière utilise bien la couleur ardoise dédiée (rgb(61, 82, 102))', cssInfo.coverBg === 'rgb(61, 82, 102)', cssInfo.coverBg);

    // ── Édition directe bannière (item 68 parity) ──
    await page.click('.adoc-sc-cover-title');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Titre modifié à la main');
    await page.locator('#cc-ws-doc-card').click({ position: { x: 5, y: 5 } });
    const afterEdit = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts)[0];
      window.adocEditorSync && window.adocEditorSync();
      return { title: a._adocStructuredDoc.title };
    });
    log('2a. Édition directe du TITRE de bannière synchronisée vers doc.title (Tableau)', afterEdit.title === 'Titre modifié à la main', afterEdit);

    const bodyEditable = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts)[0];
      return !!(a._adocCapabilities && a._adocCapabilities.blockEditing);
    });
    log('2b. blockEditing activé pour ce document Tableau structuré (édition de corps disponible)', bodyEditable, bodyEditable);

    log('3. Aucune erreur JS sur tout le scénario Tableau structuré', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 2. TEST LE PLUS CRITIQUE — demande Excel explicite ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const xlsxData = {
      headers: ['Critère', 'TCC', 'EFT', 'Systémique'],
      rows: [['Modèle théorique', 'Cognitivo-comportemental', 'Attachement émotionnel', 'Interactions familiales'], ['Indication', '●', '◐', '●']],
      columnSummaries: [{ header: 'TCC', tagline: 'Le rééducateur cognitif', description: 'Cible les pensées et comportements dysfonctionnels du couple.' }],
      legend: [{ symbol: '●', label: 'Indication forte' }, { symbol: '◐', label: 'Indication partielle' }],
      notes: [{ title: 'Point de vigilance', text: 'Ce protocole conjoint est contre-indiqué en cas de violence conjugale active — un travail individuel préalable est requis.' }],
    };
    const modelHtmlReply = '<!DOCTYPE html><html><head><script id="xlsx-data" type="application/json">' + JSON.stringify(xlsxData) + '<' + '/script></head><body>'
      + '<h1>Comparatif TCC / EFT / Systémique</h1><table><tr><th>Critère</th><th>TCC</th></tr><tr><td>Modèle</td><td>Cognitivo-comportemental</td></tr></table>'
      + '<div class="cc-encadre-vigilance"><h2>Point de vigilance</h2><p>Ce protocole conjoint est contre-indiqué en cas de violence conjugale active — un travail individuel préalable est requis.</p></div>'
      + '</body></html>';
    let generateXlsxBody = null;
    const getCaptured = baseRoutes(page, { mainLegacyReplySSE: simpleTextSSE(modelHtmlReply), onGenerateXlsx: (b) => { generateXlsxBody = b; } });
    await page.goto('file://' + FILE);
    await page.fill('#clinical-question', 'Fais-moi un tableau Excel comparatif TCC / EFT / Systémique en couple');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => window.__adocGenerateXlsxCalled === true || Object.values(window._adocArtifacts || {}).some(a => a.xlsxData), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const art2 = await page.evaluate(() => {
      const entries = Object.values(window._adocArtifacts || {});
      const a = entries[entries.length - 1];
      return a ? { engine: a._adocGenerationEngine, xlsxData: a.xlsxData || null } : null;
    });
    log('4a. Demande Excel explicite N\'A JAMAIS tenté le moteur structuré (garde-fou item 73)', getCaptured() === false, getCaptured());
    log('4b. Le document est bien produit par legacy (jamais structuré) pour une demande Excel', art2 && art2.engine !== 'structured', art2);
    log('4c. /generate-xlsx a bien été appelé (fichier .xlsx réellement produit, non-régression item 67)', generateXlsxBody !== null, generateXlsxBody);
    const sheets = (generateXlsxBody && generateXlsxBody.content && generateXlsxBody.content.sheets) || [];
    const sheetNames = sheets.map(s => s.name);
    const mainSheet = sheets.find(s => s.headers && s.headers.includes('TCC'));
    log('4d. Les colonnes/rows demandées sont bien transmises à /generate-xlsx (feuille principale)', !!mainSheet, sheetNames);
    log('4e. Feuille "Résumé des approches" (columnSummaries) présente — non-régression item 67', sheetNames.includes('Résumé des approches'), sheetNames);
    log('4f. Feuille "Légende" (legend) présente — non-régression item 67', sheetNames.includes('Légende'), sheetNames);
    log('4g. Feuille "Notes cliniques" (notes) présente — non-régression item 67 Partie A', sheetNames.includes('Notes cliniques'), sheetNames);
    log('5. Aucune erreur JS (demande Excel explicite)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 3. 'comparatif' en texte libre SANS Excel → structuré ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const getCaptured = baseRoutes(page, { planIntent: 'comparatif' });
    await page.goto('file://' + FILE);
    // Aucune carte de format cliquée — texte libre, intent classifié 'comparatif' par le plan mocké.
    await page.fill('#clinical-question', 'Compare-moi TCC, EFT et Systémique pour un couple en crise');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc || a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const art3 = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts)[0];
      return { engine: a._adocGenerationEngine, doc: a._adocStructuredDoc || null };
    });
    log('6a. Intent "comparatif" (texte libre, sans Excel) a bien tenté le structuré (normalisation)', getCaptured(), getCaptured());
    log('6b. Génération STRUCTURÉE aboutie pour "comparatif"', art3.engine === 'structured', art3);
    log('6c. Le document produit porte bien documentKind="tableau" (normalisé, jamais "comparatif")', art3.doc && art3.doc.documentKind === 'tableau', art3.doc && art3.doc.documentKind);
    log('7. Aucune erreur JS (comparatif texte libre)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 8. Non-régression Fiche/Carrousel/Script (rendu direct) ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + FILE);
    const mk = (kind, blocks, extra) => ({
      schemaVersion: 1, documentId: 'doc-' + kind, versionId: 'v1', previousVersionId: null, requestId: 'r-' + kind, sourceSnapshotId: 'snap-' + kind,
      createdAt: new Date().toISOString(), language: 'fr', status: 'draft', title: 'Titre ' + kind, purpose: kind, audience: 'Clinicien',
      documentKind: kind, renderManifestId: 'manifest-default-001', derivedFrom: null, blocks, citations: [],
      validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
      ...extra,
    });
    const ficheDoc = mk('fiche', [{ id: 'p-01', type: 'paragraph', content: { text: 'Texte de test.' }, citationIds: [], validation: {} }]);
    const carrouselDoc = mk('carrousel', [{ id: 'card-01', type: 'card', content: { title: 'Carte 1', imageRef: null, imageAlt: null, blocks: [{ id: 'p-01', type: 'paragraph', content: { text: 'Texte carte.' }, citationIds: [], validation: {} }] }, citationIds: [], validation: {} }]);
    const scriptDoc = mk('script', [{ id: 'p-01', type: 'paragraph', content: { text: 'Phrase verbatim.' }, citationIds: [], validation: {} }]);
    const res = await page.evaluate(async (docs) => {
      const snap = (id) => ({ sourceSnapshotId: id, entries: [] });
      const f = await window.adocRenderClinicalDocument(docs.fiche, snap('snap-fiche'), null);
      const c = await window.adocRenderClinicalDocument(docs.carrousel, snap('snap-carrousel'), null);
      const s = await window.adocRenderClinicalDocument(docs.script, snap('snap-script'), null);
      return {
        ficheHasFicheClass: f.html.includes('adoc-sc-fiche'), ficheHasTableauClass: f.html.includes('adoc-sc-tableau'),
        carrouselHasCarrouselClass: c.html.includes('adoc-sc-carrousel'),
        scriptHasScriptClass: s.html.includes('adoc-sc-script'), scriptHasTableauClass: s.html.includes('adoc-sc-tableau'),
        ficheQc: f.qc.blocking.length, carrouselQc: c.qc.blocking.length, scriptQc: s.qc.blocking.length,
      };
    }, { fiche: ficheDoc, carrousel: carrouselDoc, script: scriptDoc });
    log('8a. Fiche continue de produire adoc-sc-fiche (capacité inchangée)', res.ficheHasFicheClass, res);
    log('8b. Fiche ne produit jamais adoc-sc-tableau (aucune contamination croisée)', !res.ficheHasTableauClass, res);
    log('8c. Carrousel continue de produire adoc-sc-carrousel (capacité inchangée)', res.carrouselHasCarrouselClass, res);
    log('8d. Script continue de produire adoc-sc-script (capacité inchangée)', res.scriptHasScriptClass, res);
    log('8e. Script ne produit jamais adoc-sc-tableau (aucune contamination croisée)', !res.scriptHasTableauClass, res);
    log('8f. Fiche/Carrousel/Script : aucun blocage QC introduit par ce lot', res.ficheQc === 0 && res.carrouselQc === 0 && res.scriptQc === 0, res);
    log('9. Aucune erreur JS (non-régression Fiche/Carrousel/Script)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 10. Régression #6 — pas de duplication ═══════════════════════════════
  {
    const fs = require('fs');
    const src = fs.readFileSync(FILE, 'utf8');
    function countDecl(name) {
      const re = new RegExp('function ' + name + '\\s*\\(', 'g');
      return (src.match(re) || []).length;
    }
    function countConst(name) {
      const re = new RegExp('const ' + name + '\\s*=', 'g');
      return (src.match(re) || []).length;
    }
    log('10a. adocRenderBlockHTML — une seule déclaration', countDecl('adocRenderBlockHTML') === 1, countDecl('adocRenderBlockHTML'));
    log('10b. adocRenderTableauHTML — une seule déclaration', countDecl('adocRenderTableauHTML') === 1, countDecl('adocRenderTableauHTML'));
    log('10c. adocRenderFicheHTML / adocRenderScriptHTML — non touchées, une seule déclaration chacune', countDecl('adocRenderFicheHTML') === 1 && countDecl('adocRenderScriptHTML') === 1, { fiche: countDecl('adocRenderFicheHTML'), script: countDecl('adocRenderScriptHTML') });
    log('10d. adocGenerateStructuredDocument — une seule déclaration (orchestrateur générique)', countDecl('adocGenerateStructuredDocument') === 1, countDecl('adocGenerateStructuredDocument'));
    log('10e. ADOC_STRUCTURED_TABLEAU_TOOL — une seule déclaration', countConst('ADOC_STRUCTURED_TABLEAU_TOOL') === 1, countConst('ADOC_STRUCTURED_TABLEAU_TOOL'));
    log('10f. Aucun registre (wired/renderer/profiles) ne porte de clé "comparatif" (normalisation en 1 ligne, jamais une duplication)', !src.includes("comparatif: true") && !src.includes("comparatif: 'structured'") && !/comparatif:\s*ADOC_STRUCTURED/.test(src), true);
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== RÉSULTATS ITEM 73 CONSTRUCTION ===');
  results.forEach(([label, ok]) => console.log((ok ? '✅' : '❌') + ' ' + label));
  console.log('\nTotal: ' + results.length + ' | Réussis: ' + (results.length - failed.length) + ' | Échoués: ' + failed.length);
  if (failed.length) {
    console.log('\n--- DÉTAILS DES ÉCHECS ---');
    failed.forEach(([label, , extra]) => console.log(label + ' :: ' + JSON.stringify(extra)));
    process.exit(1);
  }
})();
