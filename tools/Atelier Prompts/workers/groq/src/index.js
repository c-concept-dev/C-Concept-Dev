import {
  DECISION_JSON_SCHEMA,
  DECISION_MODEL_PROMPT,
  expectedReason,
  handleDecisionRequest,
  makeDecisionUserMessage,
  parseDecisionCandidate,
  readBoundedText,
  validateDecision
} from "../../shared/decision-core.js";
import {
  ROLE_DEFINITIONS, OPRIE_ROLES, handleRoleRequest, resolveRoleSchema,
  CRITIC_GLOBAL_SYSTEM_PROMPT, CRITIC_GLOBAL_JSON_SCHEMA, makeCriticGlobalUserMessage,
  SUBSTITUTION_REVIEW_SYSTEM_PROMPT, buildSubstitutionBatchSchema, makeSubstitutionReviewBatchUserMessage,
  buildSubstitutionReviewGroupSystemPrompt,
  estimateSubstitutionBatchOutputUnits, runCriticBatchedPipeline
} from "../../shared/operational-request-core.js";
import {
  FAILURE_CLASSES,
  failureClassOf,
  runProviderChain,
  tagFailure
} from "../../shared/provider-ha.js";
export { degradedResultFromProviderChainError } from "../../shared/role-degradation.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const MODEL = "openai/gpt-oss-20b";

// ---------------------------------------------------------------------------------------------
// 3F.3.3-X2-BATCH-R2 : moteur de reprise 429/Retry-After, RELOCALISÉ ICI depuis
// evaluation/lot10g3b3f3/run-role-benchmark.mjs (qui le réexporte désormais tel quel, cf. ce
// fichier) — une seule source de vérité, jamais un second mécanisme. Avant R2, callGroqChatCompletion
// ne faisait qu'un fetch() brut avec un timeout fixe : un 429 échouait immédiatement, sans jamais
// attendre le délai que Groq communique explicitement (Retry-After / "please try again in Xs"),
// alors même que les appels du pipeline Critic batché restent strictement séquentiels (jamais la
// taille d'un appel qui posait problème après le split X2-BATCH, mais l'accumulation TPM entre
// appels successifs — cf. rapport R2, diagnostic Phase 0).
// ---------------------------------------------------------------------------------------------

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("Attente interrompue (signal déjà abandonné)."), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Attente interrompue (signal abandonné)."), { name: "AbortError" }));
      }, { once: true });
    }
  });
}

