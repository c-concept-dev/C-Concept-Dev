import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("src/core/activity-adaptation-core.js", "utf8");
const context = { globalThis: {} };
vm.runInNewContext(code, context);
const core = context.globalThis.JMMJSActivityAdaptationCore;

const baseline = { energy: "medium", walkingEase: "rather_easy", duration: "1_to_2h", pauses: "sometimes" };
const today = { energy: "same", walkingEase: "easy", discomfort: "light", availableTime: "1_to_2h", functionalGoal: null };

test("D103D reste totalement inerte pour Me balader", () => {
  const r = core.deriveAdaptation({ activityIntent: "leisure" });
  assert.equal(r.status, "inactive");
  assert.equal(r.activityIntent, "leisure");
});

test("D103D refuse de fabriquer une décision si baseline ou état du jour manque", () => {
  const r = core.deriveAdaptation({ activityIntent: "maintain", baseline: {}, today: {} });
  assert.equal(r.status, "needs_data");
  assert.ok(Array.from(r.missing).includes("baseline.energy"));
  assert.ok(Array.from(r.missing).includes("today.discomfort"));
});

test("D103D maintien respecte baseline et temps disponible", () => {
  const r = core.deriveAdaptation({ activityIntent: "maintain", baseline, today: { ...today, availableTime: "under_1h" } });
  assert.equal(r.status, "ready");
  assert.equal(r.preparation.durationMinutes, 60);
  assert.equal(r.preparation.availableTimeCapMinutes, 60);
  assert.equal(r.preparation.safetyMarginMinutes, 10);
});

test("D103D reprise douce part sous le repère habituel sans dépasser le disponible", () => {
  const r = core.deriveAdaptation({ activityIntent: "gentle_return", baseline, today });
  assert.equal(r.preparation.durationMinutes, 90);
  assert.equal(r.preparation.pacePolicy, "not_above_usual");
});

test("D103D état du jour plus contraignant augmente uniquement la marge et demande revue des pauses", () => {
  const r = core.deriveAdaptation({
    activityIntent: "maintain",
    baseline,
    today: { energy: "lower", walkingEase: "harder", discomfort: "important", availableTime: "1_to_2h" },
  });
  assert.equal(r.caution.level, "high");
  assert.equal(r.preparation.safetyMarginMinutes, 20);
  assert.equal(r.preparation.pauseReviewNeeded, true);
  assert.equal(r.preparation.pacePolicy, "not_above_usual");
});

test("D103D ne transforme jamais énergie ou gêne en forme fatigue ou douleur", () => {
  const r = core.deriveAdaptation({ activityIntent: "maintain", baseline, today });
  assert.equal(r.preparation.fitness, null);
  assert.equal(r.preparation.fatigue, null);
  assert.equal(r.preparation.painIntensity, null);
});

test("D103D progression reste explicite et n'augmente pas automatiquement la durée", () => {
  const r = core.deriveAdaptation({
    activityIntent: "progress",
    functionalGoal: "evolve",
    baseline,
    today: { energy: "higher", walkingEase: "very_easy", discomfort: "none", availableTime: "over_3h" },
  });
  assert.equal(r.preparation.durationMinutes, 120);
  assert.equal(r.preparation.progressionEligible, true);
  assert.equal(r.preparation.pacePolicy, "usual_first");
});

test("D103D progression est neutralisée si l'état du jour est moins favorable", () => {
  const r = core.deriveAdaptation({
    activityIntent: "progress",
    functionalGoal: "evolve",
    baseline,
    today: { energy: "lower", walkingEase: "slightly_harder", discomfort: "moderate", availableTime: "over_3h" },
  });
  assert.equal(r.preparation.progressionEligible, false);
  assert.equal(r.preparation.durationMinutes, 120);
});
