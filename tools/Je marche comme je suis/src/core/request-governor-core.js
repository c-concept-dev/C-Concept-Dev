(() => {
  "use strict";

  const DEFAULT_LIMITS = Object.freeze({
    ors: 12,
    geo: 24,
    mapillary: 24,
    weather: 12,
    geocode: 12,
    session: 80,
  });

  function createGovernorError(code, message, details = {}) {
    const error = new Error(message);
    error.name = "RequestGovernorError";
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function createRequestGovernor({ limits = DEFAULT_LIMITS, now = Date.now } = {}) {
    let searchId = 0;
    let searchCounts = Object.create(null);
    let sessionCount = 0;
    const cooldowns = new Map();

    function beginSearch() {
      searchId += 1;
      searchCounts = Object.create(null);
      return searchId;
    }

    function remaining(service) {
      const limit = Number(limits[service]);
      if (!Number.isFinite(limit)) return Infinity;
      return Math.max(0, limit - (searchCounts[service] || 0));
    }

    function beforeRequest(service, count = 1) {
      const normalizedCount = Math.max(1, Number(count) || 1);
      const until = Number(cooldowns.get(service) || 0);
      const current = now();
      if (until > current) {
        const retryAfterSeconds = Math.max(1, Math.ceil((until - current) / 1000));
        throw createGovernorError(
          "cooldown",
          `Nouvelle tentative possible dans ${retryAfterSeconds} seconde${retryAfterSeconds > 1 ? "s" : ""}.`,
          { service, retryAfterSeconds, retryable: true },
        );
      }

      const serviceLimit = Number(limits[service]);
      const nextServiceCount = (searchCounts[service] || 0) + normalizedCount;
      if (Number.isFinite(serviceLimit) && nextServiceCount > serviceLimit) {
        throw createGovernorError(
          "search-quota",
          `La limite de ${serviceLimit} requêtes ${service} pour cette recherche est atteinte.`,
          { service, limit: serviceLimit, retryable: false },
        );
      }

      const sessionLimit = Number(limits.session);
      if (Number.isFinite(sessionLimit) && sessionCount + normalizedCount > sessionLimit) {
        throw createGovernorError(
          "session-quota",
          "La limite de requêtes de cette session est atteinte.",
          { service, limit: sessionLimit, retryable: false },
        );
      }

      searchCounts[service] = nextServiceCount;
      sessionCount += normalizedCount;
      return Object.freeze({
        searchId,
        service,
        count: normalizedCount,
        used: nextServiceCount,
        remaining: remaining(service),
        sessionUsed: sessionCount,
      });
    }

    function noteFailure(service, error) {
      const seconds = Number(error?.retryAfterSeconds);
      if (Number.isFinite(seconds) && seconds > 0) {
        const bounded = Math.min(300, seconds);
        cooldowns.set(service, now() + bounded * 1000);
        return bounded;
      }
      return 0;
    }

    function clearCooldown(service) {
      cooldowns.delete(service);
    }

    function snapshot() {
      const cooldown = {};
      for (const [service, until] of cooldowns.entries())
        if (until > now()) cooldown[service] = until;
      return Object.freeze({
        searchId,
        searchCounts: Object.freeze({ ...searchCounts }),
        sessionCount,
        cooldowns: Object.freeze(cooldown),
      });
    }

    return Object.freeze({ beginSearch, beforeRequest, noteFailure, clearCooldown, remaining, snapshot });
  }

  globalThis.JMMJSRequestGovernorCore = Object.freeze({
    DEFAULT_LIMITS,
    createGovernorError,
    createRequestGovernor,
  });
})();
