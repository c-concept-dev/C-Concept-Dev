import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.JMMJSActivityProgressionCore;
}

const CORE_SOURCE = readFileSync(
  new URL("../src/core/activity-progression-core.js", import.meta.url),
  "utf8",
);
const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

function clone(value) {
  return structuredClone(value);
}

test("D103A expose le vocabulaire canonique exact", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.deepEqual([...core.ACTIVITY_INTENTS], ["leisure", "gentle_return", "maintain", "progress"]);
  assert.deepEqual([...core.DECISION_STATES], ["explore", "maintain", "reduce", "clarify"]);
  assert.equal("MODES" in core, false);
});

test("D103A baselineState couvre le contrat canonique et conserve l'inconnu", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const baseline = core.createBaselineState();
  assert.deepEqual(Object.keys(baseline), [
    "habitualPainOrDiscomfort",
    "habitualFatigue",
    "habitualWalkingDuration",
    "habitualWalkingFrequency",
    "habitualPauseNeed",
    "uphillTolerance",
    "downhillTolerance",
    "unevenTerrainTolerance",
    "standingTolerance",
    "habitualBalance",
    "walkingAid",
    "habitualActivityContext",
    "declaredAt",
  ]);
  for (const value of Object.values(baseline)) assert.equal(value, null);
});

test("D103A functionalGoal reste facultatif et non prescriptif", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const goal = core.createFunctionalGoal({ text: "Refaire le tour du lac", type: "participation" });
  assert.equal(goal.text, "Refaire le tour du lac");
  assert.equal(goal.type, "participation");
  assert.equal(goal.userDefined, true);
  assert.equal("targetDuration" in goal, false);
});

test("D103A activityExposure garde chaque dimension indépendante avec provenance et qualité", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const exposure = core.createActivityExposure({
    distance: { value: 3.8, unit: "km", source: "measured", quality: "approximate" },
  });
  assert.equal(exposure.distance.value, 3.8);
  assert.equal(exposure.distance.source, "measured");
  assert.equal(exposure.distance.quality, "approximate");
  assert.equal(exposure.ascent.value, null);
  assert.equal(exposure.ascent.source, "unknown");
  assert.equal(exposure.ascent.quality, "unknown");
});

test("D103A planned n'est jamais promu vers actual", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const session = core.createSessionRecord({
    id: "s1",
    activityIntent: "maintain",
    plannedExposure: {
      distance: { value: 4.2, unit: "km", source: "planned", quality: "confirmed" },
    },
  });
  assert.equal(session.plannedExposure.distance.value, 4.2);
  assert.equal(session.actualExposure.distance.value, null);
  assert.equal(session.actualExposure.distance.source, "unknown");
});

test("D103A createReaction distingue les trois moments sans inventer de donnée", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  for (const moment of ["during", "post_activity", "later"]) {
    const reaction = core.createReaction({ moment });
    assert.equal(reaction.moment, moment);
    assert.equal(Array.isArray(reaction.signals), true);
    assert.equal(reaction.signals.length, 0);
    assert.equal(reaction.functionalImpact, null);
  }
});

test("D103A leisure n'entre dans l'historique que sur choix explicite", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.equal(core.shouldIncludeSession({ activityIntent: "leisure", includedInHistory: false }), false);
  assert.equal(core.shouldIncludeSession({ activityIntent: "leisure", includedInHistory: true }), true);
  for (const intent of ["gentle_return", "maintain", "progress"]) {
    assert.equal(core.shouldIncludeSession({ activityIntent: intent }), true);
  }
});

test("D103A progressionDecision exige un état canonique et une raison traçable", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.throws(() => core.createProgressionDecision({ state: "increase", reason: "x" }));
  assert.throws(() => core.createProgressionDecision({ state: "reduce" }));
  const decision = core.createProgressionDecision({
    state: "clarify",
    reason: "Données réelles insuffisantes",
    missingObservations: ["actualExposure.distance"],
    createdAt: "2026-08-19T12:00:00Z",
  });
  assert.equal(decision.state, "clarify");
  assert.deepEqual(decision.missingObservations, ["actualExposure.distance"]);
  for (const forbidden of ["percent", "amount", "coefficient", "factor", "score", "confidence"]) {
    assert.equal(forbidden in decision, false);
  }
});

