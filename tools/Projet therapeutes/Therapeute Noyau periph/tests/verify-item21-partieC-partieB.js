// Item 21 CONSTRUCTION — Partie C (looksTruncated corrigé) + Partie B (eager_input_streaming).
//
// Partie C : testé via window.adocRenderClinicalDocument -> adocRunQualityContract (le VRAI
// chemin d'orchestration), jamais la regexp isolée — 4 formulations légitimes ne doivent
// produire AUCUN blocage de troncature, 2 contrôles négatifs doivent continuer à bloquer, le
// cas vide ne doit jamais être déclaré tronqué.
//
// Partie B : (1) confirme eager_input_streaming:true réellement présent dans le payload JSON
// envoyé au Worker (capturé par mock réseau, pas seulement lu dans la définition source) ;
// (2) simule un flux SSE à fragments TRÈS fins (jusqu'à 1 caractère par input_json_delta,
// pire cas qu'eager_input_streaming puisse produire) pour prouver que l'accumulation +
// réarmement du watchdog + parsing JSON final restent corrects quel que soit le découpage.
//
// AVERTISSEMENT DE PORTÉE, transparent (régime #5/#7) : les "3 générations structurées réelles
// consécutives corrélées à proxy_call_log" exigées par le prompt pour clore définitivement la
// Partie B NE PEUVENT PAS être exécutées depuis cette session — aucun Worker déployé réel ni
// ANTHROPIC_API_KEY n'est accessible ici (même limitation de nature que la "contrainte D1" déjà
// documentée pour d'autres lots ce soir, ici une question d'accès aux identifiants de production,
// pas de quota). Ce test prouve tout ce qui est vérifiable EN LOCAL : présence du réglage dans le
// payload réel, et robustesse du parsing/watchdog par simulation fidèle du flux SSE. La clôture
// définitive de la Partie B reste en attente d'un vrai test humain en conditions réelles.
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
// Simule le flux fragmenté à L'EXTRÊME (1 caractère par input_json_delta) — pire cas plausible
// d'un eager_input_streaming réellement actif côté Anthropic, jamais observé aussi fin en
// pratique mais le plus dur à réarmer correctement (le plus grand nombre d'événements distincts).
function extremelyFragmentedToolSSE(input) {
  const json = JSON.stringify(input);
  let out = sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } })
    + sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } });
  for (const ch of json) {
    out += sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: ch } });
  }
  out += sseLine({ type: 'content_block_stop', index: 0 })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
  return out;
}

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════════════════ PARTIE C ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + FILE);

    const CASES = [
      { text: '(La séance est terminée.)', shouldBlock: false, label: 'parenthèse fermante après point' },
      { text: 'Conclusion [le protocole est terminé.]', shouldBlock: false, label: 'crochet fermant après point' },
      { text: '(« La séance est terminée. »)', shouldBlock: false, label: 'guillemet + parenthèse imbriqués' },
      { text: '(La séance est terminée !)', shouldBlock: false, label: 'parenthèse fermante après exclamation' },
      { text: '(La séance est terminée)', shouldBlock: true, label: 'CONTRÔLE NÉGATIF — pas de ponctuation interne' },
      { text: 'La séance est termin', shouldBlock: true, label: 'CONTRÔLE NÉGATIF — texte réellement tronqué' },
      { text: '', shouldBlock: false, label: 'cas vide — jamais déclaré tronqué' },
    ];

    const doc = {
      schemaVersion: 1, documentId: 'doc-21c', versionId: 'doc-21c-v1', previousVersionId: null,
      requestId: 'req-21c', sourceSnapshotId: 'snap-21c', createdAt: new Date().toISOString(),
      language: 'fr', status: 'draft', title: 'Test Partie C', purpose: 'Test', audience: 'Clinicien',
      documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
      // Le cas vide ('') est un content.text valide (aucun minLength sur les blocs, cf. item 68).
      blocks: CASES.map((c, i) => ({ id: 'b' + i, type: 'paragraph', content: { text: c.text }, citationIds: [], validation: {} })),
      citations: [],
      validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
    };

    const qc = await page.evaluate(async (doc) => {
      const snapshot = { sourceSnapshotId: doc.sourceSnapshotId, entries: [] };
      const rendered = await window.adocRenderClinicalDocument(doc, snapshot, null);
      return rendered.qc;
    }, doc);

    CASES.forEach((c, i) => {
      const blockId = 'b' + i;
      const isBlocked = qc.blocking.some(msg => msg.includes('Bloc ' + blockId + ' ') && msg.includes('tronqué'));
      log('Partie C — "' + c.label + '" (texte: ' + JSON.stringify(c.text) + ')', isBlocked === c.shouldBlock, { expected: c.shouldBlock, got: isBlocked, blocking: qc.blocking });
    });
    log('Partie C — aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════════════════ PARTIE B ═══════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let capturedPayload = null;
    const structuredDoc = { title: 'Fiche B', purpose: 'test', audience: 'clinicien', blocks: [
      { type: 'paragraph', text: 'Contenu de test.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
    ] };

    await page.route('**/*', route => {
      const req = route.request();
      const url = req.url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = req.postData() || '';
        if (body.includes('evaluate_clarity')) {
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
          return;
        }
        if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
          capturedPayload = JSON.parse(body);
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: extremelyFragmentedToolSSE(structuredDoc) });
          return;
        }
        if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Test', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      route.continue();
    });

    await page.goto('file://' + FILE);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur ACT');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc), { timeout: 20000 });

    log('1a. Le payload réellement envoyé au Worker porte tools[0].eager_input_streaming === true', capturedPayload && capturedPayload.payload.tools[0].eager_input_streaming === true, capturedPayload && capturedPayload.payload.tools[0]);
    log('1b. strict:true préservé dans le même payload réel', capturedPayload && capturedPayload.payload.tools[0].strict === true, null);
    log('1c. Le schéma (input_schema) reste intact dans le payload réel', capturedPayload && capturedPayload.payload.tools[0].input_schema && capturedPayload.payload.tools[0].input_schema.required.includes('blocks'), null);

    const art = await page.evaluate(() => {
      const [key, a] = Object.entries(window._adocArtifacts).find(([, a]) => a._adocStructuredDoc);
      return { key, title: a._adocStructuredDoc.title, blockText: a._adocStructuredDoc.blocks[0].content.text };
    });
    log('2a. Malgré un flux découpé À L\'EXTRÊME (1 caractère par input_json_delta), le document final est correctement assemblé et parsé (titre)', art.title === 'Fiche B', art);
    log('2b. Idem pour le contenu du bloc (accumulation caractère par caractère fidèle)', art.blockText === 'Contenu de test.', art);
    log('3a. Aucune erreur JS malgré des centaines d\'événements input_json_delta minuscules', errors.length === 0, errors);
    await page.close();
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== RÉSULTATS ITEM 21 — PARTIE C + PARTIE B ===');
  results.forEach(([label, ok]) => console.log((ok ? '✅' : '❌') + ' ' + label));
  console.log('\nTotal: ' + results.length + ' | Réussis: ' + (results.length - failed.length) + ' | Échoués: ' + failed.length);
  if (failed.length) {
    console.log('\n--- DÉTAILS DES ÉCHECS ---');
    failed.forEach(([label, , extra]) => console.log(label + ' :: ' + JSON.stringify(extra)));
    process.exit(1);
  }
})();
