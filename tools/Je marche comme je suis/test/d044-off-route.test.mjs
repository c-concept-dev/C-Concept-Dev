import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readFileSync as read } from "node:fs";

function load(file, key) {
  const context = { globalThis: {}, console };
  context.globalThis = context;
  runInNewContext(read(file, "utf8"), context);
  return context[key];
}

const { createOffRouteMonitor } = load(new URL("../src/core/off-route-core.js", import.meta.url), "JMMJSOffRouteCore");

test("D-044 confirme une sortie de trace seulement après 20 secondes fiables", () => {
  const monitor = createOffRouteMonitor();
  assert.equal(monitor.update({ deviationMeters: 70, accuracyMeters: 20, timestamp: 1000 }).status, "confirming");
  assert.equal(monitor.update({ deviationMeters: 70, accuracyMeters: 20, timestamp: 20999 }).alert, false);
  const result = monitor.update({ deviationMeters: 70, accuracyMeters: 20, timestamp: 21000 });
  assert.equal(result.status, "off_route");
  assert.equal(result.alert, true);
});

test("D-044 ne déclenche pas avec un GPS imprécis ou une mesure isolée", () => {
  const monitor = createOffRouteMonitor();
  assert.equal(monitor.update({ deviationMeters: 100, accuracyMeters: 60, timestamp: 0 }).status, "gps_uncertain");
  monitor.update({ deviationMeters: 70, accuracyMeters: 20, timestamp: 1000 });
  assert.equal(monitor.update({ deviationMeters: 20, accuracyMeters: 20, timestamp: 5000 }).status, "on_route");
  assert.equal(monitor.update({ deviationMeters: 70, accuracyMeters: 20, timestamp: 25000 }).alert, false);
});

test("D-044 permet d'ignorer l'alerte pendant dix minutes", () => {
  const monitor = createOffRouteMonitor();
  monitor.update({ deviationMeters: 70, accuracyMeters: 20, timestamp: 0 });
  monitor.update({ deviationMeters: 70, accuracyMeters: 20, timestamp: 20000 });
  monitor.ignore(20000);
  const result = monitor.update({ deviationMeters: 90, accuracyMeters: 10, timestamp: 20001 });
  assert.equal(result.status, "ignored");
  assert.ok(result.remainingIgnoreMs > 599000);
});
