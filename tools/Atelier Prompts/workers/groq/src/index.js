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
  timeoutMs: 8000
});

/**
 * Exécute fetch(url, requestInit) avec reprise automatique sur HTTP 429 : même appel, même corps,
 * après avoir attendu le délai indiqué par le provider (+ marge de sécurité) ou un repli fixe si
 * aucun délai n'est exploitable. Borné par maxRetries. Signature et comportement identiques à
 * l'ancienne fetchGroqWithRetry du harnais — seul le nom du module source change.
 */
export async function fetchGroqWithRetry(url, requestInit, overrides = {}) {
  const { maxRetries, safetyMarginMs, defaultBackoffMs, timeoutMs, sleepFn = sleep, signal } = { ...GROQ_PRODUCTION_RETRY_DEFAULTS, ...overrides };
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
  if (!env.GROQ_API_KEY) throw new Error("Secret GROQ_API_KEY absent.");
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
    console.error({ event: "groq_rate_limit_exhausted", retries: retryExhaustedError.retries, rate_limited_wait_ms: retryExhaustedError.rate_limited_wait_ms });
    throw new Error(`Groq HTTP 429 : limite de débit non résolue après ${retryExhaustedError.retries ?? 0} tentative(s) de reprise.`);
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
  const raw = await readBoundedText(response);
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
    throw new Error(`Groq a répondu ${response.status}.`);
  }
  const envelope = JSON.parse(raw);
  return envelope?.choices?.[0]?.message?.content;
}

export async function decideWithGroq(input, env) {
  const content = await callGroqChatCompletion({
    systemPrompt: DECISION_MODEL_PROMPT,
    userMessage: makeDecisionUserMessage(input),
    schema: DECISION_JSON_SCHEMA,
    schemaName: "decision_provider",
    env,
    maxCompletionTokens: 512
  });
  return parseDecisionCandidate(content, input.demande);
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
  if (!env.ANTHROPIC_API_KEY) throw new Error("Secret ANTHROPIC_API_KEY absent.");
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
  const response = await fetch(ANTHROPIC_ENDPOINT, requestInit);
  const raw = await readBoundedText(response);
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
    throw new Error(`Anthropic a répondu ${response.status}.`);
  }
  const envelope = JSON.parse(raw);
  const toolUseBlock = Array.isArray(envelope?.content) ? envelope.content.find((block) => block?.type === "tool_use" && block?.name === schemaName) : null;
  if (!toolUseBlock || typeof toolUseBlock.input !== "object" || toolUseBlock.input === null) {
    throw new Error("Anthropic n'a pas produit de tool_use exploitable pour la décision.");
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
export async function decideWithAnthropic(input, env) {
  const content = await callAnthropicMessages({
    systemPrompt: DECISION_MODEL_PROMPT,
    userMessage: makeDecisionUserMessage(input),
    schema: DECISION_JSON_SCHEMA,
    schemaName: "decision_provider",
    env,
    maxTokens: 512
  });
  const candidate = { ...content, raison_interne: expectedReason(content) };
  return validateDecision(candidate, input.demande);
}

/**
 * Sélection explicite du provider pour /decision UNIQUEMENT, via la variable NON secrète
 * DECISION_PROVIDER (jamais une valeur "auto", jamais un repli automatique Groq<->Anthropic sur
 * erreur/429 — interdiction explicite du lot R5.1). Défaut : "groq" (comportement historique
 * inchangé si la variable est absente). Toute valeur hors {"groq","anthropic"} est une erreur de
 * configuration explicite, remontée telle quelle à handleDecisionRequest (qui la transforme déjà,
 * sans changement ici, en réponse 502 provider_failure — même contrat public qu'aujourd'hui pour
 * toute panne de provider).
 */
export async function decideWithSelectedProvider(input, env) {
  const provider = env.DECISION_PROVIDER || "groq";
  if (provider === "groq") return decideWithGroq(input, env);
  if (provider === "anthropic") return decideWithAnthropic(input, env);
  throw new Error(`DECISION_PROVIDER invalide : "${provider}" (valeurs autorisées : "groq", "anthropic").`);
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
  return definition.parseOutput(content);
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

function roleFromPathname(pathname) {
  const role = pathname.replace(/^\//, "");
  return OPRIE_ROLES.includes(role) ? role : null;
}

// 3F.3.3-X2-BATCH-R1 : le rôle critic est routé vers le nouveau pipeline batché (chemin réel de
// production) ; analyst et arbiter restent routés vers le chemin générique mono-call inchangé.
function executeForRole(role) {
  return role === "critic"
    ? (input, roleEnv) => runCriticWithGroq(input, roleEnv)
    : (input, roleEnv) => runRoleWithGroq(role, input, roleEnv);
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
