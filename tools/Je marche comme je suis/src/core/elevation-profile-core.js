(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    minSegmentMeters: 8,
    verticalToleranceMeters: 1.2,
    effortSlopePercent: 1.5,
    easySlopePercent: 3,
    toleratedInterruptionMeters: 35,
    minimumCoverage: 0.95,
  });

  const finite = (value) => Number.isFinite(Number(value));
  const round = (value, digits = 1) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  };

  function haversineMeters(a, b) {
    const p1 = (Number(a[1]) * Math.PI) / 180;
    const p2 = (Number(b[1]) * Math.PI) / 180;
    const dp = ((Number(b[1]) - Number(a[1])) * Math.PI) / 180;
    const dl = ((Number(b[0]) - Number(a[0])) * Math.PI) / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function classifySlope(slope, options) {
    if (slope >= options.effortSlopePercent) return "up";
    if (slope <= -options.effortSlopePercent) return "down";
    return "easy";
  }

  function buildSegments(coords, paceKmh, overrides = {}) {
    const options = { ...DEFAULTS, ...overrides };
    const metersPerMinute = Math.max(1, (Number(paceKmh) || 3.2) * 1000 / 60);
    const segments = [];
    let totalDistance = 0;
    let knownDistance = 0;
    for (let i = 1; i < (coords || []).length; i += 1) {
      const a = coords[i - 1];
      const b = coords[i];
      const distanceMeters = haversineMeters(a, b);
      if (!finite(distanceMeters) || distanceMeters <= 0) continue;
      totalDistance += distanceMeters;
      if (!finite(a[2]) || !finite(b[2])) {
        segments.push({ type: "unknown", distanceMeters, minutes: distanceMeters / metersPerMinute });
        continue;
      }
      knownDistance += distanceMeters;
      const rise = Number(b[2]) - Number(a[2]);
      const ignored = distanceMeters < options.minSegmentMeters || Math.abs(rise) < options.verticalToleranceMeters;
      const slopePercent = ignored ? 0 : rise / distanceMeters * 100;
      segments.push({
        type: classifySlope(slopePercent, options),
        distanceMeters,
        minutes: distanceMeters / metersPerMinute,
        riseMeters: rise,
        slopePercent,
      });
    }
    return {
      segments,
      totalDistance,
      knownDistance,
      coverage: totalDistance ? knownDistance / totalDistance : 0,
      options,
    };
  }

  function mergeSequences(segments, targetType, options) {
    const sequences = [];
    let current = null;
    let interruption = null;
    const flush = () => {
      if (current) sequences.push(current);
      current = null;
      interruption = null;
    };
    const absorb = (segment) => {
      current.distanceMeters += segment.distanceMeters;
      current.minutes += segment.minutes;
      current.riseMeters += segment.riseMeters || 0;
      current.maxSlopePercent = Math.max(current.maxSlopePercent, Math.abs(segment.slopePercent || 0));
    };
    for (const segment of segments) {
      if (segment.type === "unknown") {
        flush();
        continue;
      }
      if (segment.type === targetType) {
        if (!current) current = { type: targetType, distanceMeters: 0, minutes: 0, riseMeters: 0, maxSlopePercent: 0 };
        if (interruption) {
          absorb(interruption);
          interruption = null;
        }
        absorb(segment);
      } else if (current && segment.distanceMeters <= options.toleratedInterruptionMeters) {
        interruption = interruption
          ? {
              ...interruption,
              distanceMeters: interruption.distanceMeters + segment.distanceMeters,
              minutes: interruption.minutes + segment.minutes,
              riseMeters: interruption.riseMeters + (segment.riseMeters || 0),
            }
          : { ...segment };
      } else {
        flush();
      }
    }
    flush();
    return sequences;
  }

  function recoveryAfterEffort(segments, requiredMinutes, options) {
    if (!requiredMinutes) return { requiredMinutes: 0, bestMinutes: 0, satisfied: true };
    let effortSeen = false;
    let current = 0;
    let best = 0;
    for (const segment of segments) {
      if (segment.type === "unknown") {
        current = 0;
        continue;
      }
      if (segment.type === "up") {
        effortSeen = true;
        current = 0;
        continue;
      }
      const easy = Math.abs(segment.slopePercent || 0) <= options.easySlopePercent;
      if (effortSeen && easy) {
        current += segment.minutes;
        best = Math.max(best, current);
      } else if (segment.type === "down" && Math.abs(segment.slopePercent || 0) > options.easySlopePercent) {
        current = 0;
      }
    }
    return { requiredMinutes, bestMinutes: round(best), satisfied: effortSeen ? best + 1e-9 >= requiredMinutes : null };
  }

  function analyzeElevationProfile(coords, paceKmh, recoveryMinutes = 0, overrides = {}) {
    const built = buildSegments(coords, paceKmh, overrides);
    const up = mergeSequences(built.segments, "up", built.options);
    const down = mergeSequences(built.segments, "down", built.options);
    const maxBy = (items, key) => items.reduce((best, item) => Math.max(best, Number(item[key]) || 0), 0);
    const maxSlopeUp = maxBy(built.segments.filter((x) => x.type === "up"), "slopePercent");
    const maxSlopeDown = maxBy(built.segments.filter((x) => x.type === "down").map((x) => ({ slopePercent: Math.abs(x.slopePercent) })), "slopePercent");
    const recovery = recoveryAfterEffort(built.segments, recoveryMinutes, built.options);
    const completeEnough = built.coverage >= built.options.minimumCoverage;
    return {
      known: built.knownDistance > 0,
      completeEnough,
      coverage: round(built.coverage * 100),
      quality: built.coverage >= 0.999 ? "complete" : completeEnough ? "partial-usable" : built.knownDistance ? "partial-insufficient" : "absent",
      maxUpPercent: round(maxSlopeUp),
      maxDownPercent: round(maxSlopeDown),
      maxContinuousAscentMinutes: round(maxBy(up, "minutes")),
      maxContinuousDescentMinutes: round(maxBy(down, "minutes")),
      maxContinuousAscentDistanceMeters: Math.round(maxBy(up, "distanceMeters")),
      maxContinuousDescentDistanceMeters: Math.round(maxBy(down, "distanceMeters")),
      ascentSequences: up.map((x) => ({ ...x, minutes: round(x.minutes), distanceMeters: Math.round(x.distanceMeters), riseMeters: round(x.riseMeters) })),
      descentSequences: down.map((x) => ({ ...x, minutes: round(x.minutes), distanceMeters: Math.round(x.distanceMeters), riseMeters: round(Math.abs(x.riseMeters)) })),
      recoveryMinutesFound: recovery.bestMinutes,
      recoverySatisfied: completeEnough ? recovery.satisfied : null,
      parameters: built.options,
    };
  }

  function compareDirections(coords, paceKmh, recoveryMinutes = 0, score = () => 0, overrides = {}) {
    const forward = analyzeElevationProfile(coords, paceKmh, recoveryMinutes, overrides);
    const reverseCoords = [...coords].reverse();
    const reverse = analyzeElevationProfile(reverseCoords, paceKmh, recoveryMinutes, overrides);
    return score(reverse) < score(forward)
      ? { direction: "reverse", profile: reverse, coords: reverseCoords, forward, reverse }
      : { direction: "forward", profile: forward, coords, forward, reverse };
  }

  globalThis.JMMJSElevationProfileCore = Object.freeze({
    DEFAULTS,
    analyzeElevationProfile,
    compareDirections,
    buildSegments,
  });
})();
