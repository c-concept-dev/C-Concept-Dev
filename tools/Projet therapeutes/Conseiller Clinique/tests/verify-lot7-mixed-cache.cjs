const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

const repo = path.resolve(ROOT, '../../..');
const rel = 'tools/Projet therapeutes/Conseiller Clinique/';
const old = file => execFileSync('git', ['show', 'eab3aa9f:' + rel + file], { cwd: repo, maxBuffer: 10 * 1024 * 1024 });

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot7-cache-'));
  const browser = await chromium.launch();
  try {
    const versions = [
      ['ancien-client', old('studio-clinique.html'), old('studio-clinique-core.js')],
      ['ancienne-page-nouveau-coeur', old('studio-clinique.html'), fs.readFileSync(path.join(ROOT, 'studio-clinique-core.js'))],
      ['nouvelle-page-ancien-coeur', fs.readFileSync(path.join(ROOT, 'studio-clinique.html')), old('studio-clinique-core.js')],
    ];
    for (const [label, html, core] of versions) {
      const dir = path.join(tmp, label);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'studio-clinique.html'), html);
      fs.writeFileSync(path.join(dir, 'studio-clinique-core.js'), core);
      for (const file of ['vendor', 'atelier-images.js', 'narration-ia.js']) fs.symlinkSync(path.join(ROOT, file), path.join(dir, file));
      const page = await browser.newPage();
      await page.route('https://**/*', route => route.fulfill({ json: { results: [], items: [], total: 0 } }));
      await page.goto('file://' + dir + '/studio-clinique.html');
      const d = doc('presentation');
      d.blocks[0].content.imageRef = 'Photo de couple';
      d.blocks[0].content.imageAlt = 'Photo';
      d.blocks[0].content.imageDisplay = { fit: 'contain', brightness: 118 };
      d.blocks[0].content.blocks.push({ id: 'image-cache', type: 'image', content: {
        query: 'photo', alt: 'Photo du document', imageDisplay: { fit: 'fill', contrast: 120 }
      }, citationIds: [], validation: {} });
      assert.equal(await open(page, d), true, label + ' ouvre le document enrichi');
      assert.equal(await page.locator('.adoc-sc-card').count(), 1, label + ' rend la carte');
      assert.deepEqual(await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.imageDisplay),
        { fit: 'contain', brightness: 118 }, label + ' préserve les champs inconnus');
      await page.close();
    }
    console.log('PASS lot 7 : ancien client et caches mélangés ouvrent un document avec réglages photo');
  } finally { await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
