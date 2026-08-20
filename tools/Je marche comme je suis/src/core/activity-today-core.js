/* JMMJS_ACTIVITY_TODAY_CORE_START */
(() => {
  "use strict";

  const STORAGE_KEY = "jmmjs-d103c-today-v1";
  const ALLOWED = Object.freeze({
    energy: Object.freeze(["lower", "same", "higher", "much_higher"]),
    walkingEase: Object.freeze(["harder", "slightly_harder", "easy", "very_easy"]),
    discomfort: Object.freeze(["important", "moderate", "light", "none"]),
    availableTime: Object.freeze(["under_1h", "1_to_2h", "2_to_3h", "over_3h"]),
    functionalGoal: Object.freeze(["recover", "preserve", "evolve"]),
  });

  const GOAL_FOR_INTENT = Object.freeze({
    gentle_return: "recover",
    maintain: "preserve",
    progress: "evolve",
  });

  function emptyToday() {
    return { version: 1, energy: null, walkingEase: null, discomfort: null, availableTime: null, functionalGoal: null, savedAt: null };
  }

  function normalizeToday(value = {}) {
    const out = emptyToday();
    for (const key of ["energy", "walkingEase", "discomfort", "availableTime"]) {
      out[key] = ALLOWED[key].includes(value?.[key]) ? value[key] : null;
    }
    out.functionalGoal = ALLOWED.functionalGoal.includes(value?.functionalGoal) ? value.functionalGoal : null;
    out.savedAt = typeof value?.savedAt === "string" ? value.savedAt : null;
    return out;
  }

  function isComplete(value = {}) {
    const v = normalizeToday(value);
    return ["energy", "walkingEase", "discomfort", "availableTime"].every((key) => v[key] !== null);
  }

  function suggestedGoal(intent) { return GOAL_FOR_INTENT[intent] || null; }

  function safeParse(raw) {
    if (typeof raw !== "string" || !raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function loadToday(storage) {
    if (!storage || typeof storage.getItem !== "function") return emptyToday();
    return normalizeToday(safeParse(storage.getItem(STORAGE_KEY)) || {});
  }

  function saveToday(storage, value) {
    if (!storage || typeof storage.setItem !== "function") return false;
    const normalized = normalizeToday(value);
    if (!isComplete(normalized)) return false;
    normalized.savedAt = new Date().toISOString();
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  }

  globalThis.JMMJSActivityTodayCore = Object.freeze({ STORAGE_KEY, ALLOWED, GOAL_FOR_INTENT, emptyToday, normalizeToday, isComplete, suggestedGoal, loadToday, saveToday });
})();
/* JMMJS_ACTIVITY_TODAY_CORE_END */
