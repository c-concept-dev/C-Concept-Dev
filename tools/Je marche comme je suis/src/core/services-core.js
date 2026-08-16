(() => {
  "use strict";

  const SERVICE_LABELS = Object.freeze([
    "Toilettes",
    "Eau potable",
    "Banc",
    "Café / restauration",
    "Pharmacie",
    "Parking",
    "Transport public",
  ]);

  const SERVICE_MATCHERS = Object.freeze({
    "Toilettes": Object.freeze(["Toilettes"]),
    "Eau potable": Object.freeze(["Eau potable"]),
    "Banc": Object.freeze(["Banc"]),
    "Café / restauration": Object.freeze(["Café", "Restaurant"]),
    "Pharmacie": Object.freeze(["Pharmacie"]),
    "Parking": Object.freeze(["Parking"]),
    "Transport public": Object.freeze(["Transport public"]),
  });

  const SERVICE_SEARCH_RADIUS = Object.freeze({
    "Banc": 60,
  });

  const WISH_POI_LABELS = Object.freeze([
    "Boulangerie",
    "Café",
    "Restaurant",
    "Point de vue",
    "Rivière",
    "Lac",
    "Forêt",
    "Pique-nique",
    "Patrimoine",
    "Curiosité locale",
    "Verger ou vignoble",
    "Arbre remarquable",
    "Cascade",
    "Grotte",
    "Œuvre d'art",
    "Petit patrimoine",
    "Glacier",
  ]);

  const ROUTING_POI_LABELS = Object.freeze([
    "Boulangerie",
    "Café",
    "Restaurant",
    "Point de vue",
    "Pique-nique",
    "Patrimoine",
    "Curiosité locale",
  ]);

  function normalizeWishPois(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => WISH_POI_LABELS.includes(value)))];
  }

  function assessWishPois(wishes = [], pois = [], options = {}) {
    const requested = normalizeWishPois(wishes);
    const providerAvailable = options.providerAvailable !== false;
    const searched = options.searched === true;
    const radiusMeters = Number.isFinite(Number(options.radiusMeters))
      ? Number(options.radiusMeters)
      : 300;
    const foundTypes = new Set(
      (Array.isArray(pois) ? pois : []).map((poi) => String(poi?.type || "")),
    );

    const checks = requested.map((wish) => {
      if (!providerAvailable || !searched) {
        return {
          wish,
          status: "unknown",
          evidence: `${wish} souhaité·e : recherche cartographique non disponible.`,
        };
      }
      const found = foundTypes.has(wish);
      return {
        wish,
        status: found ? "respected" : "unknown",
        evidence: found
          ? `${wish} documenté·e à moins de ${radiusMeters} m de la trace.`
          : `${wish} non trouvé·e à moins de ${radiusMeters} m de la trace ; la couverture cartographique reste incomplète, l’absence n’est pas prouvée.`,
      };
    });

    return { requested, checks };
  }

  function applyWishPoiAssessment(route, assessment) {
    const next = { ...route };
    const existing = Array.isArray(next.checks) ? next.checks : [];
    next.checks = [
      ...existing.filter((check) => !String(check.constraint || "").startsWith("Envie : ")),
      ...assessment.checks.map((check) => ({
        constraint: `Envie : ${check.wish}`,
        status: check.status,
        evidence: check.evidence,
        severity: "advisory",
      })),
    ];
    return next;
  }

  function normalizeServices(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => SERVICE_LABELS.includes(value)))];
  }

  function serviceMatches(service, foundTypes) {
    const candidates = SERVICE_MATCHERS[service] || [service];
    return candidates.some((candidate) => foundTypes.has(candidate));
  }

  function radiusFor(service, fallback) {
    return SERVICE_SEARCH_RADIUS[service] || fallback;
  }

  function assessDesiredServices(desired = [], pois = [], options = {}) {
    const requested = normalizeServices(desired);
    const providerAvailable = options.providerAvailable !== false;
    const searched = options.searched === true;
    const defaultRadius = Number.isFinite(Number(options.radiusMeters))
      ? Number(options.radiusMeters)
      : 300;
    const foundTypes = new Set(
      (Array.isArray(pois) ? pois : []).map((poi) => String(poi?.type || "")),
    );
    const checks = requested.map((service) => {
      const radiusMeters = radiusFor(service, defaultRadius);
      if (!providerAvailable || !searched) {
        return {
          service,
          status: "unknown",
          evidence: `${service} souhaité : recherche cartographique non disponible.`,
        };
      }
      const found = serviceMatches(service, foundTypes);
      return {
        service,
        status: found ? "respected" : "unknown",
        evidence: found
          ? `${service} documenté à moins de ${radiusMeters} m de la trace.`
          : `${service} non trouvé à moins de ${radiusMeters} m de la trace ; la couverture cartographique reste incomplète, l’absence n’est pas prouvée.`,
      };
    });
    const respected = checks.filter((check) => check.status === "respected");
    return {
      requested,
      checks,
      respected,
      unknown: checks.filter((check) => check.status === "unknown"),
      score: requested.length ? Math.round((respected.length / requested.length) * 100) : 0,
    };
  }

  function applyDesiredServiceAssessment(route, assessment) {
    const next = { ...route };
    const existing = Array.isArray(next.checks) ? next.checks : [];
    next.checks = [
      ...existing.filter((check) => !String(check.constraint || "").startsWith("Service souhaité :")),
      ...assessment.checks.map((check) => ({
        constraint: `Service souhaité : ${check.service}`,
        status: check.status,
        evidence: check.evidence,
        severity: "advisory",
      })),
    ];
    next.desiredServiceAssessment = assessment;
    next.desiredServiceScore = Number(assessment.score) || 0;
    return next;
  }

  function assessRequiredServices(required = [], pois = [], options = {}) {
    const requested = normalizeServices(required);
    const providerAvailable = options.providerAvailable !== false;
    const searched = options.searched === true;
    const absenceIsUnknown = options.absenceIsUnknown === true;
    const defaultRadius = Number.isFinite(Number(options.radiusMeters))
      ? Number(options.radiusMeters)
      : 300;
    const foundTypes = new Set(
      (Array.isArray(pois) ? pois : []).map((poi) => String(poi?.type || "")),
    );

    const checks = requested.map((service) => {
      const radiusMeters = radiusFor(service, defaultRadius);
      if (!providerAvailable || !searched) {
        return {
          service,
          status: "unknown",
          evidence: `${service} nécessaire : recherche cartographique non disponible.`,
        };
      }
      const found = serviceMatches(service, foundTypes);
      const missingStatus = absenceIsUnknown ? "unknown" : "violated";
      return {
        service,
        status: found ? "respected" : missingStatus,
        evidence: found
          ? `${service} documenté à moins de ${radiusMeters} m de la trace.`
          : absenceIsUnknown
            ? `${service} non documenté à moins de ${radiusMeters} m de la trace ; l’absence n’est pas prouvée, la compatibilité ne peut donc pas être confirmée.`
            : `${service} non trouvé à moins de ${radiusMeters} m de la trace lors de la recherche.`,
      };
    });

    return {
      requested,
      checks,
      respected: checks.filter((check) => check.status === "respected"),
      violated: checks.filter((check) => check.status === "violated"),
      unknown: checks.filter((check) => check.status === "unknown"),
      admissible: checks.every((check) => check.status === "respected"),
      status:
        checks.some((check) => check.status === "violated")
          ? "violated"
          : checks.some((check) => check.status === "unknown")
            ? "unknown"
            : "respected",
    };
  }

  function applyServiceAssessment(route, assessment) {
    const next = { ...route };
    const existing = Array.isArray(next.checks) ? next.checks : [];
    next.checks = [
      ...existing.filter((check) => !String(check.constraint || "").startsWith("Service requis :")),
      ...assessment.checks.map((check) => ({
        constraint: `Service requis : ${check.service}`,
        status: check.status,
        evidence: check.evidence,
        severity: "hard",
      })),
    ];
    next.requiredServiceAssessment = assessment;
    next.pois = Array.isArray(next.pois) ? next.pois : [];

    if (assessment.violated.length) {
      next.proposalStatus = "adaptation";
      next.canNavigate = false;
      next.violations = [
        ...new Set([
          ...(next.violations || []),
          ...assessment.violated.map((check) => `Service requis : ${check.service}`),
        ]),
      ];
    } else if (assessment.unknown.length && next.proposalStatus === "compatible") {
      next.proposalStatus = "verify";
      next.canNavigate = false;
      next.unknowns = [
        ...new Set([
          ...(next.unknowns || []),
          ...assessment.unknown.map((check) => `Service requis : ${check.service}`),
        ]),
      ];
    }
    return next;
  }

  function validPoint(point) {
    return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  }

  function haversine(a, b) {
    if (!validPoint(a) || !validPoint(b)) return Infinity;
    const rad = Math.PI / 180;
    const lat1 = Number(a[1]) * rad;
    const lat2 = Number(b[1]) * rad;
    const dLat = (Number(b[1]) - Number(a[1])) * rad;
    const dLon = (Number(b[0]) - Number(a[0])) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function cumulativeDistances(coords = []) {
    const valid = (Array.isArray(coords) ? coords : []).filter(validPoint);
    const out = [0];
    for (let i = 1; i < valid.length; i += 1) out.push(out.at(-1) + haversine(valid[i - 1], valid[i]));
    return { coords: valid, cumulative: out };
  }

  function projectPoiMeters(coords, cumulative, poi) {
    const point = [Number(poi?.lon), Number(poi?.lat)];
    if (!validPoint(point) || coords.length < 2) return null;
    const lat0 = point[1] * Math.PI / 180;
    const metersPerLon = 111320 * Math.cos(lat0);
    const metersPerLat = 110540;
    let best = null;
    for (let i = 1; i < coords.length; i += 1) {
      const a = coords[i - 1];
      const b = coords[i];
      const ax = (Number(a[0]) - point[0]) * metersPerLon;
      const ay = (Number(a[1]) - point[1]) * metersPerLat;
      const bx = (Number(b[0]) - point[0]) * metersPerLon;
      const by = (Number(b[1]) - point[1]) * metersPerLat;
      const dx = bx - ax;
      const dy = by - ay;
      const denom = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const offRouteMeters = Math.sqrt(px * px + py * py);
      const segmentMeters = (cumulative[i] || 0) - (cumulative[i - 1] || 0);
      const routeMeters = (cumulative[i - 1] || 0) + t * segmentMeters;
      if (!best || offRouteMeters < best.offRouteMeters) best = { routeMeters, offRouteMeters };
    }
    return best;
  }

  function assessBenchSpacing(route = {}, pois = [], options = {}) {
    const intervalMinutes = Number(options.intervalMinutes);
    const walkingMinutes = Number(options.walkingMinutes ?? route.walking ?? route.total);
    const maxOffRouteMeters = Number.isFinite(Number(options.maxOffRouteMeters)) ? Number(options.maxOffRouteMeters) : 60;
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      return { status: "unknown", intervalMinutes: null, evidence: "Fréquence de pause assise non précisée." };
    }
    const { coords, cumulative } = cumulativeDistances(route.coords || []);
    const totalMeters = cumulative.at(-1) || 0;
    if (coords.length < 2 || totalMeters <= 0 || !Number.isFinite(walkingMinutes) || walkingMinutes <= 0) {
      return { status: "unknown", intervalMinutes, evidence: "Trace ou durée de marche insuffisante pour vérifier la répartition des bancs." };
    }
    const benches = (Array.isArray(pois) ? pois : []).filter((poi) => poi?.type === "Banc");
    const positions = benches
      .map((poi) => projectPoiMeters(coords, cumulative, poi))
      .filter((item) => item && item.offRouteMeters <= maxOffRouteMeters)
      .map((item) => item.routeMeters)
      .sort((a, b) => a - b);
    if (!positions.length) {
      return {
        status: "unknown",
        intervalMinutes,
        documentedBenches: 0,
        evidence: `Aucun banc n’est documenté à moins de ${maxOffRouteMeters} m de la trace ; l’absence réelle de banc n’est pas prouvée.`,
      };
    }
    const checkpoints = [0, ...positions, totalMeters];
    let maxGapMeters = 0;
    for (let i = 1; i < checkpoints.length; i += 1) maxGapMeters = Math.max(maxGapMeters, checkpoints[i] - checkpoints[i - 1]);
    const metersPerMinute = totalMeters / walkingMinutes;
    const maxGapMinutes = maxGapMeters / metersPerMinute;
    const respected = maxGapMinutes <= intervalMinutes + 0.5;
    return {
      status: respected ? "respected" : "unknown",
      intervalMinutes,
      documentedBenches: positions.length,
      maxGapMeters: Math.round(maxGapMeters),
      maxGapMinutes: Math.round(maxGapMinutes * 10) / 10,
      evidence: respected
        ? `${positions.length} banc${positions.length > 1 ? "s" : ""} documenté${positions.length > 1 ? "s" : ""} ; intervalle maximal estimé ${Math.round(maxGapMinutes)} min, compatible avec le besoin d’environ ${intervalMinutes} min.`
        : `${positions.length} banc${positions.length > 1 ? "s" : ""} documenté${positions.length > 1 ? "s" : ""}, mais un intervalle d’environ ${Math.round(maxGapMinutes)} min subsiste ; les données OSM étant incomplètes, ce besoin reste à vérifier.`,
    };
  }

  function applyBenchSpacingAssessment(route, assessment) {
    const next = { ...route };
    next.benchSpacingAssessment = assessment;
    const existing = Array.isArray(next.checks) ? next.checks : [];
    next.checks = [
      ...existing.filter((check) => check.constraint !== "Possibilité de s’asseoir régulièrement"),
      {
        constraint: "Possibilité de s’asseoir régulièrement",
        status: assessment.status,
        evidence: assessment.evidence,
        severity: "hard",
      },
    ];
    if (assessment.status !== "respected" && next.proposalStatus === "compatible") {
      next.proposalStatus = "verify";
      next.canNavigate = false;
      next.unknowns = [...new Set([...(next.unknowns || []), "Répartition des bancs à vérifier"] )];
    }
    return next;
  }

  globalThis.JMMJSServicesCore = Object.freeze({
    SERVICE_LABELS,
    SERVICE_MATCHERS,
    normalizeServices,
    assessDesiredServices,
    applyDesiredServiceAssessment,
    assessRequiredServices,
    applyServiceAssessment,
    assessBenchSpacing,
    applyBenchSpacingAssessment,
    WISH_POI_LABELS,
    ROUTING_POI_LABELS,
    normalizeWishPois,
    assessWishPois,
    applyWishPoiAssessment,
  });
})();
