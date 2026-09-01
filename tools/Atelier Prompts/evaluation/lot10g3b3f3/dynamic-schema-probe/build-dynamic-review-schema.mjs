// LOT X1 — Dynamic Review Schema Probe.
//
// Expérience ISOLÉE, jamais du code de production. Ce module ne fait qu'une chose : construire,
// PROGRAMMATIQUEMENT à partir d'une liste de targets fournie à l'exécution, un JSON Schema strict
// dans lequel chaque issue_id devient une clé de propriété explicite et obligatoire d'un objet
// (au lieu du tableau `question_substitution_review` de production). Question expérimentale unique :
// un provider en mode JSON Schema strict peut-il être structurellement contraint à produire
// exactement une entrée par target dynamique, sans dépendre d'une instruction textuelle de
// cardinalité (contrairement à S3/H3C, qui reposent sur le LLM pour respecter la cardinalité) ?
//
// Ce module n'importe rien du contrat de production (module partagé sous workers/shared/) : cette
// expérience doit rester entièrement découplée de ce contrat (schéma, validateur, scorer), qu'elle
// ne modifie ni ne consulte. Les six alternatives de la ladder sont redéfinies ici localement
// (dupliquées volontairement, jamais importées) pour garantir l'isolation complète de l'expérience.
//
// Interdits (invariants du lot) : aucun hardcoding métier, aucun issue_id reconstruit à partir
// d'une ressemblance approximative de chaînes ou d'une mesure de proximité entre textes, aucune
// représentation vectorielle d'aucune sorte — la seule source de vérité est le champ `issue_id`
// fourni tel quel par l'appelant, jamais réinterprété ni normalisé.

export const LADDER_ALTERNATIVES_X1 = Object.freeze([
  "research",
  "decide",
  "estimate",
  "scenario",
  "condition",
  "leave_unknown"
]);

/**
 * Schéma d'une seule alternative de la ladder : {reasonably_available, reason}, rien d'autre.
 * minLength:1 sur reason est documenté ici comme défense en profondeur non vérifiée empiriquement
 * (même caveat que P1 sur ProvenanceRecord.value : la portée exacte des mots-clés JSON Schema
 * réellement appliqués par le mode strict d'un provider n'est pas garantie au-delà de
 * required/additionalProperties/type).
 */
function buildAlternativeReviewSchemaX1() {
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
 * Schéma d'une seule entrée de review (une par issue_id) : { alternatives_reviewed: { six clés } }.
 * Volontairement MINIMAL par rapport au contrat de production (G3/G4) : aucun question_is_last_resort,
 * aucun available_alternative, aucun champ cross-field — l'expérience X1 teste uniquement le
 * mécanisme de schéma dynamique, jamais une dépendance sémantique entre champs.
 */
export function buildReviewEntrySchemaX1() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["alternatives_reviewed"],
    properties: {
      alternatives_reviewed: {
        type: "object",
        additionalProperties: false,
        required: [...LADDER_ALTERNATIVES_X1],
        properties: Object.fromEntries(
          LADDER_ALTERNATIVES_X1.map((alternative) => [alternative, buildAlternativeReviewSchemaX1()])
        )
      }
    }
  };
}

/**
 * Construit dynamiquement le schéma JSON de question_substitution_review-as-objet pour EXACTEMENT
 * les issue_id présents dans questionReviewTargets, à l'exécution — jamais une liste codée en dur.
 * `required` est reconstruit à partir des mêmes clés que `properties` (jamais une liste séparée
 * maintenue à la main), garantissant par construction required === Object.keys(properties).
 *
 * @param {Array<{issue_id: string}>} questionReviewTargets - forme identique à
 *   question_review_targets de production (seul issue_id est lu ici ; les autres champs, s'ils sont
 *   présents, sont ignorés et n'influencent jamais le schéma — aucune reconstruction depuis
 *   description/type, aucune ressemblance approximative de texte, aucune représentation vectorielle).
 * @returns {object} JSON Schema strict : { type: "object", additionalProperties: false,
 *   required: [...issueIds], properties: { [issueId]: reviewEntrySchema } }
 */
export function buildDynamicReviewSchema(questionReviewTargets) {
  const issueIds = (Array.isArray(questionReviewTargets) ? questionReviewTargets : [])
    .map((target) => target && target.issue_id)
    .filter((issueId) => typeof issueId === "string" && issueId.length > 0);

  const properties = Object.fromEntries(
    issueIds.map((issueId) => [issueId, buildReviewEntrySchemaX1()])
  );

  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties
  };
}
