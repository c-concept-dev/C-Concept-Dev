(function (global) {
  "use strict";
  const CATEGORIES = Object.freeze({
    mud: { label: "Boue", ttlDays: 5 },
    flood: { label: "Inondation", ttlDays: 2 },
    fallen_tree: { label: "Arbre tombé", ttlDays: 21 },
    closed_gate: { label: "Portail fermé", ttlDays: 10 },
    forbidden_access: { label: "Accès interdit", ttlDays: 7 },
    works: { label: "Travaux", ttlDays: 14 },
    high_vegetation: { label: "Végétation haute", ttlDays: 10 },
    impassable: { label: "Chemin impraticable", ttlDays: 7 },
    unspecified_danger: { label: "Danger non précisé", ttlDays: 3 },
  });
  const MAX_DISTANCE_METERS = 300;
  const MAX_NOTE_LENGTH = 160;
  function validCoordinates(coords) {
    return Array.isArray(coords) && coords.length >= 2 && Number.isFinite(Number(coords[0])) && Number.isFinite(Number(coords[1])) && Number(coords[0]) >= -180 && Number(coords[0]) <= 180 && Number(coords[1]) >= -90 && Number(coords[1]) <= 90;
  }
  function expiryFor(category, reportedAt) {
    const rule = CATEGORIES[category];
    if (!rule) throw new Error("Catégorie de signalement inconnue.");
    return Number(reportedAt) + rule.ttlDays * 86400000;
  }
  function normalizeReport(item, { now = Date.now(), nearestRouteDistance, routeCoords } = {}) {
    const category = String(item?.category || "");
    if (!CATEGORIES[category]) return null;
    const coordinates = item?.coordinates || item?.geometry?.coordinates;
    if (!validCoordinates(coordinates)) return null;
    const reportedAt = Number(item.reportedAt ?? item.reported_at ?? item.createdAt);
    if (!Number.isFinite(reportedAt)) return null;
    const maximumExpiry = expiryFor(category, reportedAt);
    const suppliedExpiry = Number(item.expiresAt ?? item.expires_at);
    const expiresAt = Number.isFinite(suppliedExpiry) ? Math.min(suppliedExpiry, maximumExpiry) : maximumExpiry;
    if (expiresAt <= now) return null;
    const distance = typeof nearestRouteDistance === "function" ? Math.round(Number(nearestRouteDistance(coordinates, routeCoords))) : null;
    if (Number.isFinite(distance) && distance > MAX_DISTANCE_METERS) return null;
    return {
      id: String(item.id || ""), category, label: CATEGORIES[category].label,
      lon: Number(coordinates[0]), lat: Number(coordinates[1]),
      reportedAt, expiresAt, distance: Number.isFinite(distance) ? distance : null,
      confirmations: Math.max(0, Math.floor(Number(item.confirmations) || 0)),
      note: String(item.note || "").slice(0, MAX_NOTE_LENGTH),
      authorityVerified: item.authorityVerified === true,
    };
  }
  function normalizeReports(items, options = {}) {
    return (Array.isArray(items) ? items : []).map((item) => normalizeReport(item, options)).filter(Boolean).sort((a,b) => (a.distance ?? Infinity)-(b.distance ?? Infinity) || b.reportedAt-a.reportedAt);
  }
  function buildSubmission({ category, coordinates, note = "", now = Date.now() } = {}) {
    if (!CATEGORIES[category]) throw new Error("Choisissez une catégorie de signalement.");
    if (!validCoordinates(coordinates)) throw new Error("Position du signalement invalide.");
    return { category, coordinates: [Number(coordinates[0]), Number(coordinates[1])], reportedAt: Number(now), expiresAt: expiryFor(category, now), note: String(note).trim().slice(0, MAX_NOTE_LENGTH) };
  }
  function displayStatus(report, now = Date.now()) {
    const ageHours = Math.max(0, Math.floor((now - report.reportedAt) / 3600000));
    const age = ageHours < 24 ? `Signalé il y a ${Math.max(1, ageHours)} h` : `Signalé il y a ${Math.floor(ageHours/24)} jour${Math.floor(ageHours/24)>1?"s":""}`;
    const confirmation = report.confirmations ? `Confirmé par ${report.confirmations} personne${report.confirmations>1?"s":""}` : "Aucune confirmation utilisateur";
    const authority = report.authorityVerified ? "Vérifié par une autorité identifiée" : "Non vérifié par une autorité";
    return { age, confirmation, authority };
  }
  function warningText() { return "Signalement utilisateur daté. Vérifiez la situation sur place ; il ne constitue pas une confirmation officielle."; }
  global.JMMJSUserReportsCore = { CATEGORIES, MAX_DISTANCE_METERS, MAX_NOTE_LENGTH, expiryFor, normalizeReport, normalizeReports, buildSubmission, displayStatus, warningText };
})(globalThis);
