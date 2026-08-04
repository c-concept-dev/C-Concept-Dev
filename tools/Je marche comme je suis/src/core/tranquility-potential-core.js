(function (global) {
  "use strict";

  const LABELS = Object.freeze({ high: "élevé", medium: "modéré", low: "faible", unknown: "non documenté" });

  function finite(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function assessTranquilityPotential(input = {}) {
    const indicators = [];
    let score = 0;

    const roadDistance = finite(input.distanceToMajorRoadMeters);
    if (roadDistance !== null) {
      const points = roadDistance >= 500 ? 2 : roadDistance >= 200 ? 1 : -2;
      score += points;
      indicators.push({ key: "roads", label: roadDistance >= 500 ? "éloignement des routes principales" : roadDistance >= 200 ? "routes principales modérément proches" : "route principale proche", value: roadDistance, points });
    }

    const buildingDensity = finite(input.buildingDensityPerKm2);
    if (buildingDensity !== null) {
      const points = buildingDensity <= 80 ? 2 : buildingDensity <= 250 ? 0 : -2;
      score += points;
      indicators.push({ key: "buildings", label: buildingDensity <= 80 ? "faible densité de bâti" : buildingDensity <= 250 ? "densité de bâti intermédiaire" : "forte densité de bâti", value: buildingDensity, points });
    }

    for (const [key, label, value, lowThreshold, highThreshold] of [
      ["parking", "parkings proches", input.parkingCount, 0, 3],
      ["commerce", "commerces proches", input.commerceCount, 0, 4],
      ["tourism", "équipements touristiques proches", input.touristPoiCount, 0, 3],
      ["officialRoutes", "itinéraires officiels proches", input.officialRouteCount, 0, 2],
    ]) {
      const count = finite(value);
      if (count === null) continue;
      const points = count <= lowThreshold ? 1 : count >= highThreshold ? -1 : 0;
      score += points;
      indicators.push({ key, label: count === 0 ? `aucun ${label}` : `${count} ${label}`, value: count, points });
    }

    const environment = String(input.environment || "").toLowerCase();
    if (["rural", "forest", "natural"].includes(environment)) {
      score += 1;
      indicators.push({ key: "environment", label: "environnement rural ou naturel", value: environment, points: 1 });
    } else if (["urban", "dense_urban"].includes(environment)) {
      score -= 1;
      indicators.push({ key: "environment", label: "environnement urbain", value: environment, points: -1 });
    }

    if (indicators.length < 2) {
      return {
        status: "unknown",
        level: "unknown",
        label: LABELS.unknown,
        score: null,
        indicators,
        warning: "Les données disponibles sont insuffisantes pour estimer un potentiel de tranquillité. La fréquentation réelle n’est pas connue.",
      };
    }

    const level = score >= 3 ? "high" : score <= -2 ? "low" : "medium";
    return {
      status: "estimated",
      level,
      label: LABELS[level],
      score,
      indicators,
      warning: "Cet indice décrit seulement un potentiel de tranquillité à partir d’indices cartographiques. La fréquentation réelle n’est pas connue.",
    };
  }

  global.JMMJSTranquilityPotentialCore = { LABELS, assessTranquilityPotential };
})(globalThis);
