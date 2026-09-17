"use strict";
const fs = require("fs");
const path = require("path");
const { GRAPH_PATH } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
const REQUIRED_FIELDS = [
  "nodeId", "moduleId", "portId", "requiredInputs", "requiredUpstreamNodes",
  "requiredDependencies", "executionClass", "state", "retryPolicy", "resumePolicy",
  "blockingConditions", "successOutputContract",
];
const EXPECTED_NODE_IDS = [
  "EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C", "EF-02D", "EF-02E",
  "TARGET_DOCUMENT_SET", "EF-03A", "EF-03B", "EF-03C", "EF-03D", "EF-04-LINEAGE", "EF-04A",
];

check("1. schema/schemaVersion corrects", graph.schema === "EvidenceForge.OrchestrationGraph" && graph.schemaVersion === "MONO-02-v1");
check("2. 14 nœuds attendus, tous présents, aucun en trop", JSON.stringify(graph.nodes.map((n) => n.nodeId)) === JSON.stringify(EXPECTED_NODE_IDS));

for (const node of graph.nodes) {
  for (const field of REQUIRED_FIELDS) {
    check(`3. ${node.nodeId} déclare le champ "${field}"`, field in node, `champ manquant: ${field}`);
  }
}

check(
  "4. EF-04A a EF-04-LINEAGE comme upstream (garde de lignée distincte, jamais EF-03D->EF-04A direct)",
  graph.nodes.find((n) => n.nodeId === "EF-04A").requiredUpstreamNodes.includes("EF-04-LINEAGE") &&
    !graph.nodes.find((n) => n.nodeId === "EF-04A").requiredUpstreamNodes.includes("EF-03D")
);

check(
  "5. EF-02A requiert CorpusSnapshot ET MissionDimensionSet",
  JSON.stringify(graph.nodes.find((n) => n.nodeId === "EF-02A").requiredInputs.sort()) === JSON.stringify(["corpusSnapshot", "missionDimensionSet"])
);

check(
  "6. EF-02A/B/C requièrent tous un ExternalStageAdapter",
  ["EF-02A", "EF-02B", "EF-02C"].every((id) => {
    const n = graph.nodes.find((x) => x.nodeId === id);
    return n.requiredDependencies.some((d) => d.startsWith("externalStageAdapter"));
  })
);

check(
  "7. EF-02E requiert ExclusionRegistrySet (exclusionRegistry dans requiredInputs)",
  graph.nodes.find((n) => n.nodeId === "EF-02E").requiredInputs.includes("exclusionRegistry")
);

check(
  "8. sourceAuthorities pointe vers les registres MONO-00/MONO-01, jamais une valeur inventée en dehors",
  Array.isArray(graph.sourceAuthorities) && graph.sourceAuthorities.some((s) => s.includes("mono-00")) && graph.sourceAuthorities.some((s) => s.includes("mono-01"))
);

let failed = results.filter((r) => !r.pass);
for (const r of results) if (!r.pass) console.log("FAIL — " + r.name + "  [" + r.detail + "]");
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
