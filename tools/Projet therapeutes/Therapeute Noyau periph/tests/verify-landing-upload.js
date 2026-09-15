const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // Stub pdf.js so the real extraction path runs (same trick as the B0 lot's test)
  await page.addInitScript(() => {
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (i) => ({ getTextContent: async () => ({ items: [{ str: 'contenu de test page ' + i }] }) })
        })
      })
    };
  });
  await page.route('**/*', route => {
    if (route.request().url().includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== 1. Zone de dépôt visible sur l’accueil, même endroit que la question ===');
  const landingZoneVisible = await page.evaluate(() => {
    const zone = document.getElementById('cc-landing-upload-zone');
    const r = zone.getBoundingClientRect();
    return { exists: !!zone, visible: r.width > 0 && r.height > 0 };
  });
  console.log(landingZoneVisible);

  console.log('=== 2. Upload réel via la zone accueil (mêmes libellés "page(s)") ===');
  const uploadResult = await page.evaluate(async () => {
    const blob = new Blob(['dummy pdf bytes'], { type: 'application/pdf' });
    const file = new File([blob], 'rapport-clinique.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);
    await window.adocHandleUpload(dt.files);
    await new Promise(r => setTimeout(r, 100));
    return {
      landingListHtml: document.getElementById('cc-landing-upload-list').innerHTML.substring(0, 300),
      landingProgressVisible: getComputedStyle(document.getElementById('cc-landing-upload-progress')).display,
    };
  });
  console.log('landing list has doc name:', uploadResult.landingListHtml.includes('rapport-clinique.pdf'));
  console.log('landing list shows pages label:', uploadResult.landingListHtml.includes('page'));

  await page.screenshot({ path: OUT + '/landing-upload-attached.png', fullPage: true });

  console.log('=== 3. Le document attaché est bien visible aussi dans la conversation ensuite ===');
  await page.fill('#clinical-question', 'Analyse ce document');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(500);
  const convoListHtml = await page.evaluate(() => document.getElementById('adoc-docs-list').innerHTML);
  console.log('conversation sidebar also shows the doc:', convoListHtml.includes('rapport-clinique.pdf'));

  console.log('=== errors ===', errors);
  await browser.close();
})();
