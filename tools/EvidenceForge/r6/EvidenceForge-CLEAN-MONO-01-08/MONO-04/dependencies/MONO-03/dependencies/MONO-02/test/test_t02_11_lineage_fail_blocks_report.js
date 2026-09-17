"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, seedRealisticChain } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const missionId = "mission-t0211";
  const missionQuestion = "Question de test MONO-02 ?";
  const mono01 = buildMono01();
  const ctx = await buildFullContext(missionId);
  const engine = createOrchestrationEngine(GRAPH_PATH, mono01, ctx);

  const chain = await seedRealisticChain(engine, missionId, missionQuestion);
  check("setup. la chaîne EF-02E..EF-03D est réellement non vide (reviews > 0)", chain.reviewSet.reviews.length > 0, chain.reviewSet.reviews.length);

  // Casse délibérément le TargetDocumentSet dans le contexte de l'engine —
  // même technique que MONO-01 T01-15 — pour que assertLineage() détecte une
  // rupture de lignée documentaire réelle (citation absente du document fourni).
  engine.context.nodeOutputs["TARGET_DOCUMENT_SET"] = { ...chain.targetDocumentSet, documents: [] };

  engine.computeReadyNodes();
  check("1. EF-04-LINEAGE devient READY (tous ses upstream sont SUCCESS)", engine.getNodeState("EF-04-LINEAGE") === "READY", engine.getNodeState("EF-04-LINEAGE"));

  const lineageRun = await engine.runNode("EF-04-LINEAGE");
  check("2. EF-04-LINEAGE échoue avec une chaîne de lignée rompue (documents vidés)", lineageRun.ok === false, JSON.stringify(lineageRun.result && lineageRun.result.diagnostics));
  check("3. le nœud EF-04-LINEAGE n'est jamais SUCCESS dans ce cas", engine.getNodeState("EF-04-LINEAGE") !== "SUCCESS", engine.getNodeState("EF-04-LINEAGE"));

  engine.computeReadyNodes();
  check("4. EF-04A ne devient JAMAIS READY tant qu'EF-04-LINEAGE n'est pas SUCCESS", engine.getNodeState("EF-04A") !== "READY");

  const reportAttempt = await engine.runNode("EF-04A");
  check("5. tenter de lancer EF-04A directement -> NODE_NOT_READY (jamais un rapport produit sans lignée PASS)", reportAttempt.ok === false && reportAttempt.error.code === "NODE_NOT_READY", JSON.stringify(reportAttempt));
  check("6. aucun UnifiedReportSummary n'a jamais été produit dans ce scénario", engine.context.nodeOutputs["EF-04A"] === undefined);

  // Contre-épreuve : avec le VRAI targetDocumentSet (non rompu), la lignée passe.
  const ctx2 = await buildFullContext("mission-t0211b");
  const engine2 = createOrchestrationEngine(GRAPH_PATH, mono01, ctx2);
  const chain2 = await seedRealisticChain(engine2, "mission-t0211b", missionQuestion);
  engine2.context.nodeOutputs["TARGET_DOCUMENT_SET"] = chain2.targetDocumentSet; // intact
  engine2.computeReadyNodes();
  const lineageOk = await engine2.runNode("EF-04-LINEAGE");
  check("7. contre-épreuve : chaîne intacte -> EF-04-LINEAGE SUCCESS", lineageOk.ok === true && engine2.getNodeState("EF-04-LINEAGE") === "SUCCESS", JSON.stringify(lineageOk.result && lineageOk.result.diagnostics));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
