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
const CORE_EXECUTABLE_SOURCE = CORE_SOURCE.replace(/^\s*\/\/.*$/gm, "");
const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("D103A expose les 4 activityIntent canoniques", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.deepEqual(
    [...core.ACTIVITY_INTENTS].sort(),
    ["gentle_return", "leisure", "maintain", "progress"].sort(),
  );
  assert.equal("MODES" in core, false);
});

test("D103A expose uniquement explore/maintain/reduce/clarify comme états de décision", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.deepEqual(
    [...core.DECISION_STATES].sort(),
    ["clarify", "explore", "maintain", "reduce"].sort(),
  );
});

test("D103A utilise le schéma canonique jmmjs.activity-progression v1", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.equal(core.SCHEMA_NAME, "jmmjs.activity-progression");
  assert.equal(core.SCHEMA_VERSION, 1);
});

test("D103A createBaselineState couvre les champs canoniques et l'inconnu reste null", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const baseline = core.createBaselineState();
  const expected = [
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
  ];
  assert.deepEqual(Object.keys(baseline).sort(), expected.sort());
  for (const key of expected) assert.equal(baseline[key], null);
});

test("D103A isBaselineKnown ignore declaredAt seul", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.equal(core.isBaselineKnown({ declaredAt: "2026-08-19T10:00:00+02:00" }), false);
  assert.equal(core.isBaselineKnown({ habitualWalkingDuration: { value: 35 } }), true);
});

test("D103A createFunctionalGoal reste facultatif et non prescriptif", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const goal = core.createFunctionalGoal({
    text: "Refaire le tour du lac",
    type: "participation",
    createdAt: "2026-08-19T10:00:00+02:00",
  });
  assert.equal(goal.text, "Refaire le tour du lac");
  assert.equal(goal.type, "participation");
  assert.equal(goal.userDefined, true);
  assert.equal("targetMinutes" in goal, false);
  assert.equal("prescription" in goal, false);
});

test("D103A activityExposure sépare toutes les dimensions et leur provenance", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const exposure = core.createActivityExposure({
    duration: { value: 42, unit: "min", source: "measured", quality: "confirmed" },
    elevation: { value: null, source: "unknown", quality: "unknown" },
  });
  assert.equal(exposure.duration.value, 42);
  assert.equal(exposure.duration.source, "measured");
  assert.equal(exposure.elevation.value, null);
  assert.equal(exposure.elevation.source, "unknown");
  assert.deepEqual(Object.keys(exposure).sort(), [...core.EXPOSURE_DIMENSIONS].sort());
});

test("D103A plannedExposure et actualExposure sont strictement distincts", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const record = core.createSessionRecord({
    activityIntent: "maintain",
    plannedExposure: {
      duration: { value: 45, unit: "min", source: "planned", quality: "confirmed" },
    },
  });
  assert.equal(record.plannedExposure.duration.value, 45);
  assert.equal(record.plannedExposure.duration.source, "planned");
  assert.equal(record.actualExposure.duration.value, null);
  assert.equal(record.actualExposure.duration.source, "unknown");
});

test("D103A ne transforme jamais implicitement une source invalide en measured", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const exposure = core.createActivityExposure({ duration: { value: 20, source: "magic" } });
  assert.equal(exposure.duration.source, "unknown");
});

test("D103A createReaction impose seulement un moment canonique, sans diagnostic", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const reaction = core.createReaction({
    moment: "post_activity",
    relativeToUsual: "un_peu_moins_bien",
    signals: ["fatigue_inhabituelle"],
    freeText: "Les descentes étaient moins confortables",
  });
  assert.equal(reaction.moment, "post_activity");
  assert.deepEqual([...reaction.signals], ["fatigue_inhabituelle"]);
  assert.equal("diagnosis" in reaction, false);
});

test("D103A createProgressionDecision exige un état valide ET une raison", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.throws(() => core.createProgressionDecision({ state: "increase" }));
  assert.throws(() => core.createProgressionDecision({ state: "explore" }));
  const decision = core.createProgressionDecision({
    state: "reduce",
    dimension: "descent",
    reason: "La dernière descente a été signalée comme moins confortable.",
    observationsUsed: ["session:s1:descent"],
  });
  assert.equal(decision.state, "reduce");
  assert.equal(decision.dimension, "descent");
  assert.equal(decision.reason.length > 0, true);
});

test("D103A aucune progressionDecision ne contient une amplitude chiffrée", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const decision = core.createProgressionDecision({
    state: "explore",
    reason: "Les observations disponibles permettent d'envisager une évolution.",
  });
  for (const forbidden of ["percent", "amount", "coefficient", "factor", "deltaMinutes", "score", "confidence"]) {
    assert.equal(forbidden in decision, false, `${forbidden} ne doit pas exister`);
  }
});

test("D103A une balade leisure n'entre dans l'historique que sur choix explicite", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.equal(core.shouldIncludeSessionInHistory({ activityIntent: "leisure" }), false);
  assert.equal(
    core.shouldIncludeSessionInHistory({ activityIntent: "leisure", includedInHistory: true }),
    true,
  );
});

