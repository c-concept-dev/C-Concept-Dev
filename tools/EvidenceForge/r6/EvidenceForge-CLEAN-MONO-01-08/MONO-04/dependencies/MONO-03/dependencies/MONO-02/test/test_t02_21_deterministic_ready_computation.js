"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = buildMono01();

  // Deux engines indépendants avec un contexte identique (mêmes objets,
  // reconstruits séparément mais structurellement équivalents) doivent
  // produire EXACTEMENT la même séquence de nœuds READY, dans le même ordre.
  const ctx1 = await buildFullContext("mission-t0221");
  const ctx2 = await buildFullContext("mission-t0221"); // même missionId, reconstruit séparément

  const engine1 = createOrchestrationEngine(GRAPH_PATH, mono01, ctx1);
  const engine2 = createOrchestrationEngine(GRAPH_PATH, mono01, ctx2);

  const ready1a = engine1.computeReadyNodes();
  const ready2a = engine2.computeReadyNodes();
  check("1. computeReadyNodes() initial identique sur deux engines équivalents", JSON.stringify(ready1a) === JSON.stringify(ready2a), JSON.stringify({ ready1a, ready2a }));

  // Appeler plusieurs fois de suite sans rien changer -> résultat identique (idempotent).
  const ready1b = engine1.computeReadyNodes();
  check("2. computeReadyNodes() est idempotent (appel répété sans changement d'état -> même résultat)", JSON.stringify(ready1a) === JSON.stringify(ready1b));

  // Ordre toujours celui du graphe, jamais un ordre d'insertion dynamique.
  const fs = require("fs");
  const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
  const graphOrder = graph.nodes.map((n) => n.nodeId);
  check("3. listNodeIds() respecte strictement l'ordre déclaré dans le graphe JSON", JSON.stringify(engine1.listNodeIds()) === JSON.stringify(graphOrder));
  check("4. computeReadyNodes() ne retourne que des nodeId dans l'ordre du graphe (jamais un ordre Map/objet arbitraire)", ready1a.every((id, i, arr) => i === 0 || graphOrder.indexOf(id) > graphOrder.indexOf(arr[i - 1])));

  // Faire avancer engine1 d'un cran et vérifier que engine2 (non modifié) reste identique à son propre état initial.
  await engine1.runNode("EF-ORCH-SUBSYSTEM");
  const ready1c = engine1.computeReadyNodes();
  const ready2b = engine2.computeReadyNodes(); // engine2 inchangé depuis ready2a
  check("5. l'avancement d'engine1 n'affecte jamais engine2 (aucun état partagé caché)", JSON.stringify(ready2a) === JSON.stringify(ready2b));
  check("6. engine1 progresse bien après EF-ORCH SUCCESS (au moins un nouveau nœud READY ou EF-ORCH disparaît de la liste READY)", JSON.stringify(ready1c) !== JSON.stringify(ready1a));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
