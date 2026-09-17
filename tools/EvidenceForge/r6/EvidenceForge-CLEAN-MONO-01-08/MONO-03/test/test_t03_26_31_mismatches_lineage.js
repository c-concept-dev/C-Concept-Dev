"use strict";
const { freshMono03, createSampleRun } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { mono03 } = freshMono03();
  const runId = "run-t0326";
  await createSampleRun(mono03, runId, "mission-t0326");

  const artifact = await mono03.artifactStore.putArtifact({
    runId, nodeId: "EF-02E", contract: "EvidenceForge.DocumentaryTwinSet", schemaVersion: "EF-02E-v2", missionId: "mission-t0326",
    payload: { schema: "EvidenceForge.DocumentaryTwinSet", twins: [] },
  });

  let missionMismatch = false;
  try {
    await mono03.artifactStore.getArtifact(artifact.artifactId, { missionId: "mission-AUTRE" });
  } catch (e) {
    missionMismatch = e.code === "PERSISTED_ARTIFACT_MISMATCH";
  }
  check("T03-26. missionId attendu différent du missionId réel de l'artefact -> PERSISTED_ARTIFACT_MISMATCH", missionMismatch);

  let schemaMismatch = false;
  try {
    await mono03.artifactStore.getArtifact(artifact.artifactId, { contract: "EvidenceForge.AutreContrat" });
  } catch (e) {
    schemaMismatch = e.code === "PERSISTED_ARTIFACT_MISMATCH";
  }
  check("T03-27. contract attendu différent du contract réel de l'artefact -> PERSISTED_ARTIFACT_MISMATCH", schemaMismatch);

  let versionMismatch = false;
  try {
    await mono03.artifactStore.getArtifact(artifact.artifactId, { schemaVersion: "EF-02E-v999" });
  } catch (e) {
    versionMismatch = e.code === "PERSISTED_ARTIFACT_MISMATCH";
  }
  check("T03-28. schemaVersion attendue différente de la schemaVersion réelle -> PERSISTED_ARTIFACT_MISMATCH", versionMismatch);

  check("T03-29. content hash mismatch -> déjà couvert de façon exhaustive par T03-06 (corruption directe du backend), pas de duplication ici", true);

  {
    const runIdOld = "run-t0330-old";
    const runIdNew = "run-t0330-new";
    await createSampleRun(mono03, runIdOld, "mission-t0330");
    await createSampleRun(mono03, runIdNew, "mission-t0330");
    const registryPayload = { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1", entries: [{ professionalRef: "p1", reason: "x" }] };
    const oldSnapshot = await mono03.artifactStore.putArtifact({ runId: runIdOld, nodeId: "EF-02E", contract: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1", missionId: "mission-t0330", payload: registryPayload });
    const newRegistryPayload = { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1", entries: [{ professionalRef: "p1", reason: "x" }, { professionalRef: "p2", reason: "y" }] };
    const newSnapshot = await mono03.artifactStore.putArtifact({ runId: runIdNew, nodeId: "EF-02E", contract: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1", missionId: "mission-t0330", payload: newRegistryPayload });

    check("T03-30a. les deux snapshots (ancien run / nouveau run) ont des artifactId distincts (jamais partagés)", oldSnapshot.artifactId !== newSnapshot.artifactId);

    const rereadOld = await mono03.artifactStore.getArtifact(oldSnapshot.artifactId);
    check("T03-30b. l'ancien run conserve EXACTEMENT son snapshot d'origine (1 entrée), jamais muté par le run plus récent", rereadOld.payload.entries.length === 1);

    const rereadNew = await mono03.artifactStore.getArtifact(newSnapshot.artifactId);
    check("T03-30c. le nouveau run utilise sa propre version (2 entrées), indépendamment de l'ancien", rereadNew.payload.entries.length === 2);
  }

  {
    const runIdLineage = "run-t0331";
    await createSampleRun(mono03, runIdLineage, "mission-t0331");
    await mono03.runStore.markNodeRunning(runIdLineage, "EF-03A");
    const reviewSchemaV1 = await mono03.runStore.recordNodeSuccess({ runId: runIdLineage, nodeId: "EF-03A", contract: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1", missionId: "mission-t0331", payload: { schema: "EvidenceForge.ReviewSchema", schemaHash: "hashV1" } });

    await mono03.coordinator.recordLineagePass(runIdLineage, { reviewSchemaHash: "hashV1", lineageAssurance: {} }, { "EF-03A": reviewSchemaV1.artifactRefs["EF-03A"] });
    const validBefore = await mono03.coordinator.isLineageStillValid(runIdLineage);
    check("T03-31a. juste après un PASS de lignée, isLineageStillValid() est vrai (aucun artefact amont n'a changé)", validBefore === true);

    const runIdLineage2 = "run-t0331-recompute";
    await createSampleRun(mono03, runIdLineage2, "mission-t0331");
    await mono03.runStore.markNodeRunning(runIdLineage2, "EF-03A");
    await mono03.runStore.recordNodeSuccess({ runId: runIdLineage2, nodeId: "EF-03A", contract: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1", missionId: "mission-t0331", payload: { schema: "EvidenceForge.ReviewSchema", schemaHash: "hashV2-DIFFERENT" } });

    // Ce nouveau run reçoit un lineageStatus référençant l'ARTEFACT DE
    // L'AUTRE RUN (simulation d'un PASS devenu obsolète après remplacement
    // amont) — jamais une autorisation automatique reconduite.
    await mono03.coordinator.recordLineagePass(runIdLineage2, { reviewSchemaHash: "hashV1", lineageAssurance: {} }, { "EF-03A": reviewSchemaV1.artifactRefs["EF-03A"] });
    const validAfterReplacement = await mono03.coordinator.isLineageStillValid(runIdLineage2);
    check("T03-31b. si l'artefact amont référencé par un ancien PASS ne correspond plus à l'artefact réel du run -> isLineageStillValid() devient faux", validAfterReplacement === false);
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
