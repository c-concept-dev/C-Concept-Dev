// Point 1 (priorité) — reproduit EXACTEMENT le bug rapporté : chaque section apparaît deux fois
// dans le xlsx (une fois correctement en ligne fusionnée/mise en évidence via `sections`, une
// fois en doublon comme 1re "ligne de données" de cette section, colonnes suivantes vides,
// titre SANS numérotation). Pilote le VRAI pipeline (adocSend réel) avec une réponse modèle qui
// reproduit fidèlement ce défaut sur 6 sections (comme le cas réel testé par Christophe), puis
// vérifie que le filtre anti-doublon (adocFilterGhostSectionRows) les élimine avant l'envoi au
// Worker, et que les startRow sont correctement réindexés (titres de section toujours alignés
// sur la bonne 1re ligne de données réelle après filtrage).
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/xlsx-test';

const MOCK_RAG_CHUNKS = Array.from({ length: 10 }, (_, i) => ({
  content: 'Passage clinique fictif n°' + i + ' sur EMDR, ICV et IFS.',
  book_title: 'Ouvrage ' + i, author: 'Auteur ' + i, page_number: i + 1,
}));

// 6 sections, CHACUNE avec une ligne fantôme (titre sans numérotation, colonnes vides) juste
// après le titre réel — exactement le défaut décrit par Christophe.
const SECTION_TITLES = [
  'FONDEMENT THÉORIQUE', 'INDICATIONS & CADRE', 'TECHNIQUE & PROTOCOLE',
  'DURÉE & FORMAT', 'FORMATION REQUISE', 'LIMITES & CONTRE-INDICATIONS',
];
const rows = [];
const sections = [];
SECTION_TITLES.forEach((t, idx) => {
  const numbered = String(idx + 1).padStart(2, '0') + ' — ' + t;
  sections.push({ title: numbered, startRow: rows.length });
  rows.push([t, '', '', '']); // ligne fantôme (doublon du titre, sans numéro)
  rows.push(['Critère ' + (idx + 1) + 'a', 'EMDR-val', 'ICV-val', 'IFS-val']);
  rows.push(['Critère ' + (idx + 1) + 'b', 'EMDR-val2', 'ICV-val2', 'IFS-val2']);
});

const MODEL_XLSX_DATA = { headers: ['Critère', 'EMDR', 'ICV', 'IFS'], rows, sections };
const MODEL_HTML_REPLY = '<!DOCTYPE html><html><head>'
  + '<script id="xlsx-data" type="application/json">' + JSON.stringify(MODEL_XLSX_DATA) + '<' + '/script>'
  + '</head><body><h1>Tableau comparatif EMDR / ICV / IFS</h1></body></html>';

function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + 'data: [DONE]\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.text().includes('FIX-XLSX-SECTION-DOUBLON')) console.log('  [console]', m.text()); });

  let capturedBody = null;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/search-library')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('/generate-xlsx')) {
      capturedBody = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'fake', url: 'https://example/get-file/fake?dl=1', url_preview: 'https://example/get-file/fake', filename: 'test.xlsx', size: 123 }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || '';
      let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const p = body.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'evaluate_clarity') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (bodyRaw.includes('needs_rag') || bodyRaw.includes('TÂCHE')) {
        const plan = { needs_rag: true, searches: [{ terms: ['EMDR','ICV','IFS'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'tableau', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Tableau comparatif EMDR / ICV / IFS', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(MODEL_HTML_REPLY) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  // Item 53 — mot-clé "Excel" ajouté : depuis ce lot, 'tableau' produit 'html' par défaut,
  // 'xlsx' uniquement sur demande explicite. Ce test vérifie un mécanisme SPÉCIFIQUE à xlsx
  // (dédup de section) — toujours valide quand Excel est explicitement demandé.
  await page.fill('#clinical-question', 'Fais-moi un tableau Excel comparatif EMDR / ICV / IFS');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(2000);

  console.log('capturedBody présent:', !!capturedBody);
  if (!capturedBody) { console.log('ÉCHEC — aucune requête /generate-xlsx interceptée.'); await browser.close(); return; }

  const mainSheet = capturedBody.content.sheets[0];
  console.log('\n=== lignes envoyées au Worker (après filtre) ===');
  mainSheet.rows.forEach((r, i) => console.log(i + ': ' + r.join(' | ')));
  console.log('\nsections (startRow réindexés):', JSON.stringify(mainSheet.sections));

  const expectedRowCount = SECTION_TITLES.length * 2; // 2 lignes de données par section, 0 fantôme
  console.log('\n=> nombre de lignes après filtre = 12 (6 sections x 2 lignes de données, 6 fantômes supprimées):', mainSheet.rows.length === expectedRowCount);
  const noGhostLeft = mainSheet.rows.every(r => r.slice(1).some(c => String(c || '').trim()));
  console.log('=> plus aucune ligne fantôme (toutes les lignes restantes ont des données dans les colonnes suivantes):', noGhostLeft);
  const sectionsAligned = mainSheet.sections.every((s, i) => mainSheet.rows[s.startRow][0] === 'Critère ' + (i + 1) + 'a');
  console.log('=> chaque section pointe bien sur sa VRAIE 1re ligne de données après réindexation:', sectionsAligned);

  fs.writeFileSync(OUT + '/captured-body-doublon.json', JSON.stringify(capturedBody, null, 2));

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
