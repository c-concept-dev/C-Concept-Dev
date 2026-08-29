import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate, assessIntentPreservationDeterministic } from "../core/adn/index.js";
import { validateAnalystOutput, validateCriticOutput, validateArbiterOutput } from "../workers/shared/operational-request-core.js";
import { scoreAnalystOutput, scoreCriticOutput, scoreArbiterOutput, assessStability } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// Ce fichier ne fait AUCUN appel réseau : il prouve la correction des fonctions de scoring avec des
// sorties synthétiques (mockées), avant toute exécution réelle contre Workers AI ou Groq.

const corpusPath = fileURLToPath(new URL("../evaluation/lot10g3b3f3/corpus.json", import.meta.url));
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

function caseById(id) {
  const found = corpus.cases.find((c) => c.id === id);
  assert.ok(found, `cas de corpus introuvable : ${id}`);
  return found;
}

function confirmationSignals(overrides = {}) {
  return {
    multiple_ambiguities_resolved: false,
    complex_conflict_arbitrated: false,
    strong_restructuring: false,
    multiple_objectives_hierarchized: false,
    significant_delegation: false,
    ...overrides
  };
}

test("le corpus contient exactement les 15 cas requis", () => {
  assert.equal(corpus.cases.length, 15);
  assert.equal(new Set(corpus.cases.map((c) => c.id)).size, 15, "aucun id de cas dupliqué");
});

test("les fixtures analyst_output du corpus sont valides au sens du schéma 3F.3.2", () => {
  for (const testCase of corpus.cases) {
    if (!testCase.fixture_analyst_output) continue;
    assert.doesNotThrow(() => validateAnalystOutput(testCase.fixture_analyst_output), `${testCase.id} : fixture analyst_output invalide.`);
  }
});

// --- Analyste : simple et complète (case-01) --------------------------------------------------

test("scoreAnalystOutput : sortie propre valide le cas simple et complet, une invention le fait échouer", () => {
  const testCase = caseById("case-01-simple-complete");
  const clean = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), objective: "Rédiger 10 conseils génériques pour bien dormir.", expected_deliverable: "Liste de 10 conseils." },
    provenance_records: [
      { field: "objective", value: "Rédiger 10 conseils génériques pour bien dormir.", provenance: "explicit_user_statement" },
      { field: "expected_deliverable", value: "Liste de 10 conseils.", provenance: "explicit_user_statement" }
    ],
    issues: [],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(clean, testCase.oracle.analyst).pass, true);

  const invented = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), objective: "Rédiger 10 conseils génériques pour bien dormir.", confirmed_constraints: ["Doit cibler les adultes de plus de 50 ans."] },
    provenance_records: [{ field: "objective", value: "Rédiger 10 conseils génériques pour bien dormir.", provenance: "explicit_user_statement" }],
    issues: [],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  const invalidScore = scoreAnalystOutput(invented, testCase.oracle.analyst);
  assert.equal(invalidScore.pass, false);
  assert.ok(invalidScore.criteria.find((c) => c.criterion === "provenance_completeness" && !c.pass));
});

// --- Analyste : information manquante et recherchable ------------------------------------------

test("scoreAnalystOutput : détecte correctement une information manquante attendue", () => {
  const testCase = caseById("case-02-simple-incomplete");
  const withMissing = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Poste et destinataire non précisés.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    question_candidates: [{ text: "Pour quel poste rédigez-vous cette lettre ?", targets_issue_id: "ISSUE-001", expected_progress: "Permet de cibler la lettre." }],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(withMissing, testCase.oracle.analyst).pass, true);

  const withoutMissing = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(withoutMissing, testCase.oracle.analyst).pass, false);
});

test("scoreAnalystOutput : le traitement 'research' satisfait le cas d'information recherchable", () => {
  const testCase = caseById("case-08-info-recherchable");
  const researched = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), external_facts_to_research: ["Météo à Paris demain."] },
    provenance_records: [{ field: "external_facts_to_research", value: "Météo à Paris demain.", provenance: "external_fact_to_research" }],
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Météo non connue.", impact: "material", substitutable: true, recommended_treatment: "research" }],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(researched, testCase.oracle.analyst).pass, true);

  const questioned = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Météo non connue.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    question_candidates: [{ text: "Quelle météo est prévue ?", targets_issue_id: "ISSUE-001", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(questioned, testCase.oracle.analyst).pass, false, "questionner une donnée recherchable doit échouer le critère de sur-questionnement");
});

