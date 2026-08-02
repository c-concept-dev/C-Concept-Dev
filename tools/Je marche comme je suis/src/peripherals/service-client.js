/* JMMJS_SERVICE_CLIENT_START */
(() => {
  "use strict";

  function createServiceClient({ baseUrl, fetchImpl = fetch, onRequest }) {
    if (!/^https:\/\//.test(baseUrl || "")) {
      throw new TypeError("Le relais cartographique doit utiliser HTTPS.");
    }

    async function post(service, path, body, count = 1) {
      if (!/^\/[a-z0-9/_-]+$/i.test(path || "")) {
        throw new TypeError("Chemin de service invalide.");
      }
      onRequest?.(service, count);
      const response = await fetchImpl(baseUrl + path, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
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
        const retryHeader = response.headers?.get?.("Retry-After");
        const retryBody = data?.error?.retryAfterSeconds;
        const retryAfterSeconds = Number(retryHeader ?? retryBody);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0)
          error.retryAfterSeconds = retryAfterSeconds;
        throw error;
      }
      if (!data) throw new Error("Réponse cartographique illisible.");
      return data;
    }

    return Object.freeze({ post });
  }

  globalThis.JMMJSServiceClient = Object.freeze({ createServiceClient });
})();
/* JMMJS_SERVICE_CLIENT_END */
