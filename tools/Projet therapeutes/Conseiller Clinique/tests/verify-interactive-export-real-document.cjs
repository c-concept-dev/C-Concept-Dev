const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { lireExport } = require('./lire-export-html.cjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = process.env.STUDIO_REAL_EXPORT_SOURCE || [
  "/Users/christophebonnet/Downloads/KIT-TRANSFERT-TRAME-STUDIO-CLINIQUE-2026-11-10/reference/L'HISTOIRE DU COUPLE - UNE HISTOIRE VIEILLE DE 300.000 ANS-interactive-3.html",
  "/Users/christophebonnet/Downloads/L'HISTOIRE DU COUPLE - UNE HISTOIRE VIEILLE DE 300.000 ANS-interactive-2.html",
].find(candidate => fs.existsSync(candidate));
const OUTPUT = '/tmp/studio-clinique-export-fidelite.html';
const SCREENSHOT = '/tmp/studio-clinique-export-fidelite.png';
const REAL_OUTPUT = '/tmp/studio-clinique-export-document-reel.html';
const REAL_SCREENSHOT = '/tmp/studio-clinique-export-document-reel.png';

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

    const titleStyle = await page.evaluate(() => {
      const element = document.querySelector('.adoc-sc-card-title');
      const style = getComputedStyle(element);
      return { display: style.display, margin: style.margin, fontFamily: style.fontFamily };
    });
    assert.equal(titleStyle.display, 'inline-block');
    assert.equal(titleStyle.margin, '0px 0px 10px');
    assert.match(titleStyle.fontFamily, /Pompiere/i);

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
      const cardElement = document.querySelector('.cc-ws-present-slide-inner .adoc-sc-card');
      const inner = document.getElementById('cc-ws-present-slide-inner');
      return { wrap, viewport, card, remaining: cardElement.scrollHeight - cardElement.clientHeight,
        overflowIndicator: inner.classList.contains('cc-ws-present-suite') };
    });
    assert.ok(framing.viewport.left >= framing.wrap.left && framing.viewport.right <= framing.wrap.right,
      `la diapositive doit tenir entre les flèches : ${JSON.stringify(framing)}`);
    assert.ok(framing.card.left >= framing.wrap.left && framing.card.right <= framing.wrap.right,
      `aucun bord de carte ne doit être rogné : ${JSON.stringify(framing)}`);
    assert.equal(framing.overflowIndicator, framing.remaining > 2,
      `le repère de défilement doit refléter la géométrie finale après chargement des polices : ${JSON.stringify(framing)}`);
    assert.deepEqual(errors, []);

    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    console.log(`OK — export réel fidèle : ${OUTPUT}`);
    console.log(`     capture navigateur : ${SCREENSHOT}`);
    await page.close();

    // Le contrôle ci-dessus concentre plusieurs styles difficiles dans une seule carte. Celui-ci
    // ouvre EN PLUS le document fourni intact, avec ses vraies images embarquées, puis déroule
    // réellement le montage de sa première diapositive. C'est la régression exacte observée dans
    // Safari : le dernier paragraphe ne doit plus passer sous une fausse marge native de <h2>.
    let realHtml = await studio.evaluate(value => window.adocBuildStandalonePresentationHTML(value,
      { embedImages: false }), sourceDoc);
    realHtml = realHtml.replace('window.ADOC_EXPORT_IMAGES = {};',
      'window.ADOC_EXPORT_IMAGES = ' + JSON.stringify(sourceExport.images) + ';');
    fs.writeFileSync(REAL_OUTPUT, realHtml, 'utf8');
    const realPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const realErrors = [];
    realPage.on('pageerror', error => realErrors.push(error.message));
    await realPage.goto('file://' + REAL_OUTPUT);
    await realPage.locator('#cc-ws-present-start button').click();
    await realPage.waitForFunction(() => document.querySelector('.adoc-sc-card'));
    await realPage.evaluate(() => document.fonts.ready);
    // Un geste par transition : appeler adocPresentNext plusieurs fois dans la même micro-tâche
    // faisait légitimement ignorer les clics suivants pendant les 220 ms d'animation, rendant le
    // test intermittent sans rien révéler du produit.
    while (await realPage.evaluate(() => window._adocPresentState.revealIndex != null &&
      window._adocPresentState.revealIndex < window._adocPresentState.revealTotal - 1)) {
      await realPage.evaluate(() => window.adocPresentNext());
      await realPage.waitForTimeout(260);
    }
    const realLayout = await realPage.evaluate(() => {
      const card = document.querySelector('.adoc-sc-card');
      const title = document.querySelector('.adoc-sc-card-title');
      const titleStyle = getComputedStyle(title);
      const ids = ['image-62', 'heading-01', 'paragraph-02', 'paragraph-61'];
      const visible = ids.map(id => {
        const element = document.getElementById(id);
        const style = element && getComputedStyle(element);
        return { id, present: !!element, visibility: style && style.visibility,
          opacity: style && style.opacity };
      });
      return {
        titleMargin: titleStyle.margin,
        titleDisplay: titleStyle.display,
        remaining: card.scrollHeight - card.clientHeight,
        visible,
        overflowIndicator: document.getElementById('cc-ws-present-slide-inner')
          .classList.contains('cc-ws-present-suite'),
      };
    });
    assert.equal(realLayout.titleMargin, '0px 0px 10px');
    assert.equal(realLayout.titleDisplay, 'inline-block');
    assert.equal(realLayout.visible.every(item => item.present && item.visibility !== 'hidden' &&
      Number(item.opacity) > 0), true,
    `les quatre blocs réels doivent être révélés : ${JSON.stringify(realLayout.visible)}`);
    assert.ok(realLayout.remaining <= 2,
      `la première diapositive réelle doit tenir sans défilement : ${JSON.stringify(realLayout)}`);
    assert.equal(realLayout.overflowIndicator, false,
      `aucun faux repère de défilement après document.fonts.ready : ${JSON.stringify(realLayout)}`);
    assert.deepEqual(realErrors, []);
    await realPage.screenshot({ path: REAL_SCREENSHOT, fullPage: true });
    console.log(`OK — document fourni sans redistribution verticale : ${REAL_OUTPUT}`);
    console.log(`     capture du document fourni : ${REAL_SCREENSHOT}`);
    await realPage.close();
    await studio.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('FAIL', error.stack || error.message);
  process.exit(1);
});
