// UX-10A Étape 1 — preuve réelle de l'indicateur d'usage D1/R2 dans le mode développeur
// (Ctrl+D). Réseau mocké (GET /storage-stats), mais le déclenchement (Ctrl+D, clic, affichage)
// passe par le vrai code client.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_STATS = {
  d1: {
    tables: { brand_kits: { rowCount: 2 }, render_assets: { rowCount: 3 } },
    databaseSizeAvailable: false,
    databaseSizeNote: "Taille de base non mesurable depuis le binding D1 de ce Worker.",
  },
  r2: { bucket: 'studio-clinique-brand-assets', available: true, objectCount: 3, totalSizeBytes: 52428, totalSizeMb: 0.05 },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let storageStatsCallCount = 0;
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    if (url.endsWith('/brand-kits') && route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) });
      return;
    }
    if (url.endsWith('/storage-stats')) {
      storageStatsCallCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_STATS) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== 0. Invisible hors mode développeur (comportement Ctrl+D existant, inchangé) ===');
  const hiddenBefore = await page.evaluate(() => {
    const btn = document.getElementById('adoc-storage-btn');
    return btn ? getComputedStyle(btn.closest('.adoc-dev-only')).display : null;
  });
  console.log('Bouton "Jauge d\'usage" masqué avant Ctrl+D:', hiddenBefore === 'none');
  console.log('Aucun appel réseau à /storage-stats avant activation:', storageStatsCallCount === 0);

  console.log('\n=== 1. Activation du mode développeur (Ctrl+D) — révèle le bouton ===');
  // Le raccourci vérifie l'accueil (#cc-landing) ; on ouvre l'écran de conversation où vit la
  // sidebar #adoc-stats, comme les tests précédents de ce mécanisme.
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(300);
  await page.keyboard.down('Control');
  await page.keyboard.press('D');
  await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  const revealedInfo = await page.evaluate(() => {
    const btn = document.getElementById('adoc-storage-btn');
    return { devModeOn: document.body.classList.contains('adoc-devmode-on'), buttonVisible: btn ? getComputedStyle(btn.closest('.adoc-dev-only')).display !== 'none' : false };
  });
  console.log(revealedInfo);

  console.log('\n=== 2. Clic sur "Jauge d\'usage D1/R2" — vrai appel réseau, vrai affichage ===');
  await page.click('#adoc-storage-btn');
  await page.waitForTimeout(200);
  console.log('GET /storage-stats appelé une fois:', storageStatsCallCount === 1);
  const resultInfo = await page.evaluate(() => {
    const el = document.getElementById('adoc-storage-result');
    return { visible: getComputedStyle(el).display !== 'none', html: el.innerHTML };
  });
  console.log('Résultat affiché:', resultInfo.visible);
  console.log('Contient brand_kits=2:', resultInfo.html.includes('brand_kits') && resultInfo.html.includes('2'));
  console.log('Contient render_assets=3:', resultInfo.html.includes('render_assets') && resultInfo.html.includes('3'));
  console.log('Indique la taille de base comme non mesurable (jamais un chiffre inventé):', resultInfo.html.includes('non mesurable'));
  console.log('Affiche R2 (objets + Mo):', resultInfo.html.includes('objet') && resultInfo.html.includes('Mo'));
  console.log('\n=== Contenu affiché (chiffres bruts, aucun jugement de valeur type "trop"/"purger") ===');
  console.log(resultInfo.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  console.log('Aucun mot-jugement présent (trop/purger/alerte/danger):', !/trop|purger|alerte|danger/i.test(resultInfo.html));

  await page.screenshot({ path: OUT + '/ux10a-storage-stats-devmode.png', fullPage: false });

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
