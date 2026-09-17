"use strict";
const { freshMono03, createSampleRun, orderedNodeIds } = require("./fixtures.js");
const { createMono03 } = require("../index.js");
const { createInMemoryBackend } = require("../lib/persistence-backend.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  {
    const { mono03 } = freshMono03();
    await createSampleRun(mono03, "run-t0332", "mission-t0332");
    const plan = await mono03.coordinator.getResumePlan("run-t0332", orderedNodeIds());
    const roundTripped = JSON.parse(JSON.stringify(plan));
    check("T03-32. le ResumePlan sérialise/désérialise sans perte (JSON.stringify -> JSON.parse identique)", JSON.stringify(roundTripped) === JSON.stringify(plan));
    check("T03-32b. le ResumePlan porte schema/schemaVersion exacts", plan.schema === "EvidenceForge.ResumePlan" && plan.schemaVersion === "MONO-03-v1");
  }

  {
    const explicitBackend = createInMemoryBackend();
    check("T03-33. createInMemoryBackend() est bien étiqueté IN_MEMORY_TEST_ONLY (jamais présenté comme un backend de production)", explicitBackend.bindingType === "IN_MEMORY_TEST_ONLY");
    const mono03Explicit = createMono03({ persistenceBackend: explicitBackend });
    check("T03-33b. le backend explicitement injecté est bien celui utilisé (jamais silencieusement remplacé)", mono03Explicit.backend === explicitBackend);
  }

  {
    let threw = false;
    let message = "";
    try {
      createMono03({});
    } catch (e) {
      threw = true;
      message = e.message;
    }
    check("T03-34a. createMono03({}) sans persistenceBackend -> échec IMMÉDIAT et explicite (fail-closed dès la construction)", threw && /persistenceBackend est obligatoire/i.test(message), message);

    let threwNoArg = false;
    try {
      createMono03();
    } catch (e) {
      threwNoArg = true;
    }
    check("T03-34b. createMono03() sans aucun argument -> échec également", threwNoArg);
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
