import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");

test("une promenade avec réserves reste accessible en phase 2", () => {
  assert.match(app, /Continuer malgré les réserves/);
  assert.match(app, /poursuivre malgré ces réserves/);
  assert.match(template, /navReserveBanner/);
  assert.doesNotMatch(app, /Trajet non recommandé tel quel<\/button>/);
});

test("la fiche avant départ ne contient plus le grand bloc Prudence et repli", () => {
  assert.doesNotMatch(app, /class=\"return-safety\"/);
  assert.doesNotMatch(app, /Partager l’heure de retour/);
  assert.doesNotMatch(template, /navReturnGoogle/);
  assert.match(template, /id=\"navTurnBack\"/);
});

test("le client coupe les appels suivants après un 404 d’endpoint", async () => {
  const source = readFileSync(new URL("../src/peripherals/service-client.js", import.meta.url), "utf8");
  let calls = 0;
  const context = { globalThis: null, fetch: null, Error, TypeError, JSON, Object, Set };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const client = context.JMMJSServiceClient.createServiceClient({
    baseUrl: "https://example.test/v1",
    fetchImpl: async () => { calls += 1; return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) }; },
  });
  await assert.rejects(() => client.post("overpass", "/overpass/terrain", {}), /Réponse 404/);
  await assert.rejects(() => client.post("overpass", "/overpass/terrain", {}), /Endpoint indisponible/);
  assert.equal(calls, 1);
  assert.equal(client.isEndpointUnavailable("/overpass/terrain"), true);
});
