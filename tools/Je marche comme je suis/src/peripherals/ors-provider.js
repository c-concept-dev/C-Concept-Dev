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
          const error = new Error(
            `OpenRouteService : ${data.outcome || "aucune boucle renvoyée"}.`,
          );
          error.code = data.outcome || "ors-no-route";
          if (typeof data.retryable === "boolean") error.retryable = data.retryable;
          error.imperativesPreserved = data.imperativesPreserved;
          error.preferencesApplied = data.preferencesApplied;
          error.requestCount = data.requestCount;
          throw error;
        }
        return routes;
      },
      async findFallbackStarts({ origin, targetMeters, radiusMeters, compiled }) {
        if (
          !origin ||
          !Number.isFinite(origin.lat) ||
          !Number.isFinite(origin.lon)
        ) {
          throw new TypeError("Origine invalide pour la recherche de départs alternatifs.");
        }
        if (!Number.isFinite(targetMeters) || targetMeters < 500) {
          throw new RangeError("La boucle ORS doit viser au moins 500 m.");
        }
        const routing = compiled?.routing;
        const data = await client.post("ors", "/fallback-starts", {
          origin: { lat: origin.lat, lon: origin.lon },
          targetMeters,
          radiusMeters,
          profile: routing?.profile,
          avoidFeatures: routing?.avoidFeatures || [],
          weightings: routing?.weightings || {},
          restrictions: routing?.restrictions || {},
        });
        return {
          outcome: data.outcome,
          starts: Array.isArray(data.starts) ? data.starts : [],
          candidatesConsidered: data.candidatesConsidered,
          candidatesTested: data.candidatesTested,
        };
      },
    };
  }

  globalThis.JMMJSORSProvider = Object.freeze({ createORSProvider });
})();
/* JMMJS_ORS_PROVIDER_END */
