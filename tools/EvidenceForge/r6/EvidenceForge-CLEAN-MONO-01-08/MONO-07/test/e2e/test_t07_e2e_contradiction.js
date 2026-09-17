"use strict";
// test/e2e/test_t07_e2e_contradiction.js — T07-E2E-CONTRADICTION
//
// LIMITATION CONTRACTUELLE VÉRIFIÉE (voir CDC-TRACE.md) : la classification
// sémantique nommée convergence/divergence d'EF-03C est OPTIONNELLE
// (workerCallFn), et MONO-02/lib/node-runners.js (gelé) ne l'injecte
// jamais — confirmé par l'en-tête du module gelé lui-même, le port MONO-01
// (requiredInputs ne la mentionne pas), et 8 des ~12 tests gelés d'EF-03
// qui exercent explicitement ce mode comme nominal. Ce test ne dépend donc
// JAMAIS de convergences[]/divergences[] comme condition de PASS — il
// vérifie la préservation de la contradiction au niveau des FINDINGS BRUTS,
// seule garantie contractuelle réelle.

const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");
const { createRealE2ERun, driveRun } = require("../../lib/e2e-driver");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { resolveKitRoot } = require("../../lib/kit-root");
  const kitRoot = resolveKitRoot();
  const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
  const providerConfigs = buildProviderConfigs(server.baseUrl);
  const env = buildEnv(kitRoot, "/tmp/t07-contradiction-work-" + Date.now(), { providerConfigs, secrets: {} });
  const runId = "t07-contradiction-" + Date.now().toString(36);
  await createRealE2ERun(env, { runId });
  await driveRun(env.operatorApi, runId, { maxIterations: 20 });

  const artifacts = await env.operatorApi.listArtifacts(runId);
  const reviewRec = artifacts.find((a) => a.nodeId === "EF-03B");
  const reviewSet = (await env.operatorApi.getArtifact(runId, reviewRec.artifactId)).payload;
  const allFindings = reviewSet.reviews.flatMap((r) => r.findings || []);

  // Groupe par (target, dimension) — jamais une classification EF-03C
  // (optionnelle, non câblée), uniquement une lecture directe des findings.
  const byTargetDim = new Map();
  for (const f of allFindings) {
    const key = f.targetId + "::" + f.dimensionId;
    if (!byTargetDim.has(key)) byTargetDim.set(key, []);
    byTargetDim.get(key).push(f);
  }

  let foundAgreement = false;
  let foundContradiction = false;
  for (const [key, findings] of byTargetDim) {
    const dispositions = new Set(findings.map((f) => f.disposition));
    if (dispositions.size === 1 && findings.length >= 2) foundAgreement = true;
    if (dispositions.size >= 2) foundContradiction = true;
  }

  check("T07-16a. au moins un accord documentaire réel (même disposition, plusieurs twins indépendants, même cible/dimension)", foundAgreement);
  check("T07-16b. au moins une contradiction documentaire réelle (dispositions différentes sur la même cible/dimension)", foundContradiction);

  // La contradiction ne doit jamais être perdue ni réduite à un consensus :
  // les deux findings contradictoires doivent rester présents, distincts,
  // tracables, dans le rapport final agrégé (EF-03C base agrégat).
  const aggRec = artifacts.find((a) => a.nodeId === "EF-03C");
  const aggregated = (await env.operatorApi.getArtifact(runId, aggRec.artifactId)).payload;
  const target2DimA = aggregated.aggregates.find((a) => a.targetId === "target-02" && a.dimensionId === "SYNTHETIC_DIM_A");
  check("T07-16c. les deux findings contradictoires restent référencés dans l'agrégat (allFindingIds), aucun n'est supprimé", target2DimA && target2DimA.allFindingIds.length === 2, JSON.stringify(target2DimA && target2DimA.allFindingIds));

  // Interdits structurels (section 15/16 du CDC) : jamais de vote, majorité,
  // prestige, truthScore — vérifié par absence totale de ces champs dans
  // TOUT l'artefact agrégé et le rapport final, pas seulement les 2 cas ci-dessus.
  const aggregatedJson = JSON.stringify(aggregated);
  check("T07-16d. aucune trace de vote/majorité/prestige/truthScore dans l'agrégation (interdits structurels du module gelé)", !/majority|truthScore|prestige|"vote"|"consensus"/i.test(aggregatedJson), "vérifié");

  const stabRec = artifacts.find((a) => a.nodeId === "EF-03D");
  const stability = (await env.operatorApi.getArtifact(runId, stabRec.artifactId)).payload;
  // structurallyStable — vérifie que la sémantique reste structurelle,
  // jamais un jugement de validité scientifique.
  const stabilityJson = JSON.stringify(stability);
  check("T07-17. structurallyStable/analyses présentes et jamais assimilées à une validation scientifique ou un consensus d'experts", stability.analyses.length >= 1 && !/scientificallyValid|scientificallyProven|expertValidated|consensusValidated/i.test(stabilityJson), "vérifié sur " + stability.analyses.length + " analyses");

  const report = await env.operatorApi.getReport(runId);
  const reportJson = JSON.stringify(report);
  check("T07-16e. le rapport final ne contient aucune dérive épistémique (vote/majorité/prestige/truthScore/scientificValidity=true)", !/majority|truthScore|prestige|scientificallyValid|scientificallyProven|expertValidated/i.test(reportJson) && report.testStatus.scientificValidity === false, "vérifié");

  await server.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
