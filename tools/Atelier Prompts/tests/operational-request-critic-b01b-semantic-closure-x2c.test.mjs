import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  ARBITER_OUTPUT_FIELDS, ARBITER_SYSTEM_PROMPT, CRITIC_OUTPUT_FIELDS, CRITIC_SYSTEM_PROMPT,
  SUBSTITUTION_REVIEW_SYSTEM_PROMPT, TREATMENT_VALUES,
  assembleSubstitutionReviews, buildQuestionReviewTargets, deriveCriticConsequences,
  validateAnalystOutput, validateArbiterOutput, validateCriticOutput
} from "../workers/shared/operational-request-core.js";
import { TRANSPORT_LIMITS } from "../workers/shared/decision-core.js";

// LOT X2-C — B-01B SEMANTIC CLOSURE. QUESTIONNER doit être le dernier recours : une question de
// clarification n'est légitime que si une information réellement non substituable, appartenant à
// l'utilisateur, reste nécessaire pour produire fidèlement le livrable complet. Ce fichier prouve
// (1) la fermeture d'un contournement structurel réel du mécanisme B-01B existant (jamais une
// nouvelle règle métier — cf. X2C-BUG-1/2/3, la preuve qui compte le plus ici), et (2) que
// l'assemblage + la dérivation + la validation déjà en place (assembleSubstitutionReviews /
// deriveCriticConsequences / validateCriticOutput, operational-request-core.js, INCHANGÉS par ce
// lot) traitent correctement chaque famille générique de verdict UNE FOIS CE VERDICT DÉJÀ REÇU.
//
// CORRECTION X2-C.1 (audit indépendant) : les tests X2C-FAM-* ci-dessous, via
// runDeterministicCriticAudit, INJECTENT eux-mêmes reasonably_available/available_alternative --
// ils prouvent l'assemblage/la dérivation/la validation, JAMAIS que le système sait RENDRE ce
// jugement de substituabilité (c'est structurellement impossible à prouver sans un vrai appel LLM :
// deriveCriticConsequences est par construction une fonction PURE qui reçoit ce jugement en entrée,
// jamais qui le calcule). Cf. tests/operational-request-critic-b01b-real-path-x2c1.test.mjs pour la
// preuve complémentaire exerçant le VRAI chemin HTTP (runCriticWithGroq, schéma réel, requête
// réelle) — et le rapport X2-C.1 pour la classification honnête de cette limite
// (SEMANTIC_PROVIDER_LIMIT). Aucun mot métier de production, aucune liste de mots-clés, aucun seuil
// numérique, aucun fuzzy matching, aucun edit-distance, aucun plafond arbitraire n'est introduit ici
// ni dans le code de production touché par ce lot.

// --- Fixtures génériques (le contenu narratif ci-dessous n'est qu'un exemple, jamais une règle) ----

function candidate() {
  return { ...createEmptyCandidate(), objective: "Produire le livrable demandé." };
}

function issue(id, overrides = {}) {
  return {
    id, type: "missing_information", description: "Une information est en jeu pour ce livrable.",
    impact: "material", substitutable: false, recommended_treatment: "question", kind: null,
    ...overrides
  };
}

