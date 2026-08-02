(() => {
  "use strict";

  const MAX_GPX_BYTES = 10_000_000;
  const MAX_POINTS = 100_000;

  function decodeXml(value = "") {
    return String(value)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function textOf(xml, localName) {
    const match = String(xml).match(
      new RegExp(`<(?:(?:[\\w.-]+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${localName}>`, "i"),
    );
    return match ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : "";
  }

  function attributeOf(tag, name) {
    const match = String(tag).match(
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
    );
    return match ? match[1] ?? match[2] : null;
  }

  function parsePoint(tag, body, index) {
    const lon = Number(attributeOf(tag, "lon"));
    const lat = Number(attributeOf(tag, "lat"));
    if (!Number.isFinite(lon) || !Number.isFinite(lat))
      throw new Error(`Coordonnées GPX absentes au point ${index + 1}.`);
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90)
      throw new Error(`Coordonnées GPX hors limites au point ${index + 1}.`);
    const elevationText = textOf(body, "ele");
    const elevation = elevationText === "" ? null : Number(elevationText);
    if (elevationText !== "" && !Number.isFinite(elevation))
      throw new Error(`Altitude GPX invalide au point ${index + 1}.`);
    const timeText = textOf(body, "time");
    const timestamp = timeText ? Date.parse(timeText) : null;
    return [lon, lat, elevation, Number.isFinite(timestamp) ? timestamp : null];
  }

  function collectPoints(xml, pointName) {
    const points = [];
    const pattern = new RegExp(
      `<(?:(?:[\\w.-]+):)?${pointName}\\b([^>]*)>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${pointName}>|<(?:(?:[\\w.-]+):)?${pointName}\\b([^>]*)\\/>`,
      "gi",
    );
    let match;
    while ((match = pattern.exec(xml))) {
      if (points.length >= MAX_POINTS)
        throw new Error(`GPX trop volumineux : maximum ${MAX_POINTS} points.`);
      points.push(
        parsePoint(
          `<${pointName} ${match[1] ?? match[3] ?? ""}>`,
          match[2] ?? "",
          points.length,
        ),
      );
    }
    return points;
  }

  function collectBlocks(xml, localName) {
    const blocks = [];
    const pattern = new RegExp(
      `<(?:(?:[\\w.-]+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${localName}>`,
      "gi",
    );
    let match;
    while ((match = pattern.exec(xml))) blocks.push(match[1]);
    return blocks;
  }

  function parseGPXText(text, fallbackName = "Trace GPX") {
    const xml = String(text || "");
    if (!xml.trim()) throw new Error("GPX vide.");
    if (new TextEncoder().encode(xml).length > MAX_GPX_BYTES)
      throw new Error("GPX trop volumineux.");
    if (!/<(?:(?:[\w.-]+):)?gpx\b/i.test(xml))
      throw new Error("Document GPX invalide : élément <gpx> absent.");

    const routes = [];
    const trackBlocks = collectBlocks(xml, "trk");
    trackBlocks.forEach((trackXml, trackIndex) => {
      const baseName = textOf(trackXml, "name") || `${fallbackName} — trace ${trackIndex + 1}`;
      const segments = collectBlocks(trackXml, "trkseg");
      const effectiveSegments = segments.length ? segments : [trackXml];
      effectiveSegments.forEach((segmentXml, segmentIndex) => {
        const points = collectPoints(segmentXml, "trkpt");
        if (points.length >= 2)
          routes.push({
            name:
              effectiveSegments.length > 1
                ? `${baseName} — segment ${segmentIndex + 1}`
                : baseName,
            kind: "track",
            sourceIndex: trackIndex,
            segmentIndex,
            points,
          });
      });
    });

    const routeBlocks = collectBlocks(xml, "rte");
    routeBlocks.forEach((routeXml, routeIndex) => {
      const points = collectPoints(routeXml, "rtept");
      if (points.length >= 2)
        routes.push({
          name: textOf(routeXml, "name") || `${fallbackName} — route ${routeIndex + 1}`,
          kind: "route",
          sourceIndex: routeIndex,
          segmentIndex: 0,
          points,
        });
    });

    if (!routes.length) {
      const points = [
        ...collectPoints(xml, "trkpt"),
        ...collectPoints(xml, "rtept"),
      ];
      if (points.length >= 2)
        routes.push({
          name: fallbackName,
          kind: "unknown",
          sourceIndex: 0,
          segmentIndex: 0,
          points,
        });
    }
    if (!routes.length) throw new Error("Aucune trace GPX exploitable contenant au moins deux points.");
    return routes;
  }

  function haversineMeters(a, b) {
    const p1 = (a[1] * Math.PI) / 180;
    const p2 = (b[1] * Math.PI) / 180;
    const dp = ((b[1] - a[1]) * Math.PI) / 180;
    const dl = ((b[0] - a[0]) * Math.PI) / 180;
    const h =
      Math.sin(dp / 2) ** 2 +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function summarizePoints(points) {
    let distanceMeters = 0;
    let ascentMeters = 0;
    let descentMeters = 0;
    let knownElevationMeters = 0;
    let timestampPairs = 0;
    let recordedDurationMs = 0;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const meters = haversineMeters(previous, current);
      distanceMeters += meters;
      if (Number.isFinite(previous[2]) && Number.isFinite(current[2])) {
        knownElevationMeters += meters;
        const delta = current[2] - previous[2];
        if (delta > 0) ascentMeters += delta;
        else descentMeters -= delta;
      }
      if (Number.isFinite(previous[3]) && Number.isFinite(current[3]) && current[3] >= previous[3]) {
        timestampPairs += 1;
        recordedDurationMs += current[3] - previous[3];
      }
    }
    const elevationCoverage = distanceMeters
      ? knownElevationMeters / distanceMeters
      : 0;
    return {
      distanceMeters,
      ascentMeters: elevationCoverage >= 0.999 ? ascentMeters : null,
      descentMeters: elevationCoverage >= 0.999 ? descentMeters : null,
      elevationCoverage,
      recordedDurationMinutes:
        timestampPairs === points.length - 1 && recordedDurationMs > 0
          ? recordedDurationMs / 60000
          : null,
      recordedTimeCoverage:
        points.length > 1 ? timestampPairs / (points.length - 1) : 0,
    };
  }

  globalThis.JMMJSGPXCore = Object.freeze({
    MAX_GPX_BYTES,
    MAX_POINTS,
    parseGPXText,
    summarizePoints,
    haversineMeters,
  });
})();
