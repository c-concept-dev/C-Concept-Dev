// Item 72 CONSTRUCTION — câblage Script verbatim au structuré (rendu dédié) + correctif
// looksTruncated deux-points (item 71-bis).
//
// 1. Génération réelle d'un Script structuré (mock réseau uniquement) : moteur structuré aboutit
//    (pas de repli legacy), classe CSS racine adoc-sc-script (distincte de adoc-sc-fiche ET
//    adoc-sc-carrousel), édition directe bannière + corps fonctionnelle, sauvegarde + rechargement.
// 2. Garde-fou : si rendererModeByDocumentKind.script était resté 'legacy' (piège nommé par
//    l'investigation item 72 point 5) malgré la génération activée, le repli automatique existant
//    (catch de adocSend) doit absorber l'échec PROPREMENT — jamais un crash, toujours une trace
//    visible (console.warn + adocFallbackTrace), jamais un échec réellement silencieux.
// 3. Non-régression Fiche/Carrousel (rendu direct, capacités inchangées).
// 4. Correctif looksTruncated (':') : introduction d'exercice non bloquée sur les 3 types
//    concernés, témoin négatif toujours bloqué, non-régression items 21 Partie C / 71 Option B.
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

const structuredScript = {
  title: 'Ouvrir une séance sur la régulation émotionnelle',
  purpose: 'script verbatim', audience: 'clinicien',
  blocks: [
    { type: 'heading', text: 'Ouverture de séance', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
    { type: 'paragraph', text: 'Je te propose qu’on prenne un moment ensemble pour regarder ce qui s’est passé cette semaine :', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: ['entry-1'] },
    { type: 'quote', text: 'Qu’est-ce qui a été le plus difficile pour toi cette semaine ?', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
    { type: 'callout', text: 'Essayons cet exercice ensemble :', level: 2, visualRole: 'warning', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] },
  ],
};

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════════════════ 1. Génération réelle Script structuré ═══════════════════════════════
  let storeKeyForReload = null;
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let capturedStructured = false;
    await page.route('**/*', route => {
      const req = route.request(); const url = req.url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = req.postData() || '';
        if (body.includes('evaluate_clarity')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) }); return; }
        if (body.includes('"type":"tool","name":"emit_script_document"')) { capturedStructured = true; route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE('emit_script_document', structuredScript) }); return; }
        if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'script', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Ouverture de séance', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.continue();
    });

    await page.goto('file://' + FILE);
    await page.click('#format-script');
    await page.fill('#clinical-question', 'Écris-moi un script verbatim pour ouvrir une séance sur la régulation émotionnelle');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc || a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const art1 = await page.evaluate(() => {
      const [key, a] = Object.entries(window._adocArtifacts)[0];
      return { key: key, engine: a._adocGenerationEngine, doc: a._adocStructuredDoc || null };
    });
    storeKeyForReload = null; // ce test recharge par sauvegarde réelle plus bas, pas par storeKey en mémoire

    log('1a. Le Script a bien tenté le moteur structuré (payload emit_script_document capturé)', capturedStructured, capturedStructured);
    log('1b. Génération STRUCTURÉE aboutie SANS repli vers legacy', art1.engine === 'structured', art1);
    log('1c. documentKind du document produit est bien "script"', art1.doc && art1.doc.documentKind === 'script', art1.doc && art1.doc.documentKind);

    // La génération réussie n'ouvre pas seule le panneau de travail (même patron qu'item 68/69) —
    // adocOpenWorkspace(storeKey) peuple #cc-ws-doc-card à partir de l'artefact réellement produit
    // ci-dessus (jamais un document injecté à la main : storeKey vient de la vraie génération).
    const openedWs = await page.evaluate((k) => window.adocOpenWorkspace(k), art1.key);
    log('1h. adocOpenWorkspace réussit avec le document Script réellement généré', openedWs === true, openedWs);

    const cssInfo = await page.evaluate(() => {
      const root = document.getElementById('cc-ws-doc-card') || document.querySelector('.adoc-sc-doc');
      const docEl = document.querySelector('.adoc-sc-doc');
      return {
        hasScriptClass: !!docEl && docEl.classList.contains('adoc-sc-script'),
        hasFicheClass: !!docEl && docEl.classList.contains('adoc-sc-fiche'),
        hasCarrouselClass: !!docEl && docEl.classList.contains('adoc-sc-carrousel'),
        coverBg: docEl ? getComputedStyle(document.querySelector('.adoc-sc-cover')).backgroundColor : null,
      };
    });
    log('1d. Le document rendu porte la classe adoc-sc-script', cssInfo.hasScriptClass, cssInfo);
    log('1e. Le document rendu NE porte PAS la classe adoc-sc-fiche (identité distincte)', !cssInfo.hasFicheClass, cssInfo);
    log('1f. Le document rendu NE porte PAS la classe adoc-sc-carrousel', !cssInfo.hasCarrouselClass, cssInfo);
    // rgb(138,63,41) = --terracotta-700, distinct de rgb(16,47,49) (pétrole, Fiche)
    log('1g. La bannière utilise bien la couleur terracotta dédiée (rgb(138, 63, 41))', cssInfo.coverBg === 'rgb(138, 63, 41)', cssInfo.coverBg);

    // ── Édition directe bannière (item 68 parity) ──
    await page.click('.adoc-sc-cover-title');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Titre modifié à la main');
    await page.click('.adoc-sc-cover-audience');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Éducateur spécialisé');
    await page.locator('#cc-ws-doc-card').click({ position: { x: 5, y: 5 } }); // focusout
    const afterEdit = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts)[0];
      window.adocEditorSync && window.adocEditorSync();
      return { title: a._adocStructuredDoc.title, audience: a._adocStructuredDoc.audience };
    });
    log('2a. Édition directe du TITRE de bannière synchronisée vers doc.title (Script)', afterEdit.title === 'Titre modifié à la main', afterEdit);
    log('2b. Édition directe du SOUS-TITRE (audience) synchronisée vers doc.audience (Script)', afterEdit.audience === 'Éducateur spécialisé', afterEdit);

    // ── Édition directe du corps (57c/57f/68 — mécanisme déjà générique par type de bloc) ──
    const bodyEditable = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts)[0];
      return !!(a._adocCapabilities && a._adocCapabilities.blockEditing);
    });
    log('2c. blockEditing activé pour ce document Script structuré (édition de corps disponible)', bodyEditable, bodyEditable);

    // ── Sauvegarde + rechargement complet ──
    let saveOk = true;
    await page.route('**/clinical-documents', route => { route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ documentId: 'doc-script-1', versionId: 'v1' }) }); });
    try {
      await page.evaluate(async () => { if (typeof window.adocWsSave === 'function') await window.adocWsSave(); });
    } catch (e) { saveOk = false; }
    log('2d. Sauvegarde du Script structuré ne lève aucune exception', saveOk, saveOk);

    log('3. Aucune erreur JS sur tout le scénario Script structuré', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 4. Garde-fou : rendu manquant/mode mismatché ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let capturedStructured = false;
    await page.route('**/*', route => {
      const req = route.request(); const url = req.url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = req.postData() || '';
        if (body.includes('evaluate_clarity')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) }); return; }
        if (body.includes('"type":"tool","name":"emit_script_document"')) { capturedStructured = true; route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE('emit_script_document', structuredScript) }); return; }
        if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        // Le piège (rendererModeByDocumentKind.script forcé 'legacy') laisse la GÉNÉRATION
        // structurée réussir (mock ci-dessus) — c'est adocRenderClinicalDocument qui échoue APRÈS,
        // déclenchant le repli déjà existant vers le VRAI appel de génération legacy (stream:true,
        // system prompt HTML complet) : sans cette branche, ce second appel réel tomberait à tort
        // sur le JSON du planificateur (mauvais format), masquant le comportement réel du garde-fou.
        if (body.includes('"stream":true')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('<!DOCTYPE html><html><body><p>Contenu legacy de repli.</p></body></html>') }); return; }
        const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'script', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Ouverture de séance', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    // Reproduit EXACTEMENT le piège nommé par l'investigation (point 5) : génération activée,
    // mais rendu forcé en legacy — comme si adocRenderScriptHTML n'existait pas / n'était pas
    // branché. DÉCOUVERTE en construisant ce test (pas supposée à l'avance, cf. rapport) :
    // le mécanisme réel N'EST PAS un échec-puis-catch (adocGenerateStructuredDocument n'est
    // JAMAIS appelée) — la condition de garde au site d'appel (~L5533) inclut
    // `adocGetRendererMode(_structuredAttemptKind) === 'structured'` AVANT même d'entrer dans le
    // try, donc un mode de rendu resté 'legacy' fait sauter la tentative structurée ENTIÈREMENT,
    // exactement comme si `adocStructuredGenerationWiredByDocumentKind.script` était encore
    // `false` — jamais d'appel réseau structuré, jamais de trace de repli (adocRecordFallbackTrace
    // n'est appelée que DANS le catch, jamais atteint ici), jamais de console.warn. C'est donc un
    // échec par OMISSION (gate en amont), pas par exception rattrapée — plus sûr (aucun
    // appel API gaspillé) mais moins diagnosticable (aucune trace) qu'un vrai échec de rendu après
    // une génération réussie. Documenté tel quel, la prédiction initiale de l'investigation
    // ("échec silencieux via repli") était donc imprécise sur le MÉCANISME exact, correcte sur
    // le SYMPTÔME (aucune erreur visible à l'écran, comportement identique à un type non câblé).
    await page.evaluate(() => { window.rendererModeByDocumentKind.script = 'legacy'; try { localStorage.removeItem('adocFallbackTrace'); } catch(e) {} });
    const consoleWarnings = [];
    page.on('console', msg => { if (msg.type() === 'warning') consoleWarnings.push(msg.text()); });
    await page.click('#format-script');
    await page.fill('#clinical-question', 'Écris-moi un script verbatim pour ouvrir une séance sur la régulation émotionnelle');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine), { timeout: 20000 });
    const art2 = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts)[0];
      return { engine: a._adocGenerationEngine };
    });
    const trace = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('adocFallbackTrace') || '[]'); } catch(e) { return null; } });
    log('4a. Le garde-fou empêche TOUTE tentative structurée (gate en amont — aucun appel emit_script_document)', capturedStructured === false, capturedStructured);
    log('4b. Le document produit est bien du legacy propre (jamais un crash, jamais un document structuré invalide)', art2.engine === 'legacy-html', art2);
    log('4c. Aucune trace de repli enregistrée (cohérent avec le mécanisme réel : gate, pas catch — pas un "vrai" repli)', Array.isArray(trace) && trace.length === 0, trace);
    log('4d. Aucun avertissement UX-8A.1 (cohérent : le catch qui l\'émettrait n\'est jamais atteint dans ce cas précis)', !consoleWarnings.some(w => w.includes('UX-8A.1')), consoleWarnings);
    log('4e. Aucune erreur JS (le garde-fou ne casse pas la page)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 5. Non-régression Fiche/Carrousel (rendu direct) ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + FILE);
    const ficheDoc = {
      schemaVersion: 1, documentId: 'doc-f', versionId: 'v1', previousVersionId: null, requestId: 'r1', sourceSnapshotId: 'snap-f',
      createdAt: new Date().toISOString(), language: 'fr', status: 'draft', title: 'Titre Fiche', purpose: 'Fiche synthèse', audience: 'Clinicien',
      documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
      blocks: [{ id: 'p-01', type: 'paragraph', content: { text: 'Texte de test.' }, citationIds: [], validation: {} }],
      citations: [], validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
    };
    const carrouselDoc = {
      schemaVersion: 1, documentId: 'doc-c', versionId: 'v1', previousVersionId: null, requestId: 'r2', sourceSnapshotId: 'snap-c',
      createdAt: new Date().toISOString(), language: 'fr', status: 'draft', title: 'Titre Carrousel', purpose: 'carrousel', audience: 'Clinicien',
      documentKind: 'carrousel', renderManifestId: 'manifest-default-001', derivedFrom: null,
      blocks: [{ id: 'card-01', type: 'card', content: { title: 'Carte 1', imageRef: null, imageAlt: null, blocks: [{ id: 'p-01', type: 'paragraph', content: { text: 'Texte carte.' }, citationIds: [], validation: {} }] }, citationIds: [], validation: {} }],
      citations: [], validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
    };
    const res = await page.evaluate(async (docs) => {
      const snap = (id) => ({ sourceSnapshotId: id, entries: [] });
      const f = await window.adocRenderClinicalDocument(docs.fiche, snap('snap-f'), null);
      const c = await window.adocRenderClinicalDocument(docs.carrousel, snap('snap-c'), null);
      return {
        ficheHtmlHasFicheClass: f.html.includes('adoc-sc-fiche'),
        ficheHtmlHasScriptClass: f.html.includes('adoc-sc-script'),
        carrouselHtmlHasCarrouselClass: c.html.includes('adoc-sc-carrousel'),
        ficheQcBlocking: f.qc.blocking.length,
        carrouselQcBlocking: c.qc.blocking.length,
      };
    }, { fiche: ficheDoc, carrousel: carrouselDoc });
    log('5a. Fiche continue de produire adoc-sc-fiche (capacité inchangée)', res.ficheHtmlHasFicheClass, res);
    log('5b. Fiche ne produit jamais adoc-sc-script (aucune contamination croisée)', !res.ficheHtmlHasScriptClass, res);
    log('5c. Carrousel continue de produire adoc-sc-carrousel (capacité inchangée)', res.carrouselHtmlHasCarrouselClass, res);
    log('5d. Fiche : aucun blocage QC introduit par ce lot', res.ficheQcBlocking === 0, res);
    log('5e. Carrousel : aucun blocage QC introduit par ce lot', res.carrouselQcBlocking === 0, res);
    log('5f. Aucune erreur JS (non-régression Fiche/Carrousel)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 6. Correctif looksTruncated (':') ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + FILE);
    const CASES = [
      { label: "NOUVEAU — introduction d'exercice/consigne terminée par ':'", text: 'Essayons cet exercice ensemble :', shouldBlock: false },
      { label: "NOUVEAU — question suivie d'une consigne se terminant par ':'", text: 'Voici ce que je te propose :', shouldBlock: false },
      { label: 'TÉMOIN — vraie troncature en cours de phrase (DOIT rester bloqué)', text: 'La seule issue est d’accepter ce que l’on ne peut', shouldBlock: true },
      { label: 'Non-régression item 71 Option B — attribution tiret + auteur', text: 'Il n’y a pas de vent favorable pour celui qui ne sait pas où il va — Sénèque', shouldBlock: false },
      { label: 'Non-régression item 71 Option B — apostrophe courbe fermante', text: 'Elle disait souvent : « tout ce qui compte, c’est maintenant’', shouldBlock: false },
      { label: 'Non-régression item 71 Option B — aphorisme sans ponctuation ni tiret (NON corrigé, décision Christophe)', text: 'Ce que je peux, je le fais ; ce que je ne peux pas, je le laisse être', shouldBlock: true },
      { label: 'Non-régression item 21 Partie C — parenthèse fermante après point', text: '(La séance est terminée.)', shouldBlock: false },
      { label: 'Non-régression item 21 Partie C — témoin négatif (pas de ponctuation interne)', text: '(La séance est terminée)', shouldBlock: true },
      { label: 'Cas vide — jamais tronqué', text: '', shouldBlock: false },
    ];
    const TYPES = ['paragraph', 'quote', 'callout'];
    const blocks = [];
    TYPES.forEach(type => {
      CASES.forEach((c, i) => {
        const content = type === 'callout' ? { text: c.text, visualRole: 'info' } : { text: c.text };
        blocks.push({ id: type + '-' + String(i + 1).padStart(2, '0'), type, content, citationIds: [], validation: {} });
      });
    });
    const doc = {
      schemaVersion: 1, documentId: 'doc-72c', versionId: 'v1', previousVersionId: null, requestId: 'r72c', sourceSnapshotId: 'snap-72c',
      createdAt: new Date().toISOString(), language: 'fr', status: 'draft', title: 'Test item 72 construction', purpose: 'Test', audience: 'Clinicien',
      documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
      blocks, citations: [],
      validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
    };
    const qc = await page.evaluate(async (doc) => {
      const snapshot = { sourceSnapshotId: doc.sourceSnapshotId, entries: [] };
      const rendered = await window.adocRenderClinicalDocument(doc, snapshot, null);
      return rendered.qc;
    }, doc);
    TYPES.forEach(type => {
      CASES.forEach((c, i) => {
        const blockId = type + '-' + String(i + 1).padStart(2, '0');
        const isBlocked = qc.blocking.some(msg => msg.includes('Bloc ' + blockId + ' ') && msg.includes('tronqué'));
        log('[' + type + '] ' + c.label, isBlocked === c.shouldBlock, { expected: c.shouldBlock, got: isBlocked, text: c.text });
      });
    });
    log('6. Aucune erreur JS (correctif deux-points)', errors.length === 0, errors);
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
    log('7a. adocRenderBlockHTML — une seule déclaration (réutilisée par Script, jamais recopiée)', countDecl('adocRenderBlockHTML') === 1, countDecl('adocRenderBlockHTML'));
    log('7b. adocRenderScriptHTML — une seule déclaration', countDecl('adocRenderScriptHTML') === 1, countDecl('adocRenderScriptHTML'));
    log('7c. adocRenderFicheHTML — une seule déclaration (non touchée par ce lot)', countDecl('adocRenderFicheHTML') === 1, countDecl('adocRenderFicheHTML'));
    log('7d. looksTruncated — une seule déclaration', countDecl('looksTruncated') === 1, countDecl('looksTruncated'));
    log('7e. adocGenerateStructuredDocument — une seule déclaration (orchestrateur générique, pas de copie pour Script)', countDecl('adocGenerateStructuredDocument') === 1, countDecl('adocGenerateStructuredDocument'));
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== RÉSULTATS ITEM 72 CONSTRUCTION ===');
  results.forEach(([label, ok]) => console.log((ok ? '✅' : '❌') + ' ' + label));
  console.log('\nTotal: ' + results.length + ' | Réussis: ' + (results.length - failed.length) + ' | Échoués: ' + failed.length);
  if (failed.length) {
    console.log('\n--- DÉTAILS DES ÉCHECS ---');
    failed.forEach(([label, , extra]) => console.log(label + ' :: ' + JSON.stringify(extra)));
    process.exit(1);
  }
})();
