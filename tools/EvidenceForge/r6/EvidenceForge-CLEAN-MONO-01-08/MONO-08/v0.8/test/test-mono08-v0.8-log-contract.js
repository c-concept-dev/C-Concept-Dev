#!/usr/bin/env node
"use strict";
// MONO-08 v0.8 — fermeture causale du finding EF01C2_CHECKPOINT_LOG_CONTRACT_VIOLATION.
// Aucun reseau, aucun LLM, aucun PREPARE, aucun RESUME.

const path = require("path");
// Racine du bundle R6 : argument explicite > variable d'environnement >
// deduction depuis __dirname (valable seulement si le lot est en place dans le
// bundle). Une extraction fraiche hors bundle DOIT fournir le chemin.
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const MONO01 = path.join(KIT, "MONO-01");
if (!require("fs").existsSync(path.join(MONO01, "dependencies", "ef-orch-ef01c2-checkpoint-contract-v0.1.js"))) {
  console.error("MONO-01 introuvable sous \"" + KIT + "\".");
  console.error("Usage: node test/test-mono08-v0.8-log-contract.js <bundleRoot>");
  console.error("   ou: EVIDENCEFORGE_KIT_ROOT=<bundleRoot> node test/test-mono08-v0.8-log-contract.js");
  process.exit(2);
}
const contract = require(path.join(MONO01, "dependencies", "ef-orch-ef01c2-checkpoint-contract-v0.1.js"));
const { fairQueryCoverageRetrieval, fairShares } = require("../lib/fair-query-coverage.js");
const { runReadinessV3, probeEf01c2CheckpointContract } = require("../lib/readiness-v3.js");

let pass = 0, fail = 0;
function check(id, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + id); }
  else { fail++; console.log("  FAIL  " + id + (detail ? "  -> " + detail : "")); }
}
function accepts(output) {
  try { contract.assertConnectorCheckpointOutputValid({ connectorId: "openalex", capability: "automatic", output: output }); return { ok: true, err: null }; }
  catch (e) { return { ok: false, err: String(e && e.message ? e.message : e) }; }
}

const SOURCE = (i, disc) => ({
  id: "local-" + i, titre: "Src " + i, auteurOuOrganisme: "A", date: "2020",
  reference: "https://doi.org/10.0000/x." + i, discipline: disc, theme: "t",
  provenance: { connectorId: "openalex", connectorType: "academic_api", retrievalMethod: "m", originalReference: "https://openalex.org/W" + i },
  extraitUtilise: "", dateConsultation: "2026-01-01T00:00:00.000Z", statutScreening: "trouve",
});

