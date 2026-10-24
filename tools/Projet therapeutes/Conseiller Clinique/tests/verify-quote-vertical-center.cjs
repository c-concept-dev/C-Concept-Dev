const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const documentTest = {
  schemaVersion: 1, documentId: 'quote-center-test', versionId: 'quote-center-test-v1',
  previousVersionId: null, requestId: 'quote-center-request', sourceSnapshotId: 'quote-center-snapshot',
  createdAt: '2026-10-24T12:00:00Z', language: 'fr', status: 'draft', title: 'Essai citation',
  purpose: 'supervision', audience: 'clinicien', documentKind: 'fiche',
  renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [
    { id: 'quote-enlarged', type: 'quote', content: { text: 'Une citation sur deux lignes.' },
      style: { backgroundColor: '#eee2de', flowMinHeightPx: 320 }, citationIds: [], validation: {} },
    { id: 'quote-default', type: 'quote', content: { text: 'Une citation ordinaire.' },
      citationIds: [], validation: {} },
  ],
  citations: [], validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending',
    layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
};

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
      await page.route('**/*', route => /^file:/.test(route.request().url()) ? route.continue() : route.abort());
      await page.goto(PAGE);
      await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function');
      assert.equal(await page.evaluate(doc => {
        window._adocArtifacts = window._adocArtifacts || {};
        window._adocArtifacts.adocArt_quoteCenter = { name: doc.title, _adocGenerationEngine: 'structured',
          _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: doc };
        return window.adocOpenWorkspace('adocArt_quoteCenter');
      }, structuredClone(documentTest)), true);
      const result = await page.evaluate(() => {
        const quote = document.getElementById('quote-enlarged');
        const text = quote.querySelector('[data-cc-editor-leaf]');
        const normal = document.getElementById('quote-default');
        const box = quote.getBoundingClientRect(), content = text.getBoundingClientRect();
        return { height: box.height, gapTop: content.top - box.top, gapBottom: box.bottom - content.bottom,
          display: getComputedStyle(quote).display, normalDisplay: getComputedStyle(normal).display,
          normalStyle: normal.getAttribute('style') || '', text: text.textContent };
      });
      assert.ok(result.height >= 320);
      assert.ok(Math.abs(result.gapTop - result.gapBottom) < 18, JSON.stringify(result));
      assert.equal(result.display, 'flex');
      assert.notEqual(result.normalDisplay, 'flex');
      assert.doesNotMatch(result.normalStyle, /justify-content/);
      assert.equal(result.text, 'Une citation sur deux lignes.');
      const presentation = structuredClone(documentTest);
      presentation.documentKind = 'presentation';
      presentation.blocks = [{ id: 'quote-card', type: 'card', content: {
        title: 'Citation sur une diapositive', imageRef: null, imageAlt: null,
        blocks: presentation.blocks }, citationIds: [], validation: {} }];
      assert.equal(await page.evaluate(doc => {
        window._adocArtifacts.adocArt_quoteCenter._adocStructuredDoc = doc;
        return window.adocOpenWorkspace('adocArt_quoteCenter');
      }, presentation), true);
      const inSlide = await page.evaluate(() => {
        const quote = document.getElementById('quote-enlarged');
        const text = quote.querySelector('[data-cc-editor-leaf]');
        const box = quote.getBoundingClientRect(), content = text.getBoundingClientRect();
        return { gapTop: content.top - box.top, gapBottom: box.bottom - content.bottom };
      });
      assert.ok(Math.abs(inSlide.gapTop - inSlide.gapBottom) < 18, JSON.stringify(inSlide));
      console.log(engine.name() + ': citation agrandie centrée en fiche et présentation, citation ordinaire inchangée');
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
