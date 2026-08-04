/* JMMJS_RECOVERY_ROUTE_PROVIDER_START */
(() => {
  "use strict";

  function createRecoveryRouteProvider({ client }) {
    if (!client || typeof client.post !== "function") {
      throw new TypeError("L’adaptateur de récupération exige un client de services.");
    }
    return {
      id: "recovery-route",
      kind: "recovery",
      label: "Liaison de récupération ORS",
      capabilities: Object.freeze(["return_to_trace", "return_to_start"]),
      async createLink(request) {
        const data = await client.post("ors", "/ors/recovery-route", request, 1);
        return globalThis.JMMJSRecoveryRouteCore.normalizeRecoveryRoute(data, request);
      },
    };
  }

  globalThis.JMMJSRecoveryRouteProvider = Object.freeze({ createRecoveryRouteProvider });
})();
/* JMMJS_RECOVERY_ROUTE_PROVIDER_END */
