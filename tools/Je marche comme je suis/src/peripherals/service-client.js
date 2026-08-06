/* JMMJS_SERVICE_CLIENT_START */
(() => {
  "use strict";

  function createServiceClient({
    baseUrl,
    fetchImpl = fetch,
    onRequest,
    prepareRequest,
    requestGovernor,
  }) {
    if (!/^https:\/\//.test(baseUrl || "")) {
      throw new TypeError("Le relais cartographique doit utiliser HTTPS.");
    }

    const unavailablePaths = new Set();

    function unavailableEndpointError(path) {
      const error = new Error(`Endpoint indisponible pour cette session : ${path}`);
      error.status = 404;
      error.code = "endpoint-unavailable";
      return error;
    }

    async function post(service, path, body, count = 1) {
      if (!/^\/[a-z0-9/_-]+$/i.test(path || "")) {
        throw new TypeError("Chemin de service invalide.");
      }
      if (unavailablePaths.has(path)) throw unavailableEndpointError(path);
      requestGovernor?.beforeRequest(service, count);
      const preparedBody = prepareRequest
        ? prepareRequest(service, path, body ?? {})
        : body ?? {};
      onRequest?.(service, count);
      const response = await fetchImpl(baseUrl + path, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preparedBody),
      });
      let data = null;
      try {
        data = await response.json();
      } catch {}
      if (!response.ok) {
        const error = new Error(
          data?.error?.message || data?.message || `Réponse ${response.status}`,
        );
        error.status = response.status;
        error.code = data?.error?.code || data?.code || undefined;
        error.reason = data?.error?.reason || undefined;
        error.details = data?.error?.details || undefined;
        error.outcome = data?.outcome || undefined;
        error.requestCount = Number(data?.requestCount) || undefined;
        error.preferencesApplied = data?.preferencesApplied || [];
        const retryHeader = response.headers?.get?.("Retry-After");
        const retryBody = data?.error?.retryAfterSeconds;
        const retryAfterSeconds = Number(retryHeader ?? retryBody);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0)
          error.retryAfterSeconds = retryAfterSeconds;
        if (response.status === 404) unavailablePaths.add(path);
        requestGovernor?.noteFailure(service, error);
        throw error;
      }
      if (!data) throw new Error("Réponse cartographique illisible.");
      return data;
    }

    return Object.freeze({
      post,
      isEndpointUnavailable: (path) => unavailablePaths.has(path),
    });
  }

  globalThis.JMMJSServiceClient = Object.freeze({ createServiceClient });
})();
/* JMMJS_SERVICE_CLIENT_END */
