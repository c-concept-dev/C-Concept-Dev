import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/app.js", "utf8");
const build = readFileSync("scripts/build.mjs", "utf8");

test("D103D est embarqué dans le build avant l'application", () => {
  assert.match(build, /src\/core\/activity-adaptation-core\.js/);
});

test("D103D raccorde baseline + état du jour au core pur", () => {
  assert.match(app, /JMMJSActivityAdaptationCore/);
  assert.match(app, /deriveAdaptation\(\{/);
  assert.match(app, /baseline:\s*baselineSelections/);
  assert.match(app, /today:\s*todaySelections/);
});

test("D103D n'infère plus forme ou douleur à partir de l'écran du jour", () => {
  assert.doesNotMatch(app, /fitnessMap\s*=\s*\{/);
  assert.doesNotMatch(app, /painMap\s*=\s*\{/);
  assert.match(app, /énergie ≠ forme\/fatigue et gêne ≠ douleur/);
});

test("D103D ne préremplit automatiquement que durée et marge justifiées", () => {
  const start = app.indexOf("function applyD103TodayToPreparation");
  const end = app.indexOf("if ($\(\"#d103TodayContinue\"\))", start);
  const block = app.slice(start, end);
  assert.match(block, /#duration/);
  assert.match(block, /#margin/);
  assert.doesNotMatch(block, /#fitness/);
  assert.doesNotMatch(block, /#pain/);
  assert.doesNotMatch(block, /#fatigue/);
});
