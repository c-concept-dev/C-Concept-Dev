/* JMMJS_PERIPHERAL_REGISTRY_START */
(() => {
  "use strict";

  const CONTRACTS = Object.freeze({
    routing: Object.freeze(["createRoundTrips"]),
    enrichment: Object.freeze(["enrich"]),
    importer: Object.freeze(["importRoute"]),
    weather: Object.freeze(["forecast"]),
    "terrain-proof": Object.freeze(["inspect"]),
  });

  function createPeripheralRegistry() {
    const providers = new Map();

    function register(provider) {
      if (!provider || typeof provider !== "object") {
        throw new TypeError("Un périphérique doit être un objet.");
      }
      if (!provider.id || !provider.kind) {
        throw new TypeError("Un périphérique doit déclarer id et kind.");
      }
      const requiredMethods = CONTRACTS[provider.kind];
      if (!requiredMethods) {
        throw new TypeError(`Type de périphérique inconnu : ${provider.kind}.`);
      }
      for (const method of requiredMethods) {
        if (typeof provider[method] !== "function") {
          throw new TypeError(
            `Le périphérique ${provider.id} doit implémenter ${method}().`,
          );
        }
      }
      if (providers.has(provider.id)) {
        throw new Error(`Le périphérique ${provider.id} est déjà enregistré.`);
      }
      providers.set(provider.id, Object.freeze(provider));
      return provider;
    }

    function requireProvider(id) {
      const provider = providers.get(id);
      if (!provider) throw new Error(`Périphérique indisponible : ${id}.`);
      return provider;
    }

    return Object.freeze({
      register,
      require: requireProvider,
      has: (id) => providers.has(id),
      list: () => [...providers.values()],
    });
  }

  globalThis.JMMJSPeripheralRegistry = Object.freeze({
    CONTRACTS,
    createPeripheralRegistry,
  });
})();
/* JMMJS_PERIPHERAL_REGISTRY_END */