function analystOutputWith(issues) {
  return {
    operational_request_candidate: candidate(),
    provenance_records: [{ field: "objective", value: "Produire le livrable demandé.", provenance: "explicit_user_statement" }],
    issues,
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

/** Mock déterministe d'une entrée alternatives_reviewed : `available` (ou null) désigne la SEULE
 * alternative reasonably_available=true, les 5 autres restant false -- jamais toutes vraies ni
 * toutes fausses par défaut (même discipline que le prompt de production). */
function alternativesReviewed(available) {
  return Object.fromEntries(LADDER.map((t) => [t, {
    reasonably_available: t === available,
    reason: t === available ? "Cette alternative permet de poursuivre utilement le travail sans l'information manquante." : "Cette alternative ne permet aucune progression utile sur ce point précis."
  }]));
}

/** Forme du résultat BATCHÉ tel que le rendrait un exécuteur réel (issue_id -> {alternatives_reviewed,
 * available_alternative}, jamais why_available -- dérivé mécaniquement par assembleSubstitutionReviews,
 * jamais par le LLM, section 8 du lot X2-BATCH-R1, inchangé). */
function batchResultEntry(issueId, available) {
  return { [issueId]: { alternatives_reviewed: alternativesReviewed(available), available_alternative: available || null } };
}

function globalCriticRaw(overrides = {}) {
  return {
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    ...overrides
  };
}

/** Exécute le pipeline B-01B déterministe (jamais un appel réseau) : question_review_targets ->
 * résultats de batch mockés -> assembleSubstitutionReviews (inchangé, dérive why_available) ->
 * deriveCriticConsequences (inchangé) -> validateCriticOutput (inchangé). Reproduit exactement
 * l'assemblage réel de runCriticBatchedPipeline (operational-request-core.js), sans le transport ni
 * aucun appel réseau. */
function runDeterministicCriticAudit(analystOutput, availableByIssueId) {
  const targets = buildQuestionReviewTargets(analystOutput);
  const batchResults = targets.map((t) => batchResultEntry(t.issue_id, availableByIssueId[t.issue_id] ?? null));
  const assembled = assembleSubstitutionReviews(targets, batchResults);
  const derived = deriveCriticConsequences({ ...globalCriticRaw(), question_substitution_review: assembled });
  return validateCriticOutput(derived);
}

// =====================================================================================================
// 1. BUG MODULE fermé : recommended_treatment="question" exige impact="material", aux 3 rôles.
// PROOF OBLIGATION #1 : avant ce lot, cette combinaison était acceptée par normalizeRoleIssues et
// devenait STRUCTURELLEMENT INVISIBLE à toute la mécanique B-01B (buildQuestionReviewTargets filtre
// exactement impact==="material" ET recommended_treatment==="question" -- jamais examinée par
// question_substitution_review ni illegitimate_question_found). Un contournement complet et
// silencieux du mécanisme, générique à tout domaine. Après ce lot : rejetée explicitement, aux 3
// rôles qui partagent normalizeRoleIssues.
// =====================================================================================================

test("X2C-BUG-1 : AnalystOutput.issues -- une issue non_material+question est rejetée (avant ce lot : acceptée et invisible à l'audit B-01B)", () => {
  const output = { ...analystOutputWith([issue("I-1", { impact: "non_material" })]) };
  assert.throws(() => validateAnalystOutput(output), /recommended_treatment="question" exige impact="material"/);
});

test("X2C-BUG-2 : CriticOutput.missed_material_issues -- une issue non_material+question proposée par le Critic est rejetée", () => {
  const output = {
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [issue("I-1", { impact: "non_material" })] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [], illegitimate_question_found: []
  };
  assert.throws(() => validateCriticOutput(output), /recommended_treatment="question" exige impact="material"/);
});

test("X2C-BUG-3 : ArbiterOutput.issues -- une issue non_material+question conservée par l'Arbitre est rejetée", () => {
  const output = {
    state: "clarification_required",
    operational_request_candidate: candidate(),
    issues: [issue("I-1", { impact: "non_material" })],
    next_question: { text: "Quelle est la contrainte manquante ?", targets_issue_id: "I-1", expected_progress: "Débloque la suite." },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Une inconnue matérielle subsiste."
  };
  assert.throws(() => validateArbiterOutput(output), /recommended_treatment="question" exige impact="material"/);
});

test("X2C-BUG-4 : le contournement est bien fermé À LA SOURCE -- une telle issue n'entre jamais dans question_review_targets même quand elle est (à tort) présente dans un objet non validé", () => {
  // Preuve indépendante de la validation : même sans passer par normalizeRoleIssues, la projection
  // structurelle elle-même exclut déjà toute issue non matérielle -- double barrière, jamais une
  // seule ligne de défense.
  const analystOutput = analystOutputWith([
    issue("MATERIAL-1"),
    { ...issue("NONMAT-1"), impact: "non_material" } // objet brut, contourne intentionnellement la validation pour isoler CETTE barrière
  ]);
  const targets = buildQuestionReviewTargets(analystOutput);
  assert.deepEqual(targets.map((t) => t.issue_id), ["MATERIAL-1"]);
});

// =====================================================================================================
// 2. PROOF OBLIGATION #2 : une vraie question reste légitime (jamais sur-corrigée).
// Famille B / F : information réellement réservée à l'utilisateur, matérielle, sans alternative
// raisonnablement disponible -- reste question_is_last_resort=true, jamais flaguée illégitime.
// =====================================================================================================

test("X2C-FAM-B : une information matérielle sans AUCUNE alternative raisonnablement disponible reste un dernier recours légitime, jamais flaguée illégitime", () => {
  const analystOutput = analystOutputWith([issue("RESERVED-1")]);
  const output = runDeterministicCriticAudit(analystOutput, {}); // aucune alternative disponible pour RESERVED-1
  assert.equal(output.question_substitution_review[0].question_is_last_resort, true);
  assert.equal(output.illegitimate_question_found.length, 0);
  assert.equal(output.agreement, "agree", "aucun défaut détecté par ailleurs -- la seule question légitime ne doit jamais, à elle seule, provoquer un désaccord.");
});

test("X2C-FAM-F : un intrant explicitement requis mais absent reste une question légitime (même mécanique que FAM-B, cas nommé par la mission)", () => {
  const analystOutput = analystOutputWith([issue("MATERIAL-INPUT-MISSING", { description: "Un intrant explicitement requis par le livrable n'a pas été fourni." })]);
  const output = runDeterministicCriticAudit(analystOutput, {});
  assert.equal(output.question_substitution_review[0].question_is_last_resort, true);
  assert.equal(output.illegitimate_question_found.length, 0);
});

// =====================================================================================================
// 3. Famille A : préférence substituable -- question illégitime correctement détectée.
// Familles C/D/E : chacune des alternatives non-question de la ladder, individuellement.
// =====================================================================================================

test("X2C-FAM-A : une alternative DECIDE raisonnablement disponible rend la question illégitime (préférence substituable, jamais bloquante)", () => {
  const analystOutput = analystOutputWith([issue("PREF-1")]);
  const output = runDeterministicCriticAudit(analystOutput, { "PREF-1": "decide" });
  assert.equal(output.question_substitution_review[0].question_is_last_resort, false);
  assert.equal(output.illegitimate_question_found.length, 1);
  assert.equal(output.illegitimate_question_found[0].available_alternative, "decide");
  assert.equal(output.agreement, "disagree");
});

test("X2C-FAM-A-ESTIMATE : une alternative ESTIMATE raisonnablement disponible rend la question illégitime", () => {
  const analystOutput = analystOutputWith([issue("PREF-2")]);
  const output = runDeterministicCriticAudit(analystOutput, { "PREF-2": "estimate" });
  assert.equal(output.illegitimate_question_found[0].available_alternative, "estimate");
});

test("X2C-FAM-C : une alternative RESEARCH raisonnablement disponible (fait externe vérifiable) rend la question illégitime", () => {
  const analystOutput = analystOutputWith([issue("FACT-1", { type: "missing_information" })]);
  const output = runDeterministicCriticAudit(analystOutput, { "FACT-1": "research" });
  assert.equal(output.illegitimate_question_found[0].available_alternative, "research");
});

test("X2C-FAM-D : une alternative SCENARIO raisonnablement disponible rend la question illégitime", () => {
  const analystOutput = analystOutputWith([issue("MULTI-1")]);
  const output = runDeterministicCriticAudit(analystOutput, { "MULTI-1": "scenario" });
  assert.equal(output.illegitimate_question_found[0].available_alternative, "scenario");
});

test("X2C-FAM-E : une alternative CONDITION raisonnablement disponible rend la question illégitime", () => {
  const analystOutput = analystOutputWith([issue("COND-1")]);
  const output = runDeterministicCriticAudit(analystOutput, { "COND-1": "condition" });
  assert.equal(output.illegitimate_question_found[0].available_alternative, "condition");
});

test("X2C-FAM-IGNORE : une alternative LEAVE_UNKNOWN (ignorer) raisonnablement disponible, sans modifier le contrat, rend la question illégitime", () => {
  const analystOutput = analystOutputWith([issue("OPEN-1")]);
  const output = runDeterministicCriticAudit(analystOutput, { "OPEN-1": "leave_unknown" });
  assert.equal(output.illegitimate_question_found[0].available_alternative, "leave_unknown");
});

test("X2C-MIX : plusieurs issues, familles mélangées -- chacune jugée individuellement, jamais un verdict global", () => {
  const analystOutput = analystOutputWith([
    issue("LEGIT-1"),                 // aucune alternative -- reste légitime
    issue("ILLEGIT-1"),                // decide disponible -- illégitime
    issue("ILLEGIT-2")                 // research disponible -- illégitime
  ]);
  const output = runDeterministicCriticAudit(analystOutput, { "ILLEGIT-1": "decide", "ILLEGIT-2": "research" });
  const byId = Object.fromEntries(output.question_substitution_review.map((r) => [r.issue_id, r]));
  assert.equal(byId["LEGIT-1"].question_is_last_resort, true);
  assert.equal(byId["ILLEGIT-1"].question_is_last_resort, false);
  assert.equal(byId["ILLEGIT-2"].question_is_last_resort, false);
  assert.equal(output.illegitimate_question_found.length, 2);
});

// =====================================================================================================
// Famille H : une préférence non déterminante (non matérielle) ne bloque jamais readiness -- garantie
// désormais STRUCTURELLE (elle ne peut plus jamais recevoir recommended_treatment="question" du
// tout, donc ne peut jamais apparaître dans question_review_targets, donc ne peut jamais générer de
// next_question bloquant côté Arbitre).
// =====================================================================================================

test("X2C-FAM-H : une issue non matérielle ne peut structurellement plus jamais devenir une question bloquante (recommended_treatment=\"question\" lui est désormais interdit)", () => {
  for (const treatment of TREATMENT_VALUES.filter((t) => t !== "question")) {
    const analystOutput = analystOutputWith([issue("PREF-NONMAT", { impact: "non_material", recommended_treatment: treatment, substitutable: treatment !== "leave_unknown" })]);
    assert.doesNotThrow(() => validateAnalystOutput(analystOutput), `impact=non_material + recommended_treatment="${treatment}" doit rester valide (seul "question" est interdit).`);
    const targets = buildQuestionReviewTargets(analystOutput);
    assert.equal(targets.length, 0, `une issue non matérielle (traitement "${treatment}") ne doit jamais entrer dans question_review_targets.`);
  }
});

// =====================================================================================================
// Famille G : information déjà fournie -- documenté comme limite contractuelle assumée, JAMAIS
// résolue par du fuzzy matching / edit-distance (explicitement interdit par le mandat, section 4).
// La non-répétition reste gouvernée par la discipline de prompt de l'Arbitre (ARBITER_SYSTEM_PROMPT),
// qui reçoit déjà clarification_history en entier -- aucun mécanisme déterministe de comparaison de
// texte n'est ajouté ni requis par ce lot.
// =====================================================================================================

test("X2C-FAM-G : la non-répétition d'une question déjà répondue reste gouvernée par le prompt Arbitre (clarification_history complet), jamais par un mécanisme de similarité de texte", () => {
  assert.match(ARBITER_SYSTEM_PROMPT, /jamais une question déjà posée en substance/);
  assert.match(ARBITER_SYSTEM_PROMPT, /comparez le sens, jamais les mots/);
  // Aucune fonction de similarité/fuzzy/edit-distance n'existe dans operational-request-core.js pour
  // cette famille -- vérifié négativement en section "no fuzzy matching" ci-dessous.
});

// =====================================================================================================
// 4. OPRIE reste l'unique autorité de readiness ; le Critic reste un auditeur, jamais une autorité
// primaire.
// =====================================================================================================

test("X2C-AUTHORITY-1 : CriticOutput ne porte structurellement AUCUN champ de readiness (state/degraded_state) -- seul ArbiterOutput le porte", () => {
  assert.ok(!CRITIC_OUTPUT_FIELDS.includes("state"), "CriticOutput ne doit jamais porter de champ state.");
  assert.ok(ARBITER_OUTPUT_FIELDS.includes("state"), "ArbiterOutput reste la seule sortie de rôle à porter state.");
});

test("X2C-AUTHORITY-2 : agreement du Critic reste une CONDITION NÉCESSAIRE, jamais une déclaration de readiness -- CRITIC_SYSTEM_PROMPT le dit explicitement (la seule mention de operational_request_ready y est une négation d'autorité, jamais une invitation à la déclarer) ; SUBSTITUTION_REVIEW_SYSTEM_PROMPT ne mentionne aucun état OPRIE du tout (portée strictement locale à la substitution)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /votre verdict agree est une condition nécessaire, jamais une déclaration de readiness à vous seul/);
  assert.match(CRITIC_SYSTEM_PROMPT, /vous ne déclarez jamais vous-même operational_request_ready/, "la seule mention doit être une négation explicite d'autorité.");
  for (const state of ["operational_request_ready", "clarification_required", "confirmation_required", "degraded_state"]) {
    assert.doesNotMatch(SUBSTITUTION_REVIEW_SYSTEM_PROMPT, new RegExp(state), `SUBSTITUTION_REVIEW_SYSTEM_PROMPT (portée strictement locale à un lot d'issues) ne doit jamais mentionner l'état OPRIE "${state}".`);
  }
});

test("X2C-AUTHORITY-3 : illegitimate_question_found, même non vide, ne modifie jamais operational_request_candidate ni n'affecte aucune structure hors du CriticOutput lui-même", () => {
  const analystOutput = analystOutputWith([issue("X-1")]);
  const before = JSON.stringify(analystOutput);
  runDeterministicCriticAudit(analystOutput, { "X-1": "decide" });
  assert.equal(JSON.stringify(analystOutput), before, "l'audit Critic ne doit jamais muter l'AnalystOutput qu'il examine.");
});

// =====================================================================================================
// 5. Absence de règle domaine-spécifique / plafond quantitatif / nouvelle autorité sémantique dans le
// code de production touché par ce lot (grep source direct, jamais une simple affirmation).
// =====================================================================================================

test("X2C-NODOMAIN : la correction normalizeRoleIssues ne référence aucun mot-clé de domaine, aucune liste, aucun seuil numérique", () => {
  const corePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const source = fs.readFileSync(corePath, "utf8");
  const start = source.indexOf("function normalizeRoleIssues");
  const end = source.indexOf("function validateQuestionCandidate");
  assert.ok(start > 0 && end > start, "la fonction normalizeRoleIssues doit être localisable pour cette vérification.");
  const fnSource = source.slice(start, end);
  const forbidden = [/\bdate/i, /\bbudget/i, /\bdur[ée]e/i, /\bvoyage/i, /\bitalie/i, /\bmax(?:imum)?\s*=?\s*\d/i, /\bseuil/i, /\bratio/i, /\bscore\b/i, /\bsimilarit/i, /levenshtein|edit.distance|fuzzy/i];
  for (const pattern of forbidden) {
    assert.doesNotMatch(fnSource, pattern, `normalizeRoleIssues (LOT X2-C) ne doit jamais contenir ${pattern}.`);
  }
});

test("X2C-NOFUZZY : operational-request-core.js ne contient, dans son ensemble, aucun mécanisme de fuzzy matching / edit-distance / embedding pour la légitimité des questions", () => {
  const corePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const source = fs.readFileSync(corePath, "utf8");
  for (const pattern of [/levenshtein/i, /edit.distance/i, /\bembedding/i, /cosine.similarity/i, /\bfuzzy/i]) {
    assert.doesNotMatch(source, pattern, `operational-request-core.js ne doit jamais contenir ${pattern} (mandat X2-C, section 4).`);
  }
});

test("X2C-NOCEILING : aucune constante de plafond quantitatif de questions (nombre min/max) n'a été introduite", () => {
  const corePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const source = fs.readFileSync(corePath, "utf8");
  for (const pattern of [/MAX_QUESTIONS/i, /MIN_QUESTIONS/i, /QUESTION_LIMIT/i, /MAX_ISSUES/i]) {
    assert.doesNotMatch(source, pattern);
  }
});

// =====================================================================================================
// 6. Aucun impact HTTP/provider (LOT HTTP-8192a GELÉ, jamais réouvert par ce lot).
// =====================================================================================================

test("X2C-NOIMPACT-HTTP : TRANSPORT_LIMITS reste exactement celui gelé par HTTP-8192a, inchangé par ce lot", () => {
  assert.deepEqual(TRANSPORT_LIMITS, Object.freeze({ decision: 16384, analyst: 16384, critic: 65536, arbiter: 196608, absolute: 262144 }));
});
