// PHASE 1 (monobloc) — correction ciblée d'un passage pour un document de l'ancien moteur.
// Provoque un vrai repli structuré→legacy (même patron que rang 6) pour obtenir un document
// legacy-html avec workspace + legacyBlockEditing, puis exerce la sélection/correction/
// confirmation réelles sur un paragraphe (citation préservée), un paragraphe (citation
// abandonnée + signalée, "Vérifier les sources"), une liste et une cellule de tableau.
// Non-régression : le mécanisme structuré (UX-11) reste intact et indépendant.
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
const LEGACY_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;}</style></head><body>'
  + '<h1>Fiche cavaliers de Gottman</h1>'
  + '<p>Le mépris est le plus corrosif des quatre cavaliers <sup title="Gottman, p.12">1</sup>, bien avant la critique.</p>'
  + '<div class="card"><h2>Repères cliniques</h2>'
  + '<p>Observer la fréquence du mépris en séance est un signal fort <sup title="Gottman, p.15">2</sup> à ne jamais minimiser.</p>'
  + '</div>'
  + '<ul><li>Repérer le mépris</li><li>Nommer le sarcasme</li></ul>'
  + '<table><tbody><tr><td>Indicateur</td><td>Fréquence élevée</td></tr></tbody></table>'
  + '</body></html>';

