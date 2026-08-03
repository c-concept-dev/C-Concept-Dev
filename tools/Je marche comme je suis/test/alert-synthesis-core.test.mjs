import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/core/alert-synthesis-core.js", import.meta.url),
  "utf8",
);
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSAlertSynthesisCore;

const warnings = core.dedupeWarnings([
  "Température ressentie prévue jusqu’à 35 °C.",
  "Température ressentie prévue jusqu’à 36 °C.",
  "Rafales prévues jusqu’à 42 km/h.",
  "Rafales prévues jusqu’à 38 km/h.",
]);
assert.equal(warnings.length, 2);
assert.ok(warnings.some((value) => value.includes("36")));
assert.ok(warnings.some((value) => value.includes("42")));

const checks = core.dedupeChecks([
  {
    constraint: "Météo prévue pendant la balade",
    status: "respected",
    evidence: "Prévision complète.",
  },
  {
    constraint: "Météo prévue pendant la balade",
    status: "unknown",
    evidence: "Prévision partielle sur une partie du trajet.",
  },
]);
assert.equal(checks.length, 1);
assert.equal(checks[0].status, "unknown");

const route = core.synthesizeRoutePresentation({
  warnings: [
    "Température ressentie prévue jusqu’à 35 °C.",
    "Température ressentie prévue jusqu’à 36 °C.",
  ],
  unknowns: ["Surface inconnue.", "Surface inconnue."],
  checks: [
    { constraint: "Retour", status: "respected" },
    { constraint: "Retour", status: "respected" },
    { constraint: "Terrain", status: "unknown" },
  ],
});
assert.equal(route.warnings.length, 1);
assert.equal(route.unknowns.length, 1);
assert.equal(route.checks.length, 2);
assert.equal(route.controlSummary.respected, 1);
assert.equal(route.controlSummary.unknown, 1);
