const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
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

  console.log('=== Upload zone : accessible au clavier (Enter ouvre le sélecteur) ===');
  await page.evaluate(() => {
    window.__filePickerClicked = false;
    const input = document.getElementById('adoc-file-input');
    const origClick = input.click.bind(input);
    input.click = () => { window.__filePickerClicked = true; };
  });
  await page.locator('#adoc-upload-zone').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const filePickerClicked = await page.evaluate(() => window.__filePickerClicked);
  console.log('Enter sur la zone de dépôt déclenche le sélecteur de fichier:', filePickerClicked);

  console.log('=== Tous les boutons icône ont un aria-label ou un texte visible ===');
  const missingLabels = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button, [role="button"]')];
    return buttons.filter(b => {
      const text = b.textContent.trim();
      const hasAria = b.getAttribute('aria-label') || b.getAttribute('aria-labelledby');
      const isIconOnly = text.length > 0 && text.length <= 3 && !/[a-zA-Zéèàêîôû]{2,}/.test(text);
      return isIconOnly && !hasAria;
    }).map(b => ({ text: b.textContent.trim(), id: b.id, cls: b.className }));
  });
  console.log('boutons icône sans aria-label:', missingLabels);

  console.log('=== Focus-visible sur adoc-upload-zone ===');
  const focusOutline = await page.evaluate(() => {
    document.getElementById('adoc-upload-zone').focus();
    return getComputedStyle(document.getElementById('adoc-upload-zone')).outlineStyle;
  });
  console.log('outline style on focus:', focusOutline);

  console.log('=== errors ===', errors);
  await browser.close();
})();