// --- Analyste : délégation et « je ne sais pas » ------------------------------------------------

test("scoreAnalystOutput : respecte une délégation et ne repose pas la même question après 'je ne sais pas'", () => {
  const delegationCase = caseById("case-06-delegation");
  const respectsDelegation = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), delegated_decisions: ["Budget de l'événement laissé à la discrétion de l'IA."] },
    provenance_records: [{ field: "delegated_decisions", value: "Budget de l'événement laissé à la discrétion de l'IA.", provenance: "delegated_decision" }],
    issues: [],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(respectsDelegation, delegationCase.oracle.analyst).pass, true);

  const reAsks = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Budget non fixé.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    question_candidates: [{ text: "Quel budget souhaitez-vous ?", targets_issue_id: "ISSUE-001", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(reAsks, delegationCase.oracle.analyst).pass, false);

  const dontKnowCase = caseById("case-07-je-ne-sais-pas");
  const substitutes = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), assumptions_allowed: ["Public généraliste supposé par défaut."] },
    provenance_records: [{ field: "assumptions_allowed", value: "Public généraliste supposé par défaut.", provenance: "labeled_estimate" }],
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Public cible non déterminé.", impact: "material", substitutable: true, recommended_treatment: "estimate" }],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(substitutes, dontKnowCase.oracle.analyst).pass, true);

  const mechanicalRepeat = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Public non connu.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    question_candidates: [{ text: "À quel public s'adresse cet article ?", targets_issue_id: "ISSUE-001", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(mechanicalRepeat, dontKnowCase.oracle.analyst).pass, false);
});

// 3F.3.3-C, D4 : une décision explicitement déléguée doit rester une délégation — elle
// n'appartient pas au monde externe et ne doit jamais redevenir un fait à rechercher.

test("scoreAnalystOutput : une décision déléguée transformée en recherche externe échoue (case-06)", () => {
  const delegationCase = caseById("case-06-delegation");
  const turnedIntoResearch = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), external_facts_to_research: ["Budget habituel pour ce type d'événement d'équipe."] },
    provenance_records: [{ field: "external_facts_to_research", value: "Budget habituel pour ce type d'événement d'équipe.", provenance: "external_fact_to_research" }],
    issues: [], question_candidates: [], confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(turnedIntoResearch, delegationCase.oracle.analyst);
  assert.equal(score.pass, false);
  assert.equal(score.criteria.find((c) => c.criterion === "delegation_not_turned_into_research").pass, false);
});

// 3F.3.3-C, D3 : la garde anti-répétition mécanique après « je ne sais pas » doit aussi détecter une
// reformulation non verbatim de la même question — jamais seulement la répétition mot pour mot.
// Rappel : cette garde reste une heuristique lexicale déterministe de l'outil de benchmark, jamais
// l'autorité sémantique de production (portée par le prompt Analyste, cf. C2/C3).

test("scoreAnalystOutput : détecte aussi une reformulation non verbatim de la question déjà répondue par 'je ne sais pas' (case-07)", () => {
  const dontKnowCase = caseById("case-07-je-ne-sais-pas");
  const paraphrased = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Public non connu.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    question_candidates: [{ text: "Quel est le public cible de cet article ?", targets_issue_id: "ISSUE-001", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(paraphrased, dontKnowCase.oracle.analyst);
  assert.equal(score.criteria.find((c) => c.criterion === "no_mechanical_repetition_after_dont_know").pass, false, "une reformulation non verbatim de la même question doit être détectée, pas seulement la répétition mot pour mot.");
  assert.equal(score.pass, false);
});

// --- Analyste : préférence vs contrainte, conflit, multi-objectifs -------------------------------

test("scoreAnalystOutput : une préférence classée à tort en contrainte échoue", () => {
  const testCase = caseById("case-09-preference-vs-contrainte");
  const wrong = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), confirmed_constraints: ["Ton formel obligatoire."] },
    provenance_records: [{ field: "confirmed_constraints", value: "Ton formel obligatoire.", provenance: "explicit_user_statement" }],
    issues: [], question_candidates: [], confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(wrong, testCase.oracle.analyst).pass, false);

  const right = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), confirmed_preferences: ["Ton plutôt formel si possible."] },
    provenance_records: [{ field: "confirmed_preferences", value: "Ton plutôt formel si possible.", provenance: "explicit_user_statement" }],
    issues: [], question_candidates: [], confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(right, testCase.oracle.analyst).pass, true);
});

