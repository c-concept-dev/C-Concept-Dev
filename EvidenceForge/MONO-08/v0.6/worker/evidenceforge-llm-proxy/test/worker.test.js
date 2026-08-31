"use strict";
// test/worker.test.js — evidenceforge-llm-proxy, tests LOCAL_CONTROLLED.
//
// Aucun déploiement Cloudflare, aucun binding réel : env.fetchImpl et
// env.RATE_LIMITER sont des doubles injectés localement. Prouve la logique
// du Worker (contrat CDC section 7) sans jamais prétendre a une preuve
// REAL — voir MONO-08-v0.6-ACCEPTANCE-MATRIX.md pour la distinction avec
// le cas G (REAL, non exécuté ici).

const { handleRequest, isValidMessagesPayload, extractBearerToken, constantTimeEquals } = require("../src/worker.js");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function makeRequest({ method, path, headers, body }) {
  return new Request("https://evidenceforge-llm-proxy.example.workers.dev" + (path || "/v1/messages"), {
    method: method || "POST",
    headers: headers || {},
    body: body,
  });
}

function alwaysAllowRateLimiter() {
  return { limit: async function () { return { success: true }; } };
}

function alwaysBlockRateLimiter() {
  return { limit: async function () { return { success: false }; } };
}

function fakeAnthropicFetch({ status, body, throwAbort, throwNetwork }) {
  return async function (url, opts) {
    if (throwAbort) {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }
    if (throwNetwork) {
      throw new Error("simulated network failure");
    }
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: status,
      headers: { "content-type": "application/json" },
    });
  };
}

const VALID_PAYLOAD = { model: "claude-3-5-haiku-latest", max_tokens: 16, messages: [{ role: "user", content: "hi" }] };

