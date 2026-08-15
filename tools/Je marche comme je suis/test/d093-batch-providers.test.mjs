import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context;
}

test("D093 overpassProvider.inspectMany envoie un seul appel groupé avec toutes les traces", async () => {
  const ctx = loadModule("../src/peripherals/overpass-provider.js");
  const calls = [];
  const client = {
    async post(service, path, body) {
      calls.push({ service, path, body });
      return {
        results: body.routes.map(() => ({
          segments: [],
          routeLengthMeters: 1000,
          status: "ok",
        })),
      };
    },
  };
  const provider = ctx.JMMJSOverpassProvider.createOverpassProvider({ client });
  const routes = [
    { coords: [[1, 43], [1.001, 43.001]], distance: 1000 },
    { coords: [[2, 44], [2.001, 44.001]], distance: 2000 },
    { coords: [[3, 45], [3.001, 45.001]], distance: 3000 },
  ];
  const results = await provider.inspectMany({ routes });
  assert.equal(calls.length, 1, "un seul appel réseau attendu pour 3 traces");
  assert.equal(calls[0].path, "/overpass/terrain-batch");
  assert.equal(calls[0].body.routes.length, 3);
  assert.equal(results.length, 3);
});

test("D093 overpassProvider.inspectMany ne fait aucun appel pour une liste vide", async () => {
  const ctx = loadModule("../src/peripherals/overpass-provider.js");
  let called = false;
  const client = { async post() { called = true; return {}; } };
  const provider = ctx.JMMJSOverpassProvider.createOverpassProvider({ client });
  const results = await provider.inspectMany({ routes: [] });
  assert.equal(called, false);
  assert.equal(results.length, 0);
});

test("D093 ignElevationProvider.inspectMany envoie un seul appel groupé avec toutes les traces", async () => {
  const ctx = loadModule("../src/peripherals/ign-elevation-provider.js");
  const calls = [];
  const client = {
    async post(service, path, body) {
      calls.push({ service, path, body });
      return {
        results: body.routes.map(() => ({ ok: true, elevations: [{ lon: 1, lat: 43, z: 150 }] })),
      };
    },
  };
  const provider = ctx.JMMJSIgnElevationProvider.createIgnElevationProvider({ client });
  const routes = [
    { coords: [[1, 43], [1.001, 43.001]], distance: 1000 },
    { coords: [[2, 44], [2.001, 44.001]], distance: 2000 },
  ];
  const results = await provider.inspectMany({ routes });
  assert.equal(calls.length, 1, "un seul appel réseau attendu pour 2 traces");
  assert.equal(calls[0].path, "/ign/elevation-batch");
  assert.equal(calls[0].body.routes.length, 2);
  assert.equal(results.length, 2);
});

test("D093 ignElevationProvider.inspectMany renvoie un tableau vide si le résultat est absent", async () => {
  const ctx = loadModule("../src/peripherals/ign-elevation-provider.js");
  const client = { async post() { return {}; } };
  const provider = ctx.JMMJSIgnElevationProvider.createIgnElevationProvider({ client });
  const results = await provider.inspectMany({
    routes: [{ coords: [[1, 43], [1.001, 43.001]], distance: 1000 }],
  });
  assert.equal(results.length, 0);
});
