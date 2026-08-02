/* JMMJS_LIMITATIONS_CORE_START */
(() => {
  "use strict";

  const SIDES = Object.freeze([
    "Non précisé",
    "Gauche",
    "Droit",
    "Bilatéral",
    "Non pertinent",
  ]);
  const TRIGGERS = Object.freeze([
    "Montée",
    "Descente",
    "Terrain irrégulier",
    "Durée",
    "Station debout",
    "Marche rapide",
    "Autre",
  ]);
  const CONSEQUENCES = Object.freeze([
    "Éviter",
    "Limiter",
    "Ralentir",
    "Prévoir une pause",
    "Prévoir un repli",
  ]);
  const TEMPORALITIES = Object.freeze([
    "Aujourd’hui",
    "Habituelle",
    "Permanente",
    "Seulement aujourd’hui",
  ]);

  const FieldRegistry = Object.freeze({
    limitationSide: {
      effect: "explanation",
      requiredData: [],
      unknownPolicy: "preserve-unknown",
    },
    limitationTrigger: {
      effect: "generation-audit",
      requiredData: ["confirmed-functional-effect"],
      unknownPolicy: "confirm",
    },
    limitationConsequence: {
      effect: "generation-audit",
      requiredData: ["confirmed-functional-effect"],
      unknownPolicy: "confirm",
    },
    limitationTemporality: {
      effect: "explanation",
      requiredData: [],
      unknownPolicy: "preserve-unknown",
    },
    maxWithoutPause: {
      effect: "generation-audit",
      requiredData: ["pause-plan"],
      unknownPolicy: "block-if-set",
    },
    maxStanding: {
      effect: "audit",
      requiredData: ["standing-duration"],
      unknownPolicy: "block-if-set",
    },
    helperAvailable: {
      effect: "preparation",
      requiredData: [],
      unknownPolicy: "preserve-unknown",
    },
    limitationConfirmed: {
      effect: "confirmation",
      requiredData: ["confirmed-functional-effect"],
      unknownPolicy: "confirm",
    },
  });

  function finitePositiveOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function enumOr(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function normalizeFunctionalLimitation(value = {}) {
    return {
      side: enumOr(value.side, SIDES, "Non précisé"),
      trigger: enumOr(value.trigger, TRIGGERS, ""),
      consequence: enumOr(value.consequence, CONSEQUENCES, ""),
      temporality: enumOr(value.temporality, TEMPORALITIES, "Aujourd’hui"),
      maxWithoutPauseMinutes: finitePositiveOrNull(
        value.maxWithoutPauseMinutes,
      ),
      maxStandingMinutes: finitePositiveOrNull(value.maxStandingMinutes),
      helperAvailable:
        value.helperAvailable === true
          ? true
          : value.helperAvailable === false
            ? false
            : null,
      confirmed: value.confirmed === true,
    };
  }

  function hasFunctionalLimitation(value = {}) {
    const item = normalizeFunctionalLimitation(value);
    return Boolean(
      item.trigger ||
        item.consequence ||
        item.maxWithoutPauseMinutes !== null ||
        item.maxStandingMinutes !== null,
    );
  }

  function validateFunctionalLimitation(value = {}) {
    const item = normalizeFunctionalLimitation(value);
    if (!hasFunctionalLimitation(item)) return [];
    const issues = [];
    if (!item.trigger) issues.push("Choisissez le déclencheur principal.");
    if (!item.consequence)
      issues.push("Choisissez la conséquence fonctionnelle recherchée.");
    if (!item.confirmed)
      issues.push("Confirmez explicitement cette conséquence fonctionnelle.");
    return issues;
  }

  function describeFunctionalLimitation(value = {}) {
    const item = normalizeFunctionalLimitation(value);
    const parts = [];
    if (item.trigger) parts.push(`déclencheur : ${item.trigger.toLowerCase()}`);
    if (item.consequence)
      parts.push(`conséquence confirmée : ${item.consequence.toLowerCase()}`);
    if (item.side !== "Non précisé")
      parts.push(`côté déclaré : ${item.side.toLowerCase()}`);
    parts.push(`temporalité : ${item.temporality.toLowerCase()}`);
    if (item.maxWithoutPauseMinutes !== null)
      parts.push(`${item.maxWithoutPauseMinutes} min maximum sans pause`);
    if (item.maxStandingMinutes !== null)
      parts.push(`${item.maxStandingMinutes} min maximum debout`);
    if (item.helperAvailable !== null)
      parts.push(
        item.helperAvailable
          ? "accompagnant capable d’aider : oui"
          : "accompagnant capable d’aider : non",
      );
    return parts.join(" · ");
  }

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function prepareRequestWithFunctionalLimitations(request = {}) {
    const next = clone(request);
    const profile = normalizeFunctionalLimitation(next.functionalLimitation);
    next.functionalLimitation = profile;
    next.derivedFunctionalRules = (next.derivedFunctionalRules || []).filter(
      (rule) => rule.source !== "D-024",
    );
    if (
      !profile.confirmed ||
      !profile.trigger ||
      !profile.consequence
    )
      return next;

    const rules = next.derivedFunctionalRules;
    const addRule = (id, label, severity, auditKind, data = {}) =>
      rules.push({
        id,
        label,
        severity,
        auditKind,
        source: "D-024",
        trigger: profile.trigger,
        consequence: profile.consequence,
        temporality: profile.temporality,
        ...data,
      });
    const avoid = profile.consequence === "Éviter";
    const imperativeOrAdvisory = avoid ? "hard" : "advisory";

    next.effort = next.effort || {};
    next.person = next.person || {};
    next.options = next.options || {};
    next.hardConstraints = next.hardConstraints || {};
    next.terrain = Array.isArray(next.terrain) ? next.terrain : [];

    if (profile.trigger === "Terrain irrégulier") {
      if (avoid && !next.terrain.includes("Terrain régulier"))
        next.terrain.push("Terrain régulier");
      addRule(
        "functional-regularity",
        avoid ? "Terrain régulier obligatoire" : "Terrain régulier privilégié",
        imperativeOrAdvisory,
        "regularity",
        { unknownPolicy: avoid ? "manual_review" : "warn" },
      );
    }

    if (["Montée", "Descente"].includes(profile.trigger)) {
      const field =
        profile.trigger === "Montée"
          ? "maxAscentSlopePercent"
          : "maxDescentSlopePercent";
      const explicitThreshold = finitePositiveOrNull(next.effort[field]);
      const derivedThreshold = avoid && explicitThreshold === null ? 4 : null;
      if (derivedThreshold !== null) next.effort[field] = derivedThreshold;
      addRule(
        profile.trigger === "Montée"
          ? "functional-ascent"
          : "functional-descent",
        `${profile.trigger} ${avoid ? "à éviter" : "à adapter"}`,
        imperativeOrAdvisory,
        profile.trigger === "Montée" ? "ascent-slope" : "descent-slope",
        {
          thresholdPercent: explicitThreshold ?? derivedThreshold,
          thresholdOrigin:
            explicitThreshold !== null
              ? "user"
              : derivedThreshold !== null
                ? "prudent-default"
                : "none",
          unknownPolicy: avoid ? "manual_review" : "warn",
        },
      );
    }

    if (profile.maxWithoutPauseMinutes !== null) {
      next.functionalPausePlan = {
        intervalMinutes: profile.maxWithoutPauseMinutes,
        claim: "pause programmée, sans lieu de pause ni banc présumé",
      };
      addRule(
        "functional-max-without-pause",
        "Durée maximale sans pause",
        "hard",
        "pause-plan",
        {
          thresholdMinutes: profile.maxWithoutPauseMinutes,
          unknownPolicy: "manual_review",
        },
      );
    }

    if (profile.maxStandingMinutes !== null)
      addRule(
        "functional-max-standing",
        "Durée maximale debout",
        "hard",
        "standing-duration",
        {
          thresholdMinutes: profile.maxStandingMinutes,
          unknownPolicy: "manual_review",
        },
      );

    if (profile.consequence === "Prévoir une pause") {
      const threshold =
        profile.maxWithoutPauseMinutes ?? profile.maxStandingMinutes;
      if (threshold !== null)
        next.functionalPausePlan = {
          intervalMinutes: threshold,
          claim: "pause programmée, sans lieu de pause ni banc présumé",
        };
      addRule(
        "functional-pause",
        threshold === null
          ? "Seuil de pause à confirmer"
          : `Pause au plus tard après ${threshold} min`,
        "hard",
        "pause-plan",
        {
          thresholdMinutes: threshold,
          unknownPolicy: "manual_review",
          noBenchClaim: true,
        },
      );
    }

    if (profile.consequence === "Prévoir un repli") {
      next.options.shortcuts = true;
      next.hardConstraints.requireShortcuts = true;
      addRule(
        "functional-fallback",
        "Raccourci ou repli réel demandé",
        "hard",
        "fallback",
        { unknownPolicy: "manual_review", requiresGeometry: true },
      );
    }

    if (
      profile.trigger === "Marche rapide" &&
      profile.consequence === "Ralentir"
    ) {
      const selectedPace = finitePositiveOrNull(next.person.paceKmh) || 3.2;
      const targetPace = Math.max(1, Math.round(selectedPace * 0.8 * 10) / 10);
      next.person.paceKmh = targetPace;
      addRule(
        "functional-pace",
        `Allure cible réduite de ${selectedPace} à ${targetPace} km/h`,
        "advisory",
        "pace",
        {
          selectedPaceKmh: selectedPace,
          targetPaceKmh: targetPace,
          unknownPolicy: "warn",
        },
      );
    }

    const alreadyCovered = rules.some(
      (rule) => rule.source === "D-024" && rule.trigger === profile.trigger,
    );
    if (!alreadyCovered)
      addRule(
        "functional-manual-review",
        `${profile.trigger} : ${profile.consequence.toLowerCase()}`,
        avoid ? "hard" : "advisory",
        "manual-review",
        { unknownPolicy: avoid ? "manual_review" : "warn" },
      );

    return next;
  }

  function auditFunctionalRules(route = {}, compiled = {}, status = {}) {
    const RESPECTED = status.RESPECTED || "respected";
    const VIOLATED = status.VIOLATED || "violated";
    const UNKNOWN = status.UNKNOWN || "unknown";
    const known = (value) =>
      value !== null && value !== undefined && Number.isFinite(Number(value));
    const rules = compiled.functionalRules || [];
    return rules.map((rule) => {
      let result = UNKNOWN;
      let evidence = "donnée nécessaire absente : À vérifier";
      if (rule.auditKind === "regularity") {
        if (typeof route.regularitySafe === "boolean") {
          result = route.regularitySafe ? RESPECTED : VIOLATED;
          evidence = route.regularitySafe
            ? "régularité documentée"
            : "terrain irrégulier documenté";
        } else evidence = "régularité non documentée : À vérifier";
      } else if (
        rule.auditKind === "ascent-slope" ||
        rule.auditKind === "descent-slope"
      ) {
        const value =
          rule.auditKind === "ascent-slope"
            ? route.maxUpPercent
            : route.maxDownPercent;
        if (known(value) && known(rule.thresholdPercent)) {
          result = Number(value) <= Number(rule.thresholdPercent)
            ? RESPECTED
            : VIOLATED;
          evidence = `${Number(value)} % pour ${Number(rule.thresholdPercent)} % maximum`;
        } else evidence = "pente ou seuil absent : À vérifier";
      } else if (rule.auditKind === "pause-plan") {
        const planned = compiled.functional?.pauseIntervalMinutes;
        if (known(rule.thresholdMinutes) && known(planned)) {
          result = Number(planned) <= Number(rule.thresholdMinutes)
            ? RESPECTED
            : VIOLATED;
          evidence = `pause programmée au plus tard après ${planned} min ; aucun banc ni lieu de pause présumé`;
        } else evidence = "seuil ou plan de pause non confirmé : À vérifier";
      } else if (rule.auditKind === "standing-duration") {
        if (known(route.maxStandingMinutes)) {
          result = Number(route.maxStandingMinutes) <= Number(rule.thresholdMinutes)
            ? RESPECTED
            : VIOLATED;
          evidence = `${Number(route.maxStandingMinutes)} min debout pour ${Number(rule.thresholdMinutes)} min maximum`;
        } else evidence = "durée debout non mesurée : À vérifier";
      } else if (rule.auditKind === "fallback") {
        if (Array.isArray(route.shortcuts)) {
          result = route.shortcuts.length ? RESPECTED : VIOLATED;
          evidence = route.shortcuts.length
            ? `${route.shortcuts.length} repli(s) calculé(s)`
            : "aucun repli réel calculé";
        } else evidence = "repli non calculé : À vérifier";
      } else if (rule.auditKind === "pace") {
        result = RESPECTED;
        evidence = `allure cible expliquée : ${rule.targetPaceKmh} km/h`;
      } else evidence = "conséquence confirmée mais non vérifiable automatiquement : À vérifier";
      return {
        id: rule.id,
        label: rule.label,
        severity: rule.severity,
        status: result,
        evidence,
        source: "D-024",
      };
    });
  }

  globalThis.JMMJSLimitationsCore = Object.freeze({
    SIDES,
    TRIGGERS,
    CONSEQUENCES,
    TEMPORALITIES,
    FieldRegistry,
    normalizeFunctionalLimitation,
    hasFunctionalLimitation,
    validateFunctionalLimitation,
    describeFunctionalLimitation,
    prepareRequestWithFunctionalLimitations,
    auditFunctionalRules,
  });
})();
/* JMMJS_LIMITATIONS_CORE_END */
