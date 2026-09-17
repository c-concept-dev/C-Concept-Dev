"use strict";
/**
 * MONO-11 v0.2 — core/review-enforcer.js   (mandat v0.2 §3, §5 ; audit v0.1 : revue 2 SCHEMA_DRIFT, reparation aveugle)
 *
 * ENFORCEMENT DU SCHEMA AVANT EF-03B, EF-03B INCHANGE.
 *
 * EF-03B (MONO-01, gele) fournit le PROMPT (`buildReviewPrompt`) et le VALIDATEUR FINAL
 * (`parseReviewResponse`, octet-exact, anti-fabrication). Ce qu'il ne fait pas, et que ce
 * module ajoute EN AMONT :
 *   - validation LOCALE a schema ferme : exactement N findings (N = dimensions), chaque
 *     dimensionId une seule fois et dans l'ordre, aucune cle supplementaire, enumerations,
 *     cardinalites, citations litterales dans le document cible (normalise a l'ingestion),
 *     references d'oeuvres du jumeau connues ;
 *   - REPRISE INFORMEE : toute passe >= 2 recoit les erreurs structurees de la passe
 *     precedente, l'artefact fautif, le document cible, le schema attendu et les contraintes
 *     de citation/cardinalite. Aucun retry aveugle.
 *   - un compte-rendu de validation par reponse (pour la politique de reuse de l'exploitant).
 *
 * Le texte remis a `parseReviewResponse` gele est celui qui a passe la validation locale ;
 * si le validateur gele refuse malgre tout, la revue est en erreur — jamais forcee.
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const arr = (v) => (Array.isArray(v) ? v : []);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

const FINDING_KEYS = Object.freeze(["dimensionId", "disposition", "epistemicStatus", "finding", "rationale", "targetEvidenceRefs", "twinBasisWorkRefs", "confidenceQualitative", "limitations"]);
const DISPOSITIONS = Object.freeze(["support", "concern", "gap", "recommendation", "not_determinable"]);
const EPISTEMIC = Object.freeze(["documented", "cautious_inference", "not_determinable"]);
const CONFIDENCE = Object.freeze(["high", "medium", "low"]);
const DEFAULT_MAX_PASSES = 3;

function extractJson(text) {
  const s = String(text == null ? "" : text).trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return { ok: false, error: "JSON introuvable" };
  try { return { ok: true, value: JSON.parse(s.slice(a, b + 1)) }; } catch (e) { return { ok: false, error: "JSON invalide : " + e.message }; }
}

/** Validation LOCALE a schema ferme. Rend { ok, errors: [{code, dimensionId?, detail}] }. */
function validateReviewCandidate(text, twin, targetDoc, reviewSchema) {
  const errors = [];
  const E = (code, detail, dimensionId) => errors.push({ code: code, detail: detail, dimensionId: dimensionId || null });
  const j = extractJson(text);
  if (!j.ok) { E("JSON_INVALID", j.error); return { ok: false, errors: errors }; }
  const d = j.value;
  const topKeys = Object.keys(d || {});
  if (!d || typeof d !== "object" || Array.isArray(d)) { E("ROOT_NOT_OBJECT", "objet attendu"); return { ok: false, errors: errors }; }
  topKeys.filter((k) => k !== "findings").forEach((k) => E("EXTRA_KEY", "cle racine non prevue : " + k));
  const dims = arr(reviewSchema && reviewSchema.dimensions).map((x) => x.id);
  if (!Array.isArray(d.findings)) { E("FINDINGS_MISSING", "findings[] absent"); return { ok: false, errors: errors }; }
  if (d.findings.length !== dims.length) E("CARDINALITY", d.findings.length + " findings, " + dims.length + " attendus (un par dimension)");
  const seen = new Map();
  const known = new Set(arr(twin && twin.documentaryBasis && twin.documentaryBasis.worksUsed).map((w) => w.workRef));
  const content = targetDoc && typeof targetDoc.content === "string" ? targetDoc.content : "";
  d.findings.forEach(function (f, i) {
    if (!f || typeof f !== "object" || Array.isArray(f)) { E("FINDING_NOT_OBJECT", "findings[" + i + "]"); return; }
    Object.keys(f).filter((k) => FINDING_KEYS.indexOf(k) === -1).forEach((k) => E("EXTRA_KEY", "findings[" + i + "] cle non prevue : " + k, f.dimensionId));
    FINDING_KEYS.forEach((k) => { if (!(k in f)) E("MISSING_KEY", "findings[" + i + "] cle absente : " + k, f.dimensionId); });
    if (dims.indexOf(f.dimensionId) === -1) E("DIMENSION_UNKNOWN", "findings[" + i + "] dimensionId inconnu : " + String(f.dimensionId), f.dimensionId);
    else if (seen.has(f.dimensionId)) E("DIMENSION_DUPLICATE", "dimensionId en double : " + f.dimensionId + " (findings[" + seen.get(f.dimensionId) + "] et [" + i + "])", f.dimensionId);
    else seen.set(f.dimensionId, i);
    if (dims.indexOf(f.dimensionId) !== -1 && dims[i] !== undefined && f.dimensionId !== dims[i]) E("DIMENSION_ORDER", "findings[" + i + "] : " + f.dimensionId + ", attendu " + dims[i] + " (ordre du schema)", f.dimensionId);
    if (DISPOSITIONS.indexOf(f.disposition) === -1) E("ENUM_DISPOSITION", "disposition invalide : " + String(f.disposition) + " (attendu : " + DISPOSITIONS.join("|") + ")", f.dimensionId);
    if (EPISTEMIC.indexOf(f.epistemicStatus) === -1) E("ENUM_EPISTEMIC", "epistemicStatus invalide : " + String(f.epistemicStatus), f.dimensionId);
    if (CONFIDENCE.indexOf(f.confidenceQualitative) === -1) E("ENUM_CONFIDENCE", "confidenceQualitative invalide : " + String(f.confidenceQualitative), f.dimensionId);
    if (!isStr(f.finding)) E("FINDING_EMPTY", "finding vide", f.dimensionId);
    if (typeof f.rationale !== "string") E("RATIONALE_MISSING", "rationale absente", f.dimensionId);
    if (!Array.isArray(f.targetEvidenceRefs)) E("TARGET_REFS_NOT_ARRAY", "targetEvidenceRefs[] absent", f.dimensionId);
    else f.targetEvidenceRefs.forEach((ref) => { if (!isStr(ref) || content.indexOf(ref) === -1) E("TARGET_REF_NOT_LITERAL", "citation absente du document cible (doit etre un passage EXACT, caractere pour caractere) : " + JSON.stringify(String(ref).slice(0, 160)), f.dimensionId); });
    if (!Array.isArray(f.twinBasisWorkRefs)) E("TWIN_REFS_NOT_ARRAY", "twinBasisWorkRefs[] absent", f.dimensionId);
    else f.twinBasisWorkRefs.forEach((ref) => { if (!known.has(ref)) E("TWIN_REF_UNKNOWN", "reference absente de worksUsed du jumeau : " + JSON.stringify(String(ref).slice(0, 120)), f.dimensionId); });
    if (!Array.isArray(f.limitations)) E("LIMITATIONS_NOT_ARRAY", "limitations[] absent", f.dimensionId);
    if (f.epistemicStatus === "documented" && (!Array.isArray(f.twinBasisWorkRefs) || f.twinBasisWorkRefs.length === 0)) E("DOCUMENTED_WITHOUT_TWIN_REF", "documented exige au moins un twinBasisWorkRef", f.dimensionId);
  });
  dims.forEach((id) => { if (!seen.has(id)) E("DIMENSION_MISSING", "aucun finding pour la dimension " + id, id); });
  return { ok: errors.length === 0, errors: errors, parsed: d };
}

