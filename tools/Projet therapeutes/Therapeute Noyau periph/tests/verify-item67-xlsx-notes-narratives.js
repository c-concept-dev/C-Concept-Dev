// Item 67 CONSTRUCTION — Partie A (champ `notes` dédié dans xlsx-data + feuille "Notes
// cliniques") + Partie B (filet de sécurité contre toute perte silencieuse résiduelle). Pilote
// le VRAI pipeline complet (adocSend réel : clarté → planner → RAG → appel principal streamé →
// adocHandleReply → adocDeliverArtifact → /generate-xlsx), même patron exact que
// verify-xlsx-tableau-debt.js (item 32) — jamais réinventé. Capture le body EXACT envoyé au
// Worker pour vérifier les feuilles réellement construites.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = Array.from({ length: 10 }, (_, i) => ({
  content: 'Passage clinique fictif n°' + i + ' sur TCC, EFT et Systémique.',
  book_title: 'Ouvrage ' + i, author: 'Auteur ' + i, page_number: i + 1,
}));

// Reproduit EXACTEMENT le cas du soir (item 67 investigation) : un encadré "Point de vigilance
// majeur" (violence conjugale, contre-indication) + une section "Brève vs Long terme".
const VIGILANCE_TITLE = 'Point de vigilance majeur';
const VIGILANCE_TEXT = 'Ce protocole conjoint est contre-indiqué en cas de violence conjugale active — un travail individuel préalable est requis avant tout suivi de couple.';
const DUREE_TITLE = 'Brève vs Long terme';
const DUREE_TEXT = 'Un format bref (8-12 séances) convient aux couples en crise ponctuelle ; un format long terme (6-18 mois) est nécessaire pour des schémas relationnels enracinés depuis plusieurs années, ce qui change complètement le contrat thérapeutique proposé à la famille.';

const BASE_XLSX_DATA = {
  headers: ['Critère', 'TCC', 'EFT', 'Systémique'],
  rows: [
    ['Modèle théorique', 'Cognitivo-comportemental', 'Attachement émotionnel', 'Interactions familiales'],
    ['Durée typique', '8-12 séances', '10-20 séances', '10-15 séances'],
    ['Indication', '●', '◐', '●'],
  ],
  columnSummaries: [
    { header: 'TCC', tagline: 'Le rééducateur cognitif', description: 'Cible les pensées et comportements dysfonctionnels du couple.' },
    { header: 'EFT', tagline: 'Le réparateur du lien', description: 'Restaure la sécurité émotionnelle entre partenaires.' },
    { header: 'Systémique', tagline: "L'observateur du système", description: 'Travaille les interactions et boucles familiales.' },
  ],
  legend: [
    { symbol: '●', label: 'Indication forte' },
    { symbol: '◐', label: 'Indication partielle' },
  ],
};

const NARRATIVE_BODY =
  '<h1>Comparatif TCC / EFT / Systémique</h1>' +
  '<table><tr><th>Critère</th><th>TCC</th><th>EFT</th><th>Systémique</th></tr>' +
  '<tr><td>Modèle théorique</td><td>Cognitivo-comportemental</td><td>Attachement émotionnel</td><td>Interactions familiales</td></tr></table>' +
  '<div class="cc-encadre-vigilance"><h2>' + VIGILANCE_TITLE + '</h2><p>' + VIGILANCE_TEXT + '</p></div>' +
  '<div class="cc-section-duree"><h2>' + DUREE_TITLE + '</h2><p>' + DUREE_TEXT + '</p></div>';

const TABULAR_ONLY_BODY =
  '<h1>Comparatif TCC / EFT / Systémique</h1>' +
  '<table><tr><th>Critère</th><th>TCC</th><th>EFT</th><th>Systémique</th></tr>' +
  '<tr><td>Modèle théorique</td><td>Cognitivo-comportemental</td><td>Attachement émotionnel</td><td>Interactions familiales</td></tr></table>';

function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + 'data: [DONE]\n\n';
}

