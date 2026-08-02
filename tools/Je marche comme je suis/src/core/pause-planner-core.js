(() => {
  "use strict";

  const SERVICE_TYPES = Object.freeze({
    "Avec un banc": "Banc",
    "Dans un café": "Café",
    "Près de toilettes": "Toilettes",
  });

  function validPoint(point) {
    return (
      Array.isArray(point) &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1]))
    );
  }

  function sanitizeCoords(coords = []) {
    return (Array.isArray(coords) ? coords : []).filter(validPoint);
  }

  function haversine(a, b) {
    if (!validPoint(a) || !validPoint(b)) return 0;
    const rad = Math.PI / 180;
    const lat1 = Number(a[1]) * rad;
    const lat2 = Number(b[1]) * rad;
    const dLat = (Number(b[1]) - Number(a[1])) * rad;
    const dLon = (Number(b[0]) - Number(a[0])) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function cumulativeDistances(coords = []) {
    coords = sanitizeCoords(coords);
    const cumulative = [0];
    for (let index = 1; index < coords.length; index += 1)
      cumulative.push(
        cumulative.at(-1) + haversine(coords[index - 1], coords[index]),
      );
    return cumulative;
  }

  function interpolateAtDistance(coords, cumulative, targetMeters) {
    if (!coords.length) return null;
    if (targetMeters <= 0)
      return { lon: Number(coords[0][0]), lat: Number(coords[0][1]), index: 0 };
    const total = cumulative.at(-1) || 0;
    if (targetMeters >= total) {
      const point = coords.at(-1);
      return { lon: Number(point[0]), lat: Number(point[1]), index: coords.length - 1 };
    }
    let index = 1;
    while (index < cumulative.length && cumulative[index] < targetMeters) index += 1;
    const before = coords[index - 1];
    const after = coords[index];
    const span = cumulative[index] - cumulative[index - 1] || 1;
    const ratio = (targetMeters - cumulative[index - 1]) / span;
    return {
      lon: Number(before[0]) + (Number(after[0]) - Number(before[0])) * ratio,
      lat: Number(before[1]) + (Number(after[1]) - Number(before[1])) * ratio,
      index,
    };
  }

  function nearestPointOnRoute(coords, cumulative, poi) {
    let best = null;
    for (let index = 0; index < coords.length; index += 1) {
      const distance = haversine(coords[index], [poi.lon, poi.lat]);
      if (!best || distance < best.distance)
        best = {
          lon: Number(coords[index][0]),
          lat: Number(coords[index][1]),
          index,
          distance,
          routeMeters: cumulative[index],
        };
    }
    return best;
  }

  function ascentEnds(coords = []) {
    const ends = [];
    let start = null;
    let gain = 0;
    let distance = 0;
    for (let index = 1; index < coords.length; index += 1) {
      const previous = coords[index - 1];
      const current = coords[index];
      const segment = haversine(previous, current);
      const delta =
        Number.isFinite(Number(previous[2])) && Number.isFinite(Number(current[2]))
          ? Number(current[2]) - Number(previous[2])
          : null;
      if (delta !== null && delta > 0.8) {
        if (start === null) start = index - 1;
        gain += delta;
        distance += segment;
      } else if (start !== null) {
        if (gain >= 8 && distance >= 80)
          ends.push({ index: index - 1, gainMeters: gain, distanceMeters: distance });
        start = null;
        gain = 0;
        distance = 0;
      }
    }
    if (start !== null && gain >= 8 && distance >= 80)
      ends.push({ index: coords.length - 1, gainMeters: gain, distanceMeters: distance });
    return ends;
  }

  function createMarker(kind, label, position, extra = {}) {
    return {
      kind,
      label,
      lon: position.lon,
      lat: position.lat,
      routeIndex: position.index,
      routeMeters: position.routeMeters ?? null,
      ...extra,
    };
  }

  function planPauses({ coords = [], walkingMinutes = 0, pausePlan, pois = [] } = {}) {
    const plan = String(pausePlan || "Aucune pause programmée");
    coords = sanitizeCoords(coords);
    pois = Array.isArray(pois) ? pois : [];
    if (plan === "Aucune pause programmée")
      return {
        plan,
        status: "respected",
        markers: [],
        evidence: "Aucune pause programmée.",
      };
    if (!Array.isArray(coords) || coords.length < 2)
      return {
        plan,
        status: "unknown",
        markers: [],
        evidence: "Trace insuffisante pour positionner les pauses.",
      };

    const cumulative = cumulativeDistances(coords);
    const totalMeters = cumulative.at(-1) || 0;
    const markers = [];

    if (plan === "Toutes les 15 minutes" || plan === "Toutes les 30 minutes") {
      const interval = plan.includes("15") ? 15 : 30;
      if (!Number.isFinite(Number(walkingMinutes)) || Number(walkingMinutes) <= 0)
        return {
          plan,
          status: "unknown",
          markers: [],
          evidence: "Durée de marche absente : pauses périodiques invérifiables.",
        };
      for (let minute = interval; minute < walkingMinutes; minute += interval) {
        const targetMeters = totalMeters * (minute / walkingMinutes);
        const point = interpolateAtDistance(coords, cumulative, targetMeters);
        markers.push(createMarker("scheduled", `Pause à ${minute} min`, {
          ...point,
          routeMeters: targetMeters,
        }, { minute }));
      }
      return {
        plan,
        status: "respected",
        markers,
        evidence: `${markers.length} pause${markers.length > 1 ? "s" : ""} positionnée${markers.length > 1 ? "s" : ""} sur la trace selon l’allure calculée.`,
      };
    }

    if (plan === "À mi-parcours") {
      const point = interpolateAtDistance(coords, cumulative, totalMeters / 2);
      markers.push(createMarker("midpoint", "Pause à mi-parcours", {
        ...point,
        routeMeters: totalMeters / 2,
      }));
      return {
        plan,
        status: "respected",
        markers,
        evidence: `Pause positionnée à ${Math.round(totalMeters / 2)} m du départ.`,
      };
    }

    if (plan === "Après chaque montée") {
      const coverage = coords.filter((point) => Number.isFinite(Number(point[2]))).length / coords.length;
      if (coverage < 0.8)
        return {
          plan,
          status: "unknown",
          markers: [],
          evidence: `Altitude disponible sur ${Math.round(coverage * 100)} % de la trace : fin des montées invérifiable.`,
        };
      for (const end of ascentEnds(coords)) {
        const point = coords[end.index];
        markers.push(createMarker("after-ascent", "Pause après montée", {
          lon: Number(point[0]),
          lat: Number(point[1]),
          index: end.index,
          routeMeters: cumulative[end.index],
        }, end));
      }
      return {
        plan,
        status: markers.length ? "respected" : "unknown",
        markers,
        evidence: markers.length
          ? `${markers.length} fin${markers.length > 1 ? "s" : ""} de montée significative positionnée${markers.length > 1 ? "s" : ""}.`
          : "Aucune montée significative documentée : aucune pause après montée ne peut être positionnée.",
      };
    }

    const serviceType = SERVICE_TYPES[plan];
    if (serviceType) {
      const candidates = (Array.isArray(pois) ? pois : []).filter((poi) => poi.type === serviceType);
      if (!candidates.length)
        return {
          plan,
          status: "violated",
          markers: [],
          evidence: `${serviceType} demandé pour la pause : aucun point documenté près de la trace.`,
        };
      const projected = candidates
        .map((poi) => ({ poi, route: nearestPointOnRoute(coords, cumulative, poi) }))
        .filter((item) => item.route)
        .sort((left, right) =>
          Math.abs((left.route.routeMeters || 0) - totalMeters / 2) -
          Math.abs((right.route.routeMeters || 0) - totalMeters / 2),
        )[0];
      markers.push(createMarker("service", `Pause — ${serviceType}`, projected.route, {
        poiId: projected.poi.id,
        poiName: projected.poi.name,
        offRouteMeters: projected.route.distance,
      }));
      return {
        plan,
        status: "respected",
        markers,
        evidence: `${serviceType} documenté à ${Math.round(projected.route.distance)} m de la trace ; pause positionnée au point le plus proche.`,
      };
    }

    if (plan === "Avec de l’ombre" || plan === "Avec un point de vue")
      return {
        plan,
        status: "unknown",
        markers: [],
        evidence: `${plan.replace("Avec ", "")} demandé : aucune source actuelle ne permet de le prouver et de le positionner.`,
      };

    return {
      plan,
      status: "unknown",
      markers: [],
      evidence: `Plan de pause « ${plan} » non mesurable avec les données disponibles.`,
    };
  }

  function applyPausePlan(route, pausePlan, result) {
    const next = { ...route };
    next.pausePlan = result;
    next.pauseMarkers = result.markers || [];
    next.checks = [
      ...(Array.isArray(next.checks) ? next.checks : []),
      {
        constraint: `Pauses positionnées : ${pausePlan}`,
        status: result.status,
        evidence: result.evidence,
        severity: pausePlan === "Aucune pause programmée" ? "advisory" : "hard",
      },
    ];
    if (result.status === "violated") {
      next.proposalStatus = "adaptation";
      next.canNavigate = false;
      next.violations = [
        ...new Set([...(next.violations || []), `Pause non réalisable : ${pausePlan}`]),
      ];
    } else if (result.status === "unknown" && next.proposalStatus === "compatible") {
      next.proposalStatus = "verify";
      next.canNavigate = false;
      next.unknowns = [
        ...new Set([...(next.unknowns || []), `Pause à vérifier : ${pausePlan}`]),
      ];
    }
    return next;
  }

  function safePlanPauses(input = {}) {
    try {
      return planPauses(input);
    } catch (error) {
      return {
        plan: String(input.pausePlan || "Aucune pause programmée"),
        status: "unknown",
        markers: [],
        evidence: `Le positionnement des pauses a échoué sans interrompre le calcul : ${error.message}`,
        error: error.message,
      };
    }
  }

  globalThis.JMMJSPausePlannerCore = Object.freeze({
    SERVICE_TYPES,
    sanitizeCoords,
    cumulativeDistances,
    interpolateAtDistance,
    ascentEnds,
    planPauses,
    safePlanPauses,
    applyPausePlan,
  });
})();