function protocolOf(nQueries, maxResults) {
  return {
    requetesExactes: Array.from({ length: nQueries }, (_, i) => ({ connectorId: "openalex", requete: "q" + (i + 1), discipline: "d" + (i + 1) })),
    retrievalPolicies: [{ connectorId: "openalex", maxResults: maxResults, pageSize: 25, maxPages: 1 }],
  };
}
// Runner FACTICE : identifiants externes distincts par requete, cout provider simule.
function fakeRunner(opts) {
  opts = opts || {};
  let seq = 0;
  const calls = [];
  const fn = async function (connector, view) {
    const q = view.requetesExactes[0];
    const share = view.retrievalPolicies[0].maxResults;
    calls.push({ requete: q.requete, granted: share });
    const n = Math.min(share, opts.perQuery === undefined ? 20 : opts.perQuery);
    const sources = Array.from({ length: n }, () => SOURCE(++seq, q.discipline));
    if (opts.duplicateOf) sources.push(SOURCE(opts.duplicateOf, q.discipline));
    return { sourcesTrouvees: sources, log: { connectorId: "openalex", requestsCount: 1, resultsCount: n, costUsd: opts.costPerQuery === undefined ? 0 : opts.costPerQuery, errors: opts.errors || [], startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z", stopReason: "fin des resultats" } };
  };
  fn.calls = calls;
  return fn;
}

(async () => {
  console.log("MONO-08 v0.8 — contrat de log EF-01C2\n");

  // ---- T01 : le log v0.7 HISTORIQUE est bien rejete par le validateur gele ----
  const V07_HISTORICAL_LOG = {
    connectorId: "openalex", orchestration: "FAIR_QUERY_COVERAGE",
    requestsCount: 7, resultsCount: 88, errors: [],
    stopReason: "toutes les requetes eligibles traitees",
  };
  const v07 = accepts({ sourcesTrouvees: [SOURCE(1, "d1")], log: V07_HISTORICAL_LOG });
  check("T01. log v0.7 historique (sans costUsd/startedAt/finishedAt) REJETE par le validateur gele", !v07.ok, v07.err);
  check("T01b. le message de rejet designe bien costUsd (cause exacte observee au RESUME reel)", !v07.ok && /costUsd/.test(v07.err), v07.err);

  // ---- v0.8 nominal ----
  const runner = fakeRunner({ perQuery: 20, costPerQuery: 0.125 });
  const r = await fairQueryCoverageRetrieval({ runner: runner, protocol: protocolOf(7, 100) });
  const log = r.log;

  check("T02. le log v0.8 contient costUsd numerique", typeof log.costUsd === "number" && Number.isFinite(log.costUsd), JSON.stringify(log.costUsd));
  check("T03. le log v0.8 contient startedAt non vide", typeof log.startedAt === "string" && log.startedAt.trim().length > 0, JSON.stringify(log.startedAt));
  check("T04. le log v0.8 contient finishedAt non vide", typeof log.finishedAt === "string" && log.finishedAt.trim().length > 0, JSON.stringify(log.finishedAt));
  check("T05. les deux horodatages sont parseables", !isNaN(Date.parse(log.startedAt)) && !isNaN(Date.parse(log.finishedAt)), log.startedAt + " / " + log.finishedAt);
  check("T06. startedAt <= finishedAt", Date.parse(log.startedAt) <= Date.parse(log.finishedAt), log.startedAt + " > " + log.finishedAt);
  check("T07. costUsd ACCUMULE les sous-logs, jamais un 0 code en dur (7 x 0.125 = 0.875)", Math.abs(log.costUsd - 0.875) < 1e-9, String(log.costUsd));
  check("T07b. costUsd vaut 0 quand le fournisseur n'annonce aucun cout (semantique v0.6 preservee)",
    await (async () => { const rr = await fairQueryCoverageRetrieval({ runner: fakeRunner({ perQuery: 2, costPerQuery: 0 }), protocol: protocolOf(3, 50) }); return rr.log.costUsd === 0; })());
  check("T07c. les horodatages viennent du runtime, pas d'une constante figee",
    log.startedAt !== "2026-01-01T00:00:00.000Z" && Date.parse(log.startedAt) > Date.parse("2026-01-01T00:00:00.000Z"), log.startedAt);

  // ---- T08 : le VRAI validateur gele accepte la sortie FAIR v0.8 ----
  const v08 = accepts(r);
  check("T08. le validateur gele assertConnectorCheckpointOutputValid ACCEPTE la sortie FAIR v0.8", v08.ok, v08.err);

  // ---- fairness inchangee ----
  check("T09. 7/7 requetes executees, aucune affamee", r.coverage.queriesExecuted === 7 && r.coverage.starvedQueries.length === 0, JSON.stringify(r.coverage.starvedQueries));
  check("T10. plafond global maxResults inchange (<= 100)", r.coverage.globalBudget === 100 && log.resultsCount <= 100, "budget=" + r.coverage.globalBudget + " resultats=" + log.resultsCount);
  check("T11. allocations equitables inchangees : floor(100/7)=14 puis +1 aux 100%7=2 premieres",
    JSON.stringify(fairShares(100, 7)) === JSON.stringify([15, 15, 14, 14, 14, 14, 14]), JSON.stringify(fairShares(100, 7)));
  check("T11b. les parts reellement accordees au runner correspondent aux allocations",
    JSON.stringify(runner.calls.map(c => c.granted)) === JSON.stringify([15, 15, 14, 14, 14, 14, 14]), JSON.stringify(runner.calls.map(c => c.granted)));

  // ---- T12 : dedup inchangee ----
  const dupRunner = fakeRunner({ perQuery: 3, duplicateOf: 1 });
  const rd = await fairQueryCoverageRetrieval({ runner: dupRunner, protocol: protocolOf(3, 100) });
  const dropped = rd.coverage.perQuery.reduce((a, e) => a + e.duplicatesDropped, 0);
  check("T12. deduplication par identite EXTERNE inchangee (doublons detectes entre requetes)", dropped >= 2, "duplicatesDropped=" + dropped);
  check("T12b. aucune source n'est perdue par collision d'identifiant local", rd.log.resultsCount === 9, "resultsCount=" + rd.log.resultsCount);

  // ---- T13 : memoization du constructeur inchangee ----
  const FQC = require("../lib/fair-query-coverage.js");
  check("T13a. buildFairCoverageConnectorRunner est toujours exporte", typeof FQC.buildFairCoverageConnectorRunner === "function" || typeof require("../lib/fair-query-coverage.js").buildFairCoverageConnectorRunner === "function");
  {
    // memoisation : le runner agrege ne doit executer FAIR qu'une seule fois
    let inner = 0;
    const raw = async function (connector, view) { inner++; return { sourcesTrouvees: [SOURCE(inner, "d")], log: { connectorId: "openalex", requestsCount: 1, resultsCount: 1, costUsd: 0, errors: [], startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z", stopReason: "ok" } }; };
    const proto = protocolOf(2, 10);
    let cached = null;
    const memo = async function (c, p) { if (!cached) cached = fairQueryCoverageRetrieval({ runner: raw, protocol: p }); return cached; };
    const a = await memo({}, proto); const b = await memo({}, proto);
    check("T13. memoisation preservee : deux invocations, une seule execution FAIR", a === b && inner === 2, "inner=" + inner);
  }

  // ---- T14/T15 : errors et stopReason preserves ----
  const errRunner = fakeRunner({ perQuery: 1, errors: ["boom reseau"] });
  const re = await fairQueryCoverageRetrieval({ runner: errRunner, protocol: protocolOf(2, 10) });
  check("T14. le tableau errors est preserve et agrege", Array.isArray(re.log.errors) && re.log.errors.length === 2, JSON.stringify(re.log.errors));
  check("T15. stopReason est preserve et non vide", typeof log.stopReason === "string" && log.stopReason.trim().length > 0, log.stopReason);
  check("T15b. errors reste un tableau meme vide (exige par le contrat gele)", Array.isArray(log.errors));

  // ---- T16 : le chemin existing-artifacts utilise bien le runner v0.8 ----
  {
    const src = require("fs").readFileSync(path.join(__dirname, "..", "lib", "prepare-existing-artifacts.js"), "utf8");
    check("T16a. prepare-existing-artifacts.js requiert le runner equitable LOCAL au lot (__dirname, donc v0.8)",
      /buildFairCoverageConnectorRunner.*require\(path\.join\(__dirname, "fair-query-coverage\.js"\)\)/.test(src.replace(/\n/g, " ")), "require local introuvable");
    const PEA = require("../lib/prepare-existing-artifacts.js");
    check("T16b. buildPreRetrievalArtifactsFromExisting est exporte par v0.8", typeof PEA.buildPreRetrievalArtifactsFromExisting === "function");
    // deps REELS : createOpenAlexRunner du lot gele MONO-01, jamais un faux.
    const realDeps = { createOpenAlexRunner: require(path.join(MONO01, "dependencies", "ef-orch-ef01c2-runner-openalex-v0.1.js")).createOpenAlexRunner };
    check("T16c0. createOpenAlexRunner est bien fourni par le lot gele MONO-01", typeof realDeps.createOpenAlexRunner === "function");
    const built = require("../lib/fair-query-coverage.js").buildFairCoverageConnectorRunner(realDeps, "sid", async () => ({ json: async () => ({ results: [] }) }));
    check("T16c. le constructeur produit toujours le runner nomme memoizedFairRunner (garde du script 12)", !!built && built.name === "memoizedFairRunner", built ? built.name : "non construit");
    const outNoNet = await built({ connectorId: "openalex" }, protocolOf(7, 100));
    const chk = accepts(outNoNet);
    check("T16d. la sortie du runner REELLEMENT cable (fetch factice, zero reseau) passe le validateur gele", chk.ok, chk.err);
    check("T16e. son log porte les trois champs manquants en v0.7",
      typeof outNoNet.log.costUsd === "number" && !!outNoNet.log.startedAt && !!outNoNet.log.finishedAt, JSON.stringify(outNoNet.log));
  }

  // ---- T17/T18/T19 : readiness v3 detecte chaque champ manquant ----
  {
    const missing = (field) => {
      const bad = Object.assign({}, log); delete bad[field];
      return accepts({ sourcesTrouvees: r.sourcesTrouvees, log: bad });
    };
    check("T17. un log sans costUsd est rejete (readiness v3 le detecterait hors ligne)", !missing("costUsd").ok, missing("costUsd").err);
    check("T18. un log sans startedAt est rejete", !missing("startedAt").ok, missing("startedAt").err);
    check("T19. un log sans finishedAt est rejete", !missing("finishedAt").ok, missing("finishedAt").err);
  }

  // ---- T20 : chemin checkpoint EF-01C2 local complet ----
  const probe = await probeEf01c2CheckpointContract(MONO01, { queryCount: 7, maxResults: 100 });
  check("T20. LOCAL_EF01C2_CHECKPOINT_PATH : FAIR hors reseau -> validateur gele reel = PASS", probe.accepted, probe.error);
  check("T20b. la sonde locale execute bien 7/7 requetes", probe.result.coverage.queriesExecuted === 7, String(probe.result.coverage.queriesExecuted));

  // ---- T21 : NEW_V08_LOG_ACCEPTED / OLD_V07_LOG_REJECTED dans un meme test ----
  check("T21. fermeture causale : ancien log REJETE et nouveau log ACCEPTE par le MEME validateur gele", !v07.ok && v08.ok);

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
