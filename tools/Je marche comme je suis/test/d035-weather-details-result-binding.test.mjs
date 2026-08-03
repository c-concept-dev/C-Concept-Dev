import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

assert.ok(app.includes("function bindWeatherDetails(scope)"));
assert.ok(app.includes("bindWeatherDetails(element);"));
assert.ok(app.includes("bindWeatherDetails(E.detail);"));
assert.ok(app.includes('detailsToggle.dataset.bound = "true"'));
