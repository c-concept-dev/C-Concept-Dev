// Points 2 et 3 — vérifie (a) que le bouton "Exporter" de la carte de chat ET l'entrée sidebar
// pointent bien vers le VRAI xlsx généré (art.url), jamais un format différent (HTML) proposé
// silencieusement ; (b) que l'avertissement console "The download attribute on anchor was
// ignored because its href URL has a different security origin" (studio-clinique.html ~ligne
// 5018, cross-origin car art.url pointe vers clone-proxy.11drumboy11.workers.dev, un domaine
// différent de la page) est bien COSMÉTIQUE : le fichier arrive réellement sur disque avec le
// bon nom, car le Worker /get-file/:id?dl=1 pose lui-même Content-Disposition: attachment
// (vérifié dans le code source du Worker, pas supposé) — donc le téléchargement réussit malgré
// l'avertissement, quel que soit ce que fait l'attribut `download` (ignoré cross-origin).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = Array.from({ length: 10 }, (_, i) => ({
  content: 'Passage clinique fictif n°' + i + ' sur EMDR, ICV et IFS.',
  book_title: 'Ouvrage ' + i, author: 'Auteur ' + i, page_number: i + 1,
}));
const MODEL_XLSX_DATA = { headers: ['Critère', 'EMDR'], rows: [['Durée', '8-12 séances']] };
const MODEL_HTML_REPLY = '<!DOCTYPE html><html><head>'
  + '<script id="xlsx-data" type="application/json">' + JSON.stringify(MODEL_XLSX_DATA) + '<' + '/script>'
  + '</head><body><h1>Tableau</h1></body></html>';

function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) +
    sseLine({ type: 'content_block_stop', index: 0 }) +
    sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + 'data: [DONE]\n\n';
}

// URL cross-origin réaliste — même domaine/forme que le vrai Worker en production.
const FAKE_XLSX_URL = 'https://clone-proxy.11drumboy11.workers.dev/get-file/fakeid123?dl=1';
const FAKE_FILENAME = 'Tableau-comparatif-EMDR.xlsx';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const consoleWarnings = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'warning' || /download attribute/i.test(m.text())) consoleWarnings.push(m.text()); });

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.includes('/search-library')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('/generate-xlsx')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'fakeid123', url: FAKE_XLSX_URL, url_preview: FAKE_XLSX_URL.replace('?dl=1',''), filename: FAKE_FILENAME, size: 4242 }) });
      return;
    }
    // Simule EXACTEMENT le vrai endpoint Worker /get-file/:id?dl=1 (Content-Disposition:
    // attachment; filename=... — vérifié dans Worker/index.js ligne ~55777) sur le domaine
    // cross-origin réel, pour prouver que le téléchargement réussit malgré l'avertissement.
    if (url === FAKE_XLSX_URL) {
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="' + encodeURIComponent(FAKE_FILENAME) + '"',
          'Access-Control-Allow-Origin': '*',
        },
        body: Buffer.from('PK-fake-xlsx-binary-content'),
      });
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
        const plan = { needs_rag: true, searches: [{ terms: ['EMDR'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'tableau', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Tableau comparatif EMDR', deep_scan: false, max_tokens: 2000 };
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
  // 'xlsx' uniquement sur demande explicite. Ce test vérifie des mécanismes SPÉCIFIQUES à xlsx
  // (origine du téléchargement) — toujours valides quand Excel est explicitement demandé.
  await page.fill('#clinical-question', 'Fais-moi un tableau Excel comparatif EMDR');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(2000);

  const artUrl = await page.evaluate(() => {
    const keys = Object.keys(window._adocArtifacts || {});
    const key = keys[0];
    return key ? window._adocArtifacts[key].url : null;
  });
  console.log('art.url stocké côté carte:', artUrl);
  console.log('=> pointe bien vers le VRAI xlsx généré (pas un fallback HTML):', artUrl === FAKE_XLSX_URL);

  console.log('\n=== clic sur "Exporter" (carte de chat, data-action="download") ===');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(e => null),
    page.click('.adoc-artifact-card [data-action="download"]'),
  ]);
  if (download) {
    console.log('URL de la requête de téléchargement:', download.url());
    console.log('nom de fichier suggéré par le navigateur (via Content-Disposition serveur):', download.suggestedFilename());
    console.log('=> le téléchargement a bien abouti malgré l\'avertissement cross-origin sur l\'attribut download:', true);
    console.log('=> le nom de fichier vient bien du Content-Disposition serveur (pas de l\'attribut download ignoré):', download.suggestedFilename() === FAKE_FILENAME);
  } else {
    console.log('AUCUN évènement download capté — vérifier si le téléchargement échoue réellement.');
  }

  console.log('\n=== avertissements console capturés (attendu : au moins un, cosmétique) ===');
  console.log(consoleWarnings);
  console.log('=> avertissement "download attribute...different security origin" bien observé:', consoleWarnings.some(w => /different security origin/i.test(w)));

  console.log('\n=== scénario exact rapporté : popup plein écran PUIS téléchargement ===');
  const key = Object.keys(await page.evaluate(() => window._adocArtifacts || {}))[0];
  await page.evaluate((k) => window.adocOpenDocPopup(k), key);
  await page.waitForTimeout(300);
  const popupOpen = await page.evaluate(() => document.getElementById('cc-doc-popup-overlay')?.classList.contains('active'));
  console.log('popup plein écran bien ouvert:', popupOpen);
  await page.evaluate(() => window.adocCloseDocPopup());
  await page.waitForTimeout(200);
  const [download2] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(e => null),
    page.click('.adoc-artifact-card [data-action="download"]'),
  ]);
  console.log('=> téléchargement APRÈS popup plein écran (fermé) toujours réussi:', !!download2, download2 ? download2.suggestedFilename() : null);

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
