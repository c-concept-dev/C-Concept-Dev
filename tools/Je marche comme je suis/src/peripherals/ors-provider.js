/* JMMJS_ORS_PROVIDER_START */
(() => {
  "use strict";

  function createORSProvider({ client }) {
    if (!client || typeof client.post !== "function") {
      throw new TypeError("L’adaptateur ORS exige un client de services.");
    }

    return {
      id: "ors",
      kind: "routing",
      label: "OpenRouteService",
      capabilities: Object.freeze([
        "round_trip",
        "wheelchair_profile",
        "surface_extras",
        "steepness_extras",
      ]),
      async createRoundTrips({
        coordinate,
        targetMeters,
        compiled,
        count = 6,
      }) {
        if (
          !Array.isArray(coordinate) ||
          coordinate.length !== 2 ||
          !coordinate.every(Number.isFinite)
        ) {
          throw new TypeError("Coordonnée ORS invalide.");
        }
        if (!Number.isFinite(targetMeters) || targetMeters < 500) {
          throw new RangeError("La boucle ORS doit viser au moins 500 m.");
        }
        const routing = compiled?.routing;
        if (!routing?.profile) {
          throw new TypeError("Contraintes de routage non compilées.");
        }
        const data = await client.post(
          "ors",
          "/ors/round-trips",
          {
            coordinate,
            targetMeters,
            profile: routing.profile,
            avoidFeatures: routing.avoidFeatures || [],
            weightings: routing.weightings || {},
            restrictions: routing.restrictions || {},
            count: Math.max(1, Math.min(3, Math.round(count))),
          },
          count,
        );
        const routes = Array.isArray(data.routes) ? data.routes : [];
        if (!routes.length) {
          throw new Error("Aucune boucle OpenRouteService renvoyée.");
        }
        return routes;
      },
    };
  }

  globalThis.JMMJSORSProvider = Object.freeze({ createORSProvider });
})();
/* JMMJS_ORS_PROVIDER_END */
