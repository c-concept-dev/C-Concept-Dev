import { assessProvenance, assessIntentPreservationDeterministic } from "../../core/adn/index.js";

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

  // 3F.3.3-C3, B-01 (nouvelle correction) : Phase 1 (inspection du contrat réel, core/adn/
  // operational-request-state.js) confirme qu'AUCUNE relation structurelle ne relie une issue à une
  // entrée de remaining_unknowns : CANDIDATE_LIST_FIELDS traite remaining_unknowns comme un tableau
  // de chaînes plates, exactement au même titre que confirmed_constraints, assumptions_allowed, etc.
  // — aucun identifiant, aucune référence. La seule relation structurelle qui existe réellement et de
  // façon fiable dans tout le contrat est question_candidate.targets_issue_id -> issue.id (posée et
  // vérifiée par validateAnalystOutput). Toute tentative de relier une issue à une entrée de
  // remaining_unknowns ne peut donc reposer QUE sur une comparaison de texte — exactement ce que
  // l'audit C3 a démontré non fiable en pratique ("La durée du voyage n'est pas précisée." vs "durée
  // du voyage" désignent la même inconnue sans être identiques ni normalisables trivialement l'une
  // vers l'autre) et ce que ce lot interdit explicitement (aucun fuzzy matching, aucune similarité
  // sémantique, aucun stemming). Ajouter un identifiant à remaining_unknowns changerait la forme
  // uniforme de TOUS les champs CANDIDATE_LIST_FIELDS (validation exactKeys, schéma JSON strict Groq,
  // appariement de provenance par valeur exacte) pour un bénéfice limité à un seul critère de
  // benchmark : ce n'est pas la plus petite modification contractuelle possible, et rien ici n'en
  // démontre la nécessité. remaining_unknowns n'est donc jamais comparé par texte à une issue, ni
  // dans un sens (3F.3.3-C1 : sa simple non-vacuité ne prouve plus un traitement) ni dans l'autre
  // (3F.3.3-C2 : sa duplication textuelle ne prouve plus une inflation) — les deux étaient des
  // simulations artificielles d'une comparaison sémantique que ce lot interdit de simuler.
  //
  // Signal retenu, entièrement structurel, sans comparaison de texte : recommended_treatment est un
  // champ de premier ordre porté par l'issue elle-même (jamais déduit d'un autre champ), et
  // "leave_unknown" est, par construction du contrat (cf. le prompt Analyste, stratégie "laisser
  // inconnue localement"), la SEULE stratégie dont l'artefact naturel est une entrée dans
  // remaining_unknowns. Une issue représente une unité d'arbitrage/traitement (CDC §7) : chaque issue
  // "leave_unknown" ne peut structurellement justifier qu'UNE seule capacité d'inconnue laissée
  // ouverte, jamais un nombre arbitraire.
  //
  // 3F.3.3-C4 : la seule vérification d'EXISTENCE (« au moins une issue leave_unknown ») laissait un
  // contournement résiduel — une unique issue leave_unknown justifiant à tort un nombre quelconque
  // d'entrées remaining_unknowns (ex. 10 remaining_unknowns pour 1 seule issue leave_unknown parmi 10
  // issues par ailleurs questionnées). La vérification devient donc une relation de CARDINALITÉ entre
  // deux collections du contrat, jamais un seuil numérique métier ni un ratio arbitraire : le nombre
  // d'entrées remaining_unknowns ne peut jamais excéder le nombre d'issues déclarant
  // recommended_treatment="leave_unknown" — une capacité structurelle par issue, ni plus, ni moins.
  // Aucune comparaison de texte n'intervient : seuls les deux comptages sont comparés.
  const leaveUnknownIssueCount = output.issues.filter((issue) => issue.recommended_treatment === "leave_unknown").length;
  const remainingUnknownsCount = candidateFieldValues(candidate, "remaining_unknowns").length;
  const unjustifiedRemainingUnknowns = remainingUnknownsCount > leaveUnknownIssueCount;
  criteria.push(verdict(
    "no_question_inflation_without_ladder_evidence",
    !unjustifiedRemainingUnknowns,
    unjustifiedRemainingUnknowns
      ? `remaining_unknowns contient ${remainingUnknownsCount} entrée(s) pour seulement ${leaveUnknownIssueCount} issue(s) déclarant recommended_treatment="leave_unknown" — capacité structurelle dépassée, jamais accepté comme preuve de traitement alternatif.`
      : null
  ));

  return { criteria, pass: criteria.every((c) => c.pass) };
}

// 3F.3.3-C (mission de suivi), B3 : chaque critère Critic porte désormais une dimension explicite
// (detection / escalade / verdict / drift / veto) pour permettre un diagnostic séparé sans refondre
// la structure plate existante (criteria[]) ni les consommateurs qui ne lisent que criterion/pass.
export function scoreCriticOutput(output, oracle = {}) {
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
