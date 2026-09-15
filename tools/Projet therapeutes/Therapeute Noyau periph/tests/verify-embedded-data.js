const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
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

  const result = await page.evaluate(() => {
    const out = {};
    try {
      const schemas = JSON.parse(document.getElementById('adoc-sc-schemas').textContent);
      out.schemaKeys = Object.keys(schemas);
    } catch (e) { out.schemaParseError = e.message; }
    try {
      const manifests = JSON.parse(document.getElementById('adoc-sc-render-manifests').textContent);
      out.manifestKeys = Object.keys(manifests);
    } catch (e) { out.manifestParseError = e.message; }
    try {
      const tokens = JSON.parse(document.getElementById('adoc-sc-tokens-snapshots').textContent);
      out.tokenKeys = Object.keys(tokens);
    } catch (e) { out.tokenParseError = e.message; }
    out.hasAjv = typeof window.Ajv2020 === 'function';
    out.hasAjvFormats = typeof window.ajvAddFormats === 'function';
    return out;
  });
  console.log(result);
  console.log('=== errors ===', errors);
  await browser.close();
})();
