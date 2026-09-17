"use strict";
const fs = require("fs");
const { GRAPH_PATH, buildFullEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
const byId = new Map(graph.nodes.map((n) => [n.nodeId, n]));

// Les 6 valeurs autorisées (CDC MONO-02 section RETRY/RESUME).
const ALLOWED_POLICIES = ["RESTART_STAGE", "RESUME_CHECKPOINT", "REPLAY_MISSING_ONLY", "RECOMPUTE_DETERMINISTIC", "EXPLICIT_REBUILD_REQUIRED", "NO_RETRY"];

check("1. tous les nœuds déclarent une retryPolicy parmi les 6 valeurs autorisées, jamais une valeur inventée", graph.nodes.every((n) => ALLOWED_POLICIES.includes(n.retryPolicy)), graph.nodes.filter((n) => !ALLOWED_POLICIES.includes(n.retryPolicy)).map((n) => n.nodeId));

// Exemples explicitement donnés par le CDC — vérifiés littéralement.
check("2. EF-02D -> RESUME_CHECKPOINT (resume/fusion additive, exemple explicite du CDC)", byId.get("EF-02D").retryPolicy === "RESUME_CHECKPOINT");
check("3. EF-02E -> EXPLICIT_REBUILD_REQUIRED (reconstruction explicite, exemple explicite du CDC)", byId.get("EF-02E").retryPolicy === "EXPLICIT_REBUILD_REQUIRED");
check("4. EF-03B -> REPLAY_MISSING_ONLY (replay reviews manquantes/invalides uniquement, exemple explicite du CDC)", byId.get("EF-03B").retryPolicy === "REPLAY_MISSING_ONLY");
check("5. EF-03C -> RECOMPUTE_DETERMINISTIC (recalculable depuis inputs valides, exemple explicite du CDC)", byId.get("EF-03C").retryPolicy === "RECOMPUTE_DETERMINISTIC");
check("6. EF-03D -> RECOMPUTE_DETERMINISTIC (recalculable depuis inputs valides, exemple explicite du CDC)", byId.get("EF-03D").retryPolicy === "RECOMPUTE_DETERMINISTIC");

// Chaque retryPolicy cite sa source — jamais une valeur affirmée sans preuve.
check("7. chaque nœud documente resumePolicySource (traçabilité obligatoire, jamais une valeur non sourcée)", graph.nodes.every((n) => typeof n.resumePolicySource === "string" && n.resumePolicySource.length > 10));

(async () => {
  // Comportement réel : le moteur ne déclenche JAMAIS automatiquement
  // FAILED->READY tout seul, quelle que soit la retryPolicy déclarée — la
  // reprise reste un acte explicite de l'appelant (RunStore/ResumePlanner
  // final = hors périmètre MONO-02).
  const engine = await buildFullEngine("mission-t0214");
  engine.context.adapter.verifyProfessionals = async () => { throw new Error("panne simulée"); };
  const { driveEngine } = require("./fixtures.js");
  await driveEngine(engine, { maxIterations: 10 });
  check("8. EF-02B FAILED", engine.getNodeState("EF-02B") === "FAILED");

  // Laisser tourner d'autres cycles de calcul de READY ne relance jamais le
  // nœud tout seul : son état reste FAILED tant qu'aucune transition
  // explicite n'a été demandée.
  engine.computeReadyNodes();
  engine.computeReadyNodes();
  check("9. EF-02B reste FAILED après plusieurs computeReadyNodes() supplémentaires — aucun retry automatique", engine.getNodeState("EF-02B") === "FAILED");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
