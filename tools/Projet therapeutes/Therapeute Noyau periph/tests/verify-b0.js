const { chromium } = require('playwright');
const path = require('path');

const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('file://' + FILE);
  await page.waitForTimeout(400);

  // Enter conversation
  await page.fill('#clinical-question', 'Test regression B0');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(400);

  console.log('=== 1. Sandbox sans allow-same-origin — popup + image lightbox toujours fonctionnels ===');
  const popupResult = await page.evaluate(() => {
    const sampleHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
      '<img id="test-img" src="data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2780%27 height=%2780%27><rect width=%2780%27 height=%2780%27 fill=%27%231f5053%27/></svg>" alt="t" style="cursor:zoom-in;">' +
      '<script>document.querySelectorAll("img").forEach(function(im){im.addEventListener("click",function(){var o=document.createElement("div");o.id="lightbox-overlay";o.style.cssText="position:fixed;inset:0;background:#000;";document.body.appendChild(o);});});<\/script>' +
      '</body></html>';
    if (!window._adocArtifacts) window._adocArtifacts = {};
    window._adocArtifacts['k1'] = { html: sampleHtml, name: 'doc-test', fmt: 'html' };
    window.adocOpenDocPopup('k1');
    const overlay = document.getElementById('cc-doc-popup-overlay');
    const iframe = document.querySelector('#cc-doc-popup-body iframe');
    return { active: overlay?.classList.contains('active'), sandbox: iframe?.getAttribute('sandbox') };
  });
  console.log('popup:', popupResult);
  const iframeHandle = await page.$('#cc-doc-popup-body iframe');
  const cframe = await iframeHandle.contentFrame();
  await cframe.waitForSelector('#test-img');
  await cframe.click('#test-img');
  await page.waitForTimeout(200);
  const lightboxOk = await cframe.evaluate(() => !!document.getElementById('lightbox-overlay'));
  console.log('image lightbox still works with allow-scripts only:', lightboxOk);
  // Escape should gracefully NOT crash even though contentDocument relay can't attach (cross-origin now)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  console.log('no crash after Escape (errors so far):', errors);
  // click header to move focus out of iframe then Escape to actually close
  await page.click('.cc-doc-popup-header');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const closedAfterFocusOut = await page.evaluate(() => !document.getElementById('cc-doc-popup-overlay').classList.contains('active'));
  console.log('popup closes via Escape once focus is back on outer page:', closedAfterFocusOut);

  console.log('=== 2. Choix explicite de continuation (B0.3) ===');
  const contTest = await page.evaluate(async () => {
    // Simulate the state a truncated generation would leave behind
    const streamMsgId = 'test-msg-' + Date.now();
    const msgArea = document.getElementById('adoc-messages');
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    msgEl.className = 'adoc-msg assistant';
    msgArea.appendChild(msgEl);

    window._adocPendingContinuations[streamMsgId] = {
      workerUrl: 'stub://worker', MODEL: 'claude-sonnet-4-6', systemPrompt: 'sys',
      contBaseMessages: [{ role: 'user', content: 'demande test' }],
      reply: 'Début du document tronqué...', plan: { intent: 'fiche', output_format: 'html' },
      ragResult: { chunks: [] }, round: 1
    };
    if (typeof adocRenderContinueChoice === 'function') {
      // not exposed globally by design (module-scope) — use the public path instead
    }
    return { hasHandlers: typeof window.adocContinueGeneration === 'function' && typeof window.adocKeepAsIs === 'function' };
  });
  console.log('continuation handlers exposed:', contTest);

  // Exercise adocKeepAsIs end-to-end (finalizes without another network round)
  const keepAsIsResult = await page.evaluate(async () => {
    const streamMsgId = Object.keys(window._adocPendingContinuations)[0];
    // Stub adocHandleReply to avoid running the full artifact pipeline — just verify wiring
    window._testFinalizeCalled = false;
    const origHandleReply = window.adocHandleReply;
    window.adocHandleReply = async function() { window._testFinalizeCalled = true; };
    await window.adocKeepAsIs(streamMsgId);
    window.adocHandleReply = origHandleReply;
    return { finalizeCalled: window._testFinalizeCalled, stillPending: !!window._adocPendingContinuations[streamMsgId] };
  });
  console.log('adocKeepAsIs finalizes and clears pending state:', keepAsIsResult);

  console.log('=== 3. Import — format non supporté => message clair, pas de lecture binaire silencieuse ===');
  const fakeXlsx = path.join(OUT, 'fake.xlsx');
  require('fs').writeFileSync(fakeXlsx, Buffer.from([0x50,0x4b,0x03,0x04, 0,0,0,0]));
  const fileInput = await page.$('#adoc-file-input');
  await fileInput.setInputFiles(fakeXlsx);
  await page.waitForTimeout(300);
  const progressText = await page.evaluate(() => document.getElementById('adoc-upload-progress')?.textContent);
  console.log('progress message for unsupported .xlsx:', progressText);
  const docsAfterXlsx = await page.evaluate(() => window.adocDocs?.length ?? 'adocDocs not global (module-scoped, expected)');
  console.log('adocDocs after unsupported upload (module-scoped is fine):', docsAfterXlsx);

  console.log('=== 4. Import .txt — readAsText toujours correct pour du vrai texte ===');
  const fakeTxt = path.join(OUT, 'fake.txt');
  require('fs').writeFileSync(fakeTxt, 'Ceci est un vrai fichier texte de test.\n\nDeuxieme paragraphe.');
  await fileInput.setInputFiles(fakeTxt);
  await page.waitForTimeout(300);
  const docItemText = await page.evaluate(() => document.querySelector('.adoc-doc-item .adoc-doc-name')?.textContent);
  console.log('doc item rendered for .txt upload:', docItemText);

  console.log('=== 5. Clarification (non-régression) ===');
  await page.evaluate(() => {
    let n = 0;
    window.fetch = async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : null;
      if (body?.payload?.tool_choice?.name === 'evaluate_clarity') {
        n++;
        const input = n === 1
          ? { status: 'needs_clarification', understood_so_far: 'ok', missing: [], question: 'Q?', quick_replies: ['A', 'B'], assumptions_if_proceeding: [] }
          : { status: 'ready', understood_so_far: 'ok', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] };
        return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input }] }));
      }
      return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    };
  });
  await page.fill('#adoc-input', 'Nouvelle demande de test clarification');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(500);
  const clarityCard = await page.evaluate(() => !!document.querySelector('.cc-clarity-card'));
  console.log('clarity card still renders correctly:', clarityCard);

  await page.screenshot({ path: path.join(OUT, 'b0-01-state.png'), fullPage: true });

  console.log('=== Erreurs JS page (hors CDN bloqués attendus dans ce sandbox) ===');
  console.log(errors);

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
