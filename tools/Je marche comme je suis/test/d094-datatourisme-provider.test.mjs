import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadProvider() {
  const source = readFileSync(
    new URL("../src/peripherals/datatourisme-provider.js", import.meta.url),
    "utf8",
  );
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.JMMJSDatatourismeProvider;
}

function makeRoute() {
  return { coords: [[1, 43], [1.001, 43.001], [1.002, 43.0005]] };
}

test("D094 datatourismeProvider appelle bien /datatourisme/places avec route/radius/limit", async () => {
  const calls = [];
  const client = {
    async post(service, path, body) {
      calls.push({ service, path, body });
      return { items: [] };
    },
  };
  const nearestRouteDistance = () => 50;
  const provider = loadProvider().createDatatourismeProvider({ client, nearestRouteDistance });
  await provider.enrich({ route: makeRoute(), radiusMeters: 250, limit: 10 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/datatourisme/places");
  assert.equal(calls[0].body.radiusMeters, 250);
  assert.equal(calls[0].body.limit, 10);
});

test("D094 datatourismeProvider extrait le nom depuis un label chaîne simple", async () => {
  const client = {
    async post() {
      return {
        items: [
          {
            uuid: "abc",
            label: "Chapelle Saint-Roch",
            type: ["https://www.datatourisme.fr/ontology/core#ReligiousSite"],
            isLocatedAt: { geo: { "schema:latitude": 43.0005, "schema:longitude": 1.0015 } },
          },
        ],
      };
    },
  };
  const provider = loadProvider().createDatatourismeProvider({
    client,
    nearestRouteDistance: () => 40,
  });
  const results = await provider.enrich({ route: makeRoute(), radiusMeters: 300 });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Chapelle Saint-Roch");
  assert.equal(results[0].type, "Patrimoine");
});

test("D094 datatourismeProvider extrait le nom depuis un label multilingue objet", async () => {
  const client = {
    async post() {
      return {
        items: [
          {
            uuid: "def",
            label: { fr: "Point de vue du Cirque", en: "Cirque viewpoint" },
            type: ["...#Viewpoint"],
            isLocatedAt: { geo: { latitude: 43.0007, longitude: 1.0018 } },
          },
        ],
      };
    },
  };
  const provider = loadProvider().createDatatourismeProvider({
    client,
    nearestRouteDistance: () => 60,
  });
  const results = await provider.enrich({ route: makeRoute(), radiusMeters: 300 });
  assert.equal(results[0].name, "Point de vue du Cirque");
  assert.equal(results[0].type, "Point de vue");
});

test("D094 datatourismeProvider écarte les lieux sans coordonnées exploitables", async () => {
  const client = {
    async post() {
      return {
        items: [
          { uuid: "no-geo", label: "Lieu sans position", type: [], isLocatedAt: {} },
        ],
      };
    },
  };
  const provider = loadProvider().createDatatourismeProvider({
    client,
    nearestRouteDistance: () => 10,
  });
  const results = await provider.enrich({ route: makeRoute(), radiusMeters: 300 });
  assert.equal(results.length, 0);
});

test("D094 datatourismeProvider écarte les lieux hors du rayon demandé", async () => {
  const client = {
    async post() {
      return {
        items: [
          {
            uuid: "far",
            label: "Trop loin",
            type: [],
            isLocatedAt: { geo: { latitude: 43.0005, longitude: 1.0015 } },
          },
        ],
      };
    },
  };
  const provider = loadProvider().createDatatourismeProvider({
    client,
    nearestRouteDistance: () => 5000,
  });
  const results = await provider.enrich({ route: makeRoute(), radiusMeters: 300 });
  assert.equal(results.length, 0);
});

test("D094 datatourismeProvider retombe sur Curiosité locale pour un type non reconnu", async () => {
  const client = {
    async post() {
      return {
        items: [
          {
            uuid: "unk",
            label: "Mystère",
            type: ["...#SomethingUnmapped"],
            isLocatedAt: { geo: { latitude: 43.0002, longitude: 1.0005 } },
          },
        ],
      };
    },
  };
  const provider = loadProvider().createDatatourismeProvider({
    client,
    nearestRouteDistance: () => 20,
  });
  const results = await provider.enrich({ route: makeRoute(), radiusMeters: 300 });
  assert.equal(results[0].type, "Curiosité locale");
});

test("D095 datatourismeProvider simplifie une trace de plus de 80 points avant envoi", async () => {
  const longRoute = {
    coords: Array.from({ length: 250 }, (_, i) => [1 + i * 0.0001, 43 + i * 0.0001]),
  };
  const calls = [];
  const client = {
    async post(service, path, body) {
      calls.push(body);
      return { items: [] };
    },
  };
  const provider = loadProvider().createDatatourismeProvider({
    client,
    nearestRouteDistance: () => 50,
  });
  await provider.enrich({ route: longRoute, radiusMeters: 300 });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].route.length <= 80, `attendu ≤80 points, obtenu ${calls[0].route.length}`);
});

test("D095 datatourismeProvider n'altère pas une trace déjà courte", async () => {
  const shortRoute = { coords: [[1, 43], [1.001, 43.001], [1.002, 43.0005]] };
  const calls = [];
  const client = {
    async post(service, path, body) {
      calls.push(body);
      return { items: [] };
    },
  };
  const provider = loadProvider().createDatatourismeProvider({
    client,
    nearestRouteDistance: () => 50,
  });
  await provider.enrich({ route: shortRoute, radiusMeters: 300 });
  assert.equal(calls[0].route.length, 3);
});
