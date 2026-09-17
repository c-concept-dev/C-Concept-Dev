"use strict";
// test/test_t08_v06_real_adapter_model.js — MONO-08 v0.6, micro-lot REAL
// ADAPTER MODEL FIX (2026-08-31).
//
// Couvre REAL-MODEL-1..5 et les tests fail-closed de configuration A..E du
// mandat, pour lib/real-external-adapter.js::buildRealLlmWorkerCallFn() /
// resolveRealLlmModel() / DEFAULT_REAL_LLM_MODEL.
//
// N'exécute JAMAIS bin/run-real-smoke.js, JAMAIS le Real Smoke complet.
// Aucun appel réseau réel : le Gateway MONO-04 (`mono04.gateway.executeRequest`)
// est entièrement injecté via un faux gateway local — jamais un mock
// présenté comme REAL, uniquement une vérification LOCAL_CONTROLLED de la
// construction du payload et de l'absence de référence ANTHROPIC_API_KEY.

const fs = require("fs");
const path = require("path");
const {
  buildRealLlmWorkerCallFn,
  resolveRealLlmModel,
  DEFAULT_REAL_LLM_MODEL,
} = require("../lib/real-external-adapter");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

// fakeGateway(response) — remplace mono04.gateway.executeRequest par une
// fonction qui capture le payload envoyé et retourne `response` (ou une
// réponse SUCCESS par défaut avec un content Anthropic structurellement
// valide). Aucun réseau, aucun mock présenté comme REAL.
function fakeGateway(response) {
  let capturedRequest = null;
  return {
    gateway: {
      executeRequest: function (req) {
        capturedRequest = req;
        return Promise.resolve(response || {
          status: "SUCCESS",
          result: { content: [{ type: "text", text: "reponse simulee LOCAL_CONTROLLED" }] },
        });
      },
    },
    getCapturedRequest: function () { return capturedRequest; },
  };
}

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

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

