const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const documentTest = {
  schemaVersion: 1, documentId: 'doc-paste-font', versionId: 'doc-paste-font-v1', previousVersionId: null,
  requestId: 'request-paste-font', sourceSnapshotId: 'snapshot-paste-font',
  createdAt: '2026-10-24T12:00:00Z', language: 'fr', status: 'draft',
  title: 'Essai du collage', purpose: 'supervision', audience: 'clinicien',
  documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [{ id: 'paste-target', type: 'paragraph', content: { text: 'Début ' },
    style: { fontFamily: 'Georgia', fontSizePt: 22, lineHeight: 1.8 }, citationIds: [], validation: {} }],
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
      const ok = await page.evaluate(doc => {
        window._adocArtifacts = window._adocArtifacts || {};
        window._adocArtifacts.adocArt_paste = { name: 'Essai collage', _adocGenerationEngine: 'structured',
          _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: doc };
        return window.adocOpenWorkspace('adocArt_paste');
      }, structuredClone(documentTest));
      assert.equal(ok, true);
      const leaf = page.locator('#paste-target [data-cc-editor-leaf]');
      await leaf.click();
      await page.evaluate(() => {
        const target = document.querySelector('#paste-target [data-cc-editor-leaf]');
        const selection = getSelection();
        const range = document.createRange();
        range.selectNodeContents(target); range.collapse(false);
        selection.removeAllRanges(); selection.addRange(range);
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/html', '<p><span style="font-family:Arial;font-size:40pt;font-weight:bold;color:red;line-height:3;background:yellow">Texte Word</span></p>');
        clipboardData.setData('text/plain', 'Texte Word');
        target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
      });
      const result = await page.evaluate(() => {
        const target = document.querySelector('#paste-target [data-cc-editor-leaf]');
        const block = window._adocArtifacts.adocArt_paste._adocStructuredDoc.blocks[0];
        return { html: target.innerHTML, font: getComputedStyle(target).fontFamily,
          size: getComputedStyle(target).fontSize, weight: getComputedStyle(target).fontWeight,
          lineHeight: getComputedStyle(target).lineHeight, color: getComputedStyle(target).color,
          saved: block.editor?.html?.text || '' };
      });
      assert.match(result.font, /Georgia/);
      assert.ok(Math.abs(parseFloat(result.size) - 29.3333) < 0.01);
      assert.ok(Number(result.weight) < 700);
      assert.ok(Math.abs(parseFloat(result.lineHeight) / parseFloat(result.size) - 1.8) < 0.01);
      assert.notEqual(result.color, 'rgb(255, 0, 0)');
      assert.doesNotMatch(result.html, /Arial|40pt|font-size|font-weight|line-height|background|red/i);
      assert.doesNotMatch(result.saved, /Arial|40pt|font-size|font-weight|line-height|background|red/i);
      console.log(engine.name() + ': collage Word entièrement harmonisé, texte persisté');
    } finally { await browser.close(); }
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
