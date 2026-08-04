import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/core/daylight-return-core.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const { assessDaylight } = context.globalThis.JMMJSDaylightReturnCore;

test("D-053 calcule localement le retour et la marge avant la nuit", () => {
  const result = assessDaylight({ latitude: 43.6, longitude: 1.44, departureAt: "2026-08-04T18:00:00+02:00", durationMinutes: 120 });
  assert.equal(result.status, "calculated");
  assert.match(result.source, /local/);
  assert.ok(Number.isFinite(result.marginMinutes));
  assert.equal(result.returnAt, "2026-08-04T18:00:00.000Z");
});

test("D-053 classe les marges sans produire de garantie", () => {
  const result = assessDaylight({ latitude: 43.6, longitude: 1.44, departureAt: "2026-12-21T16:00:00+01:00", durationMinutes: 180 });
  assert.equal(result.level, "critical");
  assert.match(result.warning, /pas une garantie/);
});

test("D-053 conserve inconnu lorsque les entrées sont insuffisantes", () => {
  assert.equal(assessDaylight({ latitude: null, longitude: 1.44, departureAt: null, durationMinutes: 60 }).status, "unknown");
});
