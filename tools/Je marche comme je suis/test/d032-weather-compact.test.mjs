import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const template = readFileSync(
  new URL("../je-marche-comme-je-suis.template.html", import.meta.url),
  "utf8",
);

assert.ok(app.includes("function weatherCompactHtml"));
assert.ok(app.includes("void refreshWeatherPreview();"));
assert.ok(app.includes("weather-result"));
assert.ok(!app.includes('weather: val("#weather")'));
assert.ok(template.includes('id="weatherCompact"'));
assert.ok(!template.includes('id="weather"'));
assert.ok(template.includes(".weather-compact"));
