const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const seenHeaders = [];
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('clone-proxy.11drumboy11.workers.dev')) {
      seenHeaders.push({ url, hasKey: !!req.headers()['x-api-key'], method: req.method() });
    }
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    if (url.includes('clone-proxy.11drumboy11.workers.dev')) {
      // Le Worker réel est inaccessible depuis ce bac à sable — on capture juste les
      // en-têtes envoyés par le vrai code client, sans tenter d'atteindre le réseau.
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== /library-stats (route publique) : pas de X-API-Key nécessaire côté client, requête part quand même ===');
  console.log('En-têtes vus jusqu\'ici:', JSON.stringify(seenHeaders));

  await page.fill('#clinical-question', 'test sécurité');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    window.fetch = new Proxy(window.fetch, {
      apply(target, thisArg, args) {
        return target.apply(thisArg, args);
      }
    });
  });

  seenHeaders.length = 0;
  await page.fill('#adoc-input', 'Question de test');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(800);

  console.log('=== Toutes les requêtes POST vers le Worker (hors library-stats/sync-check) portent X-API-Key ===');
  const postCalls = seenHeaders.filter(h => h.method === 'POST');
  console.log('Nombre d\'appels POST observés:', postCalls.length);
  const missing = postCalls.filter(h => !h.hasKey);
  console.log('Appels POST SANS X-API-Key (attendu: aucun):', missing.length ? JSON.stringify(missing) : 'aucun');

  console.log('=== Assainissement innerHTML — Mémoire patient / dossier Collab ===');
  await page.evaluate(() => {
    window.conversationalSystem = {
      currentPatient: {
        name: '<img src=x onerror="window.__xss1=true">',
        notes: '<script>window.__xss2=true</script>Notes normales'
      }
    };
  });
  // adocLoadPatientContext() est appelée par window.openAssistDoc() — ré-invoquer ce
  // point d'entrée réel plutôt qu'une fonction interne non exposée (fermeture IIFE).
  await page.evaluate(() => window.openAssistDoc());
  await page.waitForTimeout(100);
  const xssResult = await page.evaluate(() => {
    return {
      xss1: window.__xss1 === true,
      xss2: window.__xss2 === true,
      boxHTML: document.getElementById('adoc-patient-box')?.innerHTML,
      boxText: document.getElementById('adoc-patient-box')?.textContent,
    };
  });
  console.log('Injection via p.name a exécuté du JS (attendu false):', xssResult.xss1);
  console.log('Injection via p.notes a exécuté du JS (attendu false):', xssResult.xss2);
  console.log('Contenu affiché (texte, doit rester lisible):', xssResult.boxText);
  console.log('HTML réellement injecté (doit montrer &lt;img... échappé, pas une vraie balise):', xssResult.boxHTML?.includes('&lt;img'));

  console.log('=== Erreurs JS ===', errors.length ? JSON.stringify(errors) : 'aucune');

  await browser.close();
})();
