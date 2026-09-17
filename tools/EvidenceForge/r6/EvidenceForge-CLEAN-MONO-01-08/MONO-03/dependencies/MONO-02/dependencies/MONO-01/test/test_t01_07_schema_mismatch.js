"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  const badCorpusSet = {
    schema: "EvidenceForge.ProfessionalCorpusSet",
    schemaVersion: "EF-02C-v999", // version inventée
    missionId: "mission-t0107",
    professionalCorpora: [],
  };

  const result = await mono01.eligibilityPanelPort.buildEligibilityRelevanceSet(
    badCorpusSet,
    "Question ?",
    { missionId: "mission-t0107", dimensions: [], dimensionSetHash: "x" },
    { policyId: "p", values: {} },
    async () => "{}",
    { missionId: "mission-t0107" }
  );

  check("1. ProfessionalCorpusSet avec schemaVersion inconnue -> statut BLOCKED", result.status === "BLOCKED", result.status);
  check(
    "2. code SCHEMA_VERSION_MISMATCH",
    result.diagnostics && result.diagnostics.error && result.diagnostics.error.code === "SCHEMA_VERSION_MISMATCH",
    JSON.stringify(result.diagnostics)
  );
  check(
    "3. les détails désignent bien schemaVersion EF-02C-v2 attendue vs EF-02C-v999 trouvée",
    result.diagnostics.error.details.expected === "EF-02C-v2" && result.diagnostics.error.details.found === "EF-02C-v999",
    JSON.stringify(result.diagnostics.error.details)
  );
  check(
    "4. jamais un rapprochement approximatif : 'ça ressemble à ProfessionalCorpusSet' n'est jamais accepté (CDC section 9)",
    result.output === null
  );

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
