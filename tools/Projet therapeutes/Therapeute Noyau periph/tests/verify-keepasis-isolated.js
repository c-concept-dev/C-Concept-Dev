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

  const result = await page.evaluate(async () => {
    const streamMsgId = 'test-msg-' + Date.now();
    const msgArea = document.getElementById('adoc-messages');
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    msgArea.appendChild(msgEl);

    window._adocPendingContinuations[streamMsgId] = {
      workerUrl: 'stub://worker', MODEL: 'claude-sonnet-4-6', systemPrompt: 'sys',
      contBaseMessages: [{ role: 'user', content: 'demande test' }],
      reply: 'Début du document tronqué...', plan: { intent: 'fiche', output_format: 'html' },
      ragResult: { chunks: [] }, round: 1, busy: false
    };

    let handleReplyCalled = false;
    const origHandleReply = window.adocHandleReply;
    window.adocHandleReply = async function() { handleReplyCalled = true; };
    await window.adocKeepAsIs(streamMsgId);
    window.adocHandleReply = origHandleReply;

    return {
      handleReplyCalled,
      stillPending: !!window._adocPendingContinuations[streamMsgId],
      sendBtnDisabled: document.getElementById('adoc-send-btn').disabled,
    };
  });
  console.log('isolated adocKeepAsIs result:', result);
  await browser.close();
})();
