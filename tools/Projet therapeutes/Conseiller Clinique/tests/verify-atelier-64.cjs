const { chromium } = require('playwright');
const { strict: assert } = require('node:assert');
const { join } = require('node:path');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + join(__dirname, '../atelier-diapos.html'));
    await page.evaluate(async () => {
      const images = [];
      for (let index = 0; index < 64; index++) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = `hsl(${index * 43 % 360} 90% 45%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 90px sans-serif';
        ctx.fillText(String(index + 1), 50, 120);
        images.push({
          blob: await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg')),
          titre: `Étape ${index + 1}`
        });
      }
      window.__chutier = { dernier: () => ({ res: { images } }) };
      document.getElementById('cv-mp4').disabled = false;
      document.getElementById('cv-duree').value = '1';
    });
    await page.locator('#am-total').fill('64');
    await page.locator('#am-total').dispatchEvent('change');
    const download = page.waitForEvent('download', { timeout: 120000 });
    await page.locator('#cv-mp4').click();
    await download;
    assert.match(await page.locator('#am-status').innerText(), /MP4 vérifié : 64 étapes/);
    assert.deepEqual(errors, []);
    console.log('PASS Atelier montage : 64 images distinctes vérifiées dans le MP4');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
