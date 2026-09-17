"use strict";
// test/unit/test_t07_runner_policy.js — T07-RUNNER-01 a 06

const { classifyOutcome, runWithPolicy } = require("../../lib/runner-policy");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

function makeExecError(opts) {
  opts = opts || {};
  const e = new Error(opts.message || "Command failed");
  e.status = opts.status !== undefined ? opts.status : 1;
  e.signal = opts.signal || null;
  e.stdout = opts.stdout || "";
  e.stderr = opts.stderr || "";
  return e;
}

(async () => {
  {
    let callCount = 0;
    const runFn = () => {
      callCount++;
      throw makeExecError({ stdout: "FAIL — assertion artificielle\n\nECHECS : 1\n" });
    };
    const result = runWithPolicy(runFn, "browser");
    check("T07-RUNNER-01a. echec fonctionnel execute exactement 1 fois (jamais de retry)", callCount === 1, "callCount=" + callCount);
    check("T07-RUNNER-01b. resultat final FAIL", result.ok === false);
    check("T07-RUNNER-01c. classification correcte = FUNCTIONAL", result.attempts[0].classification === "FUNCTIONAL", result.attempts[0].classification);
  }

  {
    let callCount = 0;
    const runFn = () => {
      callCount++;
      if (callCount === 1) throw makeExecError({ stdout: "FAIL — secret présent dans DOM\n\nECHECS : 1\n" });
      return "TOUS LES TESTS PASSENT (5)\n";
    };
    const result = runWithPolicy(runFn, "browser");
    check("T07-RUNNER-02a. jamais de deuxieme tentative pour un echec classe fonctionnel", callCount === 1, "callCount=" + callCount);
    check("T07-RUNNER-02b. resultat final reste FAIL (jamais masque)", result.ok === false);
  }

  {
    let callCount = 0;
    const runFn = () => {
      callCount++;
      throw makeExecError({ signal: "SIGKILL", stdout: "", stderr: "" });
    };
    const result = runWithPolicy(runFn, "browser");
    check("T07-RUNNER-03a. echec infrastructure (SIGKILL) declenche exactement 1 tentative supplementaire (2 au total)", callCount === 2, "callCount=" + callCount);
    check("T07-RUNNER-03b. classification de la premiere tentative = INFRASTRUCTURE", result.attempts[0].classification === "INFRASTRUCTURE");
  }

  {
    let callCount = 0;
    const runFn = () => {
      callCount++;
      if (callCount === 1) throw makeExecError({ stderr: "browserType.launch: Failed to launch browser process" });
      return "TOUS LES TESTS PASSENT (5)\n";
    };
    const result = runWithPolicy(runFn, "browser");
    check("T07-RUNNER-04a. resultat final PASS apres recuperation infrastructure", result.ok === true);
    check("T07-RUNNER-04b. la tentative 1 (echouee) reste conservee dans le journal", result.attempts.length === 2 && result.attempts[0].classification === "INFRASTRUCTURE" && result.attempts[1].classification === "PASS", JSON.stringify(result.attempts.map((a) => a.classification)));
  }

  {
    let callCount = 0;
    const runFn = () => {
      callCount++;
      throw makeExecError({ stderr: "Target page, context or browser has been closed" });
    };
    const result = runWithPolicy(runFn, "browser");
    check("T07-RUNNER-05a. echec infrastructure repete -> exactement 2 tentatives, jamais 3", callCount === 2, "callCount=" + callCount);
    check("T07-RUNNER-05b. resultat final FAIL definitif", result.ok === false);
  }

  {
    let callCount = 0;
    const runFn = () => {
      callCount++;
      throw makeExecError({ signal: "SIGKILL" });
    };
    const result = runWithPolicy(runFn, "node-api");
    check("T07-RUNNER-06. le groupe node-api n'applique JAMAIS de retry, meme sur une infrastructure reconnue", callCount === 1, "callCount=" + callCount);
  }

  {
    const functionalWithInfraLookingText = { ok: false, err: makeExecError({ stdout: "browserType.launch: some transient log line\n\nECHECS : 2\n" }) };
    check("classifyOutcome priorise FUNCTIONAL si le fichier a atteint son resume ECHECS", classifyOutcome(functionalWithInfraLookingText) === "FUNCTIONAL");

    const unrecognized = { ok: false, err: makeExecError({ stdout: "une erreur totalement inattendue, jamais vue auparavant" }) };
    check("classifyOutcome traite un echec non reconnu comme FUNCTIONAL par defaut", classifyOutcome(unrecognized) === "FUNCTIONAL");
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
