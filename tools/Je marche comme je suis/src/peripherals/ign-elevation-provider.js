(() => {
  "use strict";

  function sampleCoordinates(coordinates = [], maxPoints = 120) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    if (coordinates.length <= maxPoints) return coordinates.map((point) => [Number(point[0]), Number(point[1])]);
    const last = coordinates.length - 1;
    return Array.from({ length: maxPoints }, (_, index) => {
      const point = coordinates[Math.round((index * last) / (maxPoints - 1))];
      return [Number(point[0]), Number(point[1])];
    });
  }

  function createIgnElevationProvider({ client }) {
    if (!client || typeof client.post !== "function") {
      throw new TypeError("L’adaptateur IGN exige un client de services.");
    }
    return Object.freeze({
      id: "ign-elevation",
      kind: "elevation-control",
      label: "IGN Géoplateforme",
      capabilities: Object.freeze(["elevation-profile", "ascent-control"]),
      async inspect({ route, maxPoints = 120 }) {
        const coordinates = sampleCoordinates(route?.coords, maxPoints);
        if (coordinates.length < 2) throw new TypeError("Trace invalide pour le contrôle IGN.");
        return client.post("ign", "/ign/elevation", {
          route: coordinates,
          routeLengthMeters: Number(route?.distance) || 0,
        });
      },
    });
  }

  globalThis.JMMJSIgnElevationProvider = Object.freeze({ createIgnElevationProvider, sampleCoordinates });
})();
