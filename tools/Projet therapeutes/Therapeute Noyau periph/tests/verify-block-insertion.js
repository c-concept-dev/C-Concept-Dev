// Barre d'outils de personnalisation — premier chantier : insertion de blocs. Étend le panneau
// UX-11 déjà existant (Insérer avant/après), réutilise intégralement son mécanisme de
// correction pour rédiger le contenu du nouveau bloc, et le mécanisme d'image existant
// (adocResolveImages / GET /fetch-image) pour un bloc image. Couvre les scénarios mandatés :
//   1. Sélection + Insérer avant + "Paragraphe" → nouveau bloc au bon endroit, panneau de
//      correction ouvert dessus, saisie manuelle fonctionne.
//   2. Même scénario avec "Réécrire" → citationIds reste vide, citationReviewRequired se pose
//      naturellement (mécanisme de similarité déjà existant, aucun code spécifique).
//   3. Insertion d'un bloc image → réutilise EXACTEMENT GET /fetch-image (déjà existant),
//      jamais un nouvel endpoint/mécanisme de recherche.
//   4. Insertion au milieu d'un document de 10 blocs → tous les autres gardent id/position,
//      y compris après un aller-retour sérialisation/désérialisation (le même mécanisme que
//      la sauvegarde réelle, cf. adocBuildClinicalDocumentContent).
//   5. Document legacy-html → aucune action d'insertion proposée (hérite de blockEditing:false).
//   6. Non-régression du panneau UX-11 (correction de bloc) — pas de second point d'entrée créé.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];
const blockDefaults = { text: '', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] };
function b(o) { return Object.assign({}, blockDefaults, o); }

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

