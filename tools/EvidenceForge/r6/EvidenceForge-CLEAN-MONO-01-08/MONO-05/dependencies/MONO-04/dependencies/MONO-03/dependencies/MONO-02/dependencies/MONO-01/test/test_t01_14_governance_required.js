"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");
const EFPrGenMissionDimensionSet = require("../dependencies/ef-pr-gen-mission-dimension-set-v1.js");
const EF02EExclusionRegistry = require("../dependencies/ef-02e-exclusion-registry-v1.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const missionId = "mission-t0114";

  const dimensionSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId,
    dimensions: [{ id: "d1", label: "A", definition: "DA", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const corpusSet = { schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2", professionalCorpora: [] };
  const eligibilityRelevanceSet = { schema: "EvidenceForge.DocumentaryEligibilityRelevanceSet", schemaVersion: "EF-02D-v2", records: [] };
  const coverageMatrix = { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4", evaluations: [] };
  const panelSelection = { schema: "EvidenceForge.PanelSelection", schemaVersion: "EF-02D3-PANEL-v4", selectedPanel: [] };

  // EF-02E sans ExclusionRegistrySet -> rejet.
  const missing = await mono01.documentaryTwinPort.buildDocumentaryTwinSet(
    { corpusSet, eligibilityRelevanceSet, coverageMatrix, panelSelection, dimensionSet, exclusionRegistry: undefined, missionId, missionQuestion: "Question ?" },
    { missionId }
  );
  check("1. EF-02E sans ExclusionRegistrySet -> status BLOCKED", missing.status === "BLOCKED", missing.status);
  check(
    "2. code MISSING_REQUIRED_INPUT désignant exclusionRegistry",
    missing.diagnostics.error.code === "MISSING_REQUIRED_INPUT" && missing.diagnostics.error.details.missing === "exclusionRegistry",
    JSON.stringify(missing.diagnostics)
  );

  // Même un registre vide doit être explicitement fourni -> accepté une fois présent.
  const emptyRegistry = EF02EExclusionRegistry.buildExclusionRegistry([], "2026-01-01T00:00:00.000Z");
  const withEmpty = await mono01.documentaryTwinPort.buildDocumentaryTwinSet(
    { corpusSet, eligibilityRelevanceSet, coverageMatrix, panelSelection, dimensionSet, exclusionRegistry: emptyRegistry, missionId, missionQuestion: "Question ?" },
    { missionId }
  );
  check("3. registre d'exclusion VIDE mais explicitement fourni -> accepté (SUCCESS, panel vide)", withEmpty.status === "SUCCESS", JSON.stringify(withEmpty.diagnostics));
  check("4. panel vide -> DocumentaryTwinSet valide avec 0 twin, jamais un crash", withEmpty.output && withEmpty.output.twins.length === 0);

  // GovernancePort lui-même : getCurrentRegistry() est null tant qu'aucun
  // registre n'a été explicitement construit — jamais un vide implicite.
  const freshGovernance = mono01.governancePort;
  check("5. GovernancePort.getCurrentRegistry() est null avant tout setRegistry() explicite", freshGovernance.getCurrentRegistry() === null);

  const setResult = freshGovernance.setRegistry([], "2026-01-01T00:00:00.000Z", { missionId });
  check("6. setRegistry([]) explicite -> SUCCESS et devient le registre courant", setResult.status === "SUCCESS" && freshGovernance.getCurrentRegistry() === setResult.output);

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
