const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

(async () => {
  const browser = await chromium.launch();

  for (const [name, width, height] of [['tablet-portrait', 768, 1024], ['tablet-landscape', 1024, 768], ['phone', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
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

    const toggleVisible = await page.evaluate(() => getComputedStyle(document.getElementById('adoc-sidebar-toggle')).display !== 'none');
    console.log(`[${name}] hamburger visible:`, toggleVisible);

    await page.screenshot({ path: `${OUT}/responsive-${name}-closed.png`, fullPage: false });

    if (toggleVisible) {
      await page.click('#adoc-sidebar-toggle');
      await page.waitForTimeout(250);
      const sidebarOpen = await page.evaluate(() => document.getElementById('adoc-sidebar-panel').classList.contains('open'));
      console.log(`[${name}] sidebar open after click:`, sidebarOpen);
      await page.screenshot({ path: `${OUT}/responsive-${name}-open.png`, fullPage: false });

      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      const sidebarClosedAfterEsc = await page.evaluate(() => !document.getElementById('adoc-sidebar-panel').classList.contains('open'));
      console.log(`[${name}] sidebar closed after Escape:`, sidebarClosedAfterEsc);
    }
    await page.close();
  }
  await browser.close();
})();
