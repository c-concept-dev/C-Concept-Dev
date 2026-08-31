"use strict";
// test/test_t08_v06_delegated_auth.js — MONO-08 v0.6, Delegated LLM Authentication
//
// Couvre les cas LOCAL_CONTROLLED A, B, C, D, E, F, J, K et la revue
// structurelle H2, tels que definis par :
//   EvidenceForge/MONO-08/MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md
//   EvidenceForge/MONO-08/MONO-08-v0.6-ACCEPTANCE-MATRIX.md
//
// Couvre egalement OA1/OA2/OA3 (limite de securite sur la taille de reponse
// HTTP du preflight, Defaut Bloquant 1) et LLM1/LLM2/LLM3 (modele de sonde
// LLM configurable, Defaut Bloquant 2) — micro-lot correctif PRE-REAL
// 2026-08-31, voir EvidenceForge/MONO-08/v0.6-preflight-fix-r3-evidence/.
//
// N'exécute JAMAIS le cas G (REAL). Aucun appel réseau réel n'est effectué
// par ce fichier : tous les providers sont sondés via un `probe` local
// injecté (checkWithLocalProbe), ou via un `https.request` local remplace
// en memoire par un faux serveur EventEmitter (fakeHttpsOnce, pour
// OA1/OA2/OA3/LLM1/LLM2 qui doivent exercer httpRequest() lui-meme) —
// exactement comme test_t08_preflight.js (v0.5, non modifié) le fait deja
// pour ses propres cas, et comme les cas J de ce fichier le font deja pour
// intercepter https.request.

const fs = require("fs");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");
const { checkProvider, buildProviders, runPreflight, MAX_PREFLIGHT_RESPONSE_BYTES, DEFAULT_LLM_PREFLIGHT_MODEL } = require("../lib/preflight");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

async function checkWithLocalProbe(provider, probeResult) {
  return checkProvider(Object.assign({}, provider, { probe: function () { return Promise.resolve(probeResult); } }));
}

