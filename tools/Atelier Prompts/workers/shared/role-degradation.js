import { createDegradedRoleResult } from "./operational-request-core.js";
import { FAILURE_CLASSES } from "./provider-ha.js";

/**
 * HA-02 — TRADUCTION d'un échec technique de chaîne en état DÉGRADÉ canonique.
 *
 * Ce module est une CHARNIÈRE, pas une autorité. Il ne décide rien : il traduit une constatation
 * technique (« aucun fournisseur n'a répondu pour ce rôle ») dans la seule forme que le contrat OPRIE
 * connaît déjà — createDegradedRoleResult (operational-request-core.js, INCHANGÉ par ce lot). Aucune
 * nouvelle shape n'est inventée : la shape canonique {role, state:"degraded_state", reason} existait
 * avant HA-02 et reste l'unique représentation.
 *
 * Ce qu'il ne fait JAMAIS :
 *   - produire operational_request_ready, clarification_required, confirmation_required ou blocked ;
 *   - produire une route, une question, un verdict, un candidat ou une valeur métier quelconque ;
 *   - décider de l'EXPOSITION sémantique de la dégradation — cela appartient à l'orchestration OPRIE,
 *     qui reste souveraine (la machine d'état interdit déjà degraded_state -> operational_request_ready,
 *     cf. core/adn/operational-request-state.js, non modifié).
 *
 * Ce qu'il transmet : STRICTEMENT le nom des providers tentés et leur classe d'échec, deux
 * énumérations fermées. Jamais un secret, jamais un prompt, jamais un message d'erreur provider,
 * jamais une réponse brute.
 */

const KNOWN_CLASSES = new Set(Object.values(FAILURE_CLASSES));

/** Réduit une tentative à ses deux seules données publiables : le provider et la classe d'échec. */
function describeAttempt(attempt) {
  const provider = typeof attempt?.provider === "string" && attempt.provider ? attempt.provider : "inconnu";
  const failureClass = KNOWN_CLASSES.has(attempt?.failure_class) ? attempt.failure_class : FAILURE_CLASSES.PROGRAMMING_ERROR;
  return `${provider} (${failureClass})`;
}

/**
 * @param {"analyst"|"critic"|"arbiter"} role
 * @param {Error & {attempts?: Array<{provider: string, failure_class: string}>}} error
 * @returns {{role: string, state: "degraded_state", reason: string}} gelé, validé par le contrat OPRIE
 */
export function degradedResultFromProviderChainError(role, error) {
  const attempts = Array.isArray(error?.attempts) ? error.attempts : [];
  const detail = attempts.length ? attempts.map(describeAttempt).join(", ") : "aucune tentative enregistrée";
  return createDegradedRoleResult(role, `Aucun fournisseur disponible pour ce rôle : ${detail}.`);
}
