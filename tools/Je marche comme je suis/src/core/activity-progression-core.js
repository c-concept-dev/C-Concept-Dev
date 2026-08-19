/* JMMJS_ACTIVITY_PROGRESSION_CORE_START */
(() => {
  "use strict";

  // D103A — cœur longitudinal PUR, DÉTERMINISTE et INERTE.
  //
  // Ce module définit uniquement les contrats de données de D103.
  // Il ne lit ni n'écrit aucun stockage, ne lit pas le DOM, ne connaît
  // ni S, ni buildRequest(), ni ORS, ni le GPS, ni l'horloge système.
  // Toute donnée temporelle doit être fournie par l'appelant.

  const SCHEMA_NAME = "jmmjs.activity-progression";
  const SCHEMA_VERSION = 1;

  const ACTIVITY_INTENTS = Object.freeze([
    "leisure",
    "gentle_return",
    "maintain",
    "progress",
  ]);

  const DECISION_STATES = Object.freeze([
    "explore",
    "maintain",
    "reduce",
    "clarify",
  ]);

  const REACTION_MOMENTS = Object.freeze([
    "during",
    "post_activity",
    "later",
  ]);

  const DATA_SOURCES = Object.freeze([
    "planned",
    "measured",
    "user_reported",
    "inferred",
    "unknown",
  ]);

  const DATA_QUALITIES = Object.freeze([
    "confirmed",
    "approximate",
    "incomplete",
    "unknown",
  ]);

  const FUNCTIONAL_GOAL_TYPES = Object.freeze([
    "activity",
    "participation",
    "unspecified",
  ]);

  const EXPOSURE_DIMENSIONS = Object.freeze([
    "duration",
    "distance",
    "ascent",
    "descent",
    "elevation",
    "terrainRegularity",
    "pauses",
    "perceivedEffort",
    "completion",
  ]);

  const TOLERANCE_DIMENSIONS = Object.freeze([
    "duration",
    "distance",
    "ascent",
    "descent",
    "terrainRegularity",
    "pauses",
    "perceivedEffort",
    "completion",
  ]);

  function deepClone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function nullableString(value) {
    return typeof value === "string" && value.trim() ? value : null;
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value.map((item) => deepClone(item)) : [];
  }

  function normalizeMeasurement(value = {}, defaults = {}) {
    const input = asObject(value);
    const source = DATA_SOURCES.includes(input.source)
      ? input.source
      : (DATA_SOURCES.includes(defaults.source) ? defaults.source : "unknown");
    const quality = DATA_QUALITIES.includes(input.quality)
      ? input.quality
      : (DATA_QUALITIES.includes(defaults.quality) ? defaults.quality : "unknown");

    return {
      value: Object.prototype.hasOwnProperty.call(input, "value") ? deepClone(input.value) : null,
      unit: nullableString(input.unit),
      source,
      quality,
    };
  }

  // ------------------------------------------------------------------
  // Baseline — état habituel, jamais une norme de population.
  // ------------------------------------------------------------------

  function createBaselineState(value = {}) {
    const input = asObject(value);
    return {
      habitualPainOrDiscomfort: deepClone(input.habitualPainOrDiscomfort ?? null),
      habitualFatigue: deepClone(input.habitualFatigue ?? null),
      habitualWalkingDuration: deepClone(input.habitualWalkingDuration ?? null),
      habitualWalkingFrequency: deepClone(input.habitualWalkingFrequency ?? null),
      habitualPauseNeed: deepClone(input.habitualPauseNeed ?? null),
      uphillTolerance: deepClone(input.uphillTolerance ?? null),
      downhillTolerance: deepClone(input.downhillTolerance ?? null),
      unevenTerrainTolerance: deepClone(input.unevenTerrainTolerance ?? null),
      standingTolerance: deepClone(input.standingTolerance ?? null),
      habitualBalance: deepClone(input.habitualBalance ?? null),
      walkingAid: deepClone(input.walkingAid ?? null),
      habitualActivityContext: deepClone(input.habitualActivityContext ?? null),
      declaredAt: nullableString(input.declaredAt),
    };
  }

  function normalizeBaselineState(value = {}) {
    return createBaselineState(value);
  }

  function isBaselineKnown(value = {}) {
    const baseline = createBaselineState(value);
    return Object.entries(baseline).some(
      ([key, fieldValue]) => key !== "declaredAt" && fieldValue !== null && fieldValue !== undefined,
    );
  }

  // ------------------------------------------------------------------
  // Objectif fonctionnel personnel — facultatif, jamais prescriptif.
  // ------------------------------------------------------------------

  function createFunctionalGoal(value = {}) {
    const input = asObject(value);
    return {
      text: nullableString(input.text),
      type: FUNCTIONAL_GOAL_TYPES.includes(input.type) ? input.type : "unspecified",
      userDefined: input.userDefined !== false,
      status: nullableString(input.status),
      createdAt: nullableString(input.createdAt),
      updatedAt: nullableString(input.updatedAt),
    };
  }

  // ------------------------------------------------------------------
  // Contextes — descriptifs et non scorés.
  // ------------------------------------------------------------------

  function createEnvironmentContext(value = {}) {
    const input = asObject(value);
    return {
      terrainRegularity: deepClone(input.terrainRegularity ?? null),
      ascentExposure: deepClone(input.ascentExposure ?? null),
      descentExposure: deepClone(input.descentExposure ?? null),
      walkingAid: deepClone(input.walkingAid ?? null),
      pausePattern: deepClone(input.pausePattern ?? null),
      knownWeatherContext: deepClone(input.knownWeatherContext ?? null),
      otherRelevantContext: deepClone(input.otherRelevantContext ?? null),
    };
  }

  function createDailyContext(value = {}) {
    const input = asObject(value);
    return {
      unusualPhysicalActivity: deepClone(input.unusualPhysicalActivity ?? null),
      unusualFatigue: deepClone(input.unusualFatigue ?? null),
      recoveryPerception: deepClone(input.recoveryPerception ?? null),
      optionalStressContext: deepClone(input.optionalStressContext ?? null),
    };
  }

  // ------------------------------------------------------------------
  // Exposition — multidimensionnelle, avec provenance explicite.
  // ------------------------------------------------------------------

  function createActivityExposure(value = {}, defaults = {}) {
    const input = asObject(value);
    const defaultValues = asObject(defaults);
    const out = {};

    for (const dimension of EXPOSURE_DIMENSIONS) {
      out[dimension] = normalizeMeasurement(input[dimension], defaultValues[dimension]);
    }
    return out;
  }

  function normalizeActivityExposure(value = {}, defaults = {}) {
    return createActivityExposure(value, defaults);
  }

  // ------------------------------------------------------------------
  // Réactions — contrat partagé, sans interprétation médicale.
  // ------------------------------------------------------------------

  function createReaction(value = {}) {
    const input = asObject(value);
    return {
      moment: REACTION_MOMENTS.includes(input.moment) ? input.moment : null,
      relativeToUsual: deepClone(input.relativeToUsual ?? null),
      signals: normalizeArray(input.signals),
      freeText: nullableString(input.freeText),
      recordedAt: nullableString(input.recordedAt),
    };
  }

  // ------------------------------------------------------------------
  // Décision N+1 — contrat uniquement ; aucun calcul de décision ici.
  // ------------------------------------------------------------------

  function createProgressionDecision(value = {}) {
    const input = asObject(value);
    if (!DECISION_STATES.includes(input.state)) {
      throw new TypeError(
        `État de décision invalide : "${String(input.state)}". Attendu : ${DECISION_STATES.join(", ")}.`,
      );
    }

    const reason = nullableString(input.reason);
    if (!reason) {
      throw new TypeError("Une progressionDecision doit toujours contenir une raison explicite.");
    }

    return {
      state: input.state,
      dimension: nullableString(input.dimension),
      reason,
      observationsUsed: normalizeArray(input.observationsUsed),
      missingObservations: normalizeArray(input.missingObservations),
      contradictions: normalizeArray(input.contradictions),
      createdAt: nullableString(input.createdAt),
    };
  }

  // ------------------------------------------------------------------
  // Session — planned et actual restent physiquement distincts.
  // ------------------------------------------------------------------

  function createSessionRecord(value = {}) {
    const input = asObject(value);
    return {
      id: nullableString(input.id),
      activityIntent: ACTIVITY_INTENTS.includes(input.activityIntent)
        ? input.activityIntent
        : null,
      includedInHistory: input.includedInHistory === true,
      startedAt: nullableString(input.startedAt),
      endedAt: nullableString(input.endedAt),
      plannedExposure: createActivityExposure(input.plannedExposure, {
        duration: { source: "planned" },
        distance: { source: "planned" },
        ascent: { source: "planned" },
        descent: { source: "planned" },
        elevation: { source: "planned" },
        terrainRegularity: { source: "planned" },
        pauses: { source: "planned" },
        perceivedEffort: { source: "planned" },
        completion: { source: "planned" },
      }),
      actualExposure: createActivityExposure(input.actualExposure),
      environmentContext: createEnvironmentContext(input.environmentContext),
      dailyContext: createDailyContext(input.dailyContext),
      completion: deepClone(input.completion ?? null),
      duringReaction: input.duringReaction ? createReaction({ ...input.duringReaction, moment: "during" }) : null,
      postActivityReaction: input.postActivityReaction
        ? createReaction({ ...input.postActivityReaction, moment: "post_activity" })
        : null,
      laterReaction: input.laterReaction ? createReaction({ ...input.laterReaction, moment: "later" }) : null,
      progressionDecision: input.progressionDecision
        ? createProgressionDecision(input.progressionDecision)
        : null,
      dataQuality: DATA_QUALITIES.includes(input.dataQuality) ? input.dataQuality : "unknown",
    };
  }

  function normalizeSessionRecord(value = {}) {
    return createSessionRecord(value);
  }

  function shouldIncludeSessionInHistory(value = {}) {
    const session = createSessionRecord(value);
    if (session.activityIntent === "leisure") return session.includedInHistory === true;
    return ACTIVITY_INTENTS.includes(session.activityIntent);
  }

  // ------------------------------------------------------------------
  // Profil de tolérance OBSERVÉE — agrégation de faits fournis.
  // Aucun seuil de « bonne tolérance » n'est inventé ici.
  // ------------------------------------------------------------------

  function createObservedToleranceProfile(value = {}) {
    const input = asObject(value);
    const profile = {};
    for (const dimension of TOLERANCE_DIMENSIONS) {
      const dimensionInput = asObject(input[dimension]);
      profile[dimension] = {
        observations: normalizeArray(dimensionInput.observations),
        currentReference: Object.prototype.hasOwnProperty.call(dimensionInput, "currentReference")
          ? deepClone(dimensionInput.currentReference)
          : null,
      };
    }
    return profile;
  }

  function deriveObservedToleranceProfile(observations = []) {
    const profile = createObservedToleranceProfile();
    if (!Array.isArray(observations)) return profile;

    for (const rawObservation of observations) {
      const observation = asObject(rawObservation);
      if (!TOLERANCE_DIMENSIONS.includes(observation.dimension)) continue;
      profile[observation.dimension].observations.push(deepClone(observation));
    }
    return profile;
  }

  // ------------------------------------------------------------------
  // Document longitudinal versionné — migration pure et déterministe.
  // ------------------------------------------------------------------

  function createLongitudinalDocument(data = {}, metadata = {}) {
    const meta = asObject(metadata);
    return {
      schema: SCHEMA_NAME,
      schemaVersion: SCHEMA_VERSION,
      createdAt: nullableString(meta.createdAt),
      updatedAt: nullableString(meta.updatedAt),
      data: deepClone(asObject(data)),
    };
  }

  function validateLongitudinalDocument(document) {
    const input = asObject(document);
    const errors = [];

    if (input.schema !== SCHEMA_NAME) errors.push("schema");
    if (!Number.isInteger(input.schemaVersion)) errors.push("schemaVersion");
    if (input.schemaVersion > SCHEMA_VERSION) errors.push("futureSchemaVersion");
    if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) errors.push("data");

    return {
      valid: errors.length === 0,
      errors,
      schemaVersion: Number.isInteger(input.schemaVersion) ? input.schemaVersion : null,
    };
  }

  function migrateLongitudinalDocument(document) {
    const input = deepClone(asObject(document));

    if (input.schema !== SCHEMA_NAME) {
      throw new TypeError(`Schéma longitudinal incompatible : "${String(input.schema)}".`);
    }
    if (!Number.isInteger(input.schemaVersion)) {
      throw new TypeError("Version de schéma longitudinale absente ou invalide.");
    }
    if (input.schemaVersion > SCHEMA_VERSION) {
      throw new RangeError(
        `Version future non supportée : ${input.schemaVersion} > ${SCHEMA_VERSION}.`,
      );
    }

    // v1 est la première version canonique. Les migrations futures seront
    // ajoutées ici séquentiellement (v1→v2, v2→v3, ...).
    if (input.schemaVersion === SCHEMA_VERSION) return input;

    throw new RangeError(`Aucune migration disponible depuis la version ${input.schemaVersion}.`);
  }

  const API = {
    SCHEMA_NAME,
    SCHEMA_VERSION,
    ACTIVITY_INTENTS,
    DECISION_STATES,
    REACTION_MOMENTS,
    DATA_SOURCES,
    DATA_QUALITIES,
    FUNCTIONAL_GOAL_TYPES,
    EXPOSURE_DIMENSIONS,
    TOLERANCE_DIMENSIONS,
    createBaselineState,
    normalizeBaselineState,
    isBaselineKnown,
    createFunctionalGoal,
    createEnvironmentContext,
    createDailyContext,
    createActivityExposure,
    normalizeActivityExposure,
    createReaction,
    createProgressionDecision,
    createSessionRecord,
    normalizeSessionRecord,
    shouldIncludeSessionInHistory,
    createObservedToleranceProfile,
    deriveObservedToleranceProfile,
    createLongitudinalDocument,
    validateLongitudinalDocument,
    migrateLongitudinalDocument,
  };

  globalThis.JMMJSActivityProgressionCore = Object.freeze(API);
})();
/* JMMJS_ACTIVITY_PROGRESSION_CORE_END */