test("scoreAnalystOutput : détecte le type de conflit attendu (primitive unifiée)", () => {
  const testCase = caseById("case-04-contradictoire");
  const withConflict = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [{ id: "ISSUE-001", type: "conflict", kind: "logical_contradiction", description: "50 pages vs 1 page.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    question_candidates: [{ text: "Quelle longueur privilégier ?", targets_issue_id: "ISSUE-001", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(withConflict, testCase.oracle.analyst).pass, true);
});

test("scoreAnalystOutput : détecte le multi_objective_disorder attendu", () => {
  const testCase = caseById("case-05-multi-objectifs");
  const withDisorder = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [{ id: "ISSUE-001", type: "multi_objective_disorder", description: "Deux objectifs sans priorité.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    question_candidates: [{ text: "Lequel des deux traiter en premier ?", targets_issue_id: "ISSUE-001", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  assert.equal(scoreAnalystOutput(withDisorder, testCase.oracle.analyst).pass, true);
});

// --- 3F.3.3-C2, B-01 (correction) : duplication d'une inconnue vs. traitement réellement distinct --
// Le critère ne repose sur aucun case_id, aucun mot-clé métier, aucun plafond numérique de questions,
// aucun ratio global fixe. Il détecte une seule chose, relationnelle et structurelle : une issue
// matérielle traitée par "question" dont l'intitulé (normalisé trivialement : espaces, casse,
// ponctuation terminale) réapparaît aussi dans remaining_unknowns — une contradiction interne, jamais
// une preuve de traitement alternatif.

function materialIssue(id, overrides = {}) {
  return { id, type: "missing_information", description: `Issue ${id} non résolue.`, impact: "material", substitutable: false, recommended_treatment: "question", ...overrides };
}

// A. Régression historique exacte : plusieurs issues matérielles, toutes substitutable:false, toutes
// questionnées, ET les mêmes intitulés dupliqués dans remaining_unknowns (avec une variation triviale
// de casse/ponctuation sur l'un d'eux, pour exercer la normalisation). Sans la nouvelle logique
// relationnelle (E), la seule non-vacuité de remaining_unknowns aurait fait passer ce cas à tort.
test("scoreAnalystOutput : régression historique — issues questionnées dupliquées dans remaining_unknowns échoue (faux négatif corrigé)", () => {
  const descriptions = Array.from({ length: 10 }, (_, i) => `Point non résolu numéro ${i + 1}.`);
  const output = validateAnalystOutput({
    operational_request_candidate: {
      ...createEmptyCandidate(),
      remaining_unknowns: descriptions.map((d, i) => (i === 0 ? d.toUpperCase().replace(/\.$/, "") : d))
    },
    provenance_records: descriptions.map((d, i) => ({ field: "remaining_unknowns", value: i === 0 ? d.toUpperCase().replace(/\.$/, "") : d, provenance: "safe_deduction" })),
    issues: descriptions.map((d, i) => materialIssue(`ISSUE-${i + 1}`, { description: d })),
    question_candidates: descriptions.map((d, i) => ({ text: `Que faut-il faire concernant : ${d} ?`, targets_issue_id: `ISSUE-${i + 1}`, expected_progress: "x" })),
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  const criterion = score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence");
  assert.equal(criterion.pass, false, "les 10 issues sont simultanément questionnées ET dupliquées dans remaining_unknowns : ce n'est pas un traitement alternatif, c'est une contradiction.");
  assert.equal(score.pass, false);
});

// B. Duplication partielle : certaines issues sont dupliquées dans remaining_unknowns (fausse
// alternative), d'autres reçoivent un vrai traitement distinct (recommended_treatment != "question").
// Le score doit distinguer les deux : échec à cause des seules issues dupliquées.
test("scoreAnalystOutput : duplication partielle — seules les issues réellement dupliquées font échouer le critère", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["Point non résolu numéro 1."] },
    provenance_records: [{ field: "remaining_unknowns", value: "Point non résolu numéro 1.", provenance: "safe_deduction" }],
    issues: [
      materialIssue("ISSUE-1", { description: "Point non résolu numéro 1." }),
      materialIssue("ISSUE-2", { description: "Point non résolu numéro 2.", recommended_treatment: "estimate", substitutable: true })
    ],
    question_candidates: [{ text: "Que faut-il faire concernant : Point non résolu numéro 1. ?", targets_issue_id: "ISSUE-1", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  const criterion = score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence");
  assert.equal(criterion.pass, false);
  assert.match(criterion.note, /ISSUE-1/);
  assert.doesNotMatch(criterion.note, /ISSUE-2/, "ISSUE-2 a reçu un traitement réellement distinct (estimate) : elle ne doit jamais apparaître comme duplication.");
});

// C. Cas légitime non substituable : plusieurs issues matérielles réellement non substituables,
// toutes questionnées, sans aucun autre champ rempli et donc aucune duplication possible. Ce cas ne
// doit JAMAIS échouer au seul motif du nombre d'issues ou de questions (c'était le faux positif).
test("scoreAnalystOutput : plusieurs issues réellement non substituables, toutes questionnées, sans duplication — reste PASS", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [materialIssue("ISSUE-1"), materialIssue("ISSUE-2"), materialIssue("ISSUE-3")],
    question_candidates: [
      { text: "Quelle échéance visez-vous ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Quel format attendez-vous ?", targets_issue_id: "ISSUE-2", expected_progress: "x" },
      { text: "Quelle priorité retenir ?", targets_issue_id: "ISSUE-3", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "plusieurs issues + plusieurs questions + aucun autre champ disponible n'est jamais, à lui seul, une inflation.");
});

// D. Cas sain avec stratégie alternative réelle (aucune duplication, traitements distincts) => PASS.
test("scoreAnalystOutput : traitements variés et réellement distincts (aucune duplication) — PASS", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), assumptions_allowed: ["Hypothèse par défaut retenue faute d'information contraire."] },
    provenance_records: [{ field: "assumptions_allowed", value: "Hypothèse par défaut retenue faute d'information contraire.", provenance: "labeled_estimate" }],
    issues: [
      materialIssue("ISSUE-1"),
      materialIssue("ISSUE-2", { recommended_treatment: "estimate", substitutable: true }),
      materialIssue("ISSUE-3", { recommended_treatment: "decide", substitutable: true })
    ],
    question_candidates: [{ text: "Quelle échéance visez-vous ?", targets_issue_id: "ISSUE-1", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true);
});

// E. Preuve que la logique de distinction est bien exercée par le test A : une comparaison naïve
// qui se contenterait de vérifier "remaining_unknowns non vide" (l'ancien défaut) qualifierait à
// tort ce même cas de traitement alternatif valide. Vérifié directement ici, indépendamment de
// l'implémentation interne, pour garantir que le test A ne pourrait pas passer par accident.
test("scoreAnalystOutput : la seule non-vacuité de remaining_unknowns ne suffit jamais à elle seule (preuve négative)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["Point non résolu numéro 1.", "Point non résolu numéro 2."] },
    provenance_records: [
      { field: "remaining_unknowns", value: "Point non résolu numéro 1.", provenance: "safe_deduction" },
      { field: "remaining_unknowns", value: "Point non résolu numéro 2.", provenance: "safe_deduction" }
    ],
    issues: [materialIssue("ISSUE-1", { description: "Point non résolu numéro 1." }), materialIssue("ISSUE-2", { description: "Point non résolu numéro 2." })],
    question_candidates: [
      { text: "Que faut-il faire concernant : Point non résolu numéro 1. ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Que faut-il faire concernant : Point non résolu numéro 2. ?", targets_issue_id: "ISSUE-2", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  assert.ok(output.operational_request_candidate.remaining_unknowns.length > 0, "remaining_unknowns est bien non vide ici — et pourtant :");
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, false, "un champ non vide seul ne doit jamais suffire à valider un traitement alternatif.");
});

// --- Critique -----------------------------------------------------------------------------------

test("scoreCriticOutput : agree sans veto valide le cas 'accepte sans veto'", () => {
  const testCase = caseById("case-10-critique-accepte-sans-veto");
  const agree = validateCriticOutput({
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ""
  });
  assert.equal(scoreCriticOutput(agree, testCase.oracle.critic).pass, true);
});

// 3F.3.3-C, A3 : "agree_without_inventing_problem" re-testait une condition déjà imposée par
// validateCriticOutput (B1) — mathématiquement impossible à échouer sur une sortie déjà validée,
// donc gonflant artificiellement le taux de réussite. Ce critère ne doit plus jamais apparaître,
// et un agree légitime sans aucune autre attente d'oracle ne doit produire AUCUN critère (jamais
// un critère toujours vrai comptabilisé comme un succès).

test("scoreCriticOutput : n'inflate plus jamais le score avec un critère tautologique 'agree_without_inventing_problem'", () => {
  const agree = validateCriticOutput({
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ""
  });
  const scoreWithNoOracleExpectation = scoreCriticOutput(agree, {});
  assert.equal(scoreWithNoOracleExpectation.criteria.find((c) => c.criterion === "agree_without_inventing_problem"), undefined);
  assert.equal(scoreWithNoOracleExpectation.criteria.length, 0, "un agree légitime sans attente d'oracle ne doit produire aucun critère, jamais un critère toujours vrai compté comme un succès.");
});

test("scoreCriticOutput : un veto qualifié substantiel valide le cas 'veto qualifié', un veto creux échoue", () => {
  const testCase = caseById("case-11-critique-veto-qualifie");
  const qualified = validateCriticOutput({
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: ["confirmed_constraints: destinataire direction générale"], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [{ issue_id: "ADDED-001", new_information_trigger: "Le candidat de l'Analyste ajoute un destinataire jamais mentionné.", why_material: "Le destinataire change le ton et le contenu attendu du compte rendu.", why_not_substitutable: "C'est un fait appartenant à l'utilisateur, non déductible." }],
    semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ""
  });
  const qualifiedScore = scoreCriticOutput(qualified, testCase.oracle.critic);
  assert.equal(qualifiedScore.pass, true);
  assert.equal(qualifiedScore.criteria.find((c) => c.criterion === "qualified_veto_substance").dimension, "escalade", "B3 : chaque critère Critic porte une dimension diagnostique (detection/escalade/verdict/drift/veto).");
  assert.equal(qualifiedScore.criteria.find((c) => c.criterion === "agreement_matches_oracle").dimension, "verdict");

  const hollow = validateCriticOutput({
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: ["x"], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [{ issue_id: "ADDED-001", new_information_trigger: "x", why_material: "x", why_not_substitutable: "x" }],
    semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ""
  });
  const hollowScore = scoreCriticOutput(hollow, testCase.oracle.critic);
  assert.equal(hollowScore.criteria.find((c) => c.criterion === "qualified_veto_substance").pass, false);
});

test("scoreCriticOutput : détecte la dérive sémantique attendue (préférence reclassée en contrainte)", () => {
  const testCase = caseById("case-15-glissement-semantique");
  const detects = validateCriticOutput({
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: true, semantic_drift_notes: ["Une préférence souple a été reclassée en contrainte impérative."], significant_stakes: false, significant_stakes_reason: ""
  });
  assert.equal(scoreCriticOutput(detects, testCase.oracle.critic).pass, true);

  const misses = validateCriticOutput({
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ""
  });
  assert.equal(scoreCriticOutput(misses, testCase.oracle.critic).pass, false);
});

// --- Arbitre --------------------------------------------------------------------------------------

test("scoreArbiterOutput : une résolution qui entérine l'ajout non tracé échoue le critère anti-dérive", () => {
  const testCase = caseById("case-11-critique-veto-qualifie");
  const rubberStamped = validateArbiterOutput({
    state: "operational_request_ready",
    operational_request_candidate: { ...createEmptyCandidate(), confirmed_constraints: ["Le compte rendu doit être envoyé à toute la direction générale."] },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null }, confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Tout est prêt."
  });
  const score = scoreArbiterOutput(rubberStamped, testCase.oracle.arbiter);
  assert.equal(score.pass, false);
  assert.ok(score.criteria.find((c) => c.criterion === "does_not_rubber_stamp_ready" && !c.pass));

  const properlyResolved = validateArbiterOutput({
    state: "clarification_required",
    operational_request_candidate: createEmptyCandidate(),
    issues: [{ id: "ISSUE-001", type: "decision_authority_unclear", description: "Destinataire non confirmé par l'utilisateur.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    next_question: { text: "À qui ce compte rendu doit-il être envoyé ?", targets_issue_id: "ISSUE-001", expected_progress: "Confirme le destinataire réel." },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: false, concerns: ["Destinataire ajouté sans provenance par l'Analyste."] },
    reason: "Le veto du Critique est fondé : le destinataire n'était pas dans la demande originale."
  });
  assert.equal(scoreArbiterOutput(properlyResolved, testCase.oracle.arbiter).pass, true);
});

// --- 3F.3.3-C1, B-02 : le gate déterministe (assessIntentPreservationDeterministic) réellement
// branché sur scoreArbiterOutput via `context.provenance_records` — réutilisation directe de la
// fonction existante, jamais une duplication de sa logique. Aucun des textes utilisés ci-dessous
// n'appartient au corpus des 15 cas.

test("scoreArbiterOutput : le gate déterministe passe quand tout le candidat final est réellement tracé (READY légitime)", () => {
  const provenance_records = [
    { field: "objective", value: "Produire une synthèse hebdomadaire des indicateurs qualité.", provenance: "explicit_user_statement" },
    { field: "expected_deliverable", value: "Document d'une page avec les trois indicateurs clés.", provenance: "explicit_user_statement" }
  ];
  const output = validateArbiterOutput({
    state: "operational_request_ready",
    operational_request_candidate: {
      ...createEmptyCandidate(),
      objective: "Produire une synthèse hebdomadaire des indicateurs qualité.",
      expected_deliverable: "Document d'une page avec les trois indicateurs clés."
    },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null }, confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Chaque champ du candidat est tracé, aucun problème matériel ne subsiste."
  });
  const score = scoreArbiterOutput(output, {}, { provenance_records });
  const gate = score.criteria.find((c) => c.criterion === "deterministic_intent_preservation_gate");
  assert.ok(gate, "le critère de gate doit être présent dès qu'un contexte de provenance est fourni.");
  assert.equal(gate.pass, true);
  assert.equal(score.pass, true);
});

test("scoreArbiterOutput : le gate déterministe échoue sur un champ inventé sans provenance (ajout non tracé)", () => {
  const provenance_records = [
    { field: "objective", value: "Produire une synthèse hebdomadaire des indicateurs qualité.", provenance: "explicit_user_statement" }
  ];
  const output = validateArbiterOutput({
    state: "operational_request_ready",
    operational_request_candidate: {
      ...createEmptyCandidate(),
      objective: "Produire une synthèse hebdomadaire des indicateurs qualité.",
      confirmed_constraints: ["Doit être envoyée en copie à un tiers jamais mentionné par l'utilisateur."]
    },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null }, confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "L'Arbitre affirme que tout est prêt."
  });
  const gate = assessIntentPreservationDeterministic({
    candidate_previous: null,
    candidate_next: output.operational_request_candidate,
    provenance_records,
    status_changes: [], issues_previous: [], issues_next: [], resolutions: []
  });
  assert.equal(gate.pass, false, "vérification directe : la fonction réutilisée détecte bien l'ajout non tracé.");
  assert.equal(gate.unsupported_additions.length, 1);
});

test("scoreArbiterOutput : détecte lui-même l'échec du gate déterministe (aucune dépendance à un substring du corpus)", () => {
  const provenance_records = [
    { field: "objective", value: "Produire une synthèse hebdomadaire des indicateurs qualité.", provenance: "explicit_user_statement" }
  ];
  const output = validateArbiterOutput({
    state: "operational_request_ready",
    operational_request_candidate: {
      ...createEmptyCandidate(),
      objective: "Produire une synthèse hebdomadaire des indicateurs qualité.",
      confirmed_constraints: ["Doit être envoyée en copie à un tiers jamais mentionné par l'utilisateur."]
    },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null }, confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "L'Arbitre affirme que tout est prêt."
  });
  const score = scoreArbiterOutput(output, {}, { provenance_records });
  const gate = score.criteria.find((c) => c.criterion === "deterministic_intent_preservation_gate");
  assert.equal(gate.pass, false, "READY affirmé par l'Arbitre ne doit jamais suffire à faire passer le gate sans provenance suffisante.");
  assert.equal(score.pass, false, "un échec de gate doit se répercuter sur le verdict global scoreArbiterOutput, pas seulement rester un critère isolé.");
});

test("scoreArbiterOutput : sans context.provenance_records, le comportement reste strictement inchangé (rétrocompatibilité)", () => {
  const testCase = caseById("case-11-critique-veto-qualifie");
  const output = validateArbiterOutput({
    state: "clarification_required",
    operational_request_candidate: createEmptyCandidate(),
    issues: [{ id: "ISSUE-001", type: "decision_authority_unclear", description: "Destinataire non confirmé.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    next_question: { text: "À qui ce compte rendu doit-il être envoyé ?", targets_issue_id: "ISSUE-001", expected_progress: "Confirme le destinataire réel." },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: false, concerns: ["Destinataire ajouté sans provenance."] },
    reason: "Le veto du Critique est fondé."
  });
  const score = scoreArbiterOutput(output, testCase.oracle.arbiter);
  assert.equal(score.criteria.find((c) => c.criterion === "deterministic_intent_preservation_gate"), undefined, "sans contexte, aucun critère de gate ne doit apparaître : comportement identique à avant B-02.");
  assert.equal(score.pass, true);
});

// --- Stabilité ------------------------------------------------------------------------------------

test("assessStability détecte une signature stable et une signature instable", () => {
  const stableOutputs = [
    { agreement: "agree", vetoes: [], semantic_drift_detected: false },
    { agreement: "agree", vetoes: [], semantic_drift_detected: false },
    { agreement: "agree", vetoes: [], semantic_drift_detected: false }
  ];
  const stable = assessStability("critic", stableOutputs);
  assert.equal(stable.stable, true);
  assert.equal(stable.agreement_ratio, 1);

  const unstableOutputs = [
    { agreement: "agree", vetoes: [], semantic_drift_detected: false },
    { agreement: "disagree", vetoes: [{ issue_id: "x", new_information_trigger: "x", why_material: "x", why_not_substitutable: "x" }], semantic_drift_detected: false },
    { agreement: "agree", vetoes: [], semantic_drift_detected: false }
  ];
  const unstable = assessStability("critic", unstableOutputs);
  assert.equal(unstable.stable, false);
  assert.ok(unstable.agreement_ratio < 1);
});

// 3F.3.3-C, A2 : la stabilité n'est évaluable qu'à partir de 2 échantillons — avec 0 ou 1 sortie,
// ce n'est ni stable ni instable, c'est non évaluable, et cela doit être représenté explicitement
// plutôt que d'afficher mécaniquement stable:true sur un unique échantillon.

test("assessStability : avec 0 sortie, la stabilité est non évaluable (jamais stable:true par défaut)", () => {
  const result = assessStability("critic", []);
  assert.equal(result.evaluable, false);
  assert.equal(result.stable, null);
  assert.equal(result.agreement_ratio, null);
});

test("assessStability : avec 1 seule sortie, la stabilité est non évaluable (jamais stable:true mécanique)", () => {
  const result = assessStability("critic", [{ agreement: "agree", vetoes: [], semantic_drift_detected: false }]);
  assert.equal(result.evaluable, false);
  assert.equal(result.stable, null);
  assert.equal(result.agreement_ratio, null);
});

test("assessStability : avec 2 sorties identiques, la stabilité redevient évaluable et vaut true", () => {
  const outputs = [
    { agreement: "agree", vetoes: [], semantic_drift_detected: false },
    { agreement: "agree", vetoes: [], semantic_drift_detected: false }
  ];
  const result = assessStability("critic", outputs);
  assert.equal(result.evaluable, true);
  assert.equal(result.stable, true);
  assert.equal(result.agreement_ratio, 1);
});
