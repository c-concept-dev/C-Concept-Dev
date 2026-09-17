"use strict";
/**
 * MONO-10 v0.1 — lib/llm-capability.js
 *
 * FERMETURE DE A-08.
 *
 * real-e2e-driver.js code en dur dependenciesAvailable:{llm:true} (l.254, 365,
 * 404). MONO-10 ne le modifie pas : il le classe DECLARED et ne lui accorde
 * aucune force probante.
 *
 * AMENDEMENT PROPRIETAIRE 2. La sonde doit valider une VRAIE reponse structuree
 * de petite taille. max_tokens:1 ne prouve pas la capacite a produire une
 * reponse conforme a un schema : il prouve seulement qu'un jeton sort. La sonde
 * demande donc un objet JSON minimal et VALIDE SA STRUCTURE.
 *
 * Precedent local : MONO-08/v0.6/lib/preflight.js l.171-177 degrade en silence
 * quand aucun identifiant n'est present (body "{}", credentialProbeSkipped=true).
 * Ici, credentialProbeSkipped === true plafonne a DEGRADED.
 *
 * AUCUN SECRET N'EST STOCKE. credentialPresenceAttested est un booleen.
 */

const { isNonEmptyStr, fail } = require("./lineage.js");

const STATUS = {
  DECLARED: "DECLARED", CONFIGURED: "CONFIGURED", PROBED: "PROBED",
  AVAILABLE: "AVAILABLE", DEGRADED: "DEGRADED", UNAVAILABLE: "UNAVAILABLE",
};
const PROBE_STATUS = { SUCCESS: "SUCCESS", HTTP_ERROR: "HTTP_ERROR", SCHEMA_MISMATCH: "SCHEMA_MISMATCH", TIMEOUT: "TIMEOUT", NOT_RUN: "NOT_RUN" };

// Charge utile de sonde : structuree, minuscule, sans aucune donnee de mission.
const PROBE_PROMPT = 'Reponds uniquement par ce JSON, sans texte autour : {"ok":true,"probe":"evidenceforge"}';
const PROBE_MAX_TOKENS = 64;   // budget suffisant pour un objet complet — jamais 1

