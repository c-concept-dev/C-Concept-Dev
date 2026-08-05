import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("l’interface secondaire reste compacte et regroupée", () => {
  assert.match(template, /class="around-bundle"[^>]*id="aroundBundle"/);
  assert.match(template, /<summary>Autour du parcours<\/summary>/);
  assert.match(template, /body\.has-results \.panel \.prompt-zone[^\n]+display:none!important/);
  assert.match(template, /\.calculation-options \.option-grid\{display:block\}/);
  assert.match(template, /\.privacy-options \.helper\{display:none!important\}/);
  assert.match(app, /class="tranquility-summary"/);
  assert.match(app, /<summary>Voir les indices<\/summary>/);
});
