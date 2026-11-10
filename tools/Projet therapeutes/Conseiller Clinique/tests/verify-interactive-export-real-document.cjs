const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { lireExport } = require('./lire-export-html.cjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = "/Users/christophebonnet/Downloads/L'HISTOIRE DU COUPLE - UNE HISTOIRE VIEILLE DE 300.000 ANS-interactive-2.html";
const OUTPUT = '/tmp/studio-clinique-export-fidelite.html';
const SCREENSHOT = '/tmp/studio-clinique-export-fidelite.png';

function findBlock(doc, id) {
  for (const card of doc.blocks || []) {
    const block = (card.content?.blocks || []).find(candidate => candidate.id === id);
    if (block) return structuredClone(block);
  }
  throw new Error(`bloc réel introuvable : ${id}`);
}

(async () => {
  const sourceExport = lireExport(SOURCE);
  const sourceDoc = sourceExport.doc;
  const doc = structuredClone(sourceDoc);
  doc.title = 'Contrôle de fidélité visuelle — document réel';
  doc.blocks = [{
    id: 'fidelity-card',
    type: 'card',
    content: {
      title: 'Fidélité typographique et visuelle',
      imageRef: null,
      imageAlt: '',
      blocks: [
        findBlock(sourceDoc, 'heading-01'),
        findBlock(sourceDoc, 'paragraph-02'),
        findBlock(sourceDoc, 'callout-14'),
        findBlock(sourceDoc, 'callout-23'),
        findBlock(sourceDoc, 'list-50'),
      ],
      titleStyle: { fontFamily: 'Pompiere', color: '#348199', fontSizePt: 40 },
    },
    citationIds: [],
    validation: {},
  }];

  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {});
  try {
    const studio = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await studio.goto('file://' + path.join(ROOT, 'studio-clinique.html'));
    await studio.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await studio.evaluate(value => window.adocBuildStandalonePresentationHTML(value, { embedImages: false }), doc);
    fs.writeFileSync(OUTPUT, html, 'utf8');

    assert.match(html, /fonts\.googleapis\.com\/css2\?family=Montserrat/);
    assert.match(html, /fonts\.googleapis\.com\/css2\?family=Pompiere/);

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + OUTPUT);
    await page.locator('#cc-ws-present-start button').click();
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.evaluate(() => document.fonts.ready);

    const blockIds = ['heading-01', 'paragraph-02', 'callout-14', 'callout-23', 'list-50'];
    for (let step = 0; step < blockIds.length + 2; step += 1) {
      const allVisible = await page.evaluate(ids => ids.every(id => {
        const element = document.getElementById(id);
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      }), blockIds);
      if (allVisible) break;
      await page.locator('#cc-ws-present-next').click();
      await page.waitForTimeout(80);
    }

    const visibleBlocks = await page.evaluate(ids => ids.map(id => {
      const element = document.getElementById(id);
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        id,
        visible: style.visibility !== 'hidden' && Number(style.opacity) > 0,
        width: rect.width,
        height: rect.height,
      };
    }), blockIds);
    assert.ok(visibleBlocks.every(block => block.visible && block.width > 0 && block.height > 0),
      `les blocs réels doivent tous être visibles après révélation : ${JSON.stringify(visibleBlocks)}`);

    const styles = await page.evaluate(() => {
      const read = id => {
        const style = getComputedStyle(document.getElementById(id));
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderLeftWidth: style.borderLeftWidth,
          borderLeftColor: style.borderLeftColor,
        };
      };
      return {
        heading: read('heading-01'),
        paragraph: read('paragraph-02'),
        calloutInfo: read('callout-14'),
        calloutWarning: read('callout-23'),
        list: read('list-50'),
      };
    });

    assert.match(styles.heading.fontFamily, /Montserrat/i);
    assert.equal(styles.heading.fontSize, '26.6667px');
    assert.equal(styles.heading.fontWeight, '700');
    assert.equal(styles.heading.color, 'rgb(8, 101, 130)');
    assert.match(styles.paragraph.fontFamily, /Montserrat/i);
    assert.equal(styles.paragraph.fontSize, '16px');
    assert.match(styles.calloutInfo.fontFamily, /Pompiere/i);
    assert.equal(styles.calloutInfo.fontSize, '21.3333px');
    assert.equal(styles.calloutInfo.fontStyle, 'italic');
    assert.notEqual(styles.calloutInfo.backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.equal(styles.calloutInfo.borderLeftColor, 'rgb(52, 129, 153)');
    assert.equal(styles.calloutInfo.borderLeftWidth, '1px');
    assert.equal(styles.calloutWarning.backgroundColor, 'rgb(225, 237, 240)');
    assert.match(styles.list.fontFamily, /Montserrat/i);
    assert.equal(styles.list.fontSize, '16px');
    const framing = await page.evaluate(() => {
      const wrap = document.querySelector('.cc-ws-present-slide-wrap').getBoundingClientRect();
      const viewport = document.querySelector('.cc-ws-present-slide-viewport').getBoundingClientRect();
      const card = document.querySelector('.cc-ws-present-slide-inner .adoc-sc-card').getBoundingClientRect();
      return { wrap, viewport, card };
    });
    assert.ok(framing.viewport.left >= framing.wrap.left && framing.viewport.right <= framing.wrap.right,
      `la diapositive doit tenir entre les flèches : ${JSON.stringify(framing)}`);
    assert.ok(framing.card.left >= framing.wrap.left && framing.card.right <= framing.wrap.right,
      `aucun bord de carte ne doit être rogné : ${JSON.stringify(framing)}`);
    assert.deepEqual(errors, []);

    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    console.log(`OK — export réel fidèle : ${OUTPUT}`);
    console.log(`     capture navigateur : ${SCREENSHOT}`);
    await page.close();
    await studio.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('FAIL', error.stack || error.message);
  process.exit(1);
});
