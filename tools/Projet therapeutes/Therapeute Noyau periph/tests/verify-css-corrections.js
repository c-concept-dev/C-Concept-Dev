const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

function relLum(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0,2),16)/255, g = parseInt(c.substring(2,4),16)/255, b = parseInt(c.substring(4,6),16)/255;
  const f = (v) => v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
  return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
}
function contrast(hex1, hex2) {
  const l1 = relLum(hex1), l2 = relLum(hex2);
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/*', route => {
    if (route.request().url().includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(400);
  return page;
}

async function focusAndCapture(browser, selector, screenshotName, pad = 24) {
  const page = await freshPage(browser);
  await page.evaluate((sel) => document.querySelector(sel).setAttribute('data-focus-probe', '1'), selector);
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(() => document.activeElement?.getAttribute('data-focus-probe') === '1');
    if (hit) break;
  }
  // These buttons inherit "transition: all ..." from their base rule, which also
  // animates outline-width/color/offset — sampling too soon after Tab catches an
  // in-flight transition frame. Wait past the transition duration (150-200ms) before
  // reading computed style so we get the settled end state, not an interpolated one.
  await page.waitForTimeout(350);
  const style = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { outline: cs.outline, outlineOffset: cs.outlineOffset };
  });
  const rect = await page.evaluate(() => document.activeElement.getBoundingClientRect().toJSON());
  if (screenshotName) {
    await page.screenshot({
      path: OUT + '/' + screenshotName,
      clip: { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + pad * 2, height: rect.height + pad * 2 },
    });
  }
  await page.close();
  return style;
}

(async () => {
  const browser = await chromium.launch();

  console.log('=== 1. Contraste (calcul indépendant WCAG) ===');
  console.log('muted(#5d6966) opacity:1 sur ivory(#fffdf9):', contrast('#5d6966', '#fffdf9').toFixed(2) + ':1 (seuil AA 4.5:1)');
  console.log('terracotta-700(#8a3f29) sur petrol-950(#102f31):', contrast('#8a3f29', '#102f31').toFixed(2) + ':1 (seuil non-text 3:1)');
  console.log('blanc sur petrol-950:', contrast('#ffffff', '#102f31').toFixed(2) + ':1');

  const p1 = await freshPage(browser);
  const placeholderStyles = await p1.evaluate(() => {
    const a = getComputedStyle(document.getElementById('adoc-context-inp'), '::placeholder');
    const b = getComputedStyle(document.getElementById('adoc-input'), '::placeholder');
    return { contextInp: { color: a.color, opacity: a.opacity }, textarea: { color: b.color, opacity: b.opacity } };
  });
  console.log('computed ::placeholder styles:', placeholderStyles);
  await p1.close();

  console.log('=== 2. Focus-visible (boutons corrigés) — style + capture ===');
  console.log('adoc-quick-btn:', await focusAndCapture(browser, '.adoc-quick-btn', 'focus-quickbtn.png'));
  console.log('adoc-send-btn:', await focusAndCapture(browser, '#adoc-send-btn', 'focus-sendbtn.png'));
  console.log('adoc-context-close:', await focusAndCapture(browser, '#adoc-context-close', 'focus-contextclose.png'));
  console.log('adoc-exp-btn:', await focusAndCapture(browser, '.adoc-exp-btn', 'focus-expbtn.png'));
  console.log('adoc-close-btn (header sombre, doit être blanc):', await focusAndCapture(browser, '.adoc-close-btn', 'focus-closebtn.png'));

  console.log('=== 3. Non-régression — règles spécifiques déjà en place (ne doivent pas changer) ===');
  console.log('adoc-upload-zone:', await focusAndCapture(browser, '#adoc-upload-zone', 'focus-uploadzone-existing.png'));
  console.log('adoc-context-toggle:', await focusAndCapture(browser, '#adoc-context-toggle', 'focus-contexttoggle-existing.png'));

  await browser.close();
})();
