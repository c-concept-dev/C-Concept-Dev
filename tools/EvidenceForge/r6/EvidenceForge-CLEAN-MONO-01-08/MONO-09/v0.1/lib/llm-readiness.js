"use strict";
/**
 * MONO-09 v0.1 — lib/llm-readiness.js
 *
 * POURQUOI LLM_CALLS=0 a ete possible dans le run vide.
 * EF-02D (ef-02d1d2-orchestrator-v1.js l.28-35) boucle sur
 * corpusSet.professionalCorpora ; EF-03B (ef-03b-review-runner-v1.js l.160-172)
 * boucle sur twins x targets. Les deux listes etant vides, workerCallFn n'a
 * jamais ete atteint. Le fail-closed EXISTE bien — l.130 :
 *     if (typeof workerCallFn !== "function") throw new Error("EF-03B: workerCallFn manquant.")
 * mais il est INATTEIGNABLE quand il n'y a rien a traiter. Un run sans
 * identifiants LLM aboutit donc en SUCCESS.
 *
 * Ce module verifie la disponibilite LLM AVANT le pipeline, en fonction du
 * volume reel de donnees. Il n'appelle jamais de LLM.
 */

const LLM_REQUIRED_NODES = [
  { nodeId: "EF-02D", why: "evaluation d'eligibilite documentaire et de pertinence par dimension (buildEligibilityRelevanceSet)", drivenBy: "professionalCorpora" },
  { nodeId: "EF-03B", why: "production des revues documentaires par jumeau et par document cible (buildDocumentaryReviewSet)", drivenBy: "twins x reviewTargets" },
];

function assertLlmReadiness(input) {
  input = input || {};
  const counts = input.counts || {};
  const hasWorker = typeof input.workerCallFn === "function";
  const hasCredentials = input.credentialsPresent === true;
  const willInvoke = [];
  if ((counts.professionalCorpora || 0) > 0) willInvoke.push("EF-02D");
  if ((counts.twinsCreated || 0) > 0 && (counts.reviewTargets || 0) > 0) willInvoke.push("EF-03B");

  const report = {
    schema: "EvidenceForge.LlmReadiness", schemaVersion: "MONO-09-v0.1",
    llmRequiredNodes: LLM_REQUIRED_NODES,
    nodesThatWillInvokeLlm: willInvoke,
    workerCallFnPresent: hasWorker, credentialsPresent: hasCredentials,
    emptyDataWouldSkipLlm: willInvoke.length === 0,
    status: null, problems: [],
  };
  if (willInvoke.length === 0) {
    report.status = "NO_LLM_NEEDED_DATA_EMPTY";
    report.problems.push("Aucune donnee a traiter : le LLM ne sera pas appele. Un SUCCESS obtenu ainsi ne prouve rien sur la disponibilite LLM.");
    return report;
  }
  if (!hasWorker) report.problems.push("workerCallFn absent alors que " + willInvoke.join(", ") + " en auront besoin.");
  if (!hasCredentials) report.problems.push("aucun identifiant fournisseur LLM detecte alors que " + willInvoke.join(", ") + " en auront besoin.");
  report.status = report.problems.length ? "NOT_READY" : "READY";
  if (report.status === "NOT_READY") {
    const e = new Error("LLM_DEPENDENCY_NOT_READY: " + report.problems.join(" ; "));
    e.code = "LLM_DEPENDENCY_NOT_READY"; e.report = report; throw e;
  }
  return report;
}

module.exports = { assertLlmReadiness, LLM_REQUIRED_NODES };
