const { webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://c-concept-dev.github.io';
let families = [
  { label: 'Georgia', family: 'Georgia', postscriptName: 'Georgia' },
  { label: 'Pompiere', family: 'Pompiere ', postscriptName: 'Pompiere-Regular', fontId: 'a'.repeat(64) },
];
let fontReads = 0;
const doc = {
  schemaVersion: 1, documentId: 'font-sync-test', versionId: 'font-sync-test-v1', previousVersionId: null,
  requestId: 'font-sync-request', sourceSnapshotId: 'font-sync-snapshot',
  createdAt: '2026-10-24T12:00:00Z', language: 'fr', status: 'draft', title: 'Essai polices',
  purpose: 'supervision', audience: 'clinicien', documentKind: 'fiche',
  renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [{ id: 'font-sync-paragraph', type: 'paragraph', content: { text: 'Texte de contrôle' },
    citationIds: [], validation: {} }], citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
    accessibility: 'pending', humanClinicalReview: 'required' },
};

(async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'https://127.0.0.1:43839' && url.pathname === '/v1/fonts') {
        return route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': ORIGIN }, body: JSON.stringify({ version: 1, families }) });
      }
      if (url.origin === 'https://127.0.0.1:43839' && /^\/v1\/font\/[0-9a-f]{64}$/.test(url.pathname)) {
        fontReads++;
        return route.fulfill({ status: 200, contentType: 'font/ttf',
          headers: { 'Access-Control-Allow-Origin': ORIGIN },
          body: fs.readFileSync(path.resolve(ROOT, '../../Atelier Prompts/core/documents/vendor/pdf/standard_fonts/LiberationSans-Regular.ttf')) });
      }
      if (url.origin !== ORIGIN) return route.abort();
      const file = path.resolve(ROOT, decodeURIComponent(url.pathname).slice(1));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html'
        : file.endsWith('.json') ? 'application/json' : 'text/javascript' });
    });
    await page.goto(ORIGIN + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function');
    const opened = await page.evaluate(value => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.adocArt_fontSync = { name: 'Essai polices', _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: value };
      return window.adocOpenWorkspace('adocArt_fontSync');
    }, doc);
    assert.equal(opened, true);
    await page.locator('#font-sync-paragraph').click();
    await page.locator('details.cc-editor-text-format > summary').click();
    const values = () => page.locator('select[data-editor-style="fontFamily"] option').evaluateAll(
      options => options.map(option => ({ value: option.value, group: option.parentElement.label || '' })));
    await page.waitForFunction(() => !!document.querySelector('optgroup[label="Polices actives sur ce Mac"]'));
    let listed = await values();
    assert.ok(listed.some(item => item.value === 'Pompiere' && item.group === 'Polices actives sur ce Mac'));
    assert.ok(!listed.some(item => item.value === 'Academy Engraved LET'));
    await page.locator('[data-font-picker-toggle]').click();
    if (process.env.STUDIO_FONT_PREVIEW_SCREENSHOT)
      await page.screenshot({ path: process.env.STUDIO_FONT_PREVIEW_SCREENSHOT });
    await page.locator('[data-font-picker-search]').fill('Pompiere');
    const pompiereOption = page.locator('[data-font-picker-list] [data-font-value="Pompiere"]');
    await pompiereOption.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-font-picker-list] [data-font-value="Pompiere"]')?.dataset.fontPreviewReady === '1');
    assert.match(await pompiereOption.evaluate(el => getComputedStyle(el).fontFamily), /StudioPreview_/,
      'the menu previews the real local font');
    await pompiereOption.click();
    await page.waitForFunction(() => [...document.fonts].some(face => face.family === 'Pompiere' && face.status === 'loaded'));
    assert.equal(fontReads, 2, 'one temporary preview and one selected font load');
    assert.equal(await page.evaluate(() => [...document.fonts].filter(face => face.family.startsWith('StudioPreview_')).length), 0,
      'temporary preview faces are released when the menu closes');
    assert.equal(await page.locator('select[data-editor-style="fontFamily"]').inputValue(), 'Pompiere');
    assert.equal(await page.evaluate(() => window._adocArtifacts.adocArt_fontSync._adocStructuredDoc.blocks[0].style.fontFamily), 'Pompiere');
    assert.match(await page.locator('#font-sync-paragraph').evaluate(el => getComputedStyle(el).fontFamily), /Pompiere/);

    families[1].fontId = 'b'.repeat(64);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => [...document.fonts].filter(face => face.family === 'Pompiere' && face.status === 'loaded').length === 1);
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/v1/font/' + 'b'.repeat(64))));
    assert.equal(await page.evaluate(() => [...document.fonts].filter(face => face.family === 'Pompiere').length), 1,
      'a font replaced in place supersedes its previous face');

    families = [families[1], { label: 'Police Nouvelle', family: 'Police Nouvelle', postscriptName: 'Police-Nouvelle' }];
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => !!document.querySelector('option[value="Police Nouvelle"]'));
    listed = await values();
    assert.ok(listed.some(item => item.value === 'Police Nouvelle'));
    assert.ok(!listed.some(item => item.group === 'Polices actives sur ce Mac' && item.value === 'Georgia'));
    families = Array.from({ length: 80 }, (_, i) => ({ label: 'Police ' + String(i).padStart(3, '0'),
      family: 'Police ' + String(i).padStart(3, '0'), postscriptName: 'Police-' + i,
      fontId: (i + 1).toString(16).padStart(64, '0') }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => !!document.querySelector('option[value="Police 079"]'));
    assert.match(await page.locator('[data-font-picker-toggle]').innerText(), /Pompiere — absente/);
    await page.locator('[data-font-picker-toggle]').click();
    await page.waitForTimeout(500);
    const firstViewportReads = fontReads;
    assert.ok(firstViewportReads < 16, 'opening 80 choices must not fetch all 80 fonts');
    await page.locator('[data-font-picker-list]').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(500);
    assert.ok(fontReads > firstViewportReads && fontReads < firstViewportReads + 16,
      'scrolling loads only newly visible font previews');
    assert.ok(await page.evaluate(() => [...document.fonts].filter(face => face.family.startsWith('StudioPreview_')).length) < 12,
      'preview faces scrolled out of view are released');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => [...document.fonts].filter(face => face.family.startsWith('StudioPreview_')).length), 0,
      'closing the menu frees all preview fonts');
    console.log('WebKit: ajout et retrait synchronisés sans rechargement ; Pompiere résolue localement');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
