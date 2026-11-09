const { chromium } = require('playwright');
const { strict: assert } = require('node:assert');
const { join } = require('node:path');

function wavTone(seconds = 0.25, sampleRate = 8000) {
  const samples = Math.floor(seconds * sampleRate), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + samples * 2, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.sin(i / sampleRate * Math.PI * 2 * 440) * 12000, 44 + i * 2);
  return bytes;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto('file://' + join(__dirname, '../atelier-diapos.html'));
    await page.evaluate(async () => {
      const images = [];
      for (const color of ['#7d2d25', '#174b76']) {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 640, 360);
        images.push({ blob: await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg')), titre: color });
      }
      window.__chutier = { dernier: () => ({ res: { images } }) };
      document.getElementById('cv-mp4').disabled = false;
      document.getElementById('cv-duree').value = '2';
    });

    assert.match(await page.locator('#am-add-voice').getAttribute('accept'), /\.m4a/);
    assert.match(await page.locator('#am-add-voice').getAttribute('accept'), /\.wav/);
    await page.locator('#am-add-voice').setInputFiles({ name: 'voix-test.wav', mimeType: 'audio/wav', buffer: wavTone() });
    await page.waitForFunction(() => document.querySelectorAll('[data-source-lane="voice"] [data-source]').length === 1);
    assert.equal(await page.locator('#am-step-count').innerText(), '2', 'images du projet chargées');

    await page.locator('[data-source-action="split"]').click();
    assert.equal(await page.locator('[data-source-lane="voice"] [data-source]').count(), 2, 'scission initiale');
    await page.locator('#am-undo').click();
    assert.equal(await page.locator('[data-source-lane="voice"] [data-source]').count(), 1, 'annuler restaure le bloc');
    await page.locator('#am-redo').click();
    assert.equal(await page.locator('[data-source-lane="voice"] [data-source]').count(), 2, 'rétablir refait la scission');

    const source = page.locator('[data-source-lane="voice"] [data-source]').first();
    await source.locator('[data-source-action="solo"]').click();
    assert.equal(await source.locator('[data-source-action="solo"]').getAttribute('aria-pressed'), 'true', 'solo annexe');
    await source.locator('[data-source-action="lock"]').click();
    assert.equal(await source.getAttribute('data-locked'), 'true', 'verrouillage annexe');
    await source.locator('[data-source-action="lock"]').click();
    await page.locator('#am-placement-mode').selectOption('snap');
    await page.locator('#am-seek').fill('2');
    await source.locator('[data-source-action="place"]').click();
    assert.equal(await page.locator('[data-master-lane="voice"] [data-clip]').count(), 1, 'placement Master');
    assert.equal(await source.getAttribute('data-used'), 'true', 'bloc annexe marqué utilisé');
    const firstPlacement = +await page.locator('[data-field="at"]').inputValue();
    await page.locator('#am-placement-mode').selectOption('insert');
    await page.locator('#am-seek').fill('0');
    await page.locator('[data-source-lane="voice"] [data-source]').nth(1).locator('[data-source-action="place"]').click();
    assert.equal(await page.locator('[data-master-lane="voice"] [data-clip]').count(), 2, 'placement en insertion');
    await page.locator('[data-master-lane="voice"] [data-clip]').first().click();
    assert.ok(+await page.locator('[data-field="at"]').inputValue() > firstPlacement, 'insertion décale le clip suivant');
    await page.locator('[data-master-lane="voice"] [data-clip]').nth(1).click({ modifiers: ['Shift'] });
    assert.equal(await page.locator('[data-master-lane="voice"] [data-clip][data-selected="true"]').count(), 2, 'multi-sélection avec Maj');
    await page.keyboard.press('Meta+c');
    await page.locator('#am-seek').fill('1');
    await page.keyboard.press('Meta+v');
    assert.equal(await page.locator('[data-master-lane="voice"] [data-clip]').count(), 4, 'copier-coller de la sélection Master');

    await page.locator('#am-zoom').fill('200');
    assert.equal(await page.locator('#am-annex-zoom').inputValue(), '10', 'zoom annexe lié au Master');
    assert.ok(await page.locator('#am-minimap-window').isVisible(), 'mini-carte visible');
    await page.locator('#am-linked-zoom').click();
    assert.equal(await page.locator('#am-linked-zoom').getAttribute('aria-pressed'), 'false', 'zooms déliables');

    await page.locator('#am-preview-quality').selectOption('economy');
    assert.deepEqual(await page.locator('#am-preview').evaluate(canvas => [canvas.width, canvas.height]), [960, 540]);
    await page.locator('#am-preview-quality').selectOption('full');
    assert.deepEqual(await page.locator('#am-preview').evaluate(canvas => [canvas.width, canvas.height]), [1920, 1080]);
    await page.locator('#am-layout-mode').selectOption('annexes');
    assert.equal(await page.locator('#am-workbench').getAttribute('data-layout'), 'annexes', 'mode Annexes larges');

    const transitionNames = await page.locator('#am-transition-type option').allTextContents();
    assert.equal(transitionNames.length, 25, 'coupe et 24 transitions du CDC');
    for (const expected of ['Flou croisé', 'Zoom croisé', 'Cercle ouvert', 'Cube', 'Puzzle droite']) assert.ok(transitionNames.includes(expected), expected);

    const beforePause = +await page.locator('#am-total').inputValue();
    page.once('dialog', dialog => dialog.accept('1'));
    await page.locator('#am-pause-all').click();
    assert.equal(+await page.locator('#am-total').inputValue(), beforePause + 1, 'pause entre les deux diapositives');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#am-save-project').click();
    const download = await downloadPromise;
    const projectPath = await download.path();
    assert.ok((await download.createReadStream()).readable, 'fichier projet téléchargé');

    const restored = await browser.newPage();
    await restored.goto('file://' + join(__dirname, '../atelier-diapos.html'));
    await restored.locator('#am-project-file').setInputFiles(projectPath);
    await restored.waitForFunction(() => /Projet restauré/.test(document.querySelector('#am-status').textContent));
    assert.equal(await restored.locator('#am-step-count').innerText(), '2', 'images restaurées');
    assert.equal(await restored.locator('[data-source-lane="voice"] [data-source]').count(), 2, 'blocs annexes restaurés');
    assert.equal(await restored.locator('[data-master-lane="voice"] [data-clip]').count(), 4, 'Master restauré');
    assert.equal(await restored.locator('#am-placement-mode').inputValue(), 'insert', 'mode de placement restauré');
    assert.equal(await restored.locator('#am-layout-mode').inputValue(), 'annexes', 'disposition restaurée');
    await restored.close();
    console.log('PASS Atelier CDC : annuler/rétablir, WAV, projet autonome, zoom lié, mini-carte, pistes, pauses et 24 transitions');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