test("D103A observedToleranceProfile est un profil d'observations, jamais une capacité maximale", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const profile = core.deriveObservedToleranceProfile([
    {
      id: "s1",
      activityIntent: "maintain",
      endedAt: "2026-08-18T09:00:00Z",
      actualExposure: {
        duration: { value: 42, unit: "min", source: "measured", quality: "confirmed" },
      },
    },
  ]);
  assert.equal(profile.duration.observations.length, 1);
  assert.equal(profile.duration.observations[0].value, 42);
  assert.equal(profile.distance.observations.length, 0);
  const text = JSON.stringify(profile);
  assert.doesNotMatch(text, /maxCapacity|fitnessScore|recoveryScore|overallLevel/);
});

test("D103A dérivation ignore les valeurs actual dont la provenance est unknown", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const profile = core.deriveObservedToleranceProfile([
    {
      id: "s1",
      activityIntent: "maintain",
      actualExposure: { duration: { value: 45, unit: "min", source: "unknown", quality: "unknown" } },
    },
  ]);
  assert.equal(profile.duration.observations.length, 0);
});

test("D103A document longitudinal est versionné et validable", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const document = core.createLongitudinalDocument({
    createdAt: "2026-08-19T10:00:00Z",
    updatedAt: "2026-08-19T10:00:00Z",
    data: { currentActivityIntent: "gentle_return" },
  });
  assert.equal(document.schema, "jmmjs.activity-progression");
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.data.currentActivityIntent, "gentle_return");
  const validation = core.validateLongitudinalDocument(document);
  assert.equal(validation.valid, true);
  assert.equal(Array.isArray(validation.errors), true);
  assert.equal(validation.errors.length, 0);
});

test("D103A migration est déterministe sur la version courante et rejette une version future", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const current = core.createLongitudinalDocument({
    createdAt: "2026-08-19T10:00:00Z",
    updatedAt: "2026-08-19T10:00:00Z",
  });
  const before = clone(current);
  const a = core.migrateLongitudinalDocument(current);
  const b = core.migrateLongitudinalDocument(current);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(current), JSON.stringify(before), "la migration ne doit pas muter l'entrée");
  assert.throws(() => core.migrateLongitudinalDocument({ ...current, schemaVersion: 2 }), /future/);
});

test("D103A fonctions de normalisation ne mutent jamais leurs entrées", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const input = {
    id: "s1",
    activityIntent: "progress",
    actualExposure: {
      distance: { value: 2, unit: "km", source: "measured", quality: "confirmed" },
    },
  };
  const before = clone(input);
  core.normalizeSessionRecord(input);
  assert.deepEqual(input, before);
});

test("D103A source ne contient aucun effet de bord ou dépendance interdite", () => {
  for (const forbidden of [
    /localStorage/,
    /sessionStorage/,
    /\.getItem\s*\(/,
    /\.setItem\s*\(/,
    /\bDOM\b/,
    /\bbuildRequest\b/,
    /\bORS\b/,
    /\bnavigator\b/,
    /\bserviceWorker\b/,
    /Date\.now\s*\(/,
    /new Date\s*\(/,
    /Math\.random\s*\(/,
  ]) {
    assert.doesNotMatch(CORE_SOURCE, forbidden);
  }
});

test("D103A n'embarque aucune règle numérique universelle ou score composite", () => {
  assert.doesNotMatch(CORE_SOURCE, /\b10\s*%|\+\s*5\s*min|decondition|recoveryScore|loadScore|toleranceScore|confidenceScore/i);
});

test("D103A ne raccorde rien dans app.js", () => {
  assert.doesNotMatch(APP_SOURCE, /JMMJSActivityProgressionCore/);
});

test("D103A export principal et constantes sont gelés", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.equal(Object.isFrozen(core), true);
  assert.equal(Object.isFrozen(core.ACTIVITY_INTENTS), true);
  assert.equal(Object.isFrozen(core.DECISION_STATES), true);
});
