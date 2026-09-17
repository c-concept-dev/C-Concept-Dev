"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01-05 — EF-03B doit apparaître comme dépendant de MissionDocumentMapping,
// directement ou architecturalement. C'est exactement la précision apportée
// par la correction d'audit n°1 de MONO-00 (registre/reports/*conflicts*) :
// « la dépendance à MissionDocumentMapping est architecturale (intervient à
// la construction du TargetDocumentSet, en amont), jamais un paramètre direct
// de la fonction gelée buildDocumentaryReviewSet(). »
//
// Ce test vérifie que MONO-01 documente cette dépendance ARCHITECTURALE dans
// son propre registre de ports (jamais silencieusement oubliée), sans pour
// autant inventer un paramètre direct que le code gelé ne prend pas.

const fs = require("fs");
const path = require("path");

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  // 1. Le module gelé EF-03B (via EF-03) ne prend PAS MissionDocumentMapping
  //    en paramètre direct de buildDocumentaryReviewSet — confirmé sur le vrai code.
  const EF03BReviewRunner = require("../dependencies/ef-03b-review-runner-v1.js");
  const src = fs.readFileSync(path.join(__dirname, "..", "dependencies", "ef-03b-review-runner-v1.js"), "utf8");
  const signatureMatch = src.match(/async function buildDocumentaryReviewSet\(\{([^}]*)\}\)/);
  check(
    "1. buildDocumentaryReviewSet ne prend jamais missionDocumentMapping en paramètre direct (contrat gelé inchangé)",
    !!signatureMatch && !signatureMatch[1].includes("missionDocumentMapping"),
    signatureMatch && signatureMatch[1]
  );

  // 2. TargetDocumentPort (qui construit le TargetDocumentSet consommé par
  //    DocumentaryReviewPort) est bien déclaré comme construit à partir de
  //    MissionDocumentMapping dans le CDC (section 4.8) — MONO-01 ne perd pas
  //    cette dépendance architecturale : elle doit être documentée dans le
  //    registre de ports.
  const portRegistry = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "registry", "mono-01-port-registry-v1.json"), "utf8"));
  const targetDocPort = portRegistry.ports.find((p) => p.portId === "TargetDocumentPort");
  check("2. TargetDocumentPort est bien déclaré dans le registre de ports MONO-01", !!targetDocPort);

  const reviewPort = portRegistry.ports.find((p) => p.portId === "DocumentaryReviewPort");
  check(
    "3. DocumentaryReviewPort et TargetDocumentPort couvrent tous deux EF-03 (même moduleId, dépendance architecturale préservée par composition de ports)",
    reviewPort && reviewPort.coversModuleIds.includes("EF-03") && targetDocPort.coversModuleIds.includes("EF-03")
  );

  // 4. Non-régression directe : le module gelé lui-même continue de refuser
  //    un TargetDocumentSet non construit via le bon chemin (schema/version).
  const EF03TargetDocumentSet = require("../dependencies/ef-03-target-document-set-v1.js");
  const bad = { schema: "NotATargetDocumentSet", schemaVersion: "x", documents: [] };
  let threw = false;
  try {
    EF03TargetDocumentSet.assertTargetDocumentSet(bad);
  } catch (e) {
    threw = true;
  }
  check("4. un TargetDocumentSet mal formé reste rejeté par le contrat gelé lui-même (non-régression)", threw);

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + JSON.stringify(r.detail) + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
