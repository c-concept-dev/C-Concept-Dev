const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const sharp = require('sharp');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

const stripesSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
  '<path fill="#e22" d="M0 0h200v65H0z"/><path fill="#2c2" d="M0 65h200v70H0z"/>' +
  '<path fill="#26e" d="M0 135h200v65H0z"/></svg>';

async function pixel(image, x, y) {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (Math.floor(y * info.height) * info.width + Math.floor(x * info.width)) * info.channels;
  return [...data.subarray(offset, offset + 3)];
}
function distance(a, b) { return a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0); }

(async () => {
  const stripes = 'data:image/png;base64,' + (await sharp(Buffer.from(stripesSvg)).png().toBuffer()).toString('base64');
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    const d = doc();
    d.blocks[0].content.imageAssetId = 'test-photo';
    d.blocks[0].content.imageAlt = 'Bandes rouge verte bleue';
    d.blocks[0].content.imageDisplay = { heightPx: 180 };
    assert.equal(await open(page, d), true);
    const image = page.locator('.adoc-sc-card-img').first();
    await image.evaluate(async (el, src) => { el.src = src; await el.decode(); }, stripes);
    await image.click();
    assert.equal(await page.getByLabel('Cadrage').count(), 1);
    const images = {};
    for (const fit of ['contain', 'cover', 'fill']) {
      await page.getByLabel('Cadrage').selectOption(fit);
      images[fit] = await image.screenshot();
      assert.equal(await image.evaluate(el => getComputedStyle(el).objectFit), fit);
    }
    const rect = await image.boundingBox();
    assert.ok(rect.width > rect.height * 2, 'le cadre est nettement plus large que la photo carrée');
    const leftContain = await pixel(images.contain, .04, .5);
    const leftCover = await pixel(images.cover, .04, .5);
    const bottomCover = await pixel(images.cover, .5, .9);
    const bottomFill = await pixel(images.fill, .5, .9);
    assert.ok(distance(leftContain, leftCover) > 150, 'Ajuster montre la photo entière avec des marges ; Remplir occupe le cadre');
    assert.ok(distance(bottomCover, bottomFill) > 150, 'Remplir recadre sans déformer ; Étirer déforme explicitement');
    await page.getByLabel('Cadrage').selectOption('contain');
    const handle = page.locator('.adoc-sc-card > .cc-card-cover-resize-handle.cc-image-resize-e').first();
    const grip = await handle.boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 35, grip.y + grip.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.imageDisplay.fit), 'contain',
      'redimensionner le cadre ne transforme pas implicitement la photo en mode Étirer');
    console.log('PASS modes de cadrage distincts et poignée sans déformation implicite');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
