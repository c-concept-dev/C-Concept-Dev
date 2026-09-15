// Kit v2.4 (MISSION-HARMONISATION-CORRIGEE.md, Volet 1) — ce test couvrait à l'origine la
// persistance localStorage du type de document préféré (UX-1/UX-2B), restauré au chargement
// suivant. Cette persistance-au-chargement est désormais INCOMPATIBLE avec le nouveau contrat
// (state-a-contract.json: defaultDocumentKind=null — rien ne doit jamais être présélectionné
// à l'ouverture de l'écran) : le mécanisme de restauration a été délibérément retiré. Ce test
// est réécrit pour garder une garde-fou explicite sur cette garantie, plutôt que de continuer
// à vérifier un comportement qui n'existe plus.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== Défaut (première visite, aucune valeur stockée) ===');
  const defaultPressed = await page.evaluate(() => document.querySelector('#cc-landing .format-card[aria-pressed="true"]'));
  const storedAtStart = await page.evaluate(() => localStorage.getItem('adocPreferredDocumentKind'));
  console.log('Bouton coché par défaut:', defaultPressed, '| localStorage au départ:', storedAtStart);

  console.log('=== Les 5 types restent tous sélectionnables (toggle réel) ===');
  const allFormats = ['carrousel', 'tableau', 'fiche', 'script', 'liens'];
  const idFor = { carrousel: 'format-carousel', tableau: 'format-table', fiche: 'format-summary', script: 'format-script', liens: 'format-links' };
  for (const fmt of allFormats) {
    await page.click('#' + idFor[fmt]);
    const pressed = await page.evaluate((id) => document.getElementById(id).getAttribute('aria-pressed'), idFor[fmt]);
    console.log(` - ${fmt}: aria-pressed=${pressed === 'true'}`);
    await page.click('#' + idFor[fmt]); // désélection avant le suivant
  }

  console.log('=== Sélectionner "script" puis recharger : PLUS AUCUNE restauration (Kit v2.4) ===');
  await page.click('#format-script');
  const pressedBeforeReload = await page.evaluate(() => document.getElementById('format-script').getAttribute('aria-pressed'));
  await page.reload();
  await page.waitForTimeout(300);
  const pressedAfterReload = await page.evaluate(() => document.querySelector('#cc-landing .format-card[aria-pressed="true"]'));
  console.log('aria-pressed=true sur "script" avant rechargement:', pressedBeforeReload === 'true', '(attendu: true)');
  console.log('Un bouton reste-t-il coché après rechargement ?', pressedAfterReload, '(attendu: null — plus de présélection restaurée)');

  console.log('=== Changer de sélection n\'affecte jamais un document déjà généré ===');
  // Ouvrir une conversation avec le type "script" actif, puis simuler un artefact généré
  // (documentKind figé dans l'objet artifact, pas dans une variable globale mutable).
  await page.click('#format-script');
  await page.fill('#clinical-question', 'Test persistance format');
  await page.click('#cc-landing button[type="submit"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts['test-key'] = { name: 'doc-test', html: '<html><body>Contenu figé</body></html>', documentKind: 'script' };
  });
  const frozenKindBefore = await page.evaluate(() => window._adocArtifacts['test-key'].documentKind);

  // Retour à l'accueil, sélectionner un AUTRE type.
  await page.click('#assistdoc-screen .adoc-close-btn');
  await page.waitForTimeout(100);
  await page.click('#format-table');

  const frozenKindAfter = await page.evaluate(() => window._adocArtifacts['test-key']?.documentKind);
  console.log('documentKind du document déjà généré, avant/après changement de sélection:', frozenKindBefore, '->', frozenKindAfter, '(doit être identique: script)');

  console.log('=== Erreurs JS ===', errors.length ? JSON.stringify(errors) : 'aucune');

  const ok = defaultPressed === null && storedAtStart === null && pressedAfterReload === null && frozenKindBefore === 'script' && frozenKindAfter === 'script' && errors.length === 0;
  console.log('\n' + (ok ? 'OK' : 'ÉCHEC') + ' — garde-fou "aucune présélection persistée" (Kit v2.4)');

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
