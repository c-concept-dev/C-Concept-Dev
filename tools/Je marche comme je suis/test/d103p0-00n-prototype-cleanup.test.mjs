import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

const REMOVED_MODULES = [
  "src/core/activity-baseline-core.js",
  "src/core/activity-today-core.js",
  "src/core/activity-adaptation-core.js",
  "src/core/activity-adaptation-presenter-core.js",
];

test("D103P0-00N retire physiquement les quatre prototypes anticipés", () => {
  for (const path of REMOVED_MODULES) assert.equal(existsSync(new URL(path, ROOT)), false, path);
});

test("D103P0-00N le build ne réinjecte aucun prototype anticipé", () => {
  const build = read("scripts/build.mjs");
  for (const path of REMOVED_MODULES) assert.doesNotMatch(build, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("D103P0-00N app.js ne contient plus la taxonomie ni l’adaptation anticipées", () => {
  const app = read("src/app.js");
  for (const symbol of [
    "JMMJSActivityBaselineCore", "JMMJSActivityTodayCore", "JMMJSActivityAdaptationCore",
    "JMMJSActivityAdaptationPresenterCore", "baselineDefaults", "todayDefaults",
    "deriveD103PreparationAdaptation", "applyD103TodayToPreparation", "renderD103AdaptationExplanation",
  ]) assert.doesNotMatch(app, new RegExp(symbol));
});

test("D103P0-00N l’UI active ne contient plus les questionnaires C/C2 anticipés", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  for (const marker of ["d103Baseline", "d103Today", "data-baseline-group", "data-today-group", "d103e-adaptation"]) {
    assert.doesNotMatch(html, new RegExp(marker));
  }
  assert.match(html, /id="d103HealthPending" hidden/);
});

test("D103P0-00N conserve les fondations gelées A A2 B", () => {
  for (const path of [
    "src/core/activity-progression-core.js",
    "src/core/activity-progression-persistence.js",
    "src/core/activity-intent-home-core.js",
  ]) assert.equal(existsSync(new URL(path, ROOT)), true, path);
});
