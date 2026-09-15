const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseBody(text, stopReason) {
  const chunks = [
    `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`,
    `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: stopReason } })}\n\n`,
    `data: [DONE]\n\n`
  ].join('');
  return chunks;
}

async function run(scenario) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const result = await page.evaluate(async ({ scenario }) => {
    const streamMsgId = 'longdoc-test-' + Date.now();
    const msgArea = document.getElementById('adoc-messages');
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    msgArea.appendChild(msgEl);

    // queue of {text, stop_reason} for successive chapter-stream calls
    const queue = scenario === 'continue-then-complete'
      ? [
          { text: 'Ch1 partie1 ', stop: 'max_tokens' },   // ch1 initial
          { text: 'Ch1 partie2 ', stop: 'max_tokens' },   // ch1 auto-continue
          { text: 'Ch1 partie3.', stop: 'end_turn' },     // ch1 manual continue -> completes
          { text: 'Ch2 complet.', stop: 'end_turn' },     // ch2 initial -> completes
        ]
      : [
          { text: 'Ch1 partie1 ', stop: 'max_tokens' },
          { text: 'Ch1 partie2 ', stop: 'max_tokens' },
        ];

    window.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const payload = body.payload || {};
      if (payload.model === 'claude-haiku-4-5-20251001') {
        return new Response(JSON.stringify({ content: [{ type: 'text', text: '[{"titre":"Chapitre 1","instructions":"..."},{"titre":"Chapitre 2","instructions":"..."}]' }] }));
      }
      const next = queue.shift();
      const sse = [
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: next.text } })}\n\n`,
        `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: next.stop } })}\n\n`,
        `data: [DONE]\n\n`
      ].join('');
      return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
    };

    const donePromise = window.adocLongDoc('demande test', { topic_summary: 'test', intent: 'cours', audience_type: 'praticien' }, { chunks: [] }, 'system prompt', streamMsgId, 'stub://worker');

    // wait for the pause UI to appear
    for (let i = 0; i < 50; i++) {
      if (document.getElementById('cc-longdoc-choice-' + streamMsgId)) break;
      await new Promise(r => setTimeout(r, 50));
    }
    const pauseVisible = !!document.getElementById('cc-longdoc-choice-' + streamMsgId);

    if (scenario === 'continue-then-complete') {
      window.adocLongDocChoice(streamMsgId, 'continue');
    } else if (scenario === 'stop') {
      window.adocLongDocChoice(streamMsgId, 'stop');
    }

    const finalText = await donePromise;
    const chapBadges = [...msgEl.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('Chapitre') || t.includes('✅') || t.includes('⏹️') || t.includes('⚠️'));
    return { pauseVisible, finalText, chapBadgesHtml: msgEl.innerHTML.substring(0, 2000) };
  }, { scenario });

  console.log(`=== scenario: ${scenario} ===`);
  console.log('pause UI appeared:', result.pauseVisible);
  console.log('final text:', result.finalText.substring(0, 200));
  console.log('---');

  await browser.close();
}

(async () => {
  await run('continue-then-complete');
  await run('stop');
})();
