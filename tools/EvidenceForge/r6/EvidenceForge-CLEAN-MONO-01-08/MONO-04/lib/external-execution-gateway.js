"use strict";

const { createExternalExecutionError } = require("./external-execution-errors.js");
const { validateHttpResponse, validateJsonShape } = require("./response-validation.js");
const { redactHeaders, buildTechnicalLogEntry } = require("./request-redaction.js");
const { computeRequestFingerprint } = require("./request-fingerprint.js");

// ExternalExecutionGateway — CDC MONO-04 section 1. Reçoit une demande
// d'exécution externe, vérifie provider+secret+config, exécute via le bon
// connecteur, normalise UNIQUEMENT le résultat technique, retourne au port
// appelant. Aucune logique métier — jamais une interprétation du contenu
// applicatif de la réponse au-delà de sa forme technique minimale. Le
// payload métier fourni par l'appelant n'est JAMAIS modifié (section 5,
// T04-18) : envoyé tel quel sur le réseau, jamais réécrit.
//
// Circuit breaker minimal (section 16) : après N échecs consécutifs pour un
// même provider, les appels suivants échouent immédiatement
// (EXTERNAL_DEPENDENCY_UNAVAILABLE) sans même tenter le réseau, pendant une
// fenêtre de coolDownMs — jamais une boucle aveugle. Un simple compteur par
// instance de Gateway, aucune architecture distribuée.
const HARD_MAX_ATTEMPTS_CAP = 5; // jamais un retry illimité, quelle que soit la config fournie (section 12)
const DEFAULT_CIRCUIT_BREAKER = { failureThreshold: 5, coolDownMs: 30000 };

function nowMs() {
  return Date.now();
}

