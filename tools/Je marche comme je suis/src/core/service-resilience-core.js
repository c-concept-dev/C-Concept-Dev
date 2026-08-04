(() => {
  "use strict";

  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
  const DEFAULT_TIMEOUT_MS = 12000;
  const DEFAULT_RETRY_DELAYS = Object.freeze([700, 1500]);

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function numericStatus(error) {
    const candidates = [
      error?.status,
      error?.response?.status,
      error?.cause?.status,
    ];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value)) return value;
    }
    const match = String(error?.message || "").match(/\b(401|403|429|500|502|503|504)\b/);
    return match ? Number(match[1]) : null;
  }

  function classifyServiceError(error, service = "service") {
    const status = numericStatus(error);
    const message = String(error?.message || "Erreur inconnue");
    const lower = message.toLowerCase();

    if (error?.code === "cooldown")
      return {
        code: "cooldown",
        status,
        retryable: true,
        retryAfterSeconds: Number(error?.retryAfterSeconds) || null,
        userMessage: message,
        technicalMessage: message,
      };

    if (error?.code === "search-quota" || error?.code === "session-quota")
      return {
        code: error.code,
        status,
        retryable: false,
        userMessage: message,
        technicalMessage: message,
      };

    if (
      error?.name === "AbortError" ||
      lower.includes("timeout") ||
      lower.includes("délai") ||
      lower.includes("delai")
    )
      return {
        code: "timeout",
        status,
        retryable: true,
        userMessage: `${service} met trop de temps à répondre.`,
        technicalMessage: message,
      };

    if (status === 401 || status === 403)
      return {
        code: "authentication",
        status,
        retryable: false,
        userMessage: `${service} refuse l’accès. La configuration sécurisée doit être vérifiée.`,
        technicalMessage: message,
      };

    if (status === 429)
      return {
        code: "quota",
        status,
        retryable: true,
        userMessage: `${service} a atteint sa limite temporaire de requêtes.`,
        technicalMessage: message,
      };

    if (status && RETRYABLE_STATUS.has(status))
      return {
        code: "temporary",
        status,
        retryable: true,
        userMessage: `${service} est temporairement indisponible.`,
        technicalMessage: message,
      };

    if (
      error instanceof TypeError ||
      lower.includes("failed to fetch") ||
      lower.includes("network") ||
      lower.includes("réseau") ||
      lower.includes("reseau")
    )
      return {
        code: "network",
        status,
        retryable: true,
        userMessage: `Connexion impossible avec ${service}.`,
        technicalMessage: message,
      };

    if (
      lower.includes("aucune boucle") ||
      lower.includes("aucun itinéraire") ||
      lower.includes("aucun itineraire") ||
      lower.includes("no route") ||
      lower.includes("no path")
    )
      return {
        code: "no-result",
        status,
        retryable: false,
        userMessage: `${service} n’a trouvé aucun itinéraire pédestre exploitable depuis ce point.`,
        technicalMessage: message,
      };

    if (
      lower.includes("json") ||
      lower.includes("réponse invalide") ||
      lower.includes("reponse invalide")
    )
      return {
        code: "invalid-response",
        status,
        retryable: false,
        userMessage: `${service} a renvoyé une réponse inexploitable.`,
        technicalMessage: message,
      };

    return {
      code: "unknown",
      status,
      retryable: false,
      userMessage: `${service} n’a pas pu terminer l’opération.`,
      technicalMessage: message,
    };
  }

  function createServiceResilience({
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelays = DEFAULT_RETRY_DELAYS,
    cacheTtlMs = 2 * 60 * 1000,
    now = Date.now,
  } = {}) {
    const pending = new Map();
    const cache = new Map();

    async function withTimeout(operation, milliseconds) {
      let timer = null;
      try {
        return await Promise.race([
          Promise.resolve().then(operation),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              const error = new Error(`Timeout après ${milliseconds} ms`);
              error.name = "AbortError";
              reject(error);
            }, milliseconds);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    async function execute({
      service,
      key,
      operation,
      allowRetry = true,
      allowCache = false,
      customTimeoutMs = timeoutMs,
    }) {
      if (typeof operation !== "function")
        throw new TypeError("Une opération de service est requise.");

      const operationKey = `${service}:${key || "default"}`;
      const cached = cache.get(operationKey);
      if (
        allowCache &&
        cached &&
        now() - cached.savedAt < cacheTtlMs
      )
        return {
          ok: true,
          value: cached.value,
          attempts: 0,
          cache: "hit",
          diagnostic: null,
        };

      if (pending.has(operationKey)) return pending.get(operationKey);

      const task = (async () => {
        const maximumAttempts =
          allowRetry ? retryDelays.length + 1 : 1;
        let lastDiagnostic = null;

        for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
          try {
            const value = await withTimeout(operation, customTimeoutMs);
            if (allowCache)
              cache.set(operationKey, {
                savedAt: now(),
                value,
              });
            return {
              ok: true,
              value,
              attempts: attempt + 1,
              cache: "miss",
              diagnostic: null,
            };
          } catch (error) {
            lastDiagnostic = classifyServiceError(error, service);
            if (
              !allowRetry ||
              !lastDiagnostic.retryable ||
              attempt >= maximumAttempts - 1
            )
              return {
                ok: false,
                value: null,
                attempts: attempt + 1,
                cache: "miss",
                diagnostic: lastDiagnostic,
                error,
              };
            await wait(retryDelays[attempt]);
          }
        }

        return {
          ok: false,
          value: null,
          attempts: maximumAttempts,
          cache: "miss",
          diagnostic: lastDiagnostic,
        };
      })().finally(() => pending.delete(operationKey));

      pending.set(operationKey, task);
      return task;
    }

    function clearCache(service = null) {
      if (!service) return cache.clear();
      for (const key of cache.keys())
        if (key.startsWith(`${service}:`)) cache.delete(key);
    }

    return Object.freeze({
      execute,
      clearCache,
      classifyServiceError,
    });
  }

  globalThis.JMMJSServiceResilienceCore = Object.freeze({
    RETRYABLE_STATUS,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_RETRY_DELAYS,
    classifyServiceError,
    createServiceResilience,
  });
})();
