(function (global) {
  "use strict";
  const MAX_DISTANCE_METERS = 120;
  function normalizePhoto(item, source, nearestRouteDistance, routeCoords) {
    const coords = item?.coordinates || item?.geometry?.coordinates || null;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const distance = Math.round(Number(nearestRouteDistance(coords, routeCoords)));
    if (!Number.isFinite(distance) || distance > MAX_DISTANCE_METERS) return null;
    const capturedAt = Number(item.capturedAt ?? item.captured_at ?? item.dateTimestamp);
    return {
      id: String(item.id || item.panoId || item.pano_id || ""),
      source,
      lon: Number(coords[0]), lat: Number(coords[1]), distance,
      capturedAt: Number.isFinite(capturedAt) ? capturedAt : null,
      date: item.date || null,
      thumb: item.thumb || item.thumb_1024_url || null,
      heading: Number.isFinite(Number(item.heading)) ? Number(item.heading) : null,
      externalUrl: item.externalUrl || null,
      sequence: String(item.sequence?.id || item.sequence || ""),
    };
  }
  function chooseReconPhotos({ streetView = [], mapillary = [], nearestRouteDistance, routeCoords, limit = 12 } = {}) {
    const sv = streetView.map((x) => normalizePhoto(x, "Google Street View", nearestRouteDistance, routeCoords)).filter(Boolean);
    const mp = mapillary.map((x) => normalizePhoto(x, "Mapillary", nearestRouteDistance, routeCoords)).filter(Boolean);
    const all = [...sv, ...mp].sort((a,b) => a.distance-b.distance || (b.capturedAt||0)-(a.capturedAt||0));
    const selected = [];
    for (const p of all) {
      if (!p.id || selected.some((x) => x.source===p.source && x.id===p.id)) continue;
      if (selected.some((x) => Math.hypot(x.lon-p.lon, x.lat-p.lat) < 0.0005)) continue;
      selected.push(p);
      if (selected.length >= limit) break;
    }
    return selected;
  }
  function warningText() { return "Cette image aide au repérage. Elle ne garantit pas l’état actuel du passage."; }
  global.JMMJSPhotoReconCore = { MAX_DISTANCE_METERS, normalizePhoto, chooseReconPhotos, warningText };
})(globalThis);
