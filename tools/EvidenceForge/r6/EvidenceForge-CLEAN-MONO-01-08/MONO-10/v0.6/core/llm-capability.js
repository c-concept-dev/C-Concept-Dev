"use strict";
/**
 * MONO-10 v0.6 — core/llm-capability.js  (§19)
 *
 * Une capacite LLM n'est jamais declaree : elle est CONSTATEE. AUCUN SECRET
 * n'est stocke ni journalise.
 *
 * Acquis v0.3 conserves : parseur strict a schema ferme, detection des cles
 * JSON dupliquees AVANT analyse, attestation explicite de non-elision des
 * identifiants, comparaison des trois identifiants de liaison.
 *
 * FERMETURE v0.4 (§19) : la sonde est liee au RUN ATTESTE. Un transport
 * fabrique localement sous un manifeste TEST ne peut jamais produire une
 * capacite utilisable en PRODUCTION — la classe de preuve vient de
 * l'attestation exterieure, pas de la sonde.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const RM = require("./run-evidence-manifest.js");
const OTV = require("./operator-trust-verifier.js");
const OLB = require("./operator-llm-capability-boundary.js");

const STATUS = { DECLARED: "DECLARED", CONFIGURED: "CONFIGURED", PROBED: "PROBED", AVAILABLE: "AVAILABLE", DEGRADED: "DEGRADED", UNAVAILABLE: "UNAVAILABLE" };
const PROBE_STATUS = { SUCCESS: "SUCCESS", HTTP_ERROR: "HTTP_ERROR", SCHEMA_MISMATCH: "SCHEMA_MISMATCH", TIMEOUT: "TIMEOUT", NOT_RUN: "NOT_RUN" };
const PROBE_PROMPT = 'Reponds uniquement par cet objet JSON, sans aucun texte autour : {"ok":true,"probe":"evidenceforge"}';
const PROBE_MAX_TOKENS = 64;
const PROBE_SCHEMA_KEYS = ["ok", "probe"];

function readJsonString(text, i) {
  let out = ""; i++;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      const n = text[i + 1];
      if (n === "u") { out += String.fromCharCode(parseInt(text.substr(i + 2, 4), 16)); i += 6; continue; }
      out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" })[n] || n; i += 2; continue;
    }
    if (c === '"') return { value: out, end: i + 1 };
    out += c; i++;
  }
  return { value: out, end: i, unterminated: true };
}

/** Scan du texte BRUT : `JSON.parse` effacerait silencieusement la duplication. */
function findDuplicateKeys(text) {
  const dups = [], stack = []; let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const s = readJsonString(text, i);
      if (s.unterminated) break;
      let j = s.end; while (j < text.length && /\s/.test(text[j])) j++;
      const top = stack[stack.length - 1];
      if (text[j] === ":" && top && top.type === "obj") {
        if (top.keys.has(s.value)) dups.push(s.value); else top.keys.add(s.value);
      }
      i = s.end; continue;
    }
    if (c === "{") { stack.push({ type: "obj", keys: new Set() }); i++; continue; }
    if (c === "[") { stack.push({ type: "arr" }); i++; continue; }
    if (c === "}" || c === "]") { stack.pop(); i++; continue; }
    i++;
  }
  return dups;
}

function validateProbePayload(text) {
  if (typeof text !== "string") return { valid: false, reason: "reponse non textuelle" };
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: "reponse vide" };
  if (trimmed[0] !== "{" || trimmed[trimmed.length - 1] !== "}") return { valid: false, reason: "texte avant ou apres l'objet JSON — schema ferme exige" };
  const dups = findDuplicateKeys(trimmed);
  if (dups.length) return { valid: false, reason: "cle(s) JSON dupliquee(s) : " + dups.join(", ") + " — une charge ambigue n'est pas une preuve" };
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

