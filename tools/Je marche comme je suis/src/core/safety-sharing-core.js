(() => {
  "use strict";
  const RETURN_KEY = "jmmjs.safety-return.v1";
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  function validPoint(point) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const lon = finite(point[0]), lat = finite(point[1]);
    return lon !== null && lat !== null && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90 ? [lon, lat] : null;
  }
  function formatPoint(point) {
    const valid = validPoint(point);
    return valid ? `${valid[1].toFixed(6)},${valid[0].toFixed(6)}` : null;
  }
  function formatTime(value, locale = "fr-FR") {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date) : null;
  }
  function buildSafetySharePackage(route = {}, options = {}) {
    const start = validPoint(Array.isArray(route.coords) ? route.coords[0] : route.start);
    const startCoordinates = formatPoint(start);
    const name = String(route.name || "Promenade");
    const distanceKm = finite(route.distance ?? route.distanceKm);
    const durationMinutes = finite(route.total ?? route.walking ?? options.durationMinutes);
    const returnAt = route?.daylightReturn?.returnAt || options.returnAt || null;
    const returnTime = formatTime(returnAt, options.locale || "fr-FR");
    const details = [distanceKm !== null ? `${distanceKm.toFixed(1)} km` : null, durationMinutes !== null ? `environ ${Math.round(durationMinutes)} min` : null].filter(Boolean).join(" · ");
    const routeText = [`Je pars pour « ${name} »${details ? ` (${details})` : ""}.`, startCoordinates ? `Départ : ${startCoordinates}.` : null].filter(Boolean).join(" ");
    const returnText = returnTime ? `Retour estimé vers ${returnTime}.` : "Heure de retour non déterminée.";
    return Object.freeze({ name, start, startCoordinates, distanceKm, durationMinutes, returnAt, returnTime, routeText, returnText, preparedMessage: `${routeText} ${returnText} Je vous confirmerai mon retour. Ceci n’est pas un suivi en direct.`.trim(), emergencyNumber: "112", warning: "Partage facultatif. Aucune position n’est suivie en direct et aucun secours n’est contacté automatiquement." });
  }
  function markReturned(storage, value = {}) {
    const record = { returnedAt: value.returnedAt || new Date().toISOString(), routeId: value.routeId ? String(value.routeId) : null };
    storage?.setItem?.(RETURN_KEY, JSON.stringify(record));
    return record;
  }
  function readReturned(storage) { try { const raw = storage?.getItem?.(RETURN_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
  function clearReturned(storage) { storage?.removeItem?.(RETURN_KEY); }
  globalThis.JMMJSSafetySharingCore = Object.freeze({ RETURN_KEY, buildSafetySharePackage, formatPoint, markReturned, readReturned, clearReturned });
})();
