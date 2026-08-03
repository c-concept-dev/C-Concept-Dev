import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(
  new URL("../je-marche-comme-je-suis.template.html", import.meta.url),
  "utf8",
);

const place = template.indexOf('id="place"');
const departure = template.indexOf('id="departureMode"');
const weather = template.indexOf('id="weatherCompact"');
const latitude = template.indexOf('id="lat"');
const terrain = template.indexOf("Terrain souhaité");

assert.ok(place >= 0);
assert.ok(departure > place);
assert.ok(weather > departure);
assert.ok(latitude > weather);
assert.ok(terrain > latitude);
assert.equal((template.match(/id="departureMode"/g) || []).length, 1);
assert.equal((template.match(/id="weatherCompact"/g) || []).length, 1);