/** Rappel de contrat AJOUTE au prompt gele (premiere passe) : n'introduit aucun domaine. */
function enforcementPreamble(reviewSchema) {
  const dims = arr(reviewSchema.dimensions).map((d) => d.id);
  return "\n\nCONTRAT DE FORME (verifie localement avant toute acceptation) :\n"
    + "- exactement " + dims.length + " findings, UN par dimension, dans cet ordre : " + dims.join(", ") + " ; aucune dimension en double, aucune omise ;\n"
    + "- aucune cle autre que : " + FINDING_KEYS.join(", ") + " ; racine = {\"findings\":[...]} sans autre cle ;\n"
    + "- disposition ∈ {" + DISPOSITIONS.join(", ") + "} ; epistemicStatus ∈ {" + EPISTEMIC.join(", ") + "} ; confidenceQualitative ∈ {" + CONFIDENCE.join(", ") + "} ;\n"
    + "- targetEvidenceRefs : copie EXACTE, caractere pour caractere (apostrophes et guillemets tels qu'ils apparaissent ci-dessus), d'un passage du document cible ; sinon [] ;\n"
    + "- twinBasisWorkRefs : uniquement des workRef EXACTS de worksUsed ; sinon [] (et alors epistemicStatus ≠ documented).";
}

/** Prompt de REPRISE INFORMEE : erreurs structurees + artefact fautif + document cible + schema + contraintes. */
function informedRepairPrompt(previousText, errors, twin, targetDoc, reviewSchema, pass) {
  const dims = arr(reviewSchema.dimensions).map((d) => d.id);
  return "REPRISE (passe " + pass + ") — votre reponse precedente a ete REFUSEE par la validation locale. Corrigez-la en respectant le contrat ci-dessous. Ne changez que ce qui est necessaire ; conservez les constats deja valides.\n\n"
    + "ERREURS DE VALIDATION (structurees) :\n" + errors.map((e) => "- [" + e.code + "]" + (e.dimensionId ? " dimension " + e.dimensionId : "") + " : " + e.detail).join("\n") + "\n\n"
    + "SCHEMA ATTENDU : {\"findings\":[ " + dims.length + " objets, un par dimension, dans l'ordre " + dims.join(", ") + " ]} ; cles d'un finding : " + FINDING_KEYS.join(", ") + " ; disposition ∈ {" + DISPOSITIONS.join(", ") + "} ; epistemicStatus ∈ {" + EPISTEMIC.join(", ") + "} ; confidenceQualitative ∈ {" + CONFIDENCE.join(", ") + "}.\n\n"
    + "CONTRAINTES DE CITATION : targetEvidenceRefs = passages copies EXACTEMENT (caractere pour caractere, apostrophes/guillemets tels quels) du DOCUMENT CIBLE ci-dessous ; twinBasisWorkRefs = uniquement les workRef listes dans WORKS_USED ci-dessous.\n\n"
    + "DOCUMENT CIBLE (targetId=" + JSON.stringify(targetDoc.targetId) + ") :\n" + (targetDoc.content || "(document vide)") + "\n\n"
    + "WORKS_USED (workRef exacts) : " + JSON.stringify(arr(twin.documentaryBasis && twin.documentaryBasis.worksUsed).map((w) => w.workRef)) + "\n\n"
    + "VOTRE REPONSE PRECEDENTE (fautive) :\n" + String(previousText).slice(0, 60000) + "\n\n"
    + "Retournez UNIQUEMENT le JSON valide.";
}

