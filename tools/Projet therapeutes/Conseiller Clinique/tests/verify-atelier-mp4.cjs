const { chromium } = require('playwright');
const { strict: assert } = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto('file://' + join(__dirname, '../atelier-diapos.html'));
    await page.evaluate(async () => {
      const images = [];
      for (const color of ['#a52a2a', '#204c91']) {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color; ctx.fillRect(0, 0, 640, 360);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
        images.push({ blob });
      }
      window.__chutier = { dernier: () => ({ res: { images } }) };
      document.getElementById('cv-mp4').disabled = false;
      document.getElementById('cv-duree').value = '1';
    });
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.click('#cv-mp4');
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.mp4$/);
    const base64 = readFileSync(await download.path()).toString('base64');
    const info = await page.evaluate(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const video = document.createElement('video');
      video.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
      return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    }, base64);
    assert.equal(info.width, 1920);
    assert.equal(info.height, 1080);
    assert.ok(info.duration > 1.7 && info.duration < 2.6, 'deux étapes d’une seconde doivent durer deux secondes');
    console.log('PASS Atelier MP4 navigateur : MP4 H.264 lisible, 1920 × 1080, deux étapes et durée ' + info.duration + ' s');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