function readCredentialPresence(config) {
  const v = config ? config.credentialPresent : undefined;
  if (v === true || v === false) return { attested: v, problem: null };
  if (typeof v === "string") return { attested: false, problem: "credentialPresent doit etre un booleen. Une chaine a ete fournie — aucun secret n'est accepte ni stocke." };
  return { attested: false, problem: "credentialPresent absent : la presence d'identifiant n'est pas attestee." };
}

/**
 * runActiveProbe(intent, ctx)   (§45, §46)
 *
 * FERMETURE v0.5 B13. Le transport n'est plus un parametre : il vient de la
 * frontiere de capacite provisionnee par l'exploitant. L'appelant declare son
 * INTENTION (fournisseur, modele, worker attendus) ; il ne fournit pas la
 * fonction qui prouve son propre succes.
 *
 * Un `ctx.transport` fourni par l'appelant est IGNORE et signale.
 */
async function runActiveProbe(intent, ctx) {
  ctx = ctx || {}; const config = intent || {};
  const callerTransport = typeof ctx.transport === "function" || typeof ctx.callerTransport === "function";
  const llmBoundary = OTV.isOperatorTrustVerifier(ctx.verifier) ? ctx.verifier.llmCapabilityBoundary() : null;
  const transport = (llmBoundary && typeof llmBoundary.probe === "function")
    ? function (req) { return llmBoundary.probe(req); } : null;
  const cred = readCredentialPresence(config);
  const mode = RM.effectiveMode(ctx);
  const base = {
    schema: "EvidenceForge.LlmCapability", schemaVersion: "MONO-10-v6",
    providerId: config.providerId || null, modelId: config.modelId || null,
    workerBindingId: config.workerBindingId || null, authMode: config.authMode || null,
    configurationPresent: !!(isNonEmptyStr(config.providerId) && isNonEmptyStr(config.modelId) && isNonEmptyStr(config.workerBindingId)),
    credentialPresenceAttested: cred.attested, credentialPresenceProblem: cred.problem,
    credentialProbeSkipped: null, credentialProbeSkippedAttested: false,
    probeExecuted: false, probeStatus: PROBE_STATUS.NOT_RUN, probeTimestamp: null,
    requestId: null, responseSchemaValidated: false, capabilities: [], costUsd: null,
    /** §19 — la classe de preuve vient du run atteste, jamais de la sonde. */
    probeRunId: (ctx.manifest && ctx.manifest.runId) || null,
    probeExecutionMode: mode,
    probeAttestationHash: (ctx.manifest && ctx.manifest.runtimeAttestationHash) || null,
    probeContract: { promptShape: "closed-json-echo", maxTokens: PROBE_MAX_TOKENS, schemaKeys: PROBE_SCHEMA_KEYS, usesMissionData: false, usesCaseData: false },
    /** §45 — d'ou vient le transport. Un transport d'appelant n'en est pas un. */
    transportOrigin: llmBoundary ? llmBoundary.provisionedFrom : null,
    llmBoundaryId: llmBoundary ? llmBoundary.llmBoundaryId : null,
    llmBoundaryNamespace: llmBoundary ? llmBoundary.namespace : null,
    callerTransportIgnored: callerTransport === true,
    failureReason: null, status: STATUS.DECLARED,
  };
  if (!llmBoundary || !OLB.isProvisionedLlmBoundary(llmBoundary)) {
    base.status = STATUS.UNAVAILABLE;
    base.failureReason = "aucune frontiere de capacite LLM provisionnee par l'exploitant"
      + (callerTransport ? " ; un transport fourni par l'appelant a ete ignore" : "") + " — fail closed.";
    return base;
  }
  if (mode === RM.MODE.PRODUCTION && llmBoundary.namespace !== RM.MODE.PRODUCTION) {
    base.status = STATUS.UNAVAILABLE;
    base.failureReason = "frontiere de capacite en espace " + llmBoundary.namespace + " : elle ne prouve aucune capacite de PRODUCTION.";
    return base;
  }
  if (!base.configurationPresent) {
    base.status = STATUS.UNAVAILABLE;
    base.failureReason = "configuration incomplete : providerId, modelId et workerBindingId sont tous requis.";
    return base;
  }
  base.status = STATUS.CONFIGURED;
  if (typeof transport !== "function") { base.status = STATUS.UNAVAILABLE; base.failureReason = "frontiere de capacite sans sonde."; return base; }

  base.probeTimestamp = new Date().toISOString();
  let r = null;
  try {
    r = await transport({ providerId: config.providerId, modelId: config.modelId, workerBindingId: config.workerBindingId,
      prompt: PROBE_PROMPT, maxTokens: PROBE_MAX_TOKENS, runId: base.probeRunId });
  } catch (e) {
    base.probeExecuted = true; base.probeStatus = PROBE_STATUS.TIMEOUT;
    base.status = STATUS.UNAVAILABLE; base.failureReason = String((e && e.message) || e); return base;
  }
  base.probeExecuted = true; base.status = STATUS.PROBED;
  base.requestId = (r && isNonEmptyStr(r.requestId)) ? r.requestId : null;
  base.costUsd = (r && typeof r.costUsd === "number") ? r.costUsd : null;
  if (r && r.denied === true) {
    base.probeStatus = PROBE_STATUS.HTTP_ERROR; base.status = STATUS.UNAVAILABLE;
    base.failureReason = "intention refusee par la frontiere de l'exploitant : " + (r.denyReasons || []).join(" ; ");
    return base;
  }
  if (r && typeof r.credentialProbeSkipped === "boolean") { base.credentialProbeSkipped = r.credentialProbeSkipped; base.credentialProbeSkippedAttested = true; }

  if (!r || r.httpStatus !== 200) {
    base.probeStatus = PROBE_STATUS.HTTP_ERROR; base.status = STATUS.UNAVAILABLE;
    base.failureReason = "HTTP " + ((r && r.httpStatus) || "?") + " (200 attendu)"; return base;
  }
  const v = validateProbePayload(r.text);
  base.responseSchemaValidated = v.valid;
  if (!v.valid) { base.probeStatus = PROBE_STATUS.SCHEMA_MISMATCH; base.status = STATUS.DEGRADED; base.failureReason = "reponse hors schema : " + v.reason; return base; }
  base.probeStatus = PROBE_STATUS.SUCCESS;
  base.capabilities = ["closed_json_response"];

  const missing = [];
  if (!isNonEmptyStr(base.requestId)) missing.push("requestId");
  if (!isNonEmptyStr(base.probeTimestamp) || isNaN(Date.parse(base.probeTimestamp))) missing.push("probeTimestamp");
  if (base.credentialProbeSkippedAttested !== true) missing.push("le transport n'atteste pas que la sonde a porte des identifiants (credentialProbeSkipped absent)");
  else if (base.credentialProbeSkipped !== false) missing.push("sonde executee sans identifiants (credentialProbeSkipped=true)");
  if (base.credentialPresenceAttested !== true) missing.push(cred.problem || "credentialPresenceAttested");
  if (missing.length) { base.status = STATUS.DEGRADED; base.failureReason = "preuve incomplete : " + missing.join(" ; ") + "."; return base; }
  base.status = STATUS.AVAILABLE;
  return base;
}