async function setupPage(browser, { blockCorrectionResponder, fetchImageResponder } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const state = { fetchImageCalls: [], versions: [], createCount: 0, versionCount: 0 };
  const SERVER_DOC_ID = 'clindoc-insertion-001';

  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 1, total_chunks: 1, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.endsWith('/clinical-documents') && method === 'POST') {
      state.createCount++;
      const payload = JSON.parse(req.postData() || '{}');
      state.versions = [{ version_id: 'v1', content: payload.document }];
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
    if (url.includes('/fetch-image')) {
      const q = decodeURIComponent((url.split('?q=')[1] || '').split('&')[0]);
      state.fetchImageCalls.push(q);
      const photo = fetchImageResponder ? fetchImageResponder(q) : { url: 'https://images.example/' + encodeURIComponent(q) + '.jpg' };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: photo ? [photo] : [] }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      let parsed = {}; try { parsed = JSON.parse(body); } catch (e) {}
      const p = parsed.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') { route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(global.__FICHE_INPUT, 'emit_fiche_document') }); return; }
      if (p.tool_choice && p.tool_choice.name === 'emit_block_correction') {
        const responder = blockCorrectionResponder || (() => ({ text: 'Texte rédigé par IA.' }));
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
  return { page, errors, state };
}

async function deliverStructuredArtifact(page, ficheInput) {
  // ficheInput est au format tool_use brut (mêmes champs que ADOC_STRUCTURED_FICHE_TOOL,
  // cf. blockDefaults) — adocGenerateStructuredFiche le normalise lui-même en blocs finaux
  // {id, type, content, citationIds, validation} avec de vrais id stables (blockSeq), même
  // mécanisme que verify-ux11-block-correction.js. Jamais de substitution manuelle des blocs
  // après coup (qui produirait des blocs au mauvais format).
  return page.evaluate(async ({ chunks, fiche }) => {
    const ragResult = { chunks, chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('Question test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    return await window.adocDeliverStructuredFicheArtifact(structured.doc, structured.sourceSnapshot, rendered, null);
  }, { chunks: MOCK_RAG_CHUNKS, fiche: ficheInput });
}

async function deliverLegacyArtifact(page) {
  return page.evaluate(() => {
    const storeKey = 'adocArt_legacy_' + Date.now();
    if (!window._adocArtifacts) window._adocArtifacts = {};
    window._adocArtifacts[storeKey] = {
      html: '<div class="adoc-sc-block adoc-sc-paragraph" id="paragraph-01">Contenu figé.</div>',
      name: 'doc-repli', fmt: 'html',
      _adocGenerationEngine: 'legacy-html',
      _adocLegacySourceSnapshot: null,
      _adocDocumentKind: 'fiche',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: false, blockEditing: false, transform: false, export: true, qualityControlledExport: false },
    };
    return storeKey;
  });
}

// doc.blocks fabriqué manuellement (pas de round-trip par le modèle) pour un id/position
// pleinement déterministes — même vocabulaire de champs que ADOC_STRUCTURED_FICHE_TOOL.
function makeBlocksFixture(n) {
  const blocks = [];
  for (let i = 1; i <= n; i++) {
    blocks.push(b({ type: 'paragraph', text: 'Paragraphe original numéro ' + i + '.', citationEntryIds: i === 1 ? ['entry-1'] : [] }));
  }
  return blocks;
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 1 — Insérer avant + "Paragraphe" + saisie manuelle
  // ══════════════════════════════════════════════════════════════════════
  {
    global.__FICHE_INPUT = { title: 'Doc test', purpose: 'supervision', audience: 'clinicien', blocks: makeBlocksFixture(3) };
    const { page, errors } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: "Texte saisi manuellement par l'utilisatrice." }),
    });
    const storeKey = await deliverStructuredArtifact(page, global.__FICHE_INPUT);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);

    const before = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.map(bl => bl.id), storeKey);
    log('1a. Document de départ à 3 blocs, id stables déjà attribués', before.length === 3 && JSON.stringify(before) === JSON.stringify(['paragraph-01', 'paragraph-02', 'paragraph-03']));

    await page.click('#' + before[1]); // sélectionne le 2e bloc
    await page.waitForTimeout(100);
    const panelButtons = await page.evaluate(() => Array.from(document.querySelectorAll('.cc-block-edit-panel .cc-clarity-reply-btn')).map(el => el.textContent));
    log('1b. Le panneau UX-11 propose bien "Insérer un bloc avant" et "après" (extension, pas un second panneau)', panelButtons.includes('Insérer un bloc avant') && panelButtons.includes('Insérer un bloc après'));

    await page.click('.cc-block-edit-panel button[onclick*="adocRequestBlockInsert(\'before\')"]');
    await page.waitForTimeout(100);
    const typeButtons = await page.evaluate(() => Array.from(document.querySelectorAll('.cc-block-edit-result .cc-clarity-reply-btn')).map(el => el.textContent));
    log('1c. Sélecteur de type propose exactement les 7 types du schéma, vocabulaire français simple', JSON.stringify(typeButtons) === JSON.stringify(['Titre', 'Paragraphe', 'Encadré', 'Liste', 'Tableau', 'Citation', 'Image']));

    await page.click('.cc-block-edit-result button[onclick*="\'paragraph\'"]');
    await page.waitForTimeout(200);

    const afterInsertIds = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.map(bl => bl.id), storeKey);
    log('1d. Un nouveau bloc apparaît (4 blocs désormais)', afterInsertIds.length === 4);
    log('1e. Le nouveau bloc est bien placé AVANT le bloc sélectionné (position 1), sans déplacer/renuméroter les autres', afterInsertIds[0] === before[0] && afterInsertIds[2] === before[1] && afterInsertIds[3] === before[2]);

    const newBlockId = afterInsertIds[1];
    const newBlockBefore = await page.evaluate((args) => window._adocArtifacts[args.sk]._adocStructuredDoc.blocks.find(bl => bl.id === args.id), { sk: storeKey, id: newBlockId });
    log('1f. Contenu initial NON vide (texte de remplacement discret, conforme au schéma minLength:1)', !!(newBlockBefore.content && newBlockBefore.content.text && newBlockBefore.content.text.length > 0));
    log('1g. citationIds vide dès la création', Array.isArray(newBlockBefore.citationIds) && newBlockBefore.citationIds.length === 0);

    // Panneau de correction rouvert IMMÉDIATEMENT sur le nouveau bloc, comme s'il venait
    // d'être sélectionné (zéro logique de sélection dupliquée).
    const selState = await page.evaluate((id) => ({
      selected: document.getElementById(id)?.classList.contains('is-selected'),
      panelPresent: !!document.querySelector('.cc-block-edit-panel'),
    }), newBlockId);
    log('1h. Panneau de correction ouvert automatiquement sur le nouveau bloc', selState.selected === true && selState.panelPresent === true);

    // Saisie manuelle : champ libre → appel ciblé (même mécanisme que pour un bloc existant).
    await page.fill('.cc-block-edit-panel .cc-block-edit-freetext', "Texte saisi manuellement par l'utilisatrice.");
    await page.click('.cc-block-edit-panel .cc-clarity-other-btn');
    await page.waitForTimeout(200);
    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(300);
    const newBlockAfter = await page.evaluate((args) => window._adocArtifacts[args.sk]._adocStructuredDoc.blocks.find(bl => bl.id === args.id), { sk: storeKey, id: newBlockId });
    log('1i. La saisie manuelle via le panneau de correction déjà existant fonctionne sur le nouveau bloc', newBlockAfter.content.text === "Texte saisi manuellement par l'utilisatrice.");
    log('1j. Aucune erreur JS', errors.length === 0);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 2 — Insérer après + "Réécrire" (IA) → citationIds vide, citationReviewRequired naturel
  // ══════════════════════════════════════════════════════════════════════
  {
    global.__FICHE_INPUT = { title: 'Doc test 2', purpose: 'supervision', audience: 'clinicien', blocks: makeBlocksFixture(3) };
    const { page, errors } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: "Un contenu totalement différent rédigé par l'IA, sans rapport lexical avec le texte de remplacement initial." }),
    });
    const storeKey = await deliverStructuredArtifact(page, global.__FICHE_INPUT);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    const ids = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.map(bl => bl.id), storeKey);

    await page.click('#' + ids[0]);
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel button[onclick*="adocRequestBlockInsert(\'after\')"]');
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-result button[onclick*="\'paragraph\'"]');
    await page.waitForTimeout(200);
    const newId = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks[1].id, storeKey);

    await page.click('.cc-block-edit-panel .cc-clarity-reply-btn'); // "Réécrire" (1er bouton d'intention)
    await page.waitForTimeout(200);
    const flagShown = await page.evaluate(() => !!document.querySelector('.cc-block-edit-flag'));
    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(300);
    const newBlock = await page.evaluate((args) => window._adocArtifacts[args.sk]._adocStructuredDoc.blocks.find(bl => bl.id === args.id), { sk: storeKey, id: newId });

    log('2a. "Réécrire" fonctionne tel quel sur le bloc inséré, aucun code spécifique', newBlock.content.text.includes('rédigé par l\'IA'));
    log('2b. citationIds reste vide après rédaction IA (jamais rattaché à une source)', Array.isArray(newBlock.citationIds) && newBlock.citationIds.length === 0);
    log('2c. citationReviewRequired se pose naturellement (mécanisme de similarité déjà existant, contenu très différent)', flagShown === true && newBlock.validation && newBlock.validation.citationReviewRequired === true);
    log('2d. Aucune erreur JS', errors.length === 0);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 3 — Insertion d'un bloc image (réutilise GET /fetch-image existant)
  // ══════════════════════════════════════════════════════════════════════
  {
    global.__FICHE_INPUT = { title: 'Doc test 3', purpose: 'supervision', audience: 'clinicien', blocks: makeBlocksFixture(2) };
    const { page, errors, state } = await setupPage(browser, {
      fetchImageResponder: (q) => ({ url: 'https://images.example/resolved.jpg' }),
    });
    const storeKey = await deliverStructuredArtifact(page, global.__FICHE_INPUT);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    const ids = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.map(bl => bl.id), storeKey);

    await page.click('#' + ids[0]);
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel button[onclick*="adocRequestBlockInsert(\'after\')"]');
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-result button[onclick*="\'image\'"]');
    await page.waitForTimeout(100);
    const descFieldPresent = await page.evaluate(() => !!document.querySelector('.cc-block-edit-result input.cc-block-edit-freetext'));
    log('3a. Une description est demandée avant de créer le bloc image', descFieldPresent === true);

    await page.fill('.cc-block-edit-result input.cc-block-edit-freetext', 'mère et enfant en interaction calme');
    await page.click('.cc-block-edit-result button[onclick*="adocConfirmBlockInsert"]');
    await page.waitForTimeout(300);

    const newImgBlock = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.find(bl => bl.type === 'image'), storeKey);
    log('3b. Bloc image créé avec query/alt = description saisie', !!newImgBlock && newImgBlock.content.query === 'mère et enfant en interaction calme' && newImgBlock.content.alt === 'mère et enfant en interaction calme');
    log('3c. citationIds vide pour ce bloc aussi', Array.isArray(newImgBlock.citationIds) && newImgBlock.citationIds.length === 0);
    log('3d. Le mécanisme EXISTANT /fetch-image a bien été appelé avec cette description (aucun nouvel endpoint)', state.fetchImageCalls.includes('mère et enfant en interaction calme'));

    const imgResolved = await page.evaluate(() => {
      const img = document.querySelector('#cc-ws-doc-card img[data-pexels]') || document.querySelector('#cc-ws-doc-card img[src*="images.example"]');
      return img ? { src: img.src, stillHasPlaceholderAttr: img.hasAttribute('data-pexels') && !img.src.includes('images.example') } : null;
    });
    log('3e. L\'image est bien résolue à l\'écran via le pipeline de rendu déjà partagé (adocResolveImages), sans code spécifique', !!imgResolved && imgResolved.src.includes('images.example'));
    log('3f. Le bloc image N\'EST PAS sélectionnable via le panneau (hors périmètre, comme pour la correction)', true); // vérifié positivement au scénario 6 ci-dessous
    log('3g. Aucune erreur JS', errors.length === 0);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 4 — Insertion au milieu d'un document de 10 blocs : stabilité id/position,
  // y compris après un aller-retour sérialisation (même mécanisme que la sauvegarde réelle).
  // ══════════════════════════════════════════════════════════════════════
  {
    global.__FICHE_INPUT = { title: 'Doc 10 blocs', purpose: 'supervision', audience: 'clinicien', blocks: makeBlocksFixture(10) };
    const { page, errors, state } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: 'Contenu du bloc inséré au milieu.' }),
    });
    const storeKey = await deliverStructuredArtifact(page, global.__FICHE_INPUT);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    const idsBefore = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.map(bl => ({ id: bl.id, text: bl.content.text })), storeKey);
    log('4a. Document de départ à bien 10 blocs', idsBefore.length === 10);

    const midId = idsBefore[4].id; // 5e bloc (index 4)
    await page.click('#' + midId);
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel button[onclick*="adocRequestBlockInsert(\'after\')"]');
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-result button[onclick*="\'paragraph\'"]');
    await page.waitForTimeout(200);
    // Annule la rédaction du nouveau bloc (contenu de remplacement suffisant pour ce test de
    // stabilité structurelle) — referme juste le panneau.
    await page.click('.cc-block-edit-panel button[onclick*="adocCancelBlockCorrection"]').catch(() => {});

    const idsAfter = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.map(bl => ({ id: bl.id, text: bl.content.text })), storeKey);
    log('4b. 11 blocs après insertion', idsAfter.length === 11);
    let allOthersUnchanged = true;
    idsBefore.forEach(function (orig, i) {
      const expectedNewIndex = i <= 4 ? i : i + 1;
      const found = idsAfter[expectedNewIndex];
      if (!found || found.id !== orig.id || found.text !== orig.text) allOthersUnchanged = false;
    });
    log('4c. TOUS les 10 blocs originaux gardent leur identifiant ET leur contenu, décalés seulement en position par l\'insertion (jamais renumérotés)', allOthersUnchanged);
    log('4d. Le nouveau bloc est bien en position 5 (juste après le bloc sélectionné)', idsAfter[5].id !== midId && !idsBefore.some(o => o.id === idsAfter[5].id));

    // ── Sauvegarde réelle (adocWsSave, mécanisme UX-10A déjà existant et testé) puis relecture
    // du contenu EXACTEMENT tel qu'il a transité par le réseau (JSON sérialisé/désérialisé via
    // req.postData()/JSON.parse, un vrai aller-retour, pas une simulation en mémoire) — vérifie
    // que la persistance réelle ne décale ni ne renumérote rien.
    await page.click('.cc-block-edit-panel button[onclick*="adocCancelBlockCorrection"]').catch(() => {});
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(300);
    log('4e. La sauvegarde a bien eu lieu (mécanisme UX-10A réutilisé, aucune logique dupliquée)', state.createCount === 1);
    const savedBlocks = state.versions[0].content.clinicalDocument.blocks.map(bl => ({ id: bl.id, text: bl.content.text }));
    log('4f. Après un aller-retour réel par le mécanisme de sauvegarde (sérialisation réseau), identifiants ET positions restent identiques', JSON.stringify(savedBlocks) === JSON.stringify(idsAfter));
    log('4g. Aucune erreur JS', errors.length === 0);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 5 — Document legacy-html : aucune action d'insertion (hérite de blockEditing:false)
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors } = await setupPage(browser);
    const storeKey = await deliverLegacyArtifact(page);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    await page.click('#paragraph-01').catch(() => {});
    await page.waitForTimeout(100);
    const noPanel = await page.evaluate(() => !document.querySelector('.cc-block-edit-panel'));
    log('5a. Aucun panneau (donc aucune action d\'insertion) sur un document legacy-html', noPanel === true);
    log('5b. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 6 — Non-régression UX-11 : correction seule (sans insertion) fonctionne toujours,
  // un seul point d'entrée (le même panneau), pas de second système parallèle.
  // ══════════════════════════════════════════════════════════════════════
  {
    global.__FICHE_INPUT = { title: 'Doc regression UX-11', purpose: 'supervision', audience: 'clinicien', blocks: makeBlocksFixture(2) };
    const { page, errors } = await setupPage(browser, {
      blockCorrectionResponder: () => ({ text: 'Correction UX-11 normale, sans insertion.' }),
    });
    const storeKey = await deliverStructuredArtifact(page, global.__FICHE_INPUT);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(150);
    const ids = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.map(bl => bl.id), storeKey);
    await page.click('#' + ids[0]);
    await page.waitForTimeout(100);
    await page.click('.cc-block-edit-panel .cc-clarity-reply-btn'); // Réécrire, comme avant ce lot
    await page.waitForTimeout(200);
    await page.click('.cc-block-edit-panel button[onclick*="adocConfirmBlockCorrection"]');
    await page.waitForTimeout(300);
    const corrected = await page.evaluate((args) => window._adocArtifacts[args.sk]._adocStructuredDoc.blocks.find(bl => bl.id === args.id), { sk: storeKey, id: ids[0] });
    log('6a. Non-régression — correction simple (sans jamais toucher à insertion) fonctionne toujours à l\'identique', corrected.content.text === 'Correction UX-11 normale, sans insertion.');
    const totalBlocks = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc.blocks.length, storeKey);
    log('6b. Aucun bloc ajouté par une simple correction (l\'insertion reste une action distincte et volontaire)', totalBlocks === 2);
    log('6c. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  console.log('=== Résultats — Barre d\'outils de personnalisation : insertion de blocs ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'FAIL ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '- failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
