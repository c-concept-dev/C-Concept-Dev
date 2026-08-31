// LOT X2-A-R2 — Probe empirique $defs/$ref chez Groq.
//
// Expérience ISOLÉE, jamais du code de production : construit une version FACTORISÉE (JSON Schema
// $defs + $ref) du sous-schéma dynamique question_substitution_review de X2-A, pour tester
// empiriquement si Groq accepte $defs/$ref et si la réduction de taille mesurée en simulation pure
// (X2-A-R1, ~52% sur le sous-schéma, ~15% sur le body complet) se confirme et suffit à repasser sous
// la limite TPM observée (Requested: 8830 pour Limit: 8000 avec le schéma dupliqué actuel).
//
// Contrairement à X1/X1-E (qui redéfinissaient localement les six alternatives pour une isolation
// complète du mécanisme de cardinalité), ce probe teste une restructuration du CONTRAT RÉEL X2-A —
// il importe donc en LECTURE SEULE TREATMENT_VALUES depuis workers/shared/operational-request-core.js
// (la seule source canonique de la ladder), jamais une deuxième liste dupliquée. Aucune écriture,
// aucun appel de fonction de production : uniquement la lecture d'une constante exportée.
//
// Sémantique préservée à l'identique de X2-A : chaque issue_id référence (via $ref) UNE définition
// partagée { alternatives_reviewed: {six alternatives}, question_is_last_resort, available_alternative }
// — mêmes trois clés, mêmes six alternatives, même additionalProperties:false à tous les niveaux, que
// buildQuestionSubstitutionReviewEntrySchema() en production. Seule la FACTORISATION change : au lieu
// de dupliquer cette définition une fois par issue_id, elle n'existe qu'une seule fois sous $defs,
// référencée N fois par $ref — jamais une deuxième sémantique, jamais un champ D modifié.

import { TREATMENT_VALUES, buildCriticJsonSchema } from "../../../workers/shared/operational-request-core.js";

export const LADDER_ALTERNATIVE_VALUES_R2 = Object.freeze(TREATMENT_VALUES.filter((value) => value !== "question"));

/**
 * Définition partagée d'une seule alternative de la ladder : {reasonably_available, reason}.
 * Identique en substance à la sous-structure de production (workers/shared/operational-request-core.js),
 * jamais importée en tant que fonction — seule la LISTE canonique des alternatives (TREATMENT_VALUES)
 * est réutilisée, pour ne jamais introduire une deuxième source de vérité sur la ladder.
 */
function buildAlternativeReviewSchemaR2() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["reasonably_available", "reason"],
    properties: {
      reasonably_available: { type: "boolean" },
      reason: { type: "string", minLength: 1 }
    }
  };
}

/**
 * Définition partagée UNIQUE d'une entrée de review (une par issue_id) : { alternatives_reviewed,
 * question_is_last_resort, available_alternative } — mêmes trois clés que production (X2-A), jamais
 * D modifié. Cette définition n'est construite qu'UNE SEULE FOIS par buildRefQuestionSubstitutionReviewSchema
 * (placée sous $defs), quel que soit le nombre de targets — c'est précisément le point testé par R2.
 */
export function buildReviewEntryDefinitionR2() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["alternatives_reviewed", "question_is_last_resort", "available_alternative"],
    properties: {
      alternatives_reviewed: {
        type: "object",
        additionalProperties: false,
        required: [...LADDER_ALTERNATIVE_VALUES_R2],
        properties: Object.fromEntries(LADDER_ALTERNATIVE_VALUES_R2.map((alternative) => [alternative, buildAlternativeReviewSchemaR2()]))
      },
      question_is_last_resort: { type: "boolean" },
      available_alternative: { type: ["string", "null"], enum: [...LADDER_ALTERNATIVE_VALUES_R2, null] }
    }
  };
}

/**
 * Sous-schéma factorisé de question_substitution_review : chaque clé issue_id est une simple
 * référence `$ref: "#/$defs/reviewEntry"` — jamais la définition complète recopiée. Important : ce
 * sous-schéma ne porte PAS lui-même de `$defs` local. Par la spécification JSON Schema, un `$ref`
 * de la forme "#/$defs/reviewEntry" est un JSON Pointer résolu depuis la RACINE du document de
 * schéma tout entier (celui envoyé au provider), jamais depuis le sous-schéma qui le contient — la
 * définition partagée doit donc être placée à la racine du schéma Critic complet
 * (buildCriticJsonSchemaR2 ci-dessous), jamais nichée ici.
 */
export function buildRefQuestionSubstitutionReviewSchema(questionReviewTargets) {
  const issueIds = (Array.isArray(questionReviewTargets) ? questionReviewTargets : [])
    .map((target) => target && target.issue_id)
    .filter((issueId) => typeof issueId === "string" && issueId.length > 0);

  const properties = Object.fromEntries(issueIds.map((issueId) => [issueId, { $ref: "#/$defs/reviewEntry" }]));

  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties
  };
}

/**
 * Assemble le schéma Critic complet (les 9 propriétés du contrat réel X2-A), en réutilisant
 * buildCriticJsonSchema de production TEL QUEL (lecture seule, jamais modifié, jamais réécrit) pour
 * les 8 propriétés inchangées, et en remplaçant uniquement question_substitution_review par sa forme
 * factorisée $defs/$ref. `$defs.reviewEntry` est placé à la RACINE du schéma retourné — le seul
 * emplacement où "#/$defs/reviewEntry" se résout correctement selon la spécification JSON Schema.
 * Comparable directement à buildCriticJsonSchema(questionReviewTargets) (X2-A réel, sans $ref) : même
 * sémantique de cardinalité (additionalProperties:false, required===Object.keys(properties) à tous
 * les niveaux), seule la forme change.
 */
export function buildCriticJsonSchemaR2(questionReviewTargets) {
  const baseSchema = buildCriticJsonSchema(questionReviewTargets);
  const issueIds = (Array.isArray(questionReviewTargets) ? questionReviewTargets : [])
    .map((target) => target && target.issue_id)
    .filter((issueId) => typeof issueId === "string" && issueId.length > 0);

  if (issueIds.length === 0) {
    // N=0 : même court-circuit déterministe que la production (aucun $defs inutile envoyé).
    return { ...baseSchema };
  }

  return {
    type: baseSchema.type,
    additionalProperties: baseSchema.additionalProperties,
    required: baseSchema.required,
    $defs: { reviewEntry: buildReviewEntryDefinitionR2() },
    properties: {
      ...baseSchema.properties,
      question_substitution_review: buildRefQuestionSubstitutionReviewSchema(questionReviewTargets)
    }
  };
}
