(() => {
  "use strict";

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeIgnElevation(payload = {}) {
    const raw = Array.isArray(payload.elevations)
      ? payload.elevations
      : Array.isArray(payload.profile)
        ? payload.profile
        : [];
    const elevations = raw
      .map((item) => finite(typeof item === "object" ? item.elevation ?? item.z ?? item.altitude : item))
      .filter((value) => value !== null);
    const ascent = finite(payload.ascentMeters ?? payload.ascent ?? payload.positiveElevation);
    const descent = finite(payload.descentMeters ?? payload.descent ?? payload.negativeElevation);
    return Object.freeze({
      elevations: Object.freeze(elevations),
      ascentMeters: ascent,
      descentMeters: descent,
      source: payload.source || "IGN Géoplateforme",
      retrievedAt: payload.retrievedAt || new Date().toISOString(),
    });
  }

  function compareElevation({ orsAscentMeters, ignAscentMeters, absoluteThresholdMeters = 20, relativeThreshold = 0.15 } = {}) {
    const ors = finite(orsAscentMeters);
    const ign = finite(ignAscentMeters);
    if (ors === null || ign === null) {
      return Object.freeze({ status: "unknown", label: "Contrôle IGN non documenté", differenceMeters: null, relativeDifference: null, divergent: false });
    }
    const differenceMeters = Math.abs(ign - ors);
    const relativeDifference = ors > 0 ? differenceMeters / ors : (differenceMeters > 0 ? 1 : 0);
    const divergent = differenceMeters > absoluteThresholdMeters || relativeDifference > relativeThreshold;
    return Object.freeze({
      status: divergent ? "conflicting" : "documented",
      label: divergent ? "Écart altimétrique à examiner" : "Contrôle altimétrique cohérent",
      differenceMeters,
      relativeDifference,
      divergent,
    });
  }

  function applyIgnElevationControl(route, payload, options = {}) {
    const normalized = normalizeIgnElevation(payload);
    const comparison = compareElevation({
      orsAscentMeters: route?.ascent,
      ignAscentMeters: normalized.ascentMeters,
      ...options,
    });
    return {
      ...route,
      ignElevation: {
        ...normalized,
        comparison,
        role: "Contrôle complémentaire uniquement",
      },
      sources: [...new Set([...(route?.sources || []), normalized.source])],
      warnings: comparison.divergent
        ? [...(route?.warnings || []), `Écart altimétrique ORS/IGN : ${Math.round(comparison.differenceMeters)} m.`]
        : [...(route?.warnings || [])],
    };
  }

  function markIgnUnavailable(route, message = "Contrôle IGN indisponible.") {
    return {
      ...route,
      ignElevation: {
        status: "unavailable",
        label: "Contrôle IGN indisponible",
        message,
        role: "Contrôle complémentaire uniquement",
      },
    };
  }

  globalThis.JMMJSIgnElevationCore = Object.freeze({
    normalizeIgnElevation,
    compareElevation,
    applyIgnElevationControl,
    markIgnUnavailable,
  });
})();
