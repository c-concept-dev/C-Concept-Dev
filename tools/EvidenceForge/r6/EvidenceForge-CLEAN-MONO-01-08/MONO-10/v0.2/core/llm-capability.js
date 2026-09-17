"use strict";
/**
 * MONO-10 v0.2 — core/llm-capability.js
 *
 * FERMETURE F-05 (preuve faible) et F-12 (parseur laxiste).
 *
 * AVAILABLE exige desormais TOUS les elements : providerId, modelId,
 * workerBindingId, requestId, probeTimestamp valide, credentialPresenceAttested,
 * probeExecuted, probeStatus SUCCESS, responseSchemaValidated,
 * !credentialProbeSkipped, et executionEvidenceClass REAL_RUNTIME en production.
 *
 * Le parseur est STRICT : schema ferme, aucun texte avant ou apres le JSON,
 * aucun champ supplementaire, types exacts.
 *
 * AUCUN SECRET N'EST STOCKE.
 */

const { isNonEmptyStr, fail, stamp, CLASS, assertProductionEvidence } = require("./execution-evidence.js");

const STATUS = { DECLARED: "DECLARED", CONFIGURED: "CONFIGURED", PROBED: "PROBED", AVAILABLE: "AVAILABLE", DEGRADED: "DEGRADED", UNAVAILABLE: "UNAVAILABLE" };
const PROBE_STATUS = { SUCCESS: "SUCCESS", HTTP_ERROR: "HTTP_ERROR", SCHEMA_MISMATCH: "SCHEMA_MISMATCH", TIMEOUT: "TIMEOUT", NOT_RUN: "NOT_RUN" };

const PROBE_PROMPT = 'Reponds uniquement par cet objet JSON, sans aucun texte autour : {"ok":true,"probe":"evidenceforge"}';
const PROBE_MAX_TOKENS = 64;
const PROBE_SCHEMA_KEYS = ["ok", "probe"];

/** Parseur STRICT — schema ferme, aucun texte parasite. */
function validateProbePayload(text) {
  if (typeof text !== "string") return { valid: false, reason: "reponse non textuelle" };
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: "reponse vide" };
  if (trimmed[0] !== "{" || trimmed[trimmed.length - 1] !== "}") {
    return { valid: false, reason: "texte avant ou apres l'objet JSON — schema ferme exige" };
  }
  let parsed;
  try { parsed = JSON.parse(trimmed); } catch (e) { return { valid: false, reason: "JSON invalide : " + e.message }; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { valid: false, reason: "objet JSON attendu" };
  const keys = Object.keys(parsed);
  const extra = keys.filter((k) => PROBE_SCHEMA_KEYS.indexOf(k) === -1);
  if (extra.length) return { valid: false, reason: "champ(s) supplementaire(s) : " + extra.join(", ") + " — schema ferme" };
  const missing = PROBE_SCHEMA_KEYS.filter((k) => keys.indexOf(k) === -1);
  if (missing.length) return { valid: false, reason: "champ(s) manquant(s) : " + missing.join(", ") };
  if (parsed.ok !== true) return { valid: false, reason: "ok doit valoir exactement true" };
  if (parsed.probe !== "evidenceforge") return { valid: false, reason: "probe inattendu" };
  return { valid: true, reason: null };
}

