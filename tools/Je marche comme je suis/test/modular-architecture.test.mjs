import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function load(path, context) {
  vm.runInNewContext(read(path), context, { filename: path });
}

function moduleContext() {
  const context = { console, globalThis: null };
  context.globalThis = context;
  load("src/core/peripheral-registry.js", context);
  load("src/peripherals/service-client.js", context);
  load("src/peripherals/ors-provider.js", context);
  load("src/peripherals/geoapify-provider.js", context);
  return context;
}

test("the generated HTML embeds every source module", () => {
  const html = read("je-marche-comme-je-suis-p0.html");
  assert.match(
    html,
    /^<!-- FICHIER GENERE : modifier le gabarit ou src\//,
    "le livrable public doit être explicitement identifié comme généré",
  );
  for (const source of [
    "src/core/route-engine-core.js",
    "src/core/peripheral-registry.js",
    "src/peripherals/service-client.js",
    "src/peripherals/ors-provider.js",
    "src/peripherals/geoapify-provider.js",
    "src/app.js",
  ]) {
    assert.ok(html.includes(read(source).trim()), `${source} absent du build`);
  }
});

test("the obsolete parallel monolith is retired", () => {
  const obsoletePrototype = new URL(
    "../je-marche-comme-je-suis/index.html",
    root,
  );
  assert.equal(
    existsSync(obsoletePrototype),
    false,
    "l'ancien prototype parallèle ne doit plus cohabiter avec l'application modulaire",
  );
});

test("the registry rejects a routing peripheral without its contract", () => {
  const { createPeripheralRegistry } = moduleContext().JMMJSPeripheralRegistry;
  const registry = createPeripheralRegistry();
  assert.throws(
    () => registry.register({ id: "incomplet", kind: "routing" }),
    /createRoundTrips/,
  );
});

test("the ORS peripheral sends only compiled routing options", async () => {
  const context = moduleContext();
  let call;
  const provider = context.JMMJSORSProvider.createORSProvider({
    client: {
      async post(...args) {
        call = args;
        return { routes: [{ type: "Feature" }] };
      },
    },
  });
  const registry = context.JMMJSPeripheralRegistry.createPeripheralRegistry();
  registry.register(provider);

  const routes = await registry.require("ors").createRoundTrips({
    coordinate: [1.44, 43.6],
    targetMeters: 2500,
    count: 6,
    compiled: {
      routing: {
        profile: "foot-walking",
        avoidFeatures: ["steps"],
        weightings: { green: 0.5 },
        restrictions: {},
      },
    },
  });

  assert.equal(routes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(call)), [
    "ors",
    "/ors/round-trips",
    {
      coordinate: [1.44, 43.6],
      targetMeters: 2500,
      profile: "foot-walking",
      avoidFeatures: ["steps"],
      weightings: { green: 0.5 },
      restrictions: {},
    },
    6,
  ]);
});

test("the service client preserves a structured Worker error", async () => {
  const context = moduleContext();
  const client = context.JMMJSServiceClient.createServiceClient({
    baseUrl: "https://example.test/v1",
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      async json() {
        return { error: { message: "ORS indisponible" } };
      },
    }),
  });
  await assert.rejects(
    () => client.post("ors", "/ors/round-trips", {}),
    /ORS indisponible/,
  );
});

test("the Geoapify peripheral keeps only documented POIs near the route", async () => {
  const context = moduleContext();
  const provider = context.JMMJSGeoapifyProvider.createGeoapifyProvider({
    client: {
      async post() {
        return {
          features: [
            {
              geometry: { coordinates: [1.4401, 43.6001] },
              properties: {
                place_id: "bench-near",
                name: "Banc du canal",
                categories: ["amenity.bench"],
              },
            },
            {
              geometry: { coordinates: [1.5, 43.7] },
              properties: {
                place_id: "far-away",
                categories: ["amenity.toilet"],
              },
            },
          ],
        };
      },
    },
    nearestRouteDistance(point) {
      return point[0] < 1.45 ? 12 : 500;
    },
  });
  const registry = context.JMMJSPeripheralRegistry.createPeripheralRegistry();
  registry.register(provider);
  const pois = await registry.require("geoapify").enrich({
    route: {
      coords: [
        [1.44, 43.6],
        [1.45, 43.61],
      ],
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(pois)), [
    {
      id: "bench-near",
      type: "Banc",
      name: "Banc du canal",
      distance: 12,
      lon: 1.4401,
      lat: 43.6001,
      accessibility: "unknown",
    },
  ]);
});
