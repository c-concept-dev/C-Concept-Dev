(() => {
  "use strict";

  const DOCUMENTED_TAGS = Object.freeze([
    "surface", "smoothness", "width", "incline", "highway", "foot",
    "access", "sidewalk", "lit", "barrier", "sac_scale",
    "trail_visibility", "ford", "bridge", "tunnel",
  ]);

  function finite(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function parseWidth(value) {
    if (!finite(value)) {
      const match = String(value || "").replace(",", ".").match(/\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    }
    return Number(value);
  }

  function normalizeSegment(segment = {}) {
    const tags = segment.tags || {};
    const lengthMeters = Math.max(0, Number(segment.lengthMeters ?? segment.length ?? 0) || 0);
    const documented = DOCUMENTED_TAGS.some((key) => tags[key] !== undefined && tags[key] !== "");
    return {
      lengthMeters,
      tags,
      documented,
      surfaceDocumented: Boolean(tags.surface),
      smoothnessDocumented: Boolean(tags.smoothness),
      widthMeters: parseWidth(tags.width),
      steps: tags.highway === "steps",
      footAccessDocumented: tags.foot !== undefined || tags.access !== undefined,
      sourceId: segment.id ?? null,
    };
  }

  function summarizeOverpassTerrain(payload = {}, { routeLengthMeters = 0, retrievedAt = Date.now() } = {}) {
    const rawSegments = Array.isArray(payload.segments)
      ? payload.segments
      : Array.isArray(payload.elements)
        ? payload.elements
        : [];
    const segments = rawSegments.map(normalizeSegment).filter((item) => item.lengthMeters > 0 || item.documented);
    const denominator = Math.max(0, Number(routeLengthMeters) || Number(payload.routeLengthMeters) || 0);
    const sum = (predicate) => segments.filter(predicate).reduce((total, item) => total + item.lengthMeters, 0);
    const coverage = (predicate) => denominator > 0 ? clampPercent((sum(predicate) / denominator) * 100) : 0;
    const widths = segments.map((item) => item.widthMeters).filter(Number.isFinite);
    const stepsDetected = segments.some((item) => item.steps);

    return {
      status: segments.length ? "documented" : "not_documented",
      source: "Overpass / OpenStreetMap",
      retrievedAt: Number.isFinite(Number(payload.retrievedAt)) ? Number(payload.retrievedAt) : retrievedAt,
      coverage: {
        terrainPercent: coverage((item) => item.documented),
        surfacePercent: coverage((item) => item.surfaceDocumented),
        smoothnessPercent: coverage((item) => item.smoothnessDocumented),
        widthPercent: coverage((item) => Number.isFinite(item.widthMeters)),
        footAccessPercent: coverage((item) => item.footAccessDocumented),
      },
      minimumWidthMeters: widths.length ? Math.min(...widths) : null,
      stepsDetected,
      segmentsCount: segments.length,
      statements: {
        stairs: stepsDetected
          ? "Des escaliers sont cartographiés sur la trace interrogée."
          : "Aucun escalier cartographié n’a été détecté ; cela ne prouve pas qu’il n’en existe aucun.",
      },
      rule: "Une donnée absente dans OpenStreetMap reste non documentée et ne devient jamais favorable.",
    };
  }

  function applyOverpassTerrain(route = {}, proof = {}) {
    const next = { ...route };
    const evidence = { ...(next.terrainEvidence || {}) };
    evidence.source = proof.source || "Overpass / OpenStreetMap";
    evidence.overpass = proof;
    evidence.surfaceCoveragePercent = proof.coverage?.surfacePercent ?? evidence.surfaceCoveragePercent ?? 0;
    evidence.minimumWidthMeters = proof.minimumWidthMeters;
    evidence.widthEvidence = Number.isFinite(proof.minimumWidthMeters)
      ? `Largeur minimale cartographiée : ${proof.minimumWidthMeters.toLocaleString("fr-FR")} m.`
      : "Largeur non documentée sur une couverture suffisante.";
    next.terrainEvidence = evidence;
    next.sources = [...new Set([...(next.sources || []), proof.source || "Overpass / OpenStreetMap"])];
    next.warnings = [...(next.warnings || []), proof.statements?.stairs, proof.rule].filter(Boolean);
    next.overpassTerrain = proof;
    return next;
  }

  function markOverpassUnavailable(route = {}, message = "Preuve terrain Overpass indisponible.") {
    return {
      ...route,
      overpassTerrain: {
        status: "unavailable",
        source: "Overpass / OpenStreetMap",
        coverage: { terrainPercent: 0, surfacePercent: 0, smoothnessPercent: 0, widthPercent: 0, footAccessPercent: 0 },
        rule: "L’indisponibilité d’Overpass ne prouve ni la présence ni l’absence d’un élément de terrain.",
      },
      warnings: [...(route.warnings || []), message],
    };
  }

  globalThis.JMMJSOverpassTerrainCore = Object.freeze({
    DOCUMENTED_TAGS,
    summarizeOverpassTerrain,
    applyOverpassTerrain,
    markOverpassUnavailable,
  });
})();
