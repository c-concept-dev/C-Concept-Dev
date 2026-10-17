// test/worker.test.js — evidenceforge-llm-proxy, tests LOCAL_CONTROLLED. v0.8 : + délais séparés (Worker-T8-*, ~45 s de mur ; PROXY_TEST_FULL_SCALE=1 pour le flux réel de 150 s).
//
// Aucun déploiement Cloudflare, aucun binding réel : env.fetchImpl et
// env.RATE_LIMITER sont des doubles injectés localement. Prouve la logique
// du Worker (contrat CDC section 7) sans jamais prétendre a une preuve
// REAL — voir MONO-08-v0.6-ACCEPTANCE-MATRIX.md pour la distinction avec
// le cas G (REAL, non exécuté ici).
//
// Import ESM natif (correctif d'audit) : ce fichier et src/worker.js sont
// tous deux de vrais modules ES (package.json déclare "type": "module"),
// pour que src/worker.js expose un `export default { fetch }` reconnu par
// Wrangler comme point d'entrée Worker valide (voir README.md).

import { handleRequest, isValidMessagesPayload, extractBearerToken, constantTimeEquals, parseBoundedMs, readTimeoutConfig, DEFAULT_HEADER_TIMEOUT_MS, HEADER_TIMEOUT_BOUNDS, PROXY_VERSION } from "../src/worker.js";

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function makeRequest({ method, path, headers, body }) {
  return new Request("https://evidenceforge-llm-proxy.example.invalid" + (path || "/v1/messages"), {
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

  // === L. RATE LIMITER BINDING ABSENT -> fail-closed, 503, aucun upstream ===
  // (correctif d'audit — remplace l'ancien Worker-24, qui affirmait a tort
  // que l'absence de binding laissait passer la requete : c'etait
  // precisement le bug fail-open corrige ici)
  {
    let upstreamCalled = false;
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      // pas de RATE_LIMITER du tout
      fetchImpl: async () => { upstreamCalled = true; return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 }); },
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    const body = await res.json();
    check("Worker-L (cas L). RATE_LIMITER absent -> 503, jamais 200, jamais 429", res.status === 503, "status=" + res.status);
    check("Worker-L-upstream. RATE_LIMITER absent -> aucun appel upstream tente (fail-closed avant upstream)", upstreamCalled === false);
    check("Worker-L-reason. corps 503 porte une cause explicite RATE_LIMITER_UNAVAILABLE", body.reason === "RATE_LIMITER_UNAVAILABLE", JSON.stringify(body));
  }

  // === M. RATE LIMITER BINDING INVALID (present mais .limit non fonctionnel) -> fail-closed, 503, aucun upstream ===
  {
    let upstreamCalled = false;
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      RATE_LIMITER: { limit: "not-a-function" }, // binding present, interface invalide
      fetchImpl: async () => { upstreamCalled = true; return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 }); },
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    const body = await res.json();
    check("Worker-M (cas M). RATE_LIMITER present mais .limit non fonctionnel -> 503, jamais 200", res.status === 503, "status=" + res.status);
    check("Worker-M-upstream. binding invalide -> aucun appel upstream tente", upstreamCalled === false);
    check("Worker-M-reason. corps 503 porte RATE_LIMITER_UNAVAILABLE", body.reason === "RATE_LIMITER_UNAVAILABLE", JSON.stringify(body));
  }
  {
    // Variante M : .limit() existe mais renvoie une forme inattendue
    // (ni {success:true} ni {success:false}) -> traite comme indisponible,
    // jamais interprete par defaut comme "autorise".
    let upstreamCalled = false;
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      RATE_LIMITER: { limit: async () => ({ someOtherField: 1 }) },
      fetchImpl: async () => { upstreamCalled = true; return new Response("{}", { status: 200 }); },
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-M2. .limit() renvoie une forme inattendue (pas de success:boolean) -> 503, jamais 200", res.status === 503 && !upstreamCalled, "status=" + res.status);
  }

  // === N. RATE LIMITER RUNTIME ERROR (.limit() leve une exception) -> fail-closed, 503, aucun upstream ===
  {
    let upstreamCalled = false;
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      RATE_LIMITER: { limit: async () => { throw new Error("simulated rate limiter outage"); } },
      fetchImpl: async () => { upstreamCalled = true; return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 }); },
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    const body = await res.json();
    check("Worker-N (cas N). .limit() leve une exception -> 503, jamais 200", res.status === 503, "status=" + res.status);
    check("Worker-N-upstream. exception du limiteur -> aucun appel upstream tente", upstreamCalled === false);
    check("Worker-N-reason. corps 503 porte RATE_LIMITER_RUNTIME_ERROR", body.reason === "RATE_LIMITER_RUNTIME_ERROR", JSON.stringify(body));
  }

  // === Confirmation croisee : K (quota reellement depasse) reste 429, distinct de L/M/N (503) ===
  {
    let upstreamCalled = false;
    const env = {
      WORKER_API_KEY: "wk-good",
      ANTHROPIC_API_KEY: "ak-good",
      RATE_LIMITER: alwaysBlockRateLimiter(), // binding VALIDE, quota reellement depasse
      fetchImpl: async () => { upstreamCalled = true; return new Response("{}", { status: 200 }); },
    };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) });
    const res = await handleRequest(req, env);
    check("Worker-K-vs-L. binding valide + quota depasse -> 429 (jamais 503) : K et L restent bien distincts", res.status === 429 && !upstreamCalled, "status=" + res.status);
  }

  /* ===== v0.7 — STREAMING (MONOLITH-v1.0.8) : relais SSE au fil de l'eau, jamais bufferise ; non-streaming inchange ===== */
  {
    const enc = new TextEncoder(); const chunks = ["event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_s\"}}\n\n", "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"bonjour\"}}\n\n", "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"];
    let pulled = 0; let upstreamBodyRequested = false;
    const upstream = () => new Response(new ReadableStream({ pull(ctrl) { if (pulled < chunks.length) { ctrl.enqueue(enc.encode(chunks[pulled++])); } else ctrl.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
    const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async (url, init) => { upstreamBodyRequested = /"stream":true/.test(init.body); return upstream(); } };
    const req = makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(Object.assign({}, VALID_PAYLOAD, { stream: true })) });
    const res = await handleRequest(req, env);
    check("Worker-S1. stream:true + amont 200 text/event-stream -> 200 text/event-stream relaye, en-tete X-EvidenceForge-Transport=sse-stream, corps = flux (pas un texte bufferise)", res.status === 200 && /text\/event-stream/.test(res.headers.get("content-type")) && res.headers.get("x-evidenceforge-transport") === "sse-stream" && res.body && typeof res.body.getReader === "function", "status=" + res.status + " ct=" + res.headers.get("content-type"));
    check("Worker-S2. le payload amont conserve stream:true (relais fidele du corps client)", upstreamBodyRequested === true);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let received = ""; let firstChunkSeenBeforeEnd = false; for (;;) { const c = await reader.read(); if (c.done) break; received += dec.decode(c.value, { stream: true }); if (pulled < chunks.length) firstChunkSeenBeforeEnd = true; }
    check("Worker-S3. les evenements SSE arrivent au client au fil de l'eau (premier chunk lu avant la fin du flux amont) et integralement", firstChunkSeenBeforeEnd && received === chunks.join(""), "received=" + received.length + " pulled=" + pulled);
    /* amont en erreur pendant un stream demande : chemin historique (corps lu, statut relaye fidelement, jamais un faux 200) */
    const env2 = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async () => new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), { status: 529, headers: { "content-type": "application/json" } }) };
    const res2 = await handleRequest(makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(Object.assign({}, VALID_PAYLOAD, { stream: true })) }), env2);
    check("Worker-S4. stream:true mais amont 529 JSON -> statut 529 relaye, transport=buffered, jamais converti en flux ni en 200", res2.status === 529 && res2.headers.get("x-evidenceforge-transport") === "buffered", "status=" + res2.status);
    /* non-streaming inchange */
    const env3 = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async () => new Response("{\"id\":\"msg_n\"}", { status: 200, headers: { "content-type": "application/json" } }) };
    const res3 = await handleRequest(makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) }), env3);
    check("Worker-S5. payload sans stream -> comportement historique (200 JSON bufferise, transport=buffered)", res3.status === 200 && (await res3.text()) === "{\"id\":\"msg_n\"}" && res3.headers.get("x-evidenceforge-transport") === "buffered");
    /* stream:true mais amont repond en JSON (ex. proxy amont non streaming) -> relaye tel quel (le client sait le reconstruire) */
    const env4 = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter(), fetchImpl: async () => new Response("event: message_stop\ndata: {}\n\n", { status: 200, headers: { "content-type": "text/plain" } }) };
    const res4 = await handleRequest(makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(Object.assign({}, VALID_PAYLOAD, { stream: true })) }), env4);
    check("Worker-S6. stream:true mais amont 200 non event-stream -> corps relaye bufferise (compatibilite), statut fidele", res4.status === 200 && res4.headers.get("x-evidenceforge-transport") === "buffered");
    check("Worker-S7. aucun secret dans les en-tetes de la reponse streamee", !JSON.stringify([...res.headers.entries()]).includes("ak-good") && !JSON.stringify([...res.headers.entries()]).includes("wk-good"));
  }

  /* ===== v0.8 — DÉLAIS SÉPARÉS (MONOLITH-v1.0.9) : HEADER_TIMEOUT_MS seul appliqué, lecture stricte des variables, flux jamais coupé par le Worker ===== */
  {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const FULL = process.env.PROXY_TEST_FULL_SCALE === "1";   /* PROXY_TEST_FULL_SCALE=1 : flux réel de 150 s (sinon échelle réduite, même construction) */
    const baseEnv = (extra) => Object.assign({ WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", RATE_LIMITER: alwaysAllowRateLimiter() }, extra || {});
    const streamReq = () => makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(Object.assign({}, VALID_PAYLOAD, { stream: true })) });
    const enc = new TextEncoder();
    /* amont factice : en-têtes après `headerDelayMs`, honore le signal d'abandon (AbortError) comme le fetch réel ; puis flux SSE de `chunks` espacés de `chunkEveryMs` */
    const slowUpstream = (o) => async (url, init) => {
      await new Promise((resolve, reject) => { const t = setTimeout(resolve, o.headerDelayMs || 0); if (init && init.signal) { if (init.signal.aborted) { clearTimeout(t); return reject(Object.assign(new Error("aborted"), { name: "AbortError" })); } init.signal.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }); } });
      let i = 0; const n = o.chunks || 3; const every = o.chunkEveryMs || 0; const stall = o.stallAfter || 0;
      return new Response(new ReadableStream({ async pull(ctrl) { if (stall && i >= stall) { await new Promise(() => {}); } if (i < n) { if (every) await sleep(every); ctrl.enqueue(enc.encode("event: content_block_delta\ndata: {\"i\":" + (i++) + "}\n\n")); } else ctrl.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    const readAll = async (res) => { const r = res.body.getReader(); const d = new TextDecoder(); let out = "", chunks = 0; for (;;) { const c = await r.read(); if (c.done) break; chunks++; out += d.decode(c.value, { stream: true }); } return { out, chunks }; };

    /* --- en-têtes lentes : 1 s / 7,9 s / 8,5 s / 20 s / 45 s => succès sous le défaut 60 s (en parallèle : ~45 s de mur) --- */
    const delays = [1000, 7900, 8500, 20000, 45000];
    const t0 = Date.now();
    const outcomes = await Promise.all(delays.map(async (ms) => { const env = baseEnv({ fetchImpl: slowUpstream({ headerDelayMs: ms, chunks: 2 }) }); const res = await handleRequest(streamReq(), env); const body = res.status === 200 ? await readAll(res) : null; return { ms, status: res.status, transport: res.headers.get("x-evidenceforge-transport"), timeouts: res.headers.get("x-evidenceforge-timeouts"), chunks: body ? body.chunks : 0 }; }));
    for (const o of outcomes) check("Worker-T8-" + (o.ms / 1000) + "s. en-têtes amont après " + (o.ms / 1000) + " s -> 200 sse-stream sous HEADER_TIMEOUT_MS par défaut (" + DEFAULT_HEADER_TIMEOUT_MS + ") ; ancien défaut 8000 aurait coupé à partir de 8 s", o.status === 200 && o.transport === "sse-stream" && o.chunks === 2 && o.timeouts === "header=60000;stream-inactivity=client;stream-max=client", JSON.stringify(o));
    check("Worker-T8-wall. les cinq attentes ont couru en parallèle (mur < 60 s) et le défaut vaut bien 60 000 ms, bornes 1 000–90 000", Date.now() - t0 < 60000 && DEFAULT_HEADER_TIMEOUT_MS === 60000 && HEADER_TIMEOUT_BOUNDS.min === 1000 && HEADER_TIMEOUT_BOUNDS.max === 90000, String(Date.now() - t0));

    /* --- dépassement de HEADER_TIMEOUT_MS => 504 explicite (phase, délai appliqué, attente mesurée), aucun flux --- */
    { const logs = []; const env = baseEnv({ HEADER_TIMEOUT_MS: "1500", fetchImpl: slowUpstream({ headerDelayMs: 4000 }), logger: (l) => logs.push(l) }); const t1 = Date.now(); const res = await handleRequest(streamReq(), env); const el = Date.now() - t1; const body = JSON.parse(await res.text());
      check("Worker-T8-timeout. en-têtes après 4 s avec HEADER_TIMEOUT_MS=1500 -> 504 upstream_timeout à ~1,5 s, phase upstream_headers, headerTimeoutMs 1500 (source env), upstreamWaitMs ~1500, transport buffered, aucun flux", res.status === 504 && body.error === "upstream_timeout" && body.phase === "upstream_headers" && body.headerTimeoutMs === 1500 && body.headerTimeoutSource === "env" && body.upstreamWaitMs >= 1400 && body.upstreamWaitMs < 3000 && el < 3000 && res.headers.get("x-evidenceforge-timeouts") === "header=1500;stream-inactivity=client;stream-max=client", JSON.stringify(body) + " el=" + el);
      check("Worker-T8-timeout-log. le journal du 504 porte upstream_timeout sans secret ni prompt", logs.some((l) => /upstream_timeout/.test(l)) && !logs.join("\n").includes("ak-good") && !logs.join("\n").includes("wk-good") && !logs.join("\n").includes("\"hi\""), logs.join(" | ").slice(0, 200)); }

    /* --- flux APRÈS les en-têtes : jamais interrompu par le minuteur d'en-têtes (échelle réduite 3 s > 1 s ; PROXY_TEST_FULL_SCALE=1 : 150 s > 60 s) --- */
    { const headerTimeout = FULL ? 60000 : 1000; const chunks = FULL ? 150 : 15; const every = FULL ? 1000 : 200;
      const env = baseEnv({ HEADER_TIMEOUT_MS: String(headerTimeout), fetchImpl: slowUpstream({ headerDelayMs: 50, chunks, chunkEveryMs: every }) }); const t2 = Date.now(); const res = await handleRequest(streamReq(), env); const got = await readAll(res); const dur = Date.now() - t2;
      check("Worker-T8-stream" + (FULL ? "-150s" : "-3s") + ". flux de " + Math.round(chunks * every / 1000) + " s après les en-têtes (> HEADER_TIMEOUT_MS = " + headerTimeout / 1000 + " s) -> 200, " + chunks + " événements intégralement relayés, jamais interrompu par le minuteur d'en-têtes", res.status === 200 && got.chunks === chunks && dur >= chunks * every - 100 && dur > headerTimeout, "chunks=" + got.chunks + " dur=" + dur); }
    { const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/worker.js", import.meta.url), "utf8")); const iClear = src.indexOf("if (timer) clearTimeout(timer);\n\n  // 6 bis)"); const iRelay = src.indexOf("return new Response(upstreamResponse.body");
      check("Worker-T8-source. par construction : clearTimeout(timer) précède le relais du flux et la lecture bufferisée ; aucun autre minuteur n'existe dans le Worker", iClear !== -1 && iRelay !== -1 && iClear < iRelay && (src.match(/setTimeout\(/g) || []).length === 1, "clear=" + iClear + " relay=" + iRelay); }

    /* --- flux inactif : le Worker ne le coupe pas (garde CLIENT inchangée : MONOLITH T-STREAM-09, inactivité 90 s) --- */
    { const env = baseEnv({ HEADER_TIMEOUT_MS: "1000", fetchImpl: slowUpstream({ headerDelayMs: 10, chunks: 5, stallAfter: 1 }) }); const res = await handleRequest(streamReq(), env); const r = res.body.getReader(); const first = await r.read(); const second = await Promise.race([r.read().then(() => "closed"), sleep(2500).then(() => "still-open")]);
      check("Worker-T8-inactive. flux qui se tait après 1 événement : toujours ouvert 2,5 s plus tard (> HEADER_TIMEOUT_MS 1 s) — le Worker n'applique aucune garde d'inactivité, c'est le client (llm.streaming.inactivityMs) qui décide", res.status === 200 && !first.done && second === "still-open", String(second)); try { await r.cancel(); } catch (e) { /* */ } }

    /* --- lecture stricte des variables --- */
    const traces = []; const tr = (t) => traces.push(t);
    check("Worker-T8-env-number. valeur numérique 12345 -> appliquée telle quelle (source env)", readTimeoutConfig({ HEADER_TIMEOUT_MS: 12345 }, tr).headerTimeoutMs === 12345 && readTimeoutConfig({ HEADER_TIMEOUT_MS: 12345 }).headerSource === "env");
    check("Worker-T8-env-string. valeur chaîne \"60000\" (forme Cloudflare) -> 60000 (source env) ; \" 45000 \" -> 45000 ; \"7999.6\" -> 8000", readTimeoutConfig({ HEADER_TIMEOUT_MS: "60000" }, tr).headerTimeoutMs === 60000 && readTimeoutConfig({ HEADER_TIMEOUT_MS: " 45000 " }, tr).headerTimeoutMs === 45000 && readTimeoutConfig({ HEADER_TIMEOUT_MS: "7999.6" }, tr).headerTimeoutMs === 8000 && traces.length === 0);
    check("Worker-T8-env-invalid. valeur invalide (\"abc\", \"\", NaN, {}, \"1e999\") -> défaut 60000 + trace config_invalid (sans la valeur brute) ; chaîne vide = absente (pas de trace)", (() => { traces.length = 0; const a = readTimeoutConfig({ HEADER_TIMEOUT_MS: "abc" }, tr).headerTimeoutMs, b = readTimeoutConfig({ HEADER_TIMEOUT_MS: "" }, tr).headerTimeoutMs, c = readTimeoutConfig({ HEADER_TIMEOUT_MS: NaN }, tr).headerTimeoutMs, d = readTimeoutConfig({ HEADER_TIMEOUT_MS: {} }, tr).headerTimeoutMs, e = readTimeoutConfig({ HEADER_TIMEOUT_MS: "1e999" }, tr).headerTimeoutMs; return [a, b, c, d, e].every((x) => x === 60000) && traces.filter((t) => t.event === "config_invalid").length === 4 && traces.every((t) => !("value" in t) && !("raw" in t)); })(), JSON.stringify(traces));
    check("Worker-T8-env-negative. valeur négative (\"-5\", -1) et zéro -> défaut 60000 + trace config_out_of_range ; jamais 0 ni négatif appliqué", (() => { traces.length = 0; const r = [readTimeoutConfig({ HEADER_TIMEOUT_MS: "-5" }, tr), readTimeoutConfig({ HEADER_TIMEOUT_MS: -1 }, tr), readTimeoutConfig({ HEADER_TIMEOUT_MS: "0" }, tr)]; return r.every((x) => x.headerTimeoutMs === 60000 && x.headerSource === "default_after_out_of_range") && traces.filter((t) => t.event === "config_out_of_range").length === 3; })(), JSON.stringify(traces));
    check("Worker-T8-env-bounds. hors bornes (\"500\" < 1000, \"500000\" > 90000) -> défaut 60000 + trace ; bornes exactes (1000, 90000) acceptées", (() => { traces.length = 0; const lo = readTimeoutConfig({ HEADER_TIMEOUT_MS: "500" }, tr).headerTimeoutMs, hi = readTimeoutConfig({ HEADER_TIMEOUT_MS: "500000" }, tr).headerTimeoutMs, e1 = readTimeoutConfig({ HEADER_TIMEOUT_MS: "1000" }, tr).headerTimeoutMs, e2 = readTimeoutConfig({ HEADER_TIMEOUT_MS: "90000" }, tr).headerTimeoutMs; return lo === 60000 && hi === 60000 && e1 === 1000 && e2 === 90000 && traces.length === 2; })(), JSON.stringify(traces));
    check("Worker-T8-env-legacy. TIMEOUT_MS (v0.6/v0.7) accepté comme alias de HEADER_TIMEOUT_MS avec trace config_legacy_alias ; HEADER_TIMEOUT_MS prime s'il est présent ; TIMEOUT_MS=8000 (ancien défaut) reste possible mais explicite", (() => { traces.length = 0; const a = readTimeoutConfig({ TIMEOUT_MS: "8000" }, tr), b = readTimeoutConfig({ TIMEOUT_MS: "8000", HEADER_TIMEOUT_MS: "30000" }, tr); return a.headerTimeoutMs === 8000 && a.headerSource === "env" && traces.some((t) => t.event === "config_legacy_alias") && b.headerTimeoutMs === 30000; })(), JSON.stringify(traces));
    check("Worker-T8-env-stream-vars. STREAM_INACTIVITY_TIMEOUT_MS / STREAM_MAX_DURATION_MS : absentes -> null (annoncées 'client') ; posées -> normalisées et annoncées '(client-enforced)', jamais appliquées par le Worker (aucun setTimeout supplémentaire)", (() => { const a = readTimeoutConfig({}), b = readTimeoutConfig({ STREAM_INACTIVITY_TIMEOUT_MS: "90000", STREAM_MAX_DURATION_MS: "900000" }); return a.streamInactivityTimeoutMs === null && a.streamMaxDurationMs === null && /stream-inactivity=client;stream-max=client/.test(a.announce) && b.streamInactivityTimeoutMs === 90000 && b.streamMaxDurationMs === 900000 && /stream-inactivity=90000\(client-enforced\);stream-max=900000\(client-enforced\)/.test(b.announce); })());
    check("Worker-T8-parse. parseBoundedMs : jamais NaN / 0 / négatif ; défaut null respecté pour les variables informatives", parseBoundedMs(undefined, { name: "x", def: 5, min: 1, max: 10 }).value === 5 && parseBoundedMs("x", { name: "x", def: null, min: 1, max: 10 }).value === null && parseBoundedMs("3", { name: "x", def: 5, min: 1, max: 10 }).value === 3 && parseBoundedMs(0, { name: "x", def: 5, min: 1, max: 10 }).value === 5);
    { const logs = []; const env = baseEnv({ HEADER_TIMEOUT_MS: "ak-good", fetchImpl: slowUpstream({ headerDelayMs: 10, chunks: 1 }), logger: (l) => logs.push(l) }); const res = await handleRequest(streamReq(), env); await readAll(res);
      check("Worker-T8-env-invalid-request. variable invalide en requête réelle -> défaut appliqué (en-tête header=60000), trace config_invalid:HEADER_TIMEOUT_MS journalisée SANS la valeur brute (qui pourrait être un secret collé au mauvais endroit)", res.status === 200 && res.headers.get("x-evidenceforge-timeouts") === "header=60000;stream-inactivity=client;stream-max=client" && logs.some((l) => /config_invalid:HEADER_TIMEOUT_MS/.test(l)) && !logs.join("\n").includes("ak-good"), logs.join(" | ").slice(0, 300)); }

    /* --- 429 / 502 / 503 / 529 amont : relayés inchangés (streaming demandé ou non) --- */
    for (const st of [429, 502, 503, 529]) { const env = baseEnv({ fetchImpl: async () => new Response(JSON.stringify({ type: "error", error: { type: "e" + st } }), { status: st, headers: { "content-type": "application/json" } }) }); const r1 = await handleRequest(streamReq(), env); const r2 = await handleRequest(makeRequest({ headers: { authorization: "Bearer wk-good" }, body: JSON.stringify(VALID_PAYLOAD) }), env);
      check("Worker-T8-http-" + st + ". amont " + st + " -> " + st + " relayé fidèlement (stream:true et non streaming), transport buffered, jamais 200, en-tête X-EvidenceForge-Timeouts présent", r1.status === st && r2.status === st && r1.headers.get("x-evidenceforge-transport") === "buffered" && r2.headers.get("x-evidenceforge-transport") === "buffered" && /header=60000/.test(r1.headers.get("x-evidenceforge-timeouts")), r1.status + "/" + r2.status); }
    /* --- rate limiter fail-closed inchangé, avant tout appel amont, quelle que soit la configuration des délais --- */
    { let called = false; const env = { WORKER_API_KEY: "wk-good", ANTHROPIC_API_KEY: "ak-good", HEADER_TIMEOUT_MS: "60000", fetchImpl: async () => { called = true; return new Response("{}", { status: 200 }); } }; const res = await handleRequest(streamReq(), env);
      check("Worker-T8-ratelimit. binding RATE_LIMITER absent -> 503 fail-closed, aucun appel amont, même avec HEADER_TIMEOUT_MS posé", res.status === 503 && !called, String(res.status)); }
    check("Worker-T8-version. PROXY_VERSION = evidenceforge-llm-proxy/0.8-stream-timeouts", PROXY_VERSION === "evidenceforge-llm-proxy/0.8-stream-timeouts", PROXY_VERSION);
    { const res = await handleRequest(makeRequest({ headers: { authorization: "Bearer wk-good" }, body: "{}" }), baseEnv()); check("Worker-T8-probe. sonde gratuite `{}` (doctor) -> 400 invalid_request avec X-EvidenceForge-Proxy-Version et X-EvidenceForge-Timeouts : le doctor peut prouver que v0.8 est deploye sans appel amont", res.status === 400 && res.headers.get("x-evidenceforge-proxy-version") === PROXY_VERSION && res.headers.get("x-evidenceforge-timeouts") === "header=60000;stream-inactivity=client;stream-max=client", String(res.status)); }
  }

  const failed = results.filter(function (r) { return !r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