(async () => {
  // === Refus methode/route hors contrat ===
  {
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter() };
    const req = makeRequest({ method: "GET", path: "/v1/messages", headers: { authorization: "Bearer wk-good" } });
    const res = await handleRequest(req, env);
    check("Worker-1. GET /v1/messages refuse -> 404, aucun appel upstream possible avant ce refus", res.status === 404);
  }
  {
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter() };
    const req = makeRequest({ method: "POST", path: "/other-route", headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-2. POST /other-route refuse -> 404", res.status === 404);
  }

  // === D. credential Worker absent/invalide -> 401, aucun appel upstream ===
  {
    let upstreamCalled = false;
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async () => { upstreamCalled = true; return new Response("{}", { status: 200 }); } };
    const req = makeRequest({ body: JSON.stringify(VALID_PAYLOAD) }); // no Authorization header
    const res = await handleRequest(req, env);
    check("Worker-D1. Authorization absent -> 401, aucun appel upstream tente", res.status === 401 && !upstreamCalled);
  }
  {
    let upstreamCalled = false;
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async () => { upstreamCalled = true; return new Response("{}", { status: 200 }); } };
    const req = makeRequest({ headers: { authorization: "Bearer wk-WRONG" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-D2 (cas D). credential Worker incorrect -> 401, aucun appel upstream tente", res.status === 401 && !upstreamCalled);
  }

  // === K. rate limit -> 429 AVANT tout appel upstream ===
  {
    let upstreamCalled = false;
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysBlockRateLimiter(), fetchImpl: async () => { upstreamCalled = true; return new Response("{}", { status: 200 }); } };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-K (cas K). seuil rate limit atteint -> 429, aucun appel upstream tente", res.status === 429 && !upstreamCalled);
    const body = await res.json();
    check("Worker-K-body. corps 429 non converti en succes", body.error === "rate_limited");
  }

  // === payload invalide -> 400, aucun appel upstream ===
  {
    let upstreamCalled = false;
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async () => { upstreamCalled = true; return new Response("{}", { status: 200 }); } };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: "{not-json" });
    const res = await handleRequest(req, env);
    check("Worker-3. JSON malforme -> 400, aucun appel upstream tente", res.status === 400 && !upstreamCalled);
  }
  {
    let upstreamCalled = false;
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async () => { upstreamCalled = true; return new Response("{}", { status: 200 }); } };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify({ foo: "bar" }) });
    const res = await handleRequest(req, env);
    check("Worker-4. payload JSON valide mais non conforme (model/max_tokens/messages absents) -> 400, aucun appel upstream tente", res.status === 400 && !upstreamCalled);
  }

  // === succes : credential + payload valides -> appel upstream reellement invoque, relai fidele ===
  {
    let upstreamCalledWithKey = null;
    const anthropicBody = { id: "msg_1", type: "message", role: "assistant", content: [{ type: "text", text: "reponse simulee" }] };
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-secret-value",
      RATE_LIMITER: alwaysAllowRateLimiter(),
      fetchImpl: async (url, opts) => {
        upstreamCalledWithKey = opts.headers["x-api-key"];
        return new Response(JSON.stringify(anthropicBody), { status: 200, headers: { "content-type": "application/json" } });
      },
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    const body = await res.json();
    check("Worker-5. credential+payload valides -> appel upstream reellement invoque", upstreamCalledWithKey === "ak-secret-value");
    check("Worker-6. relai fidele du corps Anthropic (NIVEAU 1)", res.status === 200 && Array.isArray(body.content) && body.content[0].text === "reponse simulee");
    check("Worker-7. header de correlation X-EvidenceForge-Proxy present", res.headers.get("X-EvidenceForge-Proxy") === "evidenceforge-llm-proxy");
    check("Worker-8. header de correlation X-EvidenceForge-Upstream=anthropic present", res.headers.get("X-EvidenceForge-Upstream") === "anthropic");
    check("Worker-9. header de correlation X-EvidenceForge-Upstream-Status=200 present", res.headers.get("X-EvidenceForge-Upstream-Status") === "200");
    check("Worker-10. header de correlation X-EvidenceForge-Request-Id present (non secret)", !!res.headers.get("X-EvidenceForge-Request-Id"));
  }

  // === request-id fourni par le client est propage ===
  {
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      RATE_LIMITER: alwaysAllowRateLimiter(),
      fetchImpl: fakeAnthropicFetch({ status: 200, body: { content: [{ type: "text", text: "ok" }] } }),
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good", "x-evidenceforge-request-id": "client-supplied-id-123" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-11. request-id fourni par le client est propage tel quel (correlation NIVEAU 2)", res.headers.get("X-EvidenceForge-Request-Id") === "client-supplied-id-123");
  }

  // === erreur upstream relayee fidelement, jamais convertie en faux succes ===
  {
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      RATE_LIMITER: alwaysAllowRateLimiter(),
      fetchImpl: fakeAnthropicFetch({ status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }),
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-12. erreur upstream (529) relayee telle quelle, jamais transformee en 200", res.status === 529);
  }

  // === timeout upstream -> 504, jamais 200 ===
  {
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      RATE_LIMITER: alwaysAllowRateLimiter(),
      fetchImpl: fakeAnthropicFetch({ throwAbort: true }),
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-13. timeout upstream -> 504, jamais 200 de repli", res.status === 504);
  }

  // === panne reseau upstream (non-timeout) -> jamais 200 ===
  {
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      RATE_LIMITER: alwaysAllowRateLimiter(),
      fetchImpl: fakeAnthropicFetch({ throwNetwork: true }),
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-14. panne reseau upstream -> 502, jamais 200 de repli", res.status === 502);
  }

  // === ANTHROPIC_API_KEY absente cote Worker (mauvaise config serveur) -> jamais un faux succes ===
  {
    let upstreamCalled = false;
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async () => { upstreamCalled = true; return new Response("{}", { status: 200 }); } };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-15. ANTHROPIC_API_KEY absente cote Worker -> 500, aucun appel upstream, jamais un faux succes", res.status === 500 && !upstreamCalled);
  }

  // === secret jamais expose au client (reponse et headers) ===
  {
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-super-secret-value",
      RATE_LIMITER: alwaysAllowRateLimiter(),
      fetchImpl: fakeAnthropicFetch({ status: 200, body: { content: [{ type: "text", text: "ok" }] } }),
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    const bodyText = await res.text();
    let headerLeak = false;
    res.headers.forEach(function (v) { if (v.indexOf("ak-super-secret-value") !== -1) headerLeak = true; });
    check("Worker-16. ANTHROPIC_API_KEY jamais presente dans le corps de reponse", bodyText.indexOf("ak-super-secret-value") === -1);
    check("Worker-17. ANTHROPIC_API_KEY jamais presente dans un header de reponse", !headerLeak);
  }
  {
    const env = { WORKER_API_KEY: "wk-super-secret-worker-key", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter() };
    const req = makeRequest({ headers: { authorization: "Bearer wrong" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    const bodyText = await res.text();
    check("Worker-18. WORKER_API_KEY jamais presente dans un corps de reponse d'erreur 401", bodyText.indexOf("wk-super-secret-worker-key") === -1);
  }

  // === fonctions utilitaires exportees, testees isolement ===
  {
    check("Worker-19. isValidMessagesPayload() accepte un payload conforme", isValidMessagesPayload(VALID_PAYLOAD) === true);
    check("Worker-20. isValidMessagesPayload() rejette un payload sans messages", isValidMessagesPayload({ model: "x", max_tokens: 1 }) === false);
    check("Worker-21. extractBearerToken() extrait le token", extractBearerToken(makeRequest({ headers: { authorization: "Bearer abc123" } })) === "abc123");
    check("Worker-22. extractBearerToken() retourne null sans header", extractBearerToken(makeRequest({})) === null);
    check("Worker-23. constantTimeEquals() compare correctement", constantTimeEquals("same", "same") === true && constantTimeEquals("same", "diff") === false);
  }

  // === pas de rate limiter configure : ne bloque pas la requete, mais ne pretend jamais etre une config de production valide ===
  {
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      fetchImpl: fakeAnthropicFetch({ status: 200, body: { content: [{ type: "text", text: "ok" }] } }),
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-24. sans binding RATE_LIMITER (test), la requete n'est pas bloquee par defaut — cf. README.md : binding obligatoire avant tout deploiement reel", res.status === 200);
  }

  const failed = results.filter(function (r) { return !r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
