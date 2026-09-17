"use strict";
const fs = require("fs");
const { GRAPH_PATH } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
const byId = new Map(graph.nodes.map((n) => [n.nodeId, n]));

const EXPECTED = {
  "EF-ORCH-SUBSYSTEM": "RESUME_CHECKPOINT",
  "EF-PR-GEN-01": "RECOMPUTE_DETERMINISTIC",
  "EF-02A": "RESTART_STAGE",
  "EF-02B": "RESTART_STAGE",
  "EF-02C": "RESUME_CHECKPOINT",
  "EF-02D": "RESUME_CHECKPOINT",
  "EF-02E": "EXPLICIT_REBUILD_REQUIRED",
  "TARGET_DOCUMENT_SET": "RESUME_CHECKPOINT",
  "EF-03A": "RECOMPUTE_DETERMINISTIC",
  "EF-03B": "REPLAY_MISSING_ONLY",
  "EF-03C": "RECOMPUTE_DETERMINISTIC",
  "EF-03D": "RECOMPUTE_DETERMINISTIC",
  "EF-04-LINEAGE": "NO_RETRY",
  "EF-04A": "NO_RETRY",
};

for (const [nodeId, expected] of Object.entries(EXPECTED)) {
  check(`1. ${nodeId}.resumePolicy === "${expected}"`, byId.get(nodeId).resumePolicy === expected, byId.get(nodeId).resumePolicy);
}

check("2. resumePolicy et retryPolicy coïncident partout dans ce graphe (documenté comme choix actuel, champs distincts par contrat)", graph.nodes.every((n) => n.resumePolicy === n.retryPolicy));
check("3. EF-02A/EF-02B (resumeCapability=false dans MONO-00) -> RESTART_STAGE, jamais RESUME_CHECKPOINT", byId.get("EF-02A").resumePolicy === "RESTART_STAGE" && byId.get("EF-02B").resumePolicy === "RESTART_STAGE");
check("4. EF-04-LINEAGE et EF-04A (EF-04 FAIL-CLOSED, sans mode dégradé) -> NO_RETRY tous les deux", byId.get("EF-04-LINEAGE").resumePolicy === "NO_RETRY" && byId.get("EF-04A").resumePolicy === "NO_RETRY");

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
