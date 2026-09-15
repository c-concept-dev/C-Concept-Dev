// Dette xlsx de Tableau — pilote le VRAI pipeline complet (adocSend() réel : clarté → planner
// → RAG → ancien moteur → appel principal streamé → adocHandleReply → adocDeliverArtifact →
// /generate-xlsx) avec une réponse modèle mockée qui produit un xlsx-data JSON enrichi
// (sections + columnSummaries + legend), représentatif d'un vrai cas EMDR/ICV/IFS. Capture le
// body EXACT envoyé à /generate-xlsx pour le rejouer ensuite contre le vrai code Worker
// (test séparé, real-worker), preuve de bout en bout sans accès réseau au vrai Worker distant.
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/xlsx-test';

const MOCK_RAG_CHUNKS = Array.from({ length: 10 }, (_, i) => ({
  content: 'Passage clinique fictif n°' + i + ' sur EMDR, ICV et IFS.',
  book_title: 'Ouvrage ' + i, author: 'Auteur ' + i, page_number: i + 1,
}));

// xlsx-data tel qu'un modèle le produirait pour un vrai tableau comparatif EMDR/ICV/IFS
// (6 critères sur 2 sections, pour la lisibilité — même forme que le cas réel : taglines,
// légende de décision, sections).
const MODEL_XLSX_DATA = {
  headers: ['Critère', 'EMDR', 'ICV', 'IFS'],
  rows: [
    ['Modèle théorique', 'Retraitement adaptatif', 'Attachement/schémas', 'Systèmes internes'],
    ['Cible principale', 'Souvenir traumatique précis', 'Cycle relationnel', 'Parties en conflit'],
    ['Durée typique', '8-12 séances', '10-16 séances', '12-20 séances'],
    ['Indication', '●', '◐', '●'],
    ['Contre-indication relative', '○ dissociation sévère', '○ carence régulation', '○ décompensation psychotique'],
    ['Formation requise', 'Certification EMDR', 'Formation ICV', 'Formation IFS niveau 1'],
  ],
  sections: [
    { title: '01 — FONDEMENTS & MODÈLE', startRow: 0 },
    { title: '02 — INDICATIONS & CADRE', startRow: 3 },
  ],
  columnSummaries: [
    { header: 'EMDR', tagline: 'Le retraiteur de mémoire', description: 'Conçu pour désensibiliser des cibles mémorielles précises. Son atout : efficacité prouvée, rapide, protocolisée. Sa limite : il faut une fenêtre de tolérance ouverte et une cible identifiable.' },
    { header: 'ICV', tagline: 'Le réparateur du lien', description: 'Cible les schémas d\'attachement insécure via une relation thérapeutique réparatrice. Atout : travaille le socle relationnel. Limite : processus plus long.' },
    { header: 'IFS', tagline: 'L\'orchestrateur des parties', description: 'Travaille l\'organisation interne des parties en conflit autour du Self. Atout : approche non pathologisante. Limite : demande une bonne introspection.' },
  ],
  legend: [
    { symbol: '●', label: 'Indication forte / point fort' },
    { symbol: '◐', label: 'Indication partielle / à adapter' },
    { symbol: '○', label: 'Limite / contre-indication relative' },
  ],
};

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

  let capturedBody = null;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/search-library')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('/generate-xlsx')) {
      capturedBody = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'fake', url: 'https://example/get-file/fake?dl=1', url_preview: 'https://example/get-file/fake', filename: 'test.xlsx', size: 123,
      }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = route.request().postData() || '';
      let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
      const p = body.payload || {};

      if (p.tool_choice && p.tool_choice.name === 'evaluate_clarity') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: {
          status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [],
        } }] }) });
        return;
      }
      if (bodyRaw.includes('needs_rag') || bodyRaw.includes('TÂCHE')) {
        const plan = {
          needs_rag: true, searches: [{ terms: ['EMDR','ICV','IFS'], term_match: 'any', authors: [], approaches: [], limit: 10 }],
          vector_angles: [], approach_filter: null, intent: 'tableau', clinical_intent: 'production',
          output_format: 'chat', audience_type: 'praticien', registre: 'clinique',
          topic_summary: 'Tableau comparatif EMDR / ICV / IFS', deep_scan: false, max_tokens: 2000,
        };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      // Appel principal (streamé, tool_choice:auto) : renvoie le HTML modèle avec xlsx-data.
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
  // 'xlsx' uniquement sur demande explicite. Ce test vérifie la dette xlsx (sections/tag-
  // lines/légende) — toujours valide quand Excel est explicitement demandé.
  await page.fill('#clinical-question', 'Fais-moi un tableau Excel comparatif EMDR / ICV / IFS');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(2000);

  console.log('capturedBody présent:', !!capturedBody);

  if (capturedBody) {
    const sheets = capturedBody.content.sheets;
    console.log('=== feuilles envoyées au Worker ===');
    console.log(sheets.map(s => s.name + ' (' + (s.rows?.length||0) + ' lignes)').join(' | '));

    const mainSheet = sheets[0];
    console.log('\n=> feuille principale avec ses 2 sections transmises:', Array.isArray(mainSheet.sections) && mainSheet.sections.length === 2);
    console.log('=> sections:', JSON.stringify(mainSheet.sections));

    const resumeSheet = sheets.find(s => s.name === 'Résumé des approches');
    console.log('=> feuille "Résumé des approches" présente avec 3 lignes tagline+description:', resumeSheet?.rows?.length === 3 && resumeSheet.rows.every(r => r[1] && r[2]));

    const legendSheet = sheets.find(s => s.name === 'Légende');
    console.log('=> feuille "Légende" présente avec 3 repères:', legendSheet?.rows?.length === 3);

    fs.writeFileSync(OUT + '/captured-body.json', JSON.stringify(capturedBody, null, 2));
    console.log('\nBody exact (capturé via le vrai pipeline adocSend) écrit dans captured-body.json.');
  } else {
    console.log('ÉCHEC — aucune requête /generate-xlsx interceptée.');
  }

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
