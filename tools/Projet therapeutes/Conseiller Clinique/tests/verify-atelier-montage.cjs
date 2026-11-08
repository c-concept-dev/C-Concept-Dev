const { chromium } = require('playwright');
const { strict: assert } = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + join(__dirname, '../atelier-diapos.html'));
    await page.evaluate(async () => {
      const images = [];
      for (const color of ['#a52a2a', '#204c91']) {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0,0,640,360);
        images.push({ blob: await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg')) });
      }
      window.__chutier = { dernier: () => ({ res: { images } }) };
      document.getElementById('cv-mp4').disabled = false;
      document.getElementById('cv-duree').value = '1';
    });
    const mp3 = join(__dirname, 'atelier-test-tone.mp3');
    await page.locator('#am-add-voice').setInputFiles(mp3);
    await page.waitForFunction(() => document.querySelectorAll('.am-track').length === 1);
    await page.locator('#am-add-music').setInputFiles([mp3,mp3]);
    await page.waitForFunction(() => document.querySelectorAll('.am-track').length === 3);
    assert.equal(await page.locator('.am-lane').count(), 4);
    await page.locator('[data-field="db"][data-track="1"]').fill('-24');
    await page.locator('[data-field="db"][data-track="1"]').dispatchEvent('change');
    assert.equal(await page.locator('[data-field="db"][data-track="1"]').inputValue(), '-24');
    await page.locator('[data-mute="2"]').click();
    assert.equal(await page.locator('[data-mute="2"]').innerText(), 'Réactiver');
    await page.locator('#am-play').click();
    await page.waitForTimeout(250);
    assert.match(await page.locator('#am-clock').innerText(), /00:00 \/ 00:02/);
    await page.locator('#am-stop').click();
    const downloadPromise = page.waitForEvent('download', {timeout:15000});
    await page.locator('#cv-mp4').click();
    const download = await downloadPromise;
    const bytes = readFileSync(await download.path());
    assert.ok(bytes.includes(Buffer.from('soun')), 'le MP4 doit contenir une piste sonore');
    assert.ok(bytes.includes(Buffer.from('mp4a')), 'le MP4 doit contenir de l’audio AAC');
    const info = await page.evaluate(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const video = document.createElement('video');
      video.src = URL.createObjectURL(new Blob([bytes], {type:'video/mp4'}));
      await new Promise((resolve, reject) => { video.onloadedmetadata=resolve; video.onerror=reject; });
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration};
    }, bytes.toString('base64'));
    assert.equal(info.width,1920); assert.equal(info.height,1080);
    assert.ok(info.duration > 1.5 && info.duration < 2.6);
    assert.deepEqual(errors, []);
    console.log('PASS Atelier montage : 3 pistes MP3, sourdine et volume individuels, mixage AAC dans MP4, 1920 × 1080, '+info.duration+' s');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
