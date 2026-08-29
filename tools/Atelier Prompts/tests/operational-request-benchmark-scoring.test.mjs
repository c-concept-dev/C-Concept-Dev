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

// --- 3F.3.3-C3, B-01 (nouvelle correction) : cohérence structurelle recommended_treatment <->
// remaining_unknowns, sans AUCUNE comparaison de texte entre une issue et une entrée de
// remaining_unknowns. Phase 1 a confirmé qu'aucune relation structurelle (id ou autre) ne relie ces
// deux éléments dans le contrat actuel — toute tentative de les rapprocher par le texte serait soit
// un rapprochement approximatif de mots-clés, soit une similarité sémantique déguisée, les deux
// interdits ici. Le seul fait structurel disponible est recommended_treatment, porté par l'issue
// elle-même : "leave_unknown" est, par construction du contrat, la seule stratégie dont l'artefact
// naturel est une entrée de remaining_unknowns. Le critère vérifie donc une simple existence — au
// moins une issue "leave_unknown" justifie un remaining_unknowns non vide — jamais un comptage, un
// ratio, ou une comparaison de libellés.

function materialIssue(id, overrides = {}) {
  return { id, type: "missing_information", description: `Issue ${id} non résolue.`, impact: "material", substitutable: false, recommended_treatment: "question", ...overrides };
}

