/* JMMJS_ACTIVITY_PROGRESSION_CORE_START */
const JMMJSActivityProgressionCore = (() => {
  "use strict";

  // D103A — coeur longitudinal pur, déterministe et inerte.
  // Ce module définit uniquement des contrats et fonctions de domaine.
  // Le chargement ne modifie ni l'espace global objet, ni le stockage, ni le navigateur.

  const SCHEMA = "jmmjs.activity-progression";
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

  const REACTION_MOMENTS = Object.freeze([
    "during",
    "post_activity",
    "later",
  ]);

  const GOAL_TYPES = Object.freeze(["activity", "participation", "unspecified"]);

  function clone(value) {
    if (value === undefined) return undefined;
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function freezeCopy(value) {
    return Object.freeze(clone(value));
  }

  function knownEnum(value, values, fallback = null) {
    return values.includes(value) ? value : fallback;
  }

  function nullable(value) {
    return value === undefined ? null : clone(value);
  }

  function createObservedValue(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    return {
      value: input.value === undefined ? null : clone(input.value),
      unit: typeof input.unit === "string" ? input.unit : null,
      source: knownEnum(input.source, DATA_SOURCES, "unknown"),
      quality: knownEnum(input.quality, DATA_QUALITIES, "unknown"),
    };
  }

  function createBaselineState(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    return {
      habitualPainOrDiscomfort: nullable(input.habitualPainOrDiscomfort),
      habitualFatigue: nullable(input.habitualFatigue),
      habitualWalkingDuration: nullable(input.habitualWalkingDuration),
      habitualWalkingFrequency: nullable(input.habitualWalkingFrequency),
      habitualPauseNeed: nullable(input.habitualPauseNeed),
      uphillTolerance: nullable(input.uphillTolerance),
      downhillTolerance: nullable(input.downhillTolerance),
      unevenTerrainTolerance: nullable(input.unevenTerrainTolerance),
      standingTolerance: nullable(input.standingTolerance),
      habitualBalance: nullable(input.habitualBalance),
      walkingAid: nullable(input.walkingAid),
      habitualActivityContext: nullable(input.habitualActivityContext),
      declaredAt: typeof input.declaredAt === "string" ? input.declaredAt : null,
    };
  }

  function normalizeBaselineState(value = {}) {
    return createBaselineState(value);
  }

  function createFunctionalGoal(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    return {
      text: typeof input.text === "string" ? input.text : null,
      type: knownEnum(input.type, GOAL_TYPES, "unspecified"),
      userDefined: input.userDefined !== false,
      status: nullable(input.status),
      createdAt: typeof input.createdAt === "string" ? input.createdAt : null,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    };
  }

  function createActivityExposure(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    const fields = [
      "duration",
      "distance",
      "ascent",
      "descent",
      "elevation",
      "terrainRegularity",
      "pauses",
      "perceivedEffort",
      "completion",
    ];
    const out = {};
    for (const field of fields) {
      out[field] = createObservedValue(input[field]);
    }
    return out;
  }

  function normalizeActivityExposure(value = {}) {
    return createActivityExposure(value);
  }

  function createReaction(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    return {
      moment: knownEnum(input.moment, REACTION_MOMENTS, null),
      comparedWithUsual: nullable(input.comparedWithUsual),
      signals: Array.isArray(input.signals) ? clone(input.signals) : [],
      functionalImpact: nullable(input.functionalImpact),
      freeText: typeof input.freeText === "string" ? input.freeText : null,
      reportedAt: typeof input.reportedAt === "string" ? input.reportedAt : null,
    };
  }

  function createEnvironmentContext(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    return {
      terrainRegularity: nullable(input.terrainRegularity),
      ascentExposure: nullable(input.ascentExposure),
      descentExposure: nullable(input.descentExposure),
      walkingAid: nullable(input.walkingAid),
      pausePattern: nullable(input.pausePattern),
      knownWeatherContext: nullable(input.knownWeatherContext),
      otherRelevantContext: nullable(input.otherRelevantContext),
    };
  }

  function createDailyContext(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    return {
      unusualPhysicalActivity: nullable(input.unusualPhysicalActivity),
      unusualFatigue: nullable(input.unusualFatigue),
      recoveryPerception: nullable(input.recoveryPerception),
      optionalStressContext: nullable(input.optionalStressContext),
    };
  }

  function createProgressionDecision(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    if (!DECISION_STATES.includes(input.state)) {
      throw new TypeError(`Invalid progressionDecision state: ${String(input.state)}`);
    }
    if (typeof input.reason !== "string" || input.reason.trim() === "") {
      throw new TypeError("progressionDecision.reason is required");
    }
    return {
      state: input.state,
      dimension: typeof input.dimension === "string" ? input.dimension : null,
      reason: input.reason,
      observationsUsed: Array.isArray(input.observationsUsed) ? clone(input.observationsUsed) : [],
      missingObservations: Array.isArray(input.missingObservations)
        ? clone(input.missingObservations)
        : [],
      contradictions: Array.isArray(input.contradictions) ? clone(input.contradictions) : [],
      createdAt: typeof input.createdAt === "string" ? input.createdAt : null,
    };
  }

  function createSessionRecord(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    return {
      id: typeof input.id === "string" ? input.id : null,
      activityIntent: knownEnum(input.activityIntent, ACTIVITY_INTENTS, null),
      includedInHistory: input.includedInHistory === true,
      startedAt: typeof input.startedAt === "string" ? input.startedAt : null,
      endedAt: typeof input.endedAt === "string" ? input.endedAt : null,
      plannedExposure: createActivityExposure(input.plannedExposure),
      actualExposure: createActivityExposure(input.actualExposure),
      environmentContext: createEnvironmentContext(input.environmentContext),
      dailyContext: createDailyContext(input.dailyContext),
      completion: nullable(input.completion),
      duringReaction: input.duringReaction ? createReaction(input.duringReaction) : null,
      postActivityReaction: input.postActivityReaction ? createReaction(input.postActivityReaction) : null,
      laterReaction: input.laterReaction ? createReaction(input.laterReaction) : null,
      progressionDecision: input.progressionDecision
        ? createProgressionDecision(input.progressionDecision)
        : null,
      dataQuality: nullable(input.dataQuality),
    };
  }

  function normalizeSessionRecord(value = {}) {
    return createSessionRecord(value);
  }

  function shouldIncludeSession(record = {}) {
    const normalized = createSessionRecord(record);
    if (normalized.activityIntent === "leisure") {
      return normalized.includedInHistory === true;
    }
    return ACTIVITY_INTENTS.includes(normalized.activityIntent);
  }

  function createObservedToleranceProfile(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    const dimensions = [
      "duration",
      "distance",
      "ascent",
      "descent",
      "terrainRegularity",
      "pauses",
      "perceivedEffort",
      "completion",
    ];
    const out = {};
    for (const dimension of dimensions) {
      const source = input[dimension] && typeof input[dimension] === "object"
        ? input[dimension]
        : {};
      out[dimension] = {
        observations: Array.isArray(source.observations) ? clone(source.observations) : [],
        currentReference: source.currentReference === undefined
          ? null
          : clone(source.currentReference),
      };
    }
    return out;
  }

  function deriveObservedToleranceProfile(sessions = []) {
    const profile = createObservedToleranceProfile();
    if (!Array.isArray(sessions)) return profile;

    const dimensions = Object.keys(profile);
    for (const rawSession of sessions) {
      const session = createSessionRecord(rawSession);
      if (!session.id) continue;
      for (const dimension of dimensions) {
        const observed = session.actualExposure[dimension];
        if (!observed || observed.source === "unknown" || observed.value === null) continue;
        profile[dimension].observations.push({
          sessionId: session.id,
          dimension,
          value: clone(observed.value),
          environmentContext: clone(session.environmentContext),
          activityIntent: session.activityIntent,
          reactionSummary: {
            duringReaction: clone(session.duringReaction),
            postActivityReaction: clone(session.postActivityReaction),
            laterReaction: clone(session.laterReaction),
          },
          source: observed.source,
          quality: observed.quality,
          observedAt: session.endedAt || session.startedAt || null,
        });
      }
    }
    return profile;
  }

  function createLongitudinalDocument(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    const data = input.data && typeof input.data === "object" ? input.data : {};
    return {
      schema: SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      createdAt: typeof input.createdAt === "string" ? input.createdAt : null,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
      data: {
        baselineState: data.baselineState ? createBaselineState(data.baselineState) : null,
        functionalGoal: data.functionalGoal ? createFunctionalGoal(data.functionalGoal) : null,
        currentActivityIntent: knownEnum(data.currentActivityIntent, ACTIVITY_INTENTS, null),
        sessionRecords: Array.isArray(data.sessionRecords)
          ? data.sessionRecords.map((entry) => createSessionRecord(entry))
          : [],
        observedToleranceProfile: data.observedToleranceProfile
          ? createObservedToleranceProfile(data.observedToleranceProfile)
          : createObservedToleranceProfile(),
        pendingFollowUp: nullable(data.pendingFollowUp),
        longitudinalSettings: nullable(data.longitudinalSettings),
      },
    };
  }

  function validateLongitudinalDocument(value) {
    const errors = [];
    if (!value || typeof value !== "object") {
      return { valid: false, errors: ["document must be an object"] };
    }
    if (value.schema !== SCHEMA) errors.push("schema mismatch");
    if (value.schemaVersion !== SCHEMA_VERSION) errors.push("schemaVersion mismatch");
    if (!value.data || typeof value.data !== "object") errors.push("data must be an object");

    const records = value.data && value.data.sessionRecords;
    if (records !== undefined && !Array.isArray(records)) {
      errors.push("sessionRecords must be an array");
    }
    if (Array.isArray(records)) {
      records.forEach((record, index) => {
        if (!ACTIVITY_INTENTS.includes(record && record.activityIntent)) {
          errors.push(`sessionRecords[${index}].activityIntent invalid`);
        }
      });
    }
    return { valid: errors.length === 0, errors };
  }

  function migrateLongitudinalDocument(value) {
    if (!value || typeof value !== "object") {
      throw new TypeError("longitudinal document must be an object");
    }
    if (value.schema !== SCHEMA) {
      throw new TypeError("unsupported longitudinal document schema");
    }
    if (typeof value.schemaVersion !== "number") {
      throw new TypeError("missing schemaVersion");
    }
    if (value.schemaVersion > SCHEMA_VERSION) {
      throw new RangeError("future schemaVersion is not supported");
    }
    if (value.schemaVersion < SCHEMA_VERSION) {
      throw new RangeError("no migration path is defined for this schemaVersion");
    }
    return createLongitudinalDocument(value);
  }

  return Object.freeze({
    SCHEMA,
    SCHEMA_VERSION,
    ACTIVITY_INTENTS,
    DECISION_STATES,
    DATA_SOURCES,
    DATA_QUALITIES,
    REACTION_MOMENTS,
    GOAL_TYPES,
    createObservedValue,
    createBaselineState,
    normalizeBaselineState,
    createFunctionalGoal,
    createActivityExposure,
    normalizeActivityExposure,
    createReaction,
    createEnvironmentContext,
    createDailyContext,
    createSessionRecord,
    normalizeSessionRecord,
    shouldIncludeSession,
    createObservedToleranceProfile,
    deriveObservedToleranceProfile,
    createProgressionDecision,
    createLongitudinalDocument,
    validateLongitudinalDocument,
    migrateLongitudinalDocument,
    freezeCopy,
  });
})();
/* JMMJS_ACTIVITY_PROGRESSION_CORE_END */
