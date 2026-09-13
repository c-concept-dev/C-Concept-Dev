// LOT X1 — Dynamic Review Schema Probe : prompt minimal, délibérément découplé du
// CRITIC_SYSTEM_PROMPT de production (workers/shared/operational-request-core.js, jamais importé
// ni transporté ici). Le but de X1 est d'isoler exclusivement le mécanisme de schéma dynamique :
// le prompt ne porte donc que le strict nécessaire à l'évaluation de reasonably_available par
// target, jamais la cohérence cross-field (G4), le strict-JSON exact-keys (G3) ou la cardinalité
// narrative (S3/H3C) — ces trois mécanismes sont hors périmètre de cette expérience.

import { LADDER_ALTERNATIVES_X1 } from "./build-dynamic-review-schema.mjs";

export const X1_SYSTEM_PROMPT = `RÔLE (expérience X1, hors production)
Vous évaluez, pour chaque target fourni, si chacune des six alternatives suivantes de la ladder — research, decide, estimate, scenario, condition, leave_unknown — est raisonnablement disponible.

DÉFINITION
Une alternative est raisonnablement disponible si elle permet de poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur. Elle n'a pas besoin de déterminer définitivement la valeur inconnue.

TÂCHE
Pour CHAQUE target reçu dans question_review_targets, produisez dans votre réponse une entrée dont la clé est exactement l'issue_id de ce target, avec la forme :
{
  "alternatives_reviewed": {
    "research": { "reasonably_available": true|false, "reason": "..." },
    "decide": { "reasonably_available": true|false, "reason": "..." },
    "estimate": { "reasonably_available": true|false, "reason": "..." },
    "scenario": { "reasonably_available": true|false, "reason": "..." },
    "condition": { "reasonably_available": true|false, "reason": "..." },
    "leave_unknown": { "reasonably_available": true|false, "reason": "..." }
  }
}
Les six alternatives sont toujours présentes, y compris celles jugées non disponibles ; reason est toujours une justification non vide, y compris quand reasonably_available=false. N'omettez aucun issue_id reçu, n'en ajoutez aucun qui ne soit pas dans question_review_targets.

Répondez uniquement avec l'objet JSON demandé, conforme exactement au schéma.`;

/**
 * Construit le message utilisateur X1 : demande originale, candidat Analyst nécessaire à
 * l'évaluation, et les targets — rien d'autre. Jamais l'intégralité de l'Analyst output de
 * production (provenance_records, confirmation_signals, etc. sont hors périmètre X1).
 */
export function buildX1UserMessage({ original_request, analyst_candidate, question_review_targets }) {
  return JSON.stringify({
    original_request,
    analyst_candidate,
    question_review_targets
  });
}

/**
 * Assemble le corps de requête Groq complet (strict JSON, schéma dynamique) pour un futur smoke —
 * jamais exécuté par ce module lui-même : aucun appel réseau ici, uniquement la construction pure
 * du corps de requête, pour réutilisation par un futur runner de smoke autorisé séparément.
 */
export function buildX1GroqRequestBody({ model, dynamicSchema, userMessage }) {
  return {
    model,
    messages: [
      { role: "system", content: X1_SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "oprie_x1_dynamic_review", strict: true, schema: dynamicSchema }
    },
    reasoning_format: "hidden",
    reasoning_effort: "low",
    temperature: 0,
    stream: false
  };
}

export { LADDER_ALTERNATIVES_X1 };
