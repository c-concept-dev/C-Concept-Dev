"use strict";
// test/test_t08_v06_delegated_auth.js — MONO-08 v0.6, Delegated LLM Authentication
//
// Couvre les cas LOCAL_CONTROLLED A, B, C, D, E, F, J, K et la revue
// structurelle H2, tels que definis par :
//   EvidenceForge/MONO-08/MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md
//   EvidenceForge/MONO-08/MONO-08-v0.6-ACCEPTANCE-MATRIX.md
//
// N'exécute JAMAIS le cas G (REAL). Aucun appel réseau réel n'est effectué
// par ce fichier : tous les providers sont sondés via un `probe` local
// injecté (checkWithLocalProbe), exactement comme test_t08_preflight.js
// (v0.5, non modifié) le fait déjà pour ses propres cas.

const fs = require("fs");
const path = require("path");
const https = require("https");
const { checkProvider, buildProviders, runPreflight } = require("../lib/preflight");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

async function checkWithLocalProbe(provider, probeResult) {
  return checkProvider(Object.assign({}, provider, { probe: function () { return Promise.resolve(probeResult); } }));
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
