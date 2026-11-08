const { chromium } = require('playwright');
const { strict: assert } = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.stack || e.message));
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
    await page.waitForFunction(() => document.querySelectorAll('[data-clip]').length === 3);
    if (process.env.ATELIER_SCREENSHOT) await page.locator('#am-workbench').screenshot({path:process.env.ATELIER_SCREENSHOT});
    assert.equal(await page.locator('.am-lane').count(), 3);
    assert.equal(await page.locator('[data-master-lane="voice"] [data-clip]').count(), 1);
    assert.equal(await page.locator('[data-master-lane="music"] [data-clip]').count(), 2);
    await page.locator('[data-clip="1"]').click();
    await page.locator('[data-field="db"][data-track="1"]').fill('-24');
    await page.locator('[data-field="db"][data-track="1"]').dispatchEvent('change');
    assert.equal(await page.locator('[data-field="db"][data-track="1"]').inputValue(), '-24');
    await page.locator('[data-master-db="music"]').fill('-9');
    assert.equal(await page.locator('#am-music-db').innerText(), '-9 dB');
    await page.locator('[data-clip="0"]').click();
    await page.locator('#am-seek').fill('0.5');
    await page.locator('#am-split').click();
    assert.equal(await page.locator('[data-clip]').count(), 4);
    await page.locator('#am-seek').fill('0.75');
    await page.locator('#am-add-point').click();
    assert.equal(await page.locator('.am-automation circle').count(), 3);
    await page.locator('[data-master-mute="music"]').click();
    assert.equal(await page.locator('[data-master-mute="music"]').innerText(), 'Réactiver');
    await page.locator('[data-master-mute="music"]').click();
    await page.locator('#am-play').click();
    await page.waitForTimeout(250);
    assert.match(await page.locator('#am-clock').innerText(), /00:00 \/ 00:04/);
    await page.locator('#am-stop').click();
    const downloadPromise = page.waitForEvent('download', {timeout:15000});
    await page.locator('#am-export').click();
    const download = await downloadPromise.catch(async e => { console.error('STATUT EXPORT', await page.locator('#am-status').innerText()); throw e; });
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
    assert.ok(info.duration > 3.5 && info.duration < 4.6);
    await page.locator('[data-master-lane="music"] [data-clip="2"]').dragTo(page.locator('[data-master-lane="voice"]'));
    assert.equal(await page.locator('[data-master-lane="voice"] [data-clip]').count(), 3);
    await page.locator('[data-master-lane="voice"] [data-clip="2"]').dragTo(page.locator('[data-master-lane="music"]'));
    assert.equal(await page.locator('[data-master-lane="music"] [data-clip]').count(), 2);
    assert.deepEqual(errors, []);
    console.log('PASS Atelier montage : deux pistes Master, coupe, point de volume, sourdine, mixage AAC dans MP4, 1920 × 1080, '+info.duration+' s');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
