(() => {
  "use strict";

  const SESSION_KEY = "jmmjs-session-privacy";
  const SENSITIVE_KEYS = new Set([
    "person",
    "dailyState",
    "limitations",
    "functionalLimitation",
    "freeText",
    "pain",
    "painDetail",
    "fatigue",
    "balanceConfidence",
    "age",
    "footwear",
    "equipment",
  ]);

  function cloneAllowed(value, path = []) {
    if (Array.isArray(value)) return value.map((item, index) => cloneAllowed(item, [...path, index]));
    if (!value || typeof value !== "object") return value;
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) continue;
      output[key] = cloneAllowed(child, [...path, key]);
    }
    return output;
  }

  function createSessionPrivacyController({
    storage = globalThis.sessionStorage,
    now = () => new Date(),
  } = {}) {
    const transmissions = [];

    function prepareProviderPayload(service, path, payload) {
      const sanitized = cloneAllowed(payload ?? {});
      recordTransmission(service, path, sanitized);
      return sanitized;
    }

    function recordTransmission(service, path, payload) {
      const entry = {
        service: String(service || "service"),
        path: String(path || ""),
        at: now().toISOString(),
        includesCoordinates:
          Object.prototype.hasOwnProperty.call(payload || {}, "coordinate") ||
          Object.prototype.hasOwnProperty.call(payload || {}, "bbox") ||
          Object.prototype.hasOwnProperty.call(payload || {}, "lat") ||
          Object.prototype.hasOwnProperty.call(payload || {}, "lon"),
        includesHealthData: false,
      };
      transmissions.push(entry);
      if (transmissions.length > 20) transmissions.shift();
      try {
        storage?.setItem(
          SESSION_KEY,
          JSON.stringify({
            lastActivityAt: entry.at,
            transmissionCount: transmissions.length,
          }),
        );
      } catch {}
      return entry;
    }

    function summary() {
      return {
        transmissionCount: transmissions.length,
        transmissions: transmissions.map((entry) => ({ ...entry })),
        healthDataSent: transmissions.some((entry) => entry.includesHealthData),
        coordinatesSent: transmissions.some((entry) => entry.includesCoordinates),
      };
    }

    function clearSession() {
      transmissions.length = 0;
      try {
        storage?.removeItem(SESSION_KEY);
        return true;
      } catch {
        return false;
      }
    }

    return Object.freeze({
      prepareProviderPayload,
      recordTransmission,
      summary,
      clearSession,
    });
  }

  globalThis.JMMJSSessionPrivacyCore = Object.freeze({
    SESSION_KEY,
    SENSITIVE_KEYS,
    cloneAllowed,
    createSessionPrivacyController,
  });
})();
