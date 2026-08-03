import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const template = readFileSync(
  new URL("../je-marche-comme-je-suis.template.html", import.meta.url),
  "utf8",
);

assert.ok(app.includes("function formatWeatherTime"));
assert.ok(app.includes("function formatWeatherPeriod"));
assert.ok(app.includes("function formatWeatherDistance"));
assert.ok(app.includes("Précipitations prévues :"));
assert.ok(app.includes("Visibilité minimale :"));
assert.ok(app.includes("weatherDetailsHtml(weather)"));
assert.ok(!app.includes("weatherDetailsHtml(weather, title)"));
assert.ok(template.includes(".weather-detail-meta span"));
