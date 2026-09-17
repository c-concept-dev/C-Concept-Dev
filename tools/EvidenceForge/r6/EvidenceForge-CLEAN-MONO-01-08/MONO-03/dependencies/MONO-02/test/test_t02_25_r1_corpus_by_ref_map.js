"use strict";
// test_t02_25_r1_corpus_by_ref_map.js — CORRECTIF MONO-02-R1
// (regressionId: MONO02-CORPUS-BY-REF-MAP).
//
// Le bug (corpusByRefOf renvoyait un Object simple au lieu d'une Map, alors
// que ef-02d3-coverage-panel-v1.js appelle corpusByRef.get(...)) a echappe
// aux 324 tests historiques car aucun n'executait reellement la boucle
// buildCoverageMatrix avec un usableRecords non vide — seul un test statique
// (test_t02_23) verifiait par grep que selectUsableRecords() est appele.
// Ces 4 tests exercent reellement le chemin complet EF-02D avec des
// donnees non vides, jamais uniquement "instanceof Map".

const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, buildValidMissionArtifacts, buildEFOrchArtifacts, driveEngine } = require("./fixtures.js");
const { corpusByRefOf } = require("../lib/node-runners.js");

// Worker fn LOCAL (jamais le fixture partagé eligibilityWorkerCallFn de
// fixtures.js, qui omet supportingWorkRefs et échoue donc systématiquement
// D2 pour TOUS les tests existants — c'est exactement pourquoi
// usableRecords() est toujours vide dans les 324 tests historiques, et
// donc pourquoi ce bug n'a jamais été détecté). Ne jamais modifier le
// fixture partagé ici (risque pour les 324 tests existants) : ce worker
// local, correctement formé, est spécifique à ces 4 tests R1.
async function usableWorkerCallFn(prompt) {
  const workRef = prompt.includes("r1p2") ? "Étude r1p2" : (prompt.includes("r1p1") ? "Étude r1p1" : "Étude p1");
  if (prompt.includes("relevanceStatus")) {
    return JSON.stringify({
      judgments: [{ dimensionId: "d1", relevanceStatus: "mission_relevant", epistemicStatus: "documented", rationale: "x", supportingWorkRefs: [workRef], limitations: [] }]
    });
  }
  return JSON.stringify({
    dimensions: [{ id: "d1", level: "strong", relevanceStatus: "mission_relevant", epistemicStatus: "documented", rationale: "x", evidenceWorks: [workRef] }]
  });
}

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

function twoProfessionalAdapter() {
  return {
    discoverProfessionals: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalDiscovery",
      schemaVersion: "EF-02A-v2",
      missionId: inputs.corpusSnapshot.missionId,
      candidates: [
        { professionalRef: "r1p1", identityRef: { openAlexAuthorId: "https://openalex.org/A-r1p1", displayName: "Professionnel R1 P1" } },
        { professionalRef: "r1p2", identityRef: { openAlexAuthorId: "https://openalex.org/A-r1p2", displayName: "Professionnel R1 P2" } }
      ]
    }),
    verifyProfessionals: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalVerification",
      schemaVersion: "EF-02B-v2",
      missionId: inputs.professionalDiscovery.missionId,
      professionalRecords: inputs.professionalDiscovery.candidates.map((c) => ({ professionalRef: c.professionalRef, identityRef: c.identityRef, verified: true }))
    }),
    buildProfessionalCorpus: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalCorpusSet",
      schemaVersion: "EF-02C-v2",
      missionId: inputs.professionalVerification.missionId,
      professionalCorpora: inputs.professionalVerification.professionalRecords.map((r) => ({
        schema: "EvidenceForge.ProfessionalCorpus",
        schemaVersion: "EF-02C-v2",
        professionalRef: r.professionalRef,
        identityRef: r.identityRef,
        corpus: { works: [{ doi: "10.1/" + r.professionalRef, title: "Étude " + r.professionalRef, publicationYear: 2020, topics: [] }] },
        status: "complete"
      }))
    })
  };
}

