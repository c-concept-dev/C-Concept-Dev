/* PERF-04 — PORTE D'ENTRÉE RÉSEAU DU PLAN RAPIDE
 * ============================================================================
 *
 * PERF-03A a construit le plan rapide et l'a laissé injoignable : le worker ne
 * routait que /operational-request. Ce module lui donne son unique porte, et
 * rien de plus.
 *
 * Ce qu'il n'est pas, et ne doit jamais devenir :
 *
 *   UNE AUTORITÉ. La réponse rendue ici ne porte que deux champs — un type
 *   d'interaction et un texte. Elle ne peut pas transporter un état OPRIE, une
 *   route, une readiness : le schéma de PERF-03A les refuse par construction,
 *   et cette route ne l'élargit pas.
 *
 *   UN SECOND ORCHESTRATEUR. Elle n'appelle ni Analyste, ni Critique, ni
 *   Arbitre. Elle ne lit pas /operational-request, ne le double pas, ne le
 *   remplace pas. Les deux routes sont indépendantes parce que les deux plans
 *   le sont.
 *
 *   UNE NOUVELLE POLITIQUE FOURNISSEUR. L'exécution passe par la chaîne HA
 *   existante (Groq -> Anthropic -> OpenAI), le contrôle de débit M-03 et les
 *   sorties structurées M-01, tels quels.
 *
 * FAIL-CLOSED : toute anomalie — corps illisible, instantané invalide, sortie
 * non conforme, chaîne fournisseur épuisée — rend une erreur. Aucune
 * interaction n'est jamais fabriquée ici pour avoir quelque chose à rendre.
 * ========================================================================= */

import {
  DecisionHttpError,
  TRANSPORT_LIMITS,
  corsHeaders,
  jsonResponse,
  readJsonBody
} from "./decision-core.js";
import { createTurnSnapshot, validateFastInteraction } from "./fast-interactive-plane.js";

export const FAST_INTERACTION_PATHNAME = "/fast-interaction";

/**
 * Construit l'instantané de tour à partir du corps reçu.
 *
 * La validation n'est pas réécrite ici : `createTurnSnapshot` est le SEUL
 * endroit qui décide ce qu'est un instantané valide, exactement comme côté
 * navigateur. Un corps invalide devient une erreur de transport, jamais un
 * instantané complété par des valeurs par défaut.
 */
export function snapshotFromBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DecisionHttpError(400, "invalid_body", "Le corps de la requête doit être un objet JSON.");
  }
  try {
    return createTurnSnapshot({
      turn_id: body.turn_id,
      original_request: body.original_request,
      clarification_history: Array.isArray(body.clarification_history) ? body.clarification_history : [],
      current_answer: body.current_answer === undefined ? null : body.current_answer,
      canonical_version: body.canonical_version === undefined ? 0 : body.canonical_version
    });
  } catch (error) {
    throw new DecisionHttpError(400, "invalid_turn_snapshot", error instanceof Error ? error.message : "Instantané de tour invalide.");
  }
}

/**
 * POST /fast-interaction — un instantané entre, une interaction candidate sort.
 *
 * La sortie est REVALIDÉE contre l'instantané avant d'être rendue : ce que le
 * fournisseur a produit n'est pas ce que le client reçoit tant que le schéma
 * non-autoritaire n'a pas été vérifié. Le client la revalidera de son côté —
 * cette double vérification n'est pas une redondance, c'est le refus de faire
 * confiance à un maillon qu'on ne contrôle pas.
 */
export async function handleFastInteractionRequest(request, env, { executeFast, log } = {}) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") {
    return cors ? new Response(null, { status: 204, headers: cors }) : jsonResponse({ error: "origin_not_allowed" }, 403, null);
  }
  if (url.pathname !== FAST_INTERACTION_PATHNAME) return jsonResponse({ error: "not_found" }, 404, cors);
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, cors);
  if (!cors) return jsonResponse({ error: "origin_not_allowed" }, 403, null);
  if (typeof executeFast !== "function") {
    return jsonResponse({ error: "fast_interaction_unavailable", message: "Le plan rapide n'est pas configuré." }, 503, cors);
  }
  try {
    const snapshot = snapshotFromBody(await readJsonBody(request, TRANSPORT_LIMITS.analyst));
    const brut = await executeFast(snapshot, env, ...(log ? [{ log }] : []));
    const verdict = validateFastInteraction(brut, snapshot);
    if (!verdict.ok) {
      /* Une sortie non conforme n'est jamais réparée, jamais approchée : elle
         est refusée. Le plan profond, lui, continue côté client. */
      return jsonResponse({ error: verdict.reason, message: "L'interaction rapide n'est pas exploitable." }, 502, cors);
    }
    /* Seuls les deux champs du schéma repartent. Les champs d'audit produits par
       la validation (turn_id, authority, can_*) restent internes : les exposer
       inviterait un client à les lire comme une permission. */
    return jsonResponse({ type: verdict.interaction.type, text: verdict.interaction.text }, 200, cors);
  } catch (error) {
    if (error instanceof DecisionHttpError) return jsonResponse({ error: error.code, message: error.message }, error.status, cors);
    console.error(JSON.stringify({ event: "fast_interaction_error", message: error instanceof Error ? error.message : "unknown" }));
    return jsonResponse({ error: "fast_interaction_failure", message: "L'interaction rapide n'a pas pu être produite." }, 502, cors);
  }
}
