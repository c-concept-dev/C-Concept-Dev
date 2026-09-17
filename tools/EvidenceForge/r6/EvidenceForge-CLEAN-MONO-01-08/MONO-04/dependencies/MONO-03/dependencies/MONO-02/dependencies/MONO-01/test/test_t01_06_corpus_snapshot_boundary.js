"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  const validSnapshot = {
    schema: "EvidenceForge.CorpusSnapshot",
    stage: "EF-01F",
    missionId: "mission-t0106",
    mission: { question: "Question de test ?" },
  };

  const ok = mono01.corpusSnapshotPort.receive(validSnapshot, { missionId: "mission-t0106" });
  check("1. CorpusSnapshot valide -> SUCCESS", ok.status === "SUCCESS", JSON.stringify(ok.diagnostics));
  check("2. la sortie est EXACTEMENT le même objet (passthrough strict, aucune extraction sémantique nouvelle)", ok.output === validSnapshot);

  const badSchema = { schema: "NotACorpusSnapshot", stage: "EF-01F" };
  const bad = mono01.corpusSnapshotPort.receive(badSchema, {});
  check("3. schema incorrect -> BLOCKED / SCHEMA_VERSION_MISMATCH", bad.status === "BLOCKED" && bad.diagnostics.error.code === "SCHEMA_VERSION_MISMATCH", JSON.stringify(bad.diagnostics));

  const missing = mono01.corpusSnapshotPort.receive(undefined, {});
  check("4. CorpusSnapshot absent -> BLOCKED / MISSING_REQUIRED_INPUT", missing.status === "BLOCKED" && missing.diagnostics.error.code === "MISSING_REQUIRED_INPUT");

  // La frontière est bien représentée dans le registre de ports.
  const fs = require("fs");
  const path = require("path");
  const portRegistry = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "registry", "mono-01-port-registry-v1.json"), "utf8"));
  const csPort = portRegistry.ports.find((p) => p.portId === "CorpusSnapshotPort");
  check("5. CorpusSnapshotPort déclaré dans le registre de ports, couvrant EF-ORCH", csPort && csPort.coversModuleIds.includes("EF-ORCH"));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
