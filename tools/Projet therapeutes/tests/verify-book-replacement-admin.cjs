const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/pdf.min.js', route => route.fulfill({
      body: 'window.pdfjsLib={GlobalWorkerOptions:{}};', contentType: 'application/javascript'
    }));
    await page.route('**/pdf.worker.min.js', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/jszip.min.js', route => route.fulfill({ body: 'window.JSZip=function(){};', contentType: 'application/javascript' }));
    await page.route('**/fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.goto('file://' + path.join(__dirname, '../bibliotheque-admin.html'), { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('Loaded replacement UI');
    const result = await page.evaluate(async () => {
      getAdminApiKey = async () => 'test-only';
      const old = { book_id: 'PNL pour les nuls', book_title: 'PNL pour les nuls',
        author: 'Auteur', language: 'fr', approach: 'pnl' };
      window._libBooks = [old];
      let detectionCalls = 0;
      samplePDFLanguageText = () => { detectionCalls++; throw new Error('No language rescan expected'); };
      extractPDFText = async (_file, progress) => {
        progress(50);
        return { pages: [{ page: 1, text: 'Une nouvelle extraction complète. '.repeat(30) }], numPages: 1, ocrPagesCount: 0 };
      };
      chunkPages = () => [{ content: 'Un passage fiable. '.repeat(30), page: 1 }];
      const calls = [];
      let releaseIngest;
      window.fetch = async (url, options) => {
        const endpoint = String(url).split('/').pop();
        calls.push(endpoint);
        if (endpoint === 'library-stats') return new Response(JSON.stringify({ books: [old] }), { status: 200 });
        if (endpoint === 'ingest') {
          await new Promise(resolve => { releaseIngest = resolve; });
          return new Response(JSON.stringify({ chunks_d1: 1, chunks_vectorize: 1 }), { status: 200 });
        }
        if (endpoint === 'verify-book-index') return new Response(JSON.stringify({
          status: 'ready', d1_chunks: 1, expected_chunks: 1, vector_sample_found: 1, vector_sample_total: 1
        }), { status: 200 });
        if (endpoint === 'delete-book') {
          if (JSON.parse(options.body).book_id !== old.book_id) throw new Error('Wrong book deleted');
          return new Response(JSON.stringify({ success: true, deleted_chunks: 233 }), { status: 200 });
        }
        throw new Error('Unexpected endpoint: ' + endpoint);
      };
      prepareReplaceTab();
      document.getElementById('replaceOldBook').value = '0';
      onReplaceOldBookChange();
      const input = document.getElementById('replaceFileInput');
      const files = new DataTransfer();
      files.items.add(new File(['synthetic PDF'], 'nouvelle-version.pdf', { type: 'application/pdf' }));
      input.files = files.files;
      input.dispatchEvent(new Event('change'));
      const replacement = queue.find(q => q.id === _replaceQueueId);
      const inheritedLanguage = replacement.meta.language;
      await replacement._languageDetectionPromise;
      const languageAfterDetection = replacement.meta.language;
      // Another queued book must never be ingested by the replacement button.
      queue.push({ id: 'other', file: new File(['x'], 'other.pdf'), status: 'pending',
        meta: { book_id: 'other', title: 'Other', language: 'fr' }, chunks: [] });
      const replacementRun = replaceIngestNew();
      for (let i = 0; i < 20 && !releaseIngest; i++) await new Promise(resolve => setTimeout(resolve, 0));
      const progressDuringIngest = document.getElementById('replaceProgressText').textContent;
      const progressVisible = !document.getElementById('replaceProgress').hidden;
      if (!releaseIngest) throw new Error('Replacement did not reach ingestion');
      releaseIngest();
      await replacementRun;
      return { inheritedLanguage, languageAfterDetection, status: replacement.status,
        finalized: replacement._replacementFinalized,
        otherStatus: queue.find(q => q.id === 'other').status, calls,
        detectionCalls, progressDuringIngest, progressVisible,
        panel: document.getElementById('replaceStatus').innerText };
    });
    assert.equal(result.inheritedLanguage, 'fr');
    assert.equal(result.languageAfterDetection, 'fr');
    assert.equal(result.detectionCalls, 0, 'Known language must not cause a second scan of the PDF');
    assert.equal(result.progressVisible, true);
    assert.match(result.progressDuringIngest, /Indexation : 0 \/ 1|passages préparés/);
    assert.equal(result.status, 'done');
    assert.equal(result.finalized, true);
    assert.equal(result.otherStatus, 'pending');
    assert.deepEqual(result.calls.filter(call => call === 'ingest'), ['ingest']);
    assert.deepEqual(result.calls.filter(call => call === 'delete-book'), ['delete-book']);
    assert.match(result.panel, /Remplacement terminé/);
    assert.doesNotMatch(result.panel, /statut : pending|n'a pas réussi/);
    const failed = await page.evaluate(async () => {
      let deleteCalls = 0;
      window.fetch = async url => {
        if (!String(url).endsWith('/delete-book')) return new Response(JSON.stringify({ books: [] }), { status: 200 });
        deleteCalls++;
        return new Response(JSON.stringify({ success: false, error: 'suppression refusée' }), { status: 500 });
      };
      const q = { id: 'failed-replacement', status: 'verify_pending', _replacementOf: 'old', chunks: [{}],
        meta: { title: 'Nouveau livre' } };
      await finishReplacement(q);
      const pendingDeleteCalls = deleteCalls;
      q.status = 'done';
      await finishReplacement(q);
      return { pendingDeleteCalls, deleteCalls, finalized: q._replacementFinalized,
        error: q._replacementDeleteError };
    });
    assert.equal(failed.pendingDeleteCalls, 0, 'Pending verification must never delete the old book');
    assert.equal(failed.deleteCalls, 1);
    assert.equal(failed.finalized, undefined, 'A failed deletion must not be shown as finalized');
    assert.match(failed.error, /suppression refusée/);
    const delayed = await page.evaluate(async () => {
      const calls = [];
      window.fetch = async url => {
        const endpoint = String(url).split('/').pop();
        calls.push(endpoint);
        if (endpoint === 'verify-book-index') return new Response(JSON.stringify({
          status: 'ready', d1_chunks: 1, vector_sample_found: 1, vector_sample_total: 1
        }), { status: 200 });
        if (endpoint === 'delete-book') return new Response(JSON.stringify({ success: true, deleted_chunks: 10 }), { status: 200 });
        if (endpoint === 'library-stats') return new Response(JSON.stringify({ books: [] }), { status: 200 });
        throw new Error('Unexpected endpoint: ' + endpoint);
      };
      const q = { id: 'delayed', status: 'verify_pending', _replacementOf: 'old',
        chunks: [{}], meta: { book_id: 'new', title: 'New', language: 'fr' } };
      queue = [q];
      await verifyQueuedBookIndex(q.id);
      return { status: q.status, finalized: q._replacementFinalized, calls };
    });
    assert.equal(delayed.status, 'done');
    assert.equal(delayed.finalized, true);
    assert.deepEqual(delayed.calls.slice(0, 2), ['verify-book-index', 'delete-book']);
    console.log('PASS: replacement preserves language, scopes ingestion, verifies new index, deletes old only on ready, and reports deletion failure');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