/** En-tête Retry-After standard : soit un nombre de secondes, soit une date HTTP. */
export function parseRetryAfterMs(response) {
  const header = typeof response?.headers?.get === "function" ? response.headers.get("retry-after") : null;
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

/**
 * Extraction prudente d'un délai de reprise depuis le corps d'une erreur Groq, uniquement quand un
 * nombre de secondes y apparaît sans ambiguïté ("try again in 25.7s", ou un champ retry_after
 * explicite). Ne tente jamais d'interpréter une phrase libre au-delà de ce motif étroit ; retourne
 * null dans tout autre cas pour laisser le repli fixe (defaultBackoffMs) prendre le relais.
 */
export function parseRetryDelayFromBody(raw) {
  if (typeof raw !== "string" || !raw) return null;
  const match = /try again in\s+([\d.]+)\s*s\b/i.exec(raw) || /"retry_after"\s*:\s*"?([\d.]+)"?/i.exec(raw);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

// Politique de reprise par défaut pour le runtime de PRODUCTION (Cloudflare Worker, pas de CLI) —
// distincte de GROQ_RETRY_DEFAULTS du harnais (qui reste configurable par ligne de commande et
// réexporte désormais les primitives ci-dessous au lieu d'en garder une copie locale). maxRetries=2
// borne l'attente totale (≈2 × ~32s dans le pire cas observé) ; timeoutMs=8000 borne CHAQUE tentative
// réseau individuelle (durée déjà en vigueur avant R2, inchangée) — l'attente de backoff elle-même
// n'est jamais comptée dans ce budget, seul le round-trip réseau l'est.
export const GROQ_PRODUCTION_RETRY_DEFAULTS = Object.freeze({
  maxRetries: 2,
  safetyMarginMs: 750,
  defaultBackoffMs: 30000,
  timeoutMs: 8000,
  // HA-02 : aucune borne d'attente par défaut — c'est EXACTEMENT le comportement d'avant HA-02. Le
  // pipeline Critic reste donc strictement inchangé (R2/R2.1/R3B, X2-BATCH) : pour lui, attendre le
  // Retry-After annoncé est la seule stratégie correcte, puisqu'il n'a aujourd'hui aucun provider de
  // repli et que ses contraintes TPM sont réelles.
  maxRetryWaitMs: Infinity
});

/**
 * HA-02 — POLITIQUE DE REPRISE PROPRE AU RÔLE DECISION. Dérivée, jamais choisie arbitrairement.
 *
 * Le problème mesuré après HA-01 : sur 429 persistant, /decision pouvait attendre 2 × (~30 s + 750 ms)
 * AVANT même de tenter Anthropic, alors qu'Anthropic était disponible — soit ~60 s d'indisponibilité
 * ressentie pour une requête interactive dont le repli coûte quelques secondes.
 *
 * Dérivation (aucun seuil magique) :
 *   1. Decision est INTERACTIF : un humain attend la réponse, contrairement au pipeline Critic.
 *   2. Le coût réel d'une bascule est MESURÉ, pas supposé : smokes réels HA-01 sur le Worker de
 *      production — Anthropic /decision 3.41 s, OpenAI /decision 3.67–4.16 s.
 *   3. Il s'ensuit une règle sans paramètre libre : attendre Groq n'a de sens que si l'attente
 *      annoncée est INFÉRIEURE au coût de la bascule. Au-delà, patienter est strictement dominé par
 *      le fait de changer de provider. maxRetryWaitMs = 3000 ms est le plus grand nombre rond
 *      strictement inférieur à la latence de bascule la plus rapide réellement observée (3.41 s) :
 *      la borne est donc dérivée d'une mesure, et tout autre valeur serait soit dominée, soit plus
 *      lente que le repli.
 *   4. maxRetries = 1 : une seule reprise courte suffit à absorber un 429 transitoire ; une seconde
 *      n'apporterait rien qu'un provider de repli ne fasse mieux. Ce n'est PAS zéro reprise, car un
 *      Retry-After très court (Groq en annonce fréquemment) est réellement moins coûteux qu'une
 *      bascule.
 *
 * Latence de bascule /decision qui en résulte, dans le pire cas : 8 s (timeout réseau Groq) ou
 * ~3.75 s (une reprise courte), au lieu de ~62 s. Aucune valeur n'est partagée avec Critic.
 */
export const DECISION_GROQ_RETRY_POLICY = Object.freeze({
  maxRetries: 1,
  maxRetryWaitMs: 3000
});

/**
 * Exécute fetch(url, requestInit) avec reprise automatique sur HTTP 429 : même appel, même corps,
 * après avoir attendu le délai indiqué par le provider (+ marge de sécurité) ou un repli fixe si
 * aucun délai n'est exploitable. Borné par maxRetries. Signature et comportement identiques à
 * l'ancienne fetchGroqWithRetry du harnais — seul le nom du module source change.
 */
export async function fetchGroqWithRetry(url, requestInit, overrides = {}) {
  const { maxRetries, safetyMarginMs, defaultBackoffMs, timeoutMs, maxRetryWaitMs, sleepFn = sleep, signal } = { ...GROQ_PRODUCTION_RETRY_DEFAULTS, ...overrides };
  let attempt = 0;
  let rateLimitedWaitMs = 0;
  while (true) {
    const response = await fetch(url, { ...requestInit, signal: signal ?? AbortSignal.timeout(timeoutMs) });
    if (response.status !== 429) return { response, retries: attempt, rate_limited_wait_ms: rateLimitedWaitMs };
    if (attempt >= maxRetries) {
      throw Object.assign(
        new Error(`Groq HTTP 429 : limite de débit atteinte après ${maxRetries} tentative(s) de reprise.`),
        { rateLimited: true, exhausted: true, error_kind: "http_429", retries: attempt, rate_limited_wait_ms: rateLimitedWaitMs }
      );
    }
    const raw = await response.clone().text().catch(() => "");
    const retryAfterMs = parseRetryAfterMs(response) ?? parseRetryDelayFromBody(raw) ?? defaultBackoffMs;
    const waitMs = retryAfterMs + safetyMarginMs;
    // HA-02 : plafond d'ATTENTE, distinct du plafond de NOMBRE de reprises. Par défaut Infinity — le
    // comportement historique (Critic, R2/R2.1/R3B) est donc strictement inchangé, à l'octet près.
    // Un appelant interactif peut en revanche décider qu'attendre plus longtemps que le coût d'une
    // bascule n'a aucun sens : il abandonne alors la reprise IMMÉDIATEMENT, sans dormir.
    if (waitMs > maxRetryWaitMs) {
      throw Object.assign(
        new Error(`Groq HTTP 429 : reprise abandonnée, le délai annoncé (${waitMs} ms) dépasse le plafond d'attente de ce rôle (${maxRetryWaitMs} ms).`),
        { rateLimited: true, exhausted: true, wait_too_long: true, error_kind: "http_429", retries: attempt, rate_limited_wait_ms: rateLimitedWaitMs, announced_wait_ms: waitMs }
      );
    }
    rateLimitedWaitMs += waitMs;
    attempt += 1;
    await sleepFn(waitMs, signal);
  }
}

/**
 * 3F.3.3-X2-BATCH-R2 : pacer minimal, à état, une instance PAR EXÉCUTION de pipeline (jamais un
 * singleton module-level — un Worker traite des requêtes concurrentes indépendantes, aucun état ne
 * doit fuiter entre elles). N'invente aucune fenêtre TPM, aucune constante de débit : recordWaitMs(w)
 * mémorise seulement une contrainte ENCORE FUTURE (w ms restant à attendre à COMPTER DE MAINTENANT) et
 * before() attend ce reliquat s'il n'est pas encore écoulé. Aucune notion de Groq, de TPM ni de 8000
 * n'existe dans operational-request-core.js — ce pacer est une particularité de CET adaptateur, jamais
 * partagée avec Workers AI (section 3/section R2-8 du lot).
 *
 * 3F.3.3-X2-BATCH-R2.1 (CORRECTION) : R2 alimentait recordWaitMs avec rate_limited_wait_ms, qui décrit
 * un délai déjà INTÉGRALEMENT CONSOMMÉ par fetchGroqWithRetry (la somme de ce qu'elle a déjà attendu
 * avant de retourner ou d'abandonner) — jamais une contrainte encore future. Transmettre cette valeur
 * ici la reprogrammait comme si elle restait due, faisant repayer au prochain appel un délai déjà
 * écoulé (cf. rapport R2.1). callGroqChatCompletion n'appelle donc plus recordWaitMs avec cette donnée ;
 * before() reste appelé avant chaque appel pour honorer toute contrainte future légitime qui serait un
 * jour prouvée, mais est aujourd'hui un no-op systématique — comportement correct tant qu'aucune source
 * ne fournit un délai réellement prospectif (ne jamais en inventer un, section 5 du lot R2).
 */
export function createGroqRateLimitPacer({ sleepFn = sleep } = {}) {
  let nextAvailableAt = 0;
  return {
    async before() {
      const waitMs = nextAvailableAt - Date.now();
      if (waitMs > 0) await sleepFn(waitMs);
    },
    recordWaitMs(waitMs) {
      if (Number.isFinite(waitMs) && waitMs > 0) nextAvailableAt = Date.now() + waitMs;
    }
  };
}

/**
 * Appel Groq de bas niveau, partagé entre le Decision Provider legacy et les 3 rôles OPRIE.
 * N'introduit aucune logique de prompt ou de schéma : elle reçoit les deux en paramètre.
 *
 * 3F.3.3-X2-BATCH-R2 : utilise désormais fetchGroqWithRetry (429/Retry-After honorés, jamais un échec
 * immédiat) au lieu d'un fetch() brut avec timeout fixe seul. `pacer` (optionnel) et `retryOverrides`
 * (optionnel, tests uniquement — injection d'un sleepFn instantané, jamais utilisé en production)
 * permettent au pipeline Critic batché de faire respecter le budget agrégé entre appels successifs
 * sans dupliquer cette logique : cf. runCriticWithGroq ci-dessous.
 */
async function callGroqChatCompletion({ systemPrompt, userMessage, schema, schemaName, env, maxCompletionTokens, pacer, retryOverrides = {} }) {
  // HA-01 : classe d'échec explicite. Secret absent = CE provider n'est pas configuré dans CET
  // environnement — jamais un défaut du contrat partagé : le provider suivant reste pertinent.
  if (!env.GROQ_API_KEY) throw tagFailure(new Error("Secret GROQ_API_KEY absent."), FAILURE_CLASSES.CONFIG_UNAVAILABLE, { provider: "groq" });
  if (pacer) await pacer.before();
  const requestInit = {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema
        }
      },
      reasoning_format: "hidden",
      reasoning_effort: "low",
      temperature: 0,
      max_completion_tokens: maxCompletionTokens,
      stream: false
    })
  };
  let response;
  try {
    ({ response } = await fetchGroqWithRetry(GROQ_ENDPOINT, requestInit, retryOverrides));
  } catch (retryExhaustedError) {
    // 3F.3.3-X2-BATCH-R2.1 : retryExhaustedError.rate_limited_wait_ms est la SOMME des attentes déjà
    // ENTIÈREMENT ÉCOULÉES par fetchGroqWithRetry avant d'abandonner (jamais une contrainte encore
    // future) — ne JAMAIS la transmettre à pacer.recordWaitMs (cf. correction du chemin succès
    // ci-dessus, même défaut, même raison). Conservée uniquement pour l'observabilité (log).
    //
    // HA-01 (CORRECTION d'observabilité) : ce bloc catch interceptait TOUT échec de fetchGroqWithRetry
    // — y compris une panne de transport réelle (DNS, connexion refusée, AbortSignal.timeout) — et la
    // rapportait systématiquement comme "Groq HTTP 429", ce qui est faux dès que l'échec n'est pas un
    // 429 épuisé. Le failover HA classe désormais explicitement les échecs : les deux cas restent
    // TECHNICAL_FAILOVER (même comportement de bascule, aucun changement fonctionnel), mais le
    // diagnostic cesse de mentir. `exhausted` est posé par fetchGroqWithRetry elle-même (seul chemin
    // 429 épuisé), jamais deviné ici.
    if (retryExhaustedError?.exhausted === true) {
      console.error({ event: "groq_rate_limit_exhausted", retries: retryExhaustedError.retries, rate_limited_wait_ms: retryExhaustedError.rate_limited_wait_ms });
      throw tagFailure(
        new Error(`Groq HTTP 429 : limite de débit non résolue après ${retryExhaustedError.retries ?? 0} tentative(s) de reprise.`),
        FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: "groq" }
      );
    }
    const errorName = String(retryExhaustedError?.name || "unknown");
    console.error({ event: "groq_transport_error", error_name: errorName });
    throw tagFailure(new Error(`Groq : échec de transport (${errorName}).`), FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: "groq" });
  }
  // 3F.3.3-X2-BATCH-R2.1 (CORRECTION double-pacing) : fetchGroqWithRetry attend déjà, en interne,
  // exactement le Retry-After (+ marge) nécessaire pour que CET appel réussisse — par construction,
  // au moment où elle retourne avec succès, ce délai est intégralement CONSOMMÉ, jamais encore dû. Le
  // rate_limited_wait_ms qu'elle renvoie décrit donc toujours un passé, jamais une contrainte future :
  // le transmettre à pacer.recordWaitMs (comme le faisait R2) reprogramme un délai déjà écoulé comme
  // s'il restait à attendre pour l'appel SUIVANT, qui le repaie alors une seconde fois pour rien (cf.
  // rapport R2.1, écart ~34.7s observé au smoke réel avant batch2 malgré un batch1 déjà résolu).
  // pacer.before() reste appelé (ci-dessus) pour honorer toute contrainte future légitime qui serait
  // un jour prouvée — aucune n'existe actuellement dans ce fichier, donc pacer.before() est
  // aujourd'hui un no-op systématique, ce qui est le comportement CORRECT (jamais inventer une
  // estimation proactive non prouvée, cf. section 5/"NE PAS INVENTER" du lot R2).
  const raw = await readBoundedText(response).catch((readError) => {
    // Réponse tronquée / hors limite de taille : panne de transport de CE provider.
    throw tagFailure(readError, FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: "groq" });
  });
  if (!response.ok) {
    let code = "unknown";
    let message = "Message Groq indisponible.";
    try {
      const error = JSON.parse(raw)?.error;
      code = String(error?.code || "unknown");
      message = String(error?.message || message);
    } catch {}
    const redact = (value) => value
      .replace(/Bearer\s+\S+/gi, "Bearer [EXPURGÉ]")
      .replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]+\b/g, "[EXPURGÉ]")
      .replace(/\s+/g, " ")
      .slice(0, 500);
    console.error({ event: "groq_api_error", status: response.status, code: redact(code), message: redact(message) });
    // Classe déterminée par classifyProviderHttpStatus : jamais un désaccord sémantique, jamais une
    // raison de préférer un autre modèle — seulement une raison d'en essayer un autre parce que
    // celui-ci n'a rien produit.
    throw tagFailure(new Error(`Groq a répondu ${response.status}.`), classifyProviderHttpStatus(response.status), { provider: "groq", status: response.status });
  }
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw tagFailure(new Error("Groq a renvoyé une enveloppe non parsable."), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, { provider: "groq" });
  }
  return envelope?.choices?.[0]?.message?.content;
}

/**
 * HA-01 : classification EXPLICITE des statuts HTTP des providers, partagée par les TROIS adaptateurs
 * (aucun mapping provider-specific : un 400 ne veut pas dire autre chose selon le fournisseur).
 *
 *   401, 403  -> CONFIG_UNAVAILABLE. Le justificatif d'authentification de CE provider est refusé :
 *                clé absente, révoquée, sans droit sur le modèle. C'est exactement la même situation
 *                qu'un secret manquant, et le provider suivant reste pertinent. Classe DISTINCTE de
 *                TECHNICAL_FAILOVER pour rester explicitement observable : une chaîne qui bascule
 *                trois fois pour cause d'authentification n'est pas une panne, c'est une
 *                configuration à corriger, et le log doit le dire.
 *
 *   400, 422  -> REQUEST_REJECTED. Le provider dit que NOTRE requête est malformée. Ambigu sur une
 *                seule observation (dialecte de schéma propre au provider, ou défaut commun de notre
 *                requête) : la classe reste éligible au failover, mais provider-ha.js s'arrête au
 *                DEUXIÈME rejet (COMMON_CAUSE_REJECTION_THRESHOLD) au lieu d'en consommer un
 *                troisième. Voir la justification du seuil dans provider-ha.js.
 *
 *   404       -> TECHNICAL_FAILOVER. Endpoint ou modèle introuvable POUR CE PROVIDER (un modèle non
 *                activé sur ce compte, par exemple) : strictement provider-specific.
 *   408       -> TECHNICAL_FAILOVER. Timeout côté serveur, indiscernable d'un timeout réseau.
 *   409       -> TECHNICAL_FAILOVER. Conflit d'état côté provider, jamais une propriété de la requête.
 *   429       -> TECHNICAL_FAILOVER. N'atteint ce point qu'APRÈS la politique de reprise de
 *                l'adaptateur (Groq : 1 + maxRetries ; Anthropic/OpenAI : aucune reprise, cf.
 *                decideWithHaChain). Une limite de débit est par définition propre à un fournisseur.
 *   5xx       -> TECHNICAL_FAILOVER. Panne du provider.
 *   autre     -> TECHNICAL_FAILOVER, par défaut conservateur : un statut inattendu décrit le
 *                fournisseur, jamais notre contrat — et le défaut ne doit jamais être la classe
 *                fail-closed, qui priverait la chaîne d'un provider disponible.
 */