test("D103A gentle_return/maintain/progress sont éligibles à l'historique", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  for (const activityIntent of ["gentle_return", "maintain", "progress"]) {
    assert.equal(core.shouldIncludeSessionInHistory({ activityIntent }), true);
  }
});

test("D103A observedToleranceProfile ne contient aucun maxCapacity/overallLevel", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const profile = core.createObservedToleranceProfile();
  assert.equal("maxCapacity" in profile, false);
  assert.equal("overallLevel" in profile, false);
  assert.equal("fitnessScore" in profile, false);
  assert.ok(Array.isArray(profile.duration.observations));
});

test("D103A deriveObservedToleranceProfile agrège seulement des observations explicitement fournies", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const profile = core.deriveObservedToleranceProfile([
    { sessionId: "s1", dimension: "duration", value: 40, context: { terrain: "regular" } },
    { sessionId: "s2", dimension: "descent", value: "moderate", reaction: "less_comfortable" },
    { sessionId: "s3", dimension: "unsupported", value: 999 },
  ]);
  assert.equal(profile.duration.observations.length, 1);
  assert.equal(profile.descent.observations.length, 1);
  assert.equal(profile.distance.observations.length, 0);
});

test("D103A createLongitudinalDocument n'utilise aucune horloge implicite", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const doc = core.createLongitudinalDocument({ hello: "world" });
  assert.equal(doc.createdAt, null);
  assert.equal(doc.updatedAt, null);
  const dated = core.createLongitudinalDocument(
    { hello: "world" },
    { createdAt: "2026-08-19T10:00:00+02:00", updatedAt: "2026-08-19T11:00:00+02:00" },
  );
  assert.equal(dated.createdAt, "2026-08-19T10:00:00+02:00");
});

test("D103A validateLongitudinalDocument accepte v1 et refuse une version future", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const valid = core.createLongitudinalDocument({});
  assert.equal(core.validateLongitudinalDocument(valid).valid, true);
  const future = { ...plain(valid), schemaVersion: core.SCHEMA_VERSION + 1 };
  const result = core.validateLongitudinalDocument(future);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("futureSchemaVersion"));
});

test("D103A migrateLongitudinalDocument est déterministe et ne mute pas l'entrée", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const original = core.createLongitudinalDocument(
    { nested: { value: 1 } },
    { createdAt: "2026-08-19T10:00:00+02:00" },
  );
  const before = plain(original);
  const a = core.migrateLongitudinalDocument(original);
  const b = core.migrateLongitudinalDocument(original);
  assert.deepEqual(plain(a), plain(b));
  assert.deepEqual(plain(original), before);
});

test("D103A migrateLongitudinalDocument refuse proprement les versions futures", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const future = {
    schema: core.SCHEMA_NAME,
    schemaVersion: core.SCHEMA_VERSION + 1,
    createdAt: null,
    updatedAt: null,
    data: {},
  };
  assert.throws(
    () => core.migrateLongitudinalDocument(future),
    (error) => error?.name === "RangeError" && /Version future non supportée/.test(error.message),
  );
});

test("D103A normalise sans muter les entrées", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const input = {
    activityIntent: "maintain",
    actualExposure: {
      duration: { value: { minutes: 35 }, source: "measured", quality: "confirmed" },
    },
    dailyContext: { unusualFatigue: { level: "low" } },
  };
  const before = plain(input);
  const record = core.createSessionRecord(input);
  record.actualExposure.duration.value.minutes = 99;
  record.dailyContext.unusualFatigue.level = "high";
  assert.deepEqual(input, before);
});

test("D103A source ne contient aucun accès stockage ou API navigateur/moteur", () => {
  for (const forbidden of [
    /localStorage/,
    /sessionStorage/,
    /getItem\s*\(/,
    /setItem\s*\(/,
    /removeItem\s*\(/,
    /buildRequest/,
    /\bORS\b/,
    /navigator\./,
    /serviceWorker/,
    /document\./,
    /window\./,
    /Date\.now\s*\(/,
    /new Date\s*\(/,
    /Math\.random\s*\(/,
  ]) {
    assert.doesNotMatch(CORE_EXECUTABLE_SOURCE, forbidden);
  }
});

test("D103A source ne contient aucune règle liée à l'âge, seuil douleur ou pourcentage de progression", () => {
  assert.doesNotMatch(CORE_EXECUTABLE_SOURCE, /\bage\b/i);
  assert.doesNotMatch(CORE_EXECUTABLE_SOURCE, /pain\s*[<>]=?\s*\d/i);
  assert.doesNotMatch(CORE_EXECUTABLE_SOURCE, /\+\s*10\s*%|10\s*%/i);
});

test("D103A ne raccorde toujours rien dans app.js", () => {
  assert.doesNotMatch(APP_SOURCE, /JMMJSActivityProgressionCore/);
});

test("D103A contrat exporté gelé", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.equal(Object.isFrozen(core), true);
  assert.throws(() => {
    "use strict";
    core.ACTIVITY_INTENTS = [];
  });
});
