"use strict";
// MONO-08 v0.7 — banc d'INTEGRATION (remediation d'audit F-AUD-V07-01 / -02).
//
// Ce banc ne construit JAMAIS le fair runner lui-meme. Il prend exactement le
// runner que le CHEMIN D'EXECUTION retournera :
//     pre = buildPreRetrievalArtifactsFromExisting(...)
//     runner = pre.connectorRunners.openalex
// C'est le seul moyen de prouver que le readiness et l'execution empruntent le
// MEME chemin. Le banc cible precedent construisait le fair runner directement
// et ne pouvait donc pas voir le defaut de raccordement.
//
// ZERO reseau. argv[2] = bundleRoot ; argv[3] = workspaceRoot.

const path = require("path");
const fs = require("fs");

const bundleRoot = process.argv[2];
const wsRoot = process.argv[3];
if (!bundleRoot || !wsRoot) { console.error("Usage: node test-mono08-v0.7-integration.js <bundleRoot> <workspaceRoot>"); process.exit(2); }

const V07 = path.join(bundleRoot, "MONO-08", "v0.7");
const V06 = path.join(bundleRoot, "MONO-08", "v0.6");
const PEA = require(path.join(V07, "lib", "prepare-existing-artifacts.js"));
const cfg = { MONO01_PATH: path.join(bundleRoot, "MONO-01"), MONO08_V06_PATH: V06 };
const W = (f) => path.join(wsRoot, f);
const load = (f) => JSON.parse(fs.readFileSync(W(f), "utf8"));

const RC = load("runcontract-confirmed.json");
const SP = load("searchprotocol-confirmed.json");
const PROV = load("eforch-provenance.json");
const EXEC = load("mission-real-jmjs-execution.json");

const results = [];
const check = (n, c, d) => results.push({ name: n, pass: !!c, detail: d || "" });

function fakeFetch() {
  const state = { calls: 0 };
  return { state, fn: async function (url) {
    state.calls++;
    const u = new URL(url);
    const per = parseInt(u.searchParams.get("per_page") || u.searchParams.get("per-page") || "25", 10);
    const results = Array.from({ length: per }, (_, i) => ({
      id: "https://openalex.org/W" + state.calls + "_" + i,
      display_name: "Doc " + i, publication_year: 2020, doi: null, authorships: [], primary_location: null, type: "article",
    }));
    return { ok: true, status: 200, json: async () => ({ results, meta: { count: 99999 } }) };
  } };
}

