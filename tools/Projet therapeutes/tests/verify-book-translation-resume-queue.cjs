const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const jszipBrowserPath = require.resolve('jszip/dist/jszip.min.js');

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    await context.addInitScript(() => localStorage.setItem('bibliotheque-admin:clone-proxy-api-key:v1', 'test-only'));
    const calls = [];
    let failASecondSegment = true;
    let hashB = 'b'.repeat(64);
    let pdfCalls = 0;
    const page = await context.newPage();
    await page.route('**/*', async route => {
      const url = route.request().url();
      const pathname = new URL(url).pathname;
      if (url === 'https://library-admin.test/bibliotheque-admin.html') return route.fulfill({
        path: path.join(__dirname, '..', 'bibliotheque-admin.html'), contentType: 'text/html'
      });
      if (pathname.endsWith('/pdf.min.js')) return route.fulfill({ body: 'window.pdfjsLib={GlobalWorkerOptions:{}};', contentType: 'application/javascript' });
      if (pathname.endsWith('/pdf.worker.min.js')) return route.fulfill({ body: '', contentType: 'application/javascript' });
      if (pathname.endsWith('/jszip.min.js')) return route.fulfill({ path: jszipBrowserPath, contentType: 'application/javascript' });
      if (pathname.endsWith('/vendor/book-franc-min-6.2.0.js')) return route.fulfill({
        path: path.join(__dirname, '..', 'vendor', 'book-franc-min-6.2.0.js'), contentType: 'application/javascript'
      });
      if (url.includes('fonts.googleapis.com')) return route.fulfill({ body: '', contentType: 'text/css' });
      if (pathname === '/library-stats') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        total_books: 2, total_chunks: 2, by_approach: [], books: [
          { book_id: 'A', book_title: 'Book A', author: 'Author A', language: 'en', approach: 'general' },
          { book_id: 'B', book_title: 'Book B', author: 'Author B', language: 'en', approach: 'general' }
        ]
      }) });
      if (pathname === '/book-translation-manifest') {
        const { book_id } = route.request().postDataJSON();
        const hash = book_id === 'A' ? 'a'.repeat(64) : hashB;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          book_id, total_segments: 2, total_chunks: 1,
          chunks: [{ id: `${book_id}-0`, chunk_index: 0, segment_count: 2, source_hash: hash }]
        }) });
      }
      if (pathname === '/book-translate-segment') {
        const body = route.request().postDataJSON();
        calls.push(`${body.book_id}${body.segment_index}`);
        if (body.book_id === 'A' && body.segment_index === 1 && failASecondSegment) {
          failASecondSegment = false;
          return route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"Échec simulé"}' });
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          id: body.id, segment_index: body.segment_index, segment_count: 2,
          translated_text: `Texte ${body.book_id}${body.segment_index}`
        }) });
      }
      if (pathname === '/book-translation-pdf') {
        pdfCalls++;
        return route.fulfill({ contentType: 'application/pdf', body: '%PDF-test' });
      }
      return route.abort();
    });
    await page.goto('https://library-admin.test/bibliotheque-admin.html');
    await page.evaluate(() => switchTab('library'));
    await page.locator('#libraryContent .book-card').first().waitFor();
    await page.getByRole('button', { name: 'Sélectionner les livres non français affichés' }).click();
    await page.getByRole('button', { name: 'Ajouter à la file' }).click();
    assert.equal(await page.locator('#bookTranslationQueueStatus li').count(), 2, 'The two books must be queued once each');
    await page.getByRole('button', { name: 'Préparer et chiffrer la file' }).click();
    await page.getByText('Avant lancement :', { exact: false }).waitFor();
    assert.match(await page.locator('#bookTranslationQueueStatus').innerText(), /4 segments IA restants.*USD/s,
      'The preflight must show the call count and an indicative USD cost before launch');
    assert.deepEqual(calls, [], 'Estimating the cost must not invoke paid AI');
    await page.getByRole('button', { name: 'Lancer / reprendre la file' }).click();
    await page.locator('#bookTranslationQueueStatus .error').waitFor();
    assert.deepEqual(calls, ['A0', 'A1'], 'A failure must stop the queue before book B');
    assert.equal(await page.locator('#bookTranslationPanel progress').getAttribute('value'), '1', 'Only the committed segment counts');

    await page.reload();
    await page.evaluate(() => switchTab('library'));
    await page.locator('#libraryContent .book-card').first().waitFor();
    assert.equal(await page.locator('#bookTranslationQueueStatus li').count(), 2, 'Queue metadata survives reload');
    await page.waitForTimeout(400);
    assert.deepEqual(calls, ['A0', 'A1'], 'Reload must never restart paid AI calls automatically');
    await page.getByRole('button', { name: 'Préparer et chiffrer la file' }).click();
    await page.getByText('Avant lancement :', { exact: false }).waitFor();
    assert.deepEqual(calls, ['A0', 'A1'], 'Estimating after reload must not invoke paid AI');
    await page.getByRole('button', { name: 'Lancer / reprendre la file' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('#bookTranslationQueueStatus li')]
      .every(li => li.textContent.includes('Traduit — PDF à télécharger')));
    assert.deepEqual(calls, ['A0', 'A1', 'A1', 'B0', 'B1'], 'Resume reuses A0 and runs books sequentially');
    assert.equal(pdfCalls, 0, 'No PDF is generated or downloaded automatically');

    await page.locator('#bookTranslationQueueStatus li').first().getByRole('button', { name: 'Ouvrir' }).click();
    await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
    await downloadPromise;
    assert.equal(pdfCalls, 1, 'PDF requires its own explicit click');

    hashB = 'c'.repeat(64);
    await page.locator('#bookTranslationQueueStatus li').nth(1).getByRole('button', { name: 'Ouvrir' }).click();
    await page.getByRole('button', { name: 'Lancer la traduction' }).waitFor();
    assert.equal(await page.locator('#bookTranslationPanel progress').getAttribute('value'), '0',
      'A changed source hash invalidates prior translated segments');
    console.log('PASS: checkpoint after each segment, reload, explicit queue resume, sequential books, PDF click, hash invalidation');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
