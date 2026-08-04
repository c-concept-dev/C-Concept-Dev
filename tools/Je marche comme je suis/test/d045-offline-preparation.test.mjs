import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const code = readFileSync(new URL("../src/core/offline-preparation-core.js", import.meta.url), "utf8");
const sandbox = { globalThis: {} };
runInNewContext(code, sandbox);
const core = sandbox.globalThis.JMMJSOfflinePreparationCore;

test("D-045 prépare une trace exacte et distingue les états hors connexion", () => {
  const snapshot = core.prepareOfflineSnapshot({
    name: "Boucle test",
    coords: [[1.1, 43.1], [1.2, 43.2], [1.1, 43.1]],
    steps: [{ title: "Départ", instruction: "Continuer" }],
    weather: { retrievedAt: "2026-08-04T10:00:00Z" },
    pois: [{ name: "Eau", type: "eau", essential: true }],
  });
  assert.equal(snapshot.route.coords.length, 3);
  assert.equal(snapshot.availability.trace, "available");
  assert.equal(snapshot.availability.weather, "dated");
  assert.equal(snapshot.availability.newRouteCalculation, "not-guaranteed");
  assert.equal(snapshot.route.essentialPois.length, 1);
});

test("D-045 enregistre et efface la préparation locale", () => {
  const map = new Map();
  const storage = { setItem: (k, v) => map.set(k, v), getItem: (k) => map.get(k) || null, removeItem: (k) => map.delete(k) };
  const snapshot = core.prepareOfflineSnapshot({ coords: [[1, 43], [1.01, 43.01]] });
  core.saveOfflineSnapshot(storage, snapshot);
  assert.equal(core.loadOfflineSnapshot(storage).route.coords.length, 2);
  core.clearOfflineSnapshot(storage);
  assert.equal(core.loadOfflineSnapshot(storage), null);
});
