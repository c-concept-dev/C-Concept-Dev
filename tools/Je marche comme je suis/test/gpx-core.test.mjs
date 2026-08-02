import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../src/core/gpx-core.js", import.meta.url),
  "utf8",
);
const context = { console, TextEncoder, globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "gpx-core.js" });
const { parseGPXText, summarizePoints } = context.JMMJSGPXCore;

const header = '<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">';

test("D-022 sépare les segments GPX au lieu de créer une liaison fictive", () => {
  const routes = parseGPXText(
    `${header}<trk><name>Boucle test</name><trkseg><trkpt lat="43.6" lon="1.4"><ele>100</ele></trkpt><trkpt lat="43.601" lon="1.401"><ele>105</ele></trkpt></trkseg><trkseg><trkpt lat="44" lon="2"><ele>120</ele></trkpt><trkpt lat="44.001" lon="2.001"><ele>121</ele></trkpt></trkseg></trk></gpx>`,
    "fichier",
  );
  assert.equal(routes.length, 2);
  assert.equal(routes[0].name, "Boucle test — segment 1");
  assert.equal(routes[1].name, "Boucle test — segment 2");
});

test("D-022 accepte plusieurs traces et routes dans le même fichier", () => {
  const routes = parseGPXText(
    `${header}<trk><name>A</name><trkseg><trkpt lat="43.6" lon="1.4"/><trkpt lat="43.601" lon="1.401"/></trkseg></trk><rte><name>B</name><rtept lat="43.7" lon="1.5"/><rtept lat="43.701" lon="1.501"/></rte></gpx>`,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(routes.map((route) => route.name))),
    ["A", "B"],
  );
});

test("D-022 recalcule la distance et ne valide pas un relief partiel", () => {
  const [route] = parseGPXText(
    `${header}<trk><trkseg><trkpt lat="43.6" lon="1.4"><ele>100</ele></trkpt><trkpt lat="43.601" lon="1.401"><ele>105</ele></trkpt><trkpt lat="43.602" lon="1.402"/></trkseg></trk></gpx>`,
  );
  const summary = summarizePoints(route.points);
  assert.ok(summary.distanceMeters > 0);
  assert.ok(summary.elevationCoverage > 0 && summary.elevationCoverage < 1);
  assert.equal(summary.ascentMeters, null);
  assert.equal(summary.descentMeters, null);
});

test("D-022 rejette les coordonnées invalides", () => {
  assert.throws(
    () =>
      parseGPXText(
        `${header}<rte><rtept lat="143" lon="1.5"/><rtept lat="43.7" lon="1.6"/></rte></gpx>`,
      ),
    /hors limites/,
  );
});
