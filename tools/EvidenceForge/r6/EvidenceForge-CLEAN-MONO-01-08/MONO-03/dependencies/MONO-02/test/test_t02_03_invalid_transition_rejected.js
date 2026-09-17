"use strict";
const { buildFullEngine } = require("./fixtures.js");
const { transition } = require("../lib/state-machine.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  // Mécanique pure (state-machine.js)
  check("1. NOT_STARTED -> RUNNING refusé", transition("NOT_STARTED", "RUNNING").ok === false);
  check("2. NOT_STARTED -> SUCCESS refusé", transition("NOT_STARTED", "SUCCESS").ok === false);
  check("3. SUCCESS -> RUNNING refusé (pas de retour arrière depuis un succès)", transition("SUCCESS", "RUNNING").ok === false);
  check("4. READY -> BLOCKED refusé directement (doit passer par RUNNING)", transition("READY", "BLOCKED").ok === false);
  check("5. FAILED -> RUNNING refusé (doit repasser par READY explicitement)", transition("FAILED", "RUNNING").ok === false);
  check("6. n'importe quel état -> NOT_STARTED toujours refusé", ["READY", "RUNNING", "SUCCESS", "FAILED", "BLOCKED", "PAUSED"].every((s) => transition(s, "NOT_STARTED").ok === false));
  check("7. les 9 transitions déclarées sont bien acceptées", [
    ["NOT_STARTED", "READY"], ["READY", "RUNNING"], ["RUNNING", "SUCCESS"], ["RUNNING", "FAILED"],
    ["RUNNING", "BLOCKED"], ["FAILED", "READY"], ["BLOCKED", "READY"], ["RUNNING", "PAUSED"], ["PAUSED", "READY"],
  ].every(([f, t]) => transition(f, t).ok === true));
  check("8. code d'erreur INVALID_STATE_TRANSITION sur un rejet", transition("SUCCESS", "FAILED").error.code === "INVALID_STATE_TRANSITION");

  // Via l'engine réel : une tentative de transition directe interdite sur un vrai nœud.
  const engine = await buildFullEngine("mission-t0203");
  const badTransition = engine.transition("EF-ORCH-SUBSYSTEM", "SUCCESS"); // EF-ORCH est NOT_STARTED au départ
  check("9. engine.transition('EF-ORCH','SUCCESS') depuis NOT_STARTED -> refusé", badTransition.ok === false && badTransition.error.code === "INVALID_STATE_TRANSITION");
  check("9b. l'état du nœud n'a pas changé après un rejet", engine.getNodeState("EF-ORCH-SUBSYSTEM") === "NOT_STARTED");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
