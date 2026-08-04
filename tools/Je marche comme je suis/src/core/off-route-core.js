(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.JMMJSOffRouteCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    deviationMeters: 50,
    maximumAccuracyMeters: 35,
    persistenceMs: 20000,
    reentryMeters: 35,
    ignoreMs: 10 * 60 * 1000,
  });

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function createOffRouteMonitor(options = {}) {
    const rules = { ...DEFAULTS, ...options };
    let candidateSince = null;
    let alertActive = false;
    let ignoredUntil = 0;

    function reset() {
      candidateSince = null;
      alertActive = false;
      ignoredUntil = 0;
    }

    function ignore(now = Date.now(), durationMs = rules.ignoreMs) {
      ignoredUntil = finite(now) + Math.max(0, finite(durationMs, rules.ignoreMs));
      candidateSince = null;
      alertActive = false;
      return ignoredUntil;
    }

    function continueWithoutRecalculation() {
      candidateSince = null;
      alertActive = false;
    }

    function update(sample = {}) {
      const now = finite(sample.timestamp, Date.now());
      const deviation = Math.max(0, finite(sample.deviationMeters));
      const accuracy = Math.max(0, finite(sample.accuracyMeters, Infinity));
      const reliable = accuracy <= rules.maximumAccuracyMeters;
      const offRoute = deviation > rules.deviationMeters;
      const backOnRoute = deviation <= rules.reentryMeters;

      if (backOnRoute) {
        candidateSince = null;
        alertActive = false;
      }

      if (now < ignoredUntil) {
        return {
          status: "ignored",
          alert: false,
          reliable,
          deviationMeters: deviation,
          accuracyMeters: accuracy,
          ignoredUntil,
          remainingIgnoreMs: ignoredUntil - now,
        };
      }

      if (!reliable || !offRoute) {
        candidateSince = null;
        if (!offRoute) alertActive = false;
        return {
          status: reliable ? "on_route" : "gps_uncertain",
          alert: false,
          reliable,
          deviationMeters: deviation,
          accuracyMeters: accuracy,
          candidateSince: null,
        };
      }

      if (candidateSince === null) candidateSince = now;
      const durationMs = Math.max(0, now - candidateSince);
      if (durationMs >= rules.persistenceMs) alertActive = true;

      return {
        status: alertActive ? "off_route" : "confirming",
        alert: alertActive,
        reliable: true,
        deviationMeters: deviation,
        accuracyMeters: accuracy,
        candidateSince,
        durationMs,
        remainingConfirmationMs: Math.max(0, rules.persistenceMs - durationMs),
      };
    }

    return {
      update,
      reset,
      ignore,
      continueWithoutRecalculation,
      getState: () => ({ candidateSince, alertActive, ignoredUntil, rules: { ...rules } }),
    };
  }

  return { DEFAULTS, createOffRouteMonitor };
});