(async () => {
  // === REAL-MODEL-1. fallback = claude-haiku-4-5 (LLM_REAL_MODEL absent) ===
  {
    const resolved = resolveRealLlmModel({});
    check(
      "REAL-MODEL-1. LLM_REAL_MODEL absent -> fallback = DEFAULT_REAL_LLM_MODEL exporte",
      resolved === DEFAULT_REAL_LLM_MODEL && resolved === "claude-haiku-4-5",
      "resolved=" + resolved + " DEFAULT_REAL_LLM_MODEL=" + DEFAULT_REAL_LLM_MODEL
    );
  }

  // === REAL-MODEL-2. override via LLM_REAL_MODEL ===
  {
    const custom = "claude-test-real-model-abc";
    const resolved = resolveRealLlmModel({ LLM_REAL_MODEL: custom });
    check(
      "REAL-MODEL-2. LLM_REAL_MODEL defini -> valeur utilisee telle que prevue",
      resolved === custom,
      "resolved=" + resolved
    );
  }

  // === Phase 4-C. valeur vide -> comportement deterministe (fallback, meme regle que resolveLlmPreflightModel) ===
  {
    const resolved = resolveRealLlmModel({ LLM_REAL_MODEL: "" });
    check(
      "C. LLM_REAL_MODEL='' (vide) -> fallback deterministe = DEFAULT_REAL_LLM_MODEL (coherent avec resolveLlmPreflightModel)",
      resolved === DEFAULT_REAL_LLM_MODEL,
      "resolved=" + resolved
    );
  }

  // === REAL-MODEL-4 / Phase 4-B (execution complete). payload Worker contient le modele attendu, via buildRealLlmWorkerCallFn reel ===
  {
    const customModel = "claude-test-real-model-payload-check";
    const previous = process.env.LLM_REAL_MODEL;
    process.env.LLM_REAL_MODEL = customModel;
    const fake = fakeGateway();
    const workerCallFn = buildRealLlmWorkerCallFn({ gateway: fake.gateway }, { runId: "run-test", nodeId: "worker" });
    let text;
    try {
      text = await workerCallFn("prompt technique de test");
    } finally {
      if (previous === undefined) delete process.env.LLM_REAL_MODEL; else process.env.LLM_REAL_MODEL = previous;
    }
    const sentPayload = fake.getCapturedRequest() && fake.getCapturedRequest().payload;
    check(
      "REAL-MODEL-4. payload Worker (via gateway.executeRequest) contient exactement le modele configure",
      !!sentPayload && sentPayload.model === customModel && text === "reponse simulee LOCAL_CONTROLLED",
      "sentPayload=" + JSON.stringify(sentPayload) + " text=" + text
    );
  }

  // === REAL-MODEL-4bis. fallback reellement utilise dans le payload quand LLM_REAL_MODEL absent ===
  {
    const previous = process.env.LLM_REAL_MODEL;
    delete process.env.LLM_REAL_MODEL;
    const fake = fakeGateway();
    const workerCallFn = buildRealLlmWorkerCallFn({ gateway: fake.gateway }, { runId: "run-test", nodeId: "worker" });
    try {
      await workerCallFn("prompt technique de test");
    } finally {
      if (previous !== undefined) process.env.LLM_REAL_MODEL = previous;
    }
    const sentPayload = fake.getCapturedRequest() && fake.getCapturedRequest().payload;
    check(
      "REAL-MODEL-4bis. LLM_REAL_MODEL absent -> payload Worker utilise DEFAULT_REAL_LLM_MODEL, jamais l'ancien hardcode",
      !!sentPayload && sentPayload.model === DEFAULT_REAL_LLM_MODEL && sentPayload.model !== "claude-3-5-haiku-latest",
      "sentPayload=" + JSON.stringify(sentPayload)
    );
  }

  // === REAL-MODEL-3 / Phase 4-D. aucune reference CODE (hors commentaires) a ANTHROPIC_API_KEY dans buildRealLlmWorkerCallFn ===
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "real-external-adapter.js"), "utf8");
    const block = extractFunctionBody(src, "buildRealLlmWorkerCallFn");
    check("REAL-MODEL-3-extract. bloc buildRealLlmWorkerCallFn() extrait pour revue", !!block, block ? "longueur=" + block.length : "NON TROUVE");
    const code = block ? stripComments(block) : "";
    check(
      "REAL-MODEL-3 (Phase 4-D). aucune reference CODE (hors commentaires) a ANTHROPIC_API_KEY dans buildRealLlmWorkerCallFn() (lib/real-external-adapter.js)",
      !!block && code.indexOf("ANTHROPIC_API_KEY") === -1,
      code.indexOf("ANTHROPIC_API_KEY") !== -1 ? "TROUVE dans le code (hors commentaire) — violation" : "absent du code (hors commentaires), conforme"
    );
  }

  // === Phase 4-E. semantique direct/delegated : N/A pour ce fichier ===
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "real-external-adapter.js"), "utf8");
    check(
      "E. lib/real-external-adapter.js ne contient aucune branche direct/delegated (routage auth entierement delegue a lib/real-provider-configs.js + MONO-04 Gateway, non touche par ce correctif) -> N/A, non modifie",
      src.indexOf("LLM_AUTH_MODE") === -1,
      "aucune reference a LLM_AUTH_MODE dans ce fichier, confirme (grep negatif)"
    );
  }

  // === REAL-MODEL-5. aucune reference runtime restante a claude-3-5-haiku-latest dans le REAL path ===
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "real-external-adapter.js"), "utf8");
    const block = extractFunctionBody(src, "buildRealLlmWorkerCallFn");
    const code = block ? stripComments(block) : "";
    check(
      "REAL-MODEL-5. aucune reference CODE (hors commentaires) a l'ancien claude-3-5-haiku-latest dans buildRealLlmWorkerCallFn()",
      !!block && code.indexOf("claude-3-5-haiku-latest") === -1,
      code.indexOf("claude-3-5-haiku-latest") !== -1 ? "TROUVE — regression" : "absent, conforme (seul le commentaire d'en-tete du fichier documente encore l'ancien identifiant, a des fins historiques)"
    );
  }

  const failed = results.filter(function (r) { return !r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
