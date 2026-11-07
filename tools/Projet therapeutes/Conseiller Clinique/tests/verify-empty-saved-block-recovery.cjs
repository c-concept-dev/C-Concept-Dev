const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { ROOT, doc } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const saved = doc();
  saved.blocks[0].content.blocks[0].content.text = '';
  const posts = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const dialogs = [];
    page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-local'));
    await page.route('https://**/*', route => {
      const req = route.request();
      if (req.method() === 'POST' && req.url().includes('/clinical-documents')) posts.push(req.url());
      if (req.method() === 'GET' && /\/clinical-documents\/test-empty$/.test(req.url())) {
        return route.fulfill({ json: {
          document_id: 'test-empty', title: saved.title, document_kind: 'presentation', generation_engine: 'structured',
          version: { version_id: 'v1', created_at: '2026-11-07T10:00:00Z', document: {
            clinicalDocument: saved, sourceSnapshot: { sourceSnapshotId: saved.sourceSnapshotId, entries: [] },
          } },
        } });
      }
      return route.fulfill({ json: { results: [], items: [], books: [], total: 0 } });
    });
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    assert.equal(await page.evaluate(() => adocOpenSavedClinicalDocument('test-empty')), true);
    const recovered = await page.evaluate(() => {
      const art = window._adocArtifacts[window._adocWsState.storeKey];
      return { text: art._adocStructuredDoc.blocks[0].content.blocks[0].content.text,
        dirty: art._ccEditorDirty, count: art._adocRecoveredEmptyBlocks,
        status: document.getElementById('cc-ws-save-status').textContent,
        outline: document.getElementById('h1').style.outlineStyle };
    });
    assert.deepEqual(recovered, { text: 'Titre à compléter', dirty: true, count: 1,
      status: 'Modifications non sauvegardées', outline: 'solid' });
    assert.equal(saved.blocks[0].content.blocks[0].content.text, '');
    assert.ok(dialogs.some(s => s.includes('version précédente est conservée')));
    await page.evaluate(() => {
      const leaf = document.querySelector('#h1 [data-cc-editor-leaf]');
      if (!leaf) throw new Error('Bloc h1 absent');
      leaf.innerHTML = '';
      window.adocWsSave();
    });
    await page.waitForTimeout(100);
    assert.equal(posts.length, 0, 'aucune sauvegarde invalide envoyée au Worker : ' + posts.join(', '));
    assert.ok(dialogs.some(s => s.includes('Un bloc de texte est vide')));
    console.log('PASS récupération explicite sans sauvegarde silencieuse ; bloc vide refusé avant POST');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
