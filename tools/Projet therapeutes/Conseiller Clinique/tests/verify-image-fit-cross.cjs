const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="80" fill="red"/><rect y="80" width="100" height="140" fill="green"/><rect y="220" width="100" height="80" fill="blue"/></svg>');
    for (const kind of ['presentation', 'carrousel', 'fiche', 'tableau', 'script', 'liens']) {
      const d = doc(kind), key = 'fit-' + kind;
      const cards = ['presentation', 'carrousel'].includes(kind);
      if (cards) { d.blocks[0].content.imageAssetId = 'test-photo'; d.blocks[0].content.imageAlt = 'Test photo'; }
      else d.blocks.push({ id: 'photo', type: 'image', content: { query: 'test photo', alt: 'Test photo' }, citationIds: [], validation: {} });
      assert.equal(await open(page, d, key), true, kind);
      const img = page.locator(cards ? '.adoc-sc-card-img' : '#photo img').first();
      await img.evaluate(async (el, src) => { el.src = src; await new Promise((resolve, reject) => { el.onload = resolve; el.onerror = reject; }); el.style.height = '180px'; }, svg);
      await img.click();
      const menu = page.getByLabel('Cadrage');
      const captures = [];
      for (const fit of ['contain', 'cover', 'fill']) {
        await menu.selectOption(fit);
        const state = await img.evaluate(el => ({ fit: getComputedStyle(el).objectFit, height: el.getBoundingClientRect().height }));
        assert.equal(state.fit, fit, kind);
        assert.ok(state.height >= 150 && state.height <= 200, kind + ' conserve un cadre stable');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        captures.push(crypto.createHash('sha256').update(await img.screenshot()).digest('hex'));
      }
      assert.equal(new Set(captures).size, 3, kind + ' : les trois cadrages produisent trois rendus distincts (' + captures.join(',') + ')');
      await page.locator('#cc-ws-undo-btn').click();
      assert.equal(await img.evaluate(el => getComputedStyle(el).objectFit), 'cover', kind + ' annule Étirer');
    }
    console.log('PASS cadrage visuel distinct, cadre fixe et annulation : 6 types');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
