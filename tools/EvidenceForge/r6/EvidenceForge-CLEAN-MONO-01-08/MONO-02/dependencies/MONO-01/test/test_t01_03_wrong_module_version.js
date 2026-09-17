"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");
const { invokePort } = require("../lib/port-factory.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  // EF-04 est gelé en canonicalVersion "v1" dans le registre réel — on
  // déclare un port qui exige "v999" pour forcer le mismatch.
  const result = invokePort(
    { portId: "test", moduleId: "EF-04", expectedCanonicalVersion: "v999", requiredInputs: [], callType: "SYNC" },
    mono01.baselinePort,
    { inputs: {}, invoke: () => ({}) }
  );

  check("1. version canonique différente du registre -> FAIL (status BLOCKED)", result.status === "BLOCKED", result.status);
  check(
    "2. code MODULE_VERSION_MISMATCH",
    result.diagnostics && result.diagnostics.error && result.diagnostics.error.code === "MODULE_VERSION_MISMATCH",
    JSON.stringify(result.diagnostics)
  );
  check(
    "3. les détails exposent la version attendue et la version trouvée",
    result.diagnostics.error.details.expected === "v999" && result.diagnostics.error.details.found === "v1",
    JSON.stringify(result.diagnostics.error.details)
  );

  // Contre-épreuve : la version canonique correcte passe ce contrôle.
  const ok = invokePort(
    { portId: "test", moduleId: "EF-04", expectedCanonicalVersion: "v1", requiredInputs: [], callType: "SYNC" },
    mono01.baselinePort,
    { inputs: {}, invoke: () => ({ schema: "x" }) }
  );
  check("4. version canonique correcte -> pas de MODULE_VERSION_MISMATCH", ok.status !== "BLOCKED" || !ok.diagnostics.error || ok.diagnostics.error.code !== "MODULE_VERSION_MISMATCH");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