export function classifyProviderHttpStatus(status) {
  if (status === 401 || status === 403) return FAILURE_CLASSES.CONFIG_UNAVAILABLE;
  if (status === 400 || status === 422) return FAILURE_CLASSES.REQUEST_REJECTED;
  return FAILURE_CLASSES.TECHNICAL_FAILOVER;
}

/**
 * HA-01 : le contrat sémantique de /decision, réuni en UN SEUL objet gelé, partagé À L'IDENTIQUE par
 * les trois adaptateurs. Aucun provider ne possède son propre prompt, son propre schéma ni son propre
 * nom de schéma : DECISION_MODEL_PROMPT et DECISION_JSON_SCHEMA (decision-core.js) restent l'unique
 * source de vérité, strictement inchangés par ce lot. Le paramètre `contract` des adaptateurs n'existe
 * que pour rendre ce contrat INJECTABLE dans les tests (même discipline que `retryOverrides`, déjà en
 * vigueur ici) — la production n'utilise jamais autre chose que ce défaut.
 */
export const DECISION_CONTRACT = Object.freeze({
  prompt: DECISION_MODEL_PROMPT,
  schema: DECISION_JSON_SCHEMA,
  schemaName: "decision_provider"
});

/**
 * HA-01 : vérification du contrat COMMUN, exécutée UNE SEULE FOIS avant toute tentative provider.
 *
 * C'est la garantie structurelle contre la cascade aveugle : un prompt vide ou un DECISION_JSON_SCHEMA
 * inutilisable est une erreur de NOTRE code, identique pour Groq, Anthropic et OpenAI. L'envoyer trois
 * fois ne produirait que trois HTTP 400 et transformerait un défaut immédiatement identifiable en
 * "panne de tous les providers". La classe CONTRACT_ERROR n'est jamais éligible au failover : la
 * chaîne s'arrête AVANT le premier appel réseau.
 *
 * Les invariants vérifiés sont exactement ceux du mode strict Structured Outputs (Groq/OpenAI) déjà
 * formalisés par tests/operational-request-groq-schema-compat.test.mjs pour les schémas OPRIE — ici
 * appliqués au schéma Decision, au moment de l'exécution.
 */
export function assertDecisionContractUsable(contract) {
  const fail = (reason) => {
    throw tagFailure(new Error(`Contrat Decision inutilisable : ${reason}`), FAILURE_CLASSES.CONTRACT_ERROR);
  };
  if (!contract || typeof contract !== "object") fail("contrat absent.");
  if (typeof contract.prompt !== "string" || !contract.prompt.trim()) fail("prompt système absent ou vide.");
  if (typeof contract.schemaName !== "string" || !contract.schemaName.trim()) fail("nom de schéma absent ou vide.");
  const schema = contract.schema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) fail("schéma absent.");
  if (schema.type !== "object") fail("le schéma racine doit être de type \"object\".");
  if (schema.additionalProperties !== false) fail("le schéma racine doit porter additionalProperties=false (mode strict).");
  if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) fail("le schéma racine ne déclare aucune propriété.");
  const propertyKeys = Object.keys(schema.properties).sort();
  const requiredKeys = Array.isArray(schema.required) ? [...schema.required].sort() : null;
  if (!requiredKeys) fail("le schéma racine ne déclare pas \"required\".");
  if (requiredKeys.length !== propertyKeys.length || requiredKeys.some((key, index) => key !== propertyKeys[index])) {
    fail("\"required\" ne couvre pas exactement \"properties\" (mode strict).");
  }
}

export async function decideWithGroq(input, env, { contract = DECISION_CONTRACT, retryOverrides = {} } = {}) {
  const content = await callGroqChatCompletion({
    systemPrompt: contract.prompt,
    userMessage: makeDecisionUserMessage(input),
    schema: contract.schema,
    schemaName: contract.schemaName,
    env,
    maxCompletionTokens: 512,
    // HA-02 : politique de reprise PROPRE à Decision. callGroqChatCompletion et fetchGroqWithRetry
    // restent une source de vérité UNIQUE, partagée avec Critic — seul le paramétrage diffère, jamais
    // le transport (aucune duplication de fetchGroqWithRetry, cf. section 8 du lot).
    retryOverrides: { ...DECISION_GROQ_RETRY_POLICY, ...retryOverrides }
  });
  try {
    return parseDecisionCandidate(content, input.demande);
  } catch (error) {
    // Le modèle a répondu, mais sa sortie est techniquement inexploitable (JSON invalide, champs
    // absents, invariants structurels violés). C'est un défaut de CE modèle sur CET appel, jamais un
    // désaccord sémantique : un autre provider a une chance réelle de produire une sortie conforme.
    throw tagFailure(error, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, { provider: "groq" });
  }
}

// ---------------------------------------------------------------------------------------------
// 3F.3.3-X2-BATCH-R5.1 : second provider pour /decision UNIQUEMENT — Anthropic Messages API.
// N'introduit AUCUNE logique de prompt/schéma propre : réutilise DECISION_MODEL_PROMPT et
// DECISION_JSON_SCHEMA tels quels (decision-core.js, source de vérité unique, inchangée). Le
// contrat public /decision (entrée, sortie, validateDecision) reste strictement identique — seul
// LE TRANSPORT change pour ce provider. Aucun rapport avec le pipeline Critic X2-BATCH (Groq
// uniquement, non touché ici).
// ---------------------------------------------------------------------------------------------
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
// 3F.3.3-X2-BATCH-R5.1a : calibration de modèle — claude-sonnet-4-6 (identifiant réel, vérifié
// directement contre la documentation officielle Anthropic, platform.claude.com/docs/en/about-
// claude/models/model-ids-and-versions, jamais inventé). Choisi à la place de claude-sonnet-5 pour
// le premier smoke de parité /decision : modèle antérieur documenté, réduisant les variables
// expérimentales, thinking non activé par défaut. Un changement de modèle ultérieur reste une
// décision indépendante, hors périmètre de ce lot.
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_API_VERSION = "2023-06-01";
// Borne CHAQUE tentative réseau individuelle, sans retry automatique sur 429 : le Decision Provider
// n'a jamais eu, avant ce lot, de politique de reprise (callGroqChatCompletion ne l'a acquise qu'à
// cause des contraintes TPM propres au pipeline Critic batché, hors périmètre ici) — ne pas en
// inventer une pour Anthropic sans preuve empirique qu'elle est nécessaire (même discipline que R2
// "NE PAS INVENTER").
//
// 3F.3.3-X2-BATCH-R5.1b : timeout PROPRE à Anthropic, découplé de GROQ_PRODUCTION_RETRY_DEFAULTS.
// timeoutMs (Groq reste à 8000ms, inchangé — aucune valeur partagée entre les deux providers).
// Valeur recalibrée de 8000 à 20000 sur preuve empirique directe : smoke réel R5.1a
// (claude-sonnet-4-6) — cas 1 : HTTP 200 réel en 3249ms (largement sous 8000ms) ; cas 2 : interrompu
// EXACTEMENT à 8007ms avec "The operation was aborted due to timeout" — l'échec observé était donc
// strictement un artefact du timeout client à 8000ms, jamais un signal réel d'échec Anthropic (pas
// de 429, pas de 5xx, pas d'erreur applicative). 20000ms est une marge, pas une valeur inventée sans
// preuve : reste à confirmer par un nouveau smoke réel (préparé, non exécuté dans cette session).
const ANTHROPIC_TIMEOUT_MS = 20000;

// 3F.3.3-X2-BATCH-R5.2a : timeout PROPRE au pipeline Critic Anthropic, découplé de
// ANTHROPIC_TIMEOUT_MS (/decision, INCHANGÉ à 20000ms — validé en réel par R5.1c, jamais retouché
// ici) et de GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs (Groq, INCHANGÉ à 8000ms). Valeur introduite
// sur preuve empirique directe : smoke réel R5.2 (claude-sonnet-4-6, pipeline Critic batché N=4) —
// authentification OK, aucun 401, aucun 429, mais le premier appel (Critic global, prompt+schéma
// nettement plus volumineux qu'une décision /decision) a été interrompu EXACTEMENT à 20007ms avec
// "The operation was aborted due to timeout" — les batches n'ont donc jamais été atteints. L'échec
// observé était un artefact du timeout client à 20000ms (dimensionné pour /decision, jamais pour ce
// pipeline), jamais un signal réel d'échec Anthropic. 60000ms est une marge de mesure, jamais une
// valeur inventée sans preuve : reste à confirmer par un nouveau smoke réel (préparé, non exécuté
// dans cette session).
const ANTHROPIC_CRITIC_TIMEOUT_MS = 60000;

