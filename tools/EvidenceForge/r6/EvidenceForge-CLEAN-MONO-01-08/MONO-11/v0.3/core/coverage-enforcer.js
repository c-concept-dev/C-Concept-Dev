"use strict";
/**
 * MONO-11 v0.2 — core/coverage-enforcer.js   (mandat v0.2 §4 ; audit v0.1 F13 : 5 admis sans jumeau)
 *
 * ENFORCEMENT DES REFERENCES D'OEUVRES AVANT EF-02D3, EF-02D3 INCHANGE.
 *
 * EF-02D3 (MONO-01, gele) fournit le PROMPT (`buildCoveragePrompt`) et le VALIDATEUR FINAL
 * (`parseCoverageJudgment`, references exactes du corpus). Dans le run v0.1, 4/5 blocages
 * venaient de LIBELLES DE THEMES (topics) cites comme oeuvres, 1/5 d'un sous-titre entre
 * guillemets — refuses a raison, sans reprise.
 *
 * Ici, AVANT le validateur gele :
 *   - chaque `evidenceWorks[]` doit RESOUDRE dans le corpus du professionnel (titre exact ou DOI
 *     exact), et un libelle de theme n'est jamais une oeuvre : l'ensemble des topics du corpus
 *     est connu et une reference qui y correspond est refusee avec le code THEME_LABEL_AS_WORK ;
 *   - schema ferme : N dimensions, une fois chacune, level dans l'enumeration ;
 *   - reprise INFORMEE (erreurs structurees + liste des references admissibles + artefact fautif).
 *
 * Le jugement remis a `parseCoverageJudgment` gele est celui qui a passe la validation locale.
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const arr = (v) => (Array.isArray(v) ? v : []);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const DIM_KEYS = Object.freeze(["id", "level", "evidenceWorks", "rationale", "contradictionWithMissing"]);
const DEFAULT_MAX_PASSES = 3;

function extractJson(text) {
  const s = String(text == null ? "" : text).trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return { ok: false, error: "JSON introuvable" };
  try { return { ok: true, value: JSON.parse(s.slice(a, b + 1)) }; } catch (e) { return { ok: false, error: "JSON invalide : " + e.message }; }
}

/** References admissibles = titres et DOI EXACTS des oeuvres du corpus ; libelles de themes = interdits comme oeuvres. */
function admissibleRefs(corpus) {
  const works = arr(corpus && corpus.corpus && corpus.corpus.works);
  const refs = new Set(works.flatMap((w) => [w.title, w.doi]).filter(isStr));
  const topics = new Set(works.flatMap((w) => arr(w.topics).map((t) => t && (t.name || t.display_name))).filter(isStr));
  refs.forEach((r) => topics.delete(r)); // un titre qui coincide exactement avec un theme reste une oeuvre
  return { refs: refs, topics: topics, workRefs: works.map((w) => ({ workRef: w.workRef, title: w.title, doi: w.doi })) };
}

function validateCoverageCandidate(text, corpus, dimensionSet, frozenLevels) {
  const errors = [];
  const E = (code, detail, id) => errors.push({ code: code, detail: detail, dimensionId: id || null });
  const j = extractJson(text);
  if (!j.ok) { E("JSON_INVALID", j.error); return { ok: false, errors: errors }; }
  const d = j.value;
  if (!d || typeof d !== "object" || Array.isArray(d)) { E("ROOT_NOT_OBJECT", "objet attendu"); return { ok: false, errors: errors }; }
  Object.keys(d).filter((k) => ["professionalRef", "dimensions", "overallNote"].indexOf(k) === -1).forEach((k) => E("EXTRA_KEY", "cle racine non prevue : " + k));
  const dims = arr(dimensionSet && dimensionSet.dimensions).map((x) => x.id);
  if (!Array.isArray(d.dimensions)) { E("DIMENSIONS_MISSING", "dimensions[] absent"); return { ok: false, errors: errors }; }
  if (d.dimensions.length !== dims.length) E("CARDINALITY", d.dimensions.length + " dimensions, " + dims.length + " attendues");
  const { refs, topics } = admissibleRefs(corpus);
  const seen = new Set();
  d.dimensions.forEach(function (x, i) {
    if (!x || typeof x !== "object") { E("DIMENSION_NOT_OBJECT", "dimensions[" + i + "]"); return; }
    Object.keys(x).filter((k) => DIM_KEYS.indexOf(k) === -1).forEach((k) => E("EXTRA_KEY", "dimensions[" + i + "] cle non prevue : " + k, x.id));
    if (dims.indexOf(x.id) === -1) E("DIMENSION_UNKNOWN", "id inconnu : " + String(x.id), x.id);
    else if (seen.has(x.id)) E("DIMENSION_DUPLICATE", "id en double : " + x.id, x.id); else seen.add(x.id);
    if (arr(frozenLevels).indexOf(x.level) === -1) E("ENUM_LEVEL", "level invalide : " + String(x.level), x.id);
    if (!Array.isArray(x.evidenceWorks)) E("EVIDENCE_NOT_ARRAY", "evidenceWorks[] absent", x.id);
    else x.evidenceWorks.forEach(function (ref) {
      if (!isStr(ref)) { E("WORKREF_EMPTY", "reference vide", x.id); return; }
      if (topics.has(ref)) { E("THEME_LABEL_AS_WORK", "libelle de theme cite comme oeuvre : " + JSON.stringify(ref), x.id); return; }
      if (!refs.has(ref)) E("WORKREF_UNRESOLVED", "reference absente du corpus (titre ou DOI EXACT requis) : " + JSON.stringify(String(ref).slice(0, 120)), x.id);
    });
    if (x.level !== "absent" && x.level !== "not_determinable" && Array.isArray(x.evidenceWorks) && x.evidenceWorks.length === 0) E("LEVEL_WITHOUT_EVIDENCE", "level " + x.level + " sans evidenceWorks", x.id);
  });
  dims.forEach((id) => { if (!seen.has(id)) E("DIMENSION_MISSING", "dimension absente : " + id, id); });
  return { ok: errors.length === 0, errors: errors, parsed: d };
}

