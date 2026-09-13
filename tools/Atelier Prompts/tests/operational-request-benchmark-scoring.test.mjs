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

// --- 3F.3.3-C5 (réouverture post-smoke Groq réel) : B-01 recentré sur la SEULE relation
// structurelle fiable du contrat — question_candidate.targets_issue_id -> issue.id — après que le
// premier smoke Groq réel a prouvé (case-06 : 4 issues "research", 0 leave_unknown, 0 question, et
// pourtant remaining_unknowns rempli des 4 mêmes inconnues ; case-14 : 1 issue mappée à 3 entrées
// remaining_unknowns) que remaining_unknowns ne représente PAS spécifiquement "leave_unknown" mais
// toute inconnue encore ouverte, quel que soit son traitement. remaining_unknowns est donc
// définitivement retiré de ce critère (ni C3 : existence, ni C4 : cardinalité). Le critère détecte
// désormais deux contradictions purement structurelles, sans aucune comparaison de texte : (a) un
// question_candidate cible une issue dont recommended_treatment n'est pas "question" (traitement
// substitutif déjà déclaré, question quand même ajoutée) ; (b) plusieurs question_candidates
// distincts ciblent le même issue.id (même issue redemandée). Plusieurs issues, toutes légitimement
// "question", chacune ciblée une seule fois, ne déclenchent jamais ce critère quel que soit leur
// nombre.

function materialIssue(id, overrides = {}) {
  return { id, type: "missing_information", description: `Issue ${id} non résolue.`, impact: "material", substitutable: false, recommended_treatment: "question", ...overrides };
}

// 1. + 3. Cas légitime (forme réelle du faux positif C4, cas "déménagement" du smoke) : plusieurs
// remaining_unknowns, autant d'issues "question" que d'entrées, chaque question cible
// structurellement une issue distincte => PASS attendu sur B-01 (remaining_unknowns est ignoré).
test("scoreAnalystOutput : plusieurs remaining_unknowns + issues question ciblées structurellement — reste PASS (faux positif C4 corrigé)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: {
      ...createEmptyCandidate(),
      remaining_unknowns: ["Disponibilité exacte du frère", "Horaires de travail précis", "Liste détaillée des tâches à accomplir"]
    },
    provenance_records: ["Disponibilité exacte du frère", "Horaires de travail précis", "Liste détaillée des tâches à accomplir"].map((v) => ({ field: "remaining_unknowns", value: v, provenance: "safe_deduction" })),
    issues: [materialIssue("ISSUE-1"), materialIssue("ISSUE-2"), materialIssue("ISSUE-3")],
    question_candidates: [
      { text: "Quelle échéance visez-vous ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Quel format attendez-vous ?", targets_issue_id: "ISSUE-2", expected_progress: "x" },
      { text: "Quelle priorité retenir ?", targets_issue_id: "ISSUE-3", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "remaining_unknowns n'est plus un signal de ce critère : 3 issues question, chacune ciblée une seule fois, ne sont jamais une inflation.");
});

// 2. Pathologie historique : une issue porte déjà un traitement substitutif réel déclaré
// (recommended_treatment != "question") mais reçoit quand même un question_candidate — contradiction
// structurelle réelle, jamais un traitement alternatif. Doit continuer à FAIL.
test("scoreAnalystOutput : une issue au traitement substitutif déjà déclaré mais quand même questionnée échoue (pathologie historique)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [
      materialIssue("ISSUE-1", { recommended_treatment: "research", substitutable: true }),
      materialIssue("ISSUE-2", { recommended_treatment: "decide", substitutable: true }),
      materialIssue("ISSUE-3")
    ],
    question_candidates: [
      { text: "Quelle échéance visez-vous ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Quel format attendez-vous ?", targets_issue_id: "ISSUE-2", expected_progress: "x" },
      { text: "Quelle priorité retenir ?", targets_issue_id: "ISSUE-3", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  const criterion = score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence");
  assert.equal(criterion.pass, false);
  assert.match(criterion.note, /ISSUE-1/);
  assert.match(criterion.note, /ISSUE-2/);
  assert.doesNotMatch(criterion.note, /ISSUE-3/, "ISSUE-3 est légitimement question (aucun autre traitement déclaré) : elle ne doit jamais apparaître comme inflation.");
});

