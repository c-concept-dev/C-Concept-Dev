"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01-18 — Chaque module déclaré dans MONO-00 doit être soit coveredByPort,
// soit explicitlyNotApplicable. Aucun module silencieusement absent.

const root = path.join(__dirname, "..");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "registry", "mono-00-frozen-baseline-registry-v1.json"), "utf8"));
const portRegistry = JSON.parse(fs.readFileSync(path.join(root, "registry", "mono-01-port-registry-v1.json"), "utf8"));

const baselineModuleIds = baseline.modules.map((m) => m.moduleId);
const coverage = portRegistry.moduleCoverage;

check("1. moduleCoverage existe dans le registre de ports", !!coverage);

const uncovered = [];
for (const moduleId of baselineModuleIds) {
  const entry = coverage[moduleId];
  const isCovered = entry && Array.isArray(entry.coveredByPort) && entry.coveredByPort.length > 0;
  const isExplicitlyNotApplicable = entry && entry.explicitlyNotApplicable === true;
  if (!isCovered && !isExplicitlyNotApplicable) uncovered.push(moduleId);
}
check(
  "2. tout module de la baseline MONO-00 est soit coveredByPort, soit explicitlyNotApplicable — aucun absent silencieusement",
  uncovered.length === 0,
  JSON.stringify(uncovered)
);

check(
  "3. " + baselineModuleIds.length + " modules baseline recensés dans moduleCoverage (aucun oublié par simple absence de clé)",
  baselineModuleIds.every((id) => id in coverage),
  JSON.stringify(baselineModuleIds.filter((id) => !(id in coverage)))
);

// Chaque port référencé dans coveredByPort doit exister réellement dans la liste `ports`.
const declaredPortIds = new Set(portRegistry.ports.map((p) => p.portId));
const danglingRefs = [];
for (const [moduleId, entry] of Object.entries(coverage)) {
  for (const portId of entry.coveredByPort || []) {
    if (!declaredPortIds.has(portId)) danglingRefs.push({ moduleId, portId });
  }
}
check("4. aucune référence de port fantôme dans moduleCoverage (tous les portId cités existent dans `ports`)", danglingRefs.length === 0, JSON.stringify(danglingRefs));

// EF-02A/B/C sont bien couverts et désormais BOUND via ExternalStageAdapter
// (décision d'architecture tranchée) — plus de PENDING_DECISION.
for (const m of ["EF-02A", "EF-02B", "EF-02C"]) {
  check(
    `5. ${m} est coveredByPort ET bindingStatus=BOUND (décision d'architecture tranchée : ExternalStageAdapter)`,
    coverage[m] && coverage[m].coveredByPort.includes("ProfessionalPipelinePort") && coverage[m].bindingStatus === "BOUND"
  );
}

const ppPort = portRegistry.ports.find((p) => p.portId === "ProfessionalPipelinePort");
check(
  "5b. le port ProfessionalPipelinePort lui-même est déclaré BOUND avec bindingType=EXTERNAL_STAGE_ADAPTER",
  ppPort && ppPort.bindingStatus === "BOUND" && ppPort.bindingType === "EXTERNAL_STAGE_ADAPTER"
);

// EF-02ABC-SMOKE-REAL est explicitement non applicable, avec une raison.
check(
  "6. EF-02ABC-SMOKE-REAL est explicitlyNotApplicable avec une raison documentée",
  coverage["EF-02ABC-SMOKE-REAL"] && coverage["EF-02ABC-SMOKE-REAL"].explicitlyNotApplicable === true && !!coverage["EF-02ABC-SMOKE-REAL"].reason
);

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
if (failed.length) {
  console.log("\nECHECS : " + failed.length);
  process.exit(1);
} else {
  console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
}