async function runActiveProbe(config, transport, opts) {
  opts = opts || {};
  config = config || {};
  const evidenceClass = opts.executionEvidenceClass || (opts.fixture ? CLASS.TEST_FIXTURE : CLASS.REAL_RUNTIME);
  const base = Object.assign({
    schema: "EvidenceForge.LlmCapability", schemaVersion: "MONO-10-v2",
    providerId: config.providerId || null, modelId: config.modelId || null,
    workerBindingId: config.workerBindingId || null, authMode: config.authMode || null,
    configurationPresent: !!(isNonEmptyStr(config.providerId) && isNonEmptyStr(config.modelId) && isNonEmptyStr(config.workerBindingId)),
    credentialPresenceAttested: config.credentialPresent === true,
    credentialProbeSkipped: false, probeExecuted: false, probeStatus: PROBE_STATUS.NOT_RUN,
    probeTimestamp: null, requestId: null, responseSchemaValidated: false,
    capabilities: [], costUsd: null,
    probeContract: { promptShape: "closed-json-echo", maxTokens: PROBE_MAX_TOKENS, schemaKeys: PROBE_SCHEMA_KEYS, usesMissionData: false, usesCaseData: false },
    failureReason: null, status: STATUS.DECLARED,
  }, stamp(evidenceClass));

  if (!base.configurationPresent) {
    base.status = STATUS.UNAVAILABLE;
    base.failureReason = "configuration incomplete : providerId, modelId et workerBindingId sont tous requis.";
    return base;
  }
  base.status = STATUS.CONFIGURED;
  if (typeof transport !== "function") { base.failureReason = "aucun transport injecte."; return base; }

  base.probeTimestamp = new Date().toISOString();
  let r = null;
  try {
    r = await transport({ providerId: config.providerId, modelId: config.modelId, workerBindingId: config.workerBindingId, prompt: PROBE_PROMPT, maxTokens: PROBE_MAX_TOKENS });
  } catch (e) {
    base.probeExecuted = true; base.probeStatus = PROBE_STATUS.TIMEOUT;
    base.status = STATUS.UNAVAILABLE; base.failureReason = String((e && e.message) || e); return base;
  }
  base.probeExecuted = true; base.status = STATUS.PROBED;
  base.requestId = (r && isNonEmptyStr(r.requestId)) ? r.requestId : null;
  base.costUsd = (r && typeof r.costUsd === "number") ? r.costUsd : null;
  base.credentialProbeSkipped = !!(r && r.credentialProbeSkipped);

  if (!r || r.httpStatus !== 200) {
    base.probeStatus = PROBE_STATUS.HTTP_ERROR; base.status = STATUS.UNAVAILABLE;
    base.failureReason = "HTTP " + ((r && r.httpStatus) || "?") + " (200 attendu)"; return base;
  }
  const v = validateProbePayload(r.text);
  base.responseSchemaValidated = v.valid;
  if (!v.valid) {
    base.probeStatus = PROBE_STATUS.SCHEMA_MISMATCH; base.status = STATUS.DEGRADED;
    base.failureReason = "reponse hors schema : " + v.reason; return base;
  }
  base.probeStatus = PROBE_STATUS.SUCCESS;
  base.capabilities = ["closed_json_response"];

  const missing = [];
  if (!isNonEmptyStr(base.requestId)) missing.push("requestId");
  if (!isNonEmptyStr(base.probeTimestamp) || isNaN(Date.parse(base.probeTimestamp))) missing.push("probeTimestamp");
  if (base.credentialProbeSkipped) missing.push("sonde sans identifiants (credentialProbeSkipped)");
  if (base.credentialPresenceAttested !== true) missing.push("credentialPresenceAttested");
  if (missing.length) {
    base.status = STATUS.DEGRADED;
    base.failureReason = "preuve incomplete : " + missing.join(", ") + ".";
    return base;
  }
  base.status = STATUS.AVAILABLE;
  return base;
}

/** Toutes les conditions sont OBLIGATOIRES. */
function assertCapabilityUsable(capability, config, mode) {
  mode = mode || {};
  const problems = [];
  if (!capability || capability.schema !== "EvidenceForge.LlmCapability") return { usable: false, problems: ["artefact LlmCapability absent"] };
  if (mode.production === true) {
    try { assertProductionEvidence(capability, "LlmCapability", mode); } catch (e) { problems.push(e.message); }
  }
  if (capability.status !== STATUS.AVAILABLE) problems.push("status=" + capability.status + " (AVAILABLE requis)");
  [["providerId", capability.providerId], ["modelId", capability.modelId], ["workerBindingId", capability.workerBindingId], ["requestId", capability.requestId]]
    .forEach(([k, v]) => { if (!isNonEmptyStr(v)) problems.push(k + " absent"); });
  if (!isNonEmptyStr(capability.probeTimestamp) || isNaN(Date.parse(capability.probeTimestamp))) problems.push("probeTimestamp absent ou invalide");
  if (capability.credentialPresenceAttested !== true) problems.push("credentialPresenceAttested != true");
  if (capability.probeExecuted !== true) problems.push("probeExecuted != true");
  if (capability.probeStatus !== PROBE_STATUS.SUCCESS) problems.push("probeStatus=" + capability.probeStatus);
  if (capability.responseSchemaValidated !== true) problems.push("responseSchemaValidated != true");
  if (capability.credentialProbeSkipped === true) problems.push("credentialProbeSkipped=true");
  if (config) {
    if (isNonEmptyStr(config.providerId) && capability.providerId !== config.providerId) problems.push("providerId different du provider configure");
    if (isNonEmptyStr(config.modelId) && capability.modelId !== config.modelId) problems.push("modelId different du modele configure");
  }
  return { usable: problems.length === 0, problems: problems };
}

/** Le booleen legacy ne vaut jamais plus que DECLARED. */
function classifyLegacyDeclaration(dependenciesAvailable) {
  return Object.assign({
    schema: "EvidenceForge.LlmCapability", schemaVersion: "MONO-10-v2",
    status: STATUS.DECLARED, probeExecuted: false, probeStatus: PROBE_STATUS.NOT_RUN,
    responseSchemaValidated: false, credentialPresenceAttested: false,
    providerId: null, modelId: null, workerBindingId: null, requestId: null, probeTimestamp: null,
    legacyDeclaration: !!(dependenciesAvailable && dependenciesAvailable.llm === true),
    failureReason: "declaration du pilote d'execution, jamais une capacite constatee.",
  }, stamp(CLASS.REAL_RUNTIME));
}

module.exports = { runActiveProbe, assertCapabilityUsable, classifyLegacyDeclaration, validateProbePayload, STATUS, PROBE_STATUS, PROBE_PROMPT, PROBE_MAX_TOKENS, PROBE_SCHEMA_KEYS };
