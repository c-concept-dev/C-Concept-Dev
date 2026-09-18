// test/worker.test.js — evidenceforge-llm-proxy, tests LOCAL_CONTROLLED.
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

import { handleRequest, isValidMessagesPayload, extractBearerToken, constantTimeEquals } from "../src/worker.js";

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

  const failed = results.filter(function (r) { return !r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
