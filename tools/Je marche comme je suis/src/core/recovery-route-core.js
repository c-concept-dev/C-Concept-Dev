(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.JMMJSRecoveryRouteCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODES = Object.freeze({ TRACE: "trace", START: "start" });

  function finiteCoordinate(point, label) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
      throw new TypeError(`${label} invalide.`);
    }
    const [lon, lat] = point;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new RangeError(`${label} hors limites.`);
    }
    return [lon, lat];
  }

  function createRecoveryRequest({ current, target, mode = MODES.TRACE, profile = "foot-walking" }) {
    if (!Object.values(MODES).includes(mode)) throw new TypeError("Mode de récupération invalide.");
    if (typeof profile !== "string" || !profile.trim()) throw new TypeError("Profil de récupération invalide.");
    return Object.freeze({
      current: finiteCoordinate(current, "Position actuelle"),
      target: finiteCoordinate(target, "Destination de récupération"),
      mode,
      profile: profile.trim(),
    });
  }

  function normalizeRecoveryRoute(payload, request) {
    const route = payload?.route || payload;
    const coordinates = route?.geometry?.coordinates || route?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new TypeError("Liaison de récupération ORS invalide.");
    }
    const normalized = coordinates.map((point, index) =>
      finiteCoordinate(point, `Point ${index + 1} de la liaison`),
    );
    const start = normalized[0];
    const end = normalized.at(-1);
    const tolerance = 0.002;
    const near = (a, b) => Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
    if (!near(start, request.current) || !near(end, request.target)) {
      throw new TypeError("La liaison de récupération ne rejoint pas les points demandés.");
    }
    return Object.freeze({
      kind: "recovery_link",
      mode: request.mode,
      coordinates: normalized,
      distanceMeters: Number.isFinite(Number(route.distanceMeters ?? route.distance))
        ? Number(route.distanceMeters ?? route.distance)
        : null,
      durationSeconds: Number.isFinite(Number(route.durationSeconds ?? route.duration))
        ? Number(route.durationSeconds ?? route.duration)
        : null,
      source: "OpenRouteService",
      replacesOriginalRoute: false,
    });
  }

  return { MODES, createRecoveryRequest, normalizeRecoveryRoute };
});
