"use strict";
const { createMono01, REGISTRY_PATH, twin, twinSetOf, findingsResponse } = require("./fixtures.js");
const { invokePort } = require("../lib/port-factory.js");
const EFPrGenMissionDimensionSet = require("../dependencies/ef-pr-gen-mission-dimension-set-v1.js");
const { buildReviewTargets } = require("../dependencies/ef-03a-review-schema-v1.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  // === Mécanique générique fail-closed (lib/port-factory.js) ===

  const genericCfg = { portId: "test", moduleId: "EF-04", expectedCanonicalVersion: "v1", requiredInputs: [], externalDependencies: ["llm"], callType: "SYNC" };

  const explicitFalse = invokePort(genericCfg, mono01.baselinePort, { inputs: {}, dependenciesAvailable: { llm: false }, invoke: () => ({}) });
  check("1. dependenciesAvailable={llm:false} -> BLOCKED / DEPENDENCY_UNAVAILABLE", explicitFalse.status === "BLOCKED" && explicitFalse.diagnostics.error.code === "DEPENDENCY_UNAVAILABLE", JSON.stringify(explicitFalse.diagnostics));

  const absent = invokePort(genericCfg, mono01.baselinePort, { inputs: {}, dependenciesAvailable: {}, invoke: () => ({}) });
  check("2. dependenciesAvailable={} (llm ABSENTE, jamais déclarée) -> BLOCKED / DEPENDENCY_UNAVAILABLE (fail-closed strict, {} bloque autant que {llm:false})", absent.status === "BLOCKED" && absent.diagnostics.error.code === "DEPENDENCY_UNAVAILABLE", JSON.stringify(absent.diagnostics));

  const noDepsObjectAtAll = invokePort(genericCfg, mono01.baselinePort, { inputs: {}, invoke: () => ({}) });
  check("2b. dependenciesAvailable NON FOURNI DU TOUT -> BLOCKED / DEPENDENCY_UNAVAILABLE (même fail-closed)", noDepsObjectAtAll.status === "BLOCKED" && noDepsObjectAtAll.diagnostics.error.code === "DEPENDENCY_UNAVAILABLE");

  let invoked = false;
  const explicitTrue = invokePort(genericCfg, mono01.baselinePort, { inputs: {}, dependenciesAvailable: { llm: true }, invoke: () => { invoked = true; return { schema: "x" }; } });
  check("3. dependenciesAvailable={llm:true} -> invocation autorisée (module gelé réellement appelé)", explicitTrue.status === "SUCCESS" && invoked === true, explicitTrue.status);

  // === Confirmation sur un vrai port de production (DocumentaryReviewPort) ===

  const missionId = "mission-t0109";
  const dimensionSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId,
    dimensions: [{ id: "d1", label: "A", definition: "DA", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const t1 = twin("p1");
  const twinSet = twinSetOf(missionId, "Question ?", t1);
  const reviewTargets = buildReviewTargets(["Doc A"]);
  const reviewSchemaResult = await mono01.reviewSchemaPort.buildReviewSchema(twinSet, dimensionSet, reviewTargets, "Question ?", { missionId });
  const reviewSchema = reviewSchemaResult.output;
  const targetDocSetResult = await mono01.targetDocumentPort.buildTargetDocumentSet(missionId, [{ targetId: reviewSchema.reviewTargets[0].targetId, content: "Contenu avec un passage cible." }], { missionId });
  const targetDocumentSet = targetDocSetResult.output;

  let workerCalled = false;
  const workerCallFn = async () => { workerCalled = true; return findingsResponse(["d1"]); };

  const withFalse = await mono01.documentaryReviewPort.buildDocumentaryReviewSet(reviewSchema, twinSet, targetDocumentSet, workerCallFn, { missionId, dependenciesAvailable: { llm: false } });
  check("4. DocumentaryReviewPort avec llm:false -> BLOCKED, module gelé jamais appelé", withFalse.status === "BLOCKED" && workerCalled === false);

  const withoutDeclaration = await mono01.documentaryReviewPort.buildDocumentaryReviewSet(reviewSchema, twinSet, targetDocumentSet, workerCallFn, { missionId });
  check("5. DocumentaryReviewPort SANS dependenciesAvailable du tout -> BLOCKED (fail-closed, pas de succès par défaut)", withoutDeclaration.status === "BLOCKED" && workerCalled === false, withoutDeclaration.status);

  const withTrue = await mono01.documentaryReviewPort.buildDocumentaryReviewSet(reviewSchema, twinSet, targetDocumentSet, workerCallFn, { missionId, dependenciesAvailable: { llm: true } });
  check("6. DocumentaryReviewPort avec llm:true -> SUCCESS, module gelé réellement appelé", withTrue.status === "SUCCESS" && workerCalled === true, JSON.stringify(withTrue.diagnostics));

  // === ProfessionalPipelinePort — binding ExternalStageAdapter (décision tranchée) ===

  const corpusSnapshot = { schema: "EvidenceForge.CorpusSnapshot", stage: "EF-01F", missionId: "mission-t0109b", mission: { question: "Q ?" } };
  const validDimSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId: "mission-t0109b",
    dimensions: [{ id: "d1", label: "A", definition: "DA", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  // a) Aucun ExternalStageAdapter fourni -> BLOCKED / DEPENDENCY_UNAVAILABLE("externalStageAdapter").
  const noAdapter = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, validDimSet, { missionId: "mission-t0109b" });
  check("7. discoverProfessionals SANS adapter -> BLOCKED / DEPENDENCY_UNAVAILABLE", noAdapter.status === "BLOCKED" && noAdapter.diagnostics.error.code === "DEPENDENCY_UNAVAILABLE", JSON.stringify(noAdapter.diagnostics));
  check("7b. la dépendance désignée est bien 'externalStageAdapter'", noAdapter.diagnostics.error.details.dependency === "externalStageAdapter");

  // b) Adapter explicite, conforme -> appel possible, SUCCESS.
  let adapterCalled = false;
  const goodAdapter = {
    discoverProfessionals: async (inputs) => {
      adapterCalled = true;
      return { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", missionId: inputs.corpusSnapshot.missionId, candidates: [] };
    },
  };
  const withAdapter = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, validDimSet, { missionId: "mission-t0109b", adapter: goodAdapter });
  check("8. discoverProfessionals AVEC adapter conforme -> SUCCESS, adapter réellement appelé", withAdapter.status === "SUCCESS" && adapterCalled === true, JSON.stringify(withAdapter.diagnostics));

  // c) Adapter présent mais sortie de mauvais schema/version -> FAILED / INVALID_MODULE_OUTPUT.
  const badAdapter = {
    discoverProfessionals: async () => ({ schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v999", candidates: [] }),
  };
  const wrongOutput = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, validDimSet, { missionId: "mission-t0109b", adapter: badAdapter });
  check("9. adapter présent mais schemaVersion de sortie incorrecte -> FAILED / INVALID_MODULE_OUTPUT", wrongOutput.status === "FAILED" && wrongOutput.diagnostics.error.code === "INVALID_MODULE_OUTPUT", JSON.stringify(wrongOutput.diagnostics));

  // d) Les 3 étapes restent séparées : un adapter qui n'implémente QUE
  //    discoverProfessionals ne rend jamais verifyProfessionals disponible.
  const professionalDiscovery = withAdapter.output;
  const verifyWithSameAdapter = await mono01.professionalPipelinePort.verifyProfessionals(professionalDiscovery, { missionId: "mission-t0109b", adapter: goodAdapter });
  check("10. verifyProfessionals avec un adapter qui n'implémente que discoverProfessionals -> BLOCKED / DEPENDENCY_UNAVAILABLE (3 étapes jamais fusionnées)", verifyWithSameAdapter.status === "BLOCKED" && verifyWithSameAdapter.diagnostics.error.code === "DEPENDENCY_UNAVAILABLE");

  const fullAdapter = {
    discoverProfessionals: goodAdapter.discoverProfessionals,
    verifyProfessionals: async (inputs) => ({ schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", missionId: inputs.professionalDiscovery.missionId, professionalRecords: [] }),
    buildProfessionalCorpus: async (inputs) => ({ schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2", missionId: inputs.professionalVerification.missionId, professionalCorpora: [] }),
  };
  const verifyWithFullAdapter = await mono01.professionalPipelinePort.verifyProfessionals(professionalDiscovery, { missionId: "mission-t0109b", adapter: fullAdapter });
  check("11. verifyProfessionals avec un adapter complet -> SUCCESS", verifyWithFullAdapter.status === "SUCCESS", JSON.stringify(verifyWithFullAdapter.diagnostics));

  const corpusResult = await mono01.professionalPipelinePort.buildProfessionalCorpus(verifyWithFullAdapter.output, { missionId: "mission-t0109b", adapter: fullAdapter });
  check("12. buildProfessionalCorpus avec un adapter complet -> SUCCESS (3e étape indépendante, elle aussi vérifiée séparément)", corpusResult.status === "SUCCESS", JSON.stringify(corpusResult.diagnostics));

  check("13. ProfessionalPipelinePort.bindingStatus === 'BOUND' (décision tranchée)", mono01.professionalPipelinePort.bindingStatus === "BOUND");
  check("14. ProfessionalPipelinePort.bindingType === 'EXTERNAL_STAGE_ADAPTER'", mono01.professionalPipelinePort.bindingType === "EXTERNAL_STAGE_ADAPTER");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
