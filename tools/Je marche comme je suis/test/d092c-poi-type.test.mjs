import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/peripherals/geoapify-provider.js", import.meta.url),
  "utf8",
);
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const { poiType } = context.JMMJSGeoapifyProvider;

test("D092C poiType reconnaît la boulangerie", () => {
  assert.equal(poiType(["commercial.food_and_drink.bakery"]), "Boulangerie");
});

test("D092C poiType reconnaît le restaurant", () => {
  assert.equal(poiType(["catering.restaurant.italian"]), "Restaurant");
});

test("D092C poiType reconnaît le point de vue", () => {
  assert.equal(poiType(["tourism.attraction.viewpoint"]), "Point de vue");
});

test("D092C poiType reconnaît le pique-nique", () => {
  assert.equal(poiType(["leisure.picnic.picnic_table"]), "Pique-nique");
});

test("D092C poiType élargit Patrimoine à tourism.sights", () => {
  assert.equal(poiType(["tourism.sights.castle"]), "Patrimoine");
  assert.equal(poiType(["heritage.unesco"]), "Patrimoine");
});

test("D092C poiType conserve le comportement existant pour les services déjà couverts", () => {
  assert.equal(poiType(["healthcare.pharmacy"]), "Pharmacie");
  assert.equal(poiType(["parking.cars"]), "Parking");
  assert.equal(poiType(["public_transport.bus"]), "Transport public");
});

test("D092C poiType retombe sur Point utile pour une catégorie non reconnue", () => {
  assert.equal(poiType(["commercial.jewelry"]), "Point utile");
});