/**
 * runEnforcedReview({ frozen, twin, targetDoc, reviewSchema, llmCall, maxPasses, onValidation })
 * -> { review (forme EF-03B), trace: { passes: [...], acceptedPass } }
 * `llmCall(prompt, meta)` doit rendre { text, ... } ; `onValidation({ callId?, responseSha256, valid, errors })` est notifie a chaque passe.
 */
async function runEnforcedReview(input) {
  input = input || {};
  const F = input.frozen, twin = input.twin, doc = input.targetDoc, schema = input.reviewSchema;
  if (!F || typeof input.llmCall !== "function") throw Object.assign(new Error("ENFORCER_INPUT_INVALID"), { code: "ENFORCER_INPUT_INVALID" });
  const maxPasses = Number.isInteger(input.maxPasses) && input.maxPasses > 0 ? input.maxPasses : DEFAULT_MAX_PASSES;
  const basePrompt = F.M01.RR.buildReviewPrompt(twin, doc, schema) + enforcementPreamble(schema);
  const passes = [];
  let text = null, errors = null, accepted = null;
  for (let p = 1; p <= maxPasses; p++) {
    const prompt = p === 1 ? basePrompt : informedRepairPrompt(text, errors, twin, doc, schema, p);
    const meta = { purpose: p === 1 ? "EF-03B review" : "EF-03B review informed-retry", pass: p, twinId: twin.twinId, targetId: doc.targetId, runId: input.runId || null };
    let r;
    try { r = await input.llmCall(prompt, meta); }
    catch (e) {
      /* une indisponibilite FATALE du fournisseur (credit epuise, transport hors service) remonte : fail-closed du run, jamais une passe consommee */
      if (e && e.fatal === true) throw e;
      passes.push({ pass: p, promptSha256: sha(prompt), error: "LLM_CALL_FAILED: " + String(e.message) }); errors = [{ code: "LLM_CALL_FAILED", detail: String(e.message) }]; text = ""; continue;
    }
    text = typeof r === "string" ? r : (r && r.text) || "";
    const v = validateReviewCandidate(text, twin, doc, schema);
    const rec = { pass: p, informed: p > 1, promptSha256: sha(prompt), responseSha256: sha(text), callId: r && (r.callId || r.providerRequestId || r.localRequestId) || null,
      valid: v.ok, errors: v.errors.slice(0, 20), errorCodes: Array.from(new Set(v.errors.map((e) => e.code))) };
    passes.push(rec);
    if (typeof input.onValidation === "function") { try { input.onValidation({ callId: rec.callId, promptSha256: rec.promptSha256, responseSha256: rec.responseSha256, valid: v.ok, errors: rec.errorCodes, stage: "EF-03B-local" }); } catch (e) { /* observabilite seule */ } }
    errors = v.errors;
    if (v.ok) { accepted = p; break; }
  }
  const base = { twinId: twin.twinId, professionalRef: twin.professionalRef, targetId: doc.targetId };
  if (accepted === null) {
    return { review: Object.assign(base, { reviewStatus: "error", findings: [], error: "validation locale refusee apres " + passes.length + " passe(s) : " + (errors || []).slice(0, 3).map((e) => e.code + " " + e.detail).join(" ; "), enforcement: { passes: passes.length, acceptedPass: null } }), trace: { passes: passes, acceptedPass: null } };
  }
  /* VALIDATEUR GELE, inchange : c'est lui qui accepte, jamais ce module. */
  try {
    const findings = F.M01.RR.parseReviewResponse(text, twin, doc, schema);
    return { review: Object.assign(base, { reviewStatus: "complete", findings: findings, error: null, enforcement: { passes: passes.length, acceptedPass: accepted, validatedBy: "EF-03B parseReviewResponse (gele)" } }), trace: { passes: passes, acceptedPass: accepted } };
  } catch (e) {
    return { review: Object.assign(base, { reviewStatus: "error", findings: [], error: "EF-03B: " + String(e.message), enforcement: { passes: passes.length, acceptedPass: accepted, frozenValidatorRefused: true } }), trace: { passes: passes, acceptedPass: accepted, frozenValidatorRefused: String(e.message) } };
  }
}

