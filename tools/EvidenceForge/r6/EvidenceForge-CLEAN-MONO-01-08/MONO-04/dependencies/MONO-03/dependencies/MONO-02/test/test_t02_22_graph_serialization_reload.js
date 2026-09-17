"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { GRAPH_PATH, buildMono01, createOrchestrationEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const originalRaw = fs.readFileSync(GRAPH_PATH, "utf8");
const originalGraph = JSON.parse(originalRaw);

// Sérialise puis recharge depuis un fichier temporaire — le graphe rechargé
// doit être structurellement identique (round-trip JSON.stringify/parse).
const tmpPath = path.join(os.tmpdir(), "mono02-graph-roundtrip-" + Date.now() + ".json");
fs.writeFileSync(tmpPath, JSON.stringify(originalGraph, null, 2), "utf8");
const reloadedGraph = JSON.parse(fs.readFileSync(tmpPath, "utf8"));

check("1. round-trip JSON stringify/parse produit un graphe structurellement identique", JSON.stringify(originalGraph) === JSON.stringify(reloadedGraph));
check("2. même nombre de nœuds après rechargement", reloadedGraph.nodes.length === originalGraph.nodes.length);
check("3. même ordre de nœuds après rechargement", JSON.stringify(reloadedGraph.nodes.map((n) => n.nodeId)) === JSON.stringify(originalGraph.nodes.map((n) => n.nodeId)));

// Un engine construit depuis le fichier rechargé se comporte IDENTIQUEMENT
// à un engine construit depuis le fichier d'origine (même computeReadyNodes()
// initial), confirmant qu'aucune information n'est perdue au rechargement.
const mono01 = buildMono01();
const engineOriginal = createOrchestrationEngine(GRAPH_PATH, mono01, { externalInputs: {}, dependenciesAvailable: {} });
const engineReloaded = createOrchestrationEngine(tmpPath, mono01, { externalInputs: {}, dependenciesAvailable: {} });

check("4. les deux engines exposent la même liste de nœuds", JSON.stringify(engineOriginal.listNodeIds()) === JSON.stringify(engineReloaded.listNodeIds()));
check(
  "5. les deux engines calculent le même computeReadyNodes() initial (aucune entrée fournie -> aucun nœud READY dans les deux cas)",
  JSON.stringify(engineOriginal.computeReadyNodes()) === JSON.stringify(engineReloaded.computeReadyNodes())
);

// Le moteur refuse un graphe dont le schema/schemaVersion a été altéré au rechargement (fail-closed).
let threwBadSchema = false;
try {
  createOrchestrationEngine({ ...originalGraph, schema: "NotAnOrchestrationGraph" }, mono01, {});
} catch (e) {
  threwBadSchema = true;
}
check("6. un graphe rechargé avec un schema altéré est refusé au démarrage (fail-closed)", threwBadSchema);

fs.unlinkSync(tmpPath);

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