(async () => {
  const mission = JSON.parse(JSON.stringify(EXEC));
  mission.dimensions = RC.disciplinesProposees.filter(d => d.statut === "retenue").map(d => ({ id: d.discipline, label: d.discipline }));
  const bytes = {};
  for (const d of EXEC.targetDocuments) if (d.status === "VERIFIED") bytes[d.url] = Buffer.from(d.contentBase64, "base64");

  const ff = fakeFetch();
  const pre = await PEA.buildPreRetrievalArtifactsFromExisting(cfg, {
    v06LibPath: path.join(V06, "lib"), mission: mission,
    existingRunContract: RC, existingSearchProtocol: SP, existingEForchProvenance: PROV,
    documentBytesByUrl: bytes, openAlexFetchImpl: ff.fn,
  });

  // ---- LE runner du chemin d'execution, pas un runner reconstruit pour le test ----
  const runner = pre.connectorRunners.openalex;
  check("TI-01. le chemin d execution expose bien un runner openalex", typeof runner === "function");

  const out = await runner({ connectorId: "openalex" }, SP);

  const orchestration = out && out.log && out.log.orchestration;
  check("TI-02. EXECUTION_PATH_USES_FAIR_RUNNER (orchestration = FAIR_QUERY_COVERAGE)",
    orchestration === "FAIR_QUERY_COVERAGE", "orchestration=" + String(orchestration));
  check("TI-03. le runner expose la couverture par requete", !!(out && out.coverage && Array.isArray(out.coverage.perQuery)));

  const disciplines = new Set((out.sourcesTrouvees || []).map(s => s.discipline).filter(Boolean));
  const order = RC.disciplinesProposees.filter(d => d.statut === "retenue").map(d => d.discipline);
  order.forEach(function (d, i) {
    check("TI-04." + (i + 1) + " QUERY_" + (i + 1) + "_EXECUTED (" + d + ")", disciplines.has(d));
  });
  check("TI-05. les 7 disciplines sont couvertes par le chemin d execution", disciplines.size === 7, disciplines.size + "/7");

  const policy = (SP.retrievalPolicies || []).find(p => p.connectorId === "openalex") || {};
  const total = out.log.resultsCount;
  check("TI-06. TOTAL_RESULTS <= plafond global (" + policy.maxResults + ")", total <= policy.maxResults, "total=" + total);
  const shares = (out.coverage && out.coverage.shares) || null;
  check("TI-07. semantique GLOBALE preservee : somme des parts = plafond",
    !!shares && shares.reduce((a, b) => a + b, 0) === policy.maxResults,
    shares ? "somme=" + shares.reduce((a, b) => a + b, 0) : "aucune repartition exposee (runner non equitable)");
  const pq = (out.coverage && out.coverage.perQuery) || null;
  check("TI-08. aucune requete reecrite par le chemin d execution",
    !!pq && pq.every((q, i) => q.requete === SP.requetesExactes[i].requete),
    pq ? "" : "aucune couverture par requete exposee (runner non equitable)");

  // ---- memoization de l agregat : second appel, aucun fetch supplementaire ----
  const callsAfterFirst = ff.state.calls;
  const out2 = await runner({ connectorId: "openalex" }, SP);
  check("TI-09. FAIR_AGGREGATE_MEMOIZATION : second appel sans fetch supplementaire",
    ff.state.calls === callsAfterFirst, "fetch avant=" + callsAfterFirst + " apres=" + ff.state.calls);
  check("TI-10. le second appel rend le MEME agregat", out2 === out || (out2.log.resultsCount === out.log.resultsCount && out2.sourcesTrouvees.length === out.sourcesTrouvees.length));

  // ---- hygiene de source (F-AUD-V07-02) ----
  // Motifs assembles a partir de fragments : ecrits en clair, ce detecteur se
  // signalerait lui-meme a chaque execution.
  const FORBIDDEN = ["u" + "id=", "g" + "id=", "grou" + "ps=", "christophe" + "bonnet"];
  const scanned = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/\.(js|md|json|txt)$/.test(e.name)) scanned.push(fp);
    }
  })(V07);
  const contaminated = [];
  for (const f of scanned) {
    const src = fs.readFileSync(f, "utf8");
    for (const pat of FORBIDDEN) if (src.includes(pat)) contaminated.push(path.relative(V07, f) + " <- \"" + pat + "\"");
  }
  check("TI-11. SOURCE_HYGIENE : aucune donnee de machine locale dans le successeur",
    contaminated.length === 0, contaminated.join(" ; "));
  check("TI-12. " + scanned.length + " fichiers du successeur scannes", scanned.length > 0);

  const failed = results.filter(r => !r.pass);
  results.forEach(r => console.log((r.pass ? "PASS — " : "FAIL — ") + r.name + (r.detail ? "  [" + r.detail + "]" : "")));
  console.log("");
  if (failed.length) { console.log("ECHECS (" + failed.length + ") :"); failed.forEach(r => console.log("  - " + r.name)); console.log(""); console.log("MONO08_V07_INTEGRATION = FAIL"); process.exit(1); }
  console.log("TOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("");
  console.log("MONO08_V07_INTEGRATION = PASS");
})().catch(e => { console.error("TEST_HARNESS_FAILED:", e && e.stack || e); process.exit(1); });
