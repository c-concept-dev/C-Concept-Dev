const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    const presentation = doc();
    presentation.blocks[0].content.title = 'LE COUPLE : UNE HISTOIRE VIEILLE DE 300 000 ANS...';
    presentation.blocks[0].content.titleStyle = { fontSizePt: 40 };
    presentation.blocks[0].content.blocks[1].content.text = 'Ce que nous allons traverser ensemble. **Qu’est-ce que deux êtres humains ont toujours cherché l’un dans l’autre ? Et qu’est-ce que cela nous dit de ce que nous cherchons encore aujourd’hui ?**';
    assert.equal(await open(page, presentation), true);
    async function measure() {
      return page.evaluate(() => {
        const slide = document.querySelector('.cc-ws-doc-card--presentation .adoc-sc-presentation-slide');
        const card = slide.querySelector('.adoc-sc-card');
        const title = slide.querySelector('.adoc-sc-card-title');
        const paragraph = slide.querySelector('#p1');
        const lines = element => {
          const range = document.createRange(); range.selectNodeContents(element);
          const tops = Array.from(range.getClientRects()).filter(r => r.width && r.height).map(r => r.top).sort((a, b) => a - b);
          return tops.reduce((rows, top) => {
            if (!rows.length || top - rows[rows.length - 1] > 16 * new DOMMatrix(getComputedStyle(slide).transform).a) rows.push(top);
            return rows;
          }, []).length;
        };
        return { width: slide.offsetWidth, cardWidth: card.offsetWidth, cardHeight: card.offsetHeight,
          titleLines: lines(title), paragraphLines: lines(paragraph), scale: new DOMMatrix(getComputedStyle(slide).transform).a,
          paragraphHeight: paragraph.getBoundingClientRect().height, paragraphLineHeight: getComputedStyle(paragraph).lineHeight,
          overflow: document.querySelector('.cc-ws-doc-area').scrollWidth > document.querySelector('.cc-ws-doc-area').clientWidth + 2 };
      });
    }
    const windowed = await measure();
    await page.setViewportSize({ width: 2400, height: 1200 });
    await page.waitForTimeout(100);
    const wide = await measure();
    assert.equal(windowed.width, 1422);
    assert.equal(wide.width, 1422);
    assert.equal(windowed.cardWidth, wide.cardWidth);
    assert(Math.abs(windowed.cardHeight - wide.cardHeight) <= 1);
    assert.equal(windowed.titleLines, wide.titleLines, 'le titre garde les mêmes retours à la ligne');
    assert.equal(windowed.paragraphLines, wide.paragraphLines, 'le texte enrichi garde les mêmes retours à la ligne');
    assert(windowed.scale < 1 && wide.scale === 1);
    assert.equal(windowed.overflow, false, 'la petite fenêtre ne déborde pas horizontalement');
    await page.locator('#cc-ws-present-btn').click();
    await page.waitForSelector('#cc-ws-present-slide-inner .adoc-sc-card-title');
    const projected = await page.evaluate(() => {
      const title = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card-title');
      const range = document.createRange(); range.selectNodeContents(title);
      const tops = Array.from(range.getClientRects()).filter(r => r.width && r.height).map(r => Math.round(r.top));
      return { width: title.closest('.adoc-sc-card').offsetWidth, lines: new Set(tops).size };
    });
    assert.equal(projected.width, 1422);
    assert.equal(projected.lines, wide.titleLines, 'le mode Présenter garde les lignes du travail');
    console.log('PASS presentation viewport parity', { windowed, wide });
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
