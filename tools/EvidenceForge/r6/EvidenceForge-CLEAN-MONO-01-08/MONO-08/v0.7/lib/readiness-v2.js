"use strict";
// MONO-08 v0.7 — lib/readiness-v2.js
//
// READINESS V2, 100% HORS LIGNE.
//
// Le readiness v0.6 (audit B-02) fabriquait une mission SYNTHETIQUE
// { readyForExecution: true (code en dur), dimensions, eForchProvenance } et
// prouvait donc la STRUCTURE de la provenance, jamais l'EXECUTABILITE nominale :
// ni octets de documents, ni entrypoint, ni SearchProtocol (jamais meme lu), ni
// missionId. V2 verifie ce qui manquait, sans aucun reseau ni provider.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function isSha256(v) { return typeof v === "string" && /^[0-9a-f]{64}$/i.test(v); }

async function runReadinessV2(cfg) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, status: ok ? "PASS" : "FAIL", detail: detail || "" });
  const reserves = [];

  const mission = cfg.executionMission;
  const rc = cfg.runContract;
  const sp = cfg.searchProtocol;
  const prov = cfg.eForchProvenance;

  // 1. MISSION_READY
  add("MISSION_READY",
    !!mission && mission.readyForExecution === true && typeof mission.missionId === "string" && mission.missionId.trim().length > 0,
    mission ? "missionId=" + mission.missionId : "mission absente");

  // 2/3. DOCUMENT_BYTES_READY + DOCUMENT_HASHES_MATCH
  const docs = (mission && mission.targetDocuments) || [];
  const verified = docs.filter(d => d.status === "VERIFIED");
  let bytesOk = verified.length > 0;
  let hashesOk = verified.length > 0;
  for (const d of verified) {
    if (!d.contentBase64 || !d.content) { bytesOk = false; continue; }
    const recomputed = sha256(Buffer.from(d.contentBase64, "base64"));
    if (recomputed !== d.hashSha256) hashesOk = false;
    const pinned = cfg.pinnedHashes && cfg.pinnedHashes[d.title];
    if (pinned && pinned !== recomputed) hashesOk = false;
  }
  add("DOCUMENT_BYTES_READY", bytesOk, verified.length + " document(s) VERIFIED avec content+contentBase64 inline (exigence litterale d'extractDocumentPayloads)");
  add("DOCUMENT_HASHES_MATCH", hashesOk, "empreintes recalculees depuis les octets et comparees aux valeurs pinees");

  // 4. RUNCONTRACT_BOUND — integrite verifiee par la primitive GELEE
  let rcOk = false, rcDetail = "";
  try {
    const deps = cfg.deps;
    rcOk = !!rc && await deps.EFOrchRunContract.verifyRunContractIntegrity(rc);
    if (rcOk && cfg.expectedRunContractHash) rcOk = rc.runContractHash === cfg.expectedRunContractHash;
    rcDetail = rc ? "runContractHash=" + rc.runContractHash : "absent";
  } catch (e) { rcDetail = String(e.message); }
  add("RUNCONTRACT_BOUND", rcOk, rcDetail);

  // 5. SEARCHPROTOCOL_BOUND — contrat GELE MONO-01
  let spOk = false, spDetail = "";
  try {
    const trace = require(path.join(cfg.MONO01_PATH, "dependencies", "ef-orch-ef01c1-planner-trace-v0.1.js"));
    await trace.assertSearchProtocolFrozenAndValid(sp); // ASYNC dans MONO-01 : le await est obligatoire
    spOk = !cfg.expectedProtocolHash || sp.protocolHash === cfg.expectedProtocolHash;
    spDetail = "protocolHash=" + (sp && sp.protocolHash);
  } catch (e) { spDetail = String(e.message).slice(0, 120); }
  add("SEARCHPROTOCOL_BOUND", spOk, spDetail);

  // 6. MISSION_ID_BOUND (B-08) — canonique partout, jamais un runContractHash
  const ids = {
    mission: mission && mission.missionId,
    searchProtocol: sp && sp.missionId,
    plannerInput: cfg.plannerInputMissionId,
  };
  const idOk = ids.mission && ids.mission === ids.searchProtocol && (!ids.plannerInput || ids.plannerInput === ids.mission)
    && ids.mission !== (rc && rc.runContractHash);
  add("MISSION_ID_BOUND", !!idOk, JSON.stringify(ids) + " ; distinct du runContractHash");

  // 7. EFORCH_PROVENANCE_BOUND
  const provOk = !!prov && Array.isArray(prov.resolverRuns) && prov.resolverRuns.length > 0
    && !!prov.plannerRun && !!prov.plannerOutput && !!prov.humanValidation
    && !!(prov.humanValidation.validatedAt && prov.humanValidation.commentaire);
  add("EFORCH_PROVENANCE_BOUND", provOk, provOk ? prov.resolverRuns.length + " resolverRuns + plannerRun + plannerOutput + humanValidation reelle" : "incomplete");

  // 8. PRE_RETRIEVAL_PROVENANCE_VALID — validateur R6 gele
  let preOk = false, preDetail = "";
  try {
    const ea = require(path.join(cfg.MONO08_V06_PATH, "lib", "eforch-artifacts.js"));
    const dims = (rc.disciplinesProposees || []).filter(d => d.statut === "retenue").map(d => ({ id: d.discipline }));
    const r = ea.validatePreRetrievalProvenance({ dimensions: dims, eForchProvenance: prov });
    preOk = r.valid; preDetail = r.valid ? "valid" : r.problems.join("; ");
  } catch (e) { preDetail = String(e.message); }
  add("PRE_RETRIEVAL_PROVENANCE_VALID", preOk, preDetail);

  // 9. RUNTIME_ENTRYPOINT_READY (B-01) — l'entrypoint retenu doit consommer LA
  // mission fournie, jamais loadMission() qui code en dur la fixture WCAG.
  const entry = cfg.entrypointSource || "";
  const usesLoadMission = /\bloadMission\s*\(/.test(entry);
  add("RUNTIME_ENTRYPOINT_READY", !!entry && !usesLoadMission,
    usesLoadMission ? "l'entrypoint appelle loadMission() — chargerait la fixture WCAG (B-01)" : "l'entrypoint consomme la mission fournie");

  // 10/11. NO_REBUILD — compteurs fournis par le chemin existing-artifacts
  const rb = cfg.rebuildCalls || {};
  add("NO_RUNCONTRACT_REBUILD", rb.runContract === 0, "buildConfirmedRunContractForMission appels=" + rb.runContract);
  add("NO_SEARCHPROTOCOL_REBUILD", rb.searchProtocol === 0, "buildSearchProtocolForMission appels=" + rb.searchProtocol);

  // 12. EF01C2_READY
  add("EF01C2_READY", typeof cfg.connectorRunner === "function", "runner OpenAlex gele construit (aucun appel effectue)");

  // 13. POLICY_COHERENCE_REPORTED (G-04) — divergence NOMMEE, jamais silencieuse,
  // et jamais classee comme une erreur d'empreinte.
  const rcPol = (rc && rc.strategieRecherche && rc.strategieRecherche.retrievalPoliciesParNiveau) || {};
  const spPol = ((sp && sp.retrievalPolicies) || []).find(p => p.connectorId === "openalex") || {};
  const divergent = (rcPol.maxPages !== undefined && rcPol.maxPages !== spPol.maxPages)
    || (rcPol.maxResultsParConnecteur !== undefined && rcPol.maxResultsParConnecteur !== spPol.maxResults);
  const policy = {
    POLICY_DIVERGENCE_DETECTED: divergent ? "YES" : "NO",
    POLICY_AUTHORITY: "SEARCHPROTOCOL_CONFIRMED",
    runContract: { maxPages: rcPol.maxPages, maxResultsParConnecteur: rcPol.maxResultsParConnecteur },
    searchProtocol: { maxPages: spPol.maxPages, maxResults: spPol.maxResults },
    reserve: divergent
      ? "Divergence REELLE et ASSUMEE. Le RunContract n'est jamais consulte a l'execution : le runner EF-01C2 ne lit que protocol.retrievalPolicies. L'autorite d'execution est donc le SearchProtocol humainement valide. La divergence est conservee visible ici et n'est PAS une erreur d'empreinte."
      : "aucune divergence",
  };
  add("POLICY_COHERENCE_REPORTED", true, policy.POLICY_DIVERGENCE_DETECTED === "YES" ? "divergence detectee et rapportee" : "aucune divergence");
  if (divergent) reserves.push(policy.reserve);

  // 14. RETRIEVAL_COVERAGE_SIMULATED (B-07) — hors ligne, fetch factice.
  const cov = cfg.coverageSimulation || null;
  add("RETRIEVAL_COVERAGE_SIMULATED", !!cov && cov.queriesExecuted === cov.queriesTotal && cov.totalResults <= cov.globalBudget,
    cov ? cov.queriesExecuted + "/" + cov.queriesTotal + " requetes executees, " + cov.totalResults + " resultats <= budget " + cov.globalBudget : "non simule");

  const failed = checks.filter(c => c.status === "FAIL");
  return {
    schema: "EvidenceForge.ReadinessV2",
    schemaVersion: "MONO-08-v0.7",
    network: 0, provider: 0, llm: 0,
    checks: checks,
    policy: policy,
    reserves: reserves,
    READINESS_V2: failed.length === 0 ? "PASS" : "FAIL",
    failedChecks: failed.map(c => c.name),
  };
}

module.exports = { runReadinessV2: runReadinessV2 };
