/* JMMJS_ACTIVITY_ADAPTATION_CORE_START */
(() => {
  "use strict";

  // D103D — traduction pure et explicable du longitudinal vers la préparation.
  // Ce module ne diagnostique rien, ne déduit ni douleur, ni fatigue, ni forme générale.
  // Il fournit uniquement des paramètres directement justifiés par les réponses D103C.

  const LONGITUDINAL_INTENTS = Object.freeze(["gentle_return", "maintain", "progress"]);
  const BASELINE_DURATION_MAX = Object.freeze({
    up_to_1h: 60,
    "1_to_2h": 120,
    "2_to_3h": 180,
    more_than_3h: 240,
  });
  const TODAY_TIME_MAX = Object.freeze({
    under_1h: 60,
    "1_to_2h": 120,
    "2_to_3h": 180,
    over_3h: 240,
  });
  const BASELINE_WALKING_RANK = Object.freeze({
    difficult: 1,
    sometimes_difficult: 2,
    rather_easy: 3,
    very_easy: 4,
  });
  const TODAY_WALKING_RANK = Object.freeze({
    harder: 1,
    slightly_harder: 2,
    easy: 3,
    very_easy: 4,
  });
  const ENERGY_DELTA = Object.freeze({ lower: -1, same: 0, higher: 1, much_higher: 2 });
  const DISCOMFORT_RANK = Object.freeze({ none: 0, light: 1, moderate: 2, important: 3 });

  function known(value) {
    return value !== null && value !== undefined && value !== "";
  }

  function clampToStep(value, min, max, step) {
    const n = Math.max(min, Math.min(max, Number(value)));
    return Math.round(n / step) * step;
  }

  function normalizeInput(input = {}) {
    return {
      activityIntent: LONGITUDINAL_INTENTS.includes(input.activityIntent) ? input.activityIntent : input.activityIntent === "leisure" ? "leisure" : null,
      baseline: input.baseline && typeof input.baseline === "object" ? input.baseline : {},
      today: input.today && typeof input.today === "object" ? input.today : {},
      functionalGoal: ["recover", "preserve", "evolve"].includes(input.functionalGoal)
        ? input.functionalGoal
        : ["recover", "preserve", "evolve"].includes(input.today?.functionalGoal)
          ? input.today.functionalGoal
          : null,
    };
  }

  function missingFields(normalized) {
    const missing = [];
    if (!normalized.activityIntent) missing.push("activityIntent");
    if (normalized.activityIntent === "leisure") return missing;
    for (const key of ["energy", "walkingEase", "duration", "pauses"]) {
      if (!known(normalized.baseline[key])) missing.push(`baseline.${key}`);
    }
    for (const key of ["energy", "walkingEase", "discomfort", "availableTime"]) {
      if (!known(normalized.today[key])) missing.push(`today.${key}`);
    }
    return missing;
  }

  function deriveCaution(normalized) {
    const reasons = [];
    let score = 0;

    const energyDelta = ENERGY_DELTA[normalized.today.energy];
    if (energyDelta === -1) {
      score += 1;
      reasons.push("Énergie plus basse qu’habituellement.");
    }

    const baselineWalking = BASELINE_WALKING_RANK[normalized.baseline.walkingEase];
    const todayWalking = TODAY_WALKING_RANK[normalized.today.walkingEase];
    const walkingDelta = Number.isFinite(baselineWalking) && Number.isFinite(todayWalking)
      ? todayWalking - baselineWalking
      : null;
    if (walkingDelta !== null && walkingDelta <= -2) {
      score += 2;
      reasons.push("Marche nettement plus difficile que le repère habituel.");
    } else if (walkingDelta !== null && walkingDelta === -1) {
      score += 1;
      reasons.push("Marche plus difficile que le repère habituel.");
    }

    const discomfort = DISCOMFORT_RANK[normalized.today.discomfort];
    if (discomfort === 3) {
      score += 2;
      reasons.push("Gêne ou inconfort important déclaré aujourd’hui.");
    } else if (discomfort === 2) {
      score += 1;
      reasons.push("Gêne ou inconfort modéré déclaré aujourd’hui.");
    }

    if (score >= 3) return { level: "high", score, reasons, safetyMarginMinutes: 20 };
    if (score >= 1) return { level: "moderate", score, reasons, safetyMarginMinutes: 15 };
    return { level: "standard", score: 0, reasons, safetyMarginMinutes: 10 };
  }

  function deriveDuration(normalized) {
    const baselineMax = BASELINE_DURATION_MAX[normalized.baseline.duration] ?? null;
    const todayMax = TODAY_TIME_MAX[normalized.today.availableTime] ?? null;
    if (!Number.isFinite(todayMax)) return { targetMinutes: null, capMinutes: null, reason: "Temps disponible non renseigné." };

    const cap = todayMax;
    if (!Number.isFinite(baselineMax)) {
      return { targetMinutes: cap, capMinutes: cap, reason: "Le temps disponible aujourd’hui fixe la limite." };
    }

    if (normalized.activityIntent === "gentle_return") {
      const gentle = clampToStep(Math.min(cap, baselineMax) * 0.75, 20, cap, 5);
      return {
        targetMinutes: gentle,
        capMinutes: cap,
        reason: "Reprise douce : départ sous le repère habituel, sans dépasser le temps disponible aujourd’hui.",
      };
    }

    const target = Math.min(cap, baselineMax);
    if (normalized.activityIntent === "maintain") {
      return {
        targetMinutes: target,
        capMinutes: cap,
        reason: "Maintien : le repère habituel est conservé dans la limite du temps disponible aujourd’hui.",
      };
    }

    // Progression : D103D ne pousse jamais automatiquement au-delà du repère habituel.
    // Il déclare seulement si une progression peut être discutée plus loin par le moteur.
    return {
      targetMinutes: target,
      capMinutes: cap,
      reason: "Progression : aucune augmentation automatique de durée ; le repère habituel reste le point de départ.",
    };
  }

  function deriveProgressionEligibility(normalized, caution) {
    if (normalized.activityIntent !== "progress") return false;
    if (normalized.functionalGoal !== "evolve") return false;
    if (caution.level !== "standard") return false;
    const energy = ENERGY_DELTA[normalized.today.energy];
    const discomfort = DISCOMFORT_RANK[normalized.today.discomfort];
    const baselineWalking = BASELINE_WALKING_RANK[normalized.baseline.walkingEase];
    const todayWalking = TODAY_WALKING_RANK[normalized.today.walkingEase];
    const walkingDelta = Number.isFinite(baselineWalking) && Number.isFinite(todayWalking)
      ? todayWalking - baselineWalking
      : null;
    return energy >= 0 && discomfort <= 1 && (walkingDelta === null || walkingDelta >= 0);
  }

  function derivePausePolicy(normalized, caution) {
    const habitual = normalized.baseline.pauses || null;
    const reviewNeeded = caution.level !== "standard";
    return {
      habitual,
      reviewNeeded,
      reason: reviewNeeded
        ? "L’état du jour justifie de revalider le besoin de pauses ; aucune fréquence supplémentaire n’est inventée."
        : "Le besoin habituel de pauses est conservé comme repère.",
    };
  }

  function derivePacePolicy(normalized, caution) {
    if (normalized.activityIntent === "gentle_return") {
      return { policy: "not_above_usual", reason: "Reprise douce : ne pas démarrer au-dessus du rythme habituel." };
    }
    if (caution.level !== "standard") {
      return { policy: "not_above_usual", reason: "État du jour plus contraignant : ne pas augmenter le rythme." };
    }
    if (normalized.activityIntent === "progress") {
      return { policy: "usual_first", reason: "Progression : partir du rythme habituel ; toute hausse doit rester explicite et validée plus loin." };
    }
    return { policy: "usual", reason: "Maintien : conserver le rythme habituel." };
  }

  function deriveAdaptation(input = {}) {
    const normalized = normalizeInput(input);
    if (normalized.activityIntent === "leisure") {
      return Object.freeze({
        schemaVersion: 1,
        status: "inactive",
        activityIntent: "leisure",
        reason: "Le mode Me balader n’utilise pas l’adaptation longitudinale.",
      });
    }

    const missing = missingFields(normalized);
    if (missing.length) {
      return Object.freeze({
        schemaVersion: 1,
        status: "needs_data",
        activityIntent: normalized.activityIntent,
        missing: Object.freeze(missing),
      });
    }

    const caution = deriveCaution(normalized);
    const duration = deriveDuration(normalized);
    const pausePolicy = derivePausePolicy(normalized, caution);
    const pacePolicy = derivePacePolicy(normalized, caution);
    const progressionEligible = deriveProgressionEligibility(normalized, caution);

    return Object.freeze({
      schemaVersion: 1,
      status: "ready",
      activityIntent: normalized.activityIntent,
      functionalGoal: normalized.functionalGoal,
      preparation: Object.freeze({
        durationMinutes: duration.targetMinutes,
        availableTimeCapMinutes: duration.capMinutes,
        safetyMarginMinutes: caution.safetyMarginMinutes,
        pacePolicy: pacePolicy.policy,
        pausePolicy: pausePolicy.habitual,
        pauseReviewNeeded: pausePolicy.reviewNeeded,
        progressionEligible,
        // Champs volontairement non dérivés : sémantiquement distincts des réponses D103C.
        fitness: null,
        fatigue: null,
        painIntensity: null,
      }),
      comparison: Object.freeze({
        energyDelta: ENERGY_DELTA[normalized.today.energy] ?? null,
        walkingDelta: (() => {
          const b = BASELINE_WALKING_RANK[normalized.baseline.walkingEase];
          const t = TODAY_WALKING_RANK[normalized.today.walkingEase];
          return Number.isFinite(b) && Number.isFinite(t) ? t - b : null;
        })(),
        discomfortLevel: DISCOMFORT_RANK[normalized.today.discomfort] ?? null,
      }),
      caution: Object.freeze(caution),
      explanations: Object.freeze([
        duration.reason,
        pacePolicy.reason,
        pausePolicy.reason,
        progressionEligible
          ? "Les réponses du jour permettent d’envisager une progression, sans augmentation automatique."
          : normalized.activityIntent === "progress"
            ? "Aucune progression automatique n’est engagée avec les réponses actuelles."
            : "Aucune progression n’est recherchée pour cette intention.",
      ]),
    });
  }

  globalThis.JMMJSActivityAdaptationCore = Object.freeze({
    LONGITUDINAL_INTENTS,
    BASELINE_DURATION_MAX,
    TODAY_TIME_MAX,
    deriveAdaptation,
  });
})();
/* JMMJS_ACTIVITY_ADAPTATION_CORE_END */
