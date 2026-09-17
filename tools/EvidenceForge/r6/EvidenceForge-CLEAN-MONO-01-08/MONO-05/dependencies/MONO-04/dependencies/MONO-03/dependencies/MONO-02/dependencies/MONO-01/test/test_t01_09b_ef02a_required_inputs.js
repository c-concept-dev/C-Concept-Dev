"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");
const EFPrGenMissionDimensionSet = require("../dependencies/ef-pr-gen-mission-dimension-set-v1.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01 — EF-02A required inputs (correction 3 : bug réel trouvé — EF-02A exige
// CorpusSnapshot ET MissionDimensionSet, jamais un seul des deux).

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const missionId = "mission-t01-02a-inputs";

  const corpusSnapshot = { schema: "EvidenceForge.CorpusSnapshot", stage: "EF-01F", missionId, mission: { question: "Q ?" } };
  const validDimSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId,
    dimensions: [{ id: "d1", label: "A", definition: "DA", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  let adapterCalled = false;
  const adapter = {
    discoverProfessionals: async (inputs) => {
      adapterCalled = true;
      return { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", missionId: inputs.corpusSnapshot.missionId, candidates: [] };
    },
  };

  // Cas 1 : CorpusSnapshot présent + MissionDimensionSet ABSENT -> BLOCKED / MISSING_REQUIRED_INPUT, adapter jamais appelé.
  adapterCalled = false;
  const missingDimSet = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, undefined, { missionId, adapter });
  check(
    "1. CorpusSnapshot présent + MissionDimensionSet absent -> BLOCKED / MISSING_REQUIRED_INPUT",
    missingDimSet.status === "BLOCKED" && missingDimSet.diagnostics.error.code === "MISSING_REQUIRED_INPUT" && missingDimSet.diagnostics.error.details.missing === "missionDimensionSet",
    JSON.stringify(missingDimSet.diagnostics)
  );
  check("1b. ExternalStageAdapter jamais appelé (rejet avant tout appel externe)", adapterCalled === false);

  // Cas 2 : MissionDimensionSet présent + CorpusSnapshot ABSENT -> BLOCKED / MISSING_REQUIRED_INPUT.
  adapterCalled = false;
  const missingSnapshot = await mono01.professionalPipelinePort.discoverProfessionals(undefined, validDimSet, { missionId, adapter });
  check(
    "2. MissionDimensionSet présent + CorpusSnapshot absent -> BLOCKED / MISSING_REQUIRED_INPUT",
    missingSnapshot.status === "BLOCKED" && missingSnapshot.diagnostics.error.code === "MISSING_REQUIRED_INPUT" && missingSnapshot.diagnostics.error.details.missing === "corpusSnapshot",
    JSON.stringify(missingSnapshot.diagnostics)
  );
  check("2b. ExternalStageAdapter jamais appelé", adapterCalled === false);

  // Cas 3 : les deux présents et valides -> invocation autorisée (SUCCESS, adapter réellement appelé).
  adapterCalled = false;
  const bothValid = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, validDimSet, { missionId, adapter });
  check("3. CorpusSnapshot + MissionDimensionSet valides -> invocation autorisée (SUCCESS)", bothValid.status === "SUCCESS" && adapterCalled === true, JSON.stringify(bothValid.diagnostics));

  // Cas 4 : MissionDimensionSet avec un mauvais schemaVersion -> BLOCKED / SCHEMA_VERSION_MISMATCH.
  adapterCalled = false;
  const badVersionDimSet = { ...validDimSet, schemaVersion: "EF-PR-GEN-v999" };
  const wrongVersion = await mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, badVersionDimSet, { missionId, adapter });
  check(
    "4. MissionDimensionSet avec schemaVersion incorrecte -> BLOCKED / SCHEMA_VERSION_MISMATCH",
    wrongVersion.status === "BLOCKED" && wrongVersion.diagnostics.error.code === "SCHEMA_VERSION_MISMATCH",
    JSON.stringify(wrongVersion.diagnostics)
  );
  check(
    "4b. les détails désignent bien schemaVersion EF-PR-GEN-v1 attendue (version exacte de MONO-00, jamais inventée)",
    wrongVersion.diagnostics.error.details.expected === "EF-PR-GEN-v1" && wrongVersion.diagnostics.error.details.found === "EF-PR-GEN-v999",
    JSON.stringify(wrongVersion.diagnostics.error.details)
  );
  check("4c. ExternalStageAdapter jamais appelé", adapterCalled === false);

  // Vérification complémentaire (point 4 de la correction) : EF-02B et EF-02C
  // ne transmettent aucune entrée non déclarée required. Chaque étape ne
  // déclare que l'entrée strictement nécessaire d'après la chaîne CDC
  // section 4.4 (EF-02A->EF-02B : ProfessionalDiscovery seul ;
  // EF-02B->EF-02C : ProfessionalVerification seul).
  const fs = require("fs");
  const src = fs.readFileSync(require.resolve("../ports/professional-pipeline-port.js"), "utf8");
  const verifyBlock = src.match(/verifyProfessionals\(professionalDiscovery, opts\) \{[\s\S]*?return invokeStage[\s\S]*?\},/)[0];
  const corpusBlock = src.match(/buildProfessionalCorpus\(professionalVerification, opts\) \{[\s\S]*?return invokeStage[\s\S]*?\},/)[0];
  check(
    "5. verifyProfessionals ne déclare qu'une seule entrée (professionalDiscovery) — aucune autre transmise sans être required",
    (verifyBlock.match(/name:\s*"/g) || []).length === 1
  );
  check(
    "6. buildProfessionalCorpus ne déclare qu'une seule entrée (professionalVerification) — aucune autre transmise sans être required",
    (corpusBlock.match(/name:\s*"/g) || []).length === 1
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
