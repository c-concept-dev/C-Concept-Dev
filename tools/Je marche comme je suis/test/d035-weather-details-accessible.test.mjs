import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const template = readFileSync(
  new URL("../je-marche-comme-je-suis.template.html", import.meta.url),
  "utf8",
);

assert.ok(app.includes("function weatherDetailsHtml"));
assert.ok(app.includes("function weatherHourlyRows"));
assert.ok(app.includes('class="weather-details-toggle"'));
assert.ok(app.includes('aria-expanded="false"'));
assert.ok(app.includes("detailsPanel.hidden = expanded"));
assert.ok(template.includes(".weather-details-panel"));
assert.ok(!app.includes('title="' + " + esc(title)"));
