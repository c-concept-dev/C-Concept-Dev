import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCandidate } from "../core/adn/index.js";
import { buildSubstitutionBatchSchema, buildQuestionReviewTargets } from "../workers/shared/operational-request-core.js";
import { runCriticWithGroq } from "../workers/groq/src/index.js";

// LOT X2-C.1 — B-01B CLOSURE PROOF (correction d'un audit indépendant sur X2-C).
//
// CONSTAT CORRIGÉ : les tests X2-C (tests/operational-request-critic-b01b-semantic-closure-x2c.test.mjs,
// fonction locale runDeterministicCriticAudit) appelaient directement deriveCriticConsequences en lui
// fournissant alternatives_reviewed/reasonably_available DÉJÀ DÉCIDÉS par le test lui-même. Cela prouve
// que l'assemblage + la dérivation + la validation sont corrects UNE FOIS le jugement déjà rendu —
// jamais que le système sait RENDRE ce jugement. C'est exactement la distinction que ce lot corrige.
//
// CE QUE CE FICHIER AJOUTE (jamais un remplacement de X2-C, qui reste correct pour ce qu'il prouve) :
// exerce runCriticWithGroq (chemin RÉEL de production, inchangé) via un fetch mocké au niveau HTTP —
// jamais un appel direct à deriveCriticConsequences. Le pipeline réel construit lui-même la requête
// (schéma buildSubstitutionBatchSchema réel, prompt réel), et c'est SEULEMENT la réponse HTTP simulée
// (ce qu'un provider répondrait) qui porte le jugement — jamais une valeur injectée dans une structure
// interne du pipeline. Ceci exerce fidèlement : target -> Substitution Review (requête réelle) ->
// structured result (réponse HTTP) -> assembly -> derive -> validate.
//
// LIMITE HONNÊTEMENT DOCUMENTÉE (jamais dissimulée) : deriveCriticConsequences est par construction
// (X2-B) une fonction PURE qui reçoit alternatives_reviewed/reasonably_available déjà décidés — c'est
// son contrat même, pas un raccourci de test. Aucun test local, quel que soit son niveau (direct ou via
// fetch mocké), ne peut donc faire émerger CE jugement sans un vrai appel LLM : SEIT il est injecté par
// le test (comme ici, au niveau du corps de réponse HTTP simulée, jamais plus profond), SOIT il vient
// d'un provider réel. Ce fichier prouve que le CONTRAT (schéma, requête, assemblage, dérivation,
// validation) est fidèlement exercé de bout en bout ; il ne prouve PAS, et ne peut PAS prouver
// localement, que le jugement de substituabilité produit par un LLM réel serait correct. Cette limite
// est classifiée explicitement SEMANTIC_PROVIDER_LIMIT dans le rapport de ce lot.
//
// Aucun mot métier de production n'est introduit dans du CODE : le texte des deux cas ci-dessous
// réutilise un contre-exemple historique générique (fixture evaluation/lot10g3b3f3/fixtures/
// critic-b01b-sentinel.json, "type de voyage" et "budget disponible") uniquement comme TEXTE de
// fixture de preuve, jamais comme règle de production (section 4 du mandat).

function candidate() {
  return { ...createEmptyCandidate(), objective: "Produire le livrable demandé." };
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

function withGroqFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}
function groqResponse(contentObj, status = 200) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(contentObj) } }] }, { status });
}
function schemaNameOf(options) { return JSON.parse(options.body).response_format.json_schema.name; }
function schemaOf(options) { return JSON.parse(options.body).response_format.json_schema.schema; }
function issueIdsOf(options) { return Object.keys(schemaOf(options).properties); }
function globalOutputFixture() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}

/** Réponse HTTP simulée d'UN batch de Substitution Review -- la SEULE couche qui porte le jugement de
 * substituabilité dans ce fichier (jamais une structure interne du pipeline). Depuis X2-C.4, le
 * provider produit des candidates matérialisées (jamais alternatives_reviewed/available_alternative
 * directement) : `available` (ou null) désigne la SEULE famille dont les 5 conditions du Substitution
 * Gate candidate-level sont réunies. */
function substitutionBatchResponse(issueIds, available) {
  const body = {};
  for (const id of issueIds) {
    body[id] = {
      candidates: Object.fromEntries(LADDER.map((t) => [t, t === available
        ? {
            candidate_action: `Action concrète via ${t}.`,
            applicable: true, preserves_objective: true, requires_user_reserved_choice: false,
            contradicts_known_facts: false, produces_complete_deliverable: true,
            justification: "Cette alternative permet de poursuivre utilement le travail sans l'information manquante."
          }
        : {
            candidate_action: null,
            applicable: false, preserves_objective: false, requires_user_reserved_choice: false,
            contradicts_known_facts: false, produces_complete_deliverable: false,
            justification: "Cette alternative ne permet aucune progression utile sur ce point précis."
          }]))
    };
  }
  return groqResponse(body);
}

