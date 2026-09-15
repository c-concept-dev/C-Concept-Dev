const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(400);
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(300);

  let capturedFetches = 0;
  await page.evaluate(() => {
    window.fetch = async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      const payload = body.payload || {};
      // Slow down each call slightly so we can sample the label between steps
      await new Promise(r => setTimeout(r, 150));
      if (payload.model === 'claude-haiku-4-5-20251001' && !payload.stream && payload.max_tokens === 2000) {
        // adocPlanQuery
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({
          needs_rag: true, searches: [{ terms: ['test'], limit: 5 }], vector_angles: [], approach_filter: null,
          intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien',
          registre: 'clinique', topic_summary: 'test', deep_scan: false, max_tokens: 2000
        }) }] }));
      }
      if (payload.stream) {
        return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '[]' }], results: [] }));
    };
  });

  const samples = [];
  const sampleInterval = setInterval(async () => {
    try {
      const label = await page.evaluate(() => document.querySelector('.adoc-typing-label')?.textContent);
      if (label) samples.push(label);
    } catch (e) {}
  }, 80);

  await page.fill('#adoc-input', 'Question test sur attachement');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(1500);
  clearInterval(sampleInterval);

  const uniqueSequence = samples.filter((v, i, a) => i === 0 || v !== a[i-1]);
  console.log('=== séquence des libellés observés ===');
  uniqueSequence.forEach(l => console.log(' -', l));

  const errBubbles = await page.$$eval('.adoc-bubble', els => els.map(e => e.textContent));
  console.log('bubbles:', errBubbles);
  await browser.close();
})();
