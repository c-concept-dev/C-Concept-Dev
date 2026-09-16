/* PERF-04 — PORTE D'ENTRÉE RÉSEAU DU PLAN RAPIDE
 * ============================================================================
 *
 * PERF-03A a construit le plan rapide et l'a laissé injoignable : le worker ne
 * routait que /operational-request. Ce module lui donne son unique porte, et
 * rien de plus.
 *
 * Ce qu'il n'est pas, et ne doit jamais devenir :
 *
 *   UNE AUTORITÉ. La réponse rendue ici ne porte que les champs du schéma — un
 *   type d'interaction, un texte, et ce que la question INTERROGE depuis
 *   V2.2.1-D2F1. Elle ne peut pas transporter un état OPRIE, une route, une
 *   readiness : le schéma de PERF-03A les refuse par construction, et cette
 *   route ne l'élargit pas. Dire ce qu'une question interroge n'est pas décider :
 *   c'est le fait sans lequel le garde d'affichage échoue fermé, faute de savoir.
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
      canonical_version: body.canonical_version === undefined ? 0 : body.canonical_version,
      material_present: body.material_present === true
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
    /* V2.1 — LE COÛT D'UN TOUR DE CLARIFICATION, MESURÉ LÀ OÙ IL EST PAYÉ.
       Le contrat de fluidité vise 1 à 2 s par tour de dialogue ; il n'était mesurable que côté
       profond. Ce relevé dit ce qu'un tour de clarification a réellement coûté : un appel rapide,
       zéro appel profond, et la durée. Des compteurs et des millisecondes, jamais un contenu. */
    const debutFast = Date.now();
    const brut = await executeFast(snapshot, env, ...(log ? [{ log }] : []));
    const verdict = validateFastInteraction(brut, snapshot);
    if (typeof log === "function") {
      log({
        event: "clarification_turn_cost", plane: "fast",
        fast_duration_ms: Date.now() - debutFast,
        clarification_turn_duration_ms: Date.now() - debutFast,
        core_duration_ms: 0, provider_calls: 1,
        fast_calls: 1, core_calls: 0, critic_calls: 0, arbiter_calls: 0,
        /* Le TYPE suffit : qui lit ce relevé sait quels types sollicitent. Importer la politique
           d'atomicité ici ferait entrer une dépendance que cette porte n'a pas à connaître. */
        interaction_type: verdict.ok ? verdict.interaction.type : null
      });
    }
    if (!verdict.ok) {
      /* Une sortie non conforme n'est jamais réparée, jamais approchée : elle
         est refusée. Le plan profond, lui, continue côté client.

         BETA-04 : la RAISON du refus était calculée puis jetée. Sur le runtime déployé, cinq
         demandes sur huit ont reçu FAST_SCHEMA_ERROR sans qu'aucun journal ne dise pourquoi — un
         échec muet est un échec qu'on ne corrige pas. Ce qui remonte est ce que la validation a
         constaté : des noms de clés, ou le type inconnu que le modèle a proposé. Jamais le texte
         produit, jamais un mot de la personne. */
      if (typeof log === "function") {
        log({ event: "fast_interaction_rejected", reason: verdict.reason, detail: verdict.detail || null });
      }
      return jsonResponse({ error: verdict.reason, message: "L'interaction rapide n'est pas exploitable." }, 502, cors);
    }
    /* Seuls les champs du schéma repartent. Les champs d'audit produits par
       la validation (turn_id, authority, can_*) restent internes : les exposer
       inviterait un client à les lire comme une permission.

       RUNTIME-01 — ILS ÉTAIENT DEUX, LE SCHÉMA EN COMPTE TROIS DEPUIS V2.2.1-D2F1.
       Mesuré sur le Worker déployé : cinq ASK_CLARIFICATION réelles, zéro `question_focus` rendu.
       Le fait était produit, validé, posé sur l'interaction — puis laissé ici. Le client le lit en
       tolérant, recevait donc null, et `isMetaOutputQuestion` échoue FERMÉ sans fait déclaré : le
       garde de D2F1 ne se trompait pas sur le plan rapide, il ne s'exécutait jamais.

       Ce qui part ici est recopié, jamais recalculé : `question_focus` vaut ce que le plan rapide
       a écrit, et null quand il n'a rien déclaré. Le champ reste PRÉSENT dans ce cas — le schéma
       l'exige et l'autorise à null : une absence dite vaut mieux qu'une absence à deviner. */
    return jsonResponse({
      type: verdict.interaction.type,
      text: verdict.interaction.text,
      question_focus: verdict.interaction.question_focus,
      /* TARGETED-FIX-POST-CODEX-01 — l'identité du manque repart avec la question. Sans elle,
         l'historique perdait ce que la question cherchait, et une reformulation ultérieure du même
         manque redevenait invisible. Recopiée, jamais recalculée. */
      missing_determinant_id: verdict.interaction.missing_determinant_id
    }, 200, cors);
  } catch (error) {
    /* V2.1.1 — POURQUOI CE TOUR N'A PAS EU DE PLAN RAPIDE.
       Mesuré : le budget de jetons du fournisseur rapide s'épuise après quelques tours de dialogue,
       la chaîne s'épuise en ~150 ms, et le client escalade alors vers le plan profond — environ
       quinze secondes pour obtenir une question. Le tour paraissait « lent » ; il était en réalité
       SANS plan rapide. Ce relevé nomme la cause, avec ce que le fournisseur a réellement annoncé. */
    if (typeof log === "function") {
      log({
        event: "fast_unavailable",
        provider_attempts: Array.isArray(error?.attempts) ? error.attempts.length : null,
        all_providers_failed: error?.all_providers_failed === true,
        rate_limited: error?.rateLimited === true,
        retry_count: Number.isFinite(error?.retries) ? error.retries : null,
        retry_after_ms: Number.isFinite(error?.provider_announced_retry_after_ms)
          ? error.provider_announced_retry_after_ms : null,
        wait_too_long: error?.wait_too_long === true,
        error_kind: typeof error?.error_kind === "string" ? error.error_kind : null,
        fallback_provider: null,
        core_calls: 0, critic_calls: 0, arbiter_calls: 0,
        consequence: "LE CLIENT ESCALADE VERS LE PLAN PROFOND"
      });
    }
    if (error instanceof DecisionHttpError) return jsonResponse({ error: error.code, message: error.message }, error.status, cors);
    console.error(JSON.stringify({ event: "fast_interaction_error", message: error instanceof Error ? error.message : "unknown" }));
    return jsonResponse({ error: "fast_interaction_failure", message: "L'interaction rapide n'a pas pu être produite." }, 502, cors);
  }
}
