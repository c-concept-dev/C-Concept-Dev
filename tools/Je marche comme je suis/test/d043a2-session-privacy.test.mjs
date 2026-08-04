import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/core/session-privacy-core.js", import.meta.url),
  "utf8",
);
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
const controller =
  context.JMMJSSessionPrivacyCore.createSessionPrivacyController({
    storage,
    now: () => new Date("2026-08-04T08:00:00.000Z"),
  });

const sanitized = controller.prepareProviderPayload("ors", "/ors/round-trips", {
  coordinate: [1.4, 43.6],
  targetMeters: 3000,
  person: { age: 56 },
  dailyState: { painDetail: "cheville" },
  functionalLimitation: { trigger: "descente" },
  freeText: "douleur à la tête",
  profile: "foot-walking",
});

assert.deepEqual(sanitized.coordinate, [1.4, 43.6]);
assert.equal(sanitized.profile, "foot-walking");
assert.equal("person" in sanitized, false);
assert.equal("dailyState" in sanitized, false);
assert.equal("functionalLimitation" in sanitized, false);
assert.equal("freeText" in sanitized, false);

const summary = controller.summary();
assert.equal(summary.transmissionCount, 1);
assert.equal(summary.coordinatesSent, true);
assert.equal(summary.healthDataSent, false);
assert.equal(summary.transmissions[0].service, "ors");
assert.equal(values.has(context.JMMJSSessionPrivacyCore.SESSION_KEY), true);

assert.equal(controller.clearSession(), true);
assert.equal(controller.summary().transmissionCount, 0);
assert.equal(values.has(context.JMMJSSessionPrivacyCore.SESSION_KEY), false);
