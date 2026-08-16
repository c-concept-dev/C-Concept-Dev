import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");

test("D101E limite le résumé principal à quatre blocs", () => {
  const start = app.indexOf('host.className = "review-card review-card-compact"');
  const end = app.indexOf('host.querySelectorAll("[data-go]")', start);
  const block = app.slice(start, end);
  assert.equal((block.match(/reviewBlock\(/g) || []).length, 7); // 4 principaux + 3 dans les détails
  const beforeDetails = block.split('Voir tous les détails')[0];
  assert.equal((beforeDetails.match(/reviewBlock\(/g) || []).length, 4);
});

test("D101E garde les détails repliés et partage le responsive", () => {
  assert.match(app, /<details class="review-details summary-details"><summary>Voir tous les détails<\/summary>/);
  assert.match(template, /@media\(max-width:767px\)\{\.review-grid,\.review-grid-compact,\.review-details-extra/);
});
