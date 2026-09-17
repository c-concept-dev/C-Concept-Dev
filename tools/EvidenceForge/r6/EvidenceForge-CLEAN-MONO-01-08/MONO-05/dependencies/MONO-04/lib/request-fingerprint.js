"use strict";

const crypto = require("crypto");

// request-fingerprint.js — CDC MONO-04 correction post-audit (protocole
// d'idempotence). Calcule une empreinte déterministe d'une
// ExternalExecutionRequest, à l'exclusion de requestId lui-même (qui sert
// de clé de cache, pas de contenu à empreindre) et de tout secret (jamais
// présent dans l'objet requête — les secrets sont résolus séparément via
// SecretProvider, jamais transportés dans le payload par ce module).
//
// canonicalStringify trie récursivement les clés d'objet, pour que
// {a:1,b:2} et {b:2,a:1} produisent EXACTEMENT la même empreinte — jamais
// un faux conflit dû au seul ordre d'insertion des clés.
function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(value[k])).join(",") + "}";
}

// computeRequestFingerprint(request) -> string (sha256 hex). Couvre
// exactement les champs métier de la demande (jamais requestId, jamais un
// secret) : runId, nodeId, moduleId, dependencyType, provider, operation,
// payload, timeoutPolicy, retryPolicy.
function computeRequestFingerprint(request) {
  const fingerprintable = {
    runId: request.runId != null ? request.runId : null,
    nodeId: request.nodeId != null ? request.nodeId : null,
    moduleId: request.moduleId != null ? request.moduleId : null,
    dependencyType: request.dependencyType != null ? request.dependencyType : null,
    provider: request.provider != null ? request.provider : null,
    operation: request.operation != null ? request.operation : null,
    payload: request.payload !== undefined ? request.payload : null,
    timeoutPolicy: request.timeoutPolicy != null ? request.timeoutPolicy : null,
    retryPolicy: request.retryPolicy != null ? request.retryPolicy : null,
  };
  return crypto.createHash("sha256").update(canonicalStringify(fingerprintable)).digest("hex");
}

module.exports = { computeRequestFingerprint, canonicalStringify };
