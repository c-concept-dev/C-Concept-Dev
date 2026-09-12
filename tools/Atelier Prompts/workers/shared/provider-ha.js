/**
 * HA-01 — Orchestrateur de haute disponibilité, PROVIDER-AGNOSTIQUE et MÉTIER-AGNOSTIQUE.
 *
 * Ce module ne connaît AUCUN domaine utilisateur, AUCUN rôle métier, AUCUN provider concret, AUCUN
 * prompt, AUCUN schéma, AUCUNE notion de décision, de route, de readiness ou de degraded_state. Il
 * ne sait faire qu'une seule chose : exécuter une SÉQUENCE ORDONNÉE de tentatives opaques, et
 * décider — sur la seule base d'une CLASSE D'ÉCHEC déclarée par l'appelant — s'il faut passer à la
 * tentative suivante ou s'arrêter immédiatement.
 *
 * Il n'est JAMAIS une autorité sémantique :
 *   - il ne lit jamais le résultat d'une tentative réussie (il le retourne tel quel, sans inspection) ;
 *   - il ne compare jamais deux résultats entre eux ;
 *   - il ne rejoue jamais un provider qui a RÉUSSI pour en obtenir un "meilleur" résultat ;
 *   - il ne fabrique jamais de résultat de repli lorsque toutes les tentatives ont échoué.
 * Un succès est un résultat FINAL : c'est la garantie structurelle du "no semantic model shopping".
 *
 * Il n'est pas non plus un moteur de reprise : il ne réessaie JAMAIS le même provider. La politique
 * de retry (429/Retry-After, timeouts) appartient exclusivement à chaque adaptateur de transport —
 * une seule boucle de reprise par tentative, jamais une multiplication cachée entre les deux couches.
 */

/**
 * Classification EXPLICITE et EXHAUSTIVE des échecs. Chaque adaptateur est responsable d'étiqueter
 * ses propres échecs : l'orchestrateur ne devine jamais, ne fait aucune inspection de message
 * d'erreur et n'applique aucune heuristique.
 *
 * - TECHNICAL_RETRYABLE      : échec transitoire que l'adaptateur SAIT devoir rejouer LUI-MÊME
 *                              (429 non encore épuisé, par exemple). Ne remonte normalement jamais
 *                              jusqu'ici : la boucle de reprise appartient à l'adaptateur. Traité
 *                              comme éligible au failover s'il remonte quand même, car il décrit
 *                              bien une indisponibilité de CE provider.
 * - TECHNICAL_FAILOVER       : échec technique persistant et PROPRE À CE PROVIDER — timeout, DNS,
 *                              connexion, 5xx, 429 après reprises bornées, transport rompu, réponse
 *                              tronquée/hors limite. Le provider suivant a une chance réelle de
 *                              réussir sur exactement la même entrée.
 * - CONFIG_UNAVAILABLE       : ce provider n'est pas configuré dans cet environnement (secret absent).
 *                              Propre au provider, jamais au contrat : le suivant reste pertinent.
 * - STRUCTURED_OUTPUT_INVALID: le provider a répondu, mais sa sortie est techniquement inexploitable
 *                              (enveloppe non parsable, structured output absent, JSON invalide,
 *                              sortie refusée par la validation structurelle). C'est un défaut de
 *                              CE modèle sur CET appel, pas un désaccord sémantique.
 * - SEMANTIC_VALID           : le provider a produit un résultat techniquement valide. N'est JAMAIS
 *                              un motif de bascule. Présent dans la classification pour être
 *                              explicitement NON éligible : c'est la frontière formelle qui interdit
 *                              le model shopping (un désaccord, une confiance différente ou une route
 *                              non préférée ne sont pas des pannes).
 * - REQUEST_REJECTED         : le provider a explicitement rejeté la requête comme malformée
 *                              (HTTP 400/422). Ambigu par nature : ce peut être une particularité de
 *                              dialecte propre à CE provider (un mot-clé de schéma qu'il n'accepte pas
 *                              alors qu'un autre l'accepte), ou un défaut de NOTRE requête, commun aux
 *                              trois. On ne peut pas trancher sur une seule observation. La classe est
 *                              donc éligible au failover — sinon une simple différence de dialecte
 *                              tuerait la chaîne — mais soumise à la règle de cause commune ci-dessous.
 * - CONTRACT_ERROR           : le contrat partagé (prompt, schéma, invariants) est lui-même
 *                              inutilisable. La cause est COMMUNE à tous les providers : les
 *                              enchaîner ne ferait que répéter le même échec trois fois. Fail-closed
 *                              immédiat, sans aucune tentative.
 * - PROGRAMMING_ERROR        : défaut de notre propre code (erreur non étiquetée, invariant interne
 *                              rompu). Également commun à tous les providers. Fail-closed immédiat :
 *                              un bug ne doit jamais être masqué par une cascade de trois providers.
 */
