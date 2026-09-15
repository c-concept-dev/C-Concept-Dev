// Item 71 CONSTRUCTION (Option B) — assouplissement de looksTruncated pour paragraph/quote/callout.
//
// 1. Reprend les 8 cas EXACTS du tableau de l'investigation (via le vrai adocRunQualityContract,
//    pas la regexp isolée) : les 3 faux positifs doivent désormais être ACCEPTÉS, le témoin de
//    vraie troncature doit rester BLOQUÉ, les cas déjà couverts par item 21 Partie C (parenthèses/
//    crochets/guillemets) ne doivent pas régresser, le cas vide reste accepté.
// 2. Confirme que paragraph ET callout bénéficient du même assouplissement que quote (portée
//    Option B : les trois types partagés, jamais quote seul) — et que heading/list/table restent
//    hors du périmètre de ce contrôle (inchangé).
// 3. Génération réelle d'un Carrousel structuré avec des citations attribuées par tiret — doit
//    aboutir SANS repli vers legacy (le QC ne doit plus bloquer sur ce motif).
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

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════════════════ 1+2. Les 8 cas + portée par type ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + FILE);

    const CASES = [
      { label: 'Terminée par un point (référence, jamais tronquée)', text: 'La seule issue est d’accepter ce que l’on ne peut changer.', shouldBlock: false },
      { label: 'FAUX POSITIF CORRIGÉ — attribution tiret + auteur seul', text: 'Il n’y a pas de vent favorable pour celui qui ne sait pas où il va — Sénèque', shouldBlock: false },
      { label: 'FAUX POSITIF CORRIGÉ — attribution tiret + auteur + œuvre (virgule incluse)', text: 'Le bonheur n’est pas une destination, c’est une manière de voyager — Margaret Lee Runbeck, Ma vie avec toi', shouldBlock: false },
      { label: 'NON corrigé, décision explicite — aphorisme sans ponctuation ET sans tiret', text: 'Ce que je peux, je le fais ; ce que je ne peux pas, je le laisse être', shouldBlock: true },
      { label: 'FAUX POSITIF CORRIGÉ — apostrophe courbe fermante (’)', text: 'Elle disait souvent : « tout ce qui compte, c’est maintenant’', shouldBlock: false },
      { label: 'TÉMOIN — vraie troncature en cours de phrase (DOIT rester bloqué)', text: 'La seule issue est d’accepter ce que l’on ne peut', shouldBlock: true },
      { label: 'Déjà couvert (item 21 Partie C) — guillemet français fermant', text: 'Vivre, c’est agir selon ses valeurs »', shouldBlock: false },
      { label: 'Cas vide — jamais tronqué', text: '', shouldBlock: false },
      { label: 'Non-régression item 21 Partie C — parenthèse fermante après point', text: '(La séance est terminée.)', shouldBlock: false },
      { label: 'Non-régression item 21 Partie C — témoin négatif (pas de ponctuation interne)', text: '(La séance est terminée)', shouldBlock: true },
    ];

    // Un jeu de blocs par TYPE (paragraph/quote/callout) pour vérifier la portée Option B —
    // les trois partagent exactement les mêmes textes et doivent produire les mêmes verdicts.
    const TYPES = ['paragraph', 'quote', 'callout'];
    const blocks = [];
    TYPES.forEach(type => {
      CASES.forEach((c, i) => {
        const content = type === 'callout' ? { text: c.text, visualRole: 'info' } : { text: c.text };
        blocks.push({ id: type + '-' + String(i + 1).padStart(2, '0'), type, content, citationIds: [], validation: {} });
      });
    });

    const doc = {
      schemaVersion: 1, documentId: 'doc-71c', versionId: 'doc-71c-v1', previousVersionId: null,
      requestId: 'req-71c', sourceSnapshotId: 'snap-71c', createdAt: new Date().toISOString(),
      language: 'fr', status: 'draft', title: 'Test item 71 construction', purpose: 'Test', audience: 'Clinicien',
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
    log('Aucune erreur JS (cas synthétiques)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ 3. Carrousel structuré réel avec citations attribuées ═══════════════════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const structuredCarrousel = {
      title: 'Schémas de Young', purpose: 'psychoéducation', audience: 'patient',
      cards: [
        { title: 'Citation d’ouverture', blocks: [
          { type: 'quote', text: 'On ne peut pas empêcher les oiseaux du malheur de survoler nos têtes, mais on peut les empêcher de faire leur nid dans nos cheveux — Confucius', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: [] },
        ] },
        { title: 'Distorsion cognitive', blocks: [
          { type: 'paragraph', text: 'La généralisation excessive consiste à tirer une conclusion globale à partir d’un seul événement.', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: ['entry-1'] },
          { type: 'callout', text: 'Repère clinique — Beck', level: 2, visualRole: 'warning', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: [] },
        ] },
      ],
    };
    let capturedStructured = false;
    await page.route('**/*', route => {
      const req = route.request(); const url = req.url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = req.postData() || '';
        if (body.includes('evaluate_clarity')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) }); return; }
        if (body.includes('"type":"tool","name":"emit_carrousel_document"')) { capturedStructured = true; route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE('emit_carrousel_document', structuredCarrousel) }); return; }
        if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'carrousel', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Schémas de Young', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.continue();
    });

    await page.goto('file://' + FILE);
    await page.click('#format-carousel');
    await page.fill('#clinical-question', 'Fais-moi un carrousel sur les schémas de Young');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc || a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const art = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts)[0];
      return { engine: a._adocGenerationEngine, doc: a._adocStructuredDoc || null };
    });
    log('3a. Le carrousel a bien tenté le moteur structuré (payload capturé)', capturedStructured, capturedStructured);
    log('3b. Génération STRUCTURÉE aboutie SANS repli vers legacy (QC ne bloque plus sur ces citations)', art.engine === 'structured', art);
    log('3c. Le bloc quote avec attribution tiret+auteur est bien présent, non filtré', art.doc && art.doc.blocks[0].content.blocks[0].content.text.includes('Confucius'), art.doc);
    log('3d. Le callout "Repère clinique — Beck" est bien présent, non filtré', art.doc && art.doc.blocks[1].content.blocks[1].content.text === 'Repère clinique — Beck', art.doc && art.doc.blocks[1]);
    log('3e. Aucune erreur JS (Carrousel réel)', errors.length === 0, errors);
    await page.close();
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== RÉSULTATS ITEM 71 CONSTRUCTION (Option B) ===');
  results.forEach(([label, ok]) => console.log((ok ? '✅' : '❌') + ' ' + label));
  console.log('\nTotal: ' + results.length + ' | Réussis: ' + (results.length - failed.length) + ' | Échoués: ' + failed.length);
  if (failed.length) {
    console.log('\n--- DÉTAILS DES ÉCHECS ---');
    failed.forEach(([label, , extra]) => console.log(label + ' :: ' + JSON.stringify(extra)));
    process.exit(1);
  }
})();
