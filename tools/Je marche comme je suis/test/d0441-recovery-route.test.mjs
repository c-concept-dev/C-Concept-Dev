import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readFileSync as read } from "node:fs";

function load(file, key) {
  const context = { globalThis: {}, console };
  context.globalThis = context;
  runInNewContext(read(file, "utf8"), context);
  return context[key];
}

const core = load(new URL("../src/core/recovery-route-core.js", import.meta.url), "JMMJSRecoveryRouteCore");

test("D-044.1 construit une demande distincte vers la trace", () => {
  const request = core.createRecoveryRequest({
    current: [1.9, 43.6],
    target: [1.91, 43.61],
    mode: core.MODES.TRACE,
    profile: "foot-walking",
  });
  assert.equal(request.mode, "trace");
  assert.deepEqual([...request.current], [1.9, 43.6]);
});

test("D-044.1 normalise une liaison sans remplacer la boucle", () => {
  const request = core.createRecoveryRequest({
    current: [1.9, 43.6], target: [1.91, 43.61], mode: "trace",
  });
  const route = core.normalizeRecoveryRoute({
    route: {
      coordinates: [[1.9, 43.6], [1.905, 43.605], [1.91, 43.61]],
      distance: 1200,
      duration: 900,
    },
  }, request);
  assert.equal(route.kind, "recovery_link");
  assert.equal(route.replacesOriginalRoute, false);
  assert.equal(route.distanceMeters, 1200);
});

test("D-044.1 refuse une géométrie qui ne rejoint pas la cible", () => {
  const request = core.createRecoveryRequest({
    current: [1.9, 43.6], target: [1.91, 43.61], mode: "start",
  });
  assert.throws(() => core.normalizeRecoveryRoute({ coordinates: [[1.9, 43.6], [2.1, 44]] }, request));
});