// =====================================================================================================
// CAS A -- SUBSTITUABLE (contre-exemple historique générique réutilisé comme fixture de preuve,
// jamais comme règle de production) : une issue matérielle+question, exercée par le vrai pipeline
// HTTP (schéma réel, requête réelle), où le fetch mocké répond qu'une alternative est disponible.
// =====================================================================================================

test("X2C1-CAS-A : une issue material+question, exercée via runCriticWithGroq réel (requête HTTP réelle, schéma réel) -- une alternative disponible produit question_is_last_resort=false et illegitimate_question_found", async (t) => {
  const analystOutput = analystOutputWith([
    { id: "issue-type", type: "ambiguity", description: "Le type de voyage (tourisme, affaires, famille, etc.) n'est pas spécifié.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }
  ]);
  let capturedRequestSchema = null;
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    capturedRequestSchema = schemaOf(options);
    return substitutionBatchResponse(issueIdsOf(options), "scenario");
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: async () => {} } }
  );

  // Le schéma RÉELLEMENT envoyé au provider (jamais reconstruit par le test) force la présence des 6
  // alternatives pour cette issue -- une garantie STRUCTURELLE, non injectée, vérifiable indépendamment
  // du contenu de la réponse mockée.
  assert.deepEqual(capturedRequestSchema, buildSubstitutionBatchSchema(["issue-type"]));

  assert.equal(output.question_substitution_review.length, 1);
  assert.equal(output.question_substitution_review[0].question_is_last_resort, false);
  assert.equal(output.illegitimate_question_found.length, 1);
  assert.equal(output.illegitimate_question_found[0].issue_id, "issue-type");
  assert.equal(output.illegitimate_question_found[0].available_alternative, "scenario");
});

// =====================================================================================================
// CAS B -- NON SUBSTITUABLE : même chemin réel, où le fetch mocké répond honnêtement qu'aucune des 6
// alternatives n'est disponible (cas générique d'une information réellement réservée à l'utilisateur).
// =====================================================================================================

test("X2C1-CAS-B : une issue material+question, exercée via runCriticWithGroq réel -- aucune alternative disponible produit question_is_last_resort=true, jamais de illegitimate_question_found", async (t) => {
  const analystOutput = analystOutputWith([
    { id: "issue-budget", type: "missing_information", description: "Le budget disponible pour ce projet n'est pas défini.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }
  ]);
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    return substitutionBatchResponse(issueIdsOf(options), null); // les 6 alternatives sont honnêtement false
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: async () => {} } }
  );
  assert.equal(output.question_substitution_review[0].question_is_last_resort, true);
  assert.equal(output.illegitimate_question_found.length, 0);
  assert.equal(output.agreement, "agree", "aucun autre défaut par ailleurs -- une question légitime unique ne doit jamais, à elle seule, produire un désaccord.");
});

// =====================================================================================================
// Garantie STRUCTURELLE indépendante du contenu du jugement : le schéma réellement transmis force la
// présence des 6 alternatives pour CHAQUE issue material+question, quel que soit ce qu'un provider réel
// répondrait -- vérifiable sans jamais connaître ni injecter la réponse.
// =====================================================================================================

test("X2C1-SCHEMA : le schéma réellement envoyé au provider exige structurellement les 6 alternatives de la ladder pour chaque issue material+question, indépendamment de tout jugement", async (t) => {
  const analystOutput = analystOutputWith([
    { id: "A", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null },
    { id: "B", type: "missing_information", description: "y", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }
  ]);
  const expectedTargets = buildQuestionReviewTargets(analystOutput);
  let capturedSchema = null;
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    capturedSchema = schemaOf(options);
    return substitutionBatchResponse(issueIdsOf(options), null);
  });
  await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: async () => {} } }
  );
  const expectedSchema = buildSubstitutionBatchSchema(expectedTargets.map((t) => t.issue_id));
  assert.deepEqual(capturedSchema, expectedSchema);
  for (const issueId of expectedTargets.map((t) => t.issue_id)) {
    assert.deepEqual(
      Object.keys(capturedSchema.properties[issueId].properties.candidates.properties).sort(),
      [...LADDER].sort(),
      "le schéma réel exige les 6 candidates, structurellement, sans dépendre du contenu de la réponse."
    );
  }
});
