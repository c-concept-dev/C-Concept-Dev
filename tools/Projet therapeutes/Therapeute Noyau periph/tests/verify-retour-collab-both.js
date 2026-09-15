const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

async function test(label, file, screenshotName) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/*', route => {
    if (route.request().url().includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + file);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(400);
  await page.click('.adoc-close-btn');
  await page.waitForTimeout(500);
  const title = await page.title().catch(() => '(échec)');
  console.log(label, '-> titre atteint:', title, '| url:', page.url());
  if (screenshotName) await page.screenshot({ path: OUT + '/' + screenshotName, fullPage: false });
  await browser.close();
}

(async () => {
  await test(
    'RÉEL (Conseiller Clinique/ -> Therapeute Noyau periph/, structure origin/main)',
    '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/real-repo-check/tools/Projet therapeutes/Conseiller Clinique/studio-clinique.html',
    'retour-collab-real-fixed.png'
  );
  await test(
    'LOCAL (mon copie de travail, Therapeute Noyau periph/)',
    '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html',
    null
  );
})();
