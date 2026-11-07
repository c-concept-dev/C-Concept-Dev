const assert = require('node:assert/strict');
const { webkit } = require('playwright');
const path = require('node:path');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await webkit.launch();
  try {
    for (const width of [1100, 1400, 1800]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('**/brand-assets/fixture-asset', route => route.fulfill({
        contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lJkAAAAASUVORK5CYII=', 'base64')
      }));
      await page.goto('file://' + path.join(ROOT, 'studio-clinique.html'));
      await page.evaluate(() => { document.getElementById('cc-login-screen').style.display = 'none'; });
      const d = doc('presentation');
      d.blocks[0].content.blocks.unshift({ id: 'photo-parity', type: 'image', content: {
        query: 'Photo de test', alt: 'Photo de test', assetId: 'fixture-asset',
        imageDisplay: { heightPx: 440 }
      }, citationIds: [], validation: {} });
      assert.equal(await open(page, d, 'panel-' + width), true);
      await page.locator('#photo-parity img').click();
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('.cc-block-edit-panel');
        const image = document.getElementById('photo-parity');
        const next = document.getElementById('h1');
        const rect = e => { const r = e.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; };
        return { panel: rect(panel), image: rect(image), next: rect(next), visible: panel.getBoundingClientRect().top < innerHeight };
      });
      const overlap = (a,b) => Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left)) * Math.max(0, Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      assert.equal(overlap(geometry.panel, geometry.image), 0, width + ' : panneau sur la photo');
      assert.equal(overlap(geometry.panel, geometry.next), 0, width + ' : panneau sur le bloc suivant');
      assert(geometry.visible, width + ' : panneau hors de la fenêtre');
      await page.close();
    }
    console.log('PASS panneau photo sans recouvrement à 1100, 1400 et 1800 px');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
