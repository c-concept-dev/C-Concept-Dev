const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
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

  console.log('=== 1. Composeur unique ===');
  const contextInitial = await page.evaluate(() => ({
    toggleVisible: document.getElementById('adoc-context-toggle')?.textContent.trim(),
    panelHidden: document.getElementById('adoc-context-panel').style.display === 'none',
    oldBarGone: !document.querySelector('.adoc-mode-bar'),
  }));
  console.log(contextInitial);

  await page.click('#adoc-context-toggle');
  await page.waitForTimeout(100);
  const afterOpen = await page.evaluate(() => document.getElementById('adoc-context-panel').style.display);
  console.log('panel display after click:', afterOpen);
  await page.fill('#adoc-context-inp', "couple avec trauma d'abandon");
  await page.click('#adoc-context-close');
  await page.waitForTimeout(100);
  const afterClose = await page.evaluate(() => ({
    toggleText: document.getElementById('adoc-context-toggle').textContent.trim(),
    hasValueClass: document.getElementById('adoc-context-toggle').classList.contains('has-value'),
    sessionContextValue: window.adocSessionContext, // won't exist (module scoped) — just checking
  }));
  console.log('after setting + closing:', afterOpen === 'flex', afterClose);

  console.log('=== 2. Jargon technique masqué hors dev mode ===');
  const labelsBefore = await page.evaluate(() => ({
    sidebarTitle: document.querySelectorAll('.adoc-sidebar-title')[document.querySelectorAll('.adoc-sidebar-title').length - 1]?.textContent,
    chunksLabel: document.querySelector('#adoc-stat-chunks')?.closest('.adoc-stat-row')?.textContent,
    indexLabel: document.querySelector('#adoc-stat-appr')?.closest('.adoc-stat-row')?.textContent,
    syncBtnVisible: getComputedStyle(document.getElementById('adoc-sync-btn').closest('.adoc-dev-only')).display !== 'none',
    devBadgeVisible: getComputedStyle(document.getElementById('adoc-devmode-badge')).display !== 'none',
  }));
  console.log(labelsBefore);

  await page.keyboard.press('Control+d');
  await page.waitForTimeout(150);
  const afterCtrlD = await page.evaluate(() => ({
    bodyHasClass: document.body.classList.contains('adoc-devmode-on'),
    syncBtnVisible: getComputedStyle(document.getElementById('adoc-sync-btn').closest('.adoc-dev-only')).display !== 'none',
    devBadgeVisible: getComputedStyle(document.getElementById('adoc-devmode-badge')).display !== 'none',
  }));
  console.log('after Ctrl+D:', afterCtrlD);

  await page.keyboard.press('Control+d');
  await page.waitForTimeout(150);
  const afterSecondCtrlD = await page.evaluate(() => document.body.classList.contains('adoc-devmode-on'));
  console.log('after 2nd Ctrl+D (should be off):', afterSecondCtrlD);

  await page.screenshot({ path: OUT + '/ux2a-composer-devmode.png', fullPage: true });
  console.log('=== errors ===', errors);
  await browser.close();
})();
