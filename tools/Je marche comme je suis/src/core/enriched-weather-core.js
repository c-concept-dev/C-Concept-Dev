(() => {
  "use strict";

  function validDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function enrichWeatherSummary(summary, raw = {}, departure = {}, minutes = 60) {
    if (!summary) return null;
    const departureDate = validDate(departure?.date || departure?.iso || summary.startTime);
    const durationMinutes = Math.max(0, Number(minutes) || 0);
    const returnDate = departureDate
      ? new Date(departureDate.getTime() + durationMinutes * 60_000)
      : null;
    const sunrise = raw?.daily?.sunrise?.[0] || null;
    const sunset = raw?.daily?.sunset?.[0] || null;
    const sunsetDate = validDate(sunset);
    const daylightMarginMinutes =
      returnDate && sunsetDate
        ? Math.round((sunsetDate.getTime() - returnDate.getTime()) / 60_000)
        : null;
    return {
      ...summary,
      retrievedAt: Number.isFinite(Number(raw?.fetchedAt))
        ? new Date(Number(raw.fetchedAt)).toISOString()
        : null,
      timezone: raw?.timezone || null,
      sunrise,
      sunset,
      estimatedReturnAt: returnDate ? returnDate.toISOString() : null,
      daylightMarginMinutes,
      model: "best match",
    };
  }

  function daylightAssessment(summary) {
    const margin = Number(summary?.daylightMarginMinutes);
    if (!Number.isFinite(margin))
      return { level: "unknown", label: "Lumière du jour non déterminée" };
    if (margin < 0)
      return { level: "critical", label: "Retour estimé après le coucher du soleil" };
    if (margin < 15)
      return { level: "critical", label: "Marge avant la nuit très faible" };
    if (margin < 30)
      return { level: "caution", label: "Marge avant la nuit faible" };
    if (margin < 60)
      return { level: "favorable", label: "Marge avant la nuit correcte" };
    return { level: "favorable", label: "Marge avant la nuit confortable" };
  }

  globalThis.JMMJSEnrichedWeatherCore = Object.freeze({
    enrichWeatherSummary,
    daylightAssessment,
  });
})();
