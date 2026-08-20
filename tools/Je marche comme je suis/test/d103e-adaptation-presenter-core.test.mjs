import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/core/activity-adaptation-presenter-core.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const core = context.globalThis.JMMJSActivityAdaptationPresenterCore;

function ready(overrides = {}) {
  return {
    status: "ready",
    activityIntent: "maintain",
    functionalGoal: "preserve",
    preparation: {
      durationMinutes: 90,
      availableTimeCapMinutes: 120,
      safetyMarginMinutes: 15,
      pacePolicy: "usual",
      pausePolicy: "sometimes",
      pauseReviewNeeded: false,
      progressionEligible: false,
    },
    caution: { level: "moderate" },
    ...overrides,
  };
}

test("D103E masque le bloc sans adaptation prête", () => {
  assert.equal(core.present(null).visible, false);
  assert.equal(core.present({ status: "inactive", activityIntent: "leisure" }).visible, false);
});

test("D103E présente uniquement des réglages compréhensibles", () => {
  const model = core.present(ready());
  assert.equal(model.visible, true);
  assert.equal(model.title, "Ce que nous avons ajusté pour aujourd’hui");
  assert.match(model.subtitle, /Maintenir mon rythme/);
  assert.equal(model.items.some((x) => x.label === "Durée proposée" && x.value === "1 h 30 min"), true);
  assert.equal(model.items.some((x) => x.label === "Marge de sécurité" && x.value === "15 min"), true);
  assert.equal(model.items.some((x) => /fitness|fatigue|douleur/i.test(x.label)), false);
});

test("D103E explicite qu'une progression n'est jamais automatique", () => {
  const eligible = core.present(ready({
    activityIntent: "progress",
    functionalGoal: "evolve",
    preparation: { ...ready().preparation, progressionEligible: true, pacePolicy: "usual_first" },
    caution: { level: "standard" },
  }));
  assert.match(eligible.progressionText, /jamais appliquée automatiquement/);

  const notEligible = core.present(ready({
    activityIntent: "progress",
    functionalGoal: "evolve",
  }));
  assert.match(notEligible.progressionText, /Aucune progression supplémentaire/);
});
