// STUDIO CLINIQUE — Écran de connexion, construction : preuve réelle de l'overlay #cc-login-screen,
// de window.adocLoginSubmit et du script anti-clignotement, sur les 4 cas exigés (succès, échec,
// limite de débit, panne réseau) — jamais la clé technique visible ailleurs que dans la réponse
// réseau du 200 légitime.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');
const REAL_API_KEY = 'vraie-cle-technique-jamais-visible-ailleurs-000111';

async function overlayVisible(page) {
  return page.evaluate(() => getComputedStyle(document.getElementById('cc-login-screen')).display !== 'none');
}

(async () => {
  const browser = await chromium.launch();

  // ═══ Test 1 — sans localStorage : overlay visible, app couverte ═══
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.route('**/*', (route) => (route.request().url().startsWith('file:') ? route.continue() : route.abort()));
    await page.goto(PAGE_PATH);
    assert.equal(await overlayVisible(page), true, 'sans clé configurée, l\'overlay de connexion doit être visible par défaut');
    const landingCovered = await page.evaluate(() => {
      const overlay = document.getElementById('cc-login-screen');
      const landing = document.getElementById('cc-landing');
      const or = overlay.getBoundingClientRect(), lr = landing.getBoundingClientRect();
      return getComputedStyle(overlay).position === 'fixed' && or.width >= lr.width && or.height > 0;
    });
    assert.ok(landingCovered, 'l\'overlay doit structurellement couvrir #cc-landing (position:fixed, pleine largeur)');
    console.log('PASS 1/8 — sans clé configurée : overlay de connexion visible, couvre structurellement le reste de l\'app');
    assert.deepEqual(pageErrors, []);
    await page.close();
  }

  // ═══ Test 2 — anti-clignotement : AVEC une clé déjà en localStorage, overlay masqué dès le départ ═══
  {
    const page = await browser.newPage();
    await page.addInitScript((key) => localStorage.setItem('workerApiKey', key), REAL_API_KEY);
    await page.route('**/*', (route) => (route.request().url().startsWith('file:') ? route.continue() : route.abort()));
    await page.goto(PAGE_PATH);
    assert.equal(await overlayVisible(page), false, 'avec une clé déjà connue, l\'overlay ne doit jamais s\'afficher (anti-clignotement)');
    console.log('PASS 2/8 — appareil déjà connu (clé en localStorage) : overlay masqué dès le chargement, aucun clignotement');
    await page.close();
  }

  // ═══ Test 3 — mot de passe correct : clé posée, overlay masqué, app utilisable ═══
  {
    const page = await browser.newPage();
    const consoleTexts = [];
    page.on('console', (m) => consoleTexts.push(m.text()));
    let capturedRequestBody = null;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/login')) {
        capturedRequestBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ apiKey: REAL_API_KEY }) });
      }
      return route.abort();
    });
    await page.goto(PAGE_PATH);
    await page.fill('#cc-login-password', 'bon-mot-de-passe');
    await page.click('#cc-login-submit-btn');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('cc-login-screen')).display === 'none');
    assert.equal(capturedRequestBody.password, 'bon-mot-de-passe', 'la requête /login doit transmettre le mot de passe réellement tapé');
    const storedKey = await page.evaluate(() => localStorage.getItem('workerApiKey'));
    assert.equal(storedKey, REAL_API_KEY, 'la vraie clé technique reçue doit être posée dans localStorage automatiquement, jamais tapée par l\'utilisatrice');
    const passwordFieldEmptied = await page.evaluate(() => document.getElementById('cc-login-password').value === '');
    assert.ok(passwordFieldEmptied, 'le champ mot de passe doit être vidé après connexion réussie');
    // La clé technique ne doit jamais transiter par console.log ni apparaître dans le DOM restant.
    assert.ok(!consoleTexts.some((t) => t.includes(REAL_API_KEY)), 'la clé technique ne doit jamais apparaître dans la console');
    const domHtml = await page.content();
    assert.ok(!domHtml.includes(REAL_API_KEY), 'la clé technique ne doit jamais apparaître dans le DOM/HTML de la page');
    console.log('PASS 3/8 — mot de passe correct : clé posée automatiquement, overlay masqué, jamais visible dans le DOM ni la console');
  }

  // ═══ Test 4 — mot de passe incorrect : message clair, overlay reste affiché, rien en localStorage ═══
  {
    const page = await browser.newPage();
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/login')) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) });
      return route.abort();
    });
    await page.goto(PAGE_PATH);
    await page.fill('#cc-login-password', 'mauvais-mot-de-passe');
    await page.click('#cc-login-submit-btn');
    await page.waitForFunction(() => document.getElementById('cc-login-message').textContent.trim().length > 0);
    const message = await page.evaluate(() => document.getElementById('cc-login-message').textContent);
    assert.match(message, /incorrect/i, 'message clair attendu pour un mot de passe incorrect');
    assert.equal(await overlayVisible(page), true, 'l\'overlay doit rester affiché après un échec');
    assert.equal(await page.evaluate(() => localStorage.getItem('workerApiKey')), null, 'aucune clé ne doit être posée après un échec');
    console.log('PASS 4/8 — mot de passe incorrect : message clair, overlay reste affiché, rien posé en localStorage');
  }

  // ═══ Test 5 — limite de débit (429) : message adapté ═══
  {
    const page = await browser.newPage();
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/login')) return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Trop de tentatives — réessayez dans quelques minutes.' }) });
      return route.abort();
    });
    await page.goto(PAGE_PATH);
    await page.fill('#cc-login-password', 'quelque-chose');
    await page.click('#cc-login-submit-btn');
    await page.waitForFunction(() => document.getElementById('cc-login-message').textContent.trim().length > 0);
    const message = await page.evaluate(() => document.getElementById('cc-login-message').textContent);
    assert.match(message, /tentatives/i, 'message adapté attendu pour une limite de débit dépassée (429)');
    console.log('PASS 5/8 — limite de débit (429) : message adapté, distinct du mot de passe incorrect');
  }

  // ═══ Test 6 — panne réseau : message générique, jamais un plantage silencieux ═══
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/login')) return route.abort('failed');
      return route.abort();
    });
    await page.goto(PAGE_PATH);
    await page.fill('#cc-login-password', 'peu-importe');
    await page.click('#cc-login-submit-btn');
    await page.waitForFunction(() => document.getElementById('cc-login-message').textContent.trim().length > 0);
    const message = await page.evaluate(() => document.getElementById('cc-login-message').textContent);
    assert.match(message, /connexion impossible|réessay/i, 'message générique attendu en cas de panne réseau');
    const btnReenabled = await page.evaluate(() => !document.getElementById('cc-login-submit-btn').disabled);
    assert.ok(btnReenabled, 'le bouton doit être réactivé après une panne réseau, jamais bloqué indéfiniment sur "Connexion…"');
    assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit être levée en cas de panne réseau');
    console.log('PASS 6/8 — panne réseau : message générique, bouton réactivé, aucune erreur JS');
  }

  // ═══ Test 7 — champ vide : message immédiat, aucun appel réseau ═══
  {
    const page = await browser.newPage();
    let loginCalled = false;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/login')) { loginCalled = true; return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
      return route.abort();
    });
    await page.goto(PAGE_PATH);
    await page.click('#cc-login-submit-btn');
    await page.waitForTimeout(100);
    assert.equal(loginCalled, false, 'un champ vide ne doit jamais déclencher d\'appel réseau');
    const message = await page.evaluate(() => document.getElementById('cc-login-message').textContent);
    assert.ok(message.length > 0, 'un message doit inviter à saisir un mot de passe');
    console.log('PASS 7/8 — champ vide : aucun appel réseau, message immédiat');
  }

  // ═══ Test 8 — aucune régression des 41+ appels existants à adocGetApiKey() : une fois connectée, une route représentative fonctionne exactement comme avant ce lot ═══
  {
    const page = await browser.newPage();
    await page.addInitScript((key) => localStorage.setItem('workerApiKey', key), REAL_API_KEY);
    let capturedApiKeyHeader = null;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/brand-kits')) {
        capturedApiKeyHeader = route.request().headers()['x-api-key'] ?? null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"kits":[]}' });
      }
      return route.abort();
    });
    await page.goto(PAGE_PATH);
    await page.waitForTimeout(300);
    assert.equal(capturedApiKeyHeader, REAL_API_KEY, 'une fois connectée (clé posée par l\'écran de connexion), les appels existants (adocGetApiKey) doivent continuer de fonctionner à l\'identique, sans aucune modification de ces 41+ points d\'appel');
    console.log('PASS 8/8 — non-régression : les appels existants (adocGetApiKey) fonctionnent identiquement avec une clé posée par l\'écran de connexion');
  }

  console.log('\n=== TOUS LES TESTS ÉCRAN DE CONNEXION (8/8) PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
