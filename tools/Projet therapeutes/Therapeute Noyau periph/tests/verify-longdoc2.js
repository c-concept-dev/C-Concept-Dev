const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const result = await page.evaluate(async () => {
    const streamMsgId = 'longdoc-test-keep-' + Date.now();
    const msgArea = document.getElementById('adoc-messages');
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    msgArea.appendChild(msgEl);

    const queue = [
      { text: 'Ch1 partie1 ', stop: 'max_tokens' },
      { text: 'Ch1 partie2 ', stop: 'max_tokens' },
    ];
    window.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const payload = body.payload || {};
      if (payload.model === 'claude-haiku-4-5-20251001') {
        return new Response(JSON.stringify({ content: [{ type: 'text', text: '[{"titre":"Chapitre Unique","instructions":"..."}]' }] }));
      }
      const next = queue.shift() || { text: '', stop: 'end_turn' };
      const sse = [
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: next.text } })}\n\n`,
        `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: next.stop } })}\n\n`,
        `data: [DONE]\n\n`
      ].join('');
      return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
    };

    const donePromise = window.adocLongDoc('demande', { topic_summary: 't', intent: 'cours' }, { chunks: [] }, 'sys', streamMsgId, 'stub://worker');
    for (let i = 0; i < 50; i++) {
      if (document.getElementById('cc-longdoc-choice-' + streamMsgId)) break;
      await new Promise(r => setTimeout(r, 50));
    }
    window.adocLongDocChoice(streamMsgId, 'keep');
    const finalText = await donePromise;
    const badges = [...msgEl.querySelectorAll('div')].map(d => d.textContent);
    return { finalText, badges };
  });

  console.log('final text:', result.finalText);
  console.log('badges:', result.badges);
  await browser.close();
})();
