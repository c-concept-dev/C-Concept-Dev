(() => {
  "use strict";

  function validCoord(point) {
    return (
      Array.isArray(point) &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1]))
    );
  }

  function haversine(a, b) {
    if (!validCoord(a) || !validCoord(b)) return 0;
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

  function routeExtentMeters(coords = []) {
    const valid = (Array.isArray(coords) ? coords : []).filter(validCoord);
    if (valid.length < 2) return 0;
    const start = valid[0];
    return Math.max(...valid.map((point) => haversine(start, point)));
  }

  function midpoint(coords = []) {
    const valid = (Array.isArray(coords) ? coords : []).filter(validCoord);
    return valid.length ? valid[Math.floor(valid.length / 2)] : null;
  }

  function highestPoint(coords = []) {
    const valid = (Array.isArray(coords) ? coords : []).filter(
      (point) => validCoord(point) && Number.isFinite(Number(point[2])),
    );
    if (!valid.length) return null;
    return valid.reduce((highest, point) =>
      Number(point[2]) > Number(highest[2]) ? point : highest,
    );
  }

  function chooseWeatherPoints(route = {}) {
    const coords = (Array.isArray(route.coords) ? route.coords : []).filter(validCoord);
    if (!coords.length) return [];

    const points = [{
      id: "start",
      label: "Départ",
      lon: Number(coords[0][0]),
      lat: Number(coords[0][1]),
    }];

    const distanceMeters = Number(route.distanceMeters || route.distance || 0);
    const extent = routeExtentMeters(coords);
    if (distanceMeters >= 6000 || extent >= 2500) {
      const middle = midpoint(coords);
      if (middle)
        points.push({
          id: "middle",
          label: "Parcours",
          lon: Number(middle[0]),
          lat: Number(middle[1]),
        });
    }

    const altitudeCoverage =
      coords.filter((point) => Number.isFinite(Number(point[2]))).length /
      coords.length;
    const high = highestPoint(coords);
    const startElevation = Number(coords[0]?.[2]);
    if (
      high &&
      altitudeCoverage >= 0.8 &&
      Number.isFinite(startElevation) &&
      Number(high[2]) - startElevation >= 150
    )
      points.push({
        id: "high",
        label: "Point haut",
        lon: Number(high[0]),
        lat: Number(high[1]),
        elevation: Number(high[2]),
      });

    const priority = { start: 1, middle: 2, high: 3 };
    const unique = new Map();
    for (const point of points) {
      const key = `${point.lon.toFixed(4)}:${point.lat.toFixed(4)}`;
      const existing = unique.get(key);
      if (
        !existing ||
        (priority[point.id] || 0) > (priority[existing.id] || 0)
      )
        unique.set(key, point);
    }
    return [...unique.values()];
  }

  const LEVEL_RANK = Object.freeze({
    unknown: 0,
    favorable: 1,
    caution: 2,
    critical: 3,
  });

  function aggregateWeatherResults(results = []) {
    if (!results.length)
      return {
        summary: null,
        assessment: {
          level: "unknown",
          label: "Prévision indisponible",
          warnings: [],
          checks: [],
        },
        representativePoint: null,
        points: [],
        partial: true,
      };

    const ranked = [...results].sort(
      (left, right) =>
        (LEVEL_RANK[right.assessment?.level] || 0) -
        (LEVEL_RANK[left.assessment?.level] || 0),
    );
    const representative = ranked[0];
    const valid = results.filter((result) => result.summary);
    const numberValues = (key) =>
      valid
        .map((result) => Number(result.summary[key]))
        .filter(Number.isFinite);
    const min = (key) => {
      const values = numberValues(key);
      return values.length ? Math.min(...values) : null;
    };
    const max = (key) => {
      const values = numberValues(key);
      return values.length ? Math.max(...values) : null;
    };

    const mergedSummary = valid.length
      ? {
          source: "Open-Meteo",
          startTime: valid[0].summary.startTime || null,
          endTime: valid[0].summary.endTime || null,
          temperatureMinC: min("temperatureMinC"),
          temperatureMaxC: max("temperatureMaxC"),
          apparentMinC: min("apparentMinC"),
          apparentMaxC: max("apparentMaxC"),
          precipitationProbabilityMax: max("precipitationProbabilityMax"),
          precipitationMm: max("precipitationMm"),
          windGustMaxKmh: max("windGustMaxKmh"),
          visibilityMinM: min("visibilityMinM"),
          coverageHours: Math.min(
            ...valid.map((result) => Number(result.summary.coverageHours) || 0),
          ),
          requestedHours: Math.max(
            ...valid.map((result) => Number(result.summary.requestedHours) || 0),
          ),
          complete: valid.every((result) => result.summary.complete),
          weatherCodes: [
            ...new Set(
              valid.flatMap((result) => result.summary.weatherCodes || []),
            ),
          ],
        }
      : null;

    const partial = results.some(
      (result) =>
        !result.summary ||
        !result.summary.complete ||
        result.assessment?.level === "unknown",
    );

    return {
      summary: mergedSummary,
      assessment: {
        ...representative.assessment,
        label:
          partial && representative.assessment?.level !== "critical"
            ? `${representative.assessment?.label || "Prévision"} · partiel`
            : representative.assessment?.label,
        warnings: [
          ...new Set(
            results.flatMap((result) => result.assessment?.warnings || []),
          ),
        ],
      },
      representativePoint: representative.point,
      points: results,
      partial,
    };
  }

  globalThis.JMMJSMultiPointWeatherCore = Object.freeze({
    chooseWeatherPoints,
    aggregateWeatherResults,
    routeExtentMeters,
  });
})();