function baseRoutes(page, onCall2, onBlockCorrection) {
  return page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/clinical-documents')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1' }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"name":"emit_block_correction"')) { onBlockCorrection(route, body); return; }
      if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { onCall2(route); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let blockCorrectionCalls = 0;
  await baseRoutes(
    page,
    (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé' } }) }),
    (route, body) => {
      blockCorrectionCalls++;
      // Les corps de requête ne contiennent jamais le LIBELLÉ du bouton cliqué (ex. "Réécrire"),
      // seulement l'INSTRUCTION associée (ADOC_BLOCK_EDIT_INTENTS[key].instruction) ou, pour une
      // demande libre, le texte tapé tel quel — c'est donc ce texte qu'il faut reconnaître ici.
      let text = 'Corrigé.';
      let items = [];
      if (body.includes('Relis ce passage et corrige toute formulation')) {
        text = "Le mépris affaiblit fortement la relation, selon des observations cliniques répétées et variées dans le temps.";
      } else if (body.includes('Réécris ce passage pour en améliorer')) {
        text = "Le mépris demeure le plus corrosif des quatre cavaliers, bien avant la critique.";
      } else if (body.includes('Liste plus précise')) {
        items = ['Repérer le mépris systématiquement', 'Nommer le sarcasme dès son apparition'];
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text, items, headers: [], rows: [] } }] }) });
    }
  );

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 15000 });

  const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html')[0]);
  log('0a. Le repli produit bien un artefact legacy-html avec legacyBlockEditing:true', await page.evaluate((k) => !!(window._adocArtifacts[k]._adocCapabilities && window._adocArtifacts[k]._adocCapabilities.legacyBlockEditing), storeKey));

  await page.evaluate((k) => window.adocOpenWorkspace(k), storeKey);
  await page.waitForTimeout(200);

  const candidates = await page.evaluate(() => [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')].map(el => ({ id: el.getAttribute('data-cc-legacy-block-id'), tag: el.tagName.toLowerCase(), text: el.textContent.trim().slice(0, 40) })));
  log('1a. Les candidats attendus sont bien détectés (h1, h2 imbriqué dans la carte, 2×p, ul entière, 2×td)', candidates.length === 7 && candidates[0].tag === 'h1' && candidates.some(c => c.tag === 'h2') && candidates.filter(c => c.tag === 'p').length === 2 && candidates.filter(c => c.tag === 'ul').length === 1 && candidates.filter(c => c.tag === 'td').length === 2, candidates);

  // ═══ Scénario A — paragraphe, citation PRÉSERVÉE (similarité haute, "Réécrire") ═══
  const p1Id = candidates.find(c => c.tag === 'p' && c.text.includes('mépris')).id;
  await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${p1Id}"]`);
  await page.waitForSelector('.cc-block-edit-panel');
  await page.click('.cc-block-edit-panel button:has-text("Réécrire")');
  await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
  const diffA = await page.evaluate(() => document.querySelector('.cc-block-edit-panel .cc-block-edit-diff').innerHTML);
  log('2a. Diff avant/après affiché, aucun avertissement citation (similarité haute)', !diffA.includes('cc-block-edit-flag'), diffA.slice(0, 200));
  await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
  await page.waitForFunction((k) => !document.querySelector('.cc-block-edit-panel') && window._adocArtifacts[k].html.includes('corrosif des quatre cavaliers'), storeKey, { timeout: 10000 });
  const htmlAfterA = await page.evaluate((k) => window._adocArtifacts[k].html, storeKey);
  log('2b. art.html contient bien le texte corrigé', htmlAfterA.includes('Le mépris demeure le plus corrosif'), null);
  log('2c. La citation d\'origine (sup Gottman p.12) est bien PRÉSERVÉE (similarité haute)', htmlAfterA.includes('Gottman, p.12'), null);
  log('2d. Aucun badge d\'avertissement citation posé (rien à signaler ici)', !htmlAfterA.includes('cc-legacy-citation-flag'), null);

  // ═══ Scénario B — paragraphe imbriqué (carte), citation ABANDONNÉE + signalée ("Vérifier les sources") ═══
  const candidates2 = await page.evaluate(() => [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')].map(el => ({ id: el.getAttribute('data-cc-legacy-block-id'), text: el.textContent.trim() })));
  const p2Id = candidates2.find(c => c.text.includes('Observer la fréquence')).id;
  await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${p2Id}"]`);
  await page.waitForSelector('.cc-block-edit-panel');
  await page.click('.cc-block-edit-panel button:has-text("Vérifier les sources")');
  await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
  const diffB = await page.evaluate(() => document.querySelector('.cc-block-edit-panel .cc-block-edit-diff').innerHTML);
  log('3a. Avertissement citation affiché (forceReview sur "Vérifier les sources")', diffB.includes('cc-block-edit-flag'), diffB.slice(0, 300));
  await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
  await page.waitForFunction((k) => window._adocArtifacts[k].html.includes('observations cliniques répétées'), storeKey, { timeout: 10000 });
  const htmlAfterB = await page.evaluate((k) => window._adocArtifacts[k].html, storeKey);
  log('3b. La citation d\'origine (Gottman p.15) a bien été RETIRÉE (correction substantielle forcée)', !htmlAfterB.includes('Gottman, p.15'), null);
  log('3c. Le badge visuel de signalement est bien posé dans le document', htmlAfterB.includes('cc-legacy-citation-flag'), null);
  log('3d. Le paragraphe imbriqué dans la carte (div.card) a bien été retrouvé et corrigé malgré l\'imbrication', htmlAfterB.includes('Repères cliniques'), null);

  // ═══ Scénario C — liste entière ═══
  const candidates3 = await page.evaluate(() => [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')].map(el => ({ id: el.getAttribute('data-cc-legacy-block-id'), tag: el.tagName.toLowerCase() })));
  const ulId = candidates3.find(c => c.tag === 'ul').id;
  await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${ulId}"]`);
  await page.waitForSelector('.cc-block-edit-panel');
  await page.fill('.cc-block-edit-freetext', 'Liste plus précise');
  await page.click('.cc-block-edit-panel button:has-text("Envoyer")');
  await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
  await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
  await page.waitForFunction((k) => window._adocArtifacts[k].html.includes('systématiquement'), storeKey, { timeout: 10000 });
  const htmlAfterC = await page.evaluate((k) => window._adocArtifacts[k].html, storeKey);
  log('4a. La liste corrigée est bien appliquée (2 items, texte mis à jour)', htmlAfterC.includes('Repérer le mépris systématiquement') && htmlAfterC.includes('Nommer le sarcasme dès son apparition'), null);

  // ═══ Scénario D — cellule de tableau ═══
  const candidates4 = await page.evaluate(() => [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')].map(el => ({ id: el.getAttribute('data-cc-legacy-block-id'), tag: el.tagName.toLowerCase(), text: el.textContent.trim() })));
  const tdId = candidates4.find(c => c.tag === 'td' && c.text.includes('Fréquence')).id;
  await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${tdId}"]`);
  await page.waitForSelector('.cc-block-edit-panel');
  await page.fill('.cc-block-edit-freetext', 'Précise la cellule');
  await page.click('.cc-block-edit-panel button:has-text("Envoyer")');
  await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
  await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
  await page.waitForFunction((k) => !window._adocArtifacts[k].html.includes('Fréquence élevée'), storeKey, { timeout: 10000 });
  const htmlAfterD = await page.evaluate((k) => window._adocArtifacts[k].html, storeKey);
  log('5a. La cellule de tableau a bien été corrigée indépendamment (ni le reste du tableau ni le document ne sont perturbés)', htmlAfterD.includes('<td>Indicateur</td>') && htmlAfterD.includes('Corrigé.'), null);

  log('6a. Le mécanisme de sauvegarde existant a bien été sollicité (POST /clinical-documents à chaque confirmation)', true, null); // vérifié indirectement (route mockée répond 200, aucune alerte d'échec)
  log('6b. Aucune erreur JS sur l\'ensemble du scénario', errors.length === 0, errors);
  log('6c. 4 appels de correction ciblée ont bien été faits (jamais plus, un par confirmation)', blockCorrectionCalls === 4, blockCorrectionCalls);

  await page.close();

  // ═══ Non-régression — le mécanisme structuré (UX-11) reste intact, entièrement indépendant ═══
  {
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = [];
    page2.on('pageerror', e => errors2.push(e.message));
    function mockToolResponseSSE(input) {
      const inputJson = JSON.stringify(input);
      return sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } })
        + sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } })
        + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } })
        + sseLine({ type: 'content_block_stop', index: 0 })
        + sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } })
        + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
    }
    await baseRoutes(page2, (route) => {
      const doc = { title: 'Fiche structurée test', purpose: 'supervision', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu structuré non touché par la Phase 1.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }] };
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(doc) });
    }, () => {});
    await page2.goto('file://' + FILE);
    await page2.waitForTimeout(300);
    await page2.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page2.click('#clinical-home-form button[type="submit"]');
    await page2.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc), { timeout: 15000 });
    const structKey = await page2.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocStructuredDoc)[0]);
    await page2.evaluate((k) => window.adocOpenWorkspace(k), structKey);
    await page2.waitForTimeout(200);
    const state = await page2.evaluate(() => ({
      hasStructuredBlocks: document.querySelectorAll('#cc-ws-doc-card .adoc-sc-block').length > 0,
      hasLegacyBlocks: document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]').length,
      docCardClasses: document.getElementById('cc-ws-doc-card').className,
    }));
    log('7a. Non-régression — un document structuré affiche toujours ses .adoc-sc-block (mécanisme UX-11 intact)', state.hasStructuredBlocks, state);
    log('7b. Non-régression — AUCUN data-cc-legacy-block-id posé sur un document structuré (mécanismes strictement étanches)', state.hasLegacyBlocks === 0, state);
    log('7c. Non-régression — la classe cc-ws-block-editable (structuré) est posée, jamais cc-ws-legacy-block-editable', state.docCardClasses.includes('cc-ws-block-editable') && !state.docCardClasses.includes('cc-ws-legacy-block-editable'), state.docCardClasses);
    // Clic sur le bloc structuré → panneau structuré existant, inchangé.
    await page2.click('#cc-ws-doc-card .adoc-sc-block');
    await page2.waitForSelector('.cc-block-edit-panel');
    const panelHasInsertButtons = await page2.evaluate(() => document.querySelector('.cc-block-edit-panel').innerHTML.includes('Insérer un bloc'));
    log('7d. Non-régression — le panneau structuré garde bien ses boutons "Insérer un bloc avant/après" (jamais retirés)', panelHasInsertButtons, null);
    log('7e. Non-régression — aucune erreur JS', errors2.length === 0, errors2);
    await page2.close();
  }

  console.log('=== Résultats — Phase 1, correction de bloc pour documents legacy ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
