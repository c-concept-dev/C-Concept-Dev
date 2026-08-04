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

const core = load(new URL("../src/core/overpass-terrain-core.js", import.meta.url), "JMMJSOverpassTerrainCore");
const providerApi = load(new URL("../src/peripherals/overpass-provider.js", import.meta.url), "JMMJSOverpassProvider");

test("D-043B conserve les absences comme non documentées et calcule les couvertures", () => {
  const result = core.summarizeOverpassTerrain({ segments: [
    { lengthMeters: 600, tags: { surface: "asphalt", smoothness: "good", width: "1.8", foot: "yes" } },
    { lengthMeters: 200, tags: { highway: "steps" } },
    { lengthMeters: 200, tags: {} },
  ] }, { routeLengthMeters: 1000, retrievedAt: 1 });
  assert.equal(result.coverage.surfacePercent, 60);
  assert.equal(result.coverage.smoothnessPercent, 60);
  assert.equal(result.coverage.widthPercent, 60);
  assert.equal(result.stepsDetected, true);
  assert.equal(result.minimumWidthMeters, 1.8);
  assert.match(result.rule, /reste non documentée/);
});

test("D-043B simplifie la trace sans remplacer la géométrie originale", async () => {
  let received;
  const provider = providerApi.createOverpassProvider({ client: { post: async (_service, _path, body) => { received = body; return { segments: [] }; } } });
  const coords = Array.from({ length: 200 }, (_, i) => [1 + i / 10000, 43 + i / 10000]);
  await provider.inspect({ route: { coords, distance: 2500 } });
  assert.equal(received.route.length, 80);
  assert.deepEqual(coords[0], [1, 43]);
  assert.equal(coords.length, 200);
  assert.equal(received.bufferMeters, 25);
});

test("D-043B garde le parcours lorsque Overpass est indisponible", () => {
  const route = core.markOverpassUnavailable({ name: "Boucle", warnings: [] });
  assert.equal(route.name, "Boucle");
  assert.equal(route.overpassTerrain.status, "unavailable");
  assert.match(route.overpassTerrain.rule, /ne prouve ni/);
});
