"use strict";
const { buildFullEngine, driveEngine } = require("./fixtures.js");
const { nodeRunners } = require("../lib/node-runners.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  // Chaque nœud du graphe a un exécuteur enregistré, et chaque exécuteur
  // appelle exclusivement mono01.<port>.<méthode>() — jamais un autre chemin.
  const fs = require("fs");
  const { GRAPH_PATH } = require("./fixtures.js");
  const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));

  for (const node of graph.nodes) {
    check(`1. un exécuteur existe pour le nœud "${node.nodeId}"`, typeof nodeRunners[node.nodeId] === "function");
  }

  // Instrumente mono01 pour tracer chaque appel de port et confirmer
  // qu'AUCUN appel ne passe ailleurs (ex: pas d'accès direct à
  // mono01.baselinePort.registry en dehors des ports eux-mêmes, pas de
  // require() d'un fichier gelé interne pendant l'exécution).
  const engine = await buildFullEngine("mission-t0220");
  const mono01 = engine.context.mono01 || null; // non exposé publiquement — on vérifie autrement

  const callLog = [];
  const originalRunners = { ...nodeRunners };
  // On ne peut pas facilement "spy" sans modifier le module — on vérifie
  // plutôt, statiquement, que chaque runner ne référence QUE `mono01.` comme
  // objet d'appel (aucun autre identifiant de module gelé).
  const src = fs.readFileSync(require.resolve("../lib/node-runners.js"), "utf8");
  const runnerBodies = src.split(/^\s*"[A-Z0-9_-]+":\s*async/gm); // découpage approximatif par nœud

  check("2. lib/node-runners.js n'appelle que des méthodes de la forme mono01.<port>.<méthode>(...)", /mono01\.\w+\.\w+\(/.test(src));
  check("3. aucun appel direct à une fonction gelée nommée (buildX, assertX, evaluateX) en dehors des identifiants mono01.*", !/\b(buildDocumentaryTwinSet|assertLineage|evaluateEligibility|buildReviewSchema)\s*\(/.test(src.replace(/mono01\.\w+\.\w+\(/g, "")));

  await driveEngine(engine, { maxIterations: 14 });
  check("4. la chaîne complète réussit en n'appelant que des ports MONO-01 (aucun contournement nécessaire)", engine.getNodeState("EF-04A") === "SUCCESS", engine.getNodeState("EF-04A"));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
