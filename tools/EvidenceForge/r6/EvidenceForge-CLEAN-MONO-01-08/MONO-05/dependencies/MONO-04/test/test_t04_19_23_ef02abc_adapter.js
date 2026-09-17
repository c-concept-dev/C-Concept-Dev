"use strict";
const path = require("path");
const { MONO01_PATH } = require("./fixtures.js");
const { createExternalStageAdapter } = require("../lib/external-stage-adapter.js");
const { createMono01 } = require(path.join(MONO01_PATH, "index.js"));

const REGISTRY_PATH = path.join(MONO01_PATH, "registry", "mono-00-frozen-baseline-registry-v1.json");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const missionId = "mission-t0419";

  const corpusSnapshot = { schema: "EvidenceForge.CorpusSnapshot", stage: "EF-01F", missionId, mission: { question: "Q ?" } };
  const missionDimensionSet = { schema: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", missionId, dimensions: [{ id: "d1", label: "A", definition: "def", weight: 1 }] };

  {
    let discoverCalls = 0;
    const adapter = createExternalStageAdapter({
      discoverProfessionals: async (inputs) => {
        discoverCalls++;
        return {
          schema: "EvidenceForge.ProfessionalDiscovery",
          schemaVersion: "EF-02A-v2",
          missionId: inputs.corpusSnapshot.missionId,
          candidates: [{ professionalRef: "p1", identityRef: { openAlexAuthorId: "https://openalex.org/A1", displayName: "P1" } }],
        };
      },
    });
    const r = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, missionDimensionSet, { adapter, missionId });
    check("T04-19. l'adapter MONO-04 (technique, resultProvider injecté) fonctionne réellement à travers le VRAI ProfessionalPipelinePort", r.status === "SUCCESS" && discoverCalls === 1 && r.output.candidates[0].professionalRef === "p1", r.status);
  }

  {
    const adapter = createExternalStageAdapter({
      discoverProfessionals: async () => ({ schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", missionId, candidates: [] }),
    });
    const discoveryResult = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, missionDimensionSet, { adapter, missionId });
    const verifyResult = await mono01.professionalPipelinePort.verifyProfessionals(discoveryResult.output, { adapter, missionId });
    check(
      "T04-20. un adapter ne fournissant que discoverProfessionals ne rend JAMAIS verifyProfessionals disponible, les 3 étapes restent strictement séparées",
      verifyResult.status === "BLOCKED" && verifyResult.diagnostics.error.details && verifyResult.diagnostics.error.details.dependency === "externalStageAdapter",
      JSON.stringify(verifyResult.diagnostics)
    );
  }

  {
    const badAdapterA = createExternalStageAdapter({ discoverProfessionals: async () => ({ schema: "PasLeBonSchema", candidates: [] }) });
    const rA = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, missionDimensionSet, { adapter: badAdapterA, missionId });
    check("T04-21. sortie EF-02A non conforme (via un adapter MONO-04 réel) -> rejetée par MONO-01.x, jamais un SUCCESS", rA.status === "FAILED" && rA.diagnostics.error.code === "INVALID_MODULE_OUTPUT", JSON.stringify(rA.diagnostics));

    const goodDiscovery = { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", missionId, candidates: [{ professionalRef: "p1", identityRef: { openAlexAuthorId: "https://openalex.org/A1", displayName: "P1" } }] };
    const badAdapterB = createExternalStageAdapter({ verifyProfessionals: async () => ({ schema: "PasLeBonSchema" }) });
    const rB = await mono01.professionalPipelinePort.verifyProfessionals(goodDiscovery, { adapter: badAdapterB, missionId });
    check("T04-22. sortie EF-02B non conforme -> rejetée par MONO-01.x, jamais un SUCCESS", rB.status === "FAILED" && rB.diagnostics.error.code === "INVALID_MODULE_OUTPUT", JSON.stringify(rB.diagnostics));

    const goodVerification = { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", missionId, professionalRecords: [{ professionalRef: "p1", identityRef: goodDiscovery.candidates[0].identityRef, verified: true }] };
    const badAdapterC = createExternalStageAdapter({ buildProfessionalCorpus: async () => ({ schema: "PasLeBonSchema" }) });
    const rC = await mono01.professionalPipelinePort.buildProfessionalCorpus(goodVerification, { adapter: badAdapterC, missionId });
    check("T04-23. sortie EF-02C non conforme -> rejetée par MONO-01.x, jamais un SUCCESS", rC.status === "FAILED" && rC.diagnostics.error.code === "INVALID_MODULE_OUTPUT", JSON.stringify(rC.diagnostics));
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