// A. Reproduction exacte du bug réel : la forme structurelle rapportée par l'audit ("La durée du
// voyage n'est pas précisée." vs "durée du voyage" — même inconnue, aucune similarité textuelle
// fiable) ET une variante avec un intitulé totalement différent. Le critère doit échouer dans les
// deux cas SANS jamais comparer les deux textes entre eux : aucune issue ne déclare "leave_unknown",
// donc remaining_unknowns non vide est structurellement injustifié, quel que soit son libellé.
test("scoreAnalystOutput : reproduction exacte du bug historique — remaining_unknowns non vide sans aucune issue leave_unknown échoue, quel que soit le texte", () => {
  const outputVerbatimCase = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["durée du voyage"] },
    provenance_records: [{ field: "remaining_unknowns", value: "durée du voyage", provenance: "safe_deduction" }],
    issues: [materialIssue("ISSUE-1", { description: "La durée du voyage n'est pas précisée." })],
    question_candidates: [{ text: "Combien de temps doit durer le voyage ?", targets_issue_id: "ISSUE-1", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const criterionVerbatim = scoreAnalystOutput(outputVerbatimCase, {}).criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence");
  assert.equal(criterionVerbatim.pass, false, "même sans aucune ressemblance textuelle exploitable, l'absence de toute issue leave_unknown rend remaining_unknowns structurellement injustifié.");

  const outputUnrelatedWording = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["point en suspens côté logistique"] },
    provenance_records: [{ field: "remaining_unknowns", value: "point en suspens côté logistique", provenance: "safe_deduction" }],
    issues: [materialIssue("ISSUE-1", { description: "La durée du voyage n'est pas précisée." })],
    question_candidates: [{ text: "Combien de temps doit durer le voyage ?", targets_issue_id: "ISSUE-1", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const criterionUnrelated = scoreAnalystOutput(outputUnrelatedWording, {}).criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence");
  assert.equal(criterionUnrelated.pass, false, "un libellé totalement différent produit exactement le même verdict : le texte n'intervient jamais dans ce critère.");
});

// B. Variation textuelle forte sur PLUSIEURS issues à la fois (le cas historique complet : plusieurs
// issues matérielles, toutes substitutable:false, toutes questionnées, remaining_unknowns rempli de
// libellés qui ne correspondent, mot pour mot, à AUCUNE des descriptions d'issues). La détection doit
// fonctionner identiquement, portée uniquement par recommended_treatment.
test("scoreAnalystOutput : plusieurs issues avec libellés remaining_unknowns totalement différents — toujours détecté sans comparaison de texte", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: {
      ...createEmptyCandidate(),
      remaining_unknowns: ["aspect non tranché A", "aspect non tranché B", "aspect non tranché C"]
    },
    provenance_records: ["aspect non tranché A", "aspect non tranché B", "aspect non tranché C"].map((v) => ({ field: "remaining_unknowns", value: v, provenance: "safe_deduction" })),
    issues: [
      materialIssue("ISSUE-1", { description: "Premier point non résolu, formulation complètement différente." }),
      materialIssue("ISSUE-2", { description: "Deuxième point non résolu, autre formulation." }),
      materialIssue("ISSUE-3", { description: "Troisième point non résolu, encore une autre formulation." })
    ],
    question_candidates: [
      { text: "Que décidez-vous pour le premier point ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Que décidez-vous pour le deuxième point ?", targets_issue_id: "ISSUE-2", expected_progress: "x" },
      { text: "Que décidez-vous pour le troisième point ?", targets_issue_id: "ISSUE-3", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, false, "aucune des 3 issues ne déclare leave_unknown : remaining_unknowns reste injustifié quels que soient les libellés utilisés.");
});

// C. Cas légitime non substituable : plusieurs issues matérielles réellement non substituables,
// toutes questionnées, remaining_unknowns VIDE (rien à justifier). Ne doit jamais échouer au seul
// motif du nombre d'issues ou de questions — c'était le faux positif de 3F.3.3-C1.
test("scoreAnalystOutput : plusieurs issues réellement non substituables, toutes questionnées, remaining_unknowns vide — reste PASS", () => {
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
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "plusieurs issues + plusieurs questions + remaining_unknowns vide n'est jamais, à lui seul, une inflation.");
});

// D. Traitement alternatif réel, trois issues distinctes : A -> question, B -> traitement
// substitutif réel (decide), C -> laissée localement inconnue (leave_unknown, justifiant
// remaining_unknowns). Le scoring doit reconnaître ce cas comme sain dans son ensemble.
test("scoreAnalystOutput : issue questionnée + issue décidée + issue laissée inconnue — distingue correctement les trois et reste PASS", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["Un point mineur reste ouvert sans bloquer le livrable."] },
    provenance_records: [{ field: "remaining_unknowns", value: "Un point mineur reste ouvert sans bloquer le livrable.", provenance: "safe_deduction" }],
    issues: [
      materialIssue("ISSUE-A"),
      materialIssue("ISSUE-B", { recommended_treatment: "decide", substitutable: true }),
      materialIssue("ISSUE-C", { recommended_treatment: "leave_unknown", substitutable: true, description: "Un point mineur reste ouvert sans bloquer le livrable." })
    ],
    question_candidates: [{ text: "Quelle échéance visez-vous ?", targets_issue_id: "ISSUE-A", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "ISSUE-C (leave_unknown) justifie structurellement remaining_unknowns : aucune incohérence.");
});

// E. Aucun lien structurel inventé : un texte de remaining_unknowns qui ressemble fortement (voire
// à l'identique) à la description d'une issue ne doit jamais, à lui seul, valoir comme justification
// si cette issue n'a pas recommended_treatment="leave_unknown". La ressemblance textuelle — même
// parfaite — n'est jamais un substitut au fait structurel.
test("scoreAnalystOutput : une ressemblance textuelle parfaite entre remaining_unknowns et une issue questionnée ne justifie jamais l'absence de leave_unknown", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["Issue ISSUE-1 non résolue."] },
    provenance_records: [{ field: "remaining_unknowns", value: "Issue ISSUE-1 non résolue.", provenance: "safe_deduction" }],
    issues: [materialIssue("ISSUE-1")],
    question_candidates: [{ text: "Quelle échéance visez-vous ?", targets_issue_id: "ISSUE-1", expected_progress: "x" }],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, false, "le texte de remaining_unknowns est identique mot pour mot à la description de l'issue, mais celle-ci reste recommended_treatment=\"question\" : aucun lien structurel (leave_unknown) n'existe, donc aucune justification, quelle que soit la ressemblance textuelle.");
});

