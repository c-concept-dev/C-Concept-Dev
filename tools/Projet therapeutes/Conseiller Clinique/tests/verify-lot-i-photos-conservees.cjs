const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { doc: presentationDoc, open } = require('./presentation-edit-fixtures.cjs');

let pageUrl;
const mutation = process.env.ADOC_LOT_I_MUTATION;
const replacements = {
  ignore_id: ['target.content[target.field] = assetId;', 'void assetId;'],
  requery: ['adocCollectImageNodes(doc).filter(function (n) { return !n.assetId; });', 'adocCollectImageNodes(doc);'],
  false_count: ['result.saved++;', 'result.saved += 2;'],
  silent_save: ['adocEditorMarkDirty(); // Sauvegarder reste un geste explicite.', 'adocEditorMarkDirty(); await window.adocWsSave();'],
};
let mutatedCore = null;
if (mutation) {
  const pair = replacements[mutation];
  assert.ok(pair, 'mutation inconnue');
  const source = fs.readFileSync(path.join(__dirname, '../studio-clinique-core.js'), 'utf8');
  assert.ok(source.includes(pair[0]), 'ancre mutation introuvable');
  mutatedCore = source.replace(pair[0], pair[1]);
}
const pixel = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');

(async () => {
  const siteRoot = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const full = path.resolve(siteRoot, name);
    if (!full.startsWith(siteRoot + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      const type = name.endsWith('.js') ? 'application/javascript' : name.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }); res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  pageUrl = 'http://127.0.0.1:' + server.address().port + '/studio-clinique.html';
  const browser = await chromium.launch();
  let searches = 0, stores = 0, documentWrites = 0;
  const route = async (request) => {
    const url = request.request().url();
    if (url.startsWith('file:') || url.startsWith('http://127.0.0.1:')) return request.continue();
    if (url.includes('/fetch-image')) {
      searches++;
      const q = new URL(url).searchParams.get('q');
      return request.fulfill({ status: q === 'absente' ? 429 : 200, contentType: 'application/json',
        body: q === 'absente' ? '{"error":"quota"}' : JSON.stringify({ photos: [{ url: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg' }] }) });
    }
    if (url.endsWith('/media-assets/from-url')) {
      stores++;
      return request.fulfill({ json: { asset_id: 'asset-exact', deduplicated: stores > 1 } });
    }
    if (url.includes('/clinical-documents') && request.request().method() !== 'GET') documentWrites++;
    if (url.includes('/brand-assets/')) return request.fulfill({ status: 200, contentType: 'image/gif', body: pixel });
    return request.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  };
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());
  await page.route('**/*', route);
  if (mutatedCore) await page.route('**/studio-clinique-core.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: mutatedCore }));
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(pageUrl);
  const doc = { blocks: [
    { type: 'card', content: { imageRef: 'couple heureux', imageAlt: 'Couple', blocks: [
      { type: 'image', content: { query: 'même photo', alt: 'Photo' } },
    ] } },
    { type: 'image', content: { query: 'absente', alt: 'Absente' } },
  ] };
  const result = await page.evaluate(d => window.adocFreezeDocumentImages(d).then(r => ({ doc: d, result: r })), doc);
  assert.equal(result.result.saved, 2);
  assert.equal(result.result.missing, 1);
  assert.equal(result.doc.blocks[0].content.imageAssetId, 'asset-exact');
  assert.equal(result.doc.blocks[0].content.imageRef, 'couple heureux');
  assert.equal(result.doc.blocks[0].content.blocks[0].content.assetId, 'asset-exact');
  assert.equal(result.doc.blocks[1].content.assetId, undefined);
  assert.equal(searches, 3);
  assert.equal(stores, 2);

  const old = presentationDoc();
  old.blocks[0].content.imageRef = 'ancienne photo';
  old.blocks[0].content.imageAlt = 'Ancienne photo';
  assert.equal(await open(page, old, 'old-document'), true);
  const explicit = await page.evaluate(() => window.adocWsFreezePhotos());
  assert.equal(explicit.saved, 1);
  const state = await page.evaluate(() => ({
    asset: window._adocArtifacts['old-document']._adocStructuredDoc.blocks[0].content.imageAssetId,
    dirty: window._adocArtifacts['old-document']._ccEditorDirty,
  }));
  assert.equal(state.asset, 'asset-exact');
  assert.equal(state.dirty, true);
  assert.equal(documentWrites, 0, 'Figer les photos ne sauvegarde jamais le document en silence');
  const missingDoc = presentationDoc();
  missingDoc.blocks[0].content.imageRef = 'absente';
  missingDoc.blocks[0].content.imageAlt = 'Illustration attendue';
  assert.equal(await open(page, missingDoc, 'missing-document'), true);
  assert.equal(await page.locator('.adoc-photo-missing-notice').count(), 1);
  assert.match(await page.locator('.adoc-photo-missing-notice').innerText(), /Photo introuvable.*Changer l’image/);

  // Une deuxième session ne relance aucune recherche pour les deux photos enregistrées.
  const second = await browser.newPage();
  await second.route('**/*', route);
  if (mutatedCore) await second.route('**/studio-clinique-core.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: mutatedCore }));
  await second.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await second.goto(pageUrl);
  const before = searches;
  const html = await second.evaluate(async d => {
    const saved = d.blocks[0].content;
    return window.adocResolveImages('<!DOCTYPE html><html><body><img data-asset-id="' + saved.imageAssetId
      + '" src="https://example.com/brand-assets/' + saved.imageAssetId + '"></body></html>');
  }, result.doc);
  assert.match(html, /data-asset-id="asset-exact"/);
  assert.equal(searches, before);
  const persisted = presentationDoc();
  persisted.blocks[0].content.imageRef = result.doc.blocks[0].content.imageRef;
  persisted.blocks[0].content.imageAlt = 'Couple';
  persisted.blocks[0].content.imageAssetId = result.doc.blocks[0].content.imageAssetId;
  assert.equal(await open(second, persisted), true);
  assert.equal(await second.locator('.adoc-sc-card-img[data-asset-id="asset-exact"]').count(), 1);
  assert.equal(searches, before, 'le rendu complet en session neuve ne recherche pas une couverture enregistrée');

  // Migration : un document sans photo enregistrée rend le même HTML qu'avant le lot.
  const root = path.resolve(__dirname, '../../../..');
  const sourcePath = 'tools/Projet therapeutes/Conseiller Clinique/studio-clinique-core.js';
  const priorCore = execFileSync('git', ['show', 'c4f09d16:' + sourcePath], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const baseline = await browser.newPage();
  await baseline.route('**/studio-clinique-core.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: priorCore }));
  await baseline.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await baseline.goto(pageUrl);
  for (const kind of ['presentation', 'carrousel', 'fiche']) {
    const fixture = presentationDoc(kind);
    const render = p => p.evaluate(async d => (await window.adocRenderClinicalDocument(d, { sourceSnapshotId: d.sourceSnapshotId, entries: [] })).html, fixture);
    assert.equal(await render(page), await render(baseline), 'HTML de référence inchangé pour ' + kind);
  }
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log('PASS Lot I — identifiants persistants, provenance conservée, bilan exact, erreur sans mutation, zéro recherche à la réouverture');
})().catch(e => { console.error(e.message); process.exit(1); });
