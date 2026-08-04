(() => {
  "use strict";
  const STORAGE_KEY = "jmmjs.offline-preparation.v1";

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeCoords(coords) {
    if (!Array.isArray(coords)) return [];
    return coords
      .map((point) => [finite(point?.[0]), finite(point?.[1])])
      .filter(([lon, lat]) => lon !== null && lat !== null && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
  }

  function prepareOfflineSnapshot(route, { savedAt = new Date().toISOString() } = {}) {
    const coords = normalizeCoords(route?.coords);
    if (coords.length < 2) throw new Error("Trace insuffisante pour la préparation hors connexion.");
    const weatherRetrievedAt = route?.weather?.retrievedAt || route?.weather?.forecast?.retrievedAt || null;
    return {
      version: 1,
      savedAt,
      route: {
        id: String(route?.id || route?.name || "promenade"),
        name: String(route?.name || "Promenade préparée"),
        coords,
        start: coords[0],
        distanceKm: finite(route?.distance ?? route?.distanceKm),
        totalMinutes: finite(route?.total),
        walkingMinutes: finite(route?.walking),
        steps: Array.isArray(route?.steps) ? route.steps.map((step) => ({
          title: String(step?.title || "Étape"),
          instruction: String(step?.instruction || ""),
          durationMinutes: finite(step?.durationMinutes),
          warning: step?.warning ? String(step.warning) : null,
        })) : [],
        shortcuts: Array.isArray(route?.shortcuts) ? route.shortcuts : [],
        fallbacks: Array.isArray(route?.fallbacks) ? route.fallbacks : [],
        warnings: Array.isArray(route?.warnings) ? route.warnings.map(String) : [],
        essentialPois: Array.isArray(route?.pois)
          ? route.pois.filter((poi) => poi?.essential || ["toilettes", "eau", "abri", "pharmacie"].includes(String(poi?.type || "").toLowerCase())).map((poi) => ({
              name: String(poi?.name || "Point utile"),
              type: String(poi?.type || ""),
              coordinates: normalizeCoords([poi?.coordinates || poi?.coords])[0] || null,
            }))
          : [],
      },
      availability: {
        application: "available",
        trace: "available",
        instructions: "available",
        departure: "available",
        gpx: "available",
        weather: weatherRetrievedAt ? "dated" : "unavailable",
        weatherRetrievedAt,
        pois: Array.isArray(route?.pois) && route.pois.length ? "dated" : "unavailable",
        photos: Array.isArray(route?.photos) && route.photos.length ? "dated" : "unavailable",
        newRouteCalculation: "not-guaranteed",
        weatherRefresh: "not-guaranteed",
        newPhotos: "not-guaranteed",
        recentClosures: "not-guaranteed",
        fullMapBackground: "not-guaranteed",
      },
    };
  }

  function saveOfflineSnapshot(storage, snapshot) {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  }

  function loadOfflineSnapshot(storage) {
    try {
      const raw = storage?.getItem?.(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearOfflineSnapshot(storage) {
    storage?.removeItem?.(STORAGE_KEY);
  }

  globalThis.JMMJSOfflinePreparationCore = {
    STORAGE_KEY,
    prepareOfflineSnapshot,
    saveOfflineSnapshot,
    loadOfflineSnapshot,
    clearOfflineSnapshot,
  };
})();
