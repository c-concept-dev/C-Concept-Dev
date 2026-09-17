"use strict";
/**
 * MONO-10 v0.3 — core/llm-capability.js
 *
 * Une capacite LLM n'est jamais declaree : elle est CONSTATEE, ou elle n'existe
 * pas. AUCUN SECRET N'EST STOCKE ni journalise.
 *
 * Fermetures v0.3 :
 *   §14 — CLES JSON DUPLIQUEES. `JSON.parse` conserve silencieusement la
 *         DERNIERE occurrence d'une cle repetee. En v0.2, la charge
 *         {"ok":true,"probe":"evidenceforge","ok":false} passait le controle de
 *         schema ferme : Object.keys ne voit qu'un seul "ok". Le texte brut est
 *         desormais scanne AVANT l'analyse.
 *   §15 — ABSENCE != CONFORMITE. En v0.2, `!!(r && r.credentialProbeSkipped)`
 *         transformait un transport muet en "sonde avec identifiants". La
 *         non-elision doit etre ATTESTEE : un booleen explicite `false`. Une
 *         absence est un rejet, jamais un acquis.
 *   §16 — LIAISON COMPLETE. workerBindingId est desormais compare a la
 *         configuration (v0.2 ne comparait que providerId et modelId), et la
 *         capacite doit etre liee au manifeste du run pour valoir en production.
 */

const { isNonEmptyStr, fail } = require("./run-evidence-manifest.js");
const { assertProductionEvidence, assertArtifactBoundToRun } = require("./run-evidence-manifest.js");

const STATUS = { DECLARED: "DECLARED", CONFIGURED: "CONFIGURED", PROBED: "PROBED", AVAILABLE: "AVAILABLE", DEGRADED: "DEGRADED", UNAVAILABLE: "UNAVAILABLE" };
const PROBE_STATUS = { SUCCESS: "SUCCESS", HTTP_ERROR: "HTTP_ERROR", SCHEMA_MISMATCH: "SCHEMA_MISMATCH", TIMEOUT: "TIMEOUT", NOT_RUN: "NOT_RUN" };

const PROBE_PROMPT = 'Reponds uniquement par cet objet JSON, sans aucun texte autour : {"ok":true,"probe":"evidenceforge"}';
const PROBE_MAX_TOKENS = 64;
const PROBE_SCHEMA_KEYS = ["ok", "probe"];

/* ------------------------------------------------------------------ §14 --- */

/** Lit une chaine JSON a partir de text[i] === '"'. Retourne { value, end }. */
function readJsonString(text, i) {
  let out = "";
  i++;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      const n = text[i + 1];
      if (n === "u") { out += String.fromCharCode(parseInt(text.substr(i + 2, 4), 16)); i += 6; continue; }
      out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" })[n] || n;
      i += 2; continue;
    }
    if (c === '"') return { value: out, end: i + 1 };
    out += c; i++;
  }
  return { value: out, end: i, unterminated: true };
}

/**
 * findDuplicateKeys(text) — scan du texte BRUT, a toute profondeur.
 * Les chaines sont consommees entierement, donc un ':' ou une accolade a
 * l'interieur d'une valeur textuelle ne peut pas fausser le suivi.
 */
