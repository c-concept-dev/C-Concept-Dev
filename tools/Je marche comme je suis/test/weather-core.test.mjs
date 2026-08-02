import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/core/weather-core.js", import.meta.url), "utf8");
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSWeatherCore;
function hourly(overrides = {}) {
  return {
    time: ["2026-08-02T20:00", "2026-08-02T21:00", "2026-08-02T22:00"],
    temperature_2m: [24, 23, 22],
    apparent_temperature: [25, 24, 23],
    precipitation_probability: [10, 20, 10],
    precipitation: [0, 0, 0],
    weather_code: [1, 2, 1],
    wind_gusts_10m: [20, 25, 22],
    visibility: [10000, 9000, 10000],
    ...overrides,
  };
}
test("résume seulement la plage utile", () => {
  const summary = core.summarizeForecast(hourly(), { startIndex: 1, count: 2 });
  assert.equal(summary.coverageHours, 2);
  assert.equal(summary.temperatureMaxC, 23);
});
test("une prévision normale ne bloque pas", () => {
  const assessment = core.assessForecast(core.summarizeForecast(hourly(), { count: 3 }));
  assert.equal(assessment.level, "favorable");
});
test("un orage rend la météo critique", () => {
  const assessment = core.assessForecast(core.summarizeForecast(hourly({ weather_code: [1, 95, 2] }), { count: 3 }));
  assert.equal(assessment.level, "critical");
});
test("des rafales fortes rendent la météo critique", () => {
  const assessment = core.assessForecast(core.summarizeForecast(hourly({ wind_gusts_10m: [20, 72, 30] }), { count: 3 }));
  assert.equal(assessment.level, "critical");
});
test("une prévision partielle reste invérifiable", () => {
  const assessment = core.assessForecast(core.summarizeForecast(hourly(), { count: 5 }));
  assert.equal(assessment.checks[0].status, "unknown");
});
test("une météo critique bloque la navigation", () => {
  const summary = core.summarizeForecast(hourly({ visibility: [300, 400, 350] }), { count: 3 });
  const route = core.applyWeatherAssessment(
    { checks: [], warnings: [], violations: [], proposalStatus: "compatible", canNavigate: true },
    summary,
    core.assessForecast(summary),
  );
  assert.equal(route.proposalStatus, "adaptation");
  assert.equal(route.canNavigate, false);
});