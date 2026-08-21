/* JMMJS_ACTIVITY_INTENT_HOME_CORE_START */
(() => {
  "use strict";

  // D103B — logique pure de l'accueil et du choix activityIntent.
  // Aucune navigation, aucun stockage, aucune horloge implicite.

  const INTENT_COPY = Object.freeze({
    leisure: Object.freeze({
      label: "Ma balade sur mesure",
      description: "Une balade simple, adaptée à votre envie du moment.",
    }),
    gentle_return: Object.freeze({
      label: "Retrouver doucement",
      description: "Retrouver progressivement une activité qui vous convient.",
    }),
    maintain: Object.freeze({
      label: "Préserver mon rythme",
      description: "Continuer à votre rythme, sans chercher à augmenter.",
    }),
    progress: Object.freeze({
      label: "Faire évoluer",
      description: "Faire évoluer progressivement une dimension qui compte pour vous.",
    }),
  });

  function requireCore(core = globalThis.JMMJSActivityProgressionCore) {
    if (!core) throw new TypeError("JMMJSActivityProgressionCore is required");
    return core;
  }

  function isActivityIntent(value, core = globalThis.JMMJSActivityProgressionCore) {
    const domain = requireCore(core);
    return domain.ACTIVITY_INTENTS.includes(value);
  }

  function chooseActivityIntent(document, intent, { now, core = globalThis.JMMJSActivityProgressionCore } = {}) {
    const domain = requireCore(core);
    if (!domain.ACTIVITY_INTENTS.includes(intent)) {
      throw new TypeError(`Invalid activityIntent: ${String(intent)}`);
    }
    if (typeof now !== "string" || now.trim() === "") {
      throw new TypeError("now is required");
    }

    const base = document
      ? domain.migrateLongitudinalDocument(document)
      : domain.createLongitudinalDocument({ createdAt: now, updatedAt: now, data: {} });

    return domain.createLongitudinalDocument({
      ...base,
      createdAt: base.createdAt || now,
      updatedAt: now,
      data: {
        ...base.data,
        currentActivityIntent: intent,
      },
    });
  }

  function deriveHomeState(document, { core = globalThis.JMMJSActivityProgressionCore } = {}) {
    const domain = requireCore(core);
    if (!document) {
      return {
        state: "first_visit",
        historyAvailable: false,
        lastSession: null,
        currentActivityIntent: null,
      };
    }

    let normalized;
    try {
      normalized = domain.migrateLongitudinalDocument(document);
    } catch {
      return {
        state: "first_visit",
        historyAvailable: false,
        lastSession: null,
        currentActivityIntent: null,
      };
    }

    const sessions = Array.isArray(normalized.data.sessionRecords)
      ? normalized.data.sessionRecords.filter((session) => domain.shouldIncludeSession(session))
      : [];
    const lastSession = sessions.length ? sessions[sessions.length - 1] : null;

    return {
      state: lastSession ? "returning" : "first_visit",
      historyAvailable: Boolean(lastSession),
      lastSession,
      currentActivityIntent: domain.ACTIVITY_INTENTS.includes(normalized.data.currentActivityIntent)
        ? normalized.data.currentActivityIntent
        : null,
    };
  }

  function intentLabel(intent) {
    return INTENT_COPY[intent]?.label || null;
  }

  globalThis.JMMJSActivityIntentHomeCore = Object.freeze({
    INTENT_COPY,
    isActivityIntent,
    chooseActivityIntent,
    deriveHomeState,
    intentLabel,
  });
})();
/* JMMJS_ACTIVITY_INTENT_HOME_CORE_END */
