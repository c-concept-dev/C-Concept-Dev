(function (global) {
  "use strict";

  const MAX_DISTANCE_METERS = 300;
  const ALLOWED_TYPES = Object.freeze({
    closure: "Fermeture temporaire",
    works: "Travaux",
    restriction: "Restriction d’accès",
    official_route: "Itinéraire officiel",
    warning: "Information officielle",
  });

  function validCoordinates(coords) {
    return Array.isArray(coords) && coords.length >= 2 &&
      Number.isFinite(Number(coords[0])) && Number.isFinite(Number(coords[1])) &&
      Number(coords[0]) >= -180 && Number(coords[0]) <= 180 &&
      Number(coords[1]) >= -90 && Number(coords[1]) <= 90;
  }

  function normalizeDate(value) {
    if (value == null || value === "") return null;
    const timestamp = Number.isFinite(Number(value)) ? Number(value) : Date.parse(String(value));
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function normalizeOfficialItem(item, { now = Date.now(), nearestRouteDistance, routeCoords } = {}) {
    const type = String(item?.type || item?.category || "");
    if (!ALLOWED_TYPES[type]) return null;
    const coordinates = item?.coordinates || item?.geometry?.coordinates;
    if (!validCoordinates(coordinates)) return null;
    const publishedAt = normalizeDate(item.publishedAt ?? item.published_at ?? item.updatedAt);
    const startsAt = normalizeDate(item.startsAt ?? item.starts_at);
    const endsAt = normalizeDate(item.endsAt ?? item.ends_at ?? item.expiresAt);
    if (Number.isFinite(endsAt) && endsAt < now) return null;
    const distance = typeof nearestRouteDistance === "function"
      ? Math.round(Number(nearestRouteDistance(coordinates, routeCoords)))
      : null;
    if (Number.isFinite(distance) && distance > MAX_DISTANCE_METERS) return null;
    const sourceName = String(item.sourceName || item.source || item.authority || "").trim();
    if (!sourceName) return null;
    return {
      id: String(item.id || ""),
      type,
      label: String(item.label || item.title || ALLOWED_TYPES[type]).trim().slice(0, 160),
      sourceName,
      sourceUrl: String(item.sourceUrl || item.url || "").trim(),
      lon: Number(coordinates[0]),
      lat: Number(coordinates[1]),
      distance: Number.isFinite(distance) ? distance : null,
      publishedAt,
      startsAt,
      endsAt,
      official: true,
      status: type === "official_route" ? "documented" : "official_notice",
    };
  }

  function normalizeOfficialItems(items, options = {}) {
    return (Array.isArray(items) ? items : [])
      .map((item) => normalizeOfficialItem(item, options))
      .filter(Boolean)
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  }

  function displayStatus(item, now = Date.now()) {
    const active = !Number.isFinite(item.startsAt) || item.startsAt <= now;
    const remaining = Number.isFinite(item.endsAt) ? Math.ceil((item.endsAt - now) / 86400000) : null;
    return {
      activity: active ? "Information actuellement applicable" : "Information à venir",
      validity: Number.isFinite(remaining)
        ? `Fin indiquée dans ${Math.max(0, remaining)} jour${remaining > 1 ? "s" : ""}`
        : "Date de fin non documentée",
      authority: `Source officielle : ${item.sourceName}`,
    };
  }

  function absenceText() {
    return "Aucune fermeture publiée trouvée dans les sources interrogées. Cela ne garantit pas que le chemin soit ouvert.";
  }

  function unavailableText() {
    return "Réseaux officiels et fermetures indisponibles. La promenade reste consultable ; vérifiez les informations locales avant de partir.";
  }

  global.JMMJSOfficialClosuresCore = {
    MAX_DISTANCE_METERS,
    ALLOWED_TYPES,
    normalizeOfficialItem,
    normalizeOfficialItems,
    displayStatus,
    absenceText,
    unavailableText,
  };
})(globalThis);
