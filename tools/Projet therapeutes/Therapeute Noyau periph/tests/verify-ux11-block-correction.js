// UX-11 — Correction ciblée d'un bloc (première version, portée limitée à la Fiche synthèse
// structurée). Couvre les 6 scénarios obligatoires :
//   1. sélection d'un bloc + correction par bouton d'intention + aperçu + confirmer
//      → exactement CE bloc change, tous les autres restent strictement identiques (byte-for-byte).
//   2. même scénario via le champ de texte libre.
//   3. annuler après aperçu → AUCUN changement dans le document.
//   4. édition mineure → citationIds/validation inchangés ; édition substantielle OU
//      "Vérifier les sources" → citationReviewRequired:true.
//   5. la confirmation crée une VRAIE nouvelle version via /clinical-documents/:id/versions
//      (mécanisme UX-10A mocké), l'ancienne version reste accessible (mécanisme Worker existant).
//   6. un document legacy-html (blockEditing:false) n'offre AUCUNE interaction de sélection.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

// Doc structuré déterministe : 1 heading + 2 paragraphes (dont un avec citations) + 1 liste.
// Champs conformes au vocabulaire réel de ADOC_STRUCTURED_FICHE_TOOL (jamais un champ inventé).
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
  const inputJson = JSON.stringify(input);
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 100 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: toolName, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

async function setupPage(browser, { blockCorrectionResponder, versionsState } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const state = versionsState || { createCount: 0, versionCount: 0, created: null, versions: [] };
  const SERVER_DOC_ID = 'clindoc-ux11-001';

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
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: SERVER_DOC_ID, version_id: vid, previous_version_id: state.versions[state.versions.length - 2].version_id, created_at: new Date().toISOString() }) });
      return;
    }
    if (url.endsWith('/clinical-documents/' + SERVER_DOC_ID + '/versions') && method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versions: state.versions.map(v => ({ version_id: v.version_id })) }) });
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
      if (p.tool_choice && p.tool_choice.type === 'auto') { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors, state, SERVER_DOC_ID };
}

async function deliverStructuredArtifact(page) {
  return page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('Fais-moi une fiche sur les cavaliers de Gottman', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    return await window.adocDeliverStructuredFicheArtifact(structured.doc, structured.sourceSnapshot, rendered, null);
  }, { chunks: MOCK_RAG_CHUNKS });
}

