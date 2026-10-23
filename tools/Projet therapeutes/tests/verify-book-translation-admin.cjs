const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const jszipBrowserPath = require.resolve('jszip/dist/jszip.min.js');

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.route('**/pdf.min.js', route => route.fulfill({ body: 'window.pdfjsLib={GlobalWorkerOptions:{}};', contentType: 'application/javascript' }));
    await page.route('**/pdf.worker.min.js', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/jszip.min.js', route => route.fulfill({
      path: jszipBrowserPath, contentType: 'application/javascript'
    }));
    await page.route('**/vendor/book-franc-min-6.2.0.js', route => route.fulfill({
      path: path.join(__dirname, '..', 'vendor', 'book-franc-min-6.2.0.js'), contentType: 'application/javascript'
    }));
    await page.route('**/fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.route('**/library-stats', route => route.fulfill({ body: JSON.stringify({ total_chunks: 0, books: [] }), contentType: 'application/json' }));
    await page.route('https://library-admin.test/bibliotheque-admin.html', route => route.fulfill({
      path: path.join(__dirname, '..', 'bibliotheque-admin.html'), contentType: 'text/html'
    }));
    await page.goto('https://library-admin.test/bibliotheque-admin.html');
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
    await page.waitForFunction(() => localStorage.getItem(ADMIN_KEY_STORAGE_KEY) === 'test-only');
    assert.equal(await page.evaluate(() => localStorage.getItem(ADMIN_KEY_STORAGE_KEY)), 'test-only');
    await page.evaluate(() => refreshLibrary());
    await page.evaluate(() => addFiles([new File(['Texte de test'], 'nouveau.pdf', { type: 'application/pdf' })]));
    const importLanguage = page.locator('#queue select[onchange*="language"]');
    assert.equal(await importLanguage.locator('option').count(), 26);
    assert.equal(await importLanguage.inputValue(), '', 'An unread PDF must never default silently to French');
    await importLanguage.selectOption('es');
    assert.equal(await page.evaluate(() => queue[0].meta.language), 'es');
    await page.evaluate(async () => { await queue[0]._languageDetectionPromise; });
    assert.equal(await page.evaluate(() => queue[0].meta.language), 'es', 'Late detection must not replace a manual choice');
    const languageSamples = await page.evaluate(() => {
      const examples = {
        fr: 'La thérapie de couple aide les personnes à comprendre leurs émotions et à améliorer leur communication. Chaque séance permet de réfléchir aux besoins de chacun et de construire une relation plus stable. ',
        en: 'This book explains how couples can improve communication and understand the emotions behind conflict. Each chapter offers practical exercises to develop healthier habits and build a stronger relationship. ',
        es: 'Este libro explica cómo las parejas pueden mejorar la comunicación y comprender las emociones detrás de cada conflicto. Cada capítulo ofrece ejercicios prácticos para desarrollar hábitos más saludables. ',
        de: 'Dieses Buch erklärt, wie Paare ihre Kommunikation verbessern und die Gefühle hinter einem Konflikt verstehen können. Jedes Kapitel bietet praktische Übungen für eine gesündere Beziehung. '
      };
      return Object.fromEntries(Object.entries(examples).map(([code, sample]) => [code, detectBookLanguageFromText(sample.repeat(15))]));
    });
    assert.deepEqual(languageSamples, { fr: 'fr', en: 'en', es: 'es', de: 'de' });
    await page.evaluate(() => addFiles([new File([`<html lang="es"><body>${'Este libro explica cómo las parejas pueden mejorar la comunicación y comprender las emociones de cada persona. '.repeat(20)}</body></html>`], 'espanol.html', { type: 'text/html' })]));
    await page.evaluate(async () => { await queue[1]._languageDetectionPromise; });
    assert.equal(await page.evaluate(() => queue[1].meta.language), 'es', 'HTML text/metadata should prefill language');
    await page.evaluate(() => {
      pdfjsLib.getDocument = () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({
        getTextContent: async () => ({ items: [{ str: 'This book explains how couples can improve communication and understand the emotions behind conflict. Each chapter offers practical exercises to develop healthier habits and build a stronger relationship. '.repeat(15) }] })
      }) }) });
      addFiles([new File(['fake pdf'], 'english.pdf', { type: 'application/pdf' })]);
    });
    await page.evaluate(async () => { await queue[2]._languageDetectionPromise; });
    assert.equal(await page.evaluate(() => queue[2].meta.language), 'en', 'PDF text layer should prefill language');
    await page.evaluate(async () => {
      const zip = new JSZip();
      zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
      zip.file('OEBPS/content.opf', '<package><metadata><dc:language xmlns:dc="http://purl.org/dc/elements/1.1/">it-IT</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>');
      zip.file('OEBPS/c1.xhtml', '<html><body><p>Questo libro aiuta le coppie a comprendere le emozioni e a migliorare la comunicazione nelle relazioni. Ogni capitolo offre esercizi pratici per costruire una relazione più forte. '.repeat(20) + '</p></body></html>');
      addFiles([new File([await zip.generateAsync({ type: 'blob' })], 'italiano.epub', { type: 'application/epub+zip' })]);
    });
    await page.evaluate(async () => { await queue[3]._languageDetectionPromise; });
    assert.equal(await page.evaluate(() => queue[3].meta.language), 'it', 'EPUB metadata should support languages beyond FR/EN');
    assert.equal(await page.evaluate(() => detectBookLanguageFromText('こんにちは世界の人々に向けて日本語の文章を読みます。'.repeat(50))), 'ja');
    const blockedUnknown = await page.evaluate(async () => {
      const previous = queue;
      const previousFetch = window.fetch;
      let ingestCalls = 0;
      queue = [{ id: 'unknown-lang', file: new File(['scan'], 'scan.pdf'), fileType: 'pdf',
        meta: { book_id: 'scan', title: 'Scan', language: '', approach: 'general' },
        status: 'pending', chunks: [], error: null }];
      window.fetch = async (url, options) => {
        if (String(url).endsWith('/ingest')) ingestCalls++;
        return previousFetch(url, options);
      };
      await startIngestion();
      const state = { ingestCalls, status: queue[0].status, hint: queue[0]._languageHint };
      window.fetch = previousFetch;
      queue = previous;
      renderQueue();
      return state;
    });
    assert.equal(blockedUnknown.ingestCalls, 0, 'Unknown-language scans must never reach /ingest');
    assert.equal(blockedUnknown.status, 'pending', 'Unknown-language book must stay editable');
    assert.match(blockedUnknown.hint, /Langue à préciser/);
    await page.evaluate(() => editBookMeta('spanish', 'Libro español', 'general', 'Autora', 'pt'));
    assert.equal(await page.locator('#edit-lang').inputValue(), 'pt');
    assert.equal(await page.locator('#edit-lang option[value="de"]').textContent(), 'DE · Allemand');
    await page.locator('#edit-overlay').evaluate(el => el.remove());
    await page.evaluate(() => editBookMeta('old', 'Ancien livre', 'general', 'Auteur', 'und'));
    assert.equal(await page.locator('#edit-lang').inputValue(), 'und', 'Unknown existing metadata must not silently become French');
    await page.locator('#edit-overlay').evaluate(el => el.remove());
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
    await page.locator('#libraryBookSearch').fill('LIBRO');
    assert.equal(await page.locator('#libraryContent .book-card:visible').count(), 1);
    assert.match(await page.locator('#libraryContent .book-card:visible').innerText(), /Libro español/);
    await page.locator('#libraryBookSearch').fill('livre francais');
    assert.equal(await page.locator('#libraryContent .book-card:visible').count(), 0,
      'Title search and language filter must combine');
    assert.match(await page.locator('#libraryFilterStatus').innerText(), /aucun livre/);
    await page.locator('#libraryLangFilter').selectOption('fr');
    assert.equal(await page.locator('#libraryContent .book-card:visible').count(), 1);
    await page.locator('#libraryBookSearch').fill('');
    await page.locator('#libraryLangFilter').selectOption('unknown');
    assert.equal(await page.locator('#libraryContent .book-card:visible').count(), 1);
    await page.locator('#libraryLangFilter').selectOption('other');
    await page.locator('#libraryContent .book-card').first().getByRole('button', { name: /Traduire et exporter en PDF/ }).click();
    await page.getByText('Dans un EPUB, le repère de lecture', { exact: false }).waitFor();
    await page.locator('#bookTranslationPanel progress').waitFor();
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
    assert.match(await page.locator('#bookTranslationPanel h3').innerText(), /Livre français/,
      'An inactive book can be opened while the completed translation is checkpointed');
    await page.locator('#libraryContent .book-card').first().getByRole('button', { name: /Traduire et exporter en PDF/ }).click();
    await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).waitFor();
    assert.equal(await page.locator('#bookTranslationPanel progress').getAttribute('value'), '2',
      'Returning to a completed book must restore all locally saved segments');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /A & B-traduction\.pdf/);
    assert.equal(await page.evaluate(() => window.__pdfCalls), 1);
    assert.equal(await page.locator('#bookTranslationPanel progress').getAttribute('value'), '2');
    await page.reload();
    assert.equal(await page.locator('#admin-key-input').count(), 0, 'Reload must reuse the locally stored key');
    assert.equal(await page.evaluate(() => getAdminApiKey()), 'test-only');
    await page.close();
    const reopened = await context.newPage();
    await reopened.route('**/pdf.min.js', route => route.fulfill({ body: 'window.pdfjsLib={GlobalWorkerOptions:{}};', contentType: 'application/javascript' }));
    await reopened.route('**/vendor/book-franc-min-6.2.0.js', route => route.fulfill({
      path: path.join(__dirname, '..', 'vendor', 'book-franc-min-6.2.0.js'), contentType: 'application/javascript'
    }));
    await reopened.route('**/library-stats', route => route.fulfill({ body: JSON.stringify({ total_chunks: 0, books: [] }), contentType: 'application/json' }));
    await reopened.route('https://library-admin.test/bibliotheque-admin.html', route => route.fulfill({
      path: path.join(__dirname, '..', 'bibliotheque-admin.html'), contentType: 'text/html'
    }));
    await reopened.goto('https://library-admin.test/bibliotheque-admin.html');
    assert.equal(await reopened.locator('#admin-key-input').count(), 0, 'New tab must reuse the locally stored key');
    assert.equal(await reopened.evaluate(() => getAdminApiKey()), 'test-only');
    await reopened.getByRole('button', { name: 'Oublier la clé' }).click();
    assert.equal(await reopened.evaluate(() => localStorage.getItem(ADMIN_KEY_STORAGE_KEY)), null);
    assert.equal(await reopened.evaluate(() => adminApiKey), '');
    await reopened.evaluate(async () => {
      rememberAdminApiKey('test-only');
      window.fetch = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      try { await bookTranslationPost('/book-translation-manifest', { book_id: 'book' }); } catch {}
    });
    assert.equal(await reopened.evaluate(() => localStorage.getItem(ADMIN_KEY_STORAGE_KEY)), null,
      'An HTTP 401 must clear the persisted key');
    console.log('PASS admin library: offline language detection and manual override, title search, translation retry and explicit PDF click');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