// fakeHttpsOnce(responder) — remplace https.request en memoire pour UNE
// requete, sans aucun reseau reel. `responder` = { statusCode, headers,
// chunks: [Buffer|string, ...] } ; les chunks sont emis sur l'objet `res`
// (EventEmitter) apres que le code sous test ait ecrit son corps de
// requete via req.write()/req.end() — reproduisant fidelement l'ordre reel
// (ecriture du corps client, puis reception de la reponse serveur) utilise
// par httpRequest() dans lib/preflight.js. Retourne un objet avec
// restore()/getCapturedOptions()/getCapturedBody() pour inspection.
function fakeHttpsOnce(responder) {
  const originalRequest = https.request;
  let capturedOptions = null;
  let capturedBody = "";
  https.request = function (reqOptions, callback) {
    capturedOptions = reqOptions;
    const res = new EventEmitter();
    res.statusCode = responder.statusCode;
    res.headers = responder.headers || {};
    res.destroy = function () { res.emit("close"); };
    const req = new EventEmitter();
    req.write = function (chunk) { capturedBody += chunk; };
    req.end = function () {
      callback(res);
      (responder.chunks || []).forEach(function (chunk) {
        res.emit("data", Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.emit("end");
    };
    req.destroy = function () {};
    return req;
  };
  return {
    restore: function () { https.request = originalRequest; },
    getCapturedOptions: function () { return capturedOptions; },
    getCapturedBody: function () { return capturedBody; },
  };
}

(async () => {
  // === A. direct sans ANTHROPIC_API_KEY -> AUTHENTICATION_BLOCKED ===
  {
    const direct = buildProviders({})[3];
    const r = await checkWithLocalProbe(direct, { reached: true, statusCode: 401, headers: {}, body: "", credentialProbeSkipped: true });
    check(
      "A. direct, ANTHROPIC_API_KEY absente -> AUTHENTICATION_BLOCKED",
      r.status === "AUTHENTICATION_BLOCKED" && r.authMode === "direct" && r.credentialEnvVar === "ANTHROPIC_API_KEY",
      JSON.stringify(r)
    );
  }

  // === B. direct + credential valide (simule en LOCAL_CONTROLLED) -> comportement v0.5 inchange ===
  {
    const direct = buildProviders({ ANTHROPIC_API_KEY: "fake-key-local-controlled" })[3];
    const r = await checkWithLocalProbe(direct, { reached: true, statusCode: 200, headers: {}, body: JSON.stringify({ content: [{ type: "text", text: "ok" }] }) });
    check(
      "B. direct + credential valide (LOCAL_CONTROLLED) -> READY, authMode=direct",
      r.status === "READY" && r.authMode === "direct",
      JSON.stringify(r)
    );
  }

  // === C. delegated sans EVIDENCEFORGE_WORKER_API_KEY -> AUTHENTICATION_BLOCKED, aucun appel authentifie ===
  {
    const delegated = buildProviders({ LLM_AUTH_MODE: "delegated" })[3];
    check(
      "C-config. provider delegated exige EVIDENCEFORGE_WORKER_API_KEY (jamais ANTHROPIC_API_KEY)",
      delegated.credentialEnvVar === "EVIDENCEFORGE_WORKER_API_KEY" && delegated.authMode === "delegated",
      JSON.stringify({ credentialEnvVar: delegated.credentialEnvVar, authMode: delegated.authMode })
    );
    const r = await checkWithLocalProbe(delegated, { reached: true, statusCode: 401, headers: {}, body: "", credentialProbeSkipped: true });
    check(
      "C. delegated sans EVIDENCEFORGE_WORKER_API_KEY -> AUTHENTICATION_BLOCKED",
      r.status === "AUTHENTICATION_BLOCKED" && r.credentialEnvVar === "EVIDENCEFORGE_WORKER_API_KEY" && r.credentialPresent === false,
      JSON.stringify(r)
    );
  }

  // === D. delegated, credential Worker invalide (rejet actif HTTP 401) -> AUTHENTICATION_BLOCKED ===
  {
    const delegated = buildProviders({ LLM_AUTH_MODE: "delegated", EVIDENCEFORGE_WORKER_API_KEY: "wrong-worker-key" })[3];
    const r = await checkWithLocalProbe(delegated, { reached: true, statusCode: 401, headers: {}, body: JSON.stringify({ error: "invalid_worker_credential" }) });
    check(
      "D. delegated, Worker rejette le credential (401 actif) -> AUTHENTICATION_BLOCKED, jamais NO_CREDENTIAL",
      r.status === "AUTHENTICATION_BLOCKED" && r.rawClassification === "PROVIDER_HTTP_ERROR",
      JSON.stringify(r)
    );
  }

  // === E. delegated, faux HTTP 200 / corps invalide -> INVALID_RESPONSE, jamais READY ===
  {
    const delegated = buildProviders({ LLM_AUTH_MODE: "delegated", EVIDENCEFORGE_WORKER_API_KEY: "good-worker-key" })[3];
    const r = await checkWithLocalProbe(delegated, { reached: true, statusCode: 200, headers: {}, body: JSON.stringify({ ok: true, notes: "corps arbitraire, pas une reponse Anthropic" }) });
    check(
      "E. delegated, HTTP 200 corps non conforme -> INVALID_RESPONSE, jamais READY",
      r.status === "INVALID_RESPONSE" && r.status !== "READY",
      JSON.stringify(r)
    );
  }

  // === F. delegated, Worker simule avec reponse Anthropic structurellement valide -> READY ===
  // NIVEAU 1 uniquement (CDC section 5.3). Explicitement LOCAL_CONTROLLED,
  // ne constitue JAMAIS une preuve REAL (CDC section 5.4, ACCEPTANCE-MATRIX
  // "Regle sur le cas F"). Ce test verifie uniquement la classification, pas
  // une realite provider.
  {
    const delegated = buildProviders({ LLM_AUTH_MODE: "delegated", EVIDENCEFORGE_WORKER_API_KEY: "good-worker-key" })[3];
    const r = await checkWithLocalProbe(delegated, { reached: true, statusCode: 200, headers: {}, body: JSON.stringify({ content: [{ type: "text", text: "reponse simulee" }] }) });
    check(
      "F. delegated, Worker simule NIVEAU 1 valide (LOCAL_CONTROLLED) -> READY",
      r.status === "READY" && r.authMode === "delegated",
      JSON.stringify(r)
    );
  }

  // === J. LLM_AUTH_MODE explicite invalide -> exception avant tout appel provider, aucune requete reseau ===
  {
    let httpsRequestCalled = false;
    const originalRequest = https.request;
    https.request = function () {
      httpsRequestCalled = true;
      throw new Error("https.request ne doit JAMAIS etre appele pour un LLM_AUTH_MODE explicite invalide");
    };
    let threw = false, message = "";
    try {
      buildProviders({ LLM_AUTH_MODE: "anything-else" });
    } catch (e) {
      threw = true;
      message = e.message;
    }
    https.request = originalRequest;
    check(
      "J-buildProviders. LLM_AUTH_MODE=\"anything-else\" -> exception avant tout appel provider, aucune requete reseau (https.request jamais invoque)",
      threw && !httpsRequestCalled && /PRODUCT_CONFIG_ERROR/.test(message),
      "threw=" + threw + " httpsRequestCalled=" + httpsRequestCalled + " message=" + message
    );
  }
  {
    let httpsRequestCalled = false;
    const originalRequest = https.request;
    https.request = function () {
      httpsRequestCalled = true;
      throw new Error("https.request ne doit JAMAIS etre appele pour un LLM_AUTH_MODE explicite invalide");
    };
    let rejected = false, message = "";
    try {
      await runPreflight({ env: { LLM_AUTH_MODE: "anything-else" } });
    } catch (e) {
      rejected = true;
      message = e.message;
    }
    https.request = originalRequest;
    check(
      "J-runPreflight. runPreflight() rejette LLM_AUTH_MODE invalide, aucune requete reseau — bin/run-preflight.js (inchange) traduit ceci en PRODUCT_CONFIG_ERROR / exit code 3",
      rejected && !httpsRequestCalled && /PRODUCT_CONFIG_ERROR/.test(message),
      "rejected=" + rejected + " httpsRequestCalled=" + httpsRequestCalled + " message=" + message
    );
  }
  {
    // Valeur absente -> direct (jamais rejetee). Confirme la non-regression
    // de la resolution par defaut (CDC section 4.1).
    let threw = false;
    try { buildProviders({}); } catch (e) { threw = true; }
    check("J-defaut. LLM_AUTH_MODE absent -> aucune exception (retombe sur direct)", threw === false, "threw=" + threw);
  }

  // === K. delegated, Worker rate-limite (HTTP 429) -> RATE_LIMITED, jamais READY ===
  {
    const delegated = buildProviders({ LLM_AUTH_MODE: "delegated", EVIDENCEFORGE_WORKER_API_KEY: "good-worker-key" })[3];
    const r = await checkWithLocalProbe(delegated, { reached: true, statusCode: 429, headers: {}, body: JSON.stringify({ error: "rate_limited" }) });
    check(
      "K. delegated, Worker HTTP 429 (rate limit) -> RATE_LIMITED, jamais READY",
      r.status === "RATE_LIMITED" && r.status !== "READY",
      JSON.stringify(r)
    );
    check(
      "K-note. Un 429 renvoye par checkProvider() a ce niveau simule le Worker bloquant AVANT upstream (CDC 7.11) — la preuve que l'appel upstream Anthropic n'a pas ete tente vit dans le Worker lui-meme (voir worker/evidenceforge-llm-proxy/test)",
      true,
      "voir rapport Worker separe"
    );
  }

  // === OA1. JSON reel-like > 4 Ko (ancien seuil destructif) mais < limite -> parse complet, READY ===
  {
    const oversizedResults = [];
    for (let i = 0; i < 40; i++) {
      oversizedResults.push({ id: "https://openalex.org/W" + (1000000 + i), display_name: "Titre d'exemple assez long pour occuper de la place reelle dans la reponse JSON de test #" + i, publication_year: 2020 + (i % 6) });
    }
    const bigBody = JSON.stringify({ results: oversizedResults, meta: { count: oversizedResults.length } });
    check("OA1-precondition. corps de test > 4 Ko (ancien seuil destructif)", bigBody.length > 4000, "taille=" + bigBody.length);
    const openalex = buildProviders({})[0];
    const fake = fakeHttpsOnce({ statusCode: 200, headers: { "content-type": "application/json; charset=utf-8" }, chunks: [bigBody] });
    let r;
    try { r = await checkProvider(openalex); } finally { fake.restore(); }
    check(
      "OA1. JSON reel-like > 4 Ko mais < MAX_PREFLIGHT_RESPONSE_BYTES -> parse complet, READY",
      r.status === "READY" && r.stages.responseValid === true,
      JSON.stringify(r)
    );
  }

  // === OA2. JSON > limite -> RESPONSE_TOO_LARGE / INVALID_RESPONSE, jamais READY ===
  {
    const padding = "x".repeat(MAX_PREFLIGHT_RESPONSE_BYTES + 1024);
    const oversizedBody = JSON.stringify({ results: [{ id: "W1", padding: padding }] });
    check("OA2-precondition. corps de test > MAX_PREFLIGHT_RESPONSE_BYTES", oversizedBody.length > MAX_PREFLIGHT_RESPONSE_BYTES, "taille=" + oversizedBody.length + " limite=" + MAX_PREFLIGHT_RESPONSE_BYTES);
    const openalex = buildProviders({})[0];
    // Emis en plusieurs morceaux (comme un vrai flux reseau), pour exercer
    // reellement le compteur d'octets cumulatif de httpRequest() plutot
    // qu'un seul gros chunk.
    const chunkSize = 65536;
    const chunks = [];
    for (let i = 0; i < oversizedBody.length; i += chunkSize) chunks.push(oversizedBody.slice(i, i + chunkSize));
    const fake = fakeHttpsOnce({ statusCode: 200, headers: { "content-type": "application/json; charset=utf-8" }, chunks: chunks });
    let r;
    try { r = await checkProvider(openalex); } finally { fake.restore(); }
    check(
      "OA2. JSON > MAX_PREFLIGHT_RESPONSE_BYTES -> INVALID_RESPONSE/RESPONSE_TOO_LARGE, jamais READY, jamais JSON.parse sur corps tronque",
      r.status === "INVALID_RESPONSE" && r.status !== "READY" && r.rawClassification === "RESPONSE_TOO_LARGE",
      JSON.stringify(r)
    );
  }

  // === OA3. JSON reellement malforme (sous la limite) -> INVALID_RESPONSE, comportement inchange ===
  {
    const openalex = buildProviders({})[0];
    const r = await checkWithLocalProbe(openalex, { reached: true, statusCode: 200, headers: { "content-type": "application/json" }, body: "{ceci n'est pas du JSON valide", bodyTruncated: false });
    check(
      "OA3. JSON reellement malforme (sous la limite) -> INVALID_RESPONSE, comportement inchange par ce correctif",
      r.status === "INVALID_RESPONSE" && r.rawClassification !== "RESPONSE_TOO_LARGE",
      JSON.stringify(r)
    );
  }

  // === LLM1. LLM_PREFLIGHT_MODEL defini -> le payload upstream utilise exactement cette valeur ===
  {
    const customModel = "claude-test-preflight-model-xyz";
    const delegated = buildProviders({ LLM_AUTH_MODE: "delegated", EVIDENCEFORGE_WORKER_API_KEY: "good-worker-key", LLM_PREFLIGHT_MODEL: customModel })[3];
    const fake = fakeHttpsOnce({ statusCode: 200, headers: {}, chunks: [JSON.stringify({ content: [{ type: "text", text: "ok" }] })] });
    let r, sentBody;
    try {
      r = await checkProvider(delegated);
      sentBody = JSON.parse(fake.getCapturedBody());
    } finally { fake.restore(); }
    check(
      "LLM1. LLM_PREFLIGHT_MODEL defini -> payload upstream utilise exactement cette valeur (jamais un hardcode)",
      sentBody.model === customModel && r.status === "READY",
      "sentBody.model=" + (sentBody && sentBody.model) + " r=" + JSON.stringify(r)
    );
  }

  // === LLM2. LLM_PREFLIGHT_MODEL absent -> fallback documente (DEFAULT_LLM_PREFLIGHT_MODEL), jamais l'ancien hardcode ===
  {
    const delegated = buildProviders({ LLM_AUTH_MODE: "delegated", EVIDENCEFORGE_WORKER_API_KEY: "good-worker-key" })[3];
    const fake = fakeHttpsOnce({ statusCode: 200, headers: {}, chunks: [JSON.stringify({ content: [{ type: "text", text: "ok" }] })] });
    let sentBody;
    try {
      await checkProvider(delegated);
      sentBody = JSON.parse(fake.getCapturedBody());
    } finally { fake.restore(); }
    check(
      "LLM2. LLM_PREFLIGHT_MODEL absent -> fallback = DEFAULT_LLM_PREFLIGHT_MODEL exporte (documente, non devine), jamais l'ancien claude-3-5-haiku-latest",
      sentBody.model === DEFAULT_LLM_PREFLIGHT_MODEL && sentBody.model !== "claude-3-5-haiku-latest" && typeof DEFAULT_LLM_PREFLIGHT_MODEL === "string" && DEFAULT_LLM_PREFLIGHT_MODEL.length > 0,
      "sentBody.model=" + (sentBody && sentBody.model) + " DEFAULT_LLM_PREFLIGHT_MODEL=" + DEFAULT_LLM_PREFLIGHT_MODEL
    );
  }

  // === LLM3. provider retourne 404 not_found_error (modele indisponible) -> INVALID_RESPONSE, jamais READY ===
  {
    const delegated = buildProviders({ LLM_AUTH_MODE: "delegated", EVIDENCEFORGE_WORKER_API_KEY: "good-worker-key" })[3];
    const r = await checkWithLocalProbe(delegated, {
      reached: true,
      statusCode: 404,
      headers: {},
      body: JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: claude-3-5-haiku-latest" } }),
    });
    check(
      "LLM3. provider retourne 404 not_found_error (modele indisponible reel) -> INVALID_RESPONSE, jamais transforme en READY",
      r.status === "INVALID_RESPONSE" && r.status !== "READY",
      JSON.stringify(r)
    );
  }

  // === H2. revue structurelle : aucune reference a ANTHROPIC_API_KEY dans les branches delegated ===
  {
    const preflightSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "preflight.js"), "utf8");
    const realProviderSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "real-provider-configs.js"), "utf8");

    function extractFunctionBody(src, fnName) {
      const startIdx = src.indexOf("function " + fnName + "(");
      if (startIdx === -1) return null;
      let depth = 0, i = startIdx, started = false, end = -1;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === "{") { depth++; started = true; }
        else if (c === "}") { depth--; if (started && depth === 0) { end = i + 1; break; } }
      }
      return end === -1 ? null : src.slice(startIdx, end);
    }

    // Retire les commentaires // et /* */ avant la recherche : le but de
    // H2 est de detecter une reference FONCTIONNELLE (code) a
    // ANTHROPIC_API_KEY dans le chemin delegated, jamais une mention dans
    // un commentaire qui explique justement son absence (ce qui serait un
    // faux positif contre-productif — un commentaire ne lit ni ne transmet
    // rien).
    function stripComments(code) {
      return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    }

    const delegatedPreflightBlock = extractFunctionBody(preflightSrc, "buildLlmWorkerProviderDelegated");
    check("H2-extract-preflight. bloc buildLlmWorkerProviderDelegated() extrait pour revue", !!delegatedPreflightBlock, delegatedPreflightBlock ? "longueur=" + delegatedPreflightBlock.length : "NON TROUVE");
    const delegatedPreflightCode = delegatedPreflightBlock ? stripComments(delegatedPreflightBlock) : "";
    check(
      "H2-preflight. aucune reference CODE (hors commentaires) a ANTHROPIC_API_KEY dans buildLlmWorkerProviderDelegated() (lib/preflight.js)",
      !!delegatedPreflightBlock && delegatedPreflightCode.indexOf("ANTHROPIC_API_KEY") === -1,
      delegatedPreflightCode.indexOf("ANTHROPIC_API_KEY") !== -1 ? "TROUVE dans le code (hors commentaire) — violation du contrat" : "absent du code (hors commentaires), conforme"
    );

    const delegatedRPCBlock = extractFunctionBody(realProviderSrc, "buildLlmWorkerConfigDelegated");
    check("H2-extract-real-provider-configs. bloc buildLlmWorkerConfigDelegated() extrait pour revue", !!delegatedRPCBlock, delegatedRPCBlock ? "longueur=" + delegatedRPCBlock.length : "NON TROUVE");
    const delegatedRPCCode = delegatedRPCBlock ? stripComments(delegatedRPCBlock) : "";
    check(
      "H2-real-provider-configs. aucune reference CODE (hors commentaires) a ANTHROPIC_API_KEY dans buildLlmWorkerConfigDelegated() (lib/real-provider-configs.js)",
      !!delegatedRPCBlock && delegatedRPCCode.indexOf("ANTHROPIC_API_KEY") === -1,
      delegatedRPCCode.indexOf("ANTHROPIC_API_KEY") !== -1 ? "TROUVE dans le code (hors commentaire) — violation du contrat" : "absent du code (hors commentaires), conforme"
    );
  }

  const failed = results.filter(function (r) { return !r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
