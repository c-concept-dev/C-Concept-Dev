const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');

async function run(browserType) {
  const browser = await browserType.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.abort());
    await page.goto(PAGE);
    const banner = page.locator('#cc-ws-font-warning-banner');
    // T1 : WebKit peut restaurer document.fonts.load entre deux appels Playwright.
    // Installer le simulacre et déclencher la vérification dans le même appel.
    const initiallyVisible = await page.evaluate(async () => {
      const banner = document.getElementById('cc-ws-font-warning-banner');
      banner.hidden = false;
      banner.innerHTML = '<div class="cc-ws-font-warning-row" data-font-name="Sinthya"><div class="cc-ws-font-warning-body"><span>Police absente</span><div class="cc-ws-font-warning-actions"><button>Vérifier</button><span class="cc-ws-font-warning-result"></span></div></div></div>';
      const before = !banner.hidden;
      document.fonts.load = () => Promise.reject(new DOMException('Local font absent', 'NetworkError'));
      await window.adocCheckBrandKitFontLocally('Sinthya');
      return before;
    });
    assert.equal(initiallyVisible, true, 'le bandeau initial est visible avant vérification');
    assert.equal(await banner.evaluate(el => el.hidden), true, 'la vérification négative retire le bandeau');

    await page.evaluate(async () => {
      const banner = document.getElementById('cc-ws-font-warning-banner');
      banner.hidden = false;
      banner.innerHTML = ['Police A', 'Police B'].map(name => '<div class="cc-ws-font-warning-row" data-font-name="' + name + '"><button>Vérifier</button><span class="cc-ws-font-warning-result"></span></div>').join('');
      document.fonts.load = () => Promise.reject(new DOMException('Local font absent', 'NetworkError'));
      await window.adocCheckBrandKitFontLocally('Police A');
    });
    assert.equal(await banner.evaluate(el => el.hidden), false, 'la seconde police maintient le bandeau');
    assert.equal(await banner.locator('.cc-ws-font-warning-row').count(), 1);
    await page.evaluate(async () => {
      document.fonts.load = () => Promise.reject(new DOMException('Local font absent', 'NetworkError'));
      await window.adocCheckBrandKitFontLocally('Police B');
    });
    assert.equal(await banner.evaluate(el => el.hidden), true, 'la dernière ligne retirée masque le bandeau');

    await page.evaluate(async () => {
      const banner = document.getElementById('cc-ws-font-warning-banner');
      banner.hidden = false;
      banner.innerHTML = '<div class="cc-ws-font-warning-row" data-font-name="Autre police absente"><div class="cc-ws-font-warning-body"><span>Police absente</span><div class="cc-ws-font-warning-actions"><button>Vérifier</button><span class="cc-ws-font-warning-result"></span></div></div></div>';
      document.fonts.load = () => new Promise(() => {});
      await window.adocCheckBrandKitFontLocally('Autre police absente');
    });
    assert.equal(await banner.evaluate(el => el.hidden), false, 'une vérification expirée garde l’avertissement visible');
    assert.match(await banner.innerText(), /incomplète|réessayer/i);
    assert.equal(await banner.locator('button').isEnabled(), true, 'une vérification expirée peut être relancée');
    console.log('PASS', browserType.name(), 'bandeau police absente masqué, résultat incertain conservé');
  } finally { await browser.close(); }
}

(async () => { await run(chromium); await run(webkit); })().catch(error => { console.error(error); process.exitCode = 1; });
