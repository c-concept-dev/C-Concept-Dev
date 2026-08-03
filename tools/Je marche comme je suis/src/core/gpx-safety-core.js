(() => {
  "use strict";

  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const MAX_TRACK_POINTS = 250000;
  const MAX_TRACKS = 100;

  function countMatches(text, pattern) {
    return (String(text || "").match(pattern) || []).length;
  }

  function auditGPXInput({
    fileName = "",
    fileSize = 0,
    mimeType = "",
    text = "",
  } = {}) {
    const errors = [];
    const warnings = [];
    const normalizedName = String(fileName || "").trim();
    const normalizedMime = String(mimeType || "").toLowerCase();
    const content = String(text || "");

    if (!normalizedName.toLowerCase().endsWith(".gpx"))
      errors.push("Le fichier doit porter l’extension .gpx.");

    if (!Number.isFinite(Number(fileSize)) || Number(fileSize) <= 0)
      errors.push("Le fichier GPX est vide.");
    else if (Number(fileSize) > MAX_FILE_BYTES)
      errors.push(
        `Le fichier dépasse la limite de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} Mo.`,
      );

    if (
      normalizedMime &&
      ![
        "application/gpx+xml",
        "application/xml",
        "text/xml",
        "text/plain",
        "application/octet-stream",
      ].includes(normalizedMime)
    )
      warnings.push(
        `Type de fichier inhabituel : ${normalizedMime}. Le contenu XML sera contrôlé.`,
      );

    if (!content.trim())
      errors.push("Le fichier GPX ne contient aucune donnée.");
    if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content))
      errors.push(
        "Les déclarations DOCTYPE et ENTITY ne sont pas acceptées dans un GPX.",
      );
    if (!/<gpx\b/i.test(content))
      errors.push("Le document ne contient pas de balise GPX.");
    if (/<parsererror\b/i.test(content))
      errors.push("Le contenu XML signale une erreur d’analyse.");

    const trackPointCount = countMatches(content, /<trkpt\b/gi);
    const routePointCount = countMatches(content, /<rtept\b/gi);
    const waypointCount = countMatches(content, /<wpt\b/gi);
    const trackCount = countMatches(content, /<trk\b/gi);
    const totalGeometryPoints = trackPointCount + routePointCount;

    if (totalGeometryPoints === 0)
      errors.push("Aucun point de trace ou de route n’a été trouvé.");
    if (totalGeometryPoints > MAX_TRACK_POINTS)
      errors.push(
        `Le fichier contient trop de points (${totalGeometryPoints.toLocaleString(
          "fr-FR",
        )}).`,
      );
    if (trackCount > MAX_TRACKS)
      errors.push(`Le fichier contient trop de traces (${trackCount}).`);

    return {
      accepted: errors.length === 0,
      errors,
      warnings,
      stats: {
        fileName: normalizedName,
        fileSize: Number(fileSize) || 0,
        trackCount,
        trackPointCount,
        routePointCount,
        waypointCount,
        totalGeometryPoints,
      },
    };
  }

  function auditParsedGPX(parsed = []) {
    const errors = [];
    const warnings = [];
    const candidates = Array.isArray(parsed) ? parsed : [];

    if (!candidates.length)
      errors.push("Aucune trace exploitable n’a été produite.");

    let validCandidates = 0;
    let totalPoints = 0;

    for (const [index, candidate] of candidates.entries()) {
      const points = Array.isArray(candidate?.points)
        ? candidate.points
        : [];
      const validPoints = points.filter(
        (point) =>
          Array.isArray(point) &&
          Number.isFinite(Number(point[0])) &&
          Number.isFinite(Number(point[1])) &&
          Number(point[0]) >= -180 &&
          Number(point[0]) <= 180 &&
          Number(point[1]) >= -90 &&
          Number(point[1]) <= 90,
      );

      totalPoints += validPoints.length;
      if (validPoints.length >= 2) validCandidates += 1;
      else
        warnings.push(
          `La trace ${index + 1} contient moins de deux coordonnées valides.`,
        );

      if (validPoints.length !== points.length)
        warnings.push(
          `La trace ${index + 1} contient ${
            points.length - validPoints.length
          } coordonnée(s) invalide(s).`,
        );
    }

    if (!validCandidates)
      errors.push("Aucune trace ne contient assez de coordonnées valides.");

    return {
      accepted: errors.length === 0,
      errors,
      warnings,
      stats: {
        candidateCount: candidates.length,
        validCandidateCount: validCandidates,
        totalValidPoints: totalPoints,
      },
    };
  }

  function formatGPXAudit(audit = {}) {
    if (!audit.accepted)
      return `GPX refusé · ${(audit.errors || []).join(" ")}`;
    const stats = audit.stats || {};
    return [
      "GPX contrôlé",
      Number.isFinite(stats.totalGeometryPoints)
        ? `${stats.totalGeometryPoints.toLocaleString("fr-FR")} points`
        : null,
      Number.isFinite(stats.trackCount)
        ? `${stats.trackCount} trace(s)`
        : null,
      audit.warnings?.length
        ? `${audit.warnings.length} avertissement(s)`
        : "aucune anomalie bloquante",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  globalThis.JMMJSGPXSafetyCore = Object.freeze({
    MAX_FILE_BYTES,
    MAX_TRACK_POINTS,
    auditGPXInput,
    auditParsedGPX,
    formatGPXAudit,
  });
})();
