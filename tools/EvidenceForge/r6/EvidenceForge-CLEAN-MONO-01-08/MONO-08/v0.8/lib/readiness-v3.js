"use strict";
/**
 * MONO-08 v0.8 — lib/readiness-v3.js
 *
 * Etend readiness-v2 (v0.7, conserve tel quel) avec les controles qui
 * AURAIENT detecte hors ligne le defaut revele par le premier RESUME reel :
 * le log agrege FAIR_QUERY_COVERAGE ne satisfaisait pas le contrat gele
 * EF-01C2 (costUsd / startedAt / finishedAt absents).
 *
 * Aucun retrieval reel : le controle EF-01C2 s'execute avec un runner
 * FACTICE, purement local, et passe le resultat dans le VRAI validateur
 * gele assertConnectorCheckpointOutputValid() — jamais une reimplementation
 * de sa logique ici.
 */

const path = require("path");
const { runReadinessV2 } = require("./readiness-v2.js");
const { fairQueryCoverageRetrieval } = require("./fair-query-coverage.js");

function loadFrozenCheckpointContract(mono01Path) {
  return require(path.join(mono01Path, "dependencies", "ef-orch-ef01c2-checkpoint-contract-v0.1.js"));
}

/**
 * buildOfflineFairProbe(mono01Path, opts) — execute FAIR hors reseau avec un
 * runner factice puis soumet la sortie au validateur GELE.
 */
async function probeEf01c2CheckpointContract(mono01Path, opts) {
  opts = opts || {};
  const queries = opts.queryCount || 7;
  const maxResults = typeof opts.maxResults === "number" ? opts.maxResults : 100;
  const protocol = {
    requetesExactes: Array.from({ length: queries }, (_, i) => ({ connectorId: "openalex", requete: "probe-" + (i + 1), discipline: "disc-" + (i + 1) })),
    retrievalPolicies: [{ connectorId: "openalex", maxResults: maxResults, pageSize: 25, maxPages: 1 }],
  };
  let seq = 0;
  const fakeRunner = async function (connector, view) {
    const q = view.requetesExactes[0];
    const share = view.retrievalPolicies[0].maxResults;
    const n = Math.min(share, 20);
    const sources = Array.from({ length: n }, function () {
      seq++;
      return {
        id: "local-" + seq, titre: "Probe " + seq, auteurOuOrganisme: "A", date: "2020",
        reference: "https://doi.org/10.0000/probe." + seq, discipline: q.discipline, theme: "probe",
        provenance: { connectorId: "openalex", connectorType: "academic_api", retrievalMethod: "probe", originalReference: "https://openalex.org/WPROBE" + seq },
        extraitUtilise: "", dateConsultation: new Date().toISOString(), statutScreening: "trouve",
      };
    });
    return { sourcesTrouvees: sources, log: { connectorId: "openalex", requestsCount: 1, resultsCount: n, costUsd: 0, errors: [], startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), stopReason: "fin des resultats" } };
  };
  const result = await fairQueryCoverageRetrieval({ runner: fakeRunner, protocol: protocol });
  const contract = loadFrozenCheckpointContract(mono01Path);
  let accepted = true, error = null;
  try {
    contract.assertConnectorCheckpointOutputValid({ connectorId: "openalex", capability: "automatic", output: result });
  } catch (e) {
    accepted = false; error = String(e && e.message ? e.message : e);
  }
  return { result: result, accepted: accepted, error: error, protocol: protocol };
}

async function runReadinessV3(cfg) {
  const base = await runReadinessV2(cfg);
  const checks = (base.checks || []).slice();
  const add = (name, ok, detail) => checks.push({ name: name, status: ok ? "PASS" : "FAIL", detail: detail || "" });

  const mono01Path = cfg.MONO01_PATH;
  const probe = await probeEf01c2CheckpointContract(mono01Path, { queryCount: 7, maxResults: 100 });
  const log = probe.result.log;
  const cov = probe.result.coverage;

  add("FAIR_QUERY_COVERAGE", cov.queriesExecuted === cov.queriesTotal && cov.queriesTotal === 7,
    cov.queriesExecuted + "/" + cov.queriesTotal + " requetes executees, aucune affamee (" + JSON.stringify(cov.starvedQueries) + ")");
  add("GLOBAL_MAXRESULTS_PRESERVED", cov.globalBudget === 100 && log.resultsCount <= 100,
    "budget global=" + cov.globalBudget + " resultats=" + log.resultsCount);

  const numeric = (v) => typeof v === "number" && Number.isFinite(v);
  const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
  add("EF01C2_LOG_HAS_COST_USD", numeric(log.costUsd), "costUsd=" + JSON.stringify(log.costUsd));
  add("EF01C2_LOG_HAS_STARTED_AT", nonEmpty(log.startedAt), "startedAt=" + JSON.stringify(log.startedAt));
  add("EF01C2_LOG_HAS_FINISHED_AT", nonEmpty(log.finishedAt), "finishedAt=" + JSON.stringify(log.finishedAt));
  const ts = nonEmpty(log.startedAt) && nonEmpty(log.finishedAt) && !isNaN(Date.parse(log.startedAt)) && !isNaN(Date.parse(log.finishedAt));
  add("EF01C2_LOG_TIMESTAMPS_ORDERED", ts && Date.parse(log.startedAt) <= Date.parse(log.finishedAt),
    ts ? log.startedAt + " <= " + log.finishedAt : "horodatages non parseables");
  add("EF01C2_CHECKPOINT_LOG_CONTRACT_VALID", probe.accepted, probe.error || "assertConnectorCheckpointOutputValid accepte la sortie FAIR");
  add("LOCAL_EF01C2_CHECKPOINT_PATH_PASS", probe.accepted, probe.accepted ? "chemin checkpoint EF-01C2 exerce hors reseau, validateur gele appele reellement" : probe.error);

  const failed = checks.filter((c) => c.status !== "PASS");
  // La forme du rapport v2 est CONSERVEE telle quelle (reserves, resume, etc.) :
  // les appelants existants — dont le script operateur — continuent de lire les
  // memes champs. v3 se contente d'ajouter des controles et de recalculer le statut.
  return Object.assign({}, base, {
    version: "v3",
    checks: checks,
    failedCount: failed.length,
    status: failed.length === 0 ? "READY" : "NOT_READY",
    READINESS_V3: failed.length === 0 ? "PASS" : "FAIL",
    ef01c2Probe: { log: log, coverage: cov, accepted: probe.accepted, error: probe.error },
  });
}

module.exports = { runReadinessV3: runReadinessV3, probeEf01c2CheckpointContract: probeEf01c2CheckpointContract };
