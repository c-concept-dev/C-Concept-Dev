(() => {
  "use strict";
  const CRITICAL_CODES = new Set([66, 67, 75, 77, 82, 86, 95, 96, 99]);
  const THUNDER_CODES = new Set([95, 96, 99]);
  const finiteValues = (values = []) => (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  const maxOrNull = (values) => {
    const valid = finiteValues(values);
    return valid.length ? Math.max(...valid) : null;
  };
  const minOrNull = (values) => {
    const valid = finiteValues(values);
    return valid.length ? Math.min(...valid) : null;
  };
  function summarizeForecast(hourly = {}, options = {}) {
    const startIndex = Math.max(0, Number(options.startIndex) || 0);
    const count = Math.max(1, Number(options.count) || 3);
    const slice = (key) => Array.isArray(hourly[key]) ? hourly[key].slice(startIndex, startIndex + count) : [];
    const codes = finiteValues(slice("weather_code"));
    const summary = {
      source: "Open-Meteo",
      startTime: slice("time")[0] || null,
      endTime: slice("time").at(-1) || null,
      temperatureMinC: minOrNull(slice("temperature_2m")),
      temperatureMaxC: maxOrNull(slice("temperature_2m")),
      apparentMinC: minOrNull(slice("apparent_temperature")),
      apparentMaxC: maxOrNull(slice("apparent_temperature")),
      precipitationProbabilityMax: maxOrNull(slice("precipitation_probability")),
      precipitationMm: finiteValues(slice("precipitation")).reduce((sum, value) => sum + value, 0),
      windGustMaxKmh: maxOrNull(slice("wind_gusts_10m")),
      visibilityMinM: minOrNull(slice("visibility")),
      weatherCodes: codes,
      coverageHours: Math.min(count, slice("time").length),
      requestedHours: count,
    };
    summary.complete = summary.coverageHours >= count;
    return summary;
  }
  function assessForecast(summary) {
    if (!summary || !summary.coverageHours) {
      return {
        level: "unknown",
        label: "Prévision indisponible",
        checks: [{ status: "unknown", label: "Météo prévue pendant la balade", evidence: "Aucune prévision horaire exploitable n’a été obtenue." }],
        warnings: [],
      };
    }
    const warnings = [];
    const hasCriticalCode = summary.weatherCodes.some((code) => CRITICAL_CODES.has(code));
    const thunder = summary.weatherCodes.some((code) => THUNDER_CODES.has(code));
    const strongGust = Number.isFinite(summary.windGustMaxKmh) && summary.windGustMaxKmh >= 70;
    const poorVisibility = Number.isFinite(summary.visibilityMinM) && summary.visibilityMinM < 500;
    if (thunder) warnings.push("Risque orageux prévu pendant la plage de sortie.");
    else if (hasCriticalCode) warnings.push("Phénomène météo marqué prévu pendant la plage de sortie.");
    if (strongGust) warnings.push(`Rafales prévues jusqu’à ${Math.round(summary.windGustMaxKmh)} km/h.`);
    if (poorVisibility) warnings.push(`Visibilité prévue pouvant descendre à ${Math.round(summary.visibilityMinM)} m.`);
    if (Number.isFinite(summary.precipitationProbabilityMax) && summary.precipitationProbabilityMax >= 60)
      warnings.push(`Probabilité de précipitations jusqu’à ${Math.round(summary.precipitationProbabilityMax)} %.`);
    if (Number.isFinite(summary.apparentMaxC) && summary.apparentMaxC >= 32)
      warnings.push(`Température ressentie prévue jusqu’à ${Math.round(summary.apparentMaxC)} °C.`);
    if (Number.isFinite(summary.apparentMinC) && summary.apparentMinC <= 0)
      warnings.push(`Température ressentie minimale prévue : ${Math.round(summary.apparentMinC)} °C.`);
    const critical = hasCriticalCode || strongGust || poorVisibility;
    const status = critical ? "violated" : summary.complete ? "respected" : "unknown";
    return {
      level: critical ? "critical" : warnings.length ? "caution" : "favorable",
      label: critical ? "Conditions défavorables" : warnings.length ? "Prudence météo" : "Conditions sans alerte technique",
      checks: [{
        status,
        label: "Météo prévue pendant la balade",
        evidence: critical
          ? warnings.join(" ")
          : summary.complete
            ? `Prévision Open-Meteo disponible sur ${summary.coverageHours} h ; aucun phénomène critique selon les seuils techniques D-028.`
            : `Prévision Open-Meteo partielle : ${summary.coverageHours} h sur ${summary.requestedHours} h demandées.`,
      }],
      warnings,
    };
  }
  function applyWeatherAssessment(route, summary, assessment) {
    const next = { ...route };
    next.weather = { summary, assessment };
    next.checks = [
      ...(Array.isArray(next.checks) ? next.checks : []),
      ...assessment.checks.map((check) => ({
        constraint: check.label,
        status: check.status,
        evidence: check.evidence,
        severity: assessment.level === "critical" ? "hard" : "advisory",
      })),
    ];
    next.warnings = [...new Set([...(next.warnings || []), ...assessment.warnings])];
    if (assessment.level === "critical") {
      next.proposalStatus = "adaptation";
      next.canNavigate = false;
      next.violations = [...new Set([...(next.violations || []), "Météo défavorable prévue"])];
    }
    return next;
  }
  globalThis.JMMJSWeatherCore = Object.freeze({ summarizeForecast, assessForecast, applyWeatherAssessment });
})();