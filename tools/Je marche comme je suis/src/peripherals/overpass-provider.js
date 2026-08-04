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

  function createOverpassProvider({ client }) {
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
    });
  }

  globalThis.JMMJSOverpassProvider = Object.freeze({ createOverpassProvider, simplifyCoordinates });
})();