// 4. Issue avec un traitement substitutif réel qui reçoit une question redondante => FAIL.
test("scoreAnalystOutput : une issue estimée puis quand même questionnée échoue (question redondante)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), assumptions_allowed: ["Valeur approximative retenue par défaut."] },
    provenance_records: [{ field: "assumptions_allowed", value: "Valeur approximative retenue par défaut.", provenance: "labeled_estimate" }],
    issues: [materialIssue("ISSUE-1", { recommended_treatment: "estimate", substitutable: true })],
    question_candidates: [{ text: "Pouvez-vous confirmer cette valeur ?", targets_issue_id: "ISSUE-1", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, false, "ISSUE-1 a déjà un traitement substitutif réel (estimate) ; la question ajoutée est structurellement redondante.");
});

// 5. leave_unknown reste un traitement légitime, jamais suspect en lui-même (aucune question ne le
// cible) : PASS, indépendamment de tout remaining_unknowns.
test("scoreAnalystOutput : une issue leave_unknown sans question associée reste PASS", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["Un point mineur reste ouvert sans bloquer le livrable."] },
    provenance_records: [{ field: "remaining_unknowns", value: "Un point mineur reste ouvert sans bloquer le livrable.", provenance: "safe_deduction" }],
    issues: [materialIssue("ISSUE-1", { recommended_treatment: "leave_unknown", substitutable: true })],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "leave_unknown sans question associée n'est jamais une inflation.");
});