// F. Régression : si la vérification structurelle (au moins une issue leave_unknown) est retirée et
// remplacée par "remaining_unknowns non vide => traitement prouvé" (l'ancien défaut 3F.3.3-C1), ce
// même cas passerait à tort. Preuve directe, indépendante de l'implémentation interne.
test("scoreAnalystOutput : la seule non-vacuité de remaining_unknowns ne suffit jamais, à elle seule, sans issue leave_unknown (preuve de régression)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["Un aspect quelconque reste non traité."] },
    provenance_records: [{ field: "remaining_unknowns", value: "Un aspect quelconque reste non traité.", provenance: "safe_deduction" }],
    issues: [materialIssue("ISSUE-1"), materialIssue("ISSUE-2")],
    question_candidates: [
      { text: "Quelle échéance visez-vous ?", targets_issue_id: "ISSUE-1", expected_progress: "x" },
      { text: "Quel format attendez-vous ?", targets_issue_id: "ISSUE-2", expected_progress: "x" }
    ],
    confirmation_signals: confirmationSignals()
  });
  assert.ok(output.operational_request_candidate.remaining_unknowns.length > 0, "remaining_unknowns est bien non vide ici — et pourtant :");
  assert.equal(output.issues.some((issue) => issue.recommended_treatment === "leave_unknown"), false, "aucune issue ne déclare leave_unknown ici.");
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, false, "sans la vérification structurelle (issue leave_unknown), l'ancien défaut aurait accepté ce champ non vide comme preuve de traitement à tort.");
});

// --- 3F.3.3-C4 : cardinalité remaining_unknowns <= nombre d'issues leave_unknown -----------------
// L'existence d'AU MOINS UNE issue leave_unknown (3F.3.3-C3) laissait un contournement résiduel :
// une seule issue leave_unknown pouvait justifier arbitrairement N entrées remaining_unknowns. Une
// issue représente une unité d'arbitrage/traitement (CDC §7) : chaque issue leave_unknown ne peut
// structurellement justifier qu'UNE seule capacité d'inconnue laissée ouverte. La vérification
// compare deux comptages de collections déjà présentes dans le contrat — ce n'est ni un seuil
// numérique métier, ni un ratio arbitraire, ni un plafond de questions.

function leaveUnknownIssue(id, overrides = {}) {
  return { id, type: "missing_information", description: `Issue ${id} laissée inconnue.`, impact: "material", substitutable: true, recommended_treatment: "leave_unknown", ...overrides };
}

// 2. Contournement découvert : 10 remaining_unknowns, une seule issue leave_unknown, plusieurs
// autres issues questionnées => la capacité structurelle (1) est dépassée par le volume déclaré (10).
test("scoreAnalystOutput : 10 remaining_unknowns pour une seule issue leave_unknown échoue (contournement de cardinalité)", () => {
  const remaining_unknowns = Array.from({ length: 10 }, (_, i) => `capacité déclarée numéro ${i + 1}`);
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns },
    provenance_records: remaining_unknowns.map((v) => ({ field: "remaining_unknowns", value: v, provenance: "safe_deduction" })),
    issues: [
      leaveUnknownIssue("ISSUE-LU"),
      ...Array.from({ length: 9 }, (_, i) => materialIssue(`ISSUE-Q-${i + 1}`))
    ],
    question_candidates: Array.from({ length: 9 }, (_, i) => ({ text: `Que décidez-vous pour le point ${i + 1} ?`, targets_issue_id: `ISSUE-Q-${i + 1}`, expected_progress: "x" })),
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, false, "une seule issue leave_unknown ne peut structurellement justifier que 1 remaining_unknown, jamais 10.");
});

// 3. Cohérence structurelle : autant d'issues leave_unknown que d'entrées remaining_unknowns => la
// capacité structurelle est exactement respectée, aucun échec sur ce critère de cardinalité.
test("scoreAnalystOutput : 3 remaining_unknowns pour 3 issues leave_unknown respecte la cardinalité (PASS)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["point A", "point B", "point C"] },
    provenance_records: ["point A", "point B", "point C"].map((v) => ({ field: "remaining_unknowns", value: v, provenance: "safe_deduction" })),
    issues: [leaveUnknownIssue("ISSUE-1"), leaveUnknownIssue("ISSUE-2"), leaveUnknownIssue("ISSUE-3")],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "3 issues leave_unknown fournissent exactement la capacité structurelle nécessaire pour 3 remaining_unknowns.");
});

