"use strict";
// test/test_t08_observability.js — LOCAL_CONTROLLED
//
// REMEDIATION F-01 (audit independant MONO-00-08) : avant ce correctif, un
// noeud non-SUCCESS dans bin/run-real-smoke.js n'etait rapporte que par
// "nodeId:state" — lastError/errorCode n'etaient jamais consultes ni
// conserves. Prouve que describeNodeFailure() (bin/run-real-smoke.js)
// restitue fidelement ce qu'operatorApi.getNode() retourne reellement,
// sans jamais deviner un champ absent. Couvre T-NEW-04.
//
// Les objets getNode()/lastError simules ici reproduisent fidelement la
// forme REELLE de app/server/operator-api.js::getNode() (schema
// EvidenceForge.IntegrationError : {schema, schemaVersion, code, message,
// details}) et de lib/node-runners.js::EF-ORCH-SUBSYSTEM (details =
// {efOrchNativeStatus, awaitingStage, gate} en pause, ou {stageId,
// lastError} en echec natif) — inspectes directement dans le kit canonique,
// jamais invente ici.

const { describeNodeFailure } = require("../bin/run-real-smoke");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function fakeOperatorApi(nodeRecord) {
  return { getNode: async function (runId, nodeId) { if (nodeId !== nodeRecord.nodeId) throw new Error("nodeId inattendu dans le test."); return nodeRecord; } };
}

(async () => {
  // === Cas reel observe historiquement : EF-ORCH-SUBSYSTEM BLOCKED (pause native, gate en attente) ===
  {
    const nodeRecord = {
      nodeId: "EF-ORCH-SUBSYSTEM", state: "BLOCKED", attemptCount: 1,
      lastError: {
        schema: "EvidenceForge.IntegrationError", schemaVersion: "MONO-01-v1", code: "DEPENDENCY_UNAVAILABLE",
        message: "EF-ORCH-SUBSYSTEM en attente (statut natif \"paused\", stage \"EF-01D\", gate \"screening-complete\").",
        details: { efOrchNativeStatus: "paused", awaitingStage: "EF-01D", gate: { gateId: "screening-complete", status: "pending" } },
      },
    };
    const d = await describeNodeFailure(fakeOperatorApi(nodeRecord), "run-1", "EF-ORCH-SUBSYSTEM");
    check("T-NEW-04a. nodeId/state/attemptCount restitues tels quels", d.nodeId === "EF-ORCH-SUBSYSTEM" && d.state === "BLOCKED" && d.attemptCount === 1);
    check("T-NEW-04b. lastError complet conserve (jamais tronque)", d.lastError && d.lastError.message === nodeRecord.lastError.message);
    check("T-NEW-04c. errorCode extrait de lastError.code", d.errorCode === "DEPENDENCY_UNAVAILABLE");
    check("T-NEW-04d. nativeStatus extrait de lastError.details.efOrchNativeStatus quand present", d.nativeStatus === "paused");
    check("T-NEW-04e. awaitingStage extrait quand present", d.awaitingStage === "EF-01D");
    check("T-NEW-04f. gate extrait quand present (objet complet, jamais resume)", d.gate && d.gate.gateId === "screening-complete");
    check("T-NEW-04g. currentStage/completedStages/lastResultKind absents du resultat quand absents de la source (jamais devines)", typeof d.currentStage === "undefined" && typeof d.completedStages === "undefined" && typeof d.lastResultKind === "undefined");
  }

  // === Cas EF-ORCH natif en echec (currentStage = stageId, lastError imbrique) ===
  {
    const nodeRecord = {
      nodeId: "EF-ORCH-SUBSYSTEM", state: "FAILED", attemptCount: 2,
      lastError: {
        schema: "EvidenceForge.IntegrationError", schemaVersion: "MONO-01-v1", code: "INTEGRATION_CONTRACT_ERROR",
        message: "EF-ORCH-SUBSYSTEM: run EF-ORCH natif en echec au stage \"EF-01C2\": timeout connecteur.",
        details: { stageId: "EF-01C2", lastError: { message: "timeout connecteur" } },
      },
    };
    const d = await describeNodeFailure(fakeOperatorApi(nodeRecord), "run-2", "EF-ORCH-SUBSYSTEM");
    check("T-NEW-04h. currentStage extrait de lastError.details.stageId (stage EF-ORCH natif, jamais invente)", d.currentStage === "EF-01C2");
    check("T-NEW-04i. errorCode = INTEGRATION_CONTRACT_ERROR pour un echec natif (distinct de DEPENDENCY_UNAVAILABLE)", d.errorCode === "INTEGRATION_CONTRACT_ERROR");
  }

  // === Noeud sans lastError (etat non-SUCCESS mais aucune erreur structuree disponible) : jamais un objet errorCode invente ===
  {
    const nodeRecord = { nodeId: "EF-02A", state: "NOT_STARTED", attemptCount: 0, lastError: null };
    const d = await describeNodeFailure(fakeOperatorApi(nodeRecord), "run-3", "EF-02A");
    check("T-NEW-04j. errorCode=null (jamais une chaine inventee) quand lastError absent", d.errorCode === null && d.lastError === null);
  }

  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