/**
 * Appel Anthropic Messages de bas niveau, partagé entre le Decision Provider et le pipeline Critic
 * batché. Le system prompt est transmis comme véritable champ `system` racine (jamais un message de
 * rôle "system" dans `messages[]` — ce dernier n'est pas un rôle valide de l'API Anthropic Messages).
 * La sortie structurée utilise le mécanisme natif Anthropic compatible JSON Schema : un tool unique
 * dont `input_schema` est EXACTEMENT le schéma fourni par l'appelant (jamais reconstruit), avec
 * `tool_choice` forcé sur ce tool — la réponse `tool_use.input` est déjà un objet JSON structuré,
 * jamais du texte libre à re-parser. Aucune confiance directe dans cette sortie : chaque appelant
 * (decideWithAnthropic, runCriticWithAnthropic) la fait passer par sa propre validation, exactement
 * comme le chemin Groq correspondant.
 *
 * 3F.3.3-X2-BATCH-R5.2a : `timeoutMs` est désormais un paramètre explicite (défaut ANTHROPIC_TIMEOUT_MS,
 * comportement /decision strictement inchangé pour tout appelant qui ne le précise pas) — jamais une
 * seconde constante globale codée en dur ici : chaque appelant reste seul responsable du plafond de
 * mesure qui lui correspond réellement.
 */
async function callAnthropicMessages({ systemPrompt, userMessage, schema, schemaName, env, maxTokens, timeoutMs = ANTHROPIC_TIMEOUT_MS }) {
  if (!env.ANTHROPIC_API_KEY) throw tagFailure(new Error("Secret ANTHROPIC_API_KEY absent."), FAILURE_CLASSES.CONFIG_UNAVAILABLE, { provider: "anthropic" });
  const requestInit = {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      max_tokens: maxTokens,
      temperature: 0,
      tools: [{ name: schemaName, description: `Retourne la décision au format ${schemaName}, conforme exactement au schéma fourni.`, input_schema: schema }],
      tool_choice: { type: "tool", name: schemaName }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  };
  let response;
  try {
    response = await fetch(ANTHROPIC_ENDPOINT, requestInit);
  } catch (transportError) {
    const errorName = String(transportError?.name || "unknown");
    console.error({ event: "anthropic_transport_error", error_name: errorName });
    throw tagFailure(new Error(`Anthropic : échec de transport (${errorName}).`), FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: "anthropic" });
  }
  const raw = await readBoundedText(response).catch((readError) => {
    throw tagFailure(readError, FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: "anthropic" });
  });
  if (!response.ok) {
    let code = "unknown";
    let message = "Message Anthropic indisponible.";
    try {
      const error = JSON.parse(raw)?.error;
      code = String(error?.type || "unknown");
      message = String(error?.message || message);
    } catch {}
    const redact = (value) => value
      .replace(/Bearer\s+\S+/gi, "Bearer [EXPURGÉ]")
      .replace(/\b(?:sk-ant-|gsk_|sk-)[A-Za-z0-9_-]+\b/g, "[EXPURGÉ]")
      .replace(/\s+/g, " ")
      .slice(0, 500);
    console.error({ event: "anthropic_api_error", status: response.status, code: redact(code), message: redact(message) });
    throw tagFailure(new Error(`Anthropic a répondu ${response.status}.`), classifyProviderHttpStatus(response.status), { provider: "anthropic", status: response.status });
  }
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw tagFailure(new Error("Anthropic a renvoyé une enveloppe non parsable."), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, { provider: "anthropic" });
  }
  const toolUseBlock = Array.isArray(envelope?.content) ? envelope.content.find((block) => block?.type === "tool_use" && block?.name === schemaName) : null;
  if (!toolUseBlock || typeof toolUseBlock.input !== "object" || toolUseBlock.input === null) {
    throw tagFailure(new Error("Anthropic n'a pas produit de tool_use exploitable pour la décision."), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, { provider: "anthropic" });
  }
  return toolUseBlock.input;
}

/**
 * 3F.3.3-X2-BATCH-R5.1c : raison_interne n'est PAS une autorité sémantique indépendante — c'est une
 * représentation CANONIQUE, purement déterministe, dérivée de etat_demande/route (expectedReason,
 * decision-core.js, réutilisée telle quelle, jamais réimplémentée ici). Preuve du smoke réel R5.1b
 * (claude-sonnet-4-6, cas 2) : le seul échec observé était "La raison interne ne correspond pas à
 * la décision" — le LLM n'a pas besoin d'une seconde possibilité de produire une phrase incompatible
 * avec sa propre décision, alors que cette phrase est déjà entièrement déductible de etat_demande/
 * route. etat_demande, route, confiance et question restent EXACTEMENT ceux produits par le modèle,
 * jamais modifiés ni corrigés ici — SEUL raison_interne est reconstruit avant validation. Ceci ne
 * contourne rien : validateDecision reste l'unique autorité de validation, appelée sur l'objet
 * complet, et continue de rejeter toute autre incohérence (état/route incompatibles, question
 * invalide, etc.) exactement comme avant — seule la comparaison raison_interne ne peut plus jamais
 * échouer pour une raison purement rédactionnelle du LLM, sans rapport avec la décision elle-même.
 */
export async function decideWithAnthropic(input, env, { contract = DECISION_CONTRACT } = {}) {
  const content = await callAnthropicMessages({
    systemPrompt: contract.prompt,
    userMessage: makeDecisionUserMessage(input),
    schema: contract.schema,
    schemaName: contract.schemaName,
    env,
    maxTokens: 512
  });
  const candidate = { ...content, raison_interne: expectedReason(content) };
  try {
    return validateDecision(candidate, input.demande);
  } catch (error) {
    throw tagFailure(error, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, { provider: "anthropic" });
  }
}

// ---------------------------------------------------------------------------------------------
// HA-01 : troisième provider pour /decision UNIQUEMENT — OpenAI Chat Completions.
//
// N'introduit AUCUNE logique de prompt/schéma propre : consomme DECISION_CONTRACT (donc
// DECISION_MODEL_PROMPT et DECISION_JSON_SCHEMA, decision-core.js, inchangés) exactement comme Groq
// et Anthropic. Le contrat public /decision reste strictement identique — seul LE TRANSPORT change.
//
// MÉCANISME DE STRUCTURED OUTPUT — justification explicite du choix : l'API Chat Completions d'OpenAI
// est celle dont l'API Groq déjà en production ici est la réplique compatible
// (https://api.groq.com/openai/v1/chat/completions). Le corps de requête envoyé ci-dessous est donc
// structurellement IDENTIQUE à celui de callGroqChatCompletion : même response_format
// {type:"json_schema", json_schema:{name, strict:true, schema}}, même schéma, même paire de messages.
// C'est la preuve la plus forte dont ce dépôt dispose que DECISION_JSON_SCHEMA passe le mode strict
// d'OpenAI : ce schéma exact y transite déjà quotidiennement via l'API compatible. Aucune projection,
// aucune réécriture, aucune divergence provider-specific du schéma n'est introduite ici.
//
// CHOIX DU MODÈLE : gpt-5.6-sol — identifiant RÉEL, relevé le 2026-08-28 dans la documentation
// officielle OpenAI et déjà utilisé par le harnais de mesure de ce dépôt
// (evaluation/lot10g3b2/run-benchmark.mjs, evaluation/lot10g3b2/summarize.mjs), jamais inventé ici.
// Il est exposé comme constante nommée, séparée du contrat sémantique, et surchargeable par la
// variable NON secrète OPENAI_DECISION_MODEL : recalibrer le modèle ne doit jamais exiger de toucher
// au prompt, au schéma ni à la validation. Ce n'est PAS du model shopping — c'est une configuration
// statique de déploiement, évaluée une seule fois, jamais une comparaison de sorties à l'exécution.
//
// PARAMÈTRES DÉLIBÉRÉMENT ABSENTS : ni `temperature`, ni `stream`, ni `reasoning_effort`. Les familles
// de modèles de raisonnement OpenAI rejettent (HTTP 400) une temperature explicite différente de leur
// valeur par défaut ; envoyer un paramètre non supporté transformerait le provider tertiaire en panne
// systématique. Le déterminisme du contrat est porté par le prompt gelé et le schéma strict, jamais
// par un réglage d'échantillonnage — Groq conserve son `temperature: 0`, strictement inchangé.
// ---------------------------------------------------------------------------------------------
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
export const OPENAI_MODEL = "gpt-5.6-sol";

/**
 * HA-01 — MAPPING DE SECRET EXPLICITE, SANS AUCUNE MUTATION CLOUDFLARE.
 *
 * Le secret OpenAI réellement présent sur le Worker de production `atelier-decision-groq` s'appelle
 * `OPenAI-API` (nom non standard, vérifié par `wrangler secret list` — valeur jamais lue ni affichée).
 * Ce lot NE LE RENOMME PAS : renommer un secret de production est une opération de déploiement, hors
 * périmètre HA-01. L'adaptateur consomme donc la réalité existante via une liste ORDONNÉE et
 * DOCUMENTÉE de noms acceptés :
 *   1. OPENAI_API_KEY — nom standard, cible d'une éventuelle normalisation future ;
 *   2. OPenAI-API     — nom réellement déployé aujourd'hui.
 * Le nom standard est essayé en premier : aujourd'hui il est absent et la résolution retombe sur
 * `OPenAI-API` ; le jour où un opérateur ajoutera proprement `OPENAI_API_KEY`, il prendra le relais
 * sans AUCUN changement de code. `OPenAI-API` n'est pas un identifiant JavaScript valide : il n'est
 * accessible que par indexation (env["OPenAI-API"]), jamais par `env.OPenAI-API`.
 */
export const OPENAI_API_KEY_BINDINGS = Object.freeze(["OPENAI_API_KEY", "OPenAI-API"]);

// Borne CHAQUE tentative réseau individuelle. Aligné sur ANTHROPIC_TIMEOUT_MS (20000ms, valeur
// validée en réel par le smoke R5.1a/R5.1c pour une décision) faute de mesure propre à OpenAI : ne
// pas inventer une valeur plus fine sans preuve (même discipline "NE PAS INVENTER" que R2/R5.1).
// Aucune politique de reprise 429 : cf. la note sur les retries en tête de decideWithHaChain.
const OPENAI_TIMEOUT_MS = 20000;