function isRetryableErrorCode(code, httpStatus) {
  // Une erreur de VALIDATION (config/secret/forme de réponse) n'est jamais
  // retryable — retenter ne change rien à un provider mal configuré ou un
  // secret absent. Réseau et timeout sont toujours transitoires par nature.
  // Une erreur HTTP n'est retryable QUE pour les statuts effectivement
  // transitoires (429 rate-limit, 5xx serveur) — jamais pour un 4xx client
  // (400/401/403/404), qui ne changera jamais en retentant.
  if (code === "EXTERNAL_NETWORK_ERROR" || code === "EXTERNAL_TIMEOUT") return true;
  if (code === "EXTERNAL_HTTP_ERROR") return httpStatus === 429 || (typeof httpStatus === "number" && httpStatus >= 500);
  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createExternalExecutionGateway(options) {
  const opts = options || {};
  if (!opts.providerRegistry) {
    throw new Error("createExternalExecutionGateway: providerRegistry est obligatoire — jamais construit implicitement.");
  }
  if (!opts.secretProvider) {
    throw new Error("createExternalExecutionGateway: secretProvider est obligatoire — jamais construit implicitement.");
  }
  const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : undefined);
  if (typeof fetchImpl !== "function") {
    throw new Error("createExternalExecutionGateway: aucune implémentation fetch disponible — injecter options.fetchImpl explicitement (jamais un fetch global implicite en production).");
  }
  const providerRegistry = opts.providerRegistry;
  const secretProvider = opts.secretProvider;
  const logger = typeof opts.logger === "function" ? opts.logger : () => {};
  const circuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER, ...(opts.circuitBreaker || {}) };

  // État interne, jamais persisté (MONO-04 ne devient jamais un second
  // ArtifactStore, section 17) : cache d'idempotence in-process et
  // compteurs de circuit breaker par provider.
  const requestCache = new Map(); // requestId -> { fingerprint, promise }
  const circuitState = new Map(); // provider -> { consecutiveFailures, openUntil }

  function getCircuitState(provider) {
    if (!circuitState.has(provider)) circuitState.set(provider, { consecutiveFailures: 0, openUntil: 0 });
    return circuitState.get(provider);
  }

  function recordCircuitSuccess(provider) {
    circuitState.set(provider, { consecutiveFailures: 0, openUntil: 0 });
  }

  function recordCircuitFailure(provider) {
    const s = getCircuitState(provider);
    s.consecutiveFailures += 1;
    if (s.consecutiveFailures >= circuitBreakerConfig.failureThreshold) {
      s.openUntil = nowMs() + circuitBreakerConfig.coolDownMs;
    }
  }

  function isCircuitOpen(provider) {
    const s = getCircuitState(provider);
    return s.openUntil > nowMs();
  }

  function buildResult(request, { status, result, error, startedAt, attemptCount, httpStatus }) {
    // Sur échec, l'httpStatus réel (quand il existe — cas EXTERNAL_HTTP_ERROR)
    // est déjà porté par error.details.httpStatus : on le remonte au niveau
    // technicalDiagnostics.httpStatus plutôt que de le perdre, jamais une
    // resaisie manuelle à chaque site d'appel (bug réel trouvé par T04-07).
    const nestedHttpStatus = error && error.details && error.details.lastError && error.details.lastError.details && typeof error.details.lastError.details.httpStatus === "number" ? error.details.lastError.details.httpStatus : null;
    const resolvedHttpStatus = httpStatus != null ? httpStatus : error && error.details && typeof error.details.httpStatus === "number" ? error.details.httpStatus : nestedHttpStatus;
    return {
      schema: "EvidenceForge.ExternalExecutionResult",
      schemaVersion: "MONO-04-v1",
      requestId: request.requestId,
      status,
      provider: request.provider,
      operation: request.operation,
      startedAt,
      completedAt: new Date().toISOString(),
      attemptCount,
      result: status === "SUCCESS" ? result : null,
      technicalDiagnostics: status === "SUCCESS" ? { httpStatus: resolvedHttpStatus } : { error, httpStatus: resolvedHttpStatus },
    };
  }

  async function performHttpCall({ providerConfig, request, secretValue, timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { "Content-Type": "application/json", Accept: providerConfig.expectedContentType || "application/json" };
    if (providerConfig.requiredSecret && secretValue) {
      headers.Authorization = `Bearer ${secretValue}`;
    }
    logger({ event: "external_call_start", ...buildTechnicalLogEntry({ requestId: request.requestId, provider: request.provider, operation: request.operation }), headers: redactHeaders(headers) });

    let response;
    const t0 = nowMs();
    try {
      response = await fetchImpl(providerConfig.endpoint, {
        method: providerConfig.method || "POST",
        headers,
        body: providerConfig.method === "GET" ? undefined : JSON.stringify(request.payload), // payload métier envoyé tel quel, jamais modifié
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const durationMs = nowMs() - t0;
      if (e && e.name === "AbortError") {
        logger({ event: "external_call_timeout", ...buildTechnicalLogEntry({ requestId: request.requestId, provider: request.provider, operation: request.operation, status: "FAILED", durationMs, errorCode: "EXTERNAL_TIMEOUT" }) });
        throw createExternalExecutionError("EXTERNAL_TIMEOUT", `Timeout après ${timeoutMs}ms pour le provider "${request.provider}".`, { timeoutMs });
      }
      logger({ event: "external_call_network_error", ...buildTechnicalLogEntry({ requestId: request.requestId, provider: request.provider, operation: request.operation, status: "FAILED", durationMs, errorCode: "EXTERNAL_NETWORK_ERROR" }) });
      throw createExternalExecutionError("EXTERNAL_NETWORK_ERROR", `Échec réseau vers le provider "${request.provider}": ${String(e && e.message)}`, { cause: String(e && e.message) });
    }
    clearTimeout(timer);
    const durationMs = nowMs() - t0;

    let bodyText;
    try {
      bodyText = await response.text();
    } catch (e) {
      throw createExternalExecutionError("EXTERNAL_NETWORK_ERROR", `Échec de lecture du corps de réponse pour "${request.provider}": ${String(e && e.message)}`, { cause: String(e && e.message) });
    }

    const headersObj = {};
    if (response.headers && typeof response.headers.forEach === "function") {
      response.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
    }

    let parsed;
    try {
      parsed = validateHttpResponse({
        httpStatus: response.status,
        headers: headersObj,
        bodyText,
        expectedContentType: providerConfig.expectedContentType || "application/json",
        maxBytes: providerConfig.maxResponseBytes,
      });
      if (providerConfig.requiredResponseKeys) {
        validateJsonShape(parsed, providerConfig.requiredResponseKeys);
      }
    } catch (e) {
      logger({ event: "external_call_invalid_response", ...buildTechnicalLogEntry({ requestId: request.requestId, provider: request.provider, operation: request.operation, status: "FAILED", durationMs, httpStatus: response.status, errorCode: e.code }) });
      throw e;
    }

    logger({ event: "external_call_success", ...buildTechnicalLogEntry({ requestId: request.requestId, provider: request.provider, operation: request.operation, status: "SUCCESS", durationMs, httpStatus: response.status }) });
    return { parsed, httpStatus: response.status };
  }

  async function executeOnce(request) {
    const startedAt = new Date().toISOString();

    let providerConfig;
    try {
      providerConfig = providerRegistry.getProviderConfig(request.provider);
    } catch (e) {
      return buildResult(request, { status: "FAILED", error: e, startedAt, attemptCount: 0 });
    }

    if (isCircuitOpen(request.provider)) {
      const err = createExternalExecutionError("EXTERNAL_DEPENDENCY_UNAVAILABLE", `Provider "${request.provider}" en cool-down (circuit breaker ouvert après échecs consécutifs) — aucun appel tenté.`, { provider: request.provider });
      return buildResult(request, { status: "FAILED", error: err, startedAt, attemptCount: 0 });
    }

    let secretValue = null;
    if (providerConfig.requiredSecret) {
      try {
        secretValue = secretProvider.getSecret(providerConfig.requiredSecret);
      } catch (e) {
        return buildResult(request, { status: "FAILED", error: e, startedAt, attemptCount: 0 });
      }
    }

    const timeoutMs = (request.timeoutPolicy && request.timeoutPolicy.timeoutMs) || providerConfig.timeoutMs;
    const requestedRetry = request.retryPolicy || providerConfig.retryPolicy || { maxAttempts: 1, backoffMs: 0 };
    const maxAttempts = Math.max(1, Math.min(requestedRetry.maxAttempts || 1, HARD_MAX_ATTEMPTS_CAP));
    const backoffMs = requestedRetry.backoffMs || 0;

    let lastError = null;
    let attemptCount = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptCount = attempt;
      try {
        const { parsed, httpStatus } = await performHttpCall({ providerConfig, request, secretValue, timeoutMs });
        recordCircuitSuccess(request.provider);
        return buildResult(request, { status: "SUCCESS", result: parsed, startedAt, attemptCount, httpStatus });
      } catch (e) {
        lastError = e;
        recordCircuitFailure(request.provider);
        if (attempt === maxAttempts || !isRetryableErrorCode(e.code, e.details && e.details.httpStatus)) break;
        if (backoffMs > 0) await delay(backoffMs);
      }
    }

    const finalError = attemptCount > 1 ? createExternalExecutionError("EXTERNAL_RETRY_EXHAUSTED", `Toutes les tentatives (${attemptCount}) ont échoué pour le provider "${request.provider}" — dernière erreur : ${lastError && lastError.code}.`, { attempts: attemptCount, lastError }) : lastError;
    return buildResult(request, { status: "FAILED", error: finalError, startedAt, attemptCount });
  }

  return {
    schema: "EvidenceForge.ExternalExecutionGateway",

    // executeRequest(request: ExternalExecutionRequest) -> Promise<ExternalExecutionResult>
    // Idempotence in-process (section 13, corrigée après audit) : un
    // requestId déjà en cours/terminé n'est réutilisé QUE si l'empreinte
    // déterministe de la nouvelle requête (runId/nodeId/moduleId/
    // dependencyType/provider/operation/payload/timeoutPolicy/retryPolicy,
    // jamais un secret) est IDENTIQUE à celle enregistrée — sinon
    // EXTERNAL_REQUEST_CONFLICT explicite, aucun appel réseau, jamais une
    // réutilisation silencieuse du résultat d'une autre requête. Limite
    // documentée : ce cache est in-process uniquement, jamais une garantie
    // cross-process — voir README.
    async executeRequest(request) {
      if (!request || !request.requestId) {
        throw createExternalExecutionError("EXTERNAL_REQUEST_CONFLICT", "executeRequest: requestId manquant — toute opération externe rejouable doit porter un identifiant stable.", {});
      }
      const fingerprint = computeRequestFingerprint(request);
      const cached = requestCache.get(request.requestId);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw createExternalExecutionError(
            "EXTERNAL_REQUEST_CONFLICT",
            `executeRequest: requestId "${request.requestId}" déjà utilisé avec un contenu de requête différent (fingerprint distinct) — jamais une réutilisation silencieuse du résultat d'une autre requête.`,
            { requestId: request.requestId }
          );
        }
        return cached.promise;
      }
      const promise = executeOnce(request);
      requestCache.set(request.requestId, { fingerprint, promise });
      return promise;
    },

    getCircuitState(provider) {
      return { ...getCircuitState(provider) };
    },
  };
}

module.exports = { createExternalExecutionGateway, HARD_MAX_ATTEMPTS_CAP };
