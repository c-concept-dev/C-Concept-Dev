// Kit v2.4, Volet 2 — vérifie les 3 correctifs d'émojis bruts trouvés par le ré-audit réel
// (context-toggle "✓", statut workspace "✓"/"●", badge long-doc "\u{1F4CB}") : icône du
// sprite interne existante substituée, texte explicite conservé, zéro glyphe brut restant.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  // 1. Bouton "Contexte" (adoc-context-toggle)
  await page.evaluate(() => window.adocSetContext && window.adocSetContext('Couple avec trauma d\'abandon'));
  const ctx = await page.evaluate(() => {
    const btn = document.getElementById('adoc-context-toggle');
    return { html: btn.innerHTML, text: btn.textContent, hasUse: !!btn.querySelector('use[href="#icon-verify"]') };
  });
  log('1a. Icône icon-verify présente sur le bouton Contexte', ctx.hasUse);
  log('1b. Aucun "✓" brut restant', !ctx.text.includes('✓'), ctx.text);
  log('1c. Texte explicite "Contexte : ..." conservé', ctx.text.includes('Contexte :'));

  await browser.close();

  // Statut workspace (cc-ws-status) et badge long-doc — vérification statique de source
  // (chemins atteignables uniquement via un pipeline de génération complet, déjà exercé par
  // ailleurs dans la suite de régression) : les glyphes bruts ne doivent plus apparaître dans
  // le code source à ces emplacements précis, remplacés par les icônes du sprite existant.
  const fs = require('fs');
  const src = fs.readFileSync(FILE, 'utf-8');
  log('2a. "✓ Prêt" brut absent du source', !src.includes("'✓ Prêt'"));
  log('2b. "● Sources à vérifier" brut absent du source', !src.includes("'● Sources à vérifier'"));
  log('2c. icon-warning utilisé pour le statut "à vérifier"', src.includes('#icon-warning"></use></svg> Sources à vérifier'));
  log('2d. icon-verify utilisé pour le statut "Prêt"', src.includes('#icon-verify"></use></svg> Prêt'));
  // (le commentaire explicatif du correctif mentionne délibérément \u{1F4CB} en toutes lettres
  // pour documenter ce qui a été retiré — seule l'ancienne AFFECTATION fonctionnelle compte ici)
  log('3a. Émoji \\u{1F4CB} brut absent de l\'affectation fonctionnelle (badge long-doc)', !src.includes("textContent = '\\u{1F4CB}"));
  log('3b. icon-documents utilisé à la place', src.includes('#icon-documents"></use></svg> Document \' + chapters.length'));

  console.log('=== Résultats — Volet 2, correctifs émojis bruts ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  console.log('Erreurs JS:', errors.length ? JSON.stringify(errors) : 'aucune');
  process.exit(failCount > 0 || errors.length > 0 ? 1 : 0);
})();
