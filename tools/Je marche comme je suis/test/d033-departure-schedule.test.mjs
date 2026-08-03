import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const template = readFileSync(
  new URL("../je-marche-comme-je-suis.template.html", import.meta.url),
  "utf8",
);
const provider = readFileSync(
  new URL("../src/peripherals/open-meteo-provider.js", import.meta.url),
  "utf8",
);

assert.ok(app.includes("function scheduledDeparture()"));
assert.ok(app.includes("function validateDepartureSchedule()"));
assert.ok(app.includes("startAt: departure.schedule.iso"));
assert.ok(template.includes('id="departureMode"'));
assert.ok(template.includes('id="departureDate"'));
assert.ok(template.includes('id="departureTime"'));
assert.ok(provider.includes("startAt = null"));
assert.ok(provider.includes("requestedStartAt"));
