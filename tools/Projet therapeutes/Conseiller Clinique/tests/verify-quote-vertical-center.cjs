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
    { id: 'callout-enlarged', type: 'callout', content: { text: 'Un encadré coloré.', visualRole: 'warning' },
      style: { backgroundColor: '#eee2de', flowMinHeightPx: 320 }, citationIds: [], validation: {} },
    { id: 'callout-default', type: 'callout', content: { text: 'Un encadré ordinaire.', visualRole: 'info' },
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
      const calloutResult = await page.evaluate(() => {
        const block = document.getElementById('callout-enlarged');
        const text = block.querySelector('[data-cc-editor-leaf]');
        const normal = document.getElementById('callout-default');
        const box = block.getBoundingClientRect(), content = text.getBoundingClientRect();
        return { height: box.height, gapTop: content.top - box.top, gapBottom: box.bottom - content.bottom,
          display: getComputedStyle(block).display, normalDisplay: getComputedStyle(normal).display };
      });
      assert.ok(calloutResult.height >= 320);
      assert.ok(Math.abs(calloutResult.gapTop - calloutResult.gapBottom) < 18, JSON.stringify(calloutResult));
      assert.equal(calloutResult.display, 'flex');
      assert.notEqual(calloutResult.normalDisplay, 'flex');
      await page.locator('#callout-default').click();
      const resize = page.locator('#callout-default > .cc-flow-resize-handle[data-flow-resize="s"]');
      const handle = await resize.boundingBox();
      assert.ok(handle, 'bottom resize handle is present');
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 160, { steps: 6 });
      await page.mouse.up();
      const gesture = await page.evaluate(() => {
        const block = document.getElementById('callout-default');
        const text = block.querySelector('[data-cc-editor-leaf]');
        const outer = block.getBoundingClientRect(), inner = text.getBoundingClientRect();
        return { height: outer.height, gapTop: inner.top - outer.top, gapBottom: outer.bottom - inner.bottom,
          stored: window._adocArtifacts.adocArt_quoteCenter._adocStructuredDoc.blocks.find(b => b.id === 'callout-default').style?.flowMinHeightPx };
      });
      assert.ok(gesture.stored > 160, JSON.stringify(gesture));
      assert.ok(Math.abs(gesture.gapTop - gesture.gapBottom) < 18, JSON.stringify(gesture));
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
      console.log(engine.name() + ': citation et encadré agrandis centrés en fiche et présentation, blocs ordinaires inchangés');
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