/** assertCapabilityUsable(capability, config, ctx) */
function assertCapabilityUsable(capability, config, ctx) {
  ctx = ctx || {};
  const problems = [];
  if (!capability || capability.schema !== "EvidenceForge.LlmCapability") return { usable: false, problems: ["artefact LlmCapability absent"] };

  const production = RM.isProductionContext(ctx);
  if (production) {
    if (!ctx.manifest) problems.push("aucun manifeste de run : une capacite non rattachee a un run ne vaut pas en production");
    else {
      try { RM.assertProductionEvidence(capability, ctx, "LlmCapability"); } catch (e) { problems.push(e.message); }
      // §19 — la sonde doit avoir ete EXECUTEE sous ce run atteste.
      if (capability.probeRunId !== ctx.manifest.runId) problems.push("la sonde n'a pas ete executee sous ce run : probeRunId=" + capability.probeRunId);
      if (capability.probeAttestationHash !== ctx.manifest.runtimeAttestationHash) {
        problems.push("la sonde a ete executee sous une autre attestation runtime — une sonde de test ne prouve pas une capacite de production");
      }
      if (capability.probeExecutionMode !== RM.MODE.PRODUCTION) {
        problems.push("sonde executee en mode " + capability.probeExecutionMode + " : elle ne peut pas prouver une capacite de PRODUCTION");
      }
      // §45/§48 — le transport doit venir de l'exploitant, pas de l'appelant.
      if (capability.transportOrigin !== "ENVIRONMENT") {
        problems.push("transport de sonde d'origine \"" + capability.transportOrigin + "\" : une capacite de PRODUCTION exige un transport provisionne par l'exploitant");
      }
      if (capability.llmBoundaryNamespace !== RM.MODE.PRODUCTION) {
        problems.push("frontiere de capacite hors espace PRODUCTION");
      }
      if (capability.callerTransportIgnored === true) {
        problems.push("un transport fourni par l'appelant a ete presente : signale et ignore");
      }
    }
  }
  if (capability.status !== STATUS.AVAILABLE) problems.push("status=" + capability.status + " (AVAILABLE requis)");
  [["providerId", capability.providerId], ["modelId", capability.modelId], ["workerBindingId", capability.workerBindingId], ["requestId", capability.requestId]]
    .forEach(function (p) { if (!isNonEmptyStr(p[1])) problems.push(p[0] + " absent"); });
  if (!isNonEmptyStr(capability.probeTimestamp) || isNaN(Date.parse(capability.probeTimestamp))) problems.push("probeTimestamp absent ou invalide");
  if (capability.credentialPresenceAttested !== true) problems.push("credentialPresenceAttested != true");
  if (capability.probeExecuted !== true) problems.push("probeExecuted != true");
  if (capability.probeStatus !== PROBE_STATUS.SUCCESS) problems.push("probeStatus=" + capability.probeStatus);
  if (capability.responseSchemaValidated !== true) problems.push("responseSchemaValidated != true");
  if (capability.credentialProbeSkippedAttested !== true) problems.push("credentialProbeSkipped non atteste — absence != conformite");
  if (capability.credentialProbeSkipped !== false) problems.push("credentialProbeSkipped=" + String(capability.credentialProbeSkipped) + " (false explicite requis)");
  if (config) {
    [["providerId", "provider configure"], ["modelId", "modele configure"], ["workerBindingId", "binding d'execution configure"]]
      .forEach(function (p) {
        if (isNonEmptyStr(config[p[0]]) && capability[p[0]] !== config[p[0]]) {
          problems.push(p[0] + " different du " + p[1] + " : la capacite constatee ne porte pas sur ce qui sera execute");
        }
      });
  }
  return { usable: problems.length === 0, problems: problems };
}

function classifyLegacyDeclaration(dependenciesAvailable) {
  return { schema: "EvidenceForge.LlmCapability", schemaVersion: "MONO-10-v6",
    status: STATUS.DECLARED, probeExecuted: false, probeStatus: PROBE_STATUS.NOT_RUN,
    responseSchemaValidated: false, credentialPresenceAttested: false,
    credentialProbeSkipped: null, credentialProbeSkippedAttested: false,
    providerId: null, modelId: null, workerBindingId: null, requestId: null, probeTimestamp: null,
    probeRunId: null, probeExecutionMode: null, probeAttestationHash: null,
    legacyDeclaration: !!(dependenciesAvailable && dependenciesAvailable.llm === true),
    failureReason: "declaration du pilote d'execution, jamais une capacite constatee." };
}

module.exports = { runActiveProbe, assertCapabilityUsable, classifyLegacyDeclaration, validateProbePayload,
  findDuplicateKeys, readCredentialPresence, STATUS, PROBE_STATUS, PROBE_PROMPT, PROBE_MAX_TOKENS, PROBE_SCHEMA_KEYS };
