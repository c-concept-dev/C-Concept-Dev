const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const url = 'file://' + path.join(__dirname, '../studio-clinique.html');
const doc = {
  schemaVersion: 1, documentId: 'video-hover-doc', versionId: 'video-hover-v1', previousVersionId: null,
  requestId: 'video-hover-request', sourceSnapshotId: 'video-hover-snapshot', createdAt: '2026-11-08T12:00:00Z',
  language: 'fr', status: 'draft', title: 'Vidéo hover', purpose: 'supervision', audience: 'clinicien',
  documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [{ id: 'blk-a', type: 'heading', content: { text: 'Titre', level: 2 }, citationIds: [], validation: {} }],
  citations: [], validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let uploads = 0;
  await page.route('**/*', async route => {
    const request = route.request();
    const u = request.url();
    if (u.startsWith('file:')) return route.continue();
    if (u.includes('/fetch-video')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ id: 1, photographer: 'A', previewUrl: 'https://example.test/preview.mp4', downloadUrl: 'https://example.test/full.mp4', thumbUrl: 'https://example.test/thumb.jpg' }] }) });
    if (u.endsWith('/video-assets/upload') && request.method() === 'POST') {
      uploads++;
      assert.match(await request.headerValue('content-type') || '', /multipart\/form-data/);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'uploaded-1', url: 'https://example.test/video-assets/uploaded-1', title: 'essai', storage_type: 'cloudflare' }) });
    }
    if (u.endsWith('/video-links') && request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: uploads ? [{ id: 'uploaded-1', url: 'https://example.test/video-assets/uploaded-1', title: 'essai' }] : [] }) });
    return route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(url);
  await page.evaluate(doc => { window._adocArtifacts = window._adocArtifacts || {}; window._adocArtifacts.video_hover = { name: 'Vidéo hover', _adocGenerationEngine: 'structured', _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: doc }; }, doc);
  assert.equal(await page.evaluate(() => window.adocOpenWorkspace('video_hover')), true);
  await page.click('#cc-ws-media-toggle');
  await page.click('#cc-ws-media-subtab-videos');
  await page.fill('#cc-ws-video-search-input', 'essai');
  await page.locator('#cc-ws-media-subpanel-videos .cc-media-search-btn', { hasText: /^Rechercher$/ }).click();
  const thumb = page.locator('#cc-ws-video-search-results .cc-media-thumb').first();
  await thumb.waitFor();
  assert.equal(await page.locator('#cc-ws-video-search-results [id^="cc-video-preview-btn"]').count(), 0);
  assert.equal(await thumb.getAttribute('src'), null);
  await thumb.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await thumb.hover();
  await page.waitForSelector('.cc-media-hover-preview video', { timeout: 3000 });
  assert.equal(await page.locator('.cc-media-hover-preview video').getAttribute('src'), 'https://example.test/preview.mp4');
  await page.mouse.move(800, 100);
  await page.waitForSelector('.cc-media-hover-preview', { state: 'detached' });
  await page.locator('#cc-ws-video-file').setInputFiles({ name: 'essai.mp4', mimeType: 'video/mp4', buffer: Buffer.from('000000186674797069736f6d00000000', 'hex') });
  await page.waitForFunction(() => document.getElementById('cc-ws-video-upload-status').textContent.includes('Vidéo importée'));
  assert.equal(uploads, 1);
  await page.waitForSelector('#cc-ws-video-history [data-video-item="0"]');
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS vidéo navigateur : survol différé, fermeture, aucun bouton Aperçu, import MP4 et historique');
})().catch(e => { console.error(e); process.exitCode = 1; });