// 5. Capacité excédentaire : plus d'issues leave_unknown que d'entrées remaining_unknowns réellement
// utilisées => jamais un échec (la capacité est un plafond, pas un minimum requis).
test("scoreAnalystOutput : 2 remaining_unknowns pour 3 issues leave_unknown reste PASS (capacité excédentaire tolérée)", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns: ["point A", "point B"] },
    provenance_records: ["point A", "point B"].map((v) => ({ field: "remaining_unknowns", value: v, provenance: "safe_deduction" })),
    issues: [leaveUnknownIssue("ISSUE-1"), leaveUnknownIssue("ISSUE-2"), leaveUnknownIssue("ISSUE-3")],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, true, "une capacité structurelle excédentaire n'est jamais un défaut : ce critère borne un maximum, pas un minimum.");
});

// 6. Aucun biais textuel : les libellés d'issues et de remaining_unknowns sont volontairement sans
// aucun rapport les uns avec les autres. Le résultat (FAIL) ne dépend que du comptage 4 > 1.
test("scoreAnalystOutput : la cardinalité fonctionne indépendamment de tout rapport textuel entre issues et remaining_unknowns", () => {
  const output = validateAnalystOutput({
    operational_request_candidate: {
      ...createEmptyCandidate(),
      remaining_unknowns: ["xyz-alpha", "xyz-beta", "xyz-gamma", "xyz-delta"]
    },
    provenance_records: ["xyz-alpha", "xyz-beta", "xyz-gamma", "xyz-delta"].map((v) => ({ field: "remaining_unknowns", value: v, provenance: "safe_deduction" })),
    issues: [leaveUnknownIssue("ISSUE-LU", { description: "Un aspect totalement sans rapport lexical avec les entrées ci-dessus." })],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, false, "4 remaining_unknowns pour 1 seule issue leave_unknown échoue, quels que soient les libellés utilisés de part et d'autre.");
});

// 7. Test de régression : si la vérification de cardinalité est retirée et remplacée par la seule
// vérification d'existence (3F.3.3-C3, « au moins une issue leave_unknown »), le scénario du
// contournement 10/1 repasserait à tort en PASS. Preuve directe, indépendante de l'implémentation.
test("scoreAnalystOutput : preuve que la vérification d'existence seule (sans cardinalité) accepterait à tort le contournement 10/1", () => {
  const remaining_unknowns = Array.from({ length: 10 }, (_, i) => `capacité déclarée numéro ${i + 1}`);
  const issues = [leaveUnknownIssue("ISSUE-LU"), ...Array.from({ length: 9 }, (_, i) => materialIssue(`ISSUE-Q-${i + 1}`))];
  const existenceOnlyWouldPass = issues.some((issue) => issue.recommended_treatment === "leave_unknown");
  assert.equal(existenceOnlyWouldPass, true, "la seule vérification d'existence (3F.3.3-C3) est satisfaite ici : c'est précisément le contournement.");

  const output = validateAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), remaining_unknowns },
    provenance_records: remaining_unknowns.map((v) => ({ field: "remaining_unknowns", value: v, provenance: "safe_deduction" })),
    issues,
    question_candidates: Array.from({ length: 9 }, (_, i) => ({ text: `Que décidez-vous pour le point ${i + 1} ?`, targets_issue_id: `ISSUE-Q-${i + 1}`, expected_progress: "x" })),
    confirmation_signals: confirmationSignals()
  });
  const score = scoreAnalystOutput(output, {});
  assert.equal(score.criteria.find((c) => c.criterion === "no_question_inflation_without_ladder_evidence").pass, false, "la vérification de cardinalité (3F.3.3-C4) doit faire échouer ce cas que la vérification d'existence seule aurait laissé passer.");
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
