"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  // moduleId = EF-99 -> MODULE_NOT_IN_BASELINE. On exerce ce chemin via
  // invokePort directement puisque tous les ports concrets ciblent un
  // moduleId fixe déjà connu du registre — le contrôle générique est
  // identique quel que soit le port appelant.
  const { invokePort } = require("../lib/port-factory.js");
  const result = invokePort(
    { portId: "test", moduleId: "EF-99", requiredInputs: [], callType: "SYNC" },
    mono01.baselinePort,
    { inputs: {}, invoke: () => ({}) }
  );

  check("1. moduleId=EF-99 -> status BLOCKED", result.status === "BLOCKED", result.status);
  check(
    "2. moduleId=EF-99 -> code MODULE_NOT_IN_BASELINE",
    result.diagnostics && result.diagnostics.error && result.diagnostics.error.code === "MODULE_NOT_IN_BASELINE",
    JSON.stringify(result.diagnostics)
  );
  check("3. moduleId=EF-99 -> le module gelé n'est jamais appelé (invoke non exécuté)", result.output === null);

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
