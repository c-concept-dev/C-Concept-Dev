// Décision explicite Christophe (2026-09-07) — réintroduction temporaire de la clé API en dur
// comme DERNIER recours dans adocGetApiKey(), pour la commodité pendant la phase de test/
// construction active. Confirme : (1) la clé en dur est bien renvoyée quand AUCUNE autre source
// n'est disponible (jamais null en pratique désormais) ; (2) les 4 autres sources restent
// TOUTES prioritaires, dans le même ordre qu'avant ce changement (non-régression) ; (3) le
// marquage TEMPORAIRE est bien présent dans le code (retrouvable facilement) ; (4) l'avertissement
// _adocWarnMissingApiKey n'a pas été retiré (dort simplement, puisque le filet le rend inatteignable
// tant qu'il existe).
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const HARDCODED_KEY = '7005f3fe8b04dfde1299be47d75a6648f65c4f06c178b2c8';

(async () => {
  const results = [];

  // ── 0. Marquage TEMPORAIRE présent dans le source, avec la date ──
  const src = fs.readFileSync(FILE, 'utf-8');
  results.push(['0a. Marqueur "TEMPORAIRE" présent dans adocGetApiKey()', src.includes('TEMPORAIRE — PHASE DE TEST/CONSTRUCTION ACTIVE')]);
  results.push(['0b. Date de la décision présente (2026-09-07)', src.includes('2026-09-07')]);
  results.push(['0c. Justification "À RETIRER avant toute mise en production" présente', src.includes('À RETIRER avant toute mise en production')]);
  results.push(['0d. _adocWarnMissingApiKey toujours présente dans le code (pas retirée)', src.includes('function _adocWarnMissingApiKey()')]);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const capturedHeaders = [];
  const alerts = [];
  page.on('dialog', async d => { alerts.push(d.message()); await d.dismiss(); });
  await page.route('**/*', route => {
    const req = route.request();
    if (req.url().includes('/session-load')) {
      capturedHeaders.push(req.headers()['x-api-key']);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ found: false }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  // ── 1. Aucune source configurée → clé en dur utilisée comme dernier recours ──
  await page.evaluate(() => {
    try { localStorage.removeItem('workerApiKey'); } catch (_) {}
    delete window._therapyWorkerApiKey;
    delete window.CONFIG;
    delete window.conversationalSystem;
    window.adocKvPatientIdChange('patient-test-fallback');
  });
  await page.evaluate(() => window.adocKvLoad());
  results.push(['1. Sans aucune autre source — clé en dur transmise au serveur (jamais null)', capturedHeaders[0] === HARDCODED_KEY]);
  results.push(['1b. AUCUNE alerte "non configurée" déclenchée (le filet empêche désormais _adocWarnMissingApiKey de jamais s\'exécuter)', alerts.length === 0]);

  // ── 2. localStorage reste prioritaire sur le filet en dur (ordre inchangé) ──
  await page.evaluate(() => { try { localStorage.setItem('workerApiKey', 'cle-localstorage-test'); } catch (_) {} });
  await page.evaluate(() => window.adocKvLoad());
  results.push(['2. localStorage toujours prioritaire sur la clé en dur', capturedHeaders[capturedHeaders.length - 1] === 'cle-localstorage-test']);
  await page.evaluate(() => { try { localStorage.removeItem('workerApiKey'); } catch (_) {} });

  // ── 3. window.CONFIG reste prioritaire (sur le filet, et testé sans localStorage) ──
  await page.evaluate(() => { window.CONFIG = { WORKER_API_KEY: 'cle-config-test' }; });
  await page.evaluate(() => window.adocKvLoad());
  results.push(['3. window.CONFIG toujours prioritaire sur la clé en dur', capturedHeaders[capturedHeaders.length - 1] === 'cle-config-test']);
  await page.evaluate(() => { delete window.CONFIG; });

  // ── 4. window._therapyWorkerApiKey reste prioritaire ──
  await page.evaluate(() => { window._therapyWorkerApiKey = 'cle-therapy-test'; });
  await page.evaluate(() => window.adocKvLoad());
  results.push(['4. window._therapyWorkerApiKey toujours prioritaire sur la clé en dur', capturedHeaders[capturedHeaders.length - 1] === 'cle-therapy-test']);
  await page.evaluate(() => { delete window._therapyWorkerApiKey; });

  // ── 5. window.conversationalSystem reste la source la PLUS prioritaire de toutes ──
  await page.evaluate(() => { window.conversationalSystem = { WORKER_API_KEY: 'cle-conversational-test' }; window._therapyWorkerApiKey = 'ne-devrait-jamais-etre-utilisee'; });
  await page.evaluate(() => window.adocKvLoad());
  results.push(['5. window.conversationalSystem toujours prioritaire sur TOUT le reste (ordre inchangé)', capturedHeaders[capturedHeaders.length - 1] === 'cle-conversational-test']);
  await page.evaluate(() => { delete window.conversationalSystem; delete window._therapyWorkerApiKey; });

  // ── 6. Retour au cas "aucune source" — la clé en dur reprend le relais normalement ──
  await page.evaluate(() => window.adocKvLoad());
  results.push(['6. Retour à "aucune source" — clé en dur de nouveau utilisée normalement', capturedHeaders[capturedHeaders.length - 1] === HARDCODED_KEY]);

  console.log('=== Résultats — réintroduction temporaire de la clé API en dernier recours ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'ÉCHEC ') + label));
  console.log('\n=== errors ===', errors);
  await browser.close();
})();
