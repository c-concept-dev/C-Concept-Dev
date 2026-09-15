const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (route.request().url().includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== 1. État initial : accueil visible, conversation masquée ===');
  const before = await page.evaluate(() => ({
    landingDisplay: getComputedStyle(document.getElementById('cc-landing')).display,
    convoDisplay: getComputedStyle(document.getElementById('assistdoc-screen')).display,
    url: location.href,
  }));
  console.log(before);

  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(400);

  console.log('=== 2. Après soumission : conversation visible, accueil masqué ===');
  const afterOpen = await page.evaluate(() => ({
    landingDisplay: getComputedStyle(document.getElementById('cc-landing')).display,
    convoDisplay: getComputedStyle(document.getElementById('assistdoc-screen')).display,
    convoActive: document.getElementById('assistdoc-screen').classList.contains('active'),
    buttonLabel: document.querySelector('.adoc-close-btn')?.textContent.trim(),
    buttonOnclick: document.querySelector('.adoc-close-btn')?.getAttribute('onclick'),
  }));
  console.log(afterOpen);

  console.log('=== 3. Clic réel sur le bouton — pas de navigation attendue ===');
  const urlBefore = page.url();
  await page.click('.adoc-close-btn');
  await page.waitForTimeout(300);
  const urlAfter = page.url();
  console.log('URL avant clic:', urlBefore);
  console.log('URL après clic:', urlAfter);
  console.log('URL inchangée (pas de navigation):', urlBefore === urlAfter);

  console.log('=== 4. État après clic : accueil réaffiché, conversation masquée ===');
  const afterClose = await page.evaluate(() => ({
    landingDisplay: getComputedStyle(document.getElementById('cc-landing')).display,
    convoDisplay: getComputedStyle(document.getElementById('assistdoc-screen')).display,
    convoActive: document.getElementById('assistdoc-screen').classList.contains('active'),
    landingVisibleContent: document.querySelector('#cc-landing h1')?.textContent,
  }));
  console.log(afterClose);
  console.log('=> Accueil réaffiché correctement:', afterClose.landingDisplay !== 'none' && !afterClose.convoActive);

  console.log('\n=== errors ===', errors);
  await page.screenshot({ path: OUT + '/return-to-landing-result.png', fullPage: false });
  await browser.close();
})();
