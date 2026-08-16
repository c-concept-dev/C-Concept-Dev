(() => {
  "use strict";

  function simplifyCoordinates(coordinates = [], maxPoints = 80) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    if (coordinates.length <= maxPoints) return coordinates.map((point) => [Number(point[0]), Number(point[1])]);
    const last = coordinates.length - 1;
    const output = [];
    for (let index = 0; index < maxPoints; index += 1) {
      const point = coordinates[Math.round((index * last) / (maxPoints - 1))];
      output.push([Number(point[0]), Number(point[1])]);
    }
    return output;
  }

  const WISH_POI_TYPES = Object.freeze([
    "Verger ou vignoble",
    "Arbre remarquable",
    "Cascade",
    "Grotte",
    "Œuvre d'art",
    "Petit patrimoine",
    "Glacier",
  ]);

  function createOverpassProvider({ client, nearestRouteDistance }) {
    if (!client || typeof client.post !== "function") {
      throw new TypeError("L’adaptateur Overpass exige un client de services.");
    }
    return Object.freeze({
      id: "overpass",
      kind: "terrain-proof",
      label: "Overpass / OpenStreetMap",
      capabilities: Object.freeze(["surface", "smoothness", "width", "steps", "foot-access"]),
      async inspect({ route, bufferMeters = 25, maxPoints = 80 }) {
        const coordinates = route?.coords;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          throw new TypeError("Trace invalide pour la preuve terrain Overpass.");
        }
        const simplifiedRoute = simplifyCoordinates(coordinates, maxPoints);
        return client.post("overpass", "/overpass/terrain", {
          route: simplifiedRoute,
          bufferMeters,
          routeLengthMeters: Number(route.distance) || 0,
        });
      },
      async inspectMany({ routes, bufferMeters = 25, maxPoints = 80 }) {
        const list = Array.isArray(routes) ? routes : [];
        const items = list.map((route) => {
          const coordinates = route?.coords;
          if (!Array.isArray(coordinates) || coordinates.length < 2) {
            throw new TypeError("Trace invalide pour la preuve terrain Overpass.");
          }
          return {
            route: simplifyCoordinates(coordinates, maxPoints),
            bufferMeters,
            routeLengthMeters: Number(route.distance) || 0,
          };
        });
        if (!items.length) return [];
        const data = await client.post("overpass", "/overpass/terrain-batch", {
          routes: items,
        });
        return Array.isArray(data?.results) ? data.results : [];
      },
      // Fiche D100C "Banc" : bancs et tables de pique-nique documentés,
      // avec leurs attributs OSM (dossier, accoudoirs, places, couverture)
      // lorsqu'ils sont renseignés. Renvoyé au même format que les autres
      // fournisseurs d'enrichissement pour rejoindre mergeTourismPois().
      async enrichBenches({ route, radiusMeters = 60, limit = 50 }) {
        const coordinates = route?.coords;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          throw new TypeError("Trace invalide pour l’enrichissement Overpass.");
        }
        const simplifiedRoute = simplifyCoordinates(coordinates, 80);
        const data = await client.post("overpass", "/overpass/benches", {
          route: simplifiedRoute,
          bufferMeters: radiusMeters,
        });
        if (data?.status !== "ok") return [];
        const items = [
          ...(Array.isArray(data.benches) ? data.benches : []).map((b) => ({
            ...b,
            name: "Banc",
          })),
          ...(Array.isArray(data.picnicTables) ? data.picnicTables : []).map(
            (t) => ({ ...t, name: "Table de pique-nique" }),
          ),
        ];
        return items
          .map((item, index) => {
            const point = [item.lon, item.lat];
            const distance =
              typeof nearestRouteDistance === "function"
                ? Math.round(nearestRouteDistance(point, coordinates))
                : radiusMeters;
            return {
              id: `osm-bench:${index}`,
              type: "Banc",
              name: item.name,
              distance,
              lon: item.lon,
              lat: item.lat,
              accessibility: item.backrest ? "documented" : "unknown",
            };
          })
          .sort((left, right) => left.distance - right.distance)
          .slice(0, limit);
      },
      // Fiche D100C1 : familles d'envies vérifiables ajoutées à l'ontologie
      // (Verger/vignoble, Arbre remarquable, Cascade, Grotte, Œuvre d'art,
      // Petit patrimoine, Glacier). Classement seulement pour l'instant —
      // ces envies ne sont pas dans ROUTING_POI_LABELS, même convention que
      // les envies naturelles ajoutées en D099A.
      async enrichWishPoi({ route, radiusMeters = 300, limit = 50 }) {
        const coordinates = route?.coords;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          throw new TypeError("Trace invalide pour l’enrichissement Overpass.");
        }
        const simplifiedRoute = simplifyCoordinates(coordinates, 80);
        const data = await client.post("overpass", "/overpass/wish-poi", {
          route: simplifiedRoute,
          bufferMeters: radiusMeters,
        });
        if (data?.status !== "ok") return [];
        const pois = Array.isArray(data.pois) ? data.pois : [];
        return pois
          .filter((poi) => WISH_POI_TYPES.includes(poi?.type))
          .map((poi) => {
            const point = [poi.lon, poi.lat];
            const distance =
              typeof nearestRouteDistance === "function"
                ? Math.round(nearestRouteDistance(point, coordinates))
                : radiusMeters;
            return {
              id: poi.id,
              type: poi.type,
              name: poi.name || poi.type,
              distance,
              lon: poi.lon,
              lat: poi.lat,
              accessibility: "unknown",
            };
          })
          .sort((left, right) => left.distance - right.distance)
          .slice(0, limit);
      },
    });
  }

  globalThis.JMMJSOverpassProvider = Object.freeze({ createOverpassProvider, simplifyCoordinates });
})();