async function deliverLegacyArtifact(page) {
  // Repli legacy-html — adocDeliverArtifact() n'est pas exposée sur window (fonction interne,
  // appelée par adocHandleReply/adocFinalizeGeneration) : reconstruit ici directement l'entrée
  // _adocArtifacts avec exactement l'enveloppe que produit adocFinalizeGeneration pour ce moteur
  // (mêmes champs, cf. ligne ~4634), pour isoler ce scénario sans repasser par tout le pipeline
  // de génération conversationnelle.
  return page.evaluate(() => {
    const storeKey = 'adocArt_legacy_' + Date.now();
    const html = '<div class="adoc-sc-block adoc-sc-paragraph" id="paragraph-01">Contenu figé.</div>';
    if (!window._adocArtifacts) window._adocArtifacts = {};
    window._adocArtifacts[storeKey] = {
      html, name: 'doc-repli', fmt: 'html',
      _adocGenerationEngine: 'legacy-html',
      _adocLegacySourceSnapshot: null,
      _adocDocumentKind: 'fiche',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: false, blockEditing: false, transform: false, export: true, qualityControlledExport: false },
    };
    return storeKey;
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 1 — sélection + bouton d'intention + aperçu + confirmer
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, state } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: "Le mépris demeure, selon Gottman, l'indicateur le plus fiable d'une rupture à venir." }),
    });
    const storeKey = await deliverStructuredArtifact(page);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);

    // Document déjà enregistré UNE fois avant la correction (cas réaliste — le mécanisme UX-10A
    // existant crée le document au premier Enregistrer) : la confirmation de correction doit
    // alors emprunter la branche "nouvelle version" (POST .../versions), jamais recréer un
    // second document.
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(200);
    log('0. Pré-condition — document déjà enregistré une première fois (createCount===1)', state.createCount === 1);

    const beforeBlocks = await page.evaluate((sk) => JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc.blocks), storeKey);
    const originalCitationIds = await page.evaluate((sk) => JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].citationIds || []), storeKey);

    // Capacité correctement exposée + bloc cliquable.
    const cap = await page.evaluate((sk) => window._adocArtifacts[sk]._adocCapabilities.blockEditing, storeKey);
    log('1a. blockEditing:true pour un document structuré', cap === true);
    const editableClass = await page.evaluate(() => document.getElementById('cc-ws-doc-card').classList.contains('cc-ws-block-editable'));
    log('1b. classe cc-ws-block-editable posée sur le conteneur', editableClass === true);

    // Clique sur le 2e bloc (paragraphe cité "paragraph-02"), vérifie sélection visuelle + panneau.
    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    const afterClick = await page.evaluate(() => ({
      selected: document.getElementById('paragraph-02').classList.contains('is-selected'),
      panelPresent: !!document.querySelector('.cc-block-edit-panel'),
      buttonLabels: Array.from(document.querySelectorAll('.cc-block-edit-panel .cc-clarity-reply-btn')).map(el => el.textContent),
      freeTextPresent: !!document.querySelector('.cc-block-edit-panel .cc-block-edit-freetext'),
    }));
    log('1c. Un seul bloc sélectionné (classe is-selected posée)', afterClick.selected === true);
    // Lot "barre d'outils de personnalisation" — le panneau a été ÉTENDU (Insérer un bloc
    // avant/après, mêmes boutons cc-clarity-reply-btn) plutôt que remplacé : les 4 boutons
    // d'intention doivent rester présents, dans le même ordre, EN PLUS des nouveaux — jamais
    // un test figé sur un total exact qui casserait à chaque extension légitime du panneau.
    log('1d. Panneau de correction affiché avec les 4 boutons d\'intention (parmi d\'éventuels autres, panneau étendu)', JSON.stringify(afterClick.buttonLabels.slice(0, 4)) === JSON.stringify(['Réécrire', 'Raccourcir', 'Développer', 'Vérifier les sources']));
    log('1e. Champ de texte libre présent AU MÊME NIVEAU (jamais les boutons seuls)', afterClick.freeTextPresent === true);

    // Clique "Réécrire" → appel ciblé → aperçu avant/après avec Confirmer/Annuler.
    await page.click('.cc-block-edit-panel .cc-clarity-reply-btn');
    await page.waitForTimeout(200);
    const preview = await page.evaluate(() => {
      const r = document.querySelector('.cc-block-edit-result');
      return {
        hasBefore: !!r.querySelector('.cc-block-edit-before .cc-block-edit-text'),
        hasAfter: !!r.querySelector('.cc-block-edit-after .cc-block-edit-text'),
        beforeText: r.querySelector('.cc-block-edit-before .cc-block-edit-text')?.textContent,
        afterText: r.querySelector('.cc-block-edit-after .cc-block-edit-text')?.textContent,
        hasConfirm: !!r.querySelector('button[onclick*="adocConfirmBlockCorrection"]') || !!document.querySelector('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]'),
        hasCancel: !!document.querySelector('.cc-block-edit-panel button[onclick*="adocCancelBlockCorrection"]'),
      };
    });
    log('2a. Aperçu affiche le texte AVANT (original)', preview.beforeText === "Le mépris est le prédicteur le plus fiable de rupture selon Gottman.");
    log('2b. Aperçu affiche le texte APRÈS (corrigé)', preview.afterText === "Le mépris demeure, selon Gottman, l'indicateur le plus fiable d'une rupture à venir.");
    log('2c. Boutons Confirmer et Annuler tous deux présents', preview.hasConfirm && preview.hasCancel);

    // Le document n'a PAS encore changé avant le clic sur Confirmer.
    const stillUnchanged = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].content.text, storeKey);
    log('2d. Rien ne change tant que "Confirmer" n\'a pas été cliqué', stillUnchanged === "Le mépris est le prédicteur le plus fiable de rupture selon Gottman.");

    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(300);

    const afterBlocks = await page.evaluate((sk) => JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc.blocks), storeKey);
    const beforeArr = JSON.parse(beforeBlocks), afterArr = JSON.parse(afterBlocks);
    let onlyOneChanged = beforeArr.length === afterArr.length;
    let changedCount = 0;
    for (let i = 0; i < beforeArr.length; i++) { if (JSON.stringify(beforeArr[i]) !== JSON.stringify(afterArr[i])) changedCount++; }
    log('3a. Exactement UN bloc a changé, tous les autres restent byte-identiques', changedCount === 1);
    log('3b. Le bloc modifié est bien celui sélectionné (paragraph-02)', afterArr[1].id === 'paragraph-02' && afterArr[1].content.text === "Le mépris demeure, selon Gottman, l'indicateur le plus fiable d'une rupture à venir.");
    log('3c. Nouvelle version créée via /clinical-documents/:id/versions (mécanisme UX-10A réel)', state.versionCount === 1);
    log('3d. Historique conserve BIEN 2 versions (ancienne + nouvelle), l\'ancienne reste accessible', state.versions.length === 2 && state.versions[0].content.clinicalDocument.blocks[1].content.text === "Le mépris est le prédicteur le plus fiable de rupture selon Gottman.");
    log('3e. Aucune erreur JS levée', errors.length === 0);
    if (errors.length) console.log('  erreurs:', errors);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 2 — même chose via le champ de texte libre
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, state } = await setupPage(browser, {
      blockCorrectionResponder: (p) => {
        const userMsg = (p.messages && p.messages[0] && p.messages[0].content) || '';
        return { text: 'Version reformulée via demande libre : ' + userMsg.slice(0, 20) };
      },
    });
    const storeKey = await deliverStructuredArtifact(page);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.adocWsSave()); // document déjà enregistré une première fois (cf. scénario 1)
    await page.waitForTimeout(200);

    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    await page.fill('.cc-block-edit-panel .cc-block-edit-freetext', 'Rends ce passage plus percutant');
    await page.click('.cc-block-edit-panel .cc-clarity-other-btn');
    await page.waitForTimeout(200);

    const preview = await page.evaluate(() => document.querySelector('.cc-block-edit-result .cc-block-edit-after .cc-block-edit-text')?.textContent);
    log('4a. Champ libre déclenche bien un appel ciblé avec la demande formulée', (preview || '').includes('Version reformulée via demande libre'));

    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(300);
    const newText = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].content.text, storeKey);
    log('4b. Confirmer via le champ libre modifie bien le document', (newText || '').includes('Version reformulée via demande libre'));
    log('4c. Nouvelle version créée (même mécanisme, quel que soit le chemin de saisie)', state.versionCount === 1);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 3 — annuler après aperçu → AUCUN changement
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, state } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: 'Ce texte ne doit JAMAIS apparaître dans le document (annulé).' }),
    });
    const storeKey = await deliverStructuredArtifact(page);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    const before = await page.evaluate((sk) => JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc.blocks), storeKey);

    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel .cc-clarity-reply-btn'); // "Réécrire"
    await page.waitForTimeout(200);
    await page.click('.cc-block-edit-panel button[onclick*="adocCancelBlockCorrection"]');
    await page.waitForTimeout(150);

    const after = await page.evaluate((sk) => JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc.blocks), storeKey);
    log('5a. Annuler après aperçu — document strictement identique (byte-for-byte)', before === after);
    log('5b. Panneau et sélection nettoyés après annulation', await page.evaluate(() => !document.querySelector('.cc-block-edit-panel') && !document.querySelector('.is-selected')));
    log('5c. Aucune sauvegarde déclenchée par une annulation', state.versionCount === 0 && state.createCount === 0);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 4 — mineur garde citations ; substantiel/Vérifier-sources marque à vérifier
  // ══════════════════════════════════════════════════════════════════════
  {
    // 4a. Édition MINEURE (similarité élevée) sur le bloc CITÉ (paragraph-02, citationEntryIds:['entry-1'])
    const { page, errors } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: "Le mépris est le prédicteur le plus fiable de la rupture, selon Gottman." }), // quasi identique
    });
    const storeKey = await deliverStructuredArtifact(page);
    const originalValidation = await page.evaluate((sk) => JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].validation || null), storeKey);
    const originalCitationIds = await page.evaluate((sk) => JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].citationIds || []), storeKey);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel .cc-clarity-reply-btn'); // Réécrire
    await page.waitForTimeout(200);
    const flagShownMinor = await page.evaluate(() => !!document.querySelector('.cc-block-edit-flag'));
    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(300);
    const afterMinor = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1], storeKey);
    log('6a. Édition MINEURE — aucun avertissement "à vérifier" affiché dans l\'aperçu', flagShownMinor === false);
    log('6b. Édition MINEURE — citationIds inchangés', JSON.stringify(afterMinor.citationIds || []) === originalCitationIds);
    log('6c. Édition MINEURE — validation.citationReviewRequired absent/false', !afterMinor.validation || !afterMinor.validation.citationReviewRequired);
    await page.close();
  }
  {
    // 4b. Édition SUBSTANTIELLE (texte complètement différent) sur le même bloc cité
    const { page, errors } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: "Un tout autre sujet, totalement déconnecté du contenu original et de ses sources." }),
    });
    const storeKey = await deliverStructuredArtifact(page);
    const originalCitationIds = await page.evaluate((sk) => JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].citationIds || []), storeKey);
    log('7z. Pré-condition — le bloc cité porte bien au moins une citation résolue (sinon le test ne prouve rien)', JSON.parse(originalCitationIds).length > 0);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel .cc-clarity-reply-btn');
    await page.waitForTimeout(200);
    const flagShownSubstantial = await page.evaluate(() => !!document.querySelector('.cc-block-edit-flag'));
    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(300);
    const afterSubstantial = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1], storeKey);
    log('7a. Édition SUBSTANTIELLE — avertissement "à vérifier" affiché dans l\'aperçu AVANT confirmation', flagShownSubstantial === true);
    log('7b. Édition SUBSTANTIELLE — citationIds ORIGINAUX conservés (jamais une citation modifiée elle-même)', JSON.stringify(afterSubstantial.citationIds || []) === originalCitationIds);
    log('7c. Édition SUBSTANTIELLE — validation.citationReviewRequired:true (marqué à vérifier)', afterSubstantial.validation && afterSubstantial.validation.citationReviewRequired === true);
    // La validation Worker/schéma doit accepter citationReviewRequired (round-trip via validation existante).
    await page.close();
  }
  {
    // 4c. "Vérifier les sources" — TOUJOURS marqué à vérifier, même si le texte change à peine.
    const { page } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: "Le mépris est le prédicteur le plus fiable de rupture selon Gottman." }), // texte quasi identique au texte source
    });
    const storeKey = await deliverStructuredArtifact(page);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    await page.click('#paragraph-02');
    await page.waitForTimeout(100);
    const buttons = await page.$$('.cc-block-edit-panel .cc-clarity-reply-btn');
    await buttons[3].click(); // "Vérifier les sources"
    await page.waitForTimeout(200);
    const flagShown = await page.evaluate(() => !!document.querySelector('.cc-block-edit-flag'));
    log('8a. "Vérifier les sources" marque TOUJOURS à vérifier, même si le texte est quasi inchangé', flagShown === true);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 6 — document legacy-html : AUCUNE interaction de sélection
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors } = await setupPage(browser);
    const storeKey = await deliverLegacyArtifact(page);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);

    const legacyState = await page.evaluate(() => ({
      editableClass: document.getElementById('cc-ws-doc-card').classList.contains('cc-ws-block-editable'),
      onclickIsNull: document.getElementById('cc-ws-doc-card').onclick === null,
    }));
    log('9a. blockEditing:false pour un document legacy-html', await page.evaluate((sk) => window._adocArtifacts[sk]._adocCapabilities.blockEditing, storeKey) === false);
    log('9b. Classe cc-ws-block-editable JAMAIS posée', legacyState.editableClass === false);
    log('9c. docCard.onclick reste null (aucune délégation de clic)', legacyState.onclickIsNull === true);

    await page.click('#paragraph-02').catch(() => {});
    await page.waitForTimeout(100);
    const noInteraction = await page.evaluate(() => ({
      noSelection: !document.querySelector('.is-selected'),
      noPanel: !document.querySelector('.cc-block-edit-panel'),
    }));
    log('9d. Aucune classe .is-selected appliquée après clic sur un bloc', noInteraction.noSelection === true);
    log('9e. Aucun panneau de correction ne peut apparaître', noInteraction.noPanel === true);
    log('9f. Aucune erreur JS levée sur ce document de repli', errors.length === 0);

    await page.close();
  }

  console.log('=== Résultats — UX-11 Correction ciblée d\'un bloc ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'ÉCHEC ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '— failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