/**
 * Résout la clé OpenAI par NOM, dans l'ordre de OPENAI_API_KEY_BINDINGS. Retourne le NOM du binding
 * retenu (donnée d'observabilité sûre) et sa valeur (jamais journalisée, jamais retournée à
 * l'appelant HTTP), ou null si aucun binding n'est présent.
 */
export function resolveOpenAiApiKey(env) {
  for (const name of OPENAI_API_KEY_BINDINGS) {
    const value = env?.[name];
    if (typeof value === "string" && value.trim()) return { name, value };
  }
  return null;
}

async function callOpenAiChatCompletion({ systemPrompt, userMessage, schema, schemaName, env, maxCompletionTokens, timeoutMs = OPENAI_TIMEOUT_MS }) {
  const apiKey = resolveOpenAiApiKey(env);
  if (!apiKey) {
    throw tagFailure(
      new Error(`Secret OpenAI absent (aucun binding parmi ${OPENAI_API_KEY_BINDINGS.join(", ")}).`),
      FAILURE_CLASSES.CONFIG_UNAVAILABLE, { provider: "openai" }
    );
  }
  const model = typeof env.OPENAI_DECISION_MODEL === "string" && env.OPENAI_DECISION_MODEL.trim()
    ? env.OPENAI_DECISION_MODEL.trim()
    : OPENAI_MODEL;
  let response;
  try {
    response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.value}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema
          }
        },
        max_completion_tokens: maxCompletionTokens
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (transportError) {
    const errorName = String(transportError?.name || "unknown");
    console.error({ event: "openai_transport_error", error_name: errorName });
    throw tagFailure(new Error(`OpenAI : échec de transport (${errorName}).`), FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: "openai" });
  }
  const raw = await readBoundedText(response).catch((readError) => {
    throw tagFailure(readError, FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: "openai" });
  });
  if (!response.ok) {
    let code = "unknown";
    let message = "Message OpenAI indisponible.";
    try {
      const error = JSON.parse(raw)?.error;
      code = String(error?.code || error?.type || "unknown");
      message = String(error?.message || message);
    } catch {}
    const redact = (value) => value
      .replace(/Bearer\s+\S+/gi, "Bearer [EXPURGÉ]")
      .replace(/\b(?:sk-proj-|sk-ant-|gsk_|sk-)[A-Za-z0-9_-]+\b/g, "[EXPURGÉ]")
      .replace(/\s+/g, " ")
      .slice(0, 500);
    console.error({ event: "openai_api_error", status: response.status, code: redact(code), message: redact(message) });
    throw tagFailure(new Error(`OpenAI a répondu ${response.status}.`), classifyProviderHttpStatus(response.status), { provider: "openai", status: response.status });
  }
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw tagFailure(new Error("OpenAI a renvoyé une enveloppe non parsable."), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, { provider: "openai" });
  }
  return envelope?.choices?.[0]?.message?.content;
}

/**
 * HA-01 : adaptateur Decision OpenAI. Strictement symétrique de decideWithGroq — même contrat, même
 * mécanisme de structured output, même validation finale (parseDecisionCandidate/validateDecision,
 * decision-core.js, unique autorité). Contrairement à decideWithAnthropic, raison_interne N'EST PAS
 * dérivée canoniquement ici : le mode strict json_schema contraint déjà `raison_interne` à l'énumération
 * exacte des trois phrases (DECISION_JSON_SCHEMA), exactement comme sur Groq. La dérivation R5.1c
 * répondait à une contrainte propre au mécanisme tool_use d'Anthropic, jamais à une faiblesse du
 * contrat : ne pas l'étendre sans la même preuve empirique.
 */
export async function decideWithOpenAI(input, env, { contract = DECISION_CONTRACT } = {}) {
  const content = await callOpenAiChatCompletion({
    systemPrompt: contract.prompt,
    userMessage: makeDecisionUserMessage(input),
    schema: contract.schema,
    schemaName: contract.schemaName,
    env,
    maxCompletionTokens: 512
  });
  try {
    return parseDecisionCandidate(content, input.demande);
  } catch (error) {
    throw tagFailure(error, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, { provider: "openai" });
  }
}

// ---------------------------------------------------------------------------------------------
// HA-01 : chaîne de haute disponibilité du rôle DECISION.
// ---------------------------------------------------------------------------------------------

/** Ordre de priorité, EXACT et FIGÉ : Groq (primary) -> Anthropic (secondary) -> OpenAI (tertiary). */
export const DECISION_PROVIDER_ORDER = Object.freeze(["groq", "anthropic", "openai"]);

/** Registre des adaptateurs. Un adaptateur = un TRANSPORT, jamais une variante de contrat. */
export const DECISION_ADAPTERS = Object.freeze({
  groq: decideWithGroq,
  anthropic: decideWithAnthropic,
  openai: decideWithOpenAI
});

/**
 * Failover SERVER-SIDE, AUTOMATIQUE, TECHNIQUE UNIQUEMENT.
 *
 * Bascule (classes éligibles, cf. provider-ha.js) : timeout, DNS/connexion, 429 après reprises
 * bornées, 5xx, provider indisponible, secret absent, transport rompu, structured output invalide.
 * Ne bascule JAMAIS : une décision techniquement valide. Une décision "architecte", une confiance
 * "moyenne" ou une clarification sont des RÉSULTATS FINAUX — l'orchestrateur ne lit même pas le
 * résultat qu'il retourne, ce qui rend le model shopping structurellement impossible.
 *
 * RETRIES — politique explicite et non multipliée :
 *   - l'orchestrateur ne réessaie JAMAIS un provider ; il n'y a donc aucune multiplication cachée
 *     entre la couche adaptateur et la couche HA ;
 *   - Groq conserve intégralement sa politique 429/Retry-After existante (GROQ_PRODUCTION_RETRY_DEFAULTS,
 *     maxRetries=2, Retry-After + marge, timeout 8000ms par tentative) : aucun bug prouvé, donc aucune
 *     modification (section 10 du lot) ;
 *   - Anthropic et OpenAI n'ont AUCUNE politique de reprise. Ce n'est pas un oubli : avec une chaîne
 *     de trois providers, réessayer un provider indisponible RETARDE l'accès au suivant. Une reprise
 *     n'a de valeur que lorsqu'il n'existe pas d'alternative ; ici il en existe une, immédiate. Aucune
 *     preuve empirique n'existe par ailleurs qu'une reprise Anthropic/OpenAI serait nécessaire (même
 *     discipline "NE PAS INVENTER" que R2/R5.1).
 *
 * CIRCUIT BREAKER : délibérément absent de HA-01. Un breaker n'apporterait rien tant que le failover
 * simple suffit, exigerait des seuils que rien ne justifie empiriquement aujourd'hui, et introduirait
 * un état inter-requêtes dans un runtime dont les isolates sont recyclés sans garantie. À reconsidérer
 * uniquement sur preuve de coût réel du chemin d'échec.
 *
 * SI LES TROIS ÉCHOUENT : ProviderChainError est levée. Aucune décision locale n'est fabriquée, aucun
 * "exploitable" ni aucune route n'est inventé, aucun READY artificiel n'est produit. L'erreur remonte
 * à handleDecisionRequest (decision-core.js, INCHANGÉ), qui répond 502 provider_failure — exactement
 * le contrat HTTP déjà en vigueur aujourd'hui pour toute panne de provider. Intégration future du
 * degraded_state : ProviderChainError transporte déjà `all_providers_failed` et `attempts`
 * ([{provider, failure_class}]) — c'est la seule donnée que l'OPRIE aura besoin de consommer pour
 * produire un degraded_state technique ; ce lot ne l'expose PAS sur le contrat HTTP public (hors
 * périmètre HA-01), et OPRIE reste l'unique autorité de cet état.
 */
export async function decideWithHaChain(input, env, { contract = DECISION_CONTRACT, order = DECISION_PROVIDER_ORDER, log } = {}) {
  return runProviderChain({
    role: "decision",
    preflight: () => assertDecisionContractUsable(contract),
    providers: order.map((name) => ({
      name,
      execute: () => DECISION_ADAPTERS[name](input, env, { contract })
    })),
    ...(log ? { log } : {})
  });
}

/**
 * Sélection du provider pour /decision UNIQUEMENT, via la variable NON secrète DECISION_PROVIDER.
 *
 * - absente (cas de la production actuelle) ou "ha" -> CHAÎNE HA complète : Groq -> Anthropic -> OpenAI.
 *   Le comportement nominal est donc strictement celui d'avant (Groq répond en premier et son succès
 *   est final) ; seul le chemin d'ÉCHEC change.
 * - "groq" | "anthropic" | "openai" -> provider ÉPINGLÉ, sans aucun failover. Une sélection explicite
 *   par un opérateur reste une instruction, jamais une préférence à contourner : l'erreur du provider
 *   choisi remonte telle quelle (contrat R5.1-12/R5.1-12b, préservé sans modification).
 * - toute autre valeur, y compris "auto" -> erreur de configuration explicite, AUCUN appel réseau,
 *   aucun repli silencieux (contrat R5.1-4/R5.1-4b, préservé sans modification : "auto" n'a jamais été
 *   et n'est toujours pas un mode supporté ; le mode chaîne s'écrit "ha", ou ne s'écrit pas du tout).
 */
export async function decideWithSelectedProvider(input, env, options = {}) {
  const provider = env.DECISION_PROVIDER || "ha";
  if (provider === "ha") return decideWithHaChain(input, env, options);
  if (Object.hasOwn(DECISION_ADAPTERS, provider)) return DECISION_ADAPTERS[provider](input, env, options);
  const allowed = ["ha", ...DECISION_PROVIDER_ORDER].map((value) => `"${value}"`).join(", ");
  throw tagFailure(
    new Error(`DECISION_PROVIDER invalide : "${provider}" (valeurs autorisées : ${allowed}).`),
    FAILURE_CLASSES.CONTRACT_ERROR
  );
}