/**
 * buildEnforcedReviewSet({ frozen, reviewSchema, twinSet, targetDocumentSet, llmCall, maxPasses, onValidation, runId })
 * Meme forme que EF-03B `buildDocumentaryReviewSet` (schemaVersion EF-03B-v1, consommee par EF-03C gele),
 * produite par composition : prompt gele + enforcement local + validateur gele.
 */
async function buildEnforcedReviewSet(input) {
  const F = input.frozen;
  const schema = input.reviewSchema, twinSet = input.twinSet, tds = input.targetDocumentSet;
  if (!schema || schema.schema !== "EvidenceForge.ReviewSchema") throw Object.assign(new Error("REVIEW_SCHEMA_REQUIRED"), { code: "REVIEW_SCHEMA_REQUIRED" });
  if (!twinSet || !Array.isArray(twinSet.twins)) throw Object.assign(new Error("TWIN_SET_REQUIRED"), { code: "TWIN_SET_REQUIRED" });
  const activeTwins = twinSet.twins.filter((t) => !t.retracted);
  const reviews = [], traces = [], unresolvedTargets = [];
  for (const target of arr(schema.reviewTargets)) {
    const doc = F.M01.TDS.getDocumentForTarget(tds, target.targetId);
    if (!doc) { unresolvedTargets.push(target.targetId); continue; }
    for (const twin of activeTwins) {
      const r = await runEnforcedReview({ frozen: F, twin: twin, targetDoc: doc, reviewSchema: schema, llmCall: input.llmCall, maxPasses: input.maxPasses, onValidation: input.onValidation, runId: input.runId });
      reviews.push(r.review); traces.push(Object.assign({ twinId: twin.twinId, targetId: doc.targetId }, r.trace));
    }
  }
  const expected = activeTwins.length * (arr(schema.reviewTargets).length - unresolvedTargets.length);
  const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
  return {
    reviewSet: { schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1", missionId: twinSet.missionId || null, reviewSchemaHash: schema.schemaHash,
      reviews: reviews, unresolvedTargets: unresolvedTargets,
      summary: { twins: activeTwins.length, targets: arr(schema.reviewTargets).length, reviewsExpected: expected, reviewsComplete: complete, reviewsError: reviews.length - complete,
        unresolvedTargets: unresolvedTargets.length, testMode: true, scientificValidity: false, humanProfessionalValidation: false },
      producedBy: "MONO-11 v0.2 review-enforcer : prompt EF-03B gele + validation locale a schema ferme + reprise informee + validateur EF-03B gele", testMode: true },
    traces: traces,
  };
}

module.exports = { validateReviewCandidate, runEnforcedReview, buildEnforcedReviewSet, enforcementPreamble, informedRepairPrompt, extractJson, FINDING_KEYS, DISPOSITIONS, EPISTEMIC, CONFIDENCE, DEFAULT_MAX_PASSES };
