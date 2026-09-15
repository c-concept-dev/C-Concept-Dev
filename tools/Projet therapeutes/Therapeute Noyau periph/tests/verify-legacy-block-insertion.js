// PHASE 2 (monobloc) — insertion de bloc portée à l'ancien moteur (principe 0F, parité des deux
// moteurs). Provoque un vrai repli structuré→legacy (même patron que Phase 1/rang 6) pour obtenir
// un document legacy-html avec workspace + legacyBlockEditing, puis exerce réellement l'insertion
// des 5 types (Titre/Paragraphe/Encadré/Liste/Tableau) avant ET après un bloc ciblé (le <h1>),
// chacune suivie de la réouverture du panneau de correction existant et d'une vraie correction
// pour peupler le contenu réel (jamais un contenu resté au texte de remplacement). Non-régression :
// Phase 1 (correction) et le mécanisme structuré (UX-11, sa propre insertion) restent intacts.
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
      let text = 'Contenu généré.';
      let items = [];
      if (body.includes('un nouveau titre')) text = 'Signaux relationnels critiques';
      else if (body.includes('un nouveau paragraphe')) text = "Le mépris s'installe souvent après une accumulation de critiques non résolues.";
      else if (body.includes('un nouvel encadré')) text = 'Point de vigilance clinique à ne jamais minimiser.';
      else if (body.includes('une nouvelle liste')) items = ['Observer la fréquence', 'Documenter le contexte'];
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text, items, headers: [], rows: [] } }] }) });
    }
  );

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 15000 });
  const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html')[0]);
  await page.evaluate((k) => window.adocOpenWorkspace(k), storeKey);
  await page.waitForTimeout(200);

  async function findH1Id() {
    const candidates = await page.evaluate(() => [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')].map(el => ({ id: el.getAttribute('data-cc-legacy-block-id'), tag: el.tagName.toLowerCase() })));
    return candidates.find(c => c.tag === 'h1').id;
  }
  async function currentHtml() { return page.evaluate((k) => window._adocArtifacts[k].html, storeKey); }
  function idxOf(html, needle) { const i = html.indexOf(needle); if (i === -1) throw new Error('introuvable: ' + needle); return i; }

  // ═══ 1. Le sélecteur de type propose les 6 types désormais couverts, jamais Image ═══
  // Mis à jour pour items 57b/57 (volet quote) : Citation rejoint volontairement cette liste
  // (ADOC_LEGACY_BLOCK_INSERT_TYPES n'exclut plus que 'image') — même principe de mise à jour
  // qu'item 53 sur ses propres tests de dette xlsx : une assertion figée sur l'ANCIEN périmètre
  // devient obsolète par un changement intentionnel, pas une régression à corriger dans le code.
  {
    const h1Id = await findH1Id();
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${h1Id}"]`);
    await page.waitForSelector('.cc-block-edit-panel');
    await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc avant")');
    const pickerLabels = await page.evaluate(() => [...document.querySelectorAll('.cc-block-edit-result .cc-clarity-reply-btn')].map(b => b.textContent.trim()));
    log('1a. Exactement 6 types proposés : Titre, Paragraphe, Encadré, Liste, Tableau, Citation', pickerLabels.length === 6 &&
      ['Titre', 'Paragraphe', 'Encadré', 'Liste', 'Tableau', 'Citation'].every(l => pickerLabels.includes(l)), pickerLabels);
    log('1b. Jamais Image (seule exclusion restante, décision de Christophe)', !pickerLabels.includes('Image'), pickerLabels);
    await page.click('.cc-block-edit-result button:has-text("Annuler")');
  }

  // ═══ 2. Insertion de chacun des 5 types, AVANT le <h1> — placeholder, panneau rouvert, correction réelle ═══
  const TYPES = [
    { label: 'Titre', afterInstruction: 'un nouveau titre', expectDefault: 'Nouveau titre', expectFinal: 'Signaux relationnels critiques', tag: 'h2' },
    { label: 'Paragraphe', afterInstruction: 'un nouveau paragraphe', expectDefault: 'Nouveau paragraphe.', expectFinal: "s'installe souvent après une accumulation", tag: 'p' },
    { label: 'Encadré', afterInstruction: 'un nouvel encadré', expectDefault: 'Nouvel encadré.', expectFinal: 'Point de vigilance clinique', tag: 'p', cssClass: 'adoc-sc-callout' },
    { label: 'Liste', afterInstruction: 'une nouvelle liste', expectDefault: 'Nouvel élément', expectFinal: 'Observer la fréquence', tag: 'ul' },
  ];

  for (const t of TYPES) {
    const h1Id = await findH1Id();
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${h1Id}"]`);
    await page.waitForSelector('.cc-block-edit-panel');
    await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc avant")');
    await page.waitForSelector('.cc-block-edit-result .cc-clarity-reply-btn');
    await page.click(`.cc-block-edit-result button:has-text("${t.label}")`);
    // Le panneau de correction se rouvre automatiquement sur le nouveau bloc (placeholder par défaut).
    await page.waitForFunction((txt) => {
      const sel = document.querySelector('#cc-ws-doc-card [data-cc-legacy-block-id].is-selected');
      return sel && sel.textContent.includes(txt);
    }, t.expectDefault, { timeout: 10000 });
    const selInfo = await page.evaluate(() => {
      const sel = document.querySelector('#cc-ws-doc-card [data-cc-legacy-block-id].is-selected');
      return { tag: sel.tagName.toLowerCase(), className: sel.className, text: sel.textContent.trim() };
    });
    log(`2a-${t.label}. Placeholder inséré AVANT le h1 avec le bon contenu par défaut (${t.tag})`, selInfo.tag === t.tag && selInfo.text.includes(t.expectDefault), selInfo);
    if (t.cssClass) log(`2b-${t.label}. Classe CSS structurée réutilisée (jamais une apparence réinventée)`, selInfo.className.includes(t.cssClass), selInfo.className);
    const htmlBeforeCorrection = await currentHtml();
    log(`2c-${t.label}. Bien positionné AVANT le h1 dans art.html`, idxOf(htmlBeforeCorrection, t.expectDefault) < idxOf(htmlBeforeCorrection, 'Fiche cavaliers de Gottman'), null);
    // Correction réelle du placeholder — même mécanisme que Phase 1 (texte libre).
    await page.fill('.cc-block-edit-freetext', t.afterInstruction);
    await page.click('.cc-block-edit-panel button:has-text("Envoyer")');
    await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
    await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
    await page.waitForFunction(() => document.querySelector('.cc-block-edit-panel') == null, { timeout: 10000 });
    const htmlAfter = await currentHtml();
    log(`2d-${t.label}. Contenu réel généré bien appliqué (jamais resté au texte de remplacement)`, htmlAfter.includes(t.expectFinal) && !htmlAfter.includes(t.expectDefault), null);
  }

  // ═══ 3. Insertion de chacun des 5 types, APRÈS le <h1> ═══
  for (const t of TYPES) {
    const h1Id = await findH1Id();
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${h1Id}"]`);
    await page.waitForSelector('.cc-block-edit-panel');
    await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
    await page.waitForSelector('.cc-block-edit-result .cc-clarity-reply-btn');
    await page.click(`.cc-block-edit-result button:has-text("${t.label}")`);
    await page.waitForFunction((txt) => {
      const sel = document.querySelector('#cc-ws-doc-card [data-cc-legacy-block-id].is-selected');
      return sel && sel.textContent.includes(txt);
    }, t.expectDefault, { timeout: 10000 });
    const htmlNow = await currentHtml();
    log(`3a-${t.label}. Bien positionné APRÈS le h1 dans art.html`, idxOf(htmlNow, t.expectDefault) > idxOf(htmlNow, 'Fiche cavaliers de Gottman'), null);
    await page.fill('.cc-block-edit-freetext', t.afterInstruction);
    await page.click('.cc-block-edit-panel button:has-text("Envoyer")');
    await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
    await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
    await page.waitForFunction(() => document.querySelector('.cc-block-edit-panel') == null, { timeout: 10000 });
    const htmlAfter = await currentHtml();
    log(`3b-${t.label}. Contenu réel généré bien appliqué (après)`, htmlAfter.includes(t.expectFinal), null);
  }

  // ═══ 4. Tableau — avant ET après, structure correcte, jamais de panneau auto-rouvert, cellules corrigibles ═══
  for (const direction of ['before', 'after']) {
    const label = direction === 'before' ? 'avant' : 'après';
    const btnLabel = direction === 'before' ? 'Insérer un bloc avant' : 'Insérer un bloc après';
    const h1Id = await findH1Id();
    const htmlPrior = await currentHtml();
    const tableCountBefore = (htmlPrior.match(/<table/g) || []).length;
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${h1Id}"]`);
    await page.waitForSelector('.cc-block-edit-panel');
    await page.click(`.cc-block-edit-panel button:has-text("${btnLabel}")`);
    await page.waitForSelector('.cc-block-edit-result .cc-clarity-reply-btn');
    await page.click('.cc-block-edit-result button:has-text("Tableau")');
    await page.waitForFunction(([k, n]) => (window._adocArtifacts[k].html.match(/<table/g) || []).length > n, [storeKey, tableCountBefore], { timeout: 10000 });
    const htmlWithTable = await currentHtml();
    log(`4a-${label}. Un nouveau tableau (2x2, classe structurée réutilisée) est bien inséré`, (htmlWithTable.match(/<table/g) || []).length === tableCountBefore + 1 && htmlWithTable.includes('adoc-sc-table-el'), null);
    log(`4b-${label}. Aucun panneau de correction auto-rouvert pour un tableau entier (hors périmètre, comme Phase 1)`, await page.evaluate(() => document.querySelector('.cc-block-edit-panel') == null), null);
    // Une cellule du nouveau tableau reste corrigible via le mécanisme Phase 1 déjà existant.
    const cellIds = await page.evaluate(() => [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')].filter(el => el.tagName.toLowerCase() === 'th').map(el => el.getAttribute('data-cc-legacy-block-id')));
    log(`4c-${label}. Les cellules du nouveau tableau sont bien sélectionnables (th détectées)`, cellIds.length >= 2, cellIds);
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${cellIds[0]}"]`);
    await page.waitForSelector('.cc-block-edit-panel');
    const hasInsertOnCell = await page.evaluate(() => document.querySelector('.cc-block-edit-panel').innerHTML.includes('Insérer un bloc'));
    log(`4d-${label}. Aucun bouton d'insertion sur une cellule isolée (jamais avant/après un <td>/<th>)`, !hasInsertOnCell, null);
    await page.fill('.cc-block-edit-freetext', 'Titre de colonne A');
    await page.click('.cc-block-edit-panel button:has-text("Envoyer")');
    await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
    await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
    await page.waitForFunction(() => document.querySelector('.cc-block-edit-panel') == null, { timeout: 10000 });
    const htmlCellFixed = await currentHtml();
    log(`4e-${label}. La cellule du nouveau tableau a bien été corrigée via le mécanisme Phase 1 existant`, htmlCellFixed.includes('Contenu généré.'), null);
  }

  log('5a. Aucune erreur JS sur l\'ensemble du scénario d\'insertion', errors.length === 0, errors);
  await page.close();

  // ═══ 6. Non-régression — Phase 1 (correction de bloc legacy) reste intacte ═══
  {
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = [];
    page2.on('pageerror', e => errors2.push(e.message));
    await baseRoutes(
      page2,
      (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé' } }) }),
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text: 'Le mépris demeure le plus corrosif des quatre cavaliers.', items: [], headers: [], rows: [] } }] }) })
    );
    await page2.goto('file://' + FILE);
    await page2.waitForTimeout(300);
    await page2.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page2.click('#clinical-home-form button[type="submit"]');
    await page2.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 15000 });
    const k2 = await page2.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html')[0]);
    await page2.evaluate((k) => window.adocOpenWorkspace(k), k2);
    await page2.waitForTimeout(200);
    const pId = await page2.evaluate(() => {
      const el = [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')].find(e => e.tagName.toLowerCase() === 'p');
      return el.getAttribute('data-cc-legacy-block-id');
    });
    await page2.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${pId}"]`);
    await page2.waitForSelector('.cc-block-edit-panel');
    await page2.click('.cc-block-edit-panel button:has-text("Réécrire")');
    await page2.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
    await page2.click('.cc-block-edit-actions button:has-text("Confirmer")');
    await page2.waitForFunction((k) => window._adocArtifacts[k].html.includes('Le mépris demeure le plus corrosif'), k2, { timeout: 10000 });
    const html2 = await page2.evaluate((k) => window._adocArtifacts[k].html, k2);
    log('6a. Non-régression Phase 1 — correction de bloc legacy toujours fonctionnelle, citation préservée', html2.includes('Gottman, p.12'), null);
    log('6b. Non-régression — aucune erreur JS', errors2.length === 0, errors2);
    await page2.close();
  }

  // ═══ 7. Non-régression — le mécanisme d'insertion du moteur structuré (UX-11) reste intact ═══
  {
    const page3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors3 = [];
    page3.on('pageerror', e => errors3.push(e.message));
    function mockToolResponseSSE(input) {
      const inputJson = JSON.stringify(input);
      return sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } })
        + sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } })
        + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } })
        + sseLine({ type: 'content_block_stop', index: 0 })
        + sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } })
        + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
    }
    await baseRoutes(page3, (route) => {
      const doc = { title: 'Fiche structurée test', purpose: 'supervision', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu structuré non touché par Phase 2.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }] };
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(doc) });
    }, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text: 'x', items: [], headers: [], rows: [] } }] }) }));
    await page3.goto('file://' + FILE);
    await page3.waitForTimeout(300);
    await page3.fill('#clinical-question', 'Fais-moi une fiche sur les cavaliers de Gottman');
    await page3.click('#clinical-home-form button[type="submit"]');
    await page3.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc), { timeout: 15000 });
    const structKey = await page3.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocStructuredDoc)[0]);
    await page3.evaluate((k) => window.adocOpenWorkspace(k), structKey);
    await page3.waitForTimeout(200);
    await page3.click('#cc-ws-doc-card .adoc-sc-block');
    await page3.waitForSelector('.cc-block-edit-panel');
    await page3.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
    await page3.waitForSelector('.cc-block-edit-result .cc-clarity-reply-btn');
    const structPickerLabels = await page3.evaluate(() => [...document.querySelectorAll('.cc-block-edit-result .cc-clarity-reply-btn')].map(b => b.textContent.trim()));
    log('7a. Non-régression — le sélecteur de type STRUCTURÉ garde bien ses 7 types (Citation/Image inclus, jamais réduit par Phase 2)', structPickerLabels.includes('Citation') && structPickerLabels.includes('Image') && structPickerLabels.length === 7, structPickerLabels);
    await page3.click('.cc-block-edit-result button:has-text("Paragraphe")');
    await page3.waitForFunction((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks.length === 2, structKey, { timeout: 10000 });
    log('7b. Non-régression — l\'insertion structurée crée toujours bien un second bloc dans doc.blocks', await page3.evaluate((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks.length, structKey) === 2, null);
    log('7c. Non-régression — aucune erreur JS', errors3.length === 0, errors3);
    await page3.close();
  }

  console.log('=== Résultats — Phase 2, insertion de bloc pour documents legacy ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
