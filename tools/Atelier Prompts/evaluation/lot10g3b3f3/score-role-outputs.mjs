import { assessProvenance, assessIntentPreservationDeterministic } from "../../core/adn/index.js";
import { TREATMENT_VALUES } from "../../workers/shared/operational-request-core.js";

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

function verdict(criterion, pass, note, dimension) {
  return { criterion, pass, note: note || null, dimension: dimension || null };
}

/**
 * Détection structurelle (jamais sémantique) d'une question composée : plus d'un point
 * d'interrogation, ou une conjonction de coordination reliant deux fragments interrogatifs.
 * Généralisable à tout domaine — ne cite aucun mot-clé métier.
 */
function isCompoundQuestion(text) {
  const value = String(text || "");
  if ((value.match(/\?/g) || []).length > 1) return true;
  const normalized = normalize(value);
  return /\b(?:et|ainsi que)\s+(?:quel(?:le)?s?|qui|quand|ou|comment|combien|pourquoi)\b/.test(normalized);
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
    // Accepte soit une valeur unique, soit un tableau de valeurs sémantiquement acceptables : la
    // frontière conflict/logical_contradiction vs conflict/constraint_tension peut être fine sur un
    // cas réel (3F.3.3-C, D2) — le test ne doit pas pénaliser une classification alternative
    // également défendable selon la taxonomie partagée des 3 rôles.
    const acceptedKinds = Array.isArray(oracle.expect_conflict_kind) ? oracle.expect_conflict_kind : [oracle.expect_conflict_kind];
    const pass = output.issues.some((issue) => issue.type === "conflict" && acceptedKinds.includes(issue.kind));
    criteria.push(verdict("conflict_kind_detection", pass, `attendu l'un de ${JSON.stringify(acceptedKinds)}`));
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

  if (oracle.forbidden_research_containing) {
    // D4 : une décision déléguée ne doit pas non plus redevenir une recherche externe (elle
    // appartient à l'utilisateur, elle n'est pas un fait vérifiable dans le monde).
    const pass = !candidateFieldValues(candidate, "external_facts_to_research").some((value) => containsSubstring(value, oracle.forbidden_research_containing));
    criteria.push(verdict("delegation_not_turned_into_research", pass, pass ? null : `"${oracle.forbidden_research_containing}" trouvé dans external_facts_to_research.`));
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

  // Critères toujours actifs (3F.3.3-C, D1) : reflètent l'ADN du moteur (inflation mécanique de
  // questions, questions composées) de façon générale, jamais l'apprentissage d'un cas particulier du
  // corpus — appliqués à tous les cas, sans aucun plafond numérique de questions.
  const mechanicallyQuestioned = output.question_candidates.filter((q) => {
    const issue = output.issues.find((candidateIssue) => candidateIssue.id === q.targets_issue_id);
    return issue?.substitutable === true;
  });
  criteria.push(verdict(
    "no_mechanical_question_per_substitutable_issue",
    mechanicallyQuestioned.length === 0,
    mechanicallyQuestioned.length ? `issue(s) marquée(s) substitutable=true mais tout de même transformée(s) en question : ${JSON.stringify(mechanicallyQuestioned.map((q) => q.targets_issue_id))}` : null
  ));

  const compoundQuestions = output.question_candidates.filter((q) => isCompoundQuestion(q.text));
  criteria.push(verdict(
    "no_compound_question",
    compoundQuestions.length === 0,
    compoundQuestions.length ? `question(s) coordonnant plusieurs demandes : ${JSON.stringify(compoundQuestions.map((q) => q.text))}` : null
  ));

  // 3F.3.3-C5 (réouverture post-smoke Groq réel) : les lots C1-C4 ont bâti "no_question_inflation_
  // without_ladder_evidence" sur une hypothèse sémantique jamais vérifiée empiriquement — que
  // remaining_unknowns représenterait spécifiquement les inconnues traitées par "leave_unknown". Le
  // premier smoke Groq réel post-C4 invalide cette hypothèse : sur les 15 cas, remaining_unknowns
  // contient systématiquement les MÊMES inconnues que celles portant recommended_treatment="question"
  // (case-02, 03, 07, 09, 12, 14) ET AUSSI celles portant recommended_treatment="research" (case-06 :
  // 4 issues "research", 0 leave_unknown, 0 question_candidate, et pourtant remaining_unknowns liste
  // les 4 mêmes inconnues) — et case-14 montre même une seule issue mappée à 3 entrées
  // remaining_unknowns (granularité différente, donc aucune relation de cardinalité 1:1 ou N:1 ne
  // peut exister). Aucune trace, ni dans le prompt Analyste ni dans CANDIDATE_JSON_SCHEMA (simple
  // {type:"array", items:{type:"string"}}, sans description), ne restreint remaining_unknowns à
  // "leave_unknown" : le champ n'est décrit NULLE PART dans le contrat (une seule occurrence dans
  // tout le dépôt production : le nom de champ dans CANDIDATE_LIST_FIELDS). remaining_unknowns
  // signifie donc, empiriquement et contractuellement, "toute inconnue encore ouverte à ce stade",
  // quel que soit son traitement — jamais un proxy exclusif de "leave_unknown". Il est par conséquent
  // définitivement retiré de ce critère : ni comme preuve d'existence (C3), ni comme cardinalité (C4).
  //
  // Signal retenu, recentré sur ce que B-01 a toujours cherché à empêcher (cf. CDC : "empêcher une
  // inflation de questions lorsqu'une inconnue dispose déjà d'un traitement substitutif légitime") et
  // sur la SEULE relation structurelle fiable et vérifiée du contrat : question_candidate.
  // targets_issue_id -> issue.id (posée et imposée par validateAnalystOutput). Deux contradictions
  // purement structurelles, sans aucune comparaison de texte :
  //   (a) une question_candidate cible une issue dont recommended_treatment n'est PAS "question" —
  //       l'Analyste a lui-même déclaré un traitement substitutif pour cette issue, puis l'a quand
  //       même transformée en question : contradiction interne, jamais un traitement alternatif.
  //   (b) plusieurs question_candidates distincts ciblent le MÊME issue.id — la même issue,
  //       identifiée une seule fois, redemandée plusieurs fois : duplication structurelle réelle,
  //       établie par égalité d'identifiant, jamais par ressemblance de texte.
  // Plusieurs issues matérielles, toutes légitimement "question", chacune ciblée UNE seule fois par
  // un question_candidate distinct, ne déclenchent jamais ce critère — quel que soit leur nombre.
  const questionsByTargetIssue = new Map();
  for (const q of output.question_candidates) {
    questionsByTargetIssue.set(q.targets_issue_id, (questionsByTargetIssue.get(q.targets_issue_id) || 0) + 1);
  }
  const issueById = new Map(output.issues.map((issue) => [issue.id, issue]));
  const questionedDespiteRealTreatment = [...questionsByTargetIssue.keys()].filter((issueId) => issueById.get(issueId)?.recommended_treatment !== "question");
  const sameIssueQuestionedTwice = [...questionsByTargetIssue.entries()].filter(([, count]) => count > 1).map(([issueId]) => issueId);
  const structuralInflation = questionedDespiteRealTreatment.length > 0 || sameIssueQuestionedTwice.length > 0;
  const inflationNotes = [
    questionedDespiteRealTreatment.length ? `issue(s) questionnée(s) malgré un traitement substitutif déjà déclaré : ${JSON.stringify(questionedDespiteRealTreatment)}` : null,
    sameIssueQuestionedTwice.length ? `issue(s) ciblée(s) par plusieurs question_candidates distincts : ${JSON.stringify(sameIssueQuestionedTwice)}` : null
  ].filter(Boolean);
  criteria.push(verdict(
    "no_question_inflation_without_ladder_evidence",
    !structuralInflation,
    inflationNotes.length ? inflationNotes.join(" ; ") : null
  ));

  return { criteria, pass: criteria.every((c) => c.pass) };
}

// 3F.3.3-C (mission de suivi), B3 : chaque critère Critic porte désormais une dimension explicite
// (detection / escalade / verdict / drift / veto) pour permettre un diagnostic séparé sans refondre
// la structure plate existante (criteria[]) ni les consommateurs qui ne lisent que criterion/pass.
export function scoreCriticOutput(output, oracle = {}, context = {}) {
  const criteria = [];
  if (oracle.expect_agreement) criteria.push(verdict("agreement_matches_oracle", output.agreement === oracle.expect_agreement, `attendu=${oracle.expect_agreement} obtenu=${output.agreement}`, "verdict"));
  if (typeof oracle.expect_vetoes === "boolean") criteria.push(verdict("veto_presence_matches_oracle", (output.vetoes.length > 0) === oracle.expect_vetoes, null, "veto"));
  if (typeof oracle.expect_unsupported_addition_detected === "boolean") {
    const detected = output.operational_request_candidate_review.unsupported_additions_found.length > 0;
    criteria.push(verdict("unsupported_addition_detected", detected === oracle.expect_unsupported_addition_detected, null, "detection"));
  }
  if (typeof oracle.expect_semantic_drift_detected === "boolean") {
    criteria.push(verdict("semantic_drift_detection", output.semantic_drift_detected === oracle.expect_semantic_drift_detected, null, "drift"));
  }
  if (output.agreement === "disagree") {
    const substantive = output.vetoes.every((veto) => veto.why_material.length > 15 && veto.why_not_substitutable.length > 15);
    criteria.push(verdict("qualified_veto_substance", output.vetoes.length === 0 || substantive, "heuristique structurelle : longueur minimale des justifications — une revue humaine reste recommandée.", "escalade"));
  }
  // 3F.3.3-C, A3 : pas de critère "agree_without_inventing_problem" ici — validateCriticOutput
  // (B1) impose déjà vetoes=[] et semantic_drift_detected=false pour tout agreement="agree" ; sur
  // une sortie déjà validée, une telle condition est mathématiquement impossible à échouer et ne
  // ferait que gonfler artificiellement le taux de réussite sans rien mesurer de réel.

  // 3F.3.3-C8, B-01B : vérification purement structurelle de illegitimate_question_found — jamais
  // un jugement sur la pertinence de l'alternative proposée (cela appartient exclusivement au LLM
  // Critic). N'ajoute aucun critère quand le tableau est vide : un agree légitime sans rien à
  // signaler ne doit jamais gagner de critères tautologiques (même principe que ci-dessus).
  if (output.illegitimate_question_found.length > 0) {
    if (context.analyst_output) {
      const analystIssueById = new Map(context.analyst_output.issues.map((issue) => [issue.id, issue]));
      const unknownIssueIds = output.illegitimate_question_found.filter((finding) => !analystIssueById.has(finding.issue_id));
      criteria.push(verdict(
        "illegitimate_question_issue_reference_valid",
        unknownIssueIds.length === 0,
        unknownIssueIds.length ? `issue_id sans correspondance dans analyst_output.issues : ${JSON.stringify(unknownIssueIds.map((f) => f.issue_id))}` : null,
        "detection"
      ));
      const wrongTreatment = output.illegitimate_question_found.filter((finding) => {
        const issue = analystIssueById.get(finding.issue_id);
        return issue && issue.recommended_treatment !== "question";
      });
      criteria.push(verdict(
        "illegitimate_question_targets_question_treatment",
        wrongTreatment.length === 0,
        wrongTreatment.length ? `issue(s) référencée(s) sans recommended_treatment="question" : ${JSON.stringify(wrongTreatment.map((f) => f.issue_id))}` : null,
        "detection"
      ));
    }
    const invalidAlternative = output.illegitimate_question_found.filter((finding) => finding.available_alternative === "question" || !TREATMENT_VALUES.includes(finding.available_alternative));
    criteria.push(verdict(
      "illegitimate_question_alternative_valid",
      invalidAlternative.length === 0,
      invalidAlternative.length ? `available_alternative invalide : ${JSON.stringify(invalidAlternative.map((f) => f.available_alternative))}` : null,
      "detection"
    ));
    const missingJustification = output.illegitimate_question_found.filter((finding) => !finding.why_available);
    criteria.push(verdict(
      "illegitimate_question_justification_present",
      missingJustification.length === 0,
      missingJustification.length ? `why_available manquant pour : ${JSON.stringify(missingJustification.map((f) => f.issue_id))}` : null,
      "detection"
    ));
  }
  return { criteria, pass: criteria.every((c) => c.pass) };
}

/**
 * 3F.3.3-C1, B-02 : le gate déterministe (CDC §14.1, assessIntentPreservationDeterministic) était
 * correctement testé en isolation (tests/intent-preservation.test.mjs) mais jamais réellement
 * branché sur le scoring Arbiter — un candidat final invalide au sens du gate (invention de champ,
 * suppression importante non tracée, provenance insuffisante) pouvait donc obtenir un score Arbiter
 * "pass" sans que ce défaut structurel soit jamais signalé. `context` est optionnel et rétrocompatible :
 * sans `context.provenance_records`, ce critère est simplement absent (comportement inchangé pour
 * tout appelant existant) — jamais un appel dupliqué de la logique du gate, uniquement une
 * réutilisation directe de la fonction existante.
 */
export function scoreArbiterOutput(output, oracle = {}, context = {}) {
  const criteria = [];
  if (oracle.forbidden_state) criteria.push(verdict("does_not_rubber_stamp_ready", output.state !== oracle.forbidden_state, `état interdit=${oracle.forbidden_state} obtenu=${output.state}`));
  if (Array.isArray(oracle.forbidden_candidate_field_substrings)) {
    const offenders = oracle.forbidden_candidate_field_substrings.filter(({ field, substring }) => candidateFieldValues(output.operational_request_candidate, field).some((value) => containsSubstring(value, substring)));
    criteria.push(verdict("resolves_without_new_drift", offenders.length === 0, offenders.length ? JSON.stringify(offenders) : null));
  }
  if (context.provenance_records) {
    const gate = assessIntentPreservationDeterministic({
      candidate_previous: context.candidate_previous ?? null,
      candidate_next: output.operational_request_candidate,
      provenance_records: context.provenance_records,
      status_changes: context.status_changes || [],
      issues_previous: context.issues_previous || [],
      issues_next: output.issues,
      resolutions: context.resolutions || []
    });
    criteria.push(verdict(
      "deterministic_intent_preservation_gate",
      gate.pass,
      gate.pass ? null : JSON.stringify({
        structurally_valid: gate.structurally_valid,
        unsupported_additions: gate.unsupported_additions,
        unsupported_removals: gate.unsupported_removals,
        silent_arbitrations: gate.silent_arbitrations
      }),
      "gate"
    ));
  }
  return { criteria, pass: criteria.every((c) => c.pass) };
}

/**
 * Stabilité (critère 13) : compare la signature structurelle de plusieurs exécutions du même
 * (cas, rôle, provider). Ne compare jamais le texte mot à mot — uniquement les décisions
 * structurelles (types d'issues matérielles, nombre de questions, agreement, state).
 *
 * 3F.3.3-C, A2 : la stabilité n'est évaluable qu'à partir de 2 échantillons. Avec 0 ou 1 sortie,
 * la question même de la stabilité n'a pas de sens — ce n'est ni stable, ni instable, c'est non
 * évaluable. evaluable:false / stable:null le signale explicitement, plutôt que d'afficher
 * mécaniquement stable:true (agreement_ratio 1/1) sur un unique échantillon, ce qui ne prouve rien.
 */
export function assessStability(role, parsedOutputs) {
  const signatureOf = (output) => {
    if (role === "analyst") {
      const materialTypes = [...new Set(output.issues.filter((i) => i.impact === "material").map((i) => i.type))].sort();
      return JSON.stringify({ materialTypes, questionCount: output.question_candidates.length });
    }
    if (role === "critic") return JSON.stringify({ agreement: output.agreement, vetoCount: output.vetoes.length, drift: output.semantic_drift_detected });
    return JSON.stringify({ state: output.state });
  };
  const signatures = parsedOutputs.map(signatureOf);
  if (signatures.length < 2) {
    return { evaluable: false, stable: null, agreement_ratio: null, signatures };
  }
  const counts = new Map();
  for (const signature of signatures) counts.set(signature, (counts.get(signature) || 0) + 1);
  const majority = Math.max(...counts.values());
  return { evaluable: true, stable: majority === signatures.length, agreement_ratio: majority / signatures.length, signatures };
}
