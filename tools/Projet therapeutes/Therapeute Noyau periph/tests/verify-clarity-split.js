const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(300);

  let capturedSystemPrompts = [];
  await page.evaluate(() => {
    let n = 0;
    window.fetch = async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : null;
      const payload = body?.payload;
      if (payload?.tool_choice?.name === 'evaluate_clarity') {
        n++;
        // Round 1 and 2: needs_clarification (forces the 2-round cap); round 3 would be the actual gate call after round 2's answer.
        const input = n <= 2
          ? { status: 'needs_clarification', understood_so_far: 'ok', missing: [], question: 'Précision ' + n + ' ?', quick_replies: ['A', 'B'], assumptions_if_proceeding: ['hypothese-technique-' + n] }
          : { status: 'needs_clarification', understood_so_far: 'ok', missing: [], question: 'Q3?', quick_replies: [], assumptions_if_proceeding: ['audience non précisée', 'format libre'] };
        return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input }] }));
      }
      if (payload?.system) {
        window.__capturedSystemPrompts = window.__capturedSystemPrompts || [];
        window.__capturedSystemPrompts.push(payload.system);
      }
      return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    };
  });

  await page.fill('#adoc-input', 'Compare EMDR et ICV');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(400);
  await page.fill('#adoc-input', 'pour des adultes');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(400);
  await page.fill('#adoc-input', 'format synthétique');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(800);

  const bubbles = await page.$$eval('.adoc-msg.user .adoc-bubble', els => els.map(e => e.textContent));
  console.log('=== bulles utilisateur affichées ===');
  bubbles.forEach((b, i) => console.log(i, JSON.stringify(b)));

  const captured = await page.evaluate(() => window.__capturedSystemPrompts || []);
  console.log('=== system prompts capturés (dernier contient-il le bandeau ?) ===');
  const last = captured[captured.length - 1] || '';
  console.log('contient "Hypothèses retenues":', last.includes('Hypothèses retenues'));
  console.log('contient "hypothese-technique" (fuite technique) dans une bulle:', bubbles.some(b => b.includes('hypothese-technique') || b.includes('bandeau')));

  await page.screenshot({ path: '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/clarity-clean-bubble.png', fullPage: true });
  await browser.close();
})();
