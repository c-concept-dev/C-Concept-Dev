import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const code = readFileSync(new URL("../src/core/safety-sharing-core.js", import.meta.url), "utf8");
const context = { globalThis: {}, Intl, Date };
vm.runInNewContext(code, context);
const core = context.globalThis.JMMJSSafetySharingCore;
test("D-054 prépare un partage explicite sans suivi en direct", () => {
  const pack = core.buildSafetySharePackage({ name: "Boucle calme", coords: [[1.45, 43.6], [1.46, 43.61]], distance: 4.2, total: 70 }, { returnAt: "2026-08-04T18:42:00+02:00" });
  assert.equal(pack.startCoordinates, "43.600000,1.450000");
  assert.match(pack.preparedMessage, /Je vous confirmerai mon retour/);
  assert.match(pack.preparedMessage, /pas un suivi en direct/);
  assert.equal(pack.emergencyNumber, "112");
});
test("D-054 ne conserve qu'un accusé local de retour", () => {
  const memory = new Map();
  const storage = { setItem: (k, v) => memory.set(k, v), getItem: (k) => memory.get(k) || null, removeItem: (k) => memory.delete(k) };
  core.markReturned(storage, { returnedAt: "2026-08-04T19:00:00Z", routeId: "r1" });
  assert.equal(core.readReturned(storage).routeId, "r1");
  assert.equal(Object.keys(core.readReturned(storage)).includes("contact"), false);
  core.clearReturned(storage);
  assert.equal(core.readReturned(storage), null);
});