export const FAILURE_CLASSES = Object.freeze({
  TECHNICAL_RETRYABLE: "technical_retryable",
  TECHNICAL_FAILOVER: "technical_failover",
  CONFIG_UNAVAILABLE: "config_unavailable",
  STRUCTURED_OUTPUT_INVALID: "structured_output_invalid",
  REQUEST_REJECTED: "request_rejected",
  SEMANTIC_VALID: "semantic_valid",
  CONTRACT_ERROR: "contract_error",
  PROGRAMMING_ERROR: "programming_error"
});

/**
 * Les SEULES classes qui autorisent le passage au provider suivant. Toute autre classe — y compris
 * une classe inconnue — est fail-closed : on préfère toujours échouer proprement plutôt que
 * d'enchaîner aveuglément des providers sur une cause qui leur est commune.
 */
export const FAILOVER_ELIGIBLE_CLASSES = Object.freeze([
  FAILURE_CLASSES.TECHNICAL_RETRYABLE,
  FAILURE_CLASSES.TECHNICAL_FAILOVER,
  FAILURE_CLASSES.CONFIG_UNAVAILABLE,
  FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID,
  FAILURE_CLASSES.REQUEST_REJECTED
]);

/**
 * Règle de CAUSE COMMUNE PRÉSUMÉE.
 *
 * Un seul rejet de requête (400/422) ne prouve rien : les providers n'acceptent pas exactement le même
 * dialecte de JSON Schema, et basculer est alors le bon comportement. DEUX rejets par deux providers
 * INDÉPENDANTS sur la MÊME requête sont en revanche une observation sur la requête, plus sur les
 * providers. Le seuil vaut donc 2 parce que 2 est le nombre minimal d'observations indépendantes
 * permettant de distinguer "dialecte" de "notre requête" — ce n'est pas un réglage empirique arbitraire,
 * et il n'y a rien à calibrer.
 *
 * Effet : au deuxième rejet, la chaîne s'arrête et N'APPELLE PAS le troisième provider. Le gaspillage
 * est borné à 2 appels, jamais 3, et l'événement provider_ha_common_cause_suspected nomme
 * explicitement l'hypothèse au lieu de la noyer dans une "panne de tous les providers".
 */
export const COMMON_CAUSE_REJECTION_THRESHOLD = 2;

export function isFailoverEligible(failureClass) {
  return FAILOVER_ELIGIBLE_CLASSES.includes(failureClass);
}

const FAILURE_CLASS_KEY = "failure_class";

/**
 * Étiquette une erreur avec sa classe d'échec, SANS jamais en modifier le message ni le type : les
 * messages existants (et les tests qui les vérifient) restent strictement inchangés. Retourne
 * l'erreur elle-même pour permettre `throw tagFailure(new Error(...), ...)`.
 */
export function tagFailure(error, failureClass, details = {}) {
  if (!Object.values(FAILURE_CLASSES).includes(failureClass)) {
    throw new Error(`Classe d'échec inconnue : ${JSON.stringify(failureClass)}.`);
  }
  if (!error || typeof error !== "object") return error;
  error[FAILURE_CLASS_KEY] = failureClass;
  for (const [key, value] of Object.entries(details)) error[key] = value;
  return error;
}

/**
 * Une erreur NON étiquetée est un PROGRAMMING_ERROR, jamais une panne provider : nous ne savons pas
 * ce qui s'est passé, donc nous n'avons aucune raison de croire qu'un autre provider ferait mieux.
 * Ce défaut volontairement conservateur est ce qui empêche un bug de notre code de se transformer en
 * cascade silencieuse sur trois providers.
 */
export function failureClassOf(error) {
  const declared = error && typeof error === "object" ? error[FAILURE_CLASS_KEY] : undefined;
  return Object.values(FAILURE_CLASSES).includes(declared) ? declared : FAILURE_CLASSES.PROGRAMMING_ERROR;
}

/**
 * Levée UNIQUEMENT lorsque TOUS les providers de la chaîne ont échoué avec une classe éligible au
 * failover. Ne transporte aucun résultat de repli, aucune valeur par défaut, aucun état fabriqué :
 * seulement la trace technique de ce qui a été tenté. L'appelant reste seul responsable de la
 * traduire en réponse HTTP (aujourd'hui : le 502 provider_failure existant, contrat inchangé).
 */
