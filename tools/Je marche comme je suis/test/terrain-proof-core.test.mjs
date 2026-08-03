import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/core/terrain-proof-core.js", import.meta.url),
  "utf8",
);
const context = { globalThis: null, Date };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSTerrainProofCore;

const proof = core.summarizeTerrainProof(
  {
    source: "OpenRouteService / OpenStreetMap",
    surfaceCoveragePercent: 95,
    regularitySafe: true,
    minimumWidthMeters: null,
    exposureSafe: null,
    widthEvidence: "largeur non fournie",
    exposureEvidence: "exposition non fournie",
  },
  {
    photos: [
      {
        capturedAt: Date.now() - 10 * 86400000,
        distance: 25,
      },
    ],
  },
);

assert.equal(
  proof.items.find((item) => item.id === "surface").level,
  "probable",
);
assert.equal(
  proof.items.find((item) => item.id === "width").level,
  "undocumented",
);
assert.equal(proof.photoSummary.count, 1);
assert.equal(proof.photoSummary.nearestDistanceMeters, 25);
assert.equal(proof.overallLevel, "undocumented");

const contradictory = core.summarizeTerrainProof(
  { surfaceCoveragePercent: 100 },
  { contradictions: ["Surface asphaltée et sentier non revêtu sur la même portion."] },
);
assert.equal(contradictory.overallLevel, "contradictory");
