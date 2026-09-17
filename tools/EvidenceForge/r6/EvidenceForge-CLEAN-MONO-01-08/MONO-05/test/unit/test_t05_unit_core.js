"use strict";
const { GRAPH_PATH } = require("../helpers.js");
const { NODE_ORDER, apiError } = require("../../app/server/operator-api.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const realGraph = require(GRAPH_PATH);
const REAL_NODE_IDS = realGraph.nodes.map((n) => n.nodeId);

check("T05-05u. NODE_ORDER contient exactement les IDs du VRAI graphe MONO-02 gelé, dans le même ordre", JSON.stringify(NODE_ORDER) === JSON.stringify(REAL_NODE_IDS), JSON.stringify({ NODE_ORDER, REAL_NODE_IDS }));

{
  const e = apiError("NODE_NOT_READY", "message lisible", { nodeId: "x" });
  check("T05-34u. apiError() produit toujours {code, message, details} — jamais un texte seul qui masquerait le code machine", e.code === "NODE_NOT_READY" && e.message === "message lisible" && e.details.nodeId === "x");
}

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
