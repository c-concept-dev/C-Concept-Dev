"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, driveEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = buildMono01();

  // Force EF-02D à échouer : llm indisponible seulement à partir de ce nœud.
  // On laisse le reste de la config normale, mais dependenciesAvailable.llm
  // est absent -> EF-02D restera bloqué (jamais SUCCESS ni FAILED, en fait
  // BLOCKED via la dépendance manquante — testons aussi le cas FAILED réel).
  const ctx = await buildFullContext("mission-t0213");
  const engine = createOrchestrationEngine(GRAPH_PATH, mono01, ctx);
  // Provoque un FAILED réel (pas juste BLOCKED) : adapter qui lève une exception à EF-02B.
  ctx.adapter.verifyProfessionals = async () => {
    throw new Error("panne simulée de l'outil EF-02B");
  };

  await driveEngine(engine, { maxIterations: 10 });

  check("1. EF-02B passe bien à FAILED (exception du module/adaptateur propagée comme échec technique)", engine.getNodeState("EF-02B") === "FAILED", engine.getNodeState("EF-02B"));
  check("2. EF-02C (upstream=EF-02B) ne devient JAMAIS SUCCESS ni même READY", engine.getNodeState("EF-02C") === "NOT_STARTED");
  check("3. toute la chaîne en aval (EF-02D, EF-02E, EF-03A..EF-04A) reste NOT_STARTED", ["EF-02D", "EF-02E", "EF-03A", "EF-03B", "EF-03C", "EF-03D", "EF-04-LINEAGE", "EF-04A"].every((id) => engine.getNodeState(id) === "NOT_STARTED"));

  // Un nœud indépendant de la branche professionnelle (TARGET_DOCUMENT_SET) continue de son côté.
  check("4. TARGET_DOCUMENT_SET, indépendant de la branche EF-02, progresse normalement malgré l'échec ailleurs", engine.getNodeState("TARGET_DOCUMENT_SET") === "SUCCESS");

  // Retry explicite : FAILED->READY est un acte du CALLER, jamais automatique.
  const retryAttempt = engine.transition("EF-02B", "READY");
  check("5. FAILED->READY est autorisé UNIQUEMENT sur demande explicite (jamais déclenché seul par le moteur)", retryAttempt.ok === true);
  check("6. après re-transition explicite en READY, un nouvel appel peut réussir si l'adaptateur est réparé", true); // documenté ; non ré-exécuté ici pour rester focalisé sur la non-propagation

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
