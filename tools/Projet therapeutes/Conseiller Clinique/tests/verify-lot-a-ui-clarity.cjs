const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

function luminance(rgb) {
  const channels = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

(async () => {
  const part = process.argv[2] || 'all';
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'text/plain' }));
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('adoc-welcome')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
    });

    if (part === 'a1' || part === 'all') {
      const ratios = [];
      for (const mount of ['cc-home-creations-results', 'cc-ws-creations-results']) {
        if (mount === 'cc-ws-creations-results') assert.equal(await open(page, doc()), true);
        await page.evaluate(id => {
          const parent = document.getElementById(id);
          document.getElementById('assistdoc-screen').classList.toggle('active', id !== 'cc-home-creations-results');
          parent.closest('[hidden]')?.removeAttribute('hidden');
          parent.innerHTML = '<div class="cc-media-item"><button type="button" class="cc-media-insert-btn">Ouvrir</button></div>';
        }, mount);
        const button = page.locator('#' + mount + ' .cc-media-insert-btn');
        const states = [
          ['repos', async () => {}],
          ['survol', async () => button.hover()],
          ['focus', async () => button.focus()],
          ['activé', async () => { await button.hover(); await page.mouse.down(); }],
        ];
        for (const [state, action] of states) {
          await action();
          const colors = await button.evaluate(el => {
            const css = getComputedStyle(el);
            return { foreground: css.color, background: css.backgroundColor };
          });
          const ratio = contrast(colors.foreground, colors.background);
          ratios.push(mount + '/' + state + '=' + ratio.toFixed(2));
          assert.ok(ratio >= 4.5, mount + ' / ' + state + ' : contraste ' + ratio.toFixed(2) + ':1 (' + JSON.stringify(colors) + ')');
          if (state === 'activé') await page.mouse.up();
        }
      }
      console.log('PASS A1 : Ouvrir atteint 4,5:1 dans les deux emplacements et quatre états — ' + ratios.join(', '));
    }

    if (part === 'a2' || part === 'all') {
      const d = doc();
      d.blocks[0].content.blocks.push({ id: 'p2', type: 'paragraph', content: { text: 'Contenu clinique de la diapositive.' }, citationIds: [], validation: {} });
      const second = JSON.parse(JSON.stringify(d.blocks[0]));
      second.id = 'card-02';
      second.content.blocks.forEach((block, index) => { block.id += '-2-' + index; });
      d.blocks.push(second);
      assert.equal(await open(page, d), true);
      const buttons = page.locator('.cc-ws-doc-card .cc-block-delete');
      const data = await buttons.evaluateAll(els => els.map(el => ({ name: el.getAttribute('aria-label'), rect: el.getBoundingClientRect().toJSON() })));
      assert.ok(data.length >= 6, 'deux cartes et leurs blocs portent une croix');
      assert.equal(new Set(data.map(item => item.name)).size, data.length, 'chaque croix a un nom accessible unique');
      data.forEach(item => assert.ok(item.rect.width >= 24 && item.rect.height >= 24, 'zone cliquable ' + item.name + ' : ' + item.rect.width + '×' + item.rect.height));
      for (const item of data) assert.equal(await page.getByRole('button', { name: item.name, exact: true }).count(), 1, 'nom dans l’arbre accessible : ' + item.name);
      await page.evaluate(() => {
        window._adocArtifacts['legacy-labels'] = {
          name: 'Ancien document',
          html: '<html><body><h2>Même titre</h2><p>Même paragraphe.</p><p>Même paragraphe.</p></body></html>',
          _adocGenerationEngine: 'legacy-html', _adocCapabilities: { workspace: true, legacyBlockEditing: true }
        };
      });
      assert.equal(await page.evaluate(() => adocOpenWorkspace('legacy-labels')), true);
      const legacy = await page.locator('.adoc-sc-block-drag-wrap > .cc-block-delete').evaluateAll(els => els.map(el => ({ name: el.getAttribute('aria-label'), rect: el.getBoundingClientRect().toJSON() })));
      assert.equal(legacy.length, 3);
      assert.equal(new Set(legacy.map(item => item.name)).size, legacy.length, 'ancien moteur : noms uniques même si deux paragraphes ont le même texte');
      legacy.forEach(item => assert.ok(item.rect.width >= 24 && item.rect.height >= 24, 'ancien moteur : zone cliquable 24 × 24 px'));
      console.log('PASS A2 : croix distinctes et zones de 24 × 24 px minimum');
    }

    if (part === 'a3' || part === 'all') {
      const menu = page.locator('#cc-ws-export-menu-items');
      assert.equal(await menu.locator('[role="group"][aria-label="Document"]').count(), 1);
      assert.equal(await menu.locator('[role="group"][aria-label="Texte des diapositives"]').count(), 1);
      assert.equal(await menu.locator('[role="group"][aria-label="Narration"]').count(), 1);
      assert.match(await page.locator('#cc-ws-export-btn').innerText(), /HTML|document/i);
      assert.match(await page.locator('#cc-ws-export-pdf-carrousel-btn').innerText(), /diapositive/i);
      assert.equal((await page.locator('#cc-ws-texte-pdf-btn').innerText()).trim(), 'Texte des diapositives (PDF)');
      const d = doc();
      d.title = 'Document de test';
      assert.equal(await open(page, d, 'test-export-label'), true);
      await page.evaluate(() => adocWsMenuToggle('export'));
      assert.equal((await page.locator('#cc-ws-export-btn').innerText()).trim(), 'Exporter Document de test.html');
      assert.equal(await menu.locator('[role="group"][aria-label="Document"]').isVisible(), true);
      await page.evaluate(() => {
        window._adocArtifacts['legacy-label'] = {
          name: 'Tableau de test', fmt: 'xlsx', url: 'https://example.invalid/tableau.xlsx',
          _adocGenerationEngine: 'legacy-html', _adocCapabilities: { workspace: true, export: true }
        };
        window._adocWsState.storeKey = 'legacy-label';
        adocWsMenuToggle('export');
      });
      assert.equal((await page.locator('#cc-ws-export-btn').innerText()).trim(), 'Exporter Tableau de test.xlsx');
      console.log('PASS A3 : noms des sorties et groupes accessibles du menu Exporter');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
