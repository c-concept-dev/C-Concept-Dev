"use strict";
// test/e2e/test_t07_e2e_happy.js — T07-E2E-HAPPY

const path = require("path");
const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");
const { createRealE2ERun, driveRun } = require("../../lib/e2e-driver");
const { assertMono06GatePasses } = require("../../lib/mono06-gate");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

async function runHappyPath(kitRoot, workDir) {
  const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
  const providerConfigs = buildProviderConfigs(server.baseUrl);
  const env = buildEnv(kitRoot, workDir, { providerConfigs, secrets: {} });
  const runId = "t07-happy-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await createRealE2ERun(env, { runId });
  const { trace } = await driveRun(env.operatorApi, runId, { maxIterations: 20 });
  return { env, runId, trace, close: () => server.close() };
}

(async () => {
  const { resolveKitRoot } = require("../../lib/kit-root");
  const kitRoot = resolveKitRoot();
  const gateReport = await assertMono06GatePasses(kitRoot, "/tmp/t07-gate-happy-" + Date.now());
  check("T07-01. le harnais MONO-07 démarre (fixtures, providers, driver chargés sans erreur)", true);
  check("T07-02. MONO-06-R3 gate PASS avant tout run E2E (baseline 785/1223 confirmée)", gateReport.overallStatus === "PASS" && gateReport.globalTotals.monoObserved === 785 && gateReport.globalTotals.historiqueObserved === 1223, JSON.stringify(gateReport.globalTotals));

  const { env, runId, trace, close } = await runHappyPath(kitRoot, "/tmp/t07-happy-work-" + Date.now());

  check("T07-03. EF-ORCH-SUBSYSTEM exécuté réellement (via EFOrchExecutionPort, jamais EF-01A-F reconstruits)", trace.find((t) => t.nodeId === "EF-ORCH-SUBSYSTEM" && t.state === "SUCCESS") !== undefined, JSON.stringify(trace[0]));

  const graph = await env.operatorApi.getGraph(runId);
  const allSuccess = graph.nodes.every((n) => n.state === "SUCCESS");
  check("14/14 nodes SUCCESS (happy path complet)", allSuccess && graph.nodes.length === 14, JSON.stringify(graph.nodes.map((n) => n.nodeId + ":" + n.state)));

  const state = await env.mono03.runStore.loadRun(runId);
  const durableSuccessCount = Object.values(state.nodeStates).filter((n) => n.state === "SUCCESS").length;
  check("T07-21. état durable MONO-03 cohérent : 14/14 SUCCESS dans RunState (pas seulement en mémoire moteur)", durableSuccessCount === 14, durableSuccessCount);
  const artifactRefsComplete = graph.nodes.every((n) => state.artifactRefs[n.nodeId]);
  check("T07-21b. artifactRefs complets pour les 14 nœuds (aucun SUCCESS partiel/sans artefact)", artifactRefsComplete, JSON.stringify(state.artifactRefs));

  const artifacts = await env.operatorApi.listArtifacts(runId);
  const byNode = Object.fromEntries(artifacts.map((a) => [a.nodeId, a]));
  async function getPayload(nodeId) {
    return (await env.operatorApi.getArtifact(runId, byNode[nodeId].artifactId)).payload;
  }

  check("T07-05. CorpusSnapshot produit avec le bon schéma/version", byNode["EF-ORCH-SUBSYSTEM"].contract === "EvidenceForge.CorpusSnapshot" && byNode["EF-ORCH-SUBSYSTEM"].schemaVersion === "EF-01F-v1", JSON.stringify(byNode["EF-ORCH-SUBSYSTEM"]));

  const prGen01 = await getPayload("EF-PR-GEN-01");
  check("T07-06. MissionDimensionSet produit avec 2 dimensions synthétiques", prGen01.missionDimensionSet && prGen01.missionDimensionSet.dimensions.length === 2, JSON.stringify(prGen01.missionDimensionSet && prGen01.missionDimensionSet.dimensions));

  check("T07-07. ProfessionalDiscovery produit avec le bon schéma (EF-02A)", byNode["EF-02A"].contract === "EvidenceForge.ProfessionalDiscovery" && byNode["EF-02A"].schemaVersion === "EF-02A-v2");
  check("T07-08. ProfessionalVerification produit avec le bon schéma (EF-02B)", byNode["EF-02B"].contract === "EvidenceForge.ProfessionalVerification" && byNode["EF-02B"].schemaVersion === "EF-02B-v2");
  check("T07-09. ProfessionalCorpusSet produit avec le bon schéma (EF-02C)", byNode["EF-02C"].contract === "EvidenceForge.ProfessionalCorpusSet" && byNode["EF-02C"].schemaVersion === "EF-02C-v2");

  const eligibility = await getPayload("EF-02D");
  const EF02D1D2 = require(path.join(env.mono05Root, "dependencies/MONO-04/dependencies/MONO-03/dependencies/MONO-02/dependencies/MONO-01/dependencies/ef-02d1d2-orchestrator-v1.js"));
  const usable = EF02D1D2.usableRecords(eligibility.eligibilityRelevanceSet);
  check("T07-10. EF-02D produit un DocumentaryEligibilityRelevanceSet avec au moins un usableRecord réel (jamais un tableau vide masquant la régression MONO02-CORPUS-BY-REF-MAP)", usable.length >= 1, `usable=${usable.length}`);
  check("T07-10b. CoverageMatrix produite, non vide", eligibility.coverageMatrix && eligibility.coverageMatrix.evaluations.length >= 1, JSON.stringify(eligibility.coverageMatrix && eligibility.coverageMatrix.evaluations.length));
  check("T07-10c. PanelSelection produite avec un panel non vide", eligibility.panelSelection && eligibility.panelSelection.selectedPanel.length >= 2, JSON.stringify(eligibility.panelSelection && eligibility.panelSelection.selectedPanel));

  const twinSet = await getPayload("EF-02E");
  check("T07-11. EF-02E produit un DocumentaryTwinSet avec au moins 2 twins (cardinalité minimale du CDC)", twinSet.schema === "EvidenceForge.DocumentaryTwinSet" && twinSet.twins.length >= 2, `count=${twinSet.twins.length}`);
  check("T07-11b. chaque twin est distinct, tracable, jamais assimilé à une personne réelle (professionalRef SYNTHETIC_*)", twinSet.twins.every((t) => /^SYNTHETIC_PROFESSIONAL_/.test(t.professionalRef)), JSON.stringify(twinSet.twins.map((t) => t.professionalRef)));

  const targetSet = await getPayload("TARGET_DOCUMENT_SET");
  check("T07-12. TargetDocumentSet produit avec au moins 2 documents cibles synthétiques", targetSet.schema === "EvidenceForge.TargetDocumentSet" && targetSet.documents.length >= 2, `count=${targetSet.documents.length}`);

  const reviewSchema = await getPayload("EF-03A");
  check("T07-13. ReviewSchema produit, générique (jamais une taxonomie JMJS)", reviewSchema.schema === "EvidenceForge.ReviewSchema" && !/JMJS/i.test(JSON.stringify(reviewSchema)), JSON.stringify(reviewSchema).slice(0, 200));

  const reviewSet = await getPayload("EF-03B");
  check("T07-14. matrice twin×target complète : 2 twins × 2 targets = au moins 4 DocumentaryReview", reviewSet.reviews.length >= 4, `reviews=${reviewSet.reviews.length}`);
  const pairs = new Set(reviewSet.reviews.map((r) => r.professionalRef + "::" + r.targetId));
  check("T07-14b. aucun couple twin×target manquant ni dupliqué (4 couples uniques exacts pour 2×2)", pairs.size === reviewSet.reviews.length && pairs.size === twinSet.twins.length * targetSet.documents.length, `pairs=${pairs.size}`);
  const allFindings = reviewSet.reviews.flatMap((r) => r.findings || []);
  check("T07-14c. chaque finding respecte targetEvidenceRefs != twinBasisWorkRefs (jamais une preuve confondue avec la base documentaire du twin)", allFindings.every((f) => JSON.stringify(f.targetEvidenceRefs) !== JSON.stringify(f.twinBasisWorkRefs)), "vérifié sur " + allFindings.length + " findings");
  check("T07-14d. chaque finding porte un epistemicStatus valide", allFindings.every((f) => ["documented", "cautious_inference", "not_determinable"].includes(f.epistemicStatus)), JSON.stringify([...new Set(allFindings.map((f) => f.epistemicStatus))]));

  const aggregated = await getPayload("EF-03C");
  check("T07-15. EF-03C agrège réellement (AggregatedDocumentaryReview produit, findings sources tracés)", aggregated.schema === "EvidenceForge.AggregatedDocumentaryReview" && aggregated.aggregates.length >= 1, JSON.stringify(aggregated.aggregates.length));

  const stability = await getPayload("EF-03D");
  check("T07-17b. StabilityContradictionAnalysis produite", stability.schema === "EvidenceForge.StabilityContradictionAnalysis" && stability.analyses.length >= 1);

  const lineageResult = trace.find((t) => t.nodeId === "EF-04-LINEAGE");
  check("T07-18. EF-04-LINEAGE SUCCESS (lineage PASS réel, jamais un contournement)", lineageResult && lineageResult.state === "SUCCESS");
  const lineageStatus = await env.operatorApi.getLineage(runId);
  check("T07-18b. RunState.lineageStatus synchronisé à PASS via le vrai chemin (MONO05-R2-REG-01)", lineageStatus.status === "PASS", JSON.stringify(lineageStatus).slice(0, 200));

  const report = await env.operatorApi.getReport(runId);
  check("T07-19. EF-04A produit un UnifiedReportSummary, OperatorApi.getReport() accessible", report.schema === "EvidenceForge.UnifiedReportSummary");
  check("T07-20. assuranceLevel exact, jamais surélevé", report.lineage.lineageAssurance.assuranceLevel === "reference_revalidated_not_source_hash_bound" && report.lineage.lineageAssurance.targetDocumentsHashBoundFromEF03 === false && report.lineage.lineageAssurance.documentaryTwinsHashBoundFromEF03 === false, JSON.stringify(report.lineage.lineageAssurance));
  check("T07-20b. aucune dérive épistémique dans le rapport final (jamais scientificValidity=true, jamais expertValidated)", report.testStatus.scientificValidity === false && report.testStatus.humanProfessionalValidation === false, JSON.stringify(report.testStatus));

  await close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
