import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import fs from "node:fs";

const context = { globalThis: {} };
runInNewContext(fs.readFileSync(new URL("../src/core/ign-elevation-core.js", import.meta.url), "utf8"), context);
const core = context.globalThis.JMMJSIgnElevationCore;

test("D-046 compare ORS et IGN avec seuil absolu ou relatif", () => {
  const close = core.compareElevation({ orsAscentMeters: 112, ignAscentMeters: 126 });
  assert.equal(close.divergent, false);
  const far = core.compareElevation({ orsAscentMeters: 100, ignAscentMeters: 130 });
  assert.equal(far.divergent, true);
  assert.equal(far.status, "conflicting");
});

test("D-046 conserve IGN comme contrôle complémentaire", () => {
  const route = { ascent: 112, warnings: [], sources: ["ORS"] };
  const result = core.applyIgnElevationControl(route, { ascentMeters: 126, source: "IGN Géoplateforme" });
  assert.equal(result.ascent, 112);
  assert.equal(result.ignElevation.role, "Contrôle complémentaire uniquement");
  assert.ok(result.sources.includes("IGN Géoplateforme"));
});

test("D-046 rend le contrôle indisponible sans invalider la route", () => {
  const route = { id: "r1", ascent: 50 };
  const result = core.markIgnUnavailable(route, "IGN indisponible");
  assert.equal(result.id, "r1");
  assert.equal(result.ignElevation.status, "unavailable");
});
