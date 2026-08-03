import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/core/multi-point-weather-core.js", import.meta.url),
  "utf8",
);
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSMultiPointWeatherCore;

assert.equal(
  core.chooseWeatherPoints({
    distanceMeters: 2500,
    coords: [[1, 43, 100], [1.01, 43, 110], [1, 43, 100]],
  }).length,
  1,
);

assert.ok(
  core.chooseWeatherPoints({
    distanceMeters: 8000,
    coords: [[1, 43, 100], [1.03, 43.02, 110], [1, 43, 100]],
  }).length >= 2,
);

assert.ok(
  core.chooseWeatherPoints({
    distanceMeters: 7000,
    coords: [[1, 43, 100], [1.02, 43.01, 300], [1, 43, 100]],
  }).some((point) => point.id === "high"),
);

const aggregated = core.aggregateWeatherResults([
  {
    point: { id: "start", label: "Départ" },
    summary: {
      temperatureMinC: 20,
      temperatureMaxC: 24,
      apparentMinC: 20,
      apparentMaxC: 25,
      precipitationProbabilityMax: 10,
      precipitationMm: 0,
      windGustMaxKmh: 20,
      visibilityMinM: 10000,
      coverageHours: 2,
      requestedHours: 2,
      complete: true,
      weatherCodes: [1],
    },
    assessment: {
      level: "favorable",
      label: "Conditions favorables",
      warnings: [],
    },
  },
  {
    point: { id: "middle", label: "Parcours" },
    summary: {
      temperatureMinC: 18,
      temperatureMaxC: 22,
      apparentMinC: 17,
      apparentMaxC: 22,
      precipitationProbabilityMax: 60,
      precipitationMm: 1,
      windGustMaxKmh: 45,
      visibilityMinM: 5000,
      coverageHours: 2,
      requestedHours: 2,
      complete: true,
      weatherCodes: [61],
    },
    assessment: {
      level: "caution",
      label: "Prudence météo",
      warnings: ["Pluie"],
    },
  },
]);

assert.equal(aggregated.representativePoint.label, "Parcours");
assert.equal(aggregated.summary.temperatureMinC, 18);
assert.equal(aggregated.summary.windGustMaxKmh, 45);