export class ProviderChainError extends Error {
  constructor(role, attempts) {
    super(`Aucun provider disponible pour le rôle ${role} après ${attempts.length} tentative(s).`);
    this.name = "ProviderChainError";
    this.role = role;
    this.attempts = attempts;
    this[FAILURE_CLASS_KEY] = FAILURE_CLASSES.TECHNICAL_FAILOVER;
    this.all_providers_failed = true;
  }
}

/**
 * Observabilité : STRICTEMENT structurelle. Aucun message d'erreur, aucun en-tête, aucune clé, aucun
 * prompt, aucun contenu utilisateur ne transite jamais par ces événements — uniquement des noms de
 * providers, des index de tentative et des classes d'échec, toutes issues d'une énumération fermée.
 * C'est une propriété de CONSTRUCTION, pas une expurgation a posteriori : le module n'a jamais accès
 * aux secrets, et ne lit jamais error.message.
 */
function defaultLog(event) {
  console.log(JSON.stringify(event));
}

/**
 * Exécute la chaîne de providers, dans l'ordre exact fourni par l'appelant.
 *
 * @param {string} role                Étiquette d'observabilité neutre (ex. "decision"). Jamais
 *                                     interprétée, jamais utilisée pour une décision.
 * @param {Array<{name: string, execute: () => Promise<any>}>} providers
 *                                     Ordre = priorité. `execute` est opaque : l'orchestrateur ne
 *                                     sait pas ce qu'elle fait ni ce qu'elle retourne.
 * @param {() => void} [preflight]     Vérification unique du contrat COMMUN, exécutée AVANT toute
 *                                     tentative. Si elle échoue, aucun provider n'est appelé : une
 *                                     cause commune ne doit jamais être testée trois fois.
 * @param {(event: object) => void} [log]
 * @returns {Promise<any>} le résultat du PREMIER provider ayant réussi, retourné tel quel.
 */
export async function runProviderChain({ role, providers, preflight, log = defaultLog }) {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw tagFailure(new Error("Chaîne de providers vide."), FAILURE_CLASSES.PROGRAMMING_ERROR);
  }
  const order = providers.map((provider) => provider.name);

  if (typeof preflight === "function") {
    try {
      preflight();
    } catch (error) {
      const failure_class = failureClassOf(error);
      log({ event: "provider_ha_preflight_failure", role, provider_order: order, failure_class });
      throw error;
    }
  }

  const attempts = [];
  for (let index = 0; index < providers.length; index += 1) {
    const { name, execute } = providers[index];
    const fallback_from = index === 0 ? null : providers[index - 1].name;
    log({ event: "provider_ha_attempt", role, provider: name, attempt_index: index, fallback_from, provider_order: order });
    try {
      const result = await execute();
      log({ event: "provider_ha_success", role, provider: name, attempt_index: index, fallback_from, previous_failures: attempts.map((attempt) => attempt.failure_class) });
      return result;
    } catch (error) {
      const failure_class = failureClassOf(error);
      attempts.push({ provider: name, failure_class });
      log({ event: "provider_ha_failure", role, provider: name, attempt_index: index, failure_class });

      const rejections = attempts.filter((attempt) => attempt.failure_class === FAILURE_CLASSES.REQUEST_REJECTED).length;
      if (failure_class === FAILURE_CLASSES.REQUEST_REJECTED && rejections >= COMMON_CAUSE_REJECTION_THRESHOLD) {
        // Deux providers indépendants ont rejeté la même requête : la cause est probablement chez nous.
        // On s'arrête ici — le troisième appel serait un troisième échec identique, pas une chance.
        log({ event: "provider_ha_common_cause_suspected", role, provider_order: order, rejections, attempts, remaining_providers: order.slice(index + 1) });
        throw error;
      }
      if (!isFailoverEligible(failure_class)) {
        // Cause commune (contrat/bug) ou résultat sémantiquement valide : enchaîner les providers
        // n'apporterait rien et transformerait un défaut identifiable en cascade opaque.
        log({ event: "provider_ha_fail_closed", role, provider: name, failure_class, remaining_providers: order.slice(index + 1) });
        throw error;
      }
      const next = providers[index + 1];
      if (!next) {
        log({ event: "provider_ha_exhausted", role, provider_order: order, attempts });
        throw new ProviderChainError(role, attempts);
      }
      log({ event: "provider_ha_fallback", role, fallback_from: name, fallback_to: next.name, failure_class });
    }
  }
  // Inatteignable : la boucle retourne ou lève systématiquement.
  throw tagFailure(new Error("Chaîne de providers terminée sans résultat."), FAILURE_CLASSES.PROGRAMMING_ERROR);
}
