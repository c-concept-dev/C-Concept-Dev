"use strict";
const { createBaselinePort } = require("../lib/baseline-port.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01-01 — MONO-01 refuse de fonctionner sans un registre MONO-00 valide.

{
  let threw = false, msg = "";
  try {
    createBaselinePort({ schema: "NotAFrozenBaselineRegistry", schemaVersion: "x", modules: [] });
  } catch (e) {
    threw = true;
    msg = e.message;
  }
  check("1. schema de registre incorrect -> refus de démarrer", threw, msg);
}

{
  let threw = false, msg = "";
  try {
    createBaselinePort({ schema: "EvidenceForge.FrozenBaselineRegistry", schemaVersion: "MONO-99-v9", modules: [{ moduleId: "X" }] });
  } catch (e) {
    threw = true;
    msg = e.message;
  }
  check("2. schemaVersion de registre incorrecte -> refus de démarrer", threw, msg);
}

{
  let threw = false;
  try {
    createBaselinePort({ schema: "EvidenceForge.FrozenBaselineRegistry", schemaVersion: "MONO-00-v1", modules: [] });
  } catch (e) {
    threw = true;
  }
  check("3. registre sans aucun module déclaré -> refus de démarrer", threw);
}

{
  const bp = createBaselinePort({
    schema: "EvidenceForge.FrozenBaselineRegistry",
    schemaVersion: "MONO-00-v1",
    modules: [{ moduleId: "EF-TEST", canonicalVersion: "v1" }],
  });
  check("4. registre minimal valide -> démarrage accepté", bp.hasModule("EF-TEST") === true);
}

const path = require("path");
const REGISTRY_PATH = path.join(__dirname, "..", "registry", "mono-00-frozen-baseline-registry-v1.json");
{
  const bp = createBaselinePort(REGISTRY_PATH);
  check("5. registre MONO-00 réel du kit de migration -> chargé sans erreur", bp.hasModule("EF-04") === true);
}

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
if (failed.length) {
  console.log("\nECHECS : " + failed.length);
  process.exit(1);
} else {
  console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
}