function enforcementPreamble(corpus, levels) {
  const a = admissibleRefs(corpus);
  return "\n\nCONTRAT DE FORME (verifie localement avant toute acceptation) :\n"
    + "- evidenceWorks : UNIQUEMENT des titres ou DOI copies EXACTEMENT depuis cette liste d'oeuvres du corpus : " + JSON.stringify(Array.from(a.refs)) + " ;\n"
    + "- un THEME (topic) n'est PAS une oeuvre : ne citez jamais un libelle de theme dans evidenceWorks ;\n"
    + "- level ∈ {" + arr(levels).join(", ") + "} ; strong/moderate/weak exigent au moins une oeuvre citee ; absent/not_determinable citent [] ;\n"
    + "- une entree par dimension, dans l'ordre, sans cle supplementaire.";
}

function informedRepairPrompt(previousText, errors, corpus, dimensionSet, levels, pass) {
  const a = admissibleRefs(corpus);
  return "REPRISE (passe " + pass + ") — votre evaluation de couverture a ete REFUSEE par la validation locale. Corrigez-la.\n\n"
    + "ERREURS :\n" + errors.map((e) => "- [" + e.code + "]" + (e.dimensionId ? " dimension " + e.dimensionId : "") + " : " + e.detail).join("\n") + "\n\n"
    + "REFERENCES ADMISSIBLES (titres/DOI exacts, seules valeurs acceptees dans evidenceWorks) : " + JSON.stringify(Array.from(a.refs)) + "\n"
    + "LIBELLES DE THEMES (INTERDITS comme oeuvres) : " + JSON.stringify(Array.from(a.topics).slice(0, 60)) + "\n"
    + "SCHEMA : {\"professionalRef\":..., \"dimensions\":[ " + arr(dimensionSet.dimensions).length + " objets {id, level, evidenceWorks, rationale, contradictionWithMissing}, ids dans l'ordre " + arr(dimensionSet.dimensions).map((d) => d.id).join(", ") + " ], \"overallNote\":...} ; level ∈ {" + arr(levels).join(", ") + "}.\n\n"
    + "VOTRE REPONSE PRECEDENTE (fautive) :\n" + String(previousText).slice(0, 40000) + "\n\nRetournez UNIQUEMENT le JSON valide.";
}

function enrichWithD2(coverageDims, record) {
  const byDim = new Map(arr(record.dimensionRelevance).map((j) => [j.dimensionId, j]));
  return coverageDims.map((x) => { const j = byDim.get(x.id); return Object.assign({}, x, { relevanceStatus: j ? j.relevanceStatus : "not_determinable", epistemicStatus: j ? j.epistemicStatus : "not_determinable" }); });
}

/**
 * runEnforcedCoverage({ frozen, record, corpus, dimensionSet, missionQuestion, llmCall, maxPasses, onValidation, runId })
 * -> { evaluation (forme EF-02D3 evaluateCoverageOne), trace }
 */
