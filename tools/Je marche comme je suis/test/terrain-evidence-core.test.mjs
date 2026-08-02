import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/terrain-evidence-core.js", import.meta.url), "utf8");
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSTerrainEvidenceCore;

test("classe une couverture complète régulière comme documentée", () => {
  const result = core.assessTerrainEvidence({
    source: "ORS",
    surfaces: [{ id: 3, type: "Asphalte", percent: 100 }],
  });
  assert.equal(result.quality, "documented");
  assert.equal(result.regularitySafe, true);
  assert.equal(result.surfaceCoveragePercent, 100);
});

test("détecte une part significative de terrain irrégulier", () => {
  const result = core.assessTerrainEvidence({
    surfaces: [
      { id: 3, percent: 75 },
      { id: 10, percent: 25 },
    ],
  });
  assert.equal(result.quality, "documented");
  assert.equal(result.regularitySafe, false);
});

test("une preuve partielle ne permet pas de conclure sur la régularité", () => {
  const result = core.assessTerrainEvidence({
    surfaces: [
      { id: 3, percent: 55 },
      { id: 0, percent: 45 },
    ],
  });
  assert.equal(result.quality, "partial");
  assert.equal(result.regularitySafe, null);
});

test("un GPX sans données terrain reste absent et invérifiable", () => {
  const result = core.absentTerrainEvidence("GPX importé");
  assert.equal(result.quality, "absent");
  assert.equal(result.regularitySafe, null);
  assert.equal(result.minimumWidthMeters, null);
  assert.equal(result.exposureSafe, null);
});

test("la largeur et l'exposition ne sont jamais déduites des surfaces", () => {
  const result = core.assessTerrainEvidence({ surfaces: [{ id: 1, percent: 100 }] });
  assert.equal(result.minimumWidthMeters, null);
  assert.equal(result.exposureSafe, null);
});
