const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const path = require('node:path');

const pageUrl = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const text = 'Il y a 300 000 ans, Néandertal enterrait ses morts.';
const doc = {
  schemaVersion: 1, documentId: 'size-test', versionId: 'size-test-v1', previousVersionId: null,
  requestId: 'size-test-request', sourceSnapshotId: 'size-test-source',
  createdAt: '2026-10-24T12:00:00Z', language: 'fr', status: 'draft',
  title: 'Essai taille', purpose: 'supervision', audience: 'clinicien',
  documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [{ id: 'size-target', type: 'paragraph', content: { text },
    style: { fontSizePt: 20, fontFamily: 'Georgia' },
    editor: { html: { text: '<span style="font-size:20px;font-family:Arial;color:red"><strong>' + text + '</strong></span>' } },
    citationIds: [], validation: {} }], citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
    accessibility: 'pending', humanClinicalReview: 'required' },
};

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
      await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
      await page.goto(pageUrl);
      await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function');
      await page.evaluate(async data => {
        window._adocArtifacts = window._adocArtifacts || {};
        window._adocArtifacts.sizeTest = { name: data.title, _adocGenerationEngine: 'structured',
          _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: data };
        await window.adocOpenWorkspace('sizeTest');
        document.getElementById('size-target').click();
      }, structuredClone(doc));
      const before = await page.locator('#size-target strong').evaluate(el => getComputedStyle(el).fontSize);
      assert.equal(before, '20px', 'la taille locale masque initialement celle du bloc');
      for (const [field, value] of [['fontSizePt', '7'], ['fontFamily', 'Georgia']]) {
        await page.evaluate(({ field, value }) => {
          const scope = document.querySelector('[data-editor-scope]');
          scope.value = 'block'; scope.dispatchEvent(new Event('change', { bubbles: true }));
          const input = document.querySelector('[data-editor-style="' + field + '"]');
          input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
        }, { field, value });
      }
      const after = await page.evaluate(() => {
        const el = document.querySelector('#size-target strong');
        const block = window._adocArtifacts.sizeTest._adocStructuredDoc.blocks[0];
        return { size: getComputedStyle(el).fontSize, family: getComputedStyle(el).fontFamily,
          html: block.editor.html.text, style: block.style };
      });
      assert.ok(Math.abs(parseFloat(after.size) - 9.3333) < 0.02, JSON.stringify(after));
      assert.match(after.family, /Georgia/);
      assert.equal(after.style.fontSizePt, 7);
      assert.doesNotMatch(after.html, /font-size|font-family/i);
      assert.match(after.html, /<strong\b/i, 'le gras reste intact');
      assert.match(after.html, /color:\s*red/i, 'la couleur reste intacte');
      console.log(engine.name() + ': taille et famille du bloc appliquées au texte, formatage préservé');
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
