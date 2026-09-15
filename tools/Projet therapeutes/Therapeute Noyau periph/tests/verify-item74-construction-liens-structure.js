// Item 74 CONSTRUCTION — câblage Liens transversaux au structuré (DERNIER TYPE DU CATALOGUE).
// Option A retenue par Christophe : aucun nouveau type de bloc (heading/paragraph/callout/list/
// table/quote/image réutilisés tels quels, comme Script/Tableau).
//
// 1. Génération réelle de Liens transversaux structurés (bouton #format-links, data-kind="liens") :
//    moteur structuré aboutit, classe CSS adoc-sc-liens, couleur vert forêt dédiée.
// 2. Identité visuelle distincte des 4 autres types (fiche/carrousel/script/tableau absents).
// 3. Édition directe bannière + corps sur un document Liens structuré.
// 4. Non-régression Fiche/Carrousel/Script/Tableau (rendu direct, capacités inchangées).
// 5. Régression #6 — aucune duplication (grep).
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

const structuredLiens = {
  title: 'TCC ↔ Attachement', purpose: 'liens transversaux', audience: 'clinicien',
  blocks: [
    { type: 'heading', text: 'TCC ↔ Attachement', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
    { type: 'paragraph', text: 'Les deux approches convergent sur la régulation émotionnelle mais divergent sur l’origine du symptôme.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: ['entry-1'] },
    { type: 'callout', text: 'Distinction clé : la TCC cible la cognition consciente, l’attachement cible les schémas relationnels précoces.', level: 2, visualRole: 'warning', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
  ],
};

function baseRoutes(page, { onEmitLiens, mainLegacyReplySSE } = {}) {
  let capturedEmitLiens = false;
  page.route('**/*', route => {
    const req = route.request(); const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) }); return; }
      if (body.includes('"type":"tool","name":"emit_liens_document"')) { capturedEmitLiens = true; if (onEmitLiens) onEmitLiens(); route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE('emit_liens_document', structuredLiens) }); return; }
      // '"max_tokens":200' est une SOUS-CHAÎNE de '"max_tokens":2000' (appel planificateur) —
      // lookahead négatif pour ne jamais confondre les deux appels (bug déjà rencontré item 73).
      if (/"max_tokens":200(?!\d)/.test(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"stream":true')) {
        if (mainLegacyReplySSE) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: mainLegacyReplySSE }); return; }
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('<!DOCTYPE html><html><body><p>Legacy.</p></body></html>') });
        return;
      }
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'liens', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Liens TCC/Attachement', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
  return () => capturedEmitLiens;
}

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════════════════ 1. Génération réelle Liens structuré (carte de format) ═══════════════════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const getCaptured = baseRoutes(page, {});
    await page.goto('file://' + FILE);
    await page.click('#format-links');
    await page.fill('#clinical-question', 'Fais-moi une carte des liens entre TCC et théorie de l’attachement');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc || a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const art1 = await page.evaluate(() => {
      const [key, a] = Object.entries(window._adocArtifacts)[0];
      return { key, engine: a._adocGenerationEngine, doc: a._adocStructuredDoc || null };
    });
    log('1a. Liens transversaux a bien tenté le moteur structuré (payload emit_liens_document capturé)', getCaptured(), getCaptured());
    log('1b. Génération STRUCTURÉE aboutie SANS repli vers legacy', art1.engine === 'structured', art1);
    log('1c. documentKind du document produit est bien "liens"', art1.doc && art1.doc.documentKind === 'liens', art1.doc && art1.doc.documentKind);

    const openedWs = await page.evaluate((k) => window.adocOpenWorkspace(k), art1.key);
    log('1d. adocOpenWorkspace réussit avec le document Liens réellement généré', openedWs === true, openedWs);

    const cssInfo = await page.evaluate(() => {
      const docEl = document.querySelector('.adoc-sc-doc');
      return {
        hasLiensClass: !!docEl && docEl.classList.contains('adoc-sc-liens'),
        hasFicheClass: !!docEl && docEl.classList.contains('adoc-sc-fiche'),
        hasCarrouselClass: !!docEl && docEl.classList.contains('adoc-sc-carrousel'),
        hasScriptClass: !!docEl && docEl.classList.contains('adoc-sc-script'),
        hasTableauClass: !!docEl && docEl.classList.contains('adoc-sc-tableau'),
        coverBg: docEl ? getComputedStyle(document.querySelector('.adoc-sc-cover')).backgroundColor : null,
      };
    });
    log('2a. Le document rendu porte la classe adoc-sc-liens', cssInfo.hasLiensClass, cssInfo);
    log('2b. Le document rendu NE porte PAS adoc-sc-fiche (identité distincte)', !cssInfo.hasFicheClass, cssInfo);
    log('2c. Le document rendu NE porte PAS adoc-sc-carrousel (identité distincte)', !cssInfo.hasCarrouselClass, cssInfo);
    log('2d. Le document rendu NE porte PAS adoc-sc-script (identité distincte)', !cssInfo.hasScriptClass, cssInfo);
    log('2e. Le document rendu NE porte PAS adoc-sc-tableau (identité distincte)', !cssInfo.hasTableauClass, cssInfo);
    log('2f. La bannière utilise bien la couleur vert forêt dédiée (rgb(61, 92, 71))', cssInfo.coverBg === 'rgb(61, 92, 71)', cssInfo.coverBg);

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
    log('3a. Édition directe du TITRE de bannière synchronisée vers doc.title (Liens)', afterEdit.title === 'Titre modifié à la main', afterEdit);

    const bodyEditable = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts)[0];
      return !!(a._adocCapabilities && a._adocCapabilities.blockEditing);
    });
    log('3b. blockEditing activé pour ce document Liens structuré (édition de corps disponible)', bodyEditable, bodyEditable);

    log('4. Aucune erreur JS sur tout le scénario Liens structuré', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 5. Non-régression Fiche/Carrousel/Script/Tableau (rendu direct) ═══════════════════════════════
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
    const tableauDoc = mk('tableau', [{ id: 't-01', type: 'table', content: { headers: ['A', 'B'], rows: [['1', '2']] }, citationIds: [], validation: {} }]);
    const res = await page.evaluate(async (docs) => {
      const snap = (id) => ({ sourceSnapshotId: id, entries: [] });
      const f = await window.adocRenderClinicalDocument(docs.fiche, snap('snap-fiche'), null);
      const c = await window.adocRenderClinicalDocument(docs.carrousel, snap('snap-carrousel'), null);
      const s = await window.adocRenderClinicalDocument(docs.script, snap('snap-script'), null);
      const t = await window.adocRenderClinicalDocument(docs.tableau, snap('snap-tableau'), null);
      return {
        ficheHasFicheClass: f.html.includes('adoc-sc-fiche'), ficheHasLiensClass: f.html.includes('adoc-sc-liens'),
        carrouselHasCarrouselClass: c.html.includes('adoc-sc-carrousel'),
        scriptHasScriptClass: s.html.includes('adoc-sc-script'), scriptHasLiensClass: s.html.includes('adoc-sc-liens'),
        tableauHasTableauClass: t.html.includes('adoc-sc-tableau'), tableauHasLiensClass: t.html.includes('adoc-sc-liens'),
        ficheQc: f.qc.blocking.length, carrouselQc: c.qc.blocking.length, scriptQc: s.qc.blocking.length, tableauQc: t.qc.blocking.length,
      };
    }, { fiche: ficheDoc, carrousel: carrouselDoc, script: scriptDoc, tableau: tableauDoc });
    log('5a. Fiche continue de produire adoc-sc-fiche (capacité inchangée)', res.ficheHasFicheClass, res);
    log('5b. Fiche ne produit jamais adoc-sc-liens (aucune contamination croisée)', !res.ficheHasLiensClass, res);
    log('5c. Carrousel continue de produire adoc-sc-carrousel (capacité inchangée)', res.carrouselHasCarrouselClass, res);
    log('5d. Script continue de produire adoc-sc-script (capacité inchangée)', res.scriptHasScriptClass, res);
    log('5e. Script ne produit jamais adoc-sc-liens (aucune contamination croisée)', !res.scriptHasLiensClass, res);
    log('5f. Tableau continue de produire adoc-sc-tableau (capacité inchangée)', res.tableauHasTableauClass, res);
    log('5g. Tableau ne produit jamais adoc-sc-liens (aucune contamination croisée)', !res.tableauHasLiensClass, res);
    log('5h. Fiche/Carrousel/Script/Tableau : aucun blocage QC introduit par ce lot', res.ficheQc === 0 && res.carrouselQc === 0 && res.scriptQc === 0 && res.tableauQc === 0, res);
    log('6. Aucune erreur JS (non-régression Fiche/Carrousel/Script/Tableau)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 7. Régression #6 — pas de duplication ═══════════════════════════════
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
    log('7a. adocRenderBlockHTML — une seule déclaration', countDecl('adocRenderBlockHTML') === 1, countDecl('adocRenderBlockHTML'));
    log('7b. adocRenderLiensHTML — une seule déclaration', countDecl('adocRenderLiensHTML') === 1, countDecl('adocRenderLiensHTML'));
    log('7c. adocRenderFicheHTML / adocRenderScriptHTML / adocRenderTableauHTML — non touchées, une seule déclaration chacune', countDecl('adocRenderFicheHTML') === 1 && countDecl('adocRenderScriptHTML') === 1 && countDecl('adocRenderTableauHTML') === 1, { fiche: countDecl('adocRenderFicheHTML'), script: countDecl('adocRenderScriptHTML'), tableau: countDecl('adocRenderTableauHTML') });
    log('7d. adocGenerateStructuredDocument — une seule déclaration (orchestrateur générique)', countDecl('adocGenerateStructuredDocument') === 1, countDecl('adocGenerateStructuredDocument'));
    log('7e. ADOC_STRUCTURED_LIENS_TOOL — une seule déclaration', countConst('ADOC_STRUCTURED_LIENS_TOOL') === 1, countConst('ADOC_STRUCTURED_LIENS_TOOL'));
    log('7f. Les deux interrupteurs liens sont activés ENSEMBLE (pas de piège item 72)', /liens:\s*true\s*\}/.test(src.match(/adocStructuredGenerationWiredByDocumentKind = \{[^}]*\}/)[0]) && /liens:\s*'structured'\s*\}/.test(src.match(/rendererModeByDocumentKind = \{[^}]*\}/)[0]), true);
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== RÉSULTATS ITEM 74 CONSTRUCTION ===');
  results.forEach(([label, ok]) => console.log((ok ? '✅' : '❌') + ' ' + label));
  console.log('\nTotal: ' + results.length + ' | Réussis: ' + (results.length - failed.length) + ' | Échoués: ' + failed.length);
  if (failed.length) {
    console.log('\n--- DÉTAILS DES ÉCHECS ---');
    failed.forEach(([label, , extra]) => console.log(label + ' :: ' + JSON.stringify(extra)));
    process.exit(1);
  }
})();
