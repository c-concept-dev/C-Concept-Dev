const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.route('**/pdf.min.js', route => route.fulfill({ body: 'window.pdfjsLib={GlobalWorkerOptions:{}};', contentType: 'application/javascript' }));
    await page.route('**/pdf.worker.min.js', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.goto('file://' + path.join(__dirname, '..', 'bibliotheque-admin.html'));
    await page.evaluate(() => {
      window.__pdfCalls = 0;
      window.__segmentCalls = 0;
      window.fetch = async url => {
        if (String(url).endsWith('/library-stats')) return new Response(JSON.stringify({
          total_chunks: 6, by_approach: [], books: [
            { book_id: 'book', book_title: 'A & B', author: 'Writer', language: 'en', approach: 'general' },
            { book_id: 'french', book_title: 'Livre français', author: 'Auteur', language: 'fr-FR', approach: 'general' },
            { book_id: 'spanish', book_title: 'Libro español', author: 'Autora', language: 'es', approach: 'general' },
            { book_id: 'german', book_title: 'Deutsches Buch', author: 'Autor', language: 'de', approach: 'general' },
            { book_id: 'arabic', book_title: 'Livre arabe', author: 'Auteur', language: 'ar', approach: 'general' },
            { book_id: 'unknown', book_title: 'Livre inconnu', author: 'Auteur', language: 'und', approach: 'general' }
          ]
        }), { status: 200 });
        if (String(url).endsWith('/book-translation-manifest')) return new Response(JSON.stringify({
          total_segments: 2, total_chunks: 1, chunks: [{ id: 'book-0', segment_count: 2, source_hash: 'a'.repeat(64) }]
        }), { status: 200 });
        if (String(url).endsWith('/book-translate-segment')) {
          window.__segmentCalls++;
          if (window.__segmentCalls === 2) return new Response(JSON.stringify({ error: 'Essai transitoire échoué' }), { status: 502 });
          const index = window.__segmentCalls === 1 ? 0 : 1;
          return new Response(JSON.stringify({ id: 'book-0', segment_index: index, segment_count: 2, translated_text: 'Texte traduit ' + index }), { status: 200 });
        }
        if (String(url).endsWith('/book-translation-pdf')) {
          window.__pdfCalls++;
          return new Response(new Blob(['%PDF-test'], { type: 'application/pdf' }), { status: 200,
            headers: { 'Content-Type': 'application/pdf' } });
        }
        return new Response('{}', { status: 200 });
      };
    });
    await page.locator('#admin-key-input').fill('test-only');
    await page.locator('dialog button[value="connect"]').click();
    await page.evaluate(() => refreshLibrary());
    await page.evaluate(() => switchTab('library'));
    const libraryText = await page.locator('#libraryContent').innerText();
    assert.match(libraryText, /EN · Anglais · À traduire/);
    assert.match(libraryText, /FR-FR · Français/);
    assert.match(libraryText, /ES · Espagnol · À traduire/);
    assert.match(libraryText, /DE · Allemand · À traduire/);
    assert.match(libraryText, /AR · Arabe · À traduire/);
    assert.match(libraryText, /Langue inconnue/);
    await page.locator('#libraryLangFilter').selectOption('other');
    assert.equal(await page.locator('#libraryContent .book-card:visible').count(), 4);
    await page.locator('#libraryLangFilter').selectOption('fr');
    assert.equal(await page.locator('#libraryContent .book-card:visible').count(), 1);
    await page.locator('#libraryLangFilter').selectOption('unknown');
    assert.equal(await page.locator('#libraryContent .book-card:visible').count(), 1);
    await page.locator('#libraryLangFilter').selectOption('other');
    await page.locator('#libraryContent .book-card').first().getByRole('button', { name: /Traduire et exporter en PDF/ }).click();
    await page.getByText('Dans un EPUB, le repère de lecture', { exact: false }).waitFor();
    assert.equal(await page.locator('#bookTranslationPanel progress').count(), 1);
    await page.getByRole('button', { name: 'Lancer la traduction' }).click();
    await page.getByText('Essai transitoire échoué', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.__pdfCalls), 0);
    assert.equal(await page.locator('#bookTranslationPanel progress').getAttribute('value'), '1');
    await page.getByRole('button', { name: /Réessayer le segment/ }).click();
    await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__pdfCalls), 0, 'No PDF call or automatic download after translation');
    await page.locator('#libraryLangFilter').selectOption('all');
    await page.locator('#libraryContent .book-card').nth(1).getByRole('button', { name: /Traduire et exporter en PDF/ }).click();
    assert.match(await page.locator('#bookTranslationPanel h3').innerText(), /A & B/,
      'A completed translation must not be discarded when another book is opened');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /A & B-traduction\.pdf/);
    assert.equal(await page.evaluate(() => window.__pdfCalls), 1);
    assert.equal(await page.locator('#bookTranslationPanel progress').getAttribute('value'), '2');
    console.log('PASS admin translation: book button, warning, real segment count, visible failure, retry, explicit second PDF click');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
