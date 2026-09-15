const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let libraryStatsCalls = 0;

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
      libraryStatsCalls++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        total_books: 245, total_chunks: 23456, by_approach: [{approach:'couple',count:100,n_books:5}],
        books: [{title:'Livre A', author:'Auteur A', approach:'couple', chunk_count: 60}]
      })});
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(600);

  const landingBooks = await page.textContent('#library-books');
  const landingPassages = await page.textContent('#library-passages');
  console.log('landing books:', landingBooks, '| passages:', landingPassages);
  console.log('library-stats network calls:', libraryStatsCalls);

  // open conversation, verify sidebar too, and no second call fired
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(400);
  const sidebarBooks = await page.textContent('#adoc-stat-books');
  const welcomeCount = await page.textContent('#adoc-welcome-book-count');
  console.log('sidebar books:', sidebarBooks, '| welcome:', welcomeCount);
  console.log('library-stats network calls after opening conversation:', libraryStatsCalls);

  await browser.close();
})();
