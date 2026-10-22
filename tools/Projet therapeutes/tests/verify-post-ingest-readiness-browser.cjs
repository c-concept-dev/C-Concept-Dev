const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('dialog', dialog => dialog.dismiss());
    await page.route('**/pdf.min.js', route => route.fulfill({ body: 'window.pdfjsLib = { GlobalWorkerOptions: {} };', contentType: 'application/javascript' }));
    await page.route('**/pdf.worker.min.js', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    let checkedBody = null;
    await page.route('**/verify-book-index', route => {
      checkedBody = route.request().postDataJSON();
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ready', d1_chunks: 3, expected_chunks: 3, vector_sample_found: 3, vector_sample_total: 3,
      }) });
    });
    await page.goto('file://' + path.join(__dirname, '../bibliotheque-admin.html'));
    await page.locator('#admin-key-input').fill('test-only');
    await page.locator('dialog button[value="connect"]').click();
    await page.evaluate(() => {
      queue = [{ id: 'readiness-test', status: 'verify_pending', meta: { book_id: 'book', title: 'Livre de test' },
        chunks: [{}, {}, {}], _acceptedVectorChunks: 3,
        _verifyInfo: { status: 'pending', d1_chunks: 3, vector_sample_found: 1, vector_sample_total: 3 } }];
      renderQueue();
    });
    assert.match(await page.locator('#qi-readiness-test').innerText(), /Disponibilité non confirmée/);
    await page.locator('#qi-readiness-test button').click();
    await page.waitForFunction(() => queue[0].status === 'done');
    assert.match(await page.locator('#qi-readiness-test').innerText(), /recherche confirmée sur échantillon/);
    assert.deepEqual(checkedBody.sample_ids, ['book-0', 'book-1', 'book-2']);
    console.log('PASS: real admin DOM shows pending, rechecks protected route, then shows ready');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
