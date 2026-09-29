// STUDIO CLINIQUE — Écran de connexion, construction : preuve réelle de la route POST /login
// extraite TEXTUELLEMENT de index.js (jamais réimplémentée), même patron que
// verify-urgent-fix-bibliotheque-admin-worker.cjs (extraction par bornes + exécution vm avec des
// bindings factices, miniflare indisponible dans ce bac à sable).
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');

const rlStart = source.indexOf('var ADOC_LOGIN_RATE_LIMIT_MAX');
const rlEnd = source.indexOf('var C_CONCEPT_COLORS');
assert.ok(rlStart > 0 && rlEnd > rlStart, 'Bornes du limiteur /login introuvables — index.js a changé de forme');
const rateLimitAndCompareCode = source.slice(rlStart, rlEnd);

const routeStart = source.indexOf('if (p === "/login" && request2.method === "POST")');
const routeEnd = source.indexOf('// SEC-HOTFIX-01 — protégé par défaut');
assert.ok(routeStart > 0 && routeEnd > routeStart, 'Bornes de la route /login introuvables — index.js a changé de forme');
const routeCode = source.slice(routeStart, routeEnd);

const wrapperSrc = `
${rateLimitAndCompareCode}
async function loginRoute(request2, env2, p) {
  ${routeCode}
  return null;
}
module.exports = { loginRoute, adocCheckLoginRateLimit, adocConstantTimeEqual };
`;

function loadModule() {
  const CORS = { 'Access-Control-Allow-Origin': 'https://c-concept-dev.github.io' };
  const sandbox = { module: { exports: {} }, CORS, Response, crypto, TextEncoder, console };
  vm.createContext(sandbox);
  vm.runInContext(wrapperSrc, sandbox, { filename: 'login-route-extract.js' });
  return sandbox.module.exports;
}

function makeKV() {
  const store = new Map();
  return {
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
    _store: store,
  };
}

function makeRequest(bodyObj, ip) {
  const headers = new Map([['cf-connecting-ip', ip || '1.2.3.4']]);
  return {
    method: 'POST',
    headers: { get(name) { return headers.get(name.toLowerCase()) || null; } },
    async json() { return bodyObj; },
  };
}

