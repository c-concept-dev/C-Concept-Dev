/* JMMJS_GEOAPIFY_PROVIDER_START */
(() => {
  "use strict";

  function poiType(categories = []) {
    if (categories.some((value) => value.includes("toilet")))
      return "Toilettes";
    if (categories.some((value) => value.includes("drinking_water")))
      return "Eau potable";
    if (categories.some((value) => value.includes("bench"))) return "Banc";
    if (categories.some((value) => value.includes("shelter"))) return "Abri";
    if (categories.some((value) => value.includes("cafe"))) return "Café";
    if (categories.some((value) => value.startsWith("heritage")))
      return "Patrimoine";
    return "Point utile";
  }

  function createGeoapifyProvider({ client, nearestRouteDistance }) {
    if (!client || typeof client.post !== "function") {
      throw new TypeError("L’adaptateur Geoapify exige un client de services.");
    }
    if (typeof nearestRouteDistance !== "function") {
      throw new TypeError("Le calcul de distance à la trace est obligatoire.");
    }

    return {
      id: "geoapify",
      kind: "enrichment",
      label: "Geoapify",
      capabilities: Object.freeze(["services", "amenities", "heritage"]),
      async enrich({ route, radiusMeters = 300, limit = 40 }) {
        const coordinates = route?.coords;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          throw new TypeError("Trace invalide pour l’enrichissement Geoapify.");
        }
        const lons = coordinates.map((point) => Number(point[0]));
        const lats = coordinates.map((point) => Number(point[1]));
        const meanLat =
          lats.reduce((sum, value) => sum + value, 0) / lats.length;
        const padLat = radiusMeters / 111320;
        const padLon =
          radiusMeters /
          (111320 * Math.max(0.2, Math.cos((meanLat * Math.PI) / 180)));
        const bbox = [
          Math.min(...lons) - padLon,
          Math.min(...lats) - padLat,
          Math.max(...lons) + padLon,
          Math.max(...lats) + padLat,
        ];
        const data = await client.post("geo", "/geoapify/places", { bbox });
        const unique = new Map();
        for (const feature of data.features || []) {
          const point = feature.geometry?.coordinates;
          const properties = feature.properties || {};
          if (!point) continue;
          const distance = Math.round(nearestRouteDistance(point, coordinates));
          if (distance > radiusMeters) continue;
          const type = poiType(properties.categories || []);
          const id = properties.place_id || point.slice(0, 2).join(",");
          if (!unique.has(id)) {
            unique.set(id, {
              id,
              type,
              name: properties.name || properties.address_line1 || type,
              distance,
              lon: point[0],
              lat: point[1],
              accessibility: "unknown",
            });
          }
        }
        return [...unique.values()]
          .sort((left, right) => left.distance - right.distance)
          .slice(0, limit);
      },
    };
  }

  globalThis.JMMJSGeoapifyProvider = Object.freeze({
    createGeoapifyProvider,
    poiType,
  });
})();
/* JMMJS_GEOAPIFY_PROVIDER_END */
