/* JMMJS_ROUTE_ENGINE_CORE_START */
(() => {
  "use strict";

  const STATUS = Object.freeze({
    RESPECTED: "respected",
    VIOLATED: "violated",
    UNKNOWN: "unknown",
  });

  const ConstraintRegistry = Object.freeze({
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
    departureMode: {
      effect: "generation-context",
      requiredData: ["departure-schedule"],
      unknownPolicy: "use-now",
    },
    departureDate: {
      effect: "generation-context",
      requiredData: ["departure-schedule"],
      unknownPolicy: "required-if-scheduled",
    },
    departureTime: {
      effect: "generation-context",
      requiredData: ["departure-schedule"],
      unknownPolicy: "required-if-scheduled",
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
    limitationConfirmed: {
      effect: "generation-audit",
      requiredData: ["confirmed-functional-effect"],
      unknownPolicy: "confirm",
    },
    maxWithoutPause: {
      effect: "generation-audit",
      requiredData: ["segment-times"],
      unknownPolicy: "block-if-set",
    },
    maxStanding: {
      effect: "generation-audit",
      requiredData: ["pause-places"],
      unknownPolicy: "block-if-set",
    },
    helperAvailable: {
      effect: "explanation",
      requiredData: [],
      unknownPolicy: "preserve-unknown",
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
    descentMinutes: {
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
    benchRequiredInterval: {
      effect: "generation-audit",
      requiredData: ["benches", "route-geometry", "walking-time"],
      unknownPolicy: "block-if-set",
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
          "Patrimoine",
          "Curiosité locale",
          "Boulangerie",
          "Café",
          "Restaurant",
          "Pique-nique",
          "Calme",
          "Verger ou vignoble",
          "Arbre remarquable",
          "Cascade",
          "Grotte",
          "Œuvre d'art",
          "Petit patrimoine",
          "Glacier",
        ].map((value) => [value, { effect: "generation-ranking" }]),
      ),
    ),
    services: Object.freeze(
      Object.fromEntries(
        [
          "Toilettes",
          "Eau potable",
          "Banc",
          "Café / restauration",
          "Pharmacie",
          "Parking",
          "Transport public",
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
        has(limitations, "Pieds") ||
        explicitRegular,
    );
    const requireRegular = mobilityAid;
    const explicitWide = has(terrain, "Chemin large");
    const suggestedWide = explicitWide;
    const requireWide = mobilityAid;
    const suggestedShortcuts = Boolean(
      fatigue >= 4 ||
        has(limitations, "Fatigue rapide") ||
        has(limitations, "Rester près du départ"),
    );
    const requireShortcuts = Boolean(request.hardConstraints?.requireShortcuts);
    if (suggestedRegular && !requireRegular)
      derived.push(
        "Terrain régulier privilégié en raison de la limitation déclarée ou de la préférence cochée ; sa présence doit être vérifiée si la donnée manque.",
      );
    if (suggestedWide && !requireWide)
      derived.push(
        "Chemin large privilégié comme préférence cochée, sans devenir une restriction impérative ; sa présence doit être vérifiée si la donnée manque.",
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
    const desiredServices = [...new Set(request.desiredServices || [])]
      .filter((service) => !requiredServices.includes(service));

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
      functionalRules: Array.isArray(request.derivedFunctionalRules)
        ? request.derivedFunctionalRules.map((rule) => ({ ...rule }))
        : [],
      functional: request.functionalPausePlan
        ? { pauseIntervalMinutes: request.functionalPausePlan.intervalMinutes }
        : {},
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
        maxContinuousAscentMinutes: request.effort?.maxContinuousAscentMinutes || null,
        maxContinuousDescentMinutes: request.effort?.maxContinuousDescentMinutes || null,
        recovery: request.effort?.recovery || null,
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
        preferWide: suggestedWide,
        preferShortcuts: suggestedShortcuts,
        preferAsphalt: has(terrain, "Goudron accepté"),
        preferNaturalTrail: has(terrain, "Sentier naturel"),
        preferDryEarth: has(terrain, "Terre sèche"),
        preferStabilizedPath: has(terrain, "Chemin stabilisé"),
        preferFewStones: has(terrain, "Peu de pierres"),
        desiredServices,
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
    const surfacePercent = (ids) =>
      (Array.isArray(route.surfaces) ? route.surfaces : [])
        .filter((surface) => ids.includes(Number(surface.id)))
        .reduce((sum, surface) => sum + (Number(surface.percent) || 0), 0);
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
          ? `${Number(route.maxContinuousAscentMinutes).toFixed(1)} min pour ${ascentRequest} min maximum`
          : known(route.elevationCoveragePercent)
            ? `altitude présente sur ${Math.round(route.elevationCoveragePercent)} % de la trace : durée de montée continue invérifiable`
            : "durée des montées continues non calculée",
      );
    const descentRequest = compiled.request.effort?.maxContinuousDescentMinutes;
    if (descentRequest === "none")
      add(
        "continuous-descent",
        "Aucune descente",
        "hard",
        known(route.descentMeters)
          ? route.descentMeters < 5
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.descentMeters)
          ? `${Math.round(route.descentMeters)} m D−`
          : "altitude absente",
      );
    else if (descentRequest)
      add(
        "continuous-descent",
        "Descente continue maximale",
        "hard",
        known(route.maxContinuousDescentMinutes)
          ? route.maxContinuousDescentMinutes <= Number(descentRequest)
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.maxContinuousDescentMinutes)
          ? `${Number(route.maxContinuousDescentMinutes).toFixed(1)} min pour ${descentRequest} min maximum`
          : known(route.elevationCoveragePercent)
            ? `altitude présente sur ${Math.round(route.elevationCoveragePercent)} % de la trace : durée de descente continue invérifiable`
            : "durée des descentes continues non calculée",
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
          ? `${Number(route.recoveryMinutesFound || 0).toFixed(1)} min faciles mesurées après l’effort`
          : known(route.elevationCoveragePercent)
            ? `altitude présente sur ${Math.round(route.elevationCoveragePercent)} % de la trace : récupération invérifiable`
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
    if (advisory.preferWide && !hard.requireWide)
      add(
        "advisory-width",
        "Chemin large privilégié",
        "advisory",
        known(route.minimumWidthMeters)
          ? route.minimumWidthMeters >= 1.2
            ? STATUS.RESPECTED
            : STATUS.VIOLATED
          : STATUS.UNKNOWN,
        known(route.minimumWidthMeters)
          ? `${route.minimumWidthMeters} m minimum`
          : "largeur à vérifier avant de partir",
      );
    if (advisory.preferAsphalt) {
      const pavedPercent = surfacePercent([1, 3, 4]);
      const hasSurfaceData = surfacePercent([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) > 0;
      add(
        "advisory-asphalt",
        "Goudron accepté",
        "advisory",
        !hasSurfaceData
          ? STATUS.UNKNOWN
          : pavedPercent >= 60
            ? STATUS.RESPECTED
            : pavedPercent < 20
              ? STATUS.VIOLATED
              : STATUS.UNKNOWN,
        hasSurfaceData
          ? `${Math.round(pavedPercent)} % de surface goudronnée ou pavée documentée`
          : "surface non documentée",
      );
    }
    if (advisory.preferNaturalTrail) {
      const dirtPercent = surfacePercent([11, 12]);
      const hasSurfaceData = surfacePercent([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) > 0;
      add(
        "advisory-natural-trail",
        "Sentier naturel privilégié",
        "advisory",
        !hasSurfaceData
          ? STATUS.UNKNOWN
          : dirtPercent >= 50
            ? STATUS.RESPECTED
            : dirtPercent < 10
              ? STATUS.VIOLATED
              : STATUS.UNKNOWN,
        hasSurfaceData
          ? `${Math.round(dirtPercent)} % de surface terre ou sol nu documentée`
          : "surface non documentée",
      );
    }
    if (advisory.preferDryEarth) {
      const dirtPercent = surfacePercent([11, 12]);
      const hasSurfaceData = surfacePercent([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) > 0;
      add(
        "advisory-dry-earth",
        "Terre sèche",
        "advisory",
        STATUS.UNKNOWN,
        hasSurfaceData
          ? `${Math.round(dirtPercent)} % de surface en terre documentée ; l’état sec ou humide dépend de la météo récente et n’est jamais vérifiable à l’avance`
          : "surface non documentée ; l’état sec ou humide dépend de la météo récente et n’est jamais vérifiable à l’avance",
      );
    }
    if (advisory.preferStabilizedPath) {
      const compactedGravelPercent = surfacePercent([8]);
      const hasSurfaceData = surfacePercent([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) > 0;
      add(
        "advisory-stabilized-path",
        "Chemin stabilisé privilégié",
        "advisory",
        !hasSurfaceData
          ? STATUS.UNKNOWN
          : compactedGravelPercent >= 50
            ? STATUS.RESPECTED
            : compactedGravelPercent < 15
              ? STATUS.VIOLATED
              : STATUS.UNKNOWN,
        hasSurfaceData
          ? `${Math.round(compactedGravelPercent)} % de surface en gravier compacté documentée`
          : "surface non documentée",
      );
    }
    if (advisory.preferFewStones) {
      const stonyPercent = surfacePercent([10, 14]);
      const hasSurfaceData = surfacePercent([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) > 0;
      add(
        "advisory-few-stones",
        "Peu de pierres privilégié",
        "advisory",
        !hasSurfaceData
          ? STATUS.UNKNOWN
          : stonyPercent < 15
            ? STATUS.RESPECTED
            : stonyPercent >= 40
              ? STATUS.VIOLATED
              : STATUS.UNKNOWN,
        hasSurfaceData
          ? `${Math.round(stonyPercent)} % de surface gravier ou pavés documentée`
          : "surface non documentée",
      );
    }
    if (Array.isArray(route.preferencesIgnored) && route.preferencesIgnored.length) {
      const names = route.preferencesIgnored.map((key) =>
        key === "green" ? "verte" : key === "quiet" ? "calme" : key,
      );
      const plural = names.length > 1;
      const joined = names.join(" et ");
      add(
        "advisory-preferences-ignored",
        `Préférence${plural ? "s" : ""} ${joined} non appliquée${plural ? "s" : ""}`,
        "advisory",
        STATUS.VIOLATED,
        plural
          ? `Limitation technique du mode boucle ORS : les préférences ${joined} n’ont pas pu être transmises pour cette recherche.`
          : `Limitation technique du mode boucle ORS : la préférence ${joined} n’a pas pu être transmise pour cette recherche.`,
      );
    }
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
    const functionalAuditor = globalThis.JMMJSLimitationsCore?.auditFunctionalRules;
    if (typeof functionalAuditor === "function") {
      const functionalChecks = functionalAuditor(route, compiled, STATUS);
      for (const check of functionalChecks) {
        const existingIndex = checks.findIndex((item) => item.id === check.id);
        if (existingIndex >= 0) checks[existingIndex] = check;
        else checks.push(check);
      }
    }
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
