(() => {
  "use strict";

  const LOOP_TOLERANCE_METERS = 30;

  function validCoord(coord) {
    return (
      Array.isArray(coord) &&
      Number.isFinite(Number(coord[0])) &&
      Number.isFinite(Number(coord[1])) &&
      Number(coord[0]) >= -180 &&
      Number(coord[0]) <= 180 &&
      Number(coord[1]) >= -90 &&
      Number(coord[1]) <= 90
    );
  }

  function sanitizeCoords(coords = []) {
    return (Array.isArray(coords) ? coords : [])
      .filter(validCoord)
      .map((coord) => [
        Number(coord[0]),
        Number(coord[1]),
        Number.isFinite(Number(coord[2])) ? Number(coord[2]) : null,
      ]);
  }

  function haversine(a, b) {
    if (!validCoord(a) || !validCoord(b)) return Infinity;
    const rad = Math.PI / 180;
    const lat1 = Number(a[1]) * rad;
    const lat2 = Number(b[1]) * rad;
    const dLat = (Number(b[1]) - Number(a[1])) * rad;
    const dLon = (Number(b[0]) - Number(a[0])) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function auditRouteExport(route = {}) {
    const original = Array.isArray(route.coords) ? route.coords : [];
    const coords = sanitizeCoords(original);
    const reasons = [];

    if (coords.length < 2) reasons.push("Géométrie insuffisante.");
    if (coords.length !== original.length)
      reasons.push("La géométrie contient des coordonnées invalides.");

    const closureMeters =
      coords.length >= 2 ? haversine(coords[0], coords.at(-1)) : Infinity;
    if (!Number.isFinite(closureMeters) || closureMeters > LOOP_TOLERANCE_METERS)
      reasons.push("La trace ne revient pas suffisamment près du départ.");

    return {
      exactEligible: reasons.length === 0,
      geometryValid: coords.length >= 2 && coords.length === original.length,
      closedLoop:
        Number.isFinite(closureMeters) &&
        closureMeters <= LOOP_TOLERANCE_METERS,
      closureMeters: Number.isFinite(closureMeters)
        ? Math.round(closureMeters)
        : null,
      coordinateCount: coords.length,
      reasons,
      label: reasons.length
        ? "Export exact indisponible"
        : "Géométrie de référence disponible",
    };
  }

  function pointXml(coord) {
    const elevation = Number.isFinite(Number(coord[2]))
      ? `<ele>${Number(coord[2])}</ele>`
      : "";
    return `<trkpt lat="${Number(coord[1])}" lon="${Number(coord[0])}">${elevation}</trkpt>`;
  }

  function routePointXml(coord) {
    const elevation = Number.isFinite(Number(coord[2]))
      ? `<ele>${Number(coord[2])}</ele>`
      : "";
    return `<rtept lat="${Number(coord[1])}" lon="${Number(coord[0])}">${elevation}</rtept>`;
  }

  function pauseWaypointXml(pause, index) {
    const lat = Number(pause?.lat);
    const lon = Number(pause?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    const name =
      pause?.label || `Pause ${index + 1}`;
    const description = [
      pause?.minute ? `Pause prévue à ${pause.minute} min` : null,
      Number.isFinite(Number(pause?.distanceMeters))
        ? `${Math.round(Number(pause.distanceMeters))} m du départ`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      `<wpt lat="${lat}" lon="${lon}">` +
      `<name>${xmlEscape(name)}</name>` +
      (description ? `<desc>${xmlEscape(description)}</desc>` : "") +
      `<type>Pause</type></wpt>`
    );
  }

  function alternativeRouteXml(item, index, typeLabel) {
    const coords = sanitizeCoords(item?.geometry);
    if (coords.length < 2) return "";
    const name = item?.label || `${typeLabel} ${index + 1}`;
    return (
      `<rte><name>${xmlEscape(name)}</name>` +
      `<desc>${xmlEscape(item?.evidence || typeLabel)}</desc>` +
      coords.map(routePointXml).join("") +
      `</rte>`
    );
  }

  function buildExactGpx(route = {}, options = {}) {
    const audit = auditRouteExport(route);
    if (!audit.exactEligible) {
      const error = new Error(audit.reasons.join(" "));
      error.code = "EXPORT_NOT_EXACT";
      error.audit = audit;
      throw error;
    }

    const coords = sanitizeCoords(route.coords);
    const pauses = Array.isArray(route.pauseMarkers)
      ? route.pauseMarkers
      : [];
    const shortcuts = Array.isArray(route.shortcuts) ? route.shortcuts : [];
    const fallbacks = Array.isArray(route.fallbacks) ? route.fallbacks : [];

    const warnings = Array.isArray(route.warnings) ? route.warnings : [];
    const description = [
      route.why,
      ...warnings,
      `Coordonnées exactes : ${coords.length}`,
      `Fermeture de boucle : ${audit.closureMeters} m`,
    ]
      .filter(Boolean)
      .join(" | ");

    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<gpx version="1.1" creator="Je marche comme je suis" ` +
      `xmlns="http://www.topografix.com/GPX/1/1" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xsi:schemaLocation="http://www.topografix.com/GPX/1/1 ` +
      `http://www.topografix.com/GPX/1/1/gpx.xsd">` +
      `<metadata><name>${xmlEscape(route.name || "Balade")}</name>` +
      `<desc>${xmlEscape(description)}</desc>` +
      `<extensions><exportCertification>` +
      `${xmlEscape(audit.label)}</exportCertification>` +
      `<coordinateCount>${audit.coordinateCount}</coordinateCount>` +
      `<closureMeters>${audit.closureMeters}</closureMeters>` +
      `</extensions></metadata>` +
      pauses.map(pauseWaypointXml).join("") +
      `<trk><name>${xmlEscape(route.name || "Balade")}</name>` +
      `<type>walking</type><trkseg>${coords.map(pointXml).join("")}</trkseg></trk>` +
      shortcuts
        .map((item, index) =>
          alternativeRouteXml(item, index, "Raccourci réel"),
        )
        .join("") +
      fallbacks
        .map((item, index) =>
          alternativeRouteXml(item, index, "Repli sur ses pas"),
        )
        .join("") +
      `</gpx>`
    );
  }

  function simplifiedWaypoints(route = {}, maximum = 8) {
    const coords = sanitizeCoords(route.coords);
    if (coords.length <= maximum) return coords;
    const result = [coords[0]];
    const interiorCount = maximum - 2;
    for (let index = 1; index <= interiorCount; index += 1) {
      const position = Math.round(
        (index * (coords.length - 1)) / (interiorCount + 1),
      );
      result.push(coords[position]);
    }
    result.push(coords.at(-1));
    return result;
  }

  function buildMapLinks(route = {}) {
    const points = simplifiedWaypoints(route, 8);
    if (points.length < 2) return { google: null, apple: null, simplified: true };
    const format = (coord) => `${coord[1]},${coord[0]}`;
    const origin = format(points[0]);
    const destination = format(points.at(-1));
    const intermediate = points.slice(1, -1).map(format);

    return {
      google:
        "https://www.google.com/maps/dir/?api=1&origin=" +
        encodeURIComponent(origin) +
        "&destination=" +
        encodeURIComponent(destination) +
        "&travelmode=walking" +
        (intermediate.length
          ? "&waypoints=" + encodeURIComponent(intermediate.join("|"))
          : ""),
      apple:
        "https://maps.apple.com/?saddr=" +
        encodeURIComponent(origin) +
        "&daddr=" +
        encodeURIComponent(
          [...intermediate, destination].join("+to:"),
        ) +
        "&dirflg=w",
      simplified: true,
      waypointCount: points.length,
    };
  }

  function buildJsonExport(route = {}) {
    return {
      schema: "jmmjs-route-export-v1",
      generatedAt: new Date().toISOString(),
      exportCertification: auditRouteExport(route),
      route,
    };
  }

  globalThis.JMMJSExportCore = Object.freeze({
    LOOP_TOLERANCE_METERS,
    sanitizeCoords,
    auditRouteExport,
    buildExactGpx,
    buildMapLinks,
    buildJsonExport,
    simplifiedWaypoints,
  });
})();
