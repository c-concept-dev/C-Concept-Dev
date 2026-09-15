const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/*', route => {
    if (route.request().url().includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/ux2a-void-check.png', fullPage: true });

  const msgRect = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('.adoc-msg')];
    const last = bubbles[bubbles.length - 1];
    const container = document.getElementById('adoc-messages');
    return { lastMsgBottom: last.getBoundingClientRect().bottom, containerBottom: container.getBoundingClientRect().bottom };
  });
  console.log('last message bottom vs container bottom (should be close if anchored):', msgRect);

  await browser.close();
})();