async function runScenario(browser, { label, xlsxData, bodyHtml }) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  let capturedBody = null;

  const modelHtmlReply = '<!DOCTYPE html><html><head>'
    + '<script id="xlsx-data" type="application/json">' + JSON.stringify(xlsxData) + '<' + '/script>'
    + '</head><body>' + bodyHtml + '</body></html>';

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
          needs_rag: true, searches: [{ terms: ['TCC','EFT','Systémique'], term_match: 'any', authors: [], approaches: [], limit: 10 }],
          vector_angles: [], approach_filter: null, intent: 'comparatif', clinical_intent: 'production',
          output_format: 'chat', audience_type: 'praticien', registre: 'clinique',
          topic_summary: 'Comparatif TCC / EFT / Systémique', deep_scan: false, max_tokens: 2000,
        };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(modelHtmlReply) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'Fais-moi un tableau Excel comparatif TCC / EFT / Systémique en couple');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.close();
  return { label, capturedBody, errors };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  // ══════════════════════════════════════════════════════════════════════
  // 1. Reproduction du cas du soir + Partie A : le modèle duplique correctement le narratif
  //    dans `notes` → feuille "Notes cliniques" présente, AUCUN avertissement nécessaire.
  // ══════════════════════════════════════════════════════════════════════
  {
    const xlsxData = { ...BASE_XLSX_DATA, notes: [{ title: VIGILANCE_TITLE, text: VIGILANCE_TEXT }, { title: DUREE_TITLE, text: DUREE_TEXT }] };
    const { capturedBody, errors } = await runScenario(browser, { label: 'A', xlsxData, bodyHtml: NARRATIVE_BODY });
    log('0a. Requête /generate-xlsx bien interceptée (scénario A)', !!capturedBody);
    if (capturedBody) {
      const sheets = capturedBody.content.sheets;
      const notesSheet = sheets.find(s => s.name === 'Notes cliniques');
      log('1a. Feuille "Notes cliniques" présente', !!notesSheet);
      log('1b. Contient le point de vigilance (titre + texte exacts)', !!notesSheet?.rows?.some(r => r[0] === VIGILANCE_TITLE && r[1] === VIGILANCE_TEXT));
      log('1c. Contient la section durée (titre + texte exacts)', !!notesSheet?.rows?.some(r => r[0] === DUREE_TITLE && r[1] === DUREE_TEXT));
      log('1d. Aucune feuille d\'avertissement — le contenu narratif est correctement couvert par `notes`', !sheets.some(s => s.name === '⚠ Avertissement'));
    } else {
      log('1a. Feuille "Notes cliniques" présente', false);
      log('1b. Contient le point de vigilance (titre + texte exacts)', false);
      log('1c. Contient la section durée (titre + texte exacts)', false);
      log('1d. Aucune feuille d\'avertissement', false);
    }
    log('1e. Aucune erreur JS', errors.length === 0);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. Filet de sécurité (Partie B) : le modèle "oublie" de dupliquer le narratif dans `notes`
  //    (reproduit exactement le bug d'origine, malgré le nouveau champ disponible) → le filet
  //    de sécurité doit se déclencher, jamais un blocage de l'export.
  // ══════════════════════════════════════════════════════════════════════
  {
    const xlsxData = { ...BASE_XLSX_DATA }; // pas de `notes` — simulation de l'oubli du modèle
    const { capturedBody, errors } = await runScenario(browser, { label: 'B', xlsxData, bodyHtml: NARRATIVE_BODY });
    log('0b. Requête /generate-xlsx bien interceptée (scénario B)', !!capturedBody);
    if (capturedBody) {
      const sheets = capturedBody.content.sheets;
      log('2a. Aucune feuille "Notes cliniques" (le modèle n\'a rien mis dans `notes`)', !sheets.some(s => s.name === 'Notes cliniques'));
      const warnSheet = sheets[0];
      log('2b. La feuille d\'avertissement est présente EN PREMIER (visible à l\'ouverture du fichier)', warnSheet?.name === '⚠ Avertissement');
      log('2c. Le message est le message honnête attendu, jamais un blocage', /consultez la version HTML\/PDF/.test(warnSheet?.rows?.[0]?.[0] || ''));
      log('2d. Le tableau principal reste présent malgré l\'avertissement (export jamais bloqué)', sheets.some(s => s.headers?.includes('Critère')));
    } else {
      log('2a. Aucune feuille "Notes cliniques"', false);
      log('2b. La feuille d\'avertissement est présente EN PREMIER', false);
      log('2c. Le message est le message honnête attendu', false);
      log('2d. Le tableau principal reste présent', false);
    }
    log('2e. Aucune erreur JS', errors.length === 0);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. Comparatif purement tabulaire (sans narratif) — comportement STRICTEMENT inchangé :
  //    ni feuille "Notes cliniques", ni avertissement inutile.
  // ══════════════════════════════════════════════════════════════════════
  {
    const xlsxData = { ...BASE_XLSX_DATA };
    const { capturedBody, errors } = await runScenario(browser, { label: 'C', xlsxData, bodyHtml: TABULAR_ONLY_BODY });
    log('0c. Requête /generate-xlsx bien interceptée (scénario C)', !!capturedBody);
    if (capturedBody) {
      const sheets = capturedBody.content.sheets;
      log('3a. Aucune feuille "Notes cliniques" (rien à y mettre)', !sheets.some(s => s.name === 'Notes cliniques'));
      log('3b. Aucune feuille d\'avertissement inutile (pas de faux positif sur un comparatif purement tabulaire)', !sheets.some(s => s.name === '⚠ Avertissement'));
      log('3c. Les feuilles historiques (Résumé des approches, Légende) restent intactes', sheets.some(s => s.name === 'Résumé des approches') && sheets.some(s => s.name === 'Légende'));
    } else {
      log('3a. Aucune feuille "Notes cliniques"', false);
      log('3b. Aucune feuille d\'avertissement inutile', false);
      log('3c. Les feuilles historiques restent intactes', false);
    }
    log('3d. Aucune erreur JS', errors.length === 0);
  }

  console.log('=== Résultats — Item 67 : champ notes + filet de sécurité xlsx ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'FAIL ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '- failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
