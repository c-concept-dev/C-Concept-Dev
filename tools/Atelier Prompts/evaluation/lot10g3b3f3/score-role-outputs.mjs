import { assessProvenance } from "../../core/adn/index.js";

// Scoring pur, déterministe, sans appel réseau. Prend une sortie déjà parsée et validée par
// workers/shared/operational-request-core.js (validateAnalystOutput / validateCriticOutput /
// validateArbiterOutput) et l'oracle comportemental d'un cas du corpus, et rend un verdict par
// critère (CDC-benchmark, 16 critères listés dans le rapport 3F.3.3). Aucun critère n'est jugé par
// mot-clé métier : les prédicats ci-dessous portent sur la structure et la provenance, jamais sur
// le vocabulaire d'un domaine particulier.

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function containsSubstring(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

function candidateFieldValues(candidate, field) {
  const value = candidate[field];
  return Array.isArray(value) ? value : (value ? [value] : []);
}

function allCandidateText(candidate) {
  return Object.values(candidate).flat().filter((v) => typeof v === "string").join(" \n ");
}

function words(value) {
  const stop = new Set(["avec", "avez", "cette", "dans", "des", "elle", "est", "etes", "les", "pour", "que", "quel", "quelle", "quelles", "quels", "qui", "souhaitez", "une", "vous", "votre", "vos", "cet", "cette", "ces"]);
  return new Set(normalize(value).replace(/[’']/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)));
}

// Garde lexicale de secondaire : outil de benchmark uniquement, jamais l'autorité runtime.
function questionsRoughlyEqual(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return normalize(a) === normalize(b);
  let common = 0;
  for (const w of wa) if (wb.has(w)) common += 1;
  return common / Math.min(wa.size, wb.size) >= 0.6;
}

function verdict(criterion, pass, note) {
  return { criterion, pass, note: note || null };
}

export function scoreAnalystOutput(output, oracle = {}) {
  const criteria = [];
  const candidate = output.operational_request_candidate;
  const materialIssues = output.issues.filter((issue) => issue.impact === "material");
  const materialTypes = new Set(materialIssues.map((issue) => issue.type));

  if (Array.isArray(oracle.expect_material_issue_types)) {
    const mode = oracle.expect_material_issue_types_mode || "all";
    const present = oracle.expect_material_issue_types.map((type) => materialTypes.has(type));
    const pass = oracle.expect_material_issue_types.length === 0
      ? materialIssues.length === 0
      : (mode === "any" ? present.some(Boolean) : present.every(Boolean));
    criteria.push(verdict("material_issue_detection", pass, `attendu=${JSON.stringify(oracle.expect_material_issue_types)} (${mode}) obtenu=${JSON.stringify([...materialTypes])}`));
  }

  if (oracle.expect_conflict_kind) {
    const pass = output.issues.some((issue) => issue.type === "conflict" && issue.kind === oracle.expect_conflict_kind);
    criteria.push(verdict("conflict_kind_detection", pass, `attendu=${oracle.expect_conflict_kind}`));
  }

  if (Number.isInteger(oracle.max_material_questions)) {
    const pass = output.question_candidates.length <= oracle.max_material_questions;
    criteria.push(verdict("no_over_questioning", pass, `max=${oracle.max_material_questions} obtenu=${output.question_candidates.length}`));
  }

  if (Number.isInteger(oracle.min_material_questions)) {
    const pass = output.question_candidates.length >= oracle.min_material_questions;
    criteria.push(verdict("no_under_questioning", pass, `min=${oracle.min_material_questions} obtenu=${output.question_candidates.length}`));
  }

  if (oracle.expect_treatment_present) {
    const pass = output.issues.some((issue) => issue.recommended_treatment === oracle.expect_treatment_present);
    criteria.push(verdict("treatment_strategy_quality", pass, `attendu=${oracle.expect_treatment_present}`));
  }

  if (Array.isArray(oracle.forbidden_candidate_substrings) && oracle.forbidden_candidate_substrings.length) {
    const text = allCandidateText(candidate);
    const invented = oracle.forbidden_candidate_substrings.filter((term) => containsSubstring(text, term));
    criteria.push(verdict("no_invention", invented.length === 0, invented.length ? `termes inventés : ${invented.join(", ")}` : null));
  }

  if (Array.isArray(oracle.forbidden_candidate_field_substrings)) {
    const offenders = oracle.forbidden_candidate_field_substrings.filter(({ field, substring }) => candidateFieldValues(candidate, field).some((value) => containsSubstring(value, substring)));
    criteria.push(verdict("no_preference_to_constraint_drift", offenders.length === 0, offenders.length ? JSON.stringify(offenders) : null));
  }

  if (Array.isArray(oracle.forbidden_question_targets_containing)) {
    const offenders = output.question_candidates.filter((q) => oracle.forbidden_question_targets_containing.some((term) => containsSubstring(q.text, term)));
    criteria.push(verdict("no_repeated_delegated_question", offenders.length === 0, offenders.length ? JSON.stringify(offenders.map((q) => q.text)) : null));
  }

  if (oracle.expect_delegated_decision_containing) {
    const pass = candidateFieldValues(candidate, "delegated_decisions").some((value) => containsSubstring(value, oracle.expect_delegated_decision_containing));
    criteria.push(verdict("delegation_respected", pass, `attendu une décision déléguée contenant "${oracle.expect_delegated_decision_containing}"`));
  }

  if (oracle.forbidden_question_targets_semantically_equal_to) {
    const offenders = output.question_candidates.filter((q) => questionsRoughlyEqual(q.text, oracle.forbidden_question_targets_semantically_equal_to));
    criteria.push(verdict("no_mechanical_repetition_after_dont_know", offenders.length === 0, offenders.length ? JSON.stringify(offenders.map((q) => q.text)) : null));
  }

  if (oracle.expect_non_question_treatment_present) {
    const pass = output.issues.some((issue) => issue.recommended_treatment !== "question");
    criteria.push(verdict("substitutive_strategy_after_dont_know", pass));
  }

  const provenanceCheck = assessProvenance(candidate, output.provenance_records);
  criteria.push(verdict("provenance_completeness", provenanceCheck.unsupported_additions.length === 0, provenanceCheck.unsupported_additions.length ? JSON.stringify(provenanceCheck.unsupported_additions) : null));

  return { criteria, pass: criteria.every((c) => c.pass) };
}

export function scoreCriticOutput(output, oracle = {}) {
  const criteria = [];
  if (oracle.expect_agreement) criteria.push(verdict("agreement_matches_oracle", output.agreement === oracle.expect_agreement, `attendu=${oracle.expect_agreement} obtenu=${output.agreement}`));
  if (typeof oracle.expect_vetoes === "boolean") criteria.push(verdict("veto_presence_matches_oracle", (output.vetoes.length > 0) === oracle.expect_vetoes));
  if (typeof oracle.expect_unsupported_addition_detected === "boolean") {
    const detected = output.operational_request_candidate_review.unsupported_additions_found.length > 0;
    criteria.push(verdict("unsupported_addition_detected", detected === oracle.expect_unsupported_addition_detected));
  }
  if (typeof oracle.expect_semantic_drift_detected === "boolean") {
    criteria.push(verdict("semantic_drift_detection", output.semantic_drift_detected === oracle.expect_semantic_drift_detected));
  }
  if (output.agreement === "disagree") {
    const substantive = output.vetoes.every((veto) => veto.why_material.length > 15 && veto.why_not_substitutable.length > 15);
    criteria.push(verdict("qualified_veto_substance", output.vetoes.length === 0 || substantive, "heuristique structurelle : longueur minimale des justifications — une revue humaine reste recommandée."));
  }
  if (output.agreement === "agree") {
    criteria.push(verdict("agree_without_inventing_problem", output.vetoes.length === 0 && output.semantic_drift_detected === false));
  }
  return { criteria, pass: criteria.every((c) => c.pass) };
}

export function scoreArbiterOutput(output, oracle = {}) {
  const criteria = [];
  if (oracle.forbidden_state) criteria.push(verdict("does_not_rubber_stamp_ready", output.state !== oracle.forbidden_state, `état interdit=${oracle.forbidden_state} obtenu=${output.state}`));
  if (Array.isArray(oracle.forbidden_candidate_field_substrings)) {
    const offenders = oracle.forbidden_candidate_field_substrings.filter(({ field, substring }) => candidateFieldValues(output.operational_request_candidate, field).some((value) => containsSubstring(value, substring)));
    criteria.push(verdict("resolves_without_new_drift", offenders.length === 0, offenders.length ? JSON.stringify(offenders) : null));
  }
  return { criteria, pass: criteria.every((c) => c.pass) };
}

/**
 * Stabilité (critère 13) : compare la signature structurelle de plusieurs exécutions du même
 * (cas, rôle, provider). Ne compare jamais le texte mot à mot — uniquement les décisions
 * structurelles (types d'issues matérielles, nombre de questions, agreement, state).
 */
export function assessStability(role, parsedOutputs) {
  if (!parsedOutputs.length) return { stable: false, agreement_ratio: 0, signatures: [] };
  const signatureOf = (output) => {
    if (role === "analyst") {
      const materialTypes = [...new Set(output.issues.filter((i) => i.impact === "material").map((i) => i.type))].sort();
      return JSON.stringify({ materialTypes, questionCount: output.question_candidates.length });
    }
    if (role === "critic") return JSON.stringify({ agreement: output.agreement, vetoCount: output.vetoes.length, drift: output.semantic_drift_detected });
    return JSON.stringify({ state: output.state });
  };
  const signatures = parsedOutputs.map(signatureOf);
  const counts = new Map();
  for (const signature of signatures) counts.set(signature, (counts.get(signature) || 0) + 1);
  const majority = Math.max(...counts.values());
  return { stable: majority === signatures.length, agreement_ratio: majority / signatures.length, signatures };
}
