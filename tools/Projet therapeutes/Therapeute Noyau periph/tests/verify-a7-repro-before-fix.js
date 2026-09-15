// A7 (audit Codex, P1) — REPRODUCTION AVANT CORRECTIF (Régression #5). Confirme qu'un HTML
// "legacy" contenant un attribut gestionnaire d'événement inline (le vecteur RÉEL confirmé par
// investigation — les <script> insérés via innerHTML n'exécutent JAMAIS, vérifié empiriquement)
// s'exécute bien avec les mêmes privilèges que la page hôte une fois inséré via
// adocOpenWorkspace (accès à window, au DOM hôte), sur le code NON modifié.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    // HTML "legacy" malveillant simulé : une image dont onerror lit window.location.href
    // (accès réel à `window` de la page hôte) et pose un marqueur dans le DOM HÔTE lui-même
    // (au-delà de cc-ws-doc-card), preuve qu'il ne s'exécute jamais dans un cadre isolé.
    const maliciousHtml = '<!DOCTYPE html><html><body>' +
      '<h1>Faux document</h1>' +
      '<img src="x-does-not-exist.png" onerror="window.__a7PoC = { hostHref: window.location.href, cookieAccessible: (typeof document.cookie === \'string\'), hostTitleBefore: document.title }; document.title = \'PWNED-A7\';">' +
      '</body></html>';
    if (!window._adocArtifacts) window._adocArtifacts = {};
    window._adocArtifacts['a7-poc'] = {
      html: maliciousHtml, name: 'doc-a7-poc', fmt: 'html',
      _adocGenerationEngine: 'legacy-html',
      _adocLegacySourceSnapshot: null,
      _adocDocumentKind: 'fiche',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: false, blockEditing: false, legacyBlockEditing: false, transform: false, export: true, qualityControlledExport: false },
    };
    return true;
  });
  await page.evaluate((k) => window.adocOpenWorkspace(k), 'a7-poc');
  await page.waitForTimeout(300);

  const poc = await page.evaluate(() => window.__a7PoC || null);
  const hostTitle = await page.title();
  console.log('=== REPRODUCTION A7 (code NON modifié) ===');
  console.log('a. Le gestionnaire onerror injecté a bien accédé à window.location.href de la page HÔTE :', !!(poc && poc.hostHref), poc);
  console.log('b. Il a bien pu lire document.cookie (même contexte que l\'app) :', !!(poc && poc.cookieAccessible));
  console.log('c. BUG CONFIRMÉ — il a modifié le DOM HÔTE lui-même (document.title), au-delà du conteneur du document :', hostTitle === 'PWNED-A7', hostTitle);
  console.log('errors:', errors);

  await browser.close();
})();
