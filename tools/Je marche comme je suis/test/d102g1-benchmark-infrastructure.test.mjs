import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";

const SCRIPT = readFileSync(new URL("../scripts/d102g1-benchmark.mjs", import.meta.url), "utf8");
const README = readFileSync(new URL("../benchmark/d102g1/README.md", import.meta.url), "utf8");
const SPEC = readFileSync(new URL("../benchmark/d102g1/corpus-spec.jsonl", import.meta.url), "utf8")
  .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);

const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("D102G1 le benchmark existe et est exécutable via npm", () => {
  assert.equal(PKG.scripts["benchmark:d102g1"], "node scripts/d102g1-benchmark.mjs");
  assert.ok(existsSync(new URL("../benchmark/d102g1/corpus-real.jsonl", import.meta.url)));
});

test("D102G1 les exemples de calibration sont exclus du gate humain", () => {
  assert.ok(SPEC.length >= 8);
  assert.ok(SPEC.every((entry) => entry.provenance === "project-spec"));
  assert.match(SCRIPT, /ELIGIBLE_PROVENANCE = new Set\(\["beta-user", "realistic-human", "manual-rewrite"\]\)/);
  assert.doesNotMatch(SCRIPT.match(/ELIGIBLE_PROVENANCE[^;]+;/)?.[0] || "", /project-spec|synthetic/);
});

test("D102G1 aucun GO/NO-GO n'est prononcé avant 100 entrées humaines éligibles", () => {
  assert.match(SCRIPT, /MIN_ELIGIBLE_TOTAL = 100/);
  assert.match(SCRIPT, /INSUFFICIENT_CORPUS/);
  assert.match(README, /au moins 100 entrées humaines éligibles/i);
});

test("D102G1 mesure les dimensions séparément, pas une moyenne globale", () => {
  for (const key of [
    "side", "bodyAreas", "positiveTerrain", "negativeTerrain", "durationMinutes",
    "pauseNeed", "painConflict", "limitsConflict", "uncertain",
  ]) assert.match(SCRIPT, new RegExp(`\\[?\\\"${key}\\\"`));
  assert.doesNotMatch(SCRIPT, /globalScore|averageScore|scoreGlobal/i);
});

test("D102G1 la provenance réelle doit rester humaine ou bêta ; les synthétiques ne sont que complémentaires", () => {
  assert.match(README, /ne doit pas être fabriqué par un LLM/i);
  assert.match(README, /beta-user/);
  assert.match(README, /realistic-human/);
  assert.match(README, /manual-rewrite/);
});
