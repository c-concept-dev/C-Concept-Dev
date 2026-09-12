import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchGroqWithRetry,
  parseRetryAfterMs,
  parseRetryDelayFromBody,
  callGroq,
  PACING_MS
} from "../evaluation/lot10g3b3f3/run-role-benchmark.mjs";
import { ANALYST_SYSTEM_PROMPT, ANALYST_JSON_SCHEMA } from "../workers/shared/operational-request-core.js";

// Aucun appel réseau réel : globalThis.fetch est systématiquement mocké. Aucun test n'attend
// réellement 25-30s : chaque test fournit soit un sleepFn instantané (fetchGroqWithRetry), soit un
// délai de reprise volontairement très court (callGroq, qui utilise le vrai setTimeout mais avec un
// Retry-After de quelques millisecondes seulement).

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function recordingSleep(calls) {
  return async (ms) => { calls.push(ms); };
}

// --- Extraction du délai de reprise ------------------------------------------------------------

test("parseRetryAfterMs lit un Retry-After numérique (secondes)", () => {
  const response = jsonResponse({}, { status: 429, headers: { "Retry-After": "26" } });
  assert.equal(parseRetryAfterMs(response), 26000);
});

test("parseRetryAfterMs lit un Retry-After au format date HTTP", () => {
  const future = new Date(Date.now() + 12000).toUTCString();
  const response = jsonResponse({}, { status: 429, headers: { "Retry-After": future } });
  const parsed = parseRetryAfterMs(response);
  assert.ok(parsed !== null && parsed > 10000 && parsed <= 12000, `attendu ~12000ms, obtenu ${parsed}`);
});

test("parseRetryAfterMs retourne null en l'absence d'en-tête", () => {
  assert.equal(parseRetryAfterMs(jsonResponse({}, { status: 429 })), null);
});

test("parseRetryDelayFromBody extrait prudemment un délai depuis un message d'erreur explicite", () => {
  assert.equal(parseRetryDelayFromBody('{"error":{"message":"Rate limit reached. Please try again in 25.7s."}}'), 25700);
  assert.equal(parseRetryDelayFromBody('{"error":{"retry_after":"28.3"}}'), 28300);
});

test("parseRetryDelayFromBody retourne null quand rien de non-ambigu n'est trouvé (jamais une extrapolation risquée)", () => {
  assert.equal(parseRetryDelayFromBody('{"error":{"message":"Rate limit exceeded, slow down."}}'), null);
  assert.equal(parseRetryDelayFromBody(""), null);
  assert.equal(parseRetryDelayFromBody(null), null);
});

// --- fetchGroqWithRetry : 429 puis succès -----------------------------------------------------

test("fetchGroqWithRetry : un 429 avec Retry-After puis un succès retente le même appel et respecte le délai indiqué + marge", async (t) => {
  let callCount = 0;
  const requestBodies = [];
  withFetch(t, async (url, options) => {
    callCount += 1;
    requestBodies.push(options.body);
    if (callCount === 1) return jsonResponse({ error: { message: "rate limited" } }, { status: 429, headers: { "Retry-After": "2" } });
    return jsonResponse({ choices: [{ message: { content: "ok" } }] }, { status: 200 });
  });
  const sleeps = [];
  const result = await fetchGroqWithRetry("https://api.groq.com/openai/v1/chat/completions", { method: "POST", body: "same-payload" }, {
    maxRetries: 5, safetyMarginMs: 300, defaultBackoffMs: 30000, sleepFn: recordingSleep(sleeps)
  });
  assert.equal(callCount, 2, "le même appel doit être retenté exactement une fois après le 429.");
  assert.equal(requestBodies[0], requestBodies[1], "le corps de la requête retentée doit être strictement identique.");
  assert.equal(result.response.status, 200);
  assert.equal(result.retries, 1);
  assert.equal(result.rate_limited_wait_ms, 2300, "délai Retry-After (2000ms) + marge de sécurité (300ms).");
  assert.deepEqual(sleeps, [2300]);
});

test("fetchGroqWithRetry : sans Retry-After mais avec un délai exploitable dans le corps, utilise ce délai (jamais le repli fixe)", async (t) => {
  let callCount = 0;
  withFetch(t, async () => {
    callCount += 1;
    return callCount === 1
      ? jsonResponse({ error: { message: "Please try again in 5s." } }, { status: 429 })
      : jsonResponse({ choices: [{ message: { content: "ok" } }] }, { status: 200 });
  });
  const sleeps = [];
  await fetchGroqWithRetry("https://x", {}, { maxRetries: 3, safetyMarginMs: 100, defaultBackoffMs: 30000, sleepFn: recordingSleep(sleeps) });
  assert.deepEqual(sleeps, [5100], "5000ms extraits du corps + 100ms de marge, jamais le repli fixe de 30000ms.");
});

