const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Stub pdf.js before the app script runs, so extractPDFText() exercises the real code path
  await page.addInitScript(() => {
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: ({ data }) => ({
        promise: Promise.resolve({
          numPages: 30,
          getPage: async (i) => ({
            getTextContent: async () => ({
              items: [{ str: `attachement lorem ipsum `.repeat(60) + ' page ' + i }]
            })
          })
        })
      })
    };
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(300);

  // Build a real File via DataTransfer and feed it through the real upload path
  const uploadResult = await page.evaluate(async () => {
    const blob = new Blob(['dummy pdf bytes'], { type: 'application/pdf' });
    const file = new File([blob], 'gros-livre.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);
    await window.adocHandleUpload(dt.files);
    await new Promise(r => setTimeout(r, 100));
    return document.querySelector('.adoc-doc-item .adoc-doc-name')?.textContent;
  });
  console.log('uploaded doc name:', uploadResult);

  await page.click('#adoc-docs-list .adoc-doc-item');
  await page.waitForTimeout(100);
  const notice1 = await page.evaluate(() => ({
    html: document.getElementById('adoc-doc-truncnotice').innerHTML,
    visible: document.getElementById('adoc-doc-truncnotice').classList.contains('visible'),
  }));
  console.log('notice before deep analysis:', notice1);

  await page.click('.adoc-doc-truncnotice button');
  await page.waitForTimeout(100);
  const notice2 = await page.evaluate(() => document.getElementById('adoc-doc-truncnotice').innerHTML);
  console.log('notice after deep analysis enabled:', notice2);

  await browser.close();
})();