/**
 * Exécute un rôle OPRIE (analyst | critic | arbiter) sur Groq, avec exactement le même prompt
 * système et le même schéma JSON que Workers AI — le registre ROLE_DEFINITIONS
 * (operational-request-core.js) est l'unique source de vérité pour les deux.
 *
 * 3F.3.3-X2-BATCH-R1 : pour le rôle critic, cette fonction reste le chemin MONOLITHIQUE hérité
 * (CRITIC_SYSTEM_PROMPT + buildCriticJsonSchema, un seul appel) — conservé intact, byte-identique,
 * comme référence/rollback explicite (section 4 du lot R1) et toujours exercé par les tests
 * historiques X2-A/X2-B/X2-B-RS (notamment la parité de corps de requête dans
 * operational-request-benchmark-harness.test.mjs). Il n'est cependant PLUS le chemin emprunté par
 * défaut pour critic : cf. runCriticWithGroq ci-dessous et le routage fetch() en bas de fichier.
 * Pour analyst et arbiter (mono-call par nature, non concernés par X2-BATCH), c'est toujours ici le
 * chemin réel de production.
 */
export async function runRoleWithGroq(role, input, env) {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) throw new Error(`Rôle OPRIE inconnu : ${role}.`);
  const content = await callGroqChatCompletion({
    systemPrompt: definition.systemPrompt,
    userMessage: definition.buildUserMessage(input),
    schema: resolveRoleSchema(definition, input),
    schemaName: `oprie_${role}`,
    env,
    maxCompletionTokens: 2048
  });
  // HA-02 : classification explicite, identique à celle des adaptateurs Anthropic et OpenAI. Avant
  // cette correction, une sortie de rôle inexploitable produite par Groq remontait NON étiquetée,
  // devenait donc PROGRAMMING_ERROR et faisait échouer la chaîne en fail-closed au lieu de basculer —
  // alors que le chemin Decision traite exactement le même cas en STRUCTURED_OUTPUT_INVALID depuis
  // HA-01. Défaut révélé par le test HA02-R4/R5.
  return parseRoleOutput(role, content, "groq");
}

// ---------------------------------------------------------------------------------------------
// 3F.3.3-X2-BATCH-R1 : chemin RUNTIME PAR DÉFAUT du rôle critic — Critic global + Substitution
// Review batchée (operational-request-core.js#runCriticBatchedPipeline, provider-agnostique). Ceci
// est la SEULE particularité Groq de ce pipeline (section 2 du lot R1) : les prompts, schémas et
// l'orchestration eux-mêmes restent définis une seule fois dans operational-request-core.js, jamais
// dupliqués ici — ce fichier ne fait que fournir le transport réseau (callGroqChatCompletion,
// inchangé, déjà générique) et les constantes de capacité propres à Groq.
//
// GROQ_CRITIC_CAPABILITY formalise EXPLICITEMENT toute constante technique auparavant susceptible de
// rester une "constante métier invisible" (section 7 du lot R1) : aucune n'est codée en dur ailleurs
// que dans cet objet nommé. Valeurs mesurées empiriquement (rapport X2-BATCH) sur le prompt dédié
// réel ; tpm_budget est la limite Groq réellement observée par smoke (X2-B, HTTP 413 à
// Requested=8016/Limit=8000) — non appliquée arithmétiquement ici (computeBatchPlan raisonne en
// caractères, jamais en tokens Groq exacts), seulement documentée comme justification d'input_budget.
// ---------------------------------------------------------------------------------------------
const GROQ_CRITIC_CAPABILITY = Object.freeze({
  input_budget: 24400,                 // car., plafond d'entrée par batch (mesuré : ~6 issues/batch)
  tpm_budget: 8000,                    // limite Groq réelle observée par smoke — documentation seule
  rpm_budget: null,                    // non contraint empiriquement à ce jour
  global_max_completion_units: 2048,   // tokens, Critic global — valeur de production conservée par
                                        // prudence (aucune mesure réseau réelle de sa sortie réduite)
  fixed_output_units: 20,              // tokens, coût fixe de sortie par batch
  per_target_output_units: 260,        // tokens, coût marginal de sortie par issue
  completion_safety_factor: 1.25,
  min_completion_units: 256,
  max_completion_units: 2048,
  // Repli requis par la validation de computeBatchPlan (perTargetUnits fini > 0 toujours exigé) —
  // JAMAIS utilisé pour le calcul réel ci-dessous, qui fournit systématiquement unitsForTarget
  // (coût réel mesuré par appel, jamais une moyenne figée).
  per_target_input_units_fallback: 1767
});

/** Capacité d'entrée réelle pour CET appel : taille effective du prompt dédié + contexte complet
 * réellement transmis, jamais une moyenne — seul le plafond (input_budget) est une constante. */
function groqCriticBatchPlanCapability({ original_request, clarification_history, analyst_output }) {
  const fixedOverheadUnits = SUBSTITUTION_REVIEW_SYSTEM_PROMPT.length + JSON.stringify({
    original_request, clarification_history, analyst_output, question_review_targets: []
  }).length;
  return {
    fixedOverheadUnits,
    perTargetUnits: GROQ_CRITIC_CAPABILITY.per_target_input_units_fallback,
    maxUnitsPerBatch: GROQ_CRITIC_CAPABILITY.input_budget,
    unitsForTarget: (target) => JSON.stringify(target).length
  };
}

function groqCriticOutputCapability() {
  return {
    perIssueOutputUnits: GROQ_CRITIC_CAPABILITY.per_target_output_units,
    fixedOutputOverheadUnits: GROQ_CRITIC_CAPABILITY.fixed_output_units,
    safetyMarginRatio: GROQ_CRITIC_CAPABILITY.completion_safety_factor - 1,
    minOutputUnits: GROQ_CRITIC_CAPABILITY.min_completion_units,
    maxOutputUnits: GROQ_CRITIC_CAPABILITY.max_completion_units
  };
}

/**
 * Chemin critic réel de production sur Groq : Critic global (1 appel) + Substitution Review batchée
 * (K appels séquentiels, jamais parallèles) + assemblage + dérivation + validation, entièrement
 * orchestrés par runCriticBatchedPipeline (pur, testé, operational-request-core.js). Un échec
 * technique de batch (panne réseau, HTTP non-2xx, 429 non résolu après reprise) remonte tel quel à
 * handleRoleRequest, qui le transforme déjà en réponse 502 role_provider_failure — jamais un
 * degraded_state fabriqué ici : OPRIE reste seule autorité de cet état (cf. tests runtime R1/R2).
 *
 * 3F.3.3-X2-BATCH-R2 : un seul pacer (createGroqRateLimitPacer) est créé PAR EXÉCUTION de ce pipeline
 * et partagé entre l'appel global et tous les appels de batch — jamais un singleton module-level, sans
 * jamais coder Groq/8000/une durée de fenêtre en dur dans le core sémantique (operational-request-
 * core.js reste totalement inchangé par ce lot).
 *
 * 3F.3.3-X2-BATCH-R2.1 (CORRECTION) : contrairement à ce que R2 visait, ce pacer NE fait PAS respecter
 * un budget agrégé entre appels successifs — cf. la correction de callGroqChatCompletion et le
 * rapport R2.1 : le seul signal dont R2 disposait (rate_limited_wait_ms) décrit toujours un délai déjà
 * consommé par le retry interne de l'appel qui vient de réussir ou d'échouer, jamais une contrainte
 * encore future pour l'appel SUIVANT. Chaque appel (global, batch1, batch2, ...) honore désormais
 * exclusivement SON PROPRE 429 éventuel via fetchGroqWithRetry, de façon strictement indépendante des
 * autres — c'est le seul mécanisme de correction TPM réel de ce pipeline (le pacer reste câblé pour
 * une contrainte future légitime qui serait un jour prouvée, mais n'en reçoit aujourd'hui aucune).
 * `retryOverrides` (optionnel, tests uniquement) permet d'injecter un sleepFn instantané pour garder
 * la suite locale rapide et déterministe (section 8 du lot R2) — jamais utilisé en production.
 */
export async function runCriticWithGroq(input, env, { retryOverrides = {} } = {}) {
  const pacer = createGroqRateLimitPacer({ sleepFn: retryOverrides.sleepFn });
  return runCriticBatchedPipeline(
    { ...input, capability: groqCriticBatchPlanCapability(input) },
    {
      executeGlobal: (globalInput) => callGroqChatCompletion({
        systemPrompt: CRITIC_GLOBAL_SYSTEM_PROMPT,
        userMessage: makeCriticGlobalUserMessage(globalInput),
        schema: CRITIC_GLOBAL_JSON_SCHEMA,
        schemaName: "critic_global",
        env,
        maxCompletionTokens: GROQ_CRITIC_CAPABILITY.global_max_completion_units,
        pacer,
        retryOverrides
      }),
      executeBatch: (batchInput) => callGroqChatCompletion({
        systemPrompt: SUBSTITUTION_REVIEW_SYSTEM_PROMPT,
        userMessage: makeSubstitutionReviewBatchUserMessage(batchInput),
        schema: buildSubstitutionBatchSchema(batchInput.issueIds),
        schemaName: "substitution_review_batch",
        env,
        maxCompletionTokens: estimateSubstitutionBatchOutputUnits(batchInput.issueIds.length, groqCriticOutputCapability()),
        pacer,
        retryOverrides
      })
    }
  );
}