(async () => {
  // === T02-R1-01. corpusByRefOf() retourne une vraie Map ===
  {
    const corpusSet = {
      schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2", missionId: "m",
      professionalCorpora: [{ professionalRef: "x1", corpus: { works: [] }, status: "complete" }]
    };
    const m = corpusByRefOf(corpusSet);
    check("T02-R1-01. corpusByRefOf() retourne une instance de Map (jamais un Object simple)", m instanceof Map);
    check("T02-R1-01b. Map.get() fonctionne (c'est exactement ce que ef-02d3-coverage-panel-v1.js appelle)", typeof m.get === "function" && m.get("x1") && m.get("x1").professionalRef === "x1");
  }

  // === T02-R1-02. Nœud EF-02D réellement exécuté avec >=1 usableRecord -> buildCoverageMatrix sans erreur ===
  {
    const missionId = "mission-r1-single";
    const mono01 = buildMono01();
    const { buildGoodAdapter, buildFullExternalInputs } = require("./fixtures.js");
    const artifacts = await buildValidMissionArtifacts(missionId);
    const eforchFixtures = await buildEFOrchArtifacts(missionId, "r1single1234");
    const externalInputs = buildFullExternalInputs(missionId, artifacts, eforchFixtures);
    const ctx = {
      missionId,
      missionQuestion: "Question R1 un professionnel usable ?",
      externalInputs,
      adapter: buildGoodAdapter(),
      dependenciesAvailable: { llm: true },
      workerCallFn: usableWorkerCallFn,
      builtAt: "2026-01-01T00:00:00.000Z"
    };
    const engine = createOrchestrationEngine(GRAPH_PATH, mono01, ctx);
    await driveEngine(engine, { maxIterations: 10 });
    check("T02-R1-02a. EF-02C SUCCESS (précondition du test)", engine.getNodeState("EF-02C") === "SUCCESS", engine.getNodeState("EF-02C"));
    const r = engine.context.nodeResults["EF-02D"];
    check("T02-R1-02b. EF-02D atteint SUCCESS (buildCoverageMatrix exécuté réellement, aucune exception corpusByRef.get)", engine.getNodeState("EF-02D") === "SUCCESS", JSON.stringify(r && r.diagnostics));
    const output = engine.context.nodeOutputs["EF-02D"];
    check("T02-R1-02c. Au moins un usableRecord réel a atteint buildCoverageMatrix (jamais un tableau vide qui masquerait le bug)", !!output && !!output.eligibilityRelevanceSet && require("../dependencies/MONO-01/dependencies/ef-02d1d2-orchestrator-v1.js").usableRecords(output.eligibilityRelevanceSet).length >= 1, JSON.stringify(output && output.eligibilityRelevanceSet && output.eligibilityRelevanceSet.summary));
    check("T02-R1-02d. CoverageMatrix produite et non vide", !!output && !!output.coverageMatrix && Array.isArray(output.coverageMatrix.evaluations) && output.coverageMatrix.evaluations.length >= 1, JSON.stringify(output && output.coverageMatrix));
  }

  // === T02-R1-03. 2 professionnels usables -> chacun retrouve le bon ProfessionalCorpus (pas de collision Map) ===
  {
    const missionId = "mission-r1-two";
    const mono01 = buildMono01();
    const artifacts = await buildValidMissionArtifacts(missionId);
    const eforchFixtures = await buildEFOrchArtifacts(missionId, "r1two12345");
    const { buildFullExternalInputs } = require("./fixtures.js");
    const externalInputs = buildFullExternalInputs(missionId, artifacts, eforchFixtures);
    const ctx = {
      missionId,
      missionQuestion: "Question R1 deux professionnels ?",
      externalInputs,
      adapter: twoProfessionalAdapter(),
      dependenciesAvailable: { llm: true },
      workerCallFn: usableWorkerCallFn,
      builtAt: "2026-01-01T00:00:00.000Z"
    };
    const engine = createOrchestrationEngine(GRAPH_PATH, mono01, ctx);
    await driveEngine(engine, { maxIterations: 10 });
    check("T02-R1-03a. EF-02D SUCCESS avec 2 professionnels usables", engine.getNodeState("EF-02D") === "SUCCESS", JSON.stringify(engine.context.nodeResults["EF-02D"] && engine.context.nodeResults["EF-02D"].diagnostics));
    const output = engine.context.nodeOutputs["EF-02D"];
    const evals = (output && output.coverageMatrix && output.coverageMatrix.evaluations) || [];
    const refs = evals.map((e) => e.professionalRef).sort();
    check("T02-R1-03b. Les 2 professionnels (r1p1, r1p2) apparaissent chacun exactement une fois dans la CoverageMatrix (aucune collision Map)", JSON.stringify(refs) === JSON.stringify(["r1p1", "r1p2"]), JSON.stringify(refs));
  }

  // === T02-R1-04. resumeCoverageMatrix avec records manquants -> Map correctement utilisée ===
  {
    const EF02D3 = require("../dependencies/MONO-01/dependencies/ef-02d3-coverage-panel-v1.js");
    const corpusSet = {
      schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2", missionId: "m",
      professionalCorpora: [
        { professionalRef: "a", corpus: { works: [{ doi: "10.1/a", title: "A", publicationYear: 2020, topics: [] }] }, status: "complete" },
        { professionalRef: "b", corpus: { works: [{ doi: "10.1/b", title: "B", publicationYear: 2021, topics: [] }] }, status: "complete" }
      ]
    };
    const corpusByRef = corpusByRefOf(corpusSet);
    const dimensionSet = await buildValidMissionArtifacts("mission-r1-resume").then((a) => a.missionDimensionSet);
    const usableRecords = [{ professionalRef: "a" }, { professionalRef: "b" }];
    const existingMatrix = { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4", missionId: "m", evaluations: [{ professionalRef: "a", dimensions: [], evaluatedAt: "2026-01-01T00:00:00.000Z" }] };
    let threw = null;
    let resumed;
    try {
      resumed = await EF02D3.resumeCoverageMatrix(existingMatrix, usableRecords, corpusByRef, dimensionSet, "Question ?", usableWorkerCallFn);
    } catch (e) {
      threw = e;
    }
    check("T02-R1-04. resumeCoverageMatrix() avec un record manquant ('b') utilise correctement corpusByRef.get() sans exception", !threw, threw && threw.message);
    check("T02-R1-04b. Le professionnel manquant ('b') est bien évalué et ajouté", !threw && resumed.evaluations.some((e) => e.professionalRef === "b"), threw ? "" : JSON.stringify(resumed.evaluations.map((e) => e.professionalRef)));
  }

  const passed = results.filter((r) => r.pass).length;
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(`\nTOUS LES TESTS PASSENT (${passed})`);
  if (passed !== results.length) process.exit(1);
})();
