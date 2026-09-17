"use strict";
const { freshMono03, createSampleRun, mono03On } = require("./fixtures.js");
const { sha256Hex } = require("../lib/canonical-hash.js");
const { computeArtifactId } = require("../lib/artifact-store.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

function failNextPutOnce(backend, namespace, key) {
  const originalPut = backend.put;
  let armed = true;
  backend.put = async function (ns, k, v) {
    if (armed && ns === namespace && k === key) {
      armed = false;
      backend.put = originalPut;
      throw new Error(`failNextPutOnce: échec injecté pour ${namespace}:${key}`);
    }
    return originalPut.call(backend, ns, k, v);
  };
}

(async () => {
  const runId = "run-atomic01";
  const missionId = "mission-atomic01";
  const payload = { schema: "EvidenceForge.MissionDimensionSet", v: 1 };
  const contentHash = sha256Hex(payload);
  const artifactId = computeArtifactId({ runId, nodeId: "EF-PR-GEN-01", contract: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", missionId, contentHash });

  const { backend, mono03 } = freshMono03();
  await createSampleRun(mono03, runId, missionId);
  await mono03.runStore.markNodeRunning(runId, "EF-PR-GEN-01");

  // === T03-SUCCESS-ATOMIC-01 ===
  failNextPutOnce(backend, "runs", runId);
  let commitFailed = false;
  try {
    await mono03.runStore.recordNodeSuccess({ runId, nodeId: "EF-PR-GEN-01", contract: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", missionId, payload });
  } catch (e) {
    commitFailed = e.code === "PERSISTENCE_WRITE_FAILED";
  }
  check("T03-SUCCESS-ATOMIC-01a. panne injectée sur le commit RunState final -> recordNodeSuccess() échoue explicitement", commitFailed);

  const stateAfterFailure = await mono03.runStore.loadRun(runId);
  check(
    "T03-SUCCESS-ATOMIC-01b. après la panne, le nœud reste dans son état précédent (RUNNING) — aucun RunState partiellement SUCCESS",
    stateAfterFailure.nodeStates["EF-PR-GEN-01"].state === "RUNNING",
    stateAfterFailure.nodeStates["EF-PR-GEN-01"].state
  );
  check("T03-SUCCESS-ATOMIC-01c. artifactRefs[nodeId] n'a jamais été écrit non plus (cohérence du couple)", stateAfterFailure.artifactRefs["EF-PR-GEN-01"] === undefined);

  const orphanExists = await mono03.artifactStore.hasArtifact(artifactId);
  check("T03-SUCCESS-ATOMIC-01d. l'ArtifactRecord orphelin PEUT exister (écrit avant la panne du commit RunState) — comportement accepté, pas une fuite", orphanExists === true);

  // === T03-SUCCESS-ATOMIC-02 ===
  const mono03B = mono03On(backend);
  const completed = await mono03B.runStore.recordNodeSuccess({ runId, nodeId: "EF-PR-GEN-01", contract: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", missionId, payload });
  check("T03-SUCCESS-ATOMIC-02a. retry (nouvelle instance, même backend) avec le même payload -> SUCCESS complet", completed.nodeStates["EF-PR-GEN-01"].state === "SUCCESS");
  check("T03-SUCCESS-ATOMIC-02b. outputArtifactRefs[0] === artifactRefs[nodeId]", completed.nodeStates["EF-PR-GEN-01"].outputArtifactRefs[0] === completed.artifactRefs["EF-PR-GEN-01"]);

  const allArtifactKeys = await backend.keys("artifacts");
  const matchingKeys = allArtifactKeys.filter((k) => k === artifactId);
  check("T03-SUCCESS-ATOMIC-02c. aucun doublon d'artefact (le retry a réutilisé l'ArtifactRecord orphelin, jamais recréé un second)", matchingKeys.length === 1, JSON.stringify(allArtifactKeys.length));

  // === T03-SUCCESS-ATOMIC-03 ===
  const finalState = await mono03B.runStore.loadRun(runId);
  const node = finalState.nodeStates["EF-PR-GEN-01"];
  const invariantHolds =
    node.state === "SUCCESS" &&
    Array.isArray(node.outputArtifactRefs) &&
    node.outputArtifactRefs.length === 1 &&
    finalState.artifactRefs["EF-PR-GEN-01"] !== undefined &&
    node.outputArtifactRefs[0] === finalState.artifactRefs["EF-PR-GEN-01"];
  check("T03-SUCCESS-ATOMIC-03a. invariant SUCCESS complet : exactement une outputArtifactRef, artifactRefs[nodeId] existe, les deux identiques", invariantHolds, JSON.stringify(node));
  const rereadArtifact = await mono03B.artifactStore.getArtifact(node.outputArtifactRefs[0]).then(() => true, () => false);
  check("T03-SUCCESS-ATOMIC-03b. ArtifactStore.getArtifact(id) réussit pour cette référence", rereadArtifact === true);

  // === T03-SUCCESS-ATOMIC-04 ===
  {
    const runIdCorrupt = "run-atomic04-corrupt";
    await createSampleRun(mono03, runIdCorrupt, missionId);
    const rawState = await backend.get("runs", runIdCorrupt);
    const corrupted = {
      ...rawState,
      nodeStates: {
        ...rawState.nodeStates,
        "EF-PR-GEN-01": { ...rawState.nodeStates["EF-PR-GEN-01"], state: "SUCCESS", outputArtifactRefs: ["some-artifact-id"] },
      },
      // artifactRefs["EF-PR-GEN-01"] volontairement ABSENT -> incohérence exacte du bug rapporté.
    };
    await backend.put("runs", runIdCorrupt, corrupted);

    let rejectedAtLoad = false;
    try {
      await mono03.runStore.loadRun(runIdCorrupt);
    } catch (e) {
      rejectedAtLoad = e.code === "RUN_STATE_CONFLICT";
    }
    check("T03-SUCCESS-ATOMIC-04. un RunState historique/corrompu (SUCCESS avec artifactRefs incohérent) est rejeté fail-closed à loadRun(), jamais traité comme un SUCCESS réutilisable", rejectedAtLoad);
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
