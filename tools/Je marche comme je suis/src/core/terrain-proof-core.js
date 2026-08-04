(() => {
  "use strict";

  const LEVEL_RANK = Object.freeze({
    confirmed: 5,
    probable: 4,
    partial: 3,
    "very-partial": 2.5,
    undocumented: 2,
    contradictory: 1,
  });

  const LEVEL_LABEL = Object.freeze({
    confirmed: "Confirmé",
    probable: "Probable",
    partial: "Partiel",
    "very-partial": "Très partiellement documenté",
    undocumented: "Non documenté",
    contradictory: "Contradictoire",
  });

  function daysBetween(timestamp, now = Date.now()) {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.floor((now - value) / 86400000));
  }

  function finiteProvided(value) {
    return value !== null && value !== undefined && value !== "" &&
      Number.isFinite(Number(value));
  }

  function sourceRecord({
    name,
    kind,
    capturedAt = null,
    distanceMeters = null,
    note = "",
  }) {
    return {
      name: String(name || "Source inconnue"),
      kind: String(kind || "unknown"),
      capturedAt: Number.isFinite(Number(capturedAt))
        ? Number(capturedAt)
        : null,
      ageDays: daysBetween(capturedAt),
      distanceMeters: Number.isFinite(Number(distanceMeters))
        ? Math.round(Number(distanceMeters))
        : null,
      note: String(note || ""),
    };
  }

  function evidenceItem({
    id,
    label,
    level,
    statement,
    source,
    reason,
  }) {
    return {
      id,
      label,
      level,
      levelLabel: LEVEL_LABEL[level] || level,
      statement,
      source,
      reason,
    };
  }

  function weakestLevel(items = []) {
    const levels = items.map((item) => item.level).filter(Boolean);
    if (!levels.length) return "undocumented";
    if (levels.includes("contradictory")) return "contradictory";
    return levels.reduce((weakest, level) =>
      (LEVEL_RANK[level] || 0) < (LEVEL_RANK[weakest] || 0)
        ? level
        : weakest,
    );
  }

  function summarizeTerrainProof(
    terrainEvidence = {},
    {
      photos = [],
      contradictions = [],
      now = Date.now(),
    } = {},
  ) {
    const cartographicSource = sourceRecord({
      name: terrainEvidence.source || "Cartographie",
      kind: "cartography",
      note:
        "La date de mise à jour n’est pas fournie par la réponse de calcul.",
    });

    const coverage = Number(terrainEvidence.surfaceCoveragePercent);
    const surfaceLevel =
      Number.isFinite(coverage) && coverage >= 90
        ? "probable"
        : Number.isFinite(coverage) && coverage >= 25
          ? "partial"
          : Number.isFinite(coverage) && coverage > 0
            ? "very-partial"
          : "undocumented";

    const items = [
      evidenceItem({
        id: "surface",
        label: "Surface",
        level: surfaceLevel,
        statement:
          surfaceLevel === "undocumented"
            ? "Surface non documentée."
            : `${Math.round(coverage)} % de la trace possède une surface cartographiée.`,
        source: cartographicSource.name,
        reason:
          surfaceLevel === "probable"
            ? "La cartographie couvre presque toute la trace, sans observation directe."
            : surfaceLevel === "partial"
              ? "Une partie seulement de la trace est documentée."
              : surfaceLevel === "very-partial"
                ? "Moins d’un quart de la trace est documenté ; aucune conclusion globale n’est possible."
              : "Aucune donnée exploitable n’a été fournie.",
      }),
      evidenceItem({
        id: "regularity",
        label: "Régularité",
        level:
          terrainEvidence.regularitySafe === true ||
          terrainEvidence.regularitySafe === false
            ? "probable"
            : "undocumented",
        statement:
          terrainEvidence.regularitySafe === true
            ? "Terrain probablement régulier sur la portion documentée."
            : terrainEvidence.regularitySafe === false
              ? "Irrégularités cartographiques probables."
              : "Régularité non documentée.",
        source: cartographicSource.name,
        reason:
          terrainEvidence.regularitySafe == null
            ? "La source ne permet pas de conclure."
            : "Conclusion issue des types de surfaces cartographiés.",
      }),
      evidenceItem({
        id: "width",
        label: "Largeur",
        level: finiteProvided(terrainEvidence.minimumWidthMeters)
          ? "probable"
          : "undocumented",
        statement: finiteProvided(terrainEvidence.minimumWidthMeters)
          ? `Largeur minimale déclarée : ${Number(
              terrainEvidence.minimumWidthMeters,
            ).toLocaleString("fr-FR")} m.`
          : "Largeur non documentée.",
        source: cartographicSource.name,
        reason:
          terrainEvidence.widthEvidence ||
          "La largeur n’est pas fournie par la source.",
      }),
      evidenceItem({
        id: "exposure",
        label: "Exposition",
        level:
          terrainEvidence.exposureSafe === true ||
          terrainEvidence.exposureSafe === false
            ? "probable"
            : "undocumented",
        statement:
          terrainEvidence.exposureSafe === true
            ? "Absence d’exposition probablement documentée."
            : terrainEvidence.exposureSafe === false
              ? "Passage exposé probablement documenté."
              : "Exposition non documentée.",
        source: cartographicSource.name,
        reason:
          terrainEvidence.exposureEvidence ||
          "L’exposition n’est pas fournie par la source.",
      }),
    ];

    const normalizedPhotos = (Array.isArray(photos) ? photos : [])
      .filter((photo) => Number.isFinite(Number(photo.capturedAt)))
      .map((photo) =>
        sourceRecord({
          name: "Mapillary",
          kind: "photograph",
          capturedAt: photo.capturedAt,
          distanceMeters: photo.distance,
          note:
            "Photographie indicative : elle ne garantit pas l’état actuel ni l’ensemble du parcours.",
        }),
      )
      .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));

    items.push(
      evidenceItem({
        id: "photos",
        label: "Photographies",
        level: normalizedPhotos.length ? "partial" : "undocumented",
        statement: normalizedPhotos.length
          ? `${normalizedPhotos.length} photographie(s) à moins de 120 m de la trace.`
          : "Aucune photographie exploitable trouvée à moins de 120 m.",
        source: normalizedPhotos.length ? "Mapillary" : "Aucune",
        reason: normalizedPhotos.length
          ? "Contexte visuel ponctuel uniquement ; aucune validation globale du terrain."
          : "Une absence de photographie ne prouve pas l’absence d’un risque.",
      }),
    );

    const contradictionList = (Array.isArray(contradictions)
      ? contradictions
      : []
    ).filter(Boolean);
    if (contradictionList.length) {
      items.push(
        evidenceItem({
          id: "contradictions",
          label: "Contradictions",
          level: "contradictory",
          statement: contradictionList.join(" · "),
          source: "Sources multiples",
          reason:
            "Des informations incompatibles empêchent une conclusion fiable.",
        }),
      );
    }

    const overallLevel = weakestLevel(items);
    const latestPhoto = normalizedPhotos[0] || null;
    const nearestPhotoDistance = normalizedPhotos.length
      ? Math.min(
          ...normalizedPhotos
            .map((photo) => photo.distanceMeters)
            .filter(Number.isFinite),
        )
      : null;

    return {
      overallLevel,
      overallLabel: LEVEL_LABEL[overallLevel],
      items,
      sources: [cartographicSource, ...normalizedPhotos],
      photoSummary: {
        count: normalizedPhotos.length,
        latestAgeDays: latestPhoto
          ? Math.max(
              0,
              Math.floor((now - latestPhoto.capturedAt) / 86400000),
            )
          : null,
        nearestDistanceMeters: Number.isFinite(nearestPhotoDistance)
          ? nearestPhotoDistance
          : null,
      },
      rule:
        "Une donnée non trouvée ne signifie jamais que l’élément est absent.",
    };
  }

  globalThis.JMMJSTerrainProofCore = Object.freeze({
    LEVEL_LABEL,
    summarizeTerrainProof,
  });
})();