// 6. Indépendance textuelle totale : mêmes structures (id, treatment, targets_issue_id), libellés
// entièrement différents des deux côtés — le verdict ne change jamais.
test("scoreAnalystOutput : le verdict ne dépend que de la structure, jamais du texte des libellés", () => {
  const outputA = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [materialIssue("ISSUE-1", { recommended_treatment: "research", description: "Premier libellé totalement arbitraire." })],
    question_candidates: [{ text: "Question dont le texte n'a aucun rapport lexical avec la description.", targets_issue_id: "ISSUE-1", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const outputB = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [materialIssue("ISSUE-1", { recommended_treatment: "research", description: "Second libellé, complètement différent du premier." })],
    question_candidates: [{ text: "Autre question, formulée autrement, ciblant la même structure.", targets_issue_id: "ISSUE-1", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const passA = scoreAnalystOutput(outputA, {}).criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass;
  const passB = scoreAnalystOutput(outputB, {}).criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass;
  assert.equal(passA, false);
  assert.equal(passB, false);
  assert.equal(passA, passB, "des libellés totalement différents produisent le même verdict : seule la structure (id + recommended_treatment) compte.");
});

// 7. Issues structurellement distinctes malgré un texte très similaire : chacune ciblée une seule
// fois par un id différent doit rester un cas sain, jamais fusionné par ressemblance textuelle.
test("scoreAnalystOutput : deux issues au texte quasi identique mais aux id distincts restent distinctes (PASS)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [
      materialIssue("ISSUE-1", { description: "Le format du livrable n'est pas précisé." }),
      materialIssue("ISSUE-2", { description: "Le format du livrable n'est pas précisé." })
    ],
    question_candidates: [
      { text: "Quel format souhaitez-vous pour le premier point ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Quel format souhaitez-vous pour le second point ?", targets_issue_id: "ISSUE-2", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "deux id distincts, chacun ciblé une seule fois, restent deux issues saines malgré un texte identique.");
});

// 7bis. La même issue (même id) ciblée par deux question_candidates distincts est une duplication
// structurelle réelle, établie par égalité d'identifiant — jamais par comparaison de texte.
test("scoreAnalystOutput : la même issue ciblée par deux question_candidates distincts échoue (duplication structurelle)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [materialIssue("ISSUE-1")],
    question_candidates: [
      { text: "Première formulation de la question.", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Seconde formulation, sans aucun rapport lexical avec la première.", targets_issue_id: "ISSUE-1", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  const criterion = score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence");
  assert.equal(criterion.pass, false);
  assert.match(criterion.note, /ISSUE-1/);
});

// 8. Régression : si la règle structurelle C5 est retirée et qu'on revient à la cardinalité
// remaining_unknowns <= issues leave_unknown (C4), le cas légitime du test 1/3 (déménagement) doit
// redevenir un FAIL à tort — c'est précisément le bug réel découvert par le smoke Groq post-C4.
test("scoreAnalystOutput : preuve de régression — l'ancienne cardinalité C4 aurait fait échouer à tort le cas légitime déménagement", () => {
  const remaining_unknowns = ["Disponibilité exacte du frère", "Horaires de travail précis", "Liste détaillée des tâches à accomplir"];
  const issues = [materialIssue("ISSUE-1"), materialIssue("ISSUE-2"), materialIssue("ISSUE-3")];
  const leaveUnknownIssueCountUnderOldRule = issues.filter((issue) => issue.recommended_treatment === "leave_unknown").length;
  const oldRuleWouldFail = remaining_unknowns.length > leaveUnknownIssueCountUnderOldRule;
  assert.equal(oldRuleWouldFail, true, "sous l'ancienne règle C4 (cardinalité remaining_unknowns <= leave_unknown), ce cas légitime échouait à tort (3 > 0) — c'est le bug réel du smoke post-C4.");

  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns },
    provenance_records: remaining_unknowns.map((v) => ({ field: "remaining_unknowns", value: v, provenance: "safe_deduction" })),
    issues,
    question_candidates: [
      { text: "Quelle échéance visez-vous ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Quel format attendez-vous ?", targets_issue_id: "ISSUE-2", expected_progress: "x" },
      { text: "Quelle priorité retenir ?", targets_issue_id: "ISSUE-3", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "la règle C5 (structurelle, indépendante de remaining_unknowns) doit corriger ce faux positif que l'ancienne règle C4 aurait produit.");
});

// --- Critique -----------------------------------------------------------------------------------

test("scoreCriticOutput : agree sans veto valide le cas 'accepte sans veto'", () => {
  const testCase = caseById("case-10-critique-accepte-sans-veto");
  const agree = validateCriticOutput({
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [],
    illegitimate_question_found: []
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
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [],
    illegitimate_question_found: []
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
    semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [],
    illegitimate_question_found: []
  });
  const qualifiedScore = scoreCriticOutput(qualified, testCase.oracle.critic);
  assert.equal(qualifiedScore.pass, true);
  assert.equal(qualifiedScore.criteria.find((c) => c.criterion === "qualified_veto_substance").dimension, "escalade", "B3 : chaque critère Critic porte une dimension diagnostique (detection/escalade/verdict/drift/veto).");
  assert.equal(qualifiedScore.criteria.find((c) => c.criterion === "agreement_matches_oracle").dimension, "verdict");

  const hollow = validateCriticOutput({
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: ["x"], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [{ issue_id: "ADDED-001", new_information_trigger: "x", why_material: "x", why_not_substitutable: "x" }],
    semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [],
    illegitimate_question_found: []
  });
  const hollowScore = scoreCriticOutput(hollow, testCase.oracle.critic);
  assert.equal(hollowScore.criteria.find((c) => c.criterion === "qualified_veto_substance").pass, false);
});

test("scoreCriticOutput : détecte la dérive sémantique attendue (préférence reclassée en contrainte)", () => {
  const testCase = caseById("case-15-glissement-semantique");
  const detects = validateCriticOutput({
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: true, semantic_drift_notes: ["Une préférence souple a été reclassée en contrainte impérative."], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [],
    illegitimate_question_found: []
  });
  assert.equal(scoreCriticOutput(detects, testCase.oracle.critic).pass, true);

  const misses = validateCriticOutput({
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [],
    illegitimate_question_found: []
  });
  assert.equal(scoreCriticOutput(misses, testCase.oracle.critic).pass, false);
});

// --- 3F.3.3-C8, B-01B : scoreCriticOutput / illegitimate_question_found (context.analyst_output) --
// Le scorer ne juge jamais si l'alternative proposée par le Critic est réellement pertinente — ce
// jugement sémantique appartient exclusivement au LLM Critic. Il vérifie uniquement la cohérence
// structurelle du signal avec analyst_output : référence d'issue valide, traitement effectivement
// "question", alternative membre de la ladder, justification présente.

function analystOutputWithIssue(issueOverrides = {}, questionOverrides = {}) {
  return validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [{ id: "ISSUE-1", type: "missing_information", description: "Un aspect du projet reste non précisé.", impact: "material", substitutable: false, recommended_treatment: "question", ...issueOverrides }],
    question_candidates: [{ text: "Quel est cet aspect ?", targets_issue_id: "ISSUE-1", expected_progress: "x", ...questionOverrides }],
    confirmation_signals: confirmationSignals()
  });
}

// 3F.3.3-S2 : validateCriticOutput exige désormais une cohérence bidirectionnelle entre
// question_substitution_review et illegitimate_question_found (même issue_id, même
// available_alternative). Cette fabrique construit donc toujours les deux ensemble, à partir du
// SEUL issue_id/available_alternative du finding — jamais deux sources de vérité divergentes.
function criticWithIllegitimateFinding(findingOverrides = {}) {
  const finding = { issue_id: "ISSUE-1", available_alternative: "estimate", why_available: "Une valeur par défaut raisonnable aurait pu être estimée et signalée comme telle.", ...findingOverrides };
  return validateCriticOutput({
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    question_substitution_review: [{
      issue_id: finding.issue_id,
      alternatives_reviewed: {
        research: { reasonably_available: false, reason: "Aucun fait externe vérifiable identifié." },
        decide: { reasonably_available: false, reason: "Aucune délégation explicite identifiée." },
        estimate: { reasonably_available: finding.available_alternative === "estimate", reason: "Évaluation de la disponibilité d'une estimation raisonnable." },
        scenario: { reasonably_available: finding.available_alternative === "scenario", reason: "Évaluation de la disponibilité de plusieurs scénarios." },
        condition: { reasonably_available: finding.available_alternative === "condition", reason: "Évaluation d'une conditionnalité explicite." },
        leave_unknown: { reasonably_available: finding.available_alternative === "leave_unknown", reason: "Évaluation du caractère bloquant de l'inconnue." }
      },
      question_is_last_resort: false,
      available_alternative: finding.available_alternative
    }],
    illegitimate_question_found: [finding]
  });
}

// 10. Reproduction générique de la pathologie historique (une issue réellement questionnée alors
// qu'une alternative de ladder était disponible) — sans aucun hardcoding de cas ou de domaine.
test("scoreCriticOutput : illegitimate_question_found bien formé et correctement lié à l'Analyst => PASS structurel (preuve de régression générique)", () => {
  const analystOutput = analystOutputWithIssue();
  const criticOutput = criticWithIllegitimateFinding();
  const score = scoreCriticOutput(criticOutput, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
  assert.equal(score.criteria.find((c) => c.criterion === "illegitimate_question_issue_reference_valid").pass, true);
  assert.equal(score.criteria.find((c) => c.criterion === "illegitimate_question_targets_question_treatment").pass, true);
});

// 11. Cas légitime multi-question : plusieurs issues réellement traitées par question, aucune
// alternative identifiée par le Critic => illegitimate_question_found vide, jamais de FAIL, quel
// que soit le nombre de questions.
// 3F.3.3-S2 : une revue "dernier recours" générique — les six alternatives déclarées non disponibles.
function lastResortReview(issueId) {
  return {
    issue_id: issueId,
    alternatives_reviewed: {
      research: { reasonably_available: false, reason: "Aucun fait externe vérifiable identifié." },
      decide: { reasonably_available: false, reason: "Aucune délégation explicite identifiée." },
      estimate: { reasonably_available: false, reason: "Aucune estimation raisonnable ne serait fiable ici." },
      scenario: { reasonably_available: false, reason: "Aucun scénario alternatif plausible identifié." },
      condition: { reasonably_available: false, reason: "Aucune condition explicite ne permettrait de différer la réponse." },
      leave_unknown: { reasonably_available: false, reason: "L'inconnue est bloquante pour la suite du travail." }
    },
    question_is_last_resort: true,
    available_alternative: null
  };
}

test("scoreCriticOutput : plusieurs issues question sans aucune alternative identifiée => aucun FAIL B-01B", () => {
  const analystOutput = validateAnalystOutput({
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [
      { id: "ISSUE-1", type: "missing_information", description: "Premier point.", impact: "material", substitutable: false, recommended_treatment: "question" },
      { id: "ISSUE-2", type: "missing_information", description: "Deuxième point.", impact: "material", substitutable: false, recommended_treatment: "question" },
      { id: "ISSUE-3", type: "missing_information", description: "Troisième point.", impact: "material", substitutable: false, recommended_treatment: "question" }
    ],
    question_candidates: [
      { text: "Premier point ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Deuxième point ?", targets_issue_id: "ISSUE-2", expected_progress: "x" },
      { text: "Troisième point ?", targets_issue_id: "ISSUE-3", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  const criticOutput = validateCriticOutput({
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [lastResortReview("ISSUE-1"), lastResortReview("ISSUE-2"), lastResortReview("ISSUE-3")],
    illegitimate_question_found: []
  });
  const score = scoreCriticOutput(criticOutput, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true, "plusieurs questions légitimes (dernier recours), toutes correctement revues, ne doivent jamais faire échouer le score.");
  assert.equal(score.criteria.find((c) => c.criterion === "question_substitution_review_targets_valid_issue")?.pass, true);
  assert.equal(score.criteria.find((c) => c.criterion === "question_substitution_review_covers_all_targetable_issues")?.pass, true);
  assert.ok(!score.criteria.some((c) => c.criterion.startsWith("illegitimate_question_")), "aucun critère illegitimate_question_found ne doit apparaître quand ce tableau est vide, quel que soit le nombre de questions légitimes.");
});

// 12. issue_id référençant une issue inexistante dans analyst_output.issues => FAIL structurel.
test("scoreCriticOutput : illegitimate_question_found référençant un issue_id inexistant échoue", () => {
  const analystOutput = analystOutputWithIssue();
  const criticOutput = criticWithIllegitimateFinding({ issue_id: "ISSUE-DOES-NOT-EXIST" });
  const score = scoreCriticOutput(criticOutput, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, false);
  assert.equal(score.criteria.find((c) => c.criterion === "illegitimate_question_issue_reference_valid").pass, false);
});

// 13. issue_id référençant une issue dont le traitement déclaré par l'Analyst n'est PAS "question"
// (ex. "research") => FAIL structurel : le signal B-01B ne concerne que les issues effectivement
// traitées par question.
test("scoreCriticOutput : illegitimate_question_found référençant une issue non traitée par question échoue", () => {
  const analystOutput = analystOutputWithIssue({ recommended_treatment: "research" }, {});
  const criticOutput = criticWithIllegitimateFinding();
  const score = scoreCriticOutput(criticOutput, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, false);
  assert.equal(score.criteria.find((c) => c.criterion === "illegitimate_question_targets_question_treatment").pass, false);
});

// 16. Indépendance textuelle totale : structure identique (mêmes id, même alternative), libellés
// entièrement différents des deux côtés — le verdict structurel doit rester identique.
test("scoreCriticOutput : le verdict B-01B ne dépend que de la structure, jamais des libellés", () => {
  const analystA = analystOutputWithIssue({ description: "Premier libellé totalement arbitraire, sans rapport avec le second." });
  const criticA = criticWithIllegitimateFinding({ why_available: "Justification A, formulée d'une façon complètement différente de la justification B." });
  const scoreA = scoreCriticOutput(criticA, {}, { analyst_output: analystA });

  const analystB = analystOutputWithIssue({ description: "Second libellé, vocabulaire et structure de phrase entièrement différents du premier." });
  const criticB = criticWithIllegitimateFinding({ why_available: "Justification B, autre vocabulaire, autre longueur, aucun mot en commun avec A." });
  const scoreB = scoreCriticOutput(criticB, {}, { analyst_output: analystB });

  assert.equal(scoreA.pass, true);
  assert.equal(scoreB.pass, true);
  assert.equal(scoreA.pass, scoreB.pass, "des libellés totalement différents ne doivent jamais changer le verdict structurel.");
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