async function runEnforcedCoverage(input) {
  const F = input.frozen, D3 = F.M01.D3, levels = D3.LEVELS;
  const maxPasses = Number.isInteger(input.maxPasses) && input.maxPasses > 0 ? input.maxPasses : DEFAULT_MAX_PASSES;
  const basePrompt = D3.buildCoveragePrompt(input.record, input.corpus, input.dimensionSet, input.missionQuestion) + enforcementPreamble(input.corpus, levels);
  const passes = []; let text = null, errors = null, accepted = null;
  for (let p = 1; p <= maxPasses; p++) {
    const prompt = p === 1 ? basePrompt : informedRepairPrompt(text, errors, input.corpus, input.dimensionSet, levels, p);
    const meta = { purpose: p === 1 ? "EF-02D3 coverage" : "EF-02D3 coverage informed-retry", pass: p, candidateRef: input.record.professionalRef, runId: input.runId || null };
    let r;
    try { r = await input.llmCall(prompt, meta); }
    catch (e) {
      /* une indisponibilite FATALE du fournisseur (credit epuise, transport hors service) remonte : fail-closed du run, jamais une passe consommee */
      if (e && e.fatal === true) throw e;
      passes.push({ pass: p, promptSha256: sha(prompt), error: "LLM_CALL_FAILED: " + String(e.message) }); errors = [{ code: "LLM_CALL_FAILED", detail: String(e.message) }]; text = ""; continue;
    }
    text = typeof r === "string" ? r : (r && r.text) || "";
    const v = validateCoverageCandidate(text, input.corpus, input.dimensionSet, levels);
    const rec = { pass: p, informed: p > 1, promptSha256: sha(prompt), responseSha256: sha(text), callId: r && (r.callId || r.providerRequestId || r.localRequestId) || null, valid: v.ok, errors: v.errors.slice(0, 20), errorCodes: Array.from(new Set(v.errors.map((e) => e.code))) };
    passes.push(rec);
    if (typeof input.onValidation === "function") { try { input.onValidation({ callId: rec.callId, promptSha256: rec.promptSha256, responseSha256: rec.responseSha256, valid: v.ok, errors: rec.errorCodes, stage: "EF-02D3-local" }); } catch (e) { /* observabilite */ } }
    errors = v.errors;
    if (v.ok) { accepted = p; break; }
  }
  if (accepted === null) return { evaluation: { professionalRef: input.record.professionalRef, dimensions: [], overallNote: "", error: "validation locale refusee apres " + passes.length + " passe(s) : " + (errors || []).slice(0, 3).map((e) => e.code + " " + e.detail).join(" ; "), enforcement: { passes: passes.length, acceptedPass: null } }, trace: { passes: passes, acceptedPass: null } };
  try {
    const d = D3.parseCoverageJudgment(text, input.dimensionSet, input.record.professionalRef, input.corpus);   // VALIDATEUR GELE
    return { evaluation: { professionalRef: d.professionalRef, dimensions: enrichWithD2(d.dimensions, input.record), overallNote: d.overallNote || "", jsonRepairUsed: false, error: null, enforcement: { passes: passes.length, acceptedPass: accepted, validatedBy: "EF-02D3 parseCoverageJudgment (gele)" } }, trace: { passes: passes, acceptedPass: accepted } };
  } catch (e) {
    return { evaluation: { professionalRef: input.record.professionalRef, dimensions: [], overallNote: "", error: "EF-02D3: " + String(e.message), enforcement: { passes: passes.length, acceptedPass: accepted, frozenValidatorRefused: true } }, trace: { passes: passes, acceptedPass: accepted, frozenValidatorRefused: String(e.message) } };
  }
}

/** buildEnforcedCoverageMatrix — meme forme que EF-02D3 `buildCoverageMatrix` (EF-02D3-v4). */
async function buildEnforcedCoverageMatrix(input) {
  const evaluations = [], traces = [];
  for (const record of arr(input.usableRecords)) {
    const r = await runEnforcedCoverage({ frozen: input.frozen, record: record, corpus: input.corpusByRef.get(record.professionalRef), dimensionSet: input.dimensionSet, missionQuestion: input.missionQuestion,
      llmCall: input.llmCall, maxPasses: input.maxPasses, onValidation: input.onValidation, runId: input.runId });
    evaluations.push(r.evaluation); traces.push(Object.assign({ professionalRef: record.professionalRef }, r.trace));
  }
  return { coverageMatrix: { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4", missionQuestion: input.missionQuestion || null, dimensions: input.dimensionSet.dimensions, evaluations: evaluations,
    generatedAt: new Date().toISOString(), testMode: true, scientificValidity: false, producedBy: "MONO-11 v0.2 coverage-enforcer : prompt EF-02D3 gele + validation locale des references + reprise informee + validateur EF-02D3 gele" }, traces: traces };
}

module.exports = { validateCoverageCandidate, admissibleRefs, runEnforcedCoverage, buildEnforcedCoverageMatrix, enforcementPreamble, informedRepairPrompt, DEFAULT_MAX_PASSES };