test("fetchGroqWithRetry : sans Retry-After ni indice exploitable dans le corps, utilise le repli fixe", async (t) => {
  let callCount = 0;
  withFetch(t, async () => {
    callCount += 1;
    return callCount === 1
      ? jsonResponse({ error: { message: "slow down" } }, { status: 429 })
      : jsonResponse({ choices: [{ message: { content: "ok" } }] }, { status: 200 });
  });
  const sleeps = [];
  await fetchGroqWithRetry("https://x", {}, { maxRetries: 3, safetyMarginMs: 100, defaultBackoffMs: 30000, sleepFn: recordingSleep(sleeps) });
  assert.deepEqual(sleeps, [30100], "aucun indice exploitable : repli fixe (30000ms) + marge (100ms).");
});

test("fetchGroqWithRetry : les tentatives épuisées lèvent une erreur technique distincte, jamais un succès simulé", async (t) => {
  let callCount = 0;
  withFetch(t, async () => { callCount += 1; return jsonResponse({ error: { message: "always limited" } }, { status: 429 }); });
  const sleeps = [];
  await assert.rejects(
    () => fetchGroqWithRetry("https://x", {}, { maxRetries: 3, safetyMarginMs: 0, defaultBackoffMs: 1000, sleepFn: recordingSleep(sleeps) }),
    (error) => {
      assert.equal(error.rateLimited, true);
      assert.equal(error.exhausted, true);
      assert.equal(error.retries, 3);
      return true;
    }
  );
  assert.equal(callCount, 4, "3 retries = 4 appels au total (1 initial + 3 reprises), jamais une boucle non bornée.");
  assert.equal(sleeps.length, 3);
});

test("fetchGroqWithRetry : une réponse non-429 (succès ou autre erreur) n'entraîne jamais de retry", async (t) => {
  let callCount = 0;
  withFetch(t, async () => { callCount += 1; return jsonResponse({ error: "bad request" }, { status: 400 }); });
  const result = await fetchGroqWithRetry("https://x", {}, { maxRetries: 5, safetyMarginMs: 0, defaultBackoffMs: 1000, sleepFn: recordingSleep([]) });
  assert.equal(callCount, 1);
  assert.equal(result.response.status, 400);
  assert.equal(result.retries, 0);
});

// --- Intégration callGroq : un 429 réessayé avec succès est indiscernable d'un succès direct ------

test("callGroq : un 429 suivi d'un succès produit exactement la même forme de résultat qu'un succès direct (aucun double comptage)", async (t) => {
  let callCount = 0;
  withFetch(t, async () => {
    callCount += 1;
    if (callCount === 1) return jsonResponse({ error: { message: "rate limited" } }, { status: 429, headers: { "Retry-After": "2" } });
    return jsonResponse({ choices: [{ message: { content: "{\"ok\":true}" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }, { status: 200 });
  });
  const sleeps = [];
  const result = await callGroq("analyst", ANALYST_SYSTEM_PROMPT, "user-message", ANALYST_JSON_SCHEMA, { safetyMarginMs: 0, sleepFn: recordingSleep(sleeps) });
  assert.equal(callCount, 2);
  assert.equal(result.content, "{\"ok\":true}");
  assert.equal(result.retries, 1);
  assert.equal(result.rate_limited_wait_ms, 2000);
  assert.deepEqual(sleeps, [2000], "aucune attente réelle n'a eu lieu : sleepFn injecté, testé sans délai véritable.");
  assert.ok(Number.isFinite(result.elapsed), "elapsed doit rester un nombre exploitable (temps d'attente 429 exclu de la latence modèle).");
});

test("callGroq : des retries épuisés remontent une erreur technique (provider_error), jamais un JSON invalide ni un pseudo-verdict", async (t) => {
  withFetch(t, async () => jsonResponse({ error: { message: "always limited" } }, { status: 429 }));
  const sleeps = [];
  await assert.rejects(
    () => callGroq("analyst", ANALYST_SYSTEM_PROMPT, "user-message", ANALYST_JSON_SCHEMA, { maxRetries: 2, defaultBackoffMs: 1000, sleepFn: recordingSleep(sleeps) }),
    (error) => {
      assert.equal(error.exhausted, true);
      assert.equal(error.rateLimited, true);
      assert.ok(Number.isFinite(error.elapsed));
      return true;
    }
  );
  assert.equal(sleeps.length, 2, "aucune attente réelle : sleepFn injecté et retries bornés à 2 pour ce test.");
});

// --- Régression : pacing par défaut nul, aucun changement de comportement sans le flag ------------

test("PACING_MS vaut 0 par défaut : aucune attente ajoutée tant que --pacing-ms n'est pas passé explicitement", () => {
  assert.equal(PACING_MS, 0);
});
