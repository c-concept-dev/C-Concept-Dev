(() => {
  "use strict";

  const REGULAR_SURFACE_IDS = new Set([1, 3, 4]);
  const IRREGULAR_SURFACE_IDS = new Set([2, 8, 10, 11, 12, 13, 14, 15, 17, 18]);

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function assessTerrainEvidence({ surfaces = [], source = "unknown" } = {}) {
    const normalized = (Array.isArray(surfaces) ? surfaces : [])
      .map((surface) => ({
        id: Number(surface.id),
        type: surface.type || `Surface ${surface.id}`,
        percent: Math.max(0, number(surface.percent ?? surface.amount)),
      }))
      .filter((surface) => Number.isFinite(surface.id) && surface.percent > 0);

    const documentedPercent = Math.min(
      100,
      normalized
        .filter((surface) => surface.id !== 0)
        .reduce((sum, surface) => sum + surface.percent, 0),
    );
    const unknownPercent = Math.min(
      100,
      normalized
        .filter((surface) => surface.id === 0)
        .reduce((sum, surface) => sum + surface.percent, 0),
    );
    const regularPercent = normalized
      .filter((surface) => REGULAR_SURFACE_IDS.has(surface.id))
      .reduce((sum, surface) => sum + surface.percent, 0);
    const irregularPercent = normalized
      .filter((surface) => IRREGULAR_SURFACE_IDS.has(surface.id))
      .reduce((sum, surface) => sum + surface.percent, 0);

    const quality = documentedPercent >= 90 && unknownPercent <= 10
      ? "documented"
      : documentedPercent > 0
        ? "partial"
        : "absent";

    let regularitySafe = null;
    if (quality === "documented") {
      if (irregularPercent >= 10) regularitySafe = false;
      else if (regularPercent >= 80 && irregularPercent <= 2) regularitySafe = true;
    }

    const label = {
      documented: "preuve cartographique documentée",
      partial: "preuve cartographique partielle",
      absent: "preuve terrain absente",
    }[quality];

    return {
      source,
      quality,
      label,
      surfaceCoveragePercent: Math.round(documentedPercent),
      unknownSurfacePercent: Math.round(unknownPercent),
      regularPercent: Math.round(regularPercent),
      irregularPercent: Math.round(irregularPercent),
      regularitySafe,
      minimumWidthMeters: null,
      exposureSafe: null,
      widthEvidence: "largeur non fournie par la source",
      exposureEvidence: "exposition non fournie par la source",
      evidence:
        quality === "absent"
          ? "aucune surface documentée"
          : `${Math.round(documentedPercent)} % de la trace possède une surface documentée`,
    };
  }

  function absentTerrainEvidence(source = "GPX") {
    return assessTerrainEvidence({ surfaces: [], source });
  }

  globalThis.JMMJSTerrainEvidenceCore = Object.freeze({
    REGULAR_SURFACE_IDS,
    IRREGULAR_SURFACE_IDS,
    assessTerrainEvidence,
    absentTerrainEvidence,
  });
})();