/** Schema attendu de la reponse : un objet JSON exact, verifie champ par champ. */
function validateProbePayload(text) {
  if (typeof text !== "string" || !text.trim()) return { valid: false, reason: "reponse vide ou non textuelle" };
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { valid: false, reason: "aucun objet JSON dans la reponse" };
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch (e) { return { valid: false, reason: "JSON invalide : " + e.message }; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { valid: false, reason: "objet JSON attendu" };
  if (parsed.ok !== true) return { valid: false, reason: "champ ok !== true" };
  if (parsed.probe !== "evidenceforge") return { valid: false, reason: "champ probe inattendu" };
  return { valid: true, reason: null };
}

/**
 * runActiveProbe(config, transport, opts)
 * config    : { providerId, modelId, workerBindingId, authMode, credentialPresent }
 * transport : fonction INJECTEE (prod : passerelle reelle ; test : faux provider
 *             deterministe). Ce module n'ouvre jamais le reseau lui-meme.
 *             transport({ providerId, modelId, workerBindingId, prompt, maxTokens })
 *               -> { httpStatus, text, requestId?, costUsd?, credentialProbeSkipped? }
 * opts.fixture : true marque une sonde de FIXTURE (jamais valable en production).
 */
async function runActiveProbe(config, transport, opts) {
  opts = opts || {};
  config = config || {};
  const base = {
    schema: "EvidenceForge.LlmCapability", schemaVersion: "MONO-10-v1",
    providerId: config.providerId || null,
    modelId: config.modelId || null,
    workerBindingId: config.workerBindingId || null,
    authMode: config.authMode || null,
    configurationPresent: !!(isNonEmptyStr(config.providerId) && isNonEmptyStr(config.modelId) && isNonEmptyStr(config.workerBindingId)),
    credentialPresenceAttested: config.credentialPresent === true,   // booleen, JAMAIS une cle
    credentialProbeSkipped: false,
    probeExecuted: false,
    probeStatus: PROBE_STATUS.NOT_RUN,
    probeTimestamp: null, requestId: null,
    responseSchemaValidated: false,
    capabilities: [], costUsd: null,
    probeContract: { promptShape: "structured-json-echo", maxTokens: PROBE_MAX_TOKENS, usesMissionData: false, usesSentinelData: false },
    provenance: { fixture: opts.fixture === true },
    failureReason: null,
    status: STATUS.DECLARED,
  };

  if (!base.configurationPresent) {
    base.status = STATUS.UNAVAILABLE;
    base.failureReason = "configuration incomplete : providerId, modelId et workerBindingId sont tous requis.";
    return base;
  }
  base.status = STATUS.CONFIGURED;
  if (typeof transport !== "function") {
    base.failureReason = "aucun transport injecte : la sonde n'a pas ete executee.";
    return base;
  }

  let r = null;
  base.probeTimestamp = new Date().toISOString();
  try {
    r = await transport({
      providerId: config.providerId, modelId: config.modelId, workerBindingId: config.workerBindingId,
      prompt: PROBE_PROMPT, maxTokens: PROBE_MAX_TOKENS,
    });
  } catch (e) {
    base.probeExecuted = true; base.probeStatus = PROBE_STATUS.TIMEOUT;
    base.status = STATUS.UNAVAILABLE; base.failureReason = String((e && e.message) || e);
    return base;
  }

  base.probeExecuted = true;
  base.status = STATUS.PROBED;
  base.requestId = (r && r.requestId) || null;
  base.costUsd = (r && typeof r.costUsd === "number") ? r.costUsd : null;
  base.credentialProbeSkipped = !!(r && r.credentialProbeSkipped);

  if (!r || r.httpStatus !== 200) {
    base.probeStatus = PROBE_STATUS.HTTP_ERROR;
    base.status = STATUS.UNAVAILABLE;
    base.failureReason = "HTTP " + ((r && r.httpStatus) || "?") + " (200 attendu)";
    return base;
  }
  const v = validateProbePayload(r.text);
  base.responseSchemaValidated = v.valid;
  if (!v.valid) {
    base.probeStatus = PROBE_STATUS.SCHEMA_MISMATCH;
    base.status = STATUS.DEGRADED;
    base.failureReason = "reponse hors schema : " + v.reason;
    return base;
  }
  base.probeStatus = PROBE_STATUS.SUCCESS;
  base.capabilities = ["structured_json_response"];

  if (base.credentialProbeSkipped) {
    base.status = STATUS.DEGRADED;
    base.failureReason = "sonde executee SANS identifiants (credentialProbeSkipped) — ne prouve pas la disponibilite reelle.";
    return base;
  }
  if (!base.credentialPresenceAttested) {
    base.status = STATUS.DEGRADED;
    base.failureReason = "presence d'identifiants non attestee.";
    return base;
  }
  base.status = STATUS.AVAILABLE;
  return base;
}

/**
 * assertCapabilityUsable(capability, config, opts)
 * AVAILABLE exige TOUTES les conditions, y compris la concordance du provider et
 * du modele reellement configures.
 */
function assertCapabilityUsable(capability, config, opts) {
  opts = opts || {};
  const problems = [];
  if (!capability || capability.schema !== "EvidenceForge.LlmCapability") problems.push("artefact LlmCapability absent");
  else {
    if (capability.provenance && capability.provenance.fixture === true && opts.allowFixture !== true) {
      problems.push("sonde de FIXTURE : jamais recevable comme preuve de production");
    }
    if (capability.status !== STATUS.AVAILABLE) problems.push("status=" + capability.status + " (AVAILABLE requis)");
    if (capability.probeExecuted !== true) problems.push("probeExecuted=false");
    if (capability.probeStatus !== PROBE_STATUS.SUCCESS) problems.push("probeStatus=" + capability.probeStatus);
    if (capability.responseSchemaValidated !== true) problems.push("responseSchemaValidated=false");
    if (capability.credentialProbeSkipped === true) problems.push("credentialProbeSkipped=true");
    if (!isNonEmptyStr(capability.workerBindingId)) problems.push("workerBindingId absent");
    if (config) {
      if (isNonEmptyStr(config.providerId) && capability.providerId !== config.providerId) problems.push("providerId different du provider configure");
      if (isNonEmptyStr(config.modelId) && capability.modelId !== config.modelId) problems.push("modelId different du modele configure");
    }
  }
  return { usable: problems.length === 0, problems: problems };
}

/** Le booleen legacy ne vaut jamais plus que DECLARED. */
function classifyLegacyDeclaration(dependenciesAvailable) {
  return {
    schema: "EvidenceForge.LlmCapability", schemaVersion: "MONO-10-v1",
    status: STATUS.DECLARED, probeExecuted: false, probeStatus: PROBE_STATUS.NOT_RUN,
    responseSchemaValidated: false, credentialPresenceAttested: false,
    providerId: null, modelId: null, workerBindingId: null,
    provenance: { fixture: false },
    legacyDeclaration: !!(dependenciesAvailable && dependenciesAvailable.llm === true),
    failureReason: "dependenciesAvailable.llm est une DECLARATION du driver (real-e2e-driver.js l.254/365/404), jamais une capacite constatee.",
  };
}

module.exports = { runActiveProbe, assertCapabilityUsable, classifyLegacyDeclaration, validateProbePayload, STATUS, PROBE_STATUS, PROBE_PROMPT, PROBE_MAX_TOKENS };