(async () => {
  const { loginRoute, adocCheckLoginRateLimit, adocConstantTimeEqual } = loadModule();

  // ── Test 1 — mot de passe correct → 200, la vraie clé technique dans la réponse ──
  {
    const env = { WORKER_API_KEY: 'vraie-cle-technique-secrete-xyz', ADOC_LOGIN_PASSWORD: 'motdepasse-correct-2026', CLONE_KV: makeKV() };
    const r = await loginRoute(makeRequest({ password: 'motdepasse-correct-2026' }, '10.0.0.1'), env, '/login');
    assert.equal(r.status, 200, 'mot de passe correct doit renvoyer 200');
    const data = JSON.parse(await r.text());
    assert.equal(data.apiKey, 'vraie-cle-technique-secrete-xyz', 'la réponse 200 doit contenir la vraie clé technique');
    console.log('PASS 1/6 — mot de passe correct : 200, vraie clé technique renvoyée');
  }

  // ── Test 2 — mot de passe incorrect → 401, JAMAIS la clé dans la réponse ──
  {
    const env = { WORKER_API_KEY: 'vraie-cle-technique-secrete-xyz', ADOC_LOGIN_PASSWORD: 'motdepasse-correct-2026', CLONE_KV: makeKV() };
    const r = await loginRoute(makeRequest({ password: 'mauvais-mot-de-passe' }, '10.0.0.2'), env, '/login');
    assert.equal(r.status, 401, 'mot de passe incorrect doit renvoyer 401');
    const text = await r.text();
    assert.ok(!text.includes('vraie-cle-technique-secrete-xyz'), 'la clé technique ne doit JAMAIS apparaître dans une réponse d\'échec');
    assert.deepEqual(JSON.parse(text), { error: 'Unauthorized' });
    console.log('PASS 2/6 — mot de passe incorrect : 401, aucune fuite de la clé technique');
  }

  // ── Test 3 — secret serveur absent (fail closed) → 401, jamais un accès ouvert par défaut ──
  {
    const env = { WORKER_API_KEY: 'vraie-cle-technique-secrete-xyz', CLONE_KV: makeKV() }; // ADOC_LOGIN_PASSWORD absent
    const r = await loginRoute(makeRequest({ password: 'nimporte-quoi' }, '10.0.0.3'), env, '/login');
    assert.equal(r.status, 401, 'ADOC_LOGIN_PASSWORD non configuré doit bloquer (fail closed), jamais désactiver la vérification');
    console.log('PASS 3/6 — ADOC_LOGIN_PASSWORD absent : 401 (fail closed), jamais un accès ouvert par défaut');
  }

  // ── Test 4 — limite de débit dédiée : 429 après 10 tentatives dans la même fenêtre ──
  {
    const env = { WORKER_API_KEY: 'vraie-cle-technique-secrete-xyz', ADOC_LOGIN_PASSWORD: 'motdepasse-correct-2026', CLONE_KV: makeKV() };
    const ip = '10.0.0.4';
    let last;
    for (let i = 0; i < 10; i++) {
      last = await loginRoute(makeRequest({ password: 'mauvais' }, ip), env, '/login');
      assert.equal(last.status, 401, 'les 10 premières tentatives (mot de passe faux) doivent rester des 401, jamais bloquées trop tôt');
    }
    const eleventh = await loginRoute(makeRequest({ password: 'motdepasse-correct-2026' }, ip), env, '/login');
    assert.equal(eleventh.status, 429, 'la 11ᵉ tentative depuis la même IP doit être bloquée par la limite dédiée, même avec le bon mot de passe cette fois');
    // Une autre IP n'est jamais affectée par le compteur de la première (espace de clés par IP).
    const otherIp = await loginRoute(makeRequest({ password: 'motdepasse-correct-2026' }, '10.0.0.99'), env, '/login');
    assert.equal(otherIp.status, 200, 'une IP différente ne doit jamais être affectée par le compteur d\'une autre IP');
    console.log('PASS 4/6 — limite dédiée : 429 après 10 tentatives/IP/fenêtre, jamais mélangée aux autres compteurs, jamais partagée entre IP');
  }

  // ── Test 5 — comparaison à temps constant : correction fonctionnelle ──
  {
    assert.equal(await adocConstantTimeEqual('abc123', 'abc123'), true, 'deux valeurs identiques doivent être reconnues égales');
    assert.equal(await adocConstantTimeEqual('abc123', 'abc124'), false, 'une différence sur le dernier caractère doit être détectée');
    assert.equal(await adocConstantTimeEqual('abc', 'abcdef'), false, 'des longueurs différentes ne doivent jamais être considérées égales');
    assert.equal(await adocConstantTimeEqual('', ''), true, 'deux chaînes vides restent égales entre elles (cas limite)');
    console.log('PASS 5/6 — adocConstantTimeEqual : correction fonctionnelle (égal/différent/longueurs différentes/cas vide)');
  }

  // ── Test 6 — limite de débit dédiée isolée : jamais partagée avec un autre espace de clés KV ──
  {
    const kv = makeKV();
    for (let i = 0; i < 10; i++) await adocCheckLoginRateLimit({ CLONE_KV: kv }, '10.0.0.5');
    const blocked = await adocCheckLoginRateLimit({ CLONE_KV: kv }, '10.0.0.5');
    assert.equal(blocked, false, 'le limiteur dédié doit refuser après 10 tentatives');
    const keys = Array.from(kv._store.keys());
    assert.ok(keys.every((k) => k.startsWith('ratelimit:login:')), 'le limiteur /login doit utiliser son PROPRE espace de clés KV (ratelimit:login:*), jamais celui du compteur générique ni de /sync-check');
    console.log('PASS 6/6 — espace de clés KV dédié (ratelimit:login:*), jamais mélangé au compteur générique ni à celui de /sync-check');
  }

  console.log('\n=== TOUS LES TESTS ROUTE /login (6/6) PASSENT ===');
})().catch((err) => { console.error('ÉCHEC :', err); process.exit(1); });
