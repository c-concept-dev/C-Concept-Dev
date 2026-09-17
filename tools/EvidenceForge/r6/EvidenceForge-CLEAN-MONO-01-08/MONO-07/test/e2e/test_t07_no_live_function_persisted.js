"use strict";
// test/e2e/test_t07_no_live_function_persisted.js — T07-22

const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");
const { createRealE2ERun, driveRun, buildSerializableRunInputs } = require("../../lib/e2e-driver");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

function containsFunction(value, seen) {
  seen = seen || new Set();
  if (typeof value === "function") return true;
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((v) => containsFunction(v, seen));
}

(async () => {
  const { resolveKitRoot } = require("../../lib/kit-root");
  const kitRoot = resolveKitRoot();
  const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
  const providerConfigs = buildProviderConfigs(server.baseUrl);
  const env = buildEnv(kitRoot, "/tmp/t07-nolivefn-work-" + Date.now(), { providerConfigs, secrets: {} });

  const runInputsBundle = await buildSerializableRunInputs(env, { workerProviderId: "worker-success", openAlexProviderId: "openalex-success" });
  check("T07-22a. buildSerializableRunInputs() ne produit aucune fonction (adapter/workerCallFn/connectorRunners exclus par construction)", !containsFunction(runInputsBundle), JSON.stringify(Object.keys(runInputsBundle)));
  check("T07-22a-bis. seuls des identifiants sérialisables sont présents", typeof runInputsBundle.workerProviderId === "string" && typeof runInputsBundle.openAlexProviderId === "string" && !("adapter" in runInputsBundle) && !("workerCallFn" in runInputsBundle));

  const runId = "t07-nolivefn-" + Date.now().toString(36);
  await createRealE2ERun(env, { runId });
  await driveRun(env.operatorApi, runId, { maxIterations: 20 });
  check("T07-22b. un run réel complet persiste sans jamais lever DataCloneError (preuve exécutable qu'aucune fonction n'a transité par saveRunInputs)", true);

  const stored = await env.runRegistry.getRunInputs(runId);
  check("T07-22c. le bundle relu depuis le backend MONO-03 (après un aller-retour structuredClone réel) ne contient aucune fonction", !containsFunction(stored));

  const runState = await env.mono03.runStore.loadRun(runId);
  check("T07-22d. RunState complet (nodeStates, artifactRefs, lineageStatus) ne contient aucune fonction", !containsFunction(runState));

  await server.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
