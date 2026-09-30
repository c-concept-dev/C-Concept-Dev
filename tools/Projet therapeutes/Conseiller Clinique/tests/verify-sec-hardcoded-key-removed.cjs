// STUDIO CLINIQUE — Faille de sécurité, construction (Option A) : preuve réelle que la clé API
// codée en dur a bien disparu, que le mécanisme localStorage déjà existant reste seul en place, et
// qu'aucune des routes qui consomment adocGetApiKey() n'est cassée par ce retrait.
//
// Interception réseau réelle (page.route) pour lire l'en-tête X-API-Key RÉELLEMENT envoyé par le
// vrai code du fichier — jamais une relecture du code source pour "deviner" ce qui serait envoyé.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');
// L'ancienne clé en dur n'apparaît PLUS en clair ici : le dépôt est public, et la garder écrite
// reviendrait à la republier à chaque clone. On compare l'empreinte SHA-256 de l'en-tête réellement
// émis à celle de l'ancienne valeur — l'assertion est identique au mot près (une collision SHA-256
// sur 32 octets n'est pas un scénario de test), sans jamais stocker la valeur elle-même.
const crypto = require('node:crypto');
const EMPREINTE_ANCIENNE_CLE = '3567a494725596dbac4a6d5ed9ca845b5db15d5a25690992a74eb19ee2a260e2';
const empreinteDe = (v) => crypto.createHash('sha256').update(String(v == null ? '' : v)).digest('hex');
const NEW_TEST_KEY = 'test-key-configuree-manuellement-000111222';

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════ TEST 1 — SANS localStorage.setItem exécuté ═══════════════════
  {
    const page = await browser.newPage();
    const pageErrors = [];
    const consoleWarnings = [];
    let alertMessage = null;
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'warn') consoleWarnings.push(m.text()); });
    page.on('dialog', async (d) => { alertMessage = d.message(); await d.accept(); });

    const capturedHeaders = [];
    await page.route('**/*', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.startsWith('file:')) return route.continue();
      // Seules les routes Worker ciblées sont simulées — tout le reste (polices Google, etc.)
      // est simplement avorté (jamais nourri d'un JSON qui casserait un <script>/<link> réel) :
      // le but de ce test est de lire l'en-tête envoyé à CES routes, jamais de simuler
      // l'intégralité du réseau.
      if (url.includes('/brand-kits') || url.includes('/rag-search') || url.includes('/clinical-documents')) {
        capturedHeaders.push({ url, apiKey: req.headers()['x-api-key'] ?? null });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[],"chunks":[],"kits":[],"document_id":"doc-sec-001","version_id":"doc-sec-001-v1"}' });
      }
      return route.abort();
    });

    await page.goto(PAGE_PATH);
    await page.waitForTimeout(300); // laisse adocFetchBrandKits() (automatique au chargement) partir

    // Déclenche une recherche bibliothèque réelle (fonction exposée réellement utilisée par
    // l'écran d'accueil, jamais réimplémentée) — DOM déjà présent par défaut sur l'écran d'accueil.
    await page.evaluate(() => { document.getElementById('cc-home-search-input').value = 'test recherche sans cle configuree'; });
    await page.evaluate(() => window.adocHomeLibrarySearch());
    await page.waitForTimeout(200);

    assert.ok(capturedHeaders.length >= 2, 'au moins 2 routes (brand-kits automatique + rag-search) doivent avoir été observées, capturé : ' + capturedHeaders.length);
    capturedHeaders.forEach((h) => {
      assert.notEqual(empreinteDe(h.apiKey), EMPREINTE_ANCIENNE_CLE, 'l\'ancienne clé en dur ne doit plus JAMAIS être envoyée (' + h.url + ')');
    });
    console.log('PASS 1/6 — sans localStorage.setItem exécuté : aucune requête (' + capturedHeaders.length + ' observées) ne porte plus jamais l\'ancienne clé en dur');

    // Le message d'avertissement existant doit rester clair et actionnable une fois le repli en
    // dur retiré et sans aucune clé configurée (point 3 du CDC).
    assert.ok(consoleWarnings.some((w) => w.includes('workerApiKey')), 'l\'avertissement console doit toujours guider vers localStorage.setItem(\'workerApiKey\', ...)');
    assert.ok(alertMessage && alertMessage.includes('workerApiKey'), 'l\'alerte visible doit toujours guider clairement vers la commande à exécuter, message reçu : ' + alertMessage);
    console.log('PASS 2/6 — message d\'avertissement (console + alerte) toujours clair et actionnable, sans clé configurée');

    assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit être levée : ' + JSON.stringify(pageErrors));
    await page.close();
  }

  // ═══════════════════ TEST 2 — AVEC localStorage.setItem exécuté manuellement ═══════════════════
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('dialog', async (d) => { await d.accept(); });

    // Simule EXACTEMENT le geste demandé à Christophe : ouvrir la page, exécuter la commande dans
    // la console, une fois. addInitScript s'exécute avant tout script de la page (équivalent
    // fonctionnel d'une exécution manuelle précédente, persistée par le navigateur réel).
    await page.addInitScript((key) => { localStorage.setItem('workerApiKey', key); }, NEW_TEST_KEY);

    const capturedHeaders = [];
    await page.route('**/*', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/brand-kits') || url.includes('/rag-search') || url.includes('/clinical-documents')) {
        capturedHeaders.push({ url, apiKey: req.headers()['x-api-key'] ?? null });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[],"chunks":[],"kits":[],"document_id":"doc-sec-001","version_id":"doc-sec-001-v1"}' });
      }
      return route.abort();
    });

    await page.goto(PAGE_PATH);
    await page.waitForTimeout(300); // /brand-kits automatique

    // Route représentative 1 — recherche bibliothèque (identique au test 1).
    await page.evaluate(() => { document.getElementById('cc-home-search-input').value = 'test recherche avec cle configuree'; });
    await page.evaluate(() => window.adocHomeLibrarySearch());
    await page.waitForTimeout(200);

    // Route représentative 2 — sauvegarde d'un document (chemin réel adocWsSave, même patron de
    // fixture directe que verify-item63c-xlsx-grid.cjs/verify-item63g : reconstituer tout le
    // pipeline de génération dépasserait la portée de CE test, ciblé sur l'en-tête envoyé).
    const storeKey = 'adocArt_test_sec_key';
    await page.evaluate((key) => {
      window._adocWsState = window._adocWsState || {};
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts[key] = {
        name: 'Test clé API', _adocGenerationEngine: 'legacy-html',
        _adocCapabilities: { workspace: true, legacyBlockEditing: true, persist: true },
        _adocDocumentKind: 'fiche',
        html: '<!DOCTYPE html><html><head></head><body><p>Contenu de test.</p></body></html>',
      };
      window._adocWsState.storeKey = key;
    }, storeKey);
    await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(200);

    const brandKitsCalls = capturedHeaders.filter((h) => h.url.includes('/brand-kits'));
    const ragCalls = capturedHeaders.filter((h) => h.url.includes('/rag-search'));
    const clinicalDocCalls = capturedHeaders.filter((h) => h.url.includes('/clinical-documents'));
    assert.ok(brandKitsCalls.length >= 1, '/brand-kits (automatique au chargement) doit avoir été observée');
    assert.ok(ragCalls.length >= 1, '/rag-search (recherche bibliothèque) doit avoir été observée');
    assert.ok(clinicalDocCalls.length >= 1, '/clinical-documents (sauvegarde de document) doit avoir été observée');
    [...brandKitsCalls, ...ragCalls, ...clinicalDocCalls].forEach((h) => {
      assert.equal(h.apiKey, NEW_TEST_KEY, 'chaque route doit porter EXACTEMENT la clé définie via localStorage (' + h.url + '), reçu : ' + h.apiKey);
    });
    console.log('PASS 3/6 — avec localStorage.setItem exécuté : /brand-kits (automatique) porte bien la clé configurée');
    console.log('PASS 4/6 — avec localStorage.setItem exécuté : /rag-search (recherche bibliothèque) porte bien la clé configurée');
    console.log('PASS 5/6 — avec localStorage.setItem exécuté : /clinical-documents (sauvegarde de document) porte bien la clé configurée — le mécanisme reste pleinement fonctionnel après retrait du repli en dur');

    assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit être levée : ' + JSON.stringify(pageErrors));
    console.log('PASS 6/6 — aucune erreur JS levée sur l\'ensemble du scénario (sans clé / avec clé)');
    await page.close();
  }

  console.log('\n=== TOUS LES TESTS SÉCURITÉ — RETRAIT DE LA CLÉ API EN DUR (6/6) PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
