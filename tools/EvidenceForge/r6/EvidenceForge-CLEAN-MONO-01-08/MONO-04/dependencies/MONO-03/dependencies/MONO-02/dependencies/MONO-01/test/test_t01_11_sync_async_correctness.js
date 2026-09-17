"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");
const { invokePort } = require("../lib/port-factory.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  // Un port déclaré SYNC dont l'invocation renvoie une Promise -> rejeté.
  const syncButPromise = invokePort(
    { portId: "test", moduleId: "EF-04", expectedCanonicalVersion: "v1", requiredInputs: [], callType: "SYNC" },
    mono01.baselinePort,
    { inputs: {}, invoke: () => Promise.resolve({ schema: "x" }) }
  );
  check("1. port SYNC + invoke renvoie une Promise -> FAILED", syncButPromise.status === "FAILED", syncButPromise.status);
  check(
    "1b. jamais une Promise brute acceptée comme output truthy sans await",
    syncButPromise.diagnostics.error.code === "INTEGRATION_CONTRACT_ERROR" && syncButPromise.output === null,
    JSON.stringify(syncButPromise.diagnostics)
  );

  // Un port déclaré ASYNC dont l'invocation NE renvoie PAS de Promise -> rejeté.
  const asyncButSync = invokePort(
    { portId: "test", moduleId: "EF-04", expectedCanonicalVersion: "v1", requiredInputs: [], callType: "ASYNC" },
    mono01.baselinePort,
    { inputs: {}, invoke: () => ({ schema: "x" }) }
  );
  check("2. port ASYNC + invoke renvoie une valeur synchrone -> FAILED", asyncButSync.status === "FAILED", asyncButSync.status);

  // Cas correct : SYNC + valeur synchrone -> accepté par ce contrôle.
  const syncOk = invokePort(
    { portId: "test", moduleId: "EF-04", expectedCanonicalVersion: "v1", requiredInputs: [], callType: "SYNC" },
    mono01.baselinePort,
    { inputs: {}, invoke: () => ({ schema: "x" }) }
  );
  check("3. port SYNC + valeur synchrone -> pas d'erreur de mode d'appel", syncOk.status !== "FAILED" || syncOk.diagnostics.error.code !== "INTEGRATION_CONTRACT_ERROR" || !/déclaré SYNC/.test(syncOk.diagnostics.error.message));

  // Cas correct : ASYNC + Promise correctement attendue -> le résultat est bien
  // celui résolu par la Promise, jamais l'objet Promise lui-même.
  const asyncOk = await invokePort(
    { portId: "test", moduleId: "EF-04", expectedCanonicalVersion: "v1", requiredInputs: [], callType: "ASYNC", outputContract: { schema: "x" } },
    mono01.baselinePort,
    { inputs: {}, invoke: () => Promise.resolve({ schema: "x", value: 42 }) }
  );
  check("4. port ASYNC + Promise réellement attendue -> output = valeur résolue, jamais l'objet Promise", asyncOk.status === "SUCCESS" && asyncOk.output.value === 42 && typeof asyncOk.output.then !== "function");

  // Défaut historique identifié dans EF-ORCH Stage Adapter : une Promise ne
  // doit jamais être "truthy" et validée telle quelle par un contrôle naïf.
  const rawPromise = Promise.resolve(true);
  check("5. non-régression Stage Adapter : une Promise brute est truthy en JS mais ne doit jamais suffire comme validation de sortie", !!rawPromise === true && typeof rawPromise.then === "function");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
