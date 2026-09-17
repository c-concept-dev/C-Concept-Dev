"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, driveEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = buildMono01();

  // Le graphe déclare EF-03B dépendant architecturalement d'EF-PR-GEN-01
  // (source de MissionDocumentMapping) ET de TARGET_DOCUMENT_SET — vérifié
  // en T02-01 sur la déclaration ; ici on vérifie le comportement réel.
  const fs = require("fs");
  const { GRAPH_PATH: gp } = require("./fixtures.js");
  const graph = JSON.parse(fs.readFileSync(gp, "utf8"));
  const ef03b = graph.nodes.find((n) => n.nodeId === "EF-03B");
  check("1. EF-03B déclare EF-PR-GEN-01 et TARGET_DOCUMENT_SET dans requiredUpstreamNodes", ef03b.requiredUpstreamNodes.includes("EF-PR-GEN-01") && ef03b.requiredUpstreamNodes.includes("TARGET_DOCUMENT_SET"));
  check("2. la note architecturale précise que MissionDocumentMapping n'est jamais un paramètre direct (contrat gelé inchangé)", typeof ef03b.architecturalDependencyNote === "string" && /jamais un param/i.test(ef03b.architecturalDependencyNote));

  // Comportement réel : sans TARGET_DOCUMENT_SET (jamais lancé), EF-03B ne peut jamais tourner.
  const ctx = await buildFullContext("mission-t0210a");
  const engine = createOrchestrationEngine(GRAPH_PATH, mono01, ctx);
  // On avance tout SAUF TARGET_DOCUMENT_SET : on retire "documents" pour l'empêcher de réussir.
  delete engine.context.externalInputs.documents;
  await driveEngine(engine, { maxIterations: 14 });
  check("3. sans TARGET_DOCUMENT_SET SUCCESS, EF-03A peut réussir (upstream différent) mais EF-03B reste bloqué", engine.getNodeState("EF-03A") === "SUCCESS" && engine.getNodeState("EF-03B") !== "SUCCESS", `EF-03A=${engine.getNodeState("EF-03A")} EF-03B=${engine.getNodeState("EF-03B")}`);

  // Comportement réel : chaîne complète -> EF-03B réussit avec les deux upstream.
  const ctx2 = await buildFullContext("mission-t0210b");
  const engine2 = createOrchestrationEngine(GRAPH_PATH, mono01, ctx2);
  await driveEngine(engine2, { maxIterations: 14 });
  check("4. chaîne complète -> EF-03B SUCCESS", engine2.getNodeState("EF-03B") === "SUCCESS", engine2.getNodeState("EF-03B"));
  check("5. la sortie d'EF-03B est un DocumentaryReviewSet/EF-03B-v1 réel", engine2.context.nodeOutputs["EF-03B"].schema === "EvidenceForge.DocumentaryReviewSet" && engine2.context.nodeOutputs["EF-03B"].schemaVersion === "EF-03B-v1");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
