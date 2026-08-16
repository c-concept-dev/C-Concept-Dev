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

test("D100C1 les envies cosmétiques prouvées mortes (Bancs, Peu de goudron, Photo) sont retirées du registre", () => {
  const ctx = loadModule("../src/core/route-engine-core.js");
  const { ChoiceRegistry } = ctx.JMMJSRouteEngineCore;
  assert.equal(ChoiceRegistry.wishes["Bancs"], undefined);
  assert.equal(ChoiceRegistry.wishes["Peu de goudron"], undefined);
  assert.equal(ChoiceRegistry.wishes["Photo"], undefined);
});

test("D100C1 les 7 nouvelles envies vérifiables sont enregistrées avec un effet non cosmétique", () => {
  const ctx = loadModule("../src/core/route-engine-core.js");
  const { ChoiceRegistry } = ctx.JMMJSRouteEngineCore;
  const newWishes = [
    "Verger ou vignoble",
    "Arbre remarquable",
    "Cascade",
    "Grotte",
    "Œuvre d'art",
    "Petit patrimoine",
    "Glacier",
  ];
  for (const wish of newWishes) {
    assert.ok(ChoiceRegistry.wishes[wish], `${wish} doit être enregistrée`);
    assert.equal(ChoiceRegistry.wishes[wish].effect, "generation-ranking");
  }
});

test("D100C1 Banc reste uniquement dans Services, plus de doublon dans Envies", () => {
  const ctx = loadModule("../src/core/route-engine-core.js");
  const { ChoiceRegistry } = ctx.JMMJSRouteEngineCore;
  assert.ok(ChoiceRegistry.services["Banc"]);
  assert.equal(ChoiceRegistry.wishes["Banc"], undefined);
  assert.equal(ChoiceRegistry.wishes["Bancs"], undefined);
});

test("D100C1 les 7 nouvelles envies rejoignent WISH_POI_LABELS (classement) sans être ajoutées à ROUTING_POI_LABELS (recherche active)", () => {
  const ctx = loadModule("../src/core/services-core.js");
  const { WISH_POI_LABELS, ROUTING_POI_LABELS } = ctx.JMMJSServicesCore;
  const newWishes = [
    "Verger ou vignoble",
    "Arbre remarquable",
    "Cascade",
    "Grotte",
    "Œuvre d'art",
    "Petit patrimoine",
    "Glacier",
  ];
  for (const wish of newWishes) {
    assert.ok(WISH_POI_LABELS.includes(wish), `${wish} doit être auditable`);
    assert.equal(
      ROUTING_POI_LABELS.includes(wish),
      false,
      `${wish} ne doit pas encore déclencher de recherche ORS ciblée`,
    );
  }
});

test("D100C1 overpassProvider.enrichWishPoi appelle /overpass/wish-poi et normalise le format d'enrichissement commun", async () => {
  const ctx = loadModule("../src/peripherals/overpass-provider.js");
  const calls = [];
  const client = {
    async post(service, path, body) {
      calls.push({ service, path, body });
      return {
        status: "ok",
        pois: [
          { id: "osm:node/1", type: "Cascade", name: "Cascade du Moulin", lat: 43.001, lon: 1.001 },
          { id: "osm:node/2", type: "Point utile non reconnu", name: "x", lat: 43, lon: 1 },
        ],
      };
    },
  };
  const nearestRouteDistance = () => 42;
  const provider = ctx.JMMJSOverpassProvider.createOverpassProvider({
    client,
    nearestRouteDistance,
  });
  const route = { coords: [[1, 43], [1.001, 43.001]] };
  const results = await provider.enrichWishPoi({ route, radiusMeters: 300 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/overpass/wish-poi");
  assert.equal(calls[0].body.bufferMeters, 300);
  assert.equal(results.length, 1, "le type non reconnu par l'ontologie doit être écarté côté client aussi");
  assert.equal(results[0].type, "Cascade");
  assert.equal(results[0].distance, 42);
  assert.equal(results[0].name, "Cascade du Moulin");
});

test("D100C1 overpassProvider.enrichWishPoi renvoie une liste vide sans lever d'exception quand le service est indisponible", async () => {
  const ctx = loadModule("../src/peripherals/overpass-provider.js");
  const client = { async post() { return { status: "wish-poi-unavailable", pois: [] }; } };
  const provider = ctx.JMMJSOverpassProvider.createOverpassProvider({ client });
  const route = { coords: [[1, 43], [1.001, 43.001]] };
  const results = await provider.enrichWishPoi({ route });
  assert.equal(results.length, 0);
});

test("D100C1 overpassProvider.enrichBenches fusionne bancs et tables de pique-nique sous le type Banc", async () => {
  const ctx = loadModule("../src/peripherals/overpass-provider.js");
  const calls = [];
  const client = {
    async post(service, path, body) {
      calls.push({ service, path, body });
      return {
        status: "ok",
        benches: [{ lat: 43.001, lon: 1.001, backrest: true, seats: 2 }],
        picnicTables: [{ lat: 43.002, lon: 1.002, covered: false }],
      };
    },
  };
  const nearestRouteDistance = () => 12;
  const provider = ctx.JMMJSOverpassProvider.createOverpassProvider({
    client,
    nearestRouteDistance,
  });
  const route = { coords: [[1, 43], [1.001, 43.001]] };
  const results = await provider.enrichBenches({ route, radiusMeters: 60 });
  assert.equal(calls[0].path, "/overpass/benches");
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.type === "Banc"));
  const withBackrest = results.find((item) => item.accessibility === "documented");
  assert.ok(withBackrest, "un banc avec dossier documenté doit être marqué accessibility=documented");
});
