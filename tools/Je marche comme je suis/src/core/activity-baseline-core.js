/* JMMJS_ACTIVITY_BASELINE_CORE_START */
(() => {
  "use strict";

  const LONGITUDINAL_INTENTS = Object.freeze([
    "gentle_return",
    "maintain",
    "progress",
  ]);

  const STORAGE_KEYS = Object.freeze({
    baseline: "jmmjs-d103c-baseline-v1",
    intent: "jmmjs-d103c-activity-intent-v1",
  });

  const ALLOWED = Object.freeze({
    energy: Object.freeze(["low", "medium", "good", "very_good"]),
    walkingEase: Object.freeze(["difficult", "sometimes_difficult", "rather_easy", "very_easy"]),
    duration: Object.freeze(["up_to_1h", "1_to_2h", "2_to_3h", "more_than_3h"]),
    pauses: Object.freeze(["often", "sometimes", "rarely", "no_need"]),
  });

  function emptyBaseline() {
    return {
      version: 1,
      energy: null,
      walkingEase: null,
      duration: null,
      pauses: null,
      savedAt: null,
    };
  }

  function normalizeBaseline(value = {}) {
    const out = emptyBaseline();
    for (const key of Object.keys(ALLOWED)) {
      const candidate = value?.[key];
      out[key] = ALLOWED[key].includes(candidate) ? candidate : null;
    }
    out.savedAt = typeof value?.savedAt === "string" ? value.savedAt : null;
    return out;
  }

  function isComplete(value = {}) {
    const baseline = normalizeBaseline(value);
    return Object.keys(ALLOWED).every((key) => baseline[key] !== null);
  }

  function intentNeedsBaseline(intent) {
    return LONGITUDINAL_INTENTS.includes(intent);
  }

  function safeParse(raw) {
    if (typeof raw !== "string" || !raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function loadBaseline(storage) {
    if (!storage || typeof storage.getItem !== "function") return emptyBaseline();
    return normalizeBaseline(safeParse(storage.getItem(STORAGE_KEYS.baseline)) || {});
  }

  function saveBaseline(storage, value) {
    if (!storage || typeof storage.setItem !== "function") return false;
    const normalized = normalizeBaseline(value);
    if (!isComplete(normalized)) return false;
    normalized.savedAt = new Date().toISOString();
    storage.setItem(STORAGE_KEYS.baseline, JSON.stringify(normalized));
    return true;
  }

  function saveIntent(storage, intent) {
    if (!storage || typeof storage.setItem !== "function") return false;
    if (!["leisure", ...LONGITUDINAL_INTENTS].includes(intent)) return false;
    storage.setItem(STORAGE_KEYS.intent, intent);
    return true;
  }

  function loadIntent(storage) {
    if (!storage || typeof storage.getItem !== "function") return null;
    const value = storage.getItem(STORAGE_KEYS.intent);
    return ["leisure", ...LONGITUDINAL_INTENTS].includes(value) ? value : null;
  }

  globalThis.JMMJSActivityBaselineCore = Object.freeze({
    LONGITUDINAL_INTENTS,
    STORAGE_KEYS,
    ALLOWED,
    emptyBaseline,
    normalizeBaseline,
    isComplete,
    intentNeedsBaseline,
    loadBaseline,
    saveBaseline,
    saveIntent,
    loadIntent,
  });
})();
/* JMMJS_ACTIVITY_BASELINE_CORE_END */
