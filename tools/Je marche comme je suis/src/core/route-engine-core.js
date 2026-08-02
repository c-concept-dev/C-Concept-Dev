/* JMMJS_ROUTE_ENGINE_CORE_START */
(() => {
  "use strict";

  const STATUS = Object.freeze({
    RESPECTED: "respected",
    VIOLATED: "violated",
    UNKNOWN: "unknown",
  });

  const ConstraintRegistry = Object.freeze({
    ...(globalThis.JMMJSLimitationsCore?.FieldRegistry || {}),
    place: {
      effect: "generation",
      requiredData: ["geocoding"],
      unknownPolicy: "block",
    },
    lat: {
      effect: "generation",
      requiredData: ["coordinate"],
      unknownPolicy: "fallback-place",
    },
    lon: {
      effect: "generation",
      requiredData: ["coordinate"],
      unknownPolicy: "fallback-place",
    },
    returnRadius: {
      effect: "audit",
      requiredData: ["geometry"],
      unknownPolicy: "block",
    },
    returnTime: {
      effect: "generation-audit",
      requiredData: ["clock"],
      unknownPolicy: "block",
    },
    duration: {
      effect: "generation-audit",
      requiredData: ["duration"],
      unknownPolicy: "block",
    },
    timeIncludes: {
      effect: "generation-audit",
      requiredData: ["pause-plan"],
      unknownPolicy: "block",
    },
    margin: {
      effect: "generation-audit",
      requiredData: ["duration"],
      unknownPolicy: "block",
    },
    pace: {
      effect: "generation",
      requiredData: ["duration"],
      unknownPolicy: "use-prudent-default",
    },
    age: {
      effect: "explanation",
      requiredData: [],
      unknownPolicy: "allow",
    },
    level: {
      effect: "generation-ranking",
      requiredData: [],
      unknownPolicy: "use-prudent-default",
    },
    company: {
      effect: "generation-audit",
      requiredData: [],
      unknownPolicy: "allow",
    },
    fitness: {
      effect: "generation",
      requiredData: [],
      unknownPolicy: "use-prudent-default",
    },
    fatigue: {
      effect: "generation-audit",
      requiredData: ["shortcuts"],
      unknownPolicy: "use-prudent-default",
    },
    pain: {
      effect: "generation-audit",
      requiredData: ["functional-effects"],
      unknownPolicy: "confirm",
    },
    balance: {
      effect: "generation-audit",
      requiredData: ["surface", "width"],
      unknownPolicy: "block-if-imperative",
    },
    painDetail: {
      effect: "explanation",
      requiredData: ["structured-limitations"],
      unknownPolicy: "confirm",
    },
    footwear: {
      effect: "generation-audit",
      requiredData: ["surface"],
      unknownPolicy: "block",
    },
    equipment: {
      effect: "generation-audit",
      requiredData: ["surface", "width", "kerb", "steps"],
      unknownPolicy: "block-if-imperative",
    },
    limits: {
      effect: "generation-audit",
      requiredData: ["surface", "slope", "width", "services"],
      unknownPolicy: "block-if-imperative",
    },
    noStairs: {
      effect: "generation-audit",
      requiredData: ["steps"],
      unknownPolicy: "block",
    },
    noExposure: {
      effect: "audit",
      requiredData: ["exposure"],
      unknownPolicy: "block",
    },
    effort: {
      effect: "generation-ranking",
      requiredData: ["elevation"],
      unknownPolicy: "rank-only",
    },
    ascentMinutes: {
      effect: "generation-audit",
      requiredData: ["elevation", "segment-times"],
      unknownPolicy: "block-if-set",
    },
    upSlope: {
      effect: "generation-audit",
      requiredData: ["steepness"],
      unknownPolicy: "block-if-set",
    },
    downSlope: {
      effect: "generation-audit",
      requiredData: ["steepness"],
      unknownPolicy: "block-if-set",
    },
    recovery: {
      effect: "audit",
      requiredData: ["elevation", "segment-times", "benches"],
      unknownPolicy: "block-if-set",
    },
    terrain: {
      effect: "generation-ranking-audit",
      requiredData: ["surface", "waytype", "traffic"],
      unknownPolicy: "preserve-unknown",
    },
    weather: {
      effect: "generation-audit",
      requiredData: ["observed-weather"],
      unknownPolicy: "preserve-unknown",
    },
    wishes: {
      effect: "generation-ranking",
      requiredData: ["green", "noise", "pois"],
      unknownPolicy: "rank-only",
    },
    pauses: {
      effect: "generation-audit",
      requiredData: ["pause-places"],
      unknownPolicy: "block-if-required",
    },
    services: {
      effect: "generation-audit",
      requiredData: ["pois"],
      unknownPolicy: "block",
    },
    freeText: {
      effect: "explanation-confirmation",
      requiredData: ["structured-limitations"],
      unknownPolicy: "confirm",
    },
    strict: {
      effect: "selection",
      requiredData: [],
      unknownPolicy: "block-unknown-hard",
    },
    shortcuts: {
      effect: "generation-audit",
      requiredData: ["shortcut-routes"],
      unknownPolicy: "block-if-required",
    },
    bothWays: {
      effect: "generation-audit",
      requiredData: ["reverse-audit"],
      unknownPolicy: "block-if-required",
    },
    private: {
      effect: "persistence",
      requiredData: [],
      unknownPolicy: "allow",
    },
    gpxFile: {
      effect: "route-source",
      requiredData: ["geometry"],
      unknownPolicy: "block",
    },
  });

  const ChoiceRegistry = Object.freeze({
    equipment: Object.freeze(
      Object.fromEntries(
        [
          "Canne",
          "Bâtons",
          "Déambulateur",
          "Poussette",
          "Fauteuil roulant",
          "Sac lourd",
          "Eau",
          "Téléphone chargé",
        ].map((value) => [value, { effect: "generation-audit" }]),
      ),
    ),
    limits: Object.freeze(
      Object.fromEntries(
        [
          "Montée difficile",
          "Descente difficile",
          "Terrain irrégulier",
          "Genoux",
          "Hanches",
          "Chevilles",
          "Pieds",
          "Dos",
          "Essoufflement",
          "Fatigue rapide",
          "Équilibre",
          "Vertiges",
          "Peur du vide",
          "Escaliers",
          "Station debout",
          "Pauses fréquentes",
          "Toilettes",
          "Rester près du départ",
          "Rester près d’une route",
        ].map((value) => [value, { effect: "generation-audit" }]),
      ),
    ),
    terrain: Object.freeze(
      Object.fromEntries(
        [
          "Goudron accepté",
          "Chemin stabilisé",
          "Voie verte",
          "Terre sèche",
          "Sentier naturel",
          "Terrain régulier",
          "Peu de pierres",
          "Peu de racines",
          "Pas de boue",
          "Chemin large",
          "Peu de circulation",
          "Peu de traversées",
        ].map((value) => [value, { effect: "generation-ranking-audit" }]),
      ),
    ),
    wishes: Object.freeze(
      Object.fromEntries(
        [
          "Point de vue",
          "Rivière",
          "Lac",
          "Forêt",
          "Ombre",
          "Village",
          "Patrimoine",
          "Curiosité locale",
          "Boulangerie",
          "Café",
          "Restaurant",
          "Pique-nique",
          "Bancs",
          "Calme",
          "Peu de goudron",
          "Photo",
        ].map((value) => [value, { effect: "generation-ranking" }]),
      ),
    ),
    services: Object.freeze(
      Object.fromEntries(
        [
          "Toilettes",
          "Eau potable",
          "Banc",
          "Pharmacie",
          "Parking",
          "Transport public",
          "Réseau téléphonique",
        ].map((value) => [
          value,
          { effect: "generation-audit", severity: "hard" },
        ]),
      ),
    ),
  });

  const SURFACE_RULES = Object.freeze({
    "Pieds nus": [2, 8, 10, 11, 12, 13, 14, 15, 17],
    "Tongs ou claquettes": [2, 8, 10, 11, 12, 13, 14, 15, 17],
    Sandales: [10, 12, 13, 14, 15],
    "Chaussures de ville": [2, 8, 10, 11, 12, 13, 14, 15, 17],
    Sneakers: [12, 13, 15],
    "Baskets classiques": [12, 13, 15],
    Running: [12, 13, 15],
    Trail: [13],
    "Randonnée basses": [13],
    "Randonnée montantes": [13],
  });

  const has = (items, value) => (items || []).includes(value);
  const finite = (value) =>
    value === null || value === undefined || value === ""
      ? null
      : Number.isFinite(Number(value))
        ? Number(value)
        : null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function pauseMinutes(plan, availableMinutes) {
    if (!plan || plan === "Aucune pause programmée") return 0;
    if (plan === "Toutes les 15 minutes")
      return Math.max(5, Math.floor(availableMinutes / 15) * 3);
    if (plan === "Toutes les 30 minutes")
      return Math.max(5, Math.floor(availableMinutes / 30) * 5);
    if (plan === "Dans un café") return 20;
    return 5;
  }

  function clockBudget(returnTime, now = new Date()) {
    if (!returnTime) return null;
    const parts = String(returnTime).split(":").map(Number);
    if (parts.length !== 2 || parts.some((x) => !Number.isFinite(x))) return 0;
    const deadline = new Date(now);
    deadline.setHours(parts[0], parts[1], 0, 0);
    return Math.max(
      0,
      Math.floor((deadline.getTime() - now.getTime()) / 60000),
    );
  }

  function compileConstraints(request, now = new Date()) {
    const limitations = request.limitations || [];
    const equipment = request.equipment || [];
    const terrain = request.terrain || [];
    const preferences = request.preferences || [];
    const derived = [];
    const functionalRules = Array.isArray(request.derivedFunctionalRules)
      ? request.derivedFunctionalRules
      : [];
    derived.push(...functionalRules.map((rule) => rule.label));
    const explicitDuration = Math.max(
      0,
      finite(request.time?.availableMinutes) || 0,
    );
    const clock = clockBudget(request.time?.returnTime, now);
    const available =
      clock === null ? explicitDuration : Math.min(explicitDuration, clock);
    const margin = clamp(
      finite(request.time?.safetyMarginMinutes) || 0,
      0,
      available,
    );
    const pauses =
      request.time?.includes === "walk_only"
        ? 0
        : pauseMinutes(request.pausePlan, available);
    const walkingBudgetMinutes = Math.max(0, available - margin - pauses);

    let paceKmh = clamp(finite(request.person?.paceKmh) || 3.2, 1, 7);
    const fatigue = finite(request.dailyState?.fatigue) || 0;
    const fitness = finite(request.dailyState?.fitness) || 3;
    if (fatigue >= 4 || fitness <= 2 || has(equipment, "Sac lourd")) {
      paceKmh *= 0.8;
      derived.push(
        "Allure de calcul réduite de 20 % pour l’état du jour ou le sac lourd.",
      );
    }

    const mobilityAid = equipment.some((x) =>
      ["Canne", "Déambulateur", "Poussette", "Fauteuil roulant"].includes(x),
    );
    const avoidStairs = Boolean(
      request.hardConstraints?.avoidStairs ||
        has(limitations, "Escaliers") ||
        mobilityAid,
    );
    const avoidExposure = Boolean(
      request.hardConstraints?.avoidExposure ||
        has(limitations, "Peur du vide") ||
        has(limitations, "Vertiges"),
    );
    if (avoidStairs && !request.hardConstraints?.avoidStairs)
      derived.push(
        "Escaliers évités en raison des limitations ou de l’équipement.",
      );
    if (avoidExposure && !request.hardConstraints?.avoidExposure)
      derived.push(
        "Passages exposés exclus en raison des vertiges ou de la peur du vide.",
      );

    const explicitMaxUp = finite(request.effort?.maxAscentSlopePercent);
    const explicitMaxDown = finite(request.effort?.maxDescentSlopePercent);
    const suggestedMaxUp =
      explicitMaxUp === null &&
      (has(limitations, "Montée difficile") ||
        has(limitations, "Essoufflement"))
        ? 6
        : null;
    const suggestedMaxDown =
      explicitMaxDown === null &&
      (has(limitations, "Descente difficile") || has(limitations, "Genoux"))
        ? 4
        : null;
    if (suggestedMaxUp !== null)
      derived.push(
        `Pente montante de ${suggestedMaxUp} % privilégiée, sans en faire une interdiction implicite.`,
      );
    if (suggestedMaxDown !== null)
      derived.push(
        `Pente descendante de ${suggestedMaxDown} % privilégiée, sans en faire une interdiction implicite.`,
      );

    const explicitRegular = has(terrain, "Terrain régulier");
    const suggestedRegular = Boolean(
      has(limitations, "Terrain irrégulier") ||
        has(limitations, "Équilibre") ||
        has(limitations, "Chevilles") ||
        has(limitations, "Pieds"),
    );
    const requireRegular = mobilityAid || explicitRegular;
    const requireWide = mobilityAid || has(terrain, "Chemin large");
    const suggestedShortcuts = Boolean(
      fatigue >= 4 ||
        has(limitations, "Fatigue rapide") ||
        has(limitations, "Rester près du départ"),
    );
    const requireShortcuts = Boolean(request.hardConstraints?.requireShortcuts);
    if (suggestedRegular && !requireRegular)
      derived.push(
        "Terrain régulier privilégié en raison de la limitation déclarée ; sa présence doit être vérifiée si la donnée manque.",
      );
    if (suggestedShortcuts && !requireShortcuts)
      derived.push(
        "Parcours courts et proches du départ privilégiés ; aucun raccourci n’est rendu impératif sans demande explicite.",
      );
    const returnRadiusMeters = Number.isFinite(
      Number(request.start?.returnRadius),
    )
      ? Number(request.start.returnRadius)
      : 50;
    const pauseServices =
      request.pausePlan === "Avec un banc"
        ? ["Banc"]
        : request.pausePlan === "Près de toilettes"
          ? ["Toilettes"]
          : [];
    const requiredServices = [
      ...new Set([
        ...(request.requiredServices || []),
        ...(has(limitations, "Toilettes") ? ["Toilettes"] : []),
        ...pauseServices,
      ]),
    ];

    const weightings = {};
    if (
      has(preferences, "Forêt") ||
      has(preferences, "Ombre") ||
      has(preferences, "Rivière") ||
      has(preferences, "Lac")
    )
      weightings.green = { factor: 1 };
    if (has(preferences, "Calme") || has(terrain, "Peu de circulation"))
      weightings.quiet = { factor: 1 };
    const profile = has(equipment, "Fauteuil roulant")
      ? "wheelchair"
      : "foot-walking";
    const restrictions =
      profile === "wheelchair"
        ? {
            surface_type: "cobblestone:flattened",
            track_type: "grade1",
            smoothness_type: "good",
            maximum_sloped_kerb: 0.06,
            maximum_incline:
              [3, 6, 10, 15].find((x) => x >= (explicitMaxUp || suggestedMaxUp || 6)) || 15,
            minimum_width: requireWide ? 1.2 : undefined,
          }
        : null;

    return {
      request,
      derived,
      time: {
        explicitDuration,
        clockBudgetMinutes: clock,
        availableMinutes: available,
        marginMinutes: margin,
        pauseMinutes: pauses,
        walkingBudgetMinutes,
      },
      targetMeters: Math.round(((walkingBudgetMinutes * paceKmh) / 60) * 1000),
      paceKmh,
      hard: {
        avoidStairs,
        avoidExposure,
        maxUp: explicitMaxUp,
        maxDown: explicitMaxDown,
        requireRegular,
        requireWide,
        requireShortcuts,
        compareDirections: Boolean(request.options?.compareDirections),
        returnRadiusMeters,
        requiredServices,
      },
      advisory: {
        maxUp: suggestedMaxUp,
        maxDown: suggestedMaxDown,
        preferRegular: suggestedRegular,
        preferShortcuts: suggestedShortcuts,
      },
      functionalRules,
      functional: {
        pauseIntervalMinutes: finite(
          request.functionalPausePlan?.intervalMinutes,
        ),
      },
      footwearForbiddenSurfaceIds: SURFACE_RULES[request.footwear] || [],
      routing: {
        profile,
        avoidFeatures: avoidStairs ? ["steps"] : [],
        weightings,
        restrictions,
      },
    };
  }

  function auditRoute(route, compiled) {
    const checks = [];
    const add = (id, label, severity, status, evidence) =>
      checks.push({ id, label, severity, status, evidence });
    const known = (value) =>
      value !== null && value !== undefined && Number.isFinite(Number(value));
    const hard = compiled.hard;
    const totalMinutes = known(route.totalMinutes)
      ? Number(route.totalMinutes)
      : known(route.walkingMinutes)
        ? Number(route.walkingMinutes) + compiled.time.pauseMinutes
        : null;
    add(
      "time",
      "Durée, pauses et marge",
      "hard",
      known(totalMinutes)
        ? totalMinutes <=
          compiled.time.availableMinutes - compiled.time.marginMinutes
          ? STATUS.RESPECTED
          : STATUS.VIOLATED
        : STATUS.UNKNOWN,
      known(totalMinutes)
        ? `${Math.round(totalMinutes)} min pour ${compiled.time.availableMinutes - compiled.time.marginMinutes} min utilisables`
        : "durée totale absente",
    );
    add(
      "return",
      "Retour au point demandé",
      "hard",
      known(route.startEndDistanceMeters)
        ? route.startEndDistanceMeters <= hard.returnRadiusMeters
          ? STATUS.RESPECTED
          : STATUS.VIOLATED
        : STATUS.UNKNOWN,
      known(route.startEndDistanceMeters)
        ? `${Math.round(route.startEndDistanceMeters)} m du départ`
        : "fermeture de boucle non mesurée",
    );
    if (hard.avoidStairs)
      add(
        "stairs",
        "Aucun escalier",
        "hard",
        known(route.stairsMeters)
          ? Number(route.stairsMeters) === 0
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.stairsMeters)
          ? `${Math.round(route.stairsMeters)} m détectés`
          : "marches non documentées",
      );
    if (hard.avoidExposure)
      add(
        "exposure",
        "Aucun passage exposé",
        "hard",
        typeof route.exposureSafe === "boolean"
          ? route.exposureSafe
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        typeof route.exposureSafe === "boolean"
          ? "donnée d’exposition disponible"
          : "exposition non documentée",
      );
    if (hard.maxUp !== null)
      add(
        "up-slope",
        "Pente montante maximale",
        "hard",
        known(route.maxUpPercent)
          ? route.maxUpPercent <= hard.maxUp
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.maxUpPercent)
          ? `${route.maxUpPercent} % pour ${hard.maxUp} % maximum`
          : "pente montante absente",
      );
    if (hard.maxDown !== null)
      add(
        "down-slope",
        "Pente descendante maximale",
        "hard",
        known(route.maxDownPercent)
          ? route.maxDownPercent <= hard.maxDown
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.maxDownPercent)
          ? `${route.maxDownPercent} % pour ${hard.maxDown} % maximum`
          : "pente descendante absente",
      );
    const ascentRequest = compiled.request.effort?.maxContinuousAscentMinutes;
    if (ascentRequest === "none")
      add(
        "continuous-ascent",
        "Aucune montée",
        "hard",
        known(route.ascentMeters)
          ? route.ascentMeters < 5
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.ascentMeters)
          ? `${Math.round(route.ascentMeters)} m D+`
          : "altitude absente",
      );
    else if (ascentRequest)
      add(
        "continuous-ascent",
        "Montée continue maximale",
        "hard",
        known(route.maxContinuousAscentMinutes)
          ? route.maxContinuousAscentMinutes <= Number(ascentRequest)
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.maxContinuousAscentMinutes)
          ? `${Math.round(route.maxContinuousAscentMinutes)} min pour ${ascentRequest} min maximum`
          : "durée des montées continues non calculée",
      );
    if (compiled.request.effort?.recovery)
      add(
        "recovery",
        "Récupération après montée",
        "hard",
        typeof route.recoverySatisfied === "boolean"
          ? route.recoverySatisfied
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        typeof route.recoverySatisfied === "boolean"
          ? "séquence de récupération analysée"
          : "récupération non calculée",
      );
    const surfaces = Array.isArray(route.surfaces) ? route.surfaces : [];
    const incompatible = surfaces.filter(
      (x) =>
        compiled.footwearForbiddenSurfaceIds.includes(Number(x.id)) &&
        Number(x.percent || x.amount || 0) > 0,
    );
    add(
      "footwear",
      "Chaussures et surfaces",
      "hard",
      surfaces.length
        ? incompatible.length
          ? STATUS.VIOLATED
          : STATUS.RESPECTED
        : STATUS.UNKNOWN,
      surfaces.length
        ? incompatible.length
          ? incompatible
              .map(
                (x) =>
                  `${x.type || x.id} ${Math.round(x.percent || x.amount)} %`,
              )
              .join(", ")
          : "aucune incompatibilité documentée"
        : "surfaces non documentées",
    );
    if (hard.requireRegular)
      add(
        "regularity",
        "Terrain suffisamment régulier",
        "hard",
        typeof route.regularitySafe === "boolean"
          ? route.regularitySafe
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        typeof route.regularitySafe === "boolean"
          ? "régularité documentée"
          : "régularité non documentée",
      );
    if (hard.requireWide)
      add(
        "width",
        "Chemin suffisamment large",
        "hard",
        known(route.minimumWidthMeters)
          ? route.minimumWidthMeters >= 1.2
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.minimumWidthMeters)
          ? `${route.minimumWidthMeters} m minimum`
          : "largeur non documentée",
      );
    for (const service of hard.requiredServices) {
      const value = route.services?.[service];
      add(
        `service:${service}`,
        `Service impératif : ${service}`,
        "hard",
        typeof value === "boolean"
          ? value
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        typeof value === "boolean"
          ? value
            ? "service trouvé dans le rayon admis"
            : "service absent du rayon admis"
          : "service non recherché",
      );
    }
    if (hard.requireShortcuts)
      add(
        "shortcuts",
        "Raccourci ou retour prudent",
        "hard",
        Array.isArray(route.shortcuts)
          ? route.shortcuts.length
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        Array.isArray(route.shortcuts)
          ? `${route.shortcuts.length} repli(s) calculé(s)`
          : "replis non calculés",
      );
    if (hard.compareDirections)
      add(
        "directions",
        "Comparaison des deux sens",
        "hard",
        typeof route.directionsCompared === "boolean"
          ? route.directionsCompared
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        route.directionsCompared
          ? "deux sens analysés"
          : "comparaison non réalisée",
      );
    const advisory = compiled.advisory || {};
    if (advisory.maxUp !== null && advisory.maxUp !== undefined)
      add(
        "advisory-up-slope",
        "Montée prudente privilégiée",
        "advisory",
        known(route.maxUpPercent)
          ? route.maxUpPercent <= advisory.maxUp
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.maxUpPercent)
          ? `${route.maxUpPercent} % ; préférence prudente ${advisory.maxUp} %`
          : "pente montante absente",
      );
    if (advisory.maxDown !== null && advisory.maxDown !== undefined)
      add(
        "advisory-down-slope",
        "Descente prudente privilégiée",
        "advisory",
        known(route.maxDownPercent)
          ? route.maxDownPercent <= advisory.maxDown
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.maxDownPercent)
          ? `${route.maxDownPercent} % ; préférence prudente ${advisory.maxDown} %`
          : "pente descendante absente",
      );
    if (advisory.preferRegular && !hard.requireRegular)
      add(
        "advisory-regularity",
        "Terrain régulier privilégié",
        "advisory",
        typeof route.regularitySafe === "boolean"
          ? route.regularitySafe
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        typeof route.regularitySafe === "boolean"
          ? "régularité documentée"
          : "régularité à vérifier avant de partir",
      );
    if (advisory.preferShortcuts && !hard.requireShortcuts)
      add(
        "advisory-shortcuts",
        "Retour facile privilégié",
        "advisory",
        Array.isArray(route.shortcuts)
          ? route.shortcuts.length
            ? STATUS.RESPECTED
            : STATUS.UNKNOWN
          : STATUS.UNKNOWN,
        Array.isArray(route.shortcuts) && route.shortcuts.length
          ? `${route.shortcuts.length} repli(s) calculé(s)`
          : "repli non prouvé ; rester attentif à la proximité du départ",
      );
    const auditFunctionalRules =
      globalThis.JMMJSLimitationsCore?.auditFunctionalRules;
    if (typeof auditFunctionalRules === "function")
      checks.push(...auditFunctionalRules(route, compiled, STATUS));
    const blocking = checks.filter(
      (x) => x.severity === "hard" && x.status !== STATUS.RESPECTED,
    );
    return {
      admissible: blocking.length === 0,
      checks,
      violations: checks.filter((x) => x.status === STATUS.VIOLATED),
      unknowns: checks.filter((x) => x.status === STATUS.UNKNOWN),
      blocking,
    };
  }

  globalThis.JMMJSRouteEngineCore = Object.freeze({
    STATUS,
    ConstraintRegistry,
    ChoiceRegistry,
    SURFACE_RULES,
    compileConstraints,
    auditRoute,
    pauseMinutes,
    clockBudget,
  });
})();
/* JMMJS_ROUTE_ENGINE_CORE_END */
