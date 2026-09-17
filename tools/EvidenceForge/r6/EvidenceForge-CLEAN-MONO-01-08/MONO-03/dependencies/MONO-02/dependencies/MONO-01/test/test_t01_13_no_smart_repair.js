"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");
const EFPrGenMissionDimensionSet = require("../dependencies/ef-pr-gen-mission-dimension-set-v1.js");
const EF02EExclusionRegistry = require("../dependencies/ef-02e-exclusion-registry-v1.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01-13 — Entrée avec référence inconnue -> BLOCKED/validation error, jamais
// un fuzzy matching. Le module gelé EF-02E lève déjà une erreur explicite
// pour ce cas (ses propres tests 23/24, 60/60 PASS) ; ce test vérifie que
// DocumentaryTwinPort ne convertit JAMAIS ce rejet en un IntegrationResult
// SUCCESS — le port doit se contenter de transporter l'échec, jamais le
// masquer ni "réparer" la référence par similarité.

function corpus(ref, works) {
  return {
    schema: "EvidenceForge.ProfessionalCorpus",
    schemaVersion: "EF-02C-v2",
    professionalRef: ref,
    identityRef: { openAlexAuthorId: "https://openalex.org/A-" + ref, displayName: "Professionnel " + ref, orcid: null },
    corpus: { works: works || [] },
    status: "complete",
  };
}
function corpusSetOf(...corpora) {
  return { schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2", professionalCorpora: corpora };
}
function eligSetOf(...records) {
  return { schema: "EvidenceForge.DocumentaryEligibilityRelevanceSet", schemaVersion: "EF-02D-v2", records };
}
function coverageDim(id, level, relevanceStatus, epistemicStatus, evidenceWorks) {
  return { id, level, relevanceStatus, epistemicStatus, evidenceWorks: evidenceWorks || [], rationale: "x", contradictionWithMissing: false };
}
function matrixOf(...evaluations) {
  return { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4", evaluations };
}
function panelOf(refs) {
  return {
    schema: "EvidenceForge.PanelSelection",
    schemaVersion: "EF-02D3-PANEL-v4",
    selectedPanel: refs.map((r, i) => ({ rank: i + 1, professionalRef: r, dimensionJudgments: [], overallNote: "" })),
    selectionPolicy: { coverageThreshold: "moderate" },
  };
}

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const missionId = "mission-t0113";

  const dimensionSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId,
    dimensions: [{ id: "d1", label: "A", definition: "DA", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const emptyRegistry = EF02EExclusionRegistry.buildExclusionRegistry([], "2026-01-01T00:00:00.000Z");

  // Corpus RÉEL de pMisattr ne contient que "Étude réelle" — mais la
  // couverture cite "Étude mal attribuée" comme preuve pour d1, une
  // référence qui n'existe nulle part dans son corpus documentaire.
  const cMisattr = corpus("pMisattr", [{ doi: "10.9999/wreal", title: "Étude réelle", publicationYear: 2020, topics: [] }]);
  const eligRel = eligSetOf({
    professionalRef: "pMisattr",
    eligibility: { status: "eligible_documentary" },
    dimensionRelevance: [{ dimensionId: "d1", relevanceStatus: "mission_relevant", epistemicStatus: "documented", rationale: "x", supportingWorkRefs: [], limitations: [] }],
  });
  const matrix = matrixOf({
    professionalRef: "pMisattr",
    dimensions: [coverageDim("d1", "strong", "mission_relevant", "documented", ["Étude mal attribuée"])],
    overallNote: "",
    error: null,
  });
  const panel = panelOf(["pMisattr"]);

  const result = await mono01.documentaryTwinPort.buildDocumentaryTwinSet(
    {
      corpusSet: corpusSetOf(cMisattr),
      eligibilityRelevanceSet: eligRel,
      coverageMatrix: matrix,
      panelSelection: panel,
      dimensionSet,
      exclusionRegistry: emptyRegistry,
      missionId,
      missionQuestion: "Question ?",
      builtAt: "2026-01-01T00:00:00.000Z",
    },
    { missionId }
  );

  check("1. référence citée absente du corpus réel -> le port NE renvoie JAMAIS status=SUCCESS", result.status !== "SUCCESS", result.status);
  check(
    "2. l'échec est propagé comme une erreur technique explicite, jamais avalé silencieusement",
    !!(result.diagnostics && result.diagnostics.error),
    JSON.stringify(result.diagnostics)
  );
  check(
    "3. le message technique porte la trace du rejet gelé (« référence inconnue »), jamais reformulé en réparation",
    !!(result.diagnostics.error.message && /référence inconnue/.test(result.diagnostics.error.message)),
    result.diagnostics.error.message
  );

  // Contre-épreuve : la même chaîne avec la RÉFÉRENCE CORRECTE construit un twin normalement.
  const matrixOk = matrixOf({
    professionalRef: "pMisattr",
    dimensions: [coverageDim("d1", "strong", "mission_relevant", "documented", ["Étude réelle"])],
    overallNote: "",
    error: null,
  });
  const okResult = await mono01.documentaryTwinPort.buildDocumentaryTwinSet(
    {
      corpusSet: corpusSetOf(cMisattr),
      eligibilityRelevanceSet: eligRel,
      coverageMatrix: matrixOk,
      panelSelection: panel,
      dimensionSet,
      exclusionRegistry: emptyRegistry,
      missionId,
      missionQuestion: "Question ?",
      builtAt: "2026-01-01T00:00:00.000Z",
    },
    { missionId }
  );
  check("4. contre-épreuve : référence réelle et correctement attribuée -> SUCCESS", okResult.status === "SUCCESS", JSON.stringify(okResult.diagnostics));

  const fs = require("fs");
  const src = fs.readFileSync(require.resolve("../ports/documentary-twin-port.js"), "utf8");
  check("5. aucune logique de fuzzy/similarity/repair dans le code du port lui-même", !/fuzzy|similarity|smartRepair|autoRepair/i.test(src));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
