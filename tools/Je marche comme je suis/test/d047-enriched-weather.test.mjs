import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/enriched-weather-core.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const { enrichWeatherSummary, daylightAssessment } = context.globalThis.JMMJSEnrichedWeatherCore;

test("D-047 enrichit la météo avec récupération, modèle et lumière du jour", () => {
  const result = enrichWeatherSummary(
    { source: "Open-Meteo", startTime: "2026-08-04T18:00" },
    { fetchedAt: Date.parse("2026-08-04T16:05:00Z"), timezone: "Europe/Paris", daily: { sunrise: ["2026-08-04T06:42"], sunset: ["2026-08-04T21:13"] } },
    { iso: "2026-08-04T18:00" },
    120,
  );
  assert.equal(result.model, "best match");
  assert.equal(result.sunset, "2026-08-04T21:13");
  assert.equal(result.daylightMarginMinutes, 73);
  assert.match(result.retrievedAt, /^2026-08-04T16:05/);
});

test("D-047 classe une marge de lumière faible sans la présenter comme garantie", () => {
  assert.equal(daylightAssessment({ daylightMarginMinutes: 10 }).level, "critical");
  assert.equal(daylightAssessment({ daylightMarginMinutes: 45 }).label, "Marge avant la nuit correcte");
  assert.equal(daylightAssessment({}).level, "unknown");
});
