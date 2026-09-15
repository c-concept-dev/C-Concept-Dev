const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const d1Calls = [];

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('/d1-query')) {
      const body = route.request().postData();
      d1Calls.push(body);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [
        { book_title: 'Livre Test', author: 'Auteur Test', chapter: '1', page_number: 5, content: 'attachement teste', approach: 'attachment' }
      ]})});
      return;
    }
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 10, total_chunks: 100, by_approach: [] }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('search-library')) {
      // main planner/streaming calls — stub to keep the run self-contained
      const postData = route.request().postData() || '';
      let payload = {};
      try { payload = JSON.parse(postData).payload || {}; } catch(e) {}
      if (payload.model === 'claude-haiku-4-5-20251001' && !payload.stream) {
        // adocPlanQuery — respond with a structured plan using the new "searches" field
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({
          needs_rag: true,
          searches: [{ terms: ['attachement', 'attachment'], term_match: 'any', authors: [], approaches: ['attachment'], limit: 10 }],
          vector_angles: ['lien affectif'],
          approach_filter: 'attachment',
          intent: 'fiche', clinical_intent: 'production', output_format: 'html',
          audience_type: 'praticien', registre: 'clinique', topic_summary: 'attachement', deep_scan: false, max_tokens: 2000
        }) }] }) });
        return;
      }
      // Everything else (streaming, vector search, etc.) — minimal safe stub
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n' });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'Question sur attachement');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1500);

  console.log('=== /d1-query calls made ===');
  d1Calls.forEach((c, i) => console.log(i, c));
  const allStructured = d1Calls.every(c => {
    try { const b = JSON.parse(c); return typeof b === 'object' && !('sql' in b); } catch(e) { return false; }
  });
  console.log('all calls are structured (no "sql" key):', allStructured, '| total calls:', d1Calls.length);

  await browser.close();
})();
