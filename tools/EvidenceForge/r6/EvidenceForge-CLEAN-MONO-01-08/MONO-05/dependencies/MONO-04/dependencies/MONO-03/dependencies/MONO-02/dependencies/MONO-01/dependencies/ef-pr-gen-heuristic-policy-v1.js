// EvidenceForge — EF-PR-GEN-01 — HeuristicPolicy — v1
//
// Brique additive. Sort des briques métier les seuils/heuristiques TEST
// trouvés sans justification documentée : minWorks/minDoi/minYears/minTopics
// (EF-02D1-D2), coverageThreshold/minMarginalGain/redundancyPenalty/maxPanel
// (EF-02D3). Pour cette version, SEULS des statuts non validés existent —
// "validated" n'est PAS un statut atteignable ici. Il ne pourra être
// introduit que par un futur contrat de validation méthodologique séparé et
// traçable, jamais par ce module.
"use strict";

function str(v) { return String(v == null ? "" : v).trim(); }

const ALLOWED_STATUSES = ["test_unvalidated", "test_pending_review"];

// knownKeySchemas optionnel : {key: {type:"number"|"string", min?, max?, enum?}}
// — reste géré par l'APPELANT (chaque brique consommatrice connaît ses
// propres clés), jamais des noms de clés EF-02D en dur dans ce module
// générique.
function validateAgainstSchema(values, knownKeySchemas) {
  const errors = [];
  for (const [key, schema] of Object.entries(knownKeySchemas || {})) {
    if (!(key in values)) continue;
    const v = values[key];
    if (schema.type === "number") {
      if (typeof v !== "number" || Number.isNaN(v)) { errors.push(key + " doit être un nombre."); continue; }
      if (typeof schema.min === "number" && v < schema.min) errors.push(key + " (" + v + ") < min autorisé (" + schema.min + ").");
      if (typeof schema.max === "number" && v > schema.max) errors.push(key + " (" + v + ") > max autorisé (" + schema.max + ").");
    } else if (schema.type === "string") {
      if (typeof v !== "string") { errors.push(key + " doit être une chaîne."); continue; }
      if (Array.isArray(schema.enum) && !schema.enum.includes(v)) errors.push(key + " (\"" + v + "\") hors de l'énumération autorisée : " + schema.enum.join(", ") + ".");
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// buildHeuristicPolicy({policyId, status, values, justification, knownKeySchemas})
// ---------------------------------------------------------------------------
function buildHeuristicPolicy({ policyId, status, values, justification, knownKeySchemas }) {
  const pid = str(policyId);
  if (!pid) throw new Error("buildHeuristicPolicy: policyId manquant.");
  const st = str(status);
  if (!ALLOWED_STATUSES.includes(st)) {
    throw new Error("buildHeuristicPolicy: status invalide (\"" + st + "\") — attendu l'un de : " + ALLOWED_STATUSES.join(", ") + ". \"validated\" n'existe pas dans cette version : il exigera un futur contrat de validation méthodologique séparé.");
  }
  if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length === 0) {
    throw new Error("buildHeuristicPolicy: values doit être un objet non vide de seuils.");
  }
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || (typeof v === "object" && v !== null)) {
      throw new Error("buildHeuristicPolicy: values." + k + " doit être un nombre, une chaîne ou un booléen (jamais un objet imbriqué ni undefined).");
    }
  }
  if (knownKeySchemas) {
    const errors = validateAgainstSchema(values, knownKeySchemas);
    if (errors.length) throw new Error("buildHeuristicPolicy: " + errors.join(" "));
  }
  const just = justification == null ? null : str(justification);
  return Object.freeze({
    schema: "EvidenceForge.HeuristicPolicy",
    schemaVersion: "EF-PR-GEN-v1",
    policyId: pid,
    status: st,
    values: Object.freeze({ ...values }),
    justification: just
  });
}

function validateHeuristicPolicy(p, knownKeySchemas) {
  if (!p || p.schema !== "EvidenceForge.HeuristicPolicy" || p.schemaVersion !== "EF-PR-GEN-v1") return false;
  if (!ALLOWED_STATUSES.includes(p.status)) return false;
  if (!p.values || typeof p.values !== "object") return false;
  if (knownKeySchemas && validateAgainstSchema(p.values, knownKeySchemas).length) return false;
  return true;
}

const EFPrGenHeuristicPolicy = { buildHeuristicPolicy, validateHeuristicPolicy, ALLOWED_STATUSES };

if (typeof module !== "undefined" && module.exports) module.exports = EFPrGenHeuristicPolicy;
if (typeof window !== "undefined") window.EFPrGenHeuristicPolicy = EFPrGenHeuristicPolicy;
