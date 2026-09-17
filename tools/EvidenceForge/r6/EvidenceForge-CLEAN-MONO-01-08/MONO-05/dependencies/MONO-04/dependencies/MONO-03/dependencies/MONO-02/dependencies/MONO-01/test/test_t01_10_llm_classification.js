"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");
const { NONE, DIRECT, INDIRECT } = require("../ports/external-execution-port.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const p = mono01.externalExecutionPort;

  // EF-ORCH LLM = INDIRECT_UPSTREAM (par sous-étape EF-01B/EF-01C1 ; EF-01C2 = NONE)
  check("1a. EF-ORCH/EF-01B/llm -> INDIRECT_UPSTREAM", p.classify("EF-ORCH", "llm", "EF-01B").classification === INDIRECT);
  check("1b. EF-ORCH/EF-01C1/llm -> INDIRECT_UPSTREAM", p.classify("EF-ORCH", "llm", "EF-01C1").classification === INDIRECT);
  check("1c. EF-ORCH/EF-01C2/llm -> NONE (appels réseau directs, pas de LLM)", p.classify("EF-ORCH", "llm", "EF-01C2").classification === NONE);
  check("1d. EF-ORCH/llm SANS subModuleId -> refus de deviner une moyenne (SUBMODULE_REQUIRED)", p.classify("EF-ORCH", "llm").error === "SUBMODULE_REQUIRED");

  // EF-02D : LLM = DIRECT_RUNTIME (mode exact de la baseline)
  check("2. EF-02D/llm -> DIRECT_RUNTIME", p.classify("EF-02D", "llm").classification === DIRECT);

  // EF-03B : LLM = DIRECT_RUNTIME (obligatoire)
  check("3. EF-03/EF-03B/llm -> DIRECT_RUNTIME", p.classify("EF-03", "llm", "EF-03B").classification === DIRECT);

  // EF-03D : aucune dépendance LLM
  check("4. EF-03/EF-03D/llm -> NONE", p.classify("EF-03", "llm", "EF-03D").classification === NONE);

  // EF-04 : Lineage Guard sans LLM
  check("5. EF-04/llm -> NONE (Lineage Guard entièrement déterministe)", p.classify("EF-04", "llm").classification === NONE);

  // Réseau : EF-ORCH/EF-01C2 -> DIRECT_RUNTIME sur OpenAlex/Crossref/PubMed
  check("6. EF-ORCH/EF-01C2/network -> DIRECT_RUNTIME", p.classify("EF-ORCH", "network", "EF-01C2").classification === DIRECT);

  // Module inconnu -> erreur explicite, jamais une classification inventée.
  check("7. module absent du registre -> MODULE_NOT_IN_BASELINE, jamais une classification devinée", p.classify("EF-99", "llm").error === "MODULE_NOT_IN_BASELINE");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
