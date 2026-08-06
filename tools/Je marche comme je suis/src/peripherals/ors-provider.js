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
            data?.error?.message || "Aucune boucle OpenRouteService renvoyée.",
          );
          error.code = data?.error?.code || "ors-no-route";
          error.reason = data?.error?.reason || null;
          error.details = data?.error?.details || [];
          error.outcome = data?.outcome || "no-result";
          error.requestCount = Number(data?.requestCount) || 0;
          error.preferencesApplied = data?.preferencesApplied || [];
          throw error;
        }
        routes.outcome = data?.outcome || "success";
        routes.requestCount = Number(data?.requestCount) || 0;
        routes.preferencesRelaxed = data?.preferencesRelaxed || [];
        routes.notice = data?.notice || "";
        return routes;
      },
    };
  }

  globalThis.JMMJSORSProvider = Object.freeze({ createORSProvider });
})();
/* JMMJS_ORS_PROVIDER_END */
