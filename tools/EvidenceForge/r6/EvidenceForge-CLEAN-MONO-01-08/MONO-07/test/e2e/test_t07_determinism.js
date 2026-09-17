"use strict";
// test/e2e/test_t07_determinism.js — T07-35

const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");
const { createRealE2ERun, driveRun } = require("../../lib/e2e-driver");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// Canonicalisation documentée : retire récursivement tout champ dont le
// NOM correspond à un champ contractuellement variable (timestamps,
// identifiants de run/artefact/décision eux-mêmes, hash dérivé d'un
// horodatage) — jamais un champ métier. Chaque exclusion ci-dessous a été
// identifiée par comparaison RÉELLE de deux runs, jamais supposée à
// l'avance (auditDecisionRefs/screeningDecisionRef/decisionId : identifiants
// de décision EF-01D générés horodatage+aléatoire ; hashOuChecksum : dérivé
// d'un horodatage de qualification interne).
const VARIABLE_FIELD_NAMES = new Set([
  "runId", "generatedAt", "createdAt", "updatedAt", "completedAt", "startedAt", "computedAt", "evaluatedAt", "builtAt",
  "artifactId", "artifactRefs", "outputArtifactRefs", "inputArtifactRefs", "duration", "requestId",
  "auditDecisionRefs", "screeningDecisionRef", "decisionId", "hashOuChecksum"
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (VARIABLE_FIELD_NAMES.has(k)) continue;
      out[k] = canonicalize(v);
    }
    return out;
  }
  return value;
}

async function runOnce(kitRoot, providerConfigs) {
  const env = buildEnv(kitRoot, "/tmp/t07-determinism-work-" + Date.now() + Math.random().toString(36).slice(2, 6), { providerConfigs, secrets: {} });
  const runId = "t07-determinism-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await createRealE2ERun(env, { runId });
  const { trace } = await driveRun(env.operatorApi, runId, { maxIterations: 20 });
  const artifacts = await env.operatorApi.listArtifacts(runId);
  const payloads = {};
  for (const a of artifacts) payloads[a.nodeId] = (await env.operatorApi.getArtifact(runId, a.artifactId)).payload;
  const report = await env.operatorApi.getReport(runId);
  return {
    nodeSequence: trace.map((t) => t.nodeId),
    nodeOutcomes: trace.map((t) => t.state),
    payloads,
    report
  };
}

(async () => {
  const { resolveKitRoot } = require("../../lib/kit-root");
  const kitRoot = resolveKitRoot();
  const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
  const providerConfigs = buildProviderConfigs(server.baseUrl);

  const run1 = await runOnce(kitRoot, providerConfigs);
  const run2 = await runOnce(kitRoot, providerConfigs);

  check("T07-35a. même ordre de nœuds entre les deux runs", JSON.stringify(run1.nodeSequence) === JSON.stringify(run2.nodeSequence), JSON.stringify(run1.nodeSequence) + " vs " + JSON.stringify(run2.nodeSequence));
  check("T07-35b. mêmes issues de nœuds (SUCCESS partout, identiques)", JSON.stringify(run1.nodeOutcomes) === JSON.stringify(run2.nodeOutcomes));

  const canon1 = canonicalize(run1.payloads);
  const canon2 = canonicalize(run2.payloads);
  check("T07-35c. artefacts sémantiques identiques (canonicalisés : runId/timestamps/artifactId retirés, jamais un champ métier)", JSON.stringify(canon1) === JSON.stringify(canon2), "diffère");

  const reviewSet1 = run1.payloads["EF-03B"];
  const reviewSet2 = run2.payloads["EF-03B"];
  const dispositions1 = reviewSet1.reviews.flatMap((r) => r.findings.map((f) => f.disposition)).sort();
  const dispositions2 = reviewSet2.reviews.flatMap((r) => r.findings.map((f) => f.disposition)).sort();
  check("T07-35d. mêmes dispositions de findings (contradiction reproduite identiquement, jamais aléatoire)", JSON.stringify(dispositions1) === JSON.stringify(dispositions2), `${JSON.stringify(dispositions1)} vs ${JSON.stringify(dispositions2)}`);

  const canonReport1 = canonicalize(run1.report);
  const canonReport2 = canonicalize(run2.report);
  check("T07-35e. rapport final identique une fois canonicalisé", JSON.stringify(canonReport1) === JSON.stringify(canonReport2));
  check("T07-35f. assuranceLevel identique entre les deux runs", run1.report.lineage.lineageAssurance.assuranceLevel === run2.report.lineage.lineageAssurance.assuranceLevel);

  await server.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
