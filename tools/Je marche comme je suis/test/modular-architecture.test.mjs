import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  load("src/peripherals/geoapify-provider.js", "src/peripherals/open-meteo-provider.js", context);
  return context;
}

test("the generated HTML embeds every source module", () => {
  const html = read("je-marche-comme-je-suis-p0.html");
  for (const source of [
    "src/core/route-engine-core.js",
    "src/core/gpx-core.js",
    "src/core/peripheral-registry.js",
    "src/peripherals/service-client.js",
    "src/peripherals/ors-provider.js",
    "src/peripherals/geoapify-provider.js", "src/peripherals/open-meteo-provider.js",
    "src/app.js",
  ]) {
    assert.ok(html.includes(read(source).trim()), `${source} absent du build`);
  }
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
      count: 3,
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

test("D-013 never restores the exact-route dead end", () => {
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(
    app,
    /Aucun parcours exact ne respecte toutes les contraintes impératives/,
  );
  assert.doesNotMatch(app, /\[\.\.\.exact\]/);
  assert.match(app, /const selectionPool = substantial\.length \? substantial : pool/);
});


test("D-015 retries progressively shorter ORS targets before adaptations", () => {
  const app = read("src/app.js");
  assert.match(app, /targetFactors = \[1, 0\.78, 0\.58, 0\.4\]/);
  assert.match(app, /for \(let batchIndex = 0; batchIndex < targetFactors\.length/);
  assert.match(app, /diverseRoutes\(acceptable, 3\)\.length >= 3/);
  assert.match(app, /respectsTime\(route\)/);
});

test("step durations are rendered without raw decimal minutes", () => {
  const app = read("src/app.js");
  assert.match(app, /function formatStepDuration/);
  assert.match(app, /formatStepDuration\(s\.durationMinutes\)/);
  assert.doesNotMatch(app, /\(s\.durationMinutes \?\? "\?"\) \+/);
});

test("D-016 selects profiles by duration bands and keeps micro-walks separate", () => {
  const app = read("src/app.js");
  assert.match(app, /selectProfile\("confortable", "La plus confortable", 0\.45, 0\.7/);
  assert.match(app, /selectProfile\("agréable", "L’agréable", 0\.75, 1/);
  assert.match(app, /selectProfile\("tonique", "La plus tonique", 0\.6, 0\.95/);
  assert.match(app, /ratio\(route\) < 0\.4/);
  assert.match(app, /orientation: "très courte"/);
  assert.match(app, /const substantial = pool\.filter\(\(route\) => ratio\(route\) >= 0\.4\)/);
});


test("D-017 caps ORS generation at twelve requests and uses batches of three", () => {
  const app = read("src/app.js");
  const provider = read("src/peripherals/ors-provider.js");
  assert.match(app, /targetFactors = \[1, 0\.78, 0\.58, 0\.4\]/);
  assert.match(app, /count: 3/);
  assert.match(provider, /Math\.min\(3, Math\.round\(count\)\)/);
  assert.doesNotMatch(app, /calcul et analyse de 6 boucles candidates/);
});

test("D-017 handles ORS retry-after without a blind retry storm", () => {
  const app = read("src/app.js");
  const client = read("src/peripherals/service-client.js");
  assert.match(app, /function retryDelay/);
  assert.match(app, /await wait\(1200\)/);
  assert.match(app, /OpenRouteService demande une pause/);
  assert.match(client, /retryAfterSeconds/);
});


test("D-018 retire les scores fixes et affiche des faits auditables", () => {
  const app = read("src/app.js");
  const template = read("je-marche-comme-je-suis.template.html");
  assert.doesNotMatch(app, /Compat\. \D*metricLabel\(r\.compatibility\)/);
  assert.doesNotMatch(app, /Plaisir \D*metricLabel\(r\.pleasure\)/);
  assert.doesNotMatch(app, /Confiance \D*metricLabel\(r\.confidence\)/);
  assert.match(app, /routeAuditFacts/);
  assert.match(app, /élément.*à vérifier/);
  assert.match(app, /whyThisRoute/);
  assert.match(template, /leaflet-control-layers-toggle::after/);
  assert.doesNotMatch(template, /\.scores\{display:flex/);
});

test("D-019 exige une diversité géométrique réelle avant de remplir trois cartes", () => {
  const app = read("src/app.js");
  assert.match(app, /function routeGeometricOverlap/);
  assert.match(app, /function routesAreDistinct/);
  assert.match(app, /maximumOverlap = 0\.72/);
  assert.match(app, /diverseRoutes\(acceptable, 3\)\.length >= 3/);
  assert.match(app, /picks\.every\(\(pick\) => routesAreDistinct\(route, pick\.route\)\)/);
  assert.match(app, /géométrie\(s\) suffisamment différente\(s\)/);
});


test("D-020 affiche une synthèse éditable avant tout appel ORS", () => {
  const app = read("src/app.js");
  const template = read("je-marche-comme-je-suis.template.html");
  assert.match(template, /id="constraintSummary"/);
  assert.match(template, /Confirmer et calculer/);
  assert.match(app, /function constraintSummaryModel/);
  assert.match(app, /function renderConstraintSummary/);
  assert.match(app, /Contraintes impératives/);
  assert.match(app, /Préférences prudentes et envies/);
  assert.match(app, /Préparation et contrôles/);
  assert.match(app, /data-edit-step/);
  assert.match(app, /if \(S\.step === 3\) renderConstraintSummary\(\)/);
});

test("D-021 couvre chaque champ et chaque choix visible par le registre", async () => {
  const { buildFieldAudit } = await import("../scripts/audit-fields.mjs");
  const audit = buildFieldAudit();
  assert.equal(audit.structuralCoverage.passed, true);
  assert.deepEqual(audit.structuralCoverage.orphanFields, []);
  assert.deepEqual(audit.structuralCoverage.orphanChoices, []);
  assert.ok(audit.counts.visibleFields >= 30);
  assert.ok(audit.counts.visibleChoices >= 50);
});

test("D-021 distingue couverture structurelle et réalisation fonctionnelle", async () => {
  const { buildFieldAudit } = await import("../scripts/audit-fields.mjs");
  const audit = buildFieldAudit();
  const services = audit.rows.find((row) => row.id === "services");
  const weather = audit.rows.find((row) => row.id === "weather");
  const duration = audit.rows.find((row) => row.id === "duration");
  assert.equal(services.status, "partial");
  assert.equal(weather.status, "partial");
  assert.equal(duration.status, "complete");
});

test("D-022 intègre le noyau GPX au build autonome", () => {
  const html = read("je-marche-comme-je-suis-p0.html");
  const gpxCore = read("src/core/gpx-core.js");
  assert.ok(html.includes(gpxCore.trim()));
  const app = read("src/app.js");
  assert.match(app, /parseGPXText/);
  assert.match(app, /auditedGPXCandidate/);
  assert.match(app, /auditRoute\(/);
  assert.match(app, /Distance recalculée/);
  assert.match(app, /surfaces, marches, largeur et exposition non fournies par le GPX restent invérifiables/);
});
