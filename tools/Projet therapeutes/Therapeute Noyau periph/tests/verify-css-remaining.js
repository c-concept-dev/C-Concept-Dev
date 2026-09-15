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

  console.log('=== adoc-send-btn : Tab depuis le textarea de question ===');
  await page.locator('#adoc-input').focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(350);
  const sendBtn = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { id: el.id, matchesFocusVisible: el.matches(':focus-visible'), outline: cs.outline, outlineOffset: cs.outlineOffset };
  });
  console.log(sendBtn);
  const rect1 = await page.evaluate(() => document.activeElement.getBoundingClientRect().toJSON());
  await page.screenshot({ path: OUT + '/focus-sendbtn.png', clip: { x: Math.max(0, rect1.x - 24), y: Math.max(0, rect1.y - 24), width: rect1.width + 48, height: rect1.height + 48 } });

  console.log('=== adoc-context-close : ouvrir le panneau puis Tab depuis le champ contexte ===');
  await page.click('#adoc-context-toggle');
  await page.waitForTimeout(150);
  await page.locator('#adoc-context-inp').focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(350);
  const closeBtn = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { id: el.id, matchesFocusVisible: el.matches(':focus-visible'), outline: cs.outline, outlineOffset: cs.outlineOffset };
  });
  console.log(closeBtn);
  const rect2 = await page.evaluate(() => document.activeElement.getBoundingClientRect().toJSON());
  await page.screenshot({ path: OUT + '/focus-contextclose.png', clip: { x: Math.max(0, rect2.x - 24), y: Math.max(0, rect2.y - 24), width: rect2.width + 48, height: rect2.height + 48 } });

  await browser.close();
})();