/**
 * MICRO-PREUVE-DECOUPAGE-CANDIDATES : variante fan-out candidate-group du chemin critic Groq — Critic
 * global (1 appel, INCHANGÉ) + Substitution Review, mais dispersée en plusieurs sous-appels par
 * groupe de familles (candidateFamilyGroups, ex. 2x3/3x2/6x1), au lieu d'un appel unique demandant les
 * 6 familles. Réutilise EXACTEMENT le même transport (callGroqChatCompletion), le même retry/pacing
 * R2.1 (fetchGroqWithRetry, pacer, retryOverrides), le même plan de batch par issue
 * (groqCriticBatchPlanCapability, INCHANGÉ) et le même budget de sortie par appel
 * (groqCriticOutputCapability, INCHANGÉ) que runCriticWithGroq ci-dessus — seuls le SCHÉMA et le
 * PROMPT SYSTÈME de chaque sous-appel Substitution Review changent
 * (buildSubstitutionBatchSchema(issueIds, familyGroup) / buildSubstitutionReviewGroupSystemPrompt
 * (familyGroup), operational-request-core.js, tous deux INCHANGÉS par ce lot pour le chemin par
 * défaut). runCriticBatchedPipeline (INCHANGÉE) orchestre le fan-out et la fusion des groupes
 * (mergeCandidateGroups, PURE) — ce fichier ne fait toujours que fournir le transport réseau et les
 * constantes de capacité Groq, jamais une décision sémantique.
 */
export async function runCriticWithGroqFanOut(input, env, { candidateFamilyGroups, retryOverrides = {} } = {}) {
  const pacer = createGroqRateLimitPacer({ sleepFn: retryOverrides.sleepFn });
  return runCriticBatchedPipeline(
    { ...input, capability: groqCriticBatchPlanCapability(input), candidateFamilyGroups },
    {
      executeGlobal: (globalInput) => callGroqChatCompletion({
        systemPrompt: CRITIC_GLOBAL_SYSTEM_PROMPT,
        userMessage: makeCriticGlobalUserMessage(globalInput),
        schema: CRITIC_GLOBAL_JSON_SCHEMA,
        schemaName: "critic_global",
        env,
        maxCompletionTokens: GROQ_CRITIC_CAPABILITY.global_max_completion_units,
        pacer,
        retryOverrides
      }),
      executeBatch: (batchInput) => callGroqChatCompletion({
        systemPrompt: buildSubstitutionReviewGroupSystemPrompt(batchInput.familyGroup),
        userMessage: makeSubstitutionReviewBatchUserMessage(batchInput),
        schema: buildSubstitutionBatchSchema(batchInput.issueIds, batchInput.familyGroup),
        schemaName: "substitution_review_batch",
        env,
        maxCompletionTokens: estimateSubstitutionBatchOutputUnits(batchInput.issueIds.length, groqCriticOutputCapability()),
        pacer,
        retryOverrides
      })
    }
  );
}

/**
 * 3F.3.3-X2-BATCH-R5.2 : second provider pour le pipeline Critic batché (Critic global +
 * Substitution Review) — Anthropic Messages API. N'introduit AUCUNE logique de prompt/schéma propre :
 * réutilise CRITIC_GLOBAL_SYSTEM_PROMPT, CRITIC_GLOBAL_JSON_SCHEMA, makeCriticGlobalUserMessage,
 * SUBSTITUTION_REVIEW_SYSTEM_PROMPT, buildSubstitutionBatchSchema, makeSubstitutionReviewBatchUserMessage
 * et runCriticBatchedPipeline (operational-request-core.js) tels quels — mêmes prompts, mêmes
 * schémas, mêmes invariants, même assemblage, même deriveCriticConsequences/validateCriticOutput
 * qu'avec Groq (aucun des deux n'est jamais touché par ce lot). callAnthropicMessages (R5.1) est déjà
 * entièrement générique (systemPrompt/userMessage/schema/schemaName/env/maxTokens en paramètres,
 * jamais spécifique au Decision Provider) : aucune adaptation de transport supplémentaire n'était
 * nécessaire pour le pipeline Critic — seule cette fonction d'orchestration est nouvelle.
 *
 * Réutilise EXACTEMENT le même plan de batch que Groq : groqCriticBatchPlanCapability et
 * groqCriticOutputCapability (inchangées, mêmes constantes GROQ_CRITIC_CAPABILITY) ne contiennent
 * aucune logique de transport Groq, seulement un dimensionnement structurel (taille de prompt, coût
 * par target) déjà provider-agnostique par construction (cf. docstring d'origine, R1) — leur nom
 * reste "groq*" par fidélité historique au lot qui les a introduites. Les réutiliser telles quelles
 * pour dimensionner l'appel Anthropic garantit un plan de batch IDENTIQUE à celui de Groq pour la
 * même fixture (condition explicite du lot R5.2 : comparer les deux providers sur EXACTEMENT le même
 * découpage, jamais confondre une variation de plan de batch avec une variation de provider).
 *
 * Aucun pacer, aucun retry 429 : comme decideWithAnthropic (R5.1), Anthropic n'a reçu à ce jour
 * aucune politique de reprise faute de preuve empirique qu'elle serait nécessaire (même discipline
 * "NE PAS INVENTER" que R2/R5.1) — chaque appel (global, batch 1, batch 2, ...) est un
 * callAnthropicMessages simple, strictement séquentiel (jamais parallèle, cf. runCriticBatchedPipeline),
 * sans état partagé entre appels. Un échec technique remonte tel quel (technical_state=
 * "partial_failure" pour un batch, ou l'erreur du Critic global) — jamais un review fabriqué.
 */
export async function runCriticWithAnthropic(input, env) {
  return runCriticBatchedPipeline(
    { ...input, capability: groqCriticBatchPlanCapability(input) },
    {
      executeGlobal: (globalInput) => callAnthropicMessages({
        systemPrompt: CRITIC_GLOBAL_SYSTEM_PROMPT,
        userMessage: makeCriticGlobalUserMessage(globalInput),
        schema: CRITIC_GLOBAL_JSON_SCHEMA,
        schemaName: "critic_global",
        env,
        maxTokens: GROQ_CRITIC_CAPABILITY.global_max_completion_units,
        timeoutMs: ANTHROPIC_CRITIC_TIMEOUT_MS
      }),
      executeBatch: (batchInput) => callAnthropicMessages({
        systemPrompt: SUBSTITUTION_REVIEW_SYSTEM_PROMPT,
        userMessage: makeSubstitutionReviewBatchUserMessage(batchInput),
        schema: buildSubstitutionBatchSchema(batchInput.issueIds),
        schemaName: "substitution_review_batch",
        env,
        maxTokens: estimateSubstitutionBatchOutputUnits(batchInput.issueIds.length, groqCriticOutputCapability()),
        timeoutMs: ANTHROPIC_CRITIC_TIMEOUT_MS
      })
    }
  );
}

// =================================================================================================
// HA-02 — HAUTE DISPONIBILITÉ DES RÔLES OPRIE (analyst, critic, arbiter).
//
// Réutilise l'orchestrateur de HA-01 (provider-ha.js) tel quel : aucun second orchestrateur, aucune
// seconde taxonomie d'erreur, aucune seconde règle de cause commune. Les adaptateurs ci-dessous ne
// sont que du TRANSPORT : prompts, schémas, parseurs et validateurs viennent tous, sans exception,
// de ROLE_DEFINITIONS (operational-request-core.js, INCHANGÉ par ce lot).
// =================================================================================================

/** Même ordre que Decision : Groq (primary) -> Anthropic (secondary) -> OpenAI (tertiary). */
export const ROLE_PROVIDER_ORDER = Object.freeze(["groq", "anthropic", "openai"]);

// Les rôles OPRIE transportent des prompts et des sorties nettement plus volumineux qu'une décision :
// ils utilisent le plafond de mesure déjà calibré en réel pour le pipeline Critic Anthropic (R5.2a),
// jamais celui de /decision (20000 ms, dimensionné pour une décision courte).
const OPENAI_ROLE_TIMEOUT_MS = 60000;
const ROLE_MAX_OUTPUT_UNITS = 2048;

/**
 * Préflight de contrat COMMUN au rôle, exécuté UNE SEULE FOIS avant toute tentative provider —
 * exactement la même discipline que assertDecisionContractUsable (HA-01) : un prompt vide ou un
 * schéma inutilisable est une erreur de NOTRE code, identique pour les trois providers ; l'envoyer
 * trois fois ne produirait que trois HTTP 400.
 */
export function assertRoleContractUsable(role, input) {
  const fail = (reason) => {
    throw tagFailure(new Error(`Contrat ${role} inutilisable : ${reason}`), FAILURE_CLASSES.CONTRACT_ERROR);
  };
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) fail("rôle OPRIE inconnu.");
  if (typeof definition.systemPrompt !== "string" || !definition.systemPrompt.trim()) fail("prompt système absent ou vide.");
  if (typeof definition.parseOutput !== "function") fail("parseur/validateur absent.");
  const schema = resolveRoleSchema(definition, input);
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) fail("schéma absent.");
  if (schema.type !== "object") fail("le schéma racine doit être de type \"object\".");
  if (schema.additionalProperties !== false) fail("le schéma racine doit porter additionalProperties=false (mode strict).");
  if (!schema.properties || typeof schema.properties !== "object") fail("le schéma racine ne déclare aucune propriété.");
  const propertyKeys = Object.keys(schema.properties).sort();
  const requiredKeys = Array.isArray(schema.required) ? [...schema.required].sort() : null;
  if (!requiredKeys) fail("le schéma racine ne déclare pas \"required\".");
  if (requiredKeys.length !== propertyKeys.length || requiredKeys.some((key, index) => key !== propertyKeys[index])) {
    fail("\"required\" ne couvre pas exactement \"properties\" (mode strict).");
  }
}

/** Sortie de rôle inexploitable = défaut de CE modèle sur CET appel, jamais un désaccord sémantique. */
function parseRoleOutput(role, content, provider) {
  try {
    return ROLE_DEFINITIONS[role].parseOutput(content);
  } catch (error) {
    throw tagFailure(error, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, { provider, role });
  }
}

