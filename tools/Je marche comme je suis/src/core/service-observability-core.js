(() => {
  "use strict";

  const STORAGE_KEY = "jmmjs.service-incidents.v1";
  const MAX_EVENTS = 20;

  function safeParse(value) {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizeEvent(event = {}, now = Date.now) {
    const diagnostic = event.diagnostic || {};
    return Object.freeze({
      id: `${now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date(now()).toISOString(),
      service: String(event.service || "service"),
      operation: String(event.operation || "operation"),
      outcome: event.ok ? "success" : "failure",
      code: event.ok ? "ok" : String(diagnostic.code || "unknown"),
      status: Number.isFinite(Number(diagnostic.status)) ? Number(diagnostic.status) : null,
      attempts: Number(event.attempts) || 1,
      retryable: Boolean(diagnostic.retryable),
      message: event.ok
        ? "Opération terminée."
        : String(diagnostic.userMessage || "Le service n’a pas pu terminer l’opération."),
    });
  }

  function createServiceObservability({ storage = null, now = Date.now } = {}) {
    let events = safeParse(storage?.getItem?.(STORAGE_KEY)).slice(-MAX_EVENTS);

    function persist() {
      try { storage?.setItem?.(STORAGE_KEY, JSON.stringify(events)); } catch {}
    }

    function record(event) {
      const normalized = normalizeEvent(event, now);
      events = [...events, normalized].slice(-MAX_EVENTS);
      persist();
      return normalized;
    }

    function list({ failuresOnly = false } = {}) {
      const selected = failuresOnly
        ? events.filter((event) => event.outcome === "failure")
        : events;
      return Object.freeze(selected.map((event) => Object.freeze({ ...event })));
    }

    function summary() {
      const failures = events.filter((event) => event.outcome === "failure");
      return Object.freeze({
        eventCount: events.length,
        failureCount: failures.length,
        lastFailure: failures.at(-1) || null,
      });
    }

    function clear() {
      events = [];
      try { storage?.removeItem?.(STORAGE_KEY); } catch {}
    }

    return Object.freeze({ record, list, summary, clear });
  }

  globalThis.JMMJSServiceObservabilityCore = Object.freeze({
    STORAGE_KEY,
    MAX_EVENTS,
    normalizeEvent,
    createServiceObservability,
  });
})();