function findDuplicateKeys(text) {
  const dups = [];
  const stack = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const s = readJsonString(text, i);
      if (s.unterminated) break;
      let j = s.end;
      while (j < text.length && /\s/.test(text[j])) j++;
      const top = stack[stack.length - 1];
      if (text[j] === ":" && top && top.type === "obj") {
        if (top.keys.has(s.value)) dups.push(s.value);
        else top.keys.add(s.value);
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

/** Parseur STRICT — schema ferme, aucun texte parasite, aucune cle dupliquee. */
function validateProbePayload(text) {
  if (typeof text !== "string") return { valid: false, reason: "reponse non textuelle" };
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: "reponse vide" };
  if (trimmed[0] !== "{" || trimmed[trimmed.length - 1] !== "}") {
    return { valid: false, reason: "texte avant ou apres l'objet JSON — schema ferme exige" };
  }
  // AVANT l'analyse : JSON.parse effacerait la duplication.
  const dups = findDuplicateKeys(trimmed);
  if (dups.length) {
    return { valid: false, reason: "cle(s) JSON dupliquee(s) : " + dups.join(", ") + " — une charge ambigue n'est pas une preuve" };
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

/* ------------------------------------------------------------------ §15 --- */

/**
 * L'attestation de presence d'identifiant est un BOOLEEN, jamais une valeur.
 * Toute autre forme est refusee : un lot ne doit pas pouvoir devenir le
 * receptacle d'un secret.
 */
function readCredentialPresence(config) {
  const v = config ? config.credentialPresent : undefined;
  if (v === true || v === false) return { attested: v, problem: null };
  if (typeof v === "string") {
    return { attested: false, problem: "credentialPresent doit etre un booleen. Une chaine a ete fournie — aucun secret n'est accepte ni stocke." };
  }
  return { attested: false, problem: "credentialPresent absent : la presence d'identifiant n'est pas attestee." };
}

/* ------------------------------------------------------------------------- */

async function runActiveProbe(config, transport, opts) {
  opts = opts || {};
  config = config || {};
  const cred = readCredentialPresence(config);
  const base = {
    schema: "EvidenceForge.LlmCapability", schemaVersion: "MONO-10-v3",
    providerId: config.providerId || null, modelId: config.modelId || null,
    workerBindingId: config.workerBindingId || null, authMode: config.authMode || null,
    configurationPresent: !!(isNonEmptyStr(config.providerId) && isNonEmptyStr(config.modelId) && isNonEmptyStr(config.workerBindingId)),
    credentialPresenceAttested: cred.attested,
    credentialPresenceProblem: cred.problem,
    // §15 : trois etats distincts. null = le transport n'a rien atteste.
    credentialProbeSkipped: null,
    credentialProbeSkippedAttested: false,
    probeExecuted: false, probeStatus: PROBE_STATUS.NOT_RUN,
    probeTimestamp: null, requestId: null, responseSchemaValidated: false,
    capabilities: [], costUsd: null,
    probeContract: { promptShape: "closed-json-echo", maxTokens: PROBE_MAX_TOKENS, schemaKeys: PROBE_SCHEMA_KEYS, usesMissionData: false, usesCaseData: false },
    failureReason: null, status: STATUS.DECLARED,
  };

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

  // §15 : on ne DEDUIT rien d'une absence.
  if (r && typeof r.credentialProbeSkipped === "boolean") {
    base.credentialProbeSkipped = r.credentialProbeSkipped;
    base.credentialProbeSkippedAttested = true;
  }

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
  if (base.credentialProbeSkippedAttested !== true) missing.push("le transport n'atteste pas que la sonde a porte des identifiants (credentialProbeSkipped absent)");
  else if (base.credentialProbeSkipped !== false) missing.push("sonde executee sans identifiants (credentialProbeSkipped=true)");
  if (base.credentialPresenceAttested !== true) missing.push(cred.problem || "credentialPresenceAttested");
  if (missing.length) {
    base.status = STATUS.DEGRADED;
    base.failureReason = "preuve incomplete : " + missing.join(" ; ") + ".";
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

  // §16 : en production, la capacite doit appartenir a CE run.
  if (mode.production === true) {
    if (!mode.runManifest) problems.push("aucun manifeste de run : une capacite non rattachee a un run ne vaut pas en production");
    else {
      try { assertArtifactBoundToRun(capability, mode.runManifest, "LlmCapability"); } catch (e) { problems.push(e.message); }
      try { assertProductionEvidence(capability, mode.runManifest, "LlmCapability"); } catch (e) { problems.push(e.message); }
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
  // §15 : l'absence d'attestation est un rejet, au meme titre qu'une elision avouee.
  if (capability.credentialProbeSkippedAttested !== true) problems.push("credentialProbeSkipped non atteste — absence != conformite");
  if (capability.credentialProbeSkipped !== false) problems.push("credentialProbeSkipped=" + String(capability.credentialProbeSkipped) + " (false explicite requis)");

  // §16 : les trois identifiants de liaison sont compares, pas seulement deux.
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

/** Le booleen legacy ne vaut jamais plus que DECLARED. */
function classifyLegacyDeclaration(dependenciesAvailable) {
  return {
    schema: "EvidenceForge.LlmCapability", schemaVersion: "MONO-10-v3",
    status: STATUS.DECLARED, probeExecuted: false, probeStatus: PROBE_STATUS.NOT_RUN,
    responseSchemaValidated: false, credentialPresenceAttested: false,
    credentialProbeSkipped: null, credentialProbeSkippedAttested: false,
    providerId: null, modelId: null, workerBindingId: null, requestId: null, probeTimestamp: null,
    legacyDeclaration: !!(dependenciesAvailable && dependenciesAvailable.llm === true),
    failureReason: "declaration du pilote d'execution, jamais une capacite constatee.",
  };
}

module.exports = {
  runActiveProbe, assertCapabilityUsable, classifyLegacyDeclaration, validateProbePayload,
  findDuplicateKeys, readCredentialPresence,
  STATUS, PROBE_STATUS, PROBE_PROMPT, PROBE_MAX_TOKENS, PROBE_SCHEMA_KEYS,
};