/**
 * HA-02 : rôle OPRIE sur Anthropic. Strictement symétrique de runRoleWithGroq — mêmes systemPrompt,
 * schéma, userMessage et parseOutput, issus du MÊME registre. callAnthropicMessages (R5.1) était déjà
 * entièrement générique : aucune adaptation de transport supplémentaire n'était nécessaire.
 */
export async function runRoleWithAnthropic(role, input, env) {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) throw new Error(`Rôle OPRIE inconnu : ${role}.`);
  const content = await callAnthropicMessages({
    systemPrompt: definition.systemPrompt,
    userMessage: definition.buildUserMessage(input),
    schema: resolveRoleSchema(definition, input),
    schemaName: `oprie_${role}`,
    env,
    maxTokens: ROLE_MAX_OUTPUT_UNITS,
    timeoutMs: ANTHROPIC_CRITIC_TIMEOUT_MS
  });
  return parseRoleOutput(role, content, "anthropic");
}

/**
 * HA-02 : rôle OPRIE sur OpenAI. Le mode strict json_schema d'OpenAI exige required == properties et
 * additionalProperties=false partout — invariants déjà garantis pour les trois schémas OPRIE par
 * tests/operational-request-groq-schema-compat.test.mjs, et revérifiés à l'exécution par
 * assertRoleContractUsable. Aucune projection, aucune réécriture de schéma.
 */
export async function runRoleWithOpenAI(role, input, env) {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) throw new Error(`Rôle OPRIE inconnu : ${role}.`);
  const content = await callOpenAiChatCompletion({
    systemPrompt: definition.systemPrompt,
    userMessage: definition.buildUserMessage(input),
    schema: resolveRoleSchema(definition, input),
    schemaName: `oprie_${role}`,
    env,
    maxCompletionTokens: ROLE_MAX_OUTPUT_UNITS,
    timeoutMs: OPENAI_ROLE_TIMEOUT_MS
  });
  return parseRoleOutput(role, content, "openai");
}

/**
 * HA-02 : pipeline Critic batché sur OpenAI. Réutilise EXACTEMENT runCriticBatchedPipeline et le même
 * plan de batch que Groq et Anthropic (groqCriticBatchPlanCapability / groqCriticOutputCapability,
 * inchangées) : un même corpus produit le MÊME découpage quel que soit le provider — condition pour
 * ne jamais confondre une variation de plan avec une variation de fournisseur. Aucun pacer, aucune
 * reprise 429 : même discipline que runCriticWithAnthropic.
 */
export async function runCriticWithOpenAI(input, env) {
  return runCriticBatchedPipeline(
    { ...input, capability: groqCriticBatchPlanCapability(input) },
    {
      executeGlobal: (globalInput) => callOpenAiChatCompletion({
        systemPrompt: CRITIC_GLOBAL_SYSTEM_PROMPT,
        userMessage: makeCriticGlobalUserMessage(globalInput),
        schema: CRITIC_GLOBAL_JSON_SCHEMA,
        schemaName: "critic_global",
        env,
        maxCompletionTokens: GROQ_CRITIC_CAPABILITY.global_max_completion_units,
        timeoutMs: OPENAI_ROLE_TIMEOUT_MS
      }),
      executeBatch: (batchInput) => callOpenAiChatCompletion({
        systemPrompt: SUBSTITUTION_REVIEW_SYSTEM_PROMPT,
        userMessage: makeSubstitutionReviewBatchUserMessage(batchInput),
        schema: buildSubstitutionBatchSchema(batchInput.issueIds),
        schemaName: "substitution_review_batch",
        env,
        maxCompletionTokens: estimateSubstitutionBatchOutputUnits(batchInput.issueIds.length, groqCriticOutputCapability()),
        timeoutMs: OPENAI_ROLE_TIMEOUT_MS
      })
    }
  );
}

/**
 * HA-02 — GRANULARITÉ DU FAILOVER CRITIC : décision explicite, PAR PIPELINE, jamais par batch.
 *
 * Trois options étaient possibles : basculer un batch isolé, basculer l'appel global seul, ou rejouer
 * le pipeline entier sur le provider suivant. La troisième est retenue, pour trois raisons de
 * correction — pas de performance :
 *
 *   1. HOMOGÉNÉITÉ. Un CriticOutput assemble un appel global et K appels de Substitution Review qui
 *      se référencent mutuellement (vetoes, semantic_drift_detected, gate de substitution). Mélanger
 *      les fournisseurs à l'intérieur d'un même assemblage produirait un résultat qu'aucun modèle n'a
 *      réellement produit, et que personne ne pourrait reproduire.
 *   2. EXACT-SIX ET partial_failure. runCriticBatchedPipeline (INCHANGÉE) impose qu'un batch ne soit
 *      réussi que si TOUS ses groupes réussissent, et rejette sinon avec technical_state=
 *      "partial_failure". Réparer un batch avec un autre fournisseur reviendrait à contourner ce
 *      contrat d'échec depuis l'extérieur.
 *   3. NON-CONTAMINATION SÉMANTIQUE. Un failover par batch reviendrait à choisir, batch par batch, le
 *      fournisseur qui « a réussi » — c'est-à-dire exactement du model shopping déguisé en résilience.
 *
 * Le prix est assumé : un échec tardif rejoue tout le pipeline sur le provider suivant. C'est le coût
 * de la cohérence, et il ne se paie que sur le chemin d'échec.
 *
 * Seuls deux types d'échec du pipeline basculent : (a) ceux déjà classés par le transport
 * (callGroqChatCompletion / callAnthropicMessages / callOpenAiChatCompletion), (b) technical_state=
 * "partial_failure". Tout autre échec reste NON étiqueté, donc PROGRAMMING_ERROR, donc fail-closed :
 * un rejet structurel de la sortie par validateCriticOutput ne doit pas être rejoué en espérant qu'un
 * autre modèle passe — ce serait masquer un défaut de contrat par du model shopping.
 */
function tagCriticPipelineFailure(error, provider) {
  if (failureClassOf(error) !== FAILURE_CLASSES.PROGRAMMING_ERROR) return error;
  if (error?.technical_state === "partial_failure") {
    return tagFailure(error, FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider, role: "critic" });
  }
  return error;
}

const CRITIC_PIPELINES = Object.freeze({
  groq: (input, env, options) => runCriticWithGroq(input, env, options),
  anthropic: (input, env) => runCriticWithAnthropic(input, env),
  openai: (input, env) => runCriticWithOpenAI(input, env)
});

const GENERIC_ROLE_ADAPTERS = Object.freeze({
  groq: (role, input, env) => runRoleWithGroq(role, input, env),
  anthropic: (role, input, env) => runRoleWithAnthropic(role, input, env),
  openai: (role, input, env) => runRoleWithOpenAI(role, input, env)
});

/**
 * HA-02 : chaîne de haute disponibilité d'un rôle OPRIE. Même orchestrateur, même classification,
 * même règle de cause commune, même fail-closed que Decision.
 *
 * SI LES TROIS ÉCHOUENT : ProviderChainError remonte telle quelle à handleRoleRequest, qui répond
 * 502 role_provider_failure — contrat HTTP STRICTEMENT INCHANGÉ (R1-9/R1-10, qui interdisent
 * explicitement tout champ state/degraded_state dans cette réponse). La traduction en degraded_state
 * canonique est fournie séparément par degradedResultFromProviderChainError, à l'usage de la couche
 * qui possède l'autorité OPRIE — jamais décidée ici.
 */
export async function runRoleWithHaChain(role, input, env, { order = ROLE_PROVIDER_ORDER, log, retryOverrides } = {}) {
  const isCritic = role === "critic";
  return runProviderChain({
    role,
    preflight: () => assertRoleContractUsable(role, input),
    providers: order.map((name) => ({
      name,
      execute: isCritic
        ? async () => {
            try {
              return await CRITIC_PIPELINES[name](input, env, retryOverrides ? { retryOverrides } : {});
            } catch (error) {
              throw tagCriticPipelineFailure(error, name);
            }
          }
        : () => GENERIC_ROLE_ADAPTERS[name](role, input, env)
    })),
    ...(log ? { log } : {})
  });
}

function roleFromPathname(pathname) {
  const role = pathname.replace(/^\//, "");
  return OPRIE_ROLES.includes(role) ? role : null;
}

// 3F.3.3-X2-BATCH-R1 : le rôle critic est routé vers le pipeline batché (chemin réel de production) ;
// analyst et arbiter vers le chemin générique mono-call. Ces deux chemins restent EXACTEMENT ceux
// d'avant HA-02 pour le provider Groq.
//
// HA-02 : ils sont désormais la PREMIÈRE tentative d'une chaîne Groq -> Anthropic -> OpenAI, au lieu
// d'être la seule. Le chemin nominal est donc strictement inchangé (Groq répond, son succès est
// final) ; seul le chemin d'échec gagne deux fournisseurs de repli.
function executeForRole(role) {
  return (input, roleEnv) => runRoleWithHaChain(role, input, roleEnv);
}

export default {
  fetch(request, env) {
    if (!request.headers.get("Origin")) {
      return Response.json({ error: "origin_not_allowed" }, { status: 403 });
    }
    const role = roleFromPathname(new URL(request.url).pathname);
    if (role) return handleRoleRequest(request, env, { role, execute: executeForRole(role) });
    // Route historique /decision : contrat public strictement inchangé (handleDecisionRequest,
    // decision-core.js, non touchés). Seule la fonction `decide` injectée change — elle sélectionne
    // désormais explicitement Groq ou Anthropic via DECISION_PROVIDER (3F.3.3-X2-BATCH-R5.1),
    // au lieu d'être toujours decideWithGroq en dur. Défaut "groq" : comportement historique
    // préservé si la variable n'est pas définie côté Cloudflare.
    return handleDecisionRequest(request, env, decideWithSelectedProvider);
  }
};
