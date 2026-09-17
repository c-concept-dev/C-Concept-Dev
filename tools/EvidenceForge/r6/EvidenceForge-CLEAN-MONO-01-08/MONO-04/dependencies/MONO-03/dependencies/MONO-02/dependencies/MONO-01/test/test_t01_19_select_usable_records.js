"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01-19 — Révision additive post-audit MONO-02 : EligibilityPanelPort
// expose désormais selectUsableRecords(), qui appelle directement
// EF02D1D2Orchestrator.usableRecords() (le module gelé), jamais une
// réimplémentation. Ce test confirme que le port produit EXACTEMENT le même
// résultat que l'appel direct au module gelé (deepEqual), et que le filtre
// (éligible ET pertinent sur au moins une dimension) est appliqué sans
// altération.

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const EF02D1D2Orchestrator = require("../dependencies/ef-02d1d2-orchestrator-v1.js");

  const set = {
    schema: "EvidenceForge.DocumentaryEligibilityRelevanceSet",
    schemaVersion: "EF-02D-v2",
    missionId: "mission-t0119",
    missionQuestion: "Question ?",
    records: [
      { professionalRef: "p1", eligibility: { status: "eligible_documentary" }, dimensionRelevance: [{ dimensionId: "d1", relevanceStatus: "mission_relevant" }] },
      { professionalRef: "p2", eligibility: { status: "insufficient_documentary" }, dimensionRelevance: [{ dimensionId: "d1", relevanceStatus: "mission_relevant" }] },
      { professionalRef: "p3", eligibility: { status: "eligible_documentary" }, dimensionRelevance: [{ dimensionId: "d1", relevanceStatus: "mission_irrelevant" }] },
      { professionalRef: "p4", eligibility: { status: "eligible_documentary" }, dimensionRelevance: [{ dimensionId: "d1", relevanceStatus: "partially_relevant" }] },
    ],
  };

  const result = mono01.eligibilityPanelPort.selectUsableRecords(set, { missionId: "mission-t0119" });
  const rawResult = EF02D1D2Orchestrator.usableRecords(set);

  check("1. status SUCCESS", result.status === "SUCCESS", JSON.stringify(result.diagnostics));
  check("2. deepEqual(sortie du port, sortie directe du module gelé)", JSON.stringify(result.output) === JSON.stringify(rawResult));
  check("3. seuls p1 et p4 sont retenus (éligibles ET pertinents sur au moins une dimension)", result.output.map((r) => r.professionalRef).sort().join(",") === "p1,p4");
  check("4. p2 (non éligible) exclu", !result.output.some((r) => r.professionalRef === "p2"));
  check("5. p3 (toutes dimensions non pertinentes) exclu", !result.output.some((r) => r.professionalRef === "p3"));

  // Contrat : schema incorrect -> rejeté (fail-closed, comme tout autre port).
  const badResult = mono01.eligibilityPanelPort.selectUsableRecords({ schema: "Wrong", schemaVersion: "x", records: [] }, { missionId: "mission-t0119" });
  check("6. eligibilityRelevanceSet de mauvais schema -> BLOCKED / SCHEMA_VERSION_MISMATCH", badResult.status === "BLOCKED" && badResult.diagnostics.error.code === "SCHEMA_VERSION_MISMATCH");

  // EF-02D non gelé modifié : hash inchangé (vérifié séparément par le manifeste), et
  // aucune des fonctions gelées elles-mêmes n'a été éditée — confirmé ici en
  // s'assurant que l'appel direct au module gelé produit toujours le même
  // comportement (non-régression du comportement source).
  check("7. le module gelé EF02D1D2Orchestrator.usableRecords() lui-même reste inchangé (comportement identique observé)", JSON.stringify(rawResult.map((r) => r.professionalRef)) === JSON.stringify(["p1", "p4"]));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
