(() => {
  "use strict";

  const STATUS_RANK = Object.freeze({
    respected: 1,
    unknown: 2,
    uncertain: 2,
    violated: 3,
  });

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\d+(?:[.,]\d+)?/g, "#")
      .replace(/\s+/g, " ")
      .trim();
  }

  function warningCategory(message) {
    const text = normalizeText(message);
    if (text.includes("temperature ressentie") && text.includes("jusqu"))
      return "weather-apparent-max";
    if (text.includes("temperature ressentie minimale"))
      return "weather-apparent-min";
    if (text.includes("rafales"))
      return "weather-gust";
    if (text.includes("probabilite de precipitation"))
      return "weather-rain-probability";
    if (text.includes("visibilite"))
      return "weather-visibility";
    if (text.includes("orage"))
      return "weather-thunder";
    if (text.includes("phenomene meteo"))
      return "weather-phenomenon";
    if (text.includes("service") && text.includes("inverifiable"))
      return "service-unverifiable";
    if (text.includes("pause") && text.includes("inverifiable"))
      return "pause-unverifiable";
    if (text.includes("altitude"))
      return "altitude";
    if (text.includes("terrain"))
      return "terrain";
    return `generic:${text}`;
  }

  function numericValues(message) {
    return [...String(message || "").matchAll(/-?\d+(?:[.,]\d+)?/g)]
      .map((match) => Number(match[0].replace(",", ".")))
      .filter(Number.isFinite);
  }

  function warningPriority(category, message) {
    const values = numericValues(message);
    if (!values.length) return 0;
    if (
      category === "weather-apparent-min" ||
      category === "weather-visibility"
    )
      return -Math.min(...values);
    return Math.max(...values);
  }

  function dedupeWarnings(warnings = []) {
    const selected = new Map();
    for (const raw of Array.isArray(warnings) ? warnings : []) {
      const message = String(raw || "").trim();
      if (!message) continue;
      const category = warningCategory(message);
      const candidate = {
        message,
        priority: warningPriority(category, message),
      };
      const current = selected.get(category);
      if (
        !current ||
        candidate.priority > current.priority ||
        (candidate.priority === current.priority &&
          candidate.message.length > current.message.length)
      )
        selected.set(category, candidate);
    }
    return [...selected.values()].map((entry) => entry.message);
  }

  function checkKey(check) {
    return normalizeText(check?.constraint || check?.label || "contrôle");
  }

  function dedupeChecks(checks = []) {
    const selected = new Map();
    for (const raw of Array.isArray(checks) ? checks : []) {
      if (!raw) continue;
      const check = { ...raw };
      const key = checkKey(check);
      const current = selected.get(key);
      const rank = STATUS_RANK[check.status] || 0;
      const currentRank = STATUS_RANK[current?.status] || 0;
      if (
        !current ||
        rank > currentRank ||
        (rank === currentRank &&
          String(check.evidence || "").length >
            String(current.evidence || "").length)
      )
        selected.set(key, check);
    }
    return [...selected.values()];
  }

  function summarizeChecks(checks = []) {
    const summary = {
      respected: 0,
      unknown: 0,
      violated: 0,
      total: 0,
    };
    for (const check of checks) {
      if (check.status === "respected") summary.respected += 1;
      else if (check.status === "violated") summary.violated += 1;
      else summary.unknown += 1;
    }
    summary.total =
      summary.respected + summary.unknown + summary.violated;
    return summary;
  }

  function synthesizeRoutePresentation(route = {}) {
    const next = { ...route };
    next.warnings = dedupeWarnings(route.warnings);
    next.unknowns = dedupeWarnings(route.unknowns);
    next.checks = dedupeChecks(route.checks);
    next.controlSummary = summarizeChecks(next.checks);
    return next;
  }

  globalThis.JMMJSAlertSynthesisCore = Object.freeze({
    dedupeWarnings,
    dedupeChecks,
    summarizeChecks,
    synthesizeRoutePresentation,
  });
})();
