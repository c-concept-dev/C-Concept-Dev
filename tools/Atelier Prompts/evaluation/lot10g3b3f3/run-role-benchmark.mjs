// Harnais de benchmark rôle × provider (LOT 10G.3B.3F.3.3).
//
// Exécute les rôles Analyste / Critique / Arbitre de l'OPRIE (workers/shared/operational-request-core.js)
// sur Workers AI et sur Groq, avec exactement les mêmes prompts et schémas que 3F.3.2, et note
// chaque sortie selon les 16 critères du sous-lot (evaluation/lot10g3b3f3/score-role-outputs.mjs).
//
// N'appelle AUCUN worker déployé : les deux providers sont interrogés directement par leur API
// REST publique (Workers AI via l'API Cloudflare, Groq via son API compatible OpenAI), sans
// déploiement d'aucune sorte.
//
// Variables d'environnement requises :
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN  — pour Workers AI (portée "Workers AI Read/Edit")
//   GROQ_API_KEY                                  — pour Groq
// Un provider dont les identifiants sont absents est marqué "not_executed" dans le rapport, jamais
// simulé ni compté comme un échec de qualité : panne/absence d'accès n'est jamais une note.
//
// Parité avec le runtime (3F.3.4) : les prompts, schémas, constructeurs de message et parseurs sont
// importés directement depuis workers/shared/operational-request-core.js (même ROLE_DEFINITIONS
// que workers/workers-ai/src/index.js et workers/groq/src/index.js — aucune redéfinition locale).
// Les modèles par défaut sont importés des deux workers (PRIMARY_MODEL, MODEL), jamais retapés en
// dur, pour qu'un futur changement de modèle runtime ne puisse pas faire dériver silencieusement le
// benchmark. Les paramètres d'inférence Groq (reasoning_format, reasoning_effort, temperature,
// stream) et le nom de schéma (oprie_<rôle>) répliquent exactement callGroqChatCompletion.
// Différence structurelle assumée et non corrigible depuis Node : Workers AI est interrogé ici par
// l'API REST Cloudflare (`/accounts/{id}/ai/run/{model}`), alors que le runtime utilise le binding
// `env.AI.run()` disponible uniquement à l'intérieur d'un Worker. Cloudflare documente les deux
// comme équivalents pour un modèle donné, mais ce n'est pas vérifié ici — à garder en tête en
// lisant les résultats.
//
// Gestion des HTTP 429 Groq (durcissement post-3F.3.3-B) : un TPM de 8000 avec des appels
// consommant couramment 3500-3900 tokens ne laisse guère plus d'un appel toutes les 25-30s avant
// que Groq ne réponde 429 avec un délai de reprise indiqué. Ce n'est ni un défaut OPRIE, ni un
// défaut de schéma : c'est une limite de débit du provider, gérée ici exclusivement dans le
// harnais — le runtime de production (workers/groq/src/index.js) n'est pas modifié.
//   - Le même appel est retenté après avoir attendu le délai indiqué par Groq (en-tête
//     Retry-After, sinon une extraction prudente depuis le corps de l'erreur si un nombre de
//     secondes y apparaît sans ambiguïté, sinon un repli fixe), plus une marge de sécurité.
//   - Un nombre maximal de tentatives borne l'attente totale (jamais de boucle infinie).
//   - Un 429 qui finit par réussir n'est jamais compté comme un échec, sémantique ou technique :
//     la ligne de résultat est strictement identique à un succès direct. Seuls des champs
//     d'observabilité (retries, rate_limited_wait_ms) témoignent qu'une reprise a eu lieu.
//   - Un 429 dont les tentatives sont épuisées reste une erreur technique (provider_error),
//     jamais requalifiée en échec sémantique (jamais un schéma invalide, jamais un pseudo-verdict).
//   - --pacing-ms ajoute une attente fixe, optionnelle, avant chaque appel (tous providers), pour
//     réduire la probabilité de déclencher la limite plutôt que de systématiquement la subir.
//
// Fiabilité du harnais (3F.3.3-H1) — strictement technique, aucun changement de sémantique
// Analyste/Critique/Arbitre, de scoring B-01/B-02, de prompt ou de schéma métier :
//   - --timeout-ms borne chaque appel réseau individuel (AbortSignal.timeout), pour qu'un appel ne
//     puisse plus jamais bloquer indéfiniment le processus (constat du smoke Groq post-3F.3.3-C8 :
//     ~1h09 d'attente sans trafic réseau observable, aucun résultat partiel écrit).
//   - Chaque résultat individuel complété est aussitôt persisté dans un point de reprise
//     (<output>.partial.json, écriture atomique via fichier temporaire puis renommage).
//   - --resume recharge ce point de reprise et n'exécute que les appels manquants, après avoir
//     vérifié sa compatibilité stricte avec les paramètres de l'exécution en cours.
//   - --cases et --roles restreignent l'exécution à un sous-ensemble explicite de cas/rôles ; ce
//     sont des filtres du harnais uniquement, ils n'influencent jamais le scoring ni la production.
//   - Un SIGINT (Ctrl+C) affiche l'état déjà sauvegardé puis interrompt réellement le processus
//     (jamais masqué).
//
// Fiabilité du harnais (3F.3.3-H2) — H1 ne bornait que chaque tentative HTTP individuelle ; un
// retry 429 recréait un budget --timeout-ms plein à chaque tentative, et le sleep de backoff entre
// deux tentatives n'était borné par rien du tout (constat du smoke Groq post-3F.3.3-S1 : process actif
// >3 min avec --timeout-ms=60000, 0% CPU, aucune socket TCP — endormi dans un sleep de backoff, pas
// dans un fetch). --timeout-ms borne désormais l'exécution LOGIQUE complète d'un rôle (tentative
// initiale + retries + sleeps de backoff + parsing), via runRole : un AbortController partagé (jamais
// recréé par tentative) coupe le fetch ET le sleep, et un Promise.race indépendant garantit qu'aucun
// rôle — même un provider hostile ignorant totalement le signal — ne peut garder le processus vivant
// au-delà de ce budget. Le pacing (--pacing-ms) s'exécute avant que ce budget ne commence à courir,
// jamais compté dedans. Un résultat timeout/erreur réseau est un échec technique, pas sémantique : il
// est explicitement rejouable par un --resume ultérieur (contrairement à un succès ou un JSON invalide).
//
// Usage :
//   node evaluation/lot10g3b3f3/run-role-benchmark.mjs [--repetitions=3] [--provider=all|workers-ai|groq] [--output=chemin.json]
//     [--pacing-ms=0] [--groq-max-retries=5] [--groq-retry-margin-ms=750] [--groq-default-backoff-ms=30000]
//     [--timeout-ms=60000] [--cases=case-a,case-b] [--roles=analyst,critic,arbiter] [--resume]
//     [--critic-max-completion-tokens=2048]
//
// 3F.3.3-X2-B-RS : --critic-max-completion-tokens permet de faire varier, dans ce HARNESS de mesure
// uniquement, la valeur max_completion_tokens envoyée à Groq pour le rôle critic (droit de sortie du
// modèle), afin de mesurer l'effet réel d'un budget plus serré une fois la dérivation D en place.
// Défaut 2048 : identique bit-à-bit à la valeur de production (workers/groq/src/index.js,
// runRoleWithGroq) quand l'option est omise, pour tout usage existant. N'affecte jamais analyst ni
// arbiter (toujours 2048, valeur de production inchangée), jamais le runtime Cloudflare Worker
// lui-même, jamais le prompt, le schéma, la dérivation D ni le modèle.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ANALYST_SYSTEM_PROMPT, ANALYST_JSON_SCHEMA, makeAnalystUserMessage, parseAnalystOutput,
  CRITIC_SYSTEM_PROMPT, makeCriticUserMessage, parseCriticOutput,
  buildCriticJsonSchema, buildQuestionReviewTargets,
  ARBITER_SYSTEM_PROMPT, ARBITER_JSON_SCHEMA, makeArbiterUserMessage, parseArbiterOutput
} from "../../workers/shared/operational-request-core.js";
import { scoreAnalystOutput, scoreCriticOutput, scoreArbiterOutput, assessStability } from "./score-role-outputs.mjs";
import { PRIMARY_MODEL as RUNTIME_WORKERS_AI_MODEL } from "../../workers/workers-ai/src/index.js";
import {
  MODEL as RUNTIME_GROQ_MODEL,
  parseRetryAfterMs, parseRetryDelayFromBody, sleep,
  fetchGroqWithRetry as fetchGroqWithRetryShared
} from "../../workers/groq/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));

export const SUPPORTED_PROVIDER_FILTERS = Object.freeze(["all", "workers-ai", "groq"]);

export function resolveProviders(filterValue) {
  const value = filterValue === undefined ? "all" : filterValue;
  if (!SUPPORTED_PROVIDER_FILTERS.includes(value)) {
    throw new Error(`--provider invalide : "${value}". Valeurs acceptées : ${SUPPORTED_PROVIDER_FILTERS.join(", ")}.`);
  }
  return value === "all" ? ["workers-ai", "groq"] : [value];
}

const repetitions = Math.max(1, Math.min(5, Number(args.repetitions || 3)));
const corpusPath = path.resolve(root, args.corpus || "evaluation/lot10g3b3f3/corpus.json");
const outputPath = path.resolve(root, args.output || `evaluation/lot10g3b3f3/results/benchmark-${Date.now()}.json`);
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

let PROVIDERS;
try {
  PROVIDERS = resolveProviders(args.provider);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
const ROLES = ["analyst", "critic", "arbiter"];

// --- 3F.3.3-H1, Phase 7/8 : filtres --cases / --roles (harnais uniquement, jamais le scoring) ------

export const SUPPORTED_ROLE_FILTERS = Object.freeze(["analyst", "critic", "arbiter"]);

export function resolveRoles(filterValue) {
  if (filterValue === undefined) return new Set(SUPPORTED_ROLE_FILTERS);
  const values = filterValue.split(",").map((v) => v.trim()).filter(Boolean);
  if (!values.length) throw new Error("--roles ne peut pas être vide.");
  for (const value of values) {
    if (!SUPPORTED_ROLE_FILTERS.includes(value)) {
      throw new Error(`--roles invalide : "${value}". Valeurs acceptées : ${SUPPORTED_ROLE_FILTERS.join(", ")}.`);
    }
  }
  return new Set(values);
}

export function resolveCases(cases, filterValue) {
  if (filterValue === undefined) return cases;
  const ids = filterValue.split(",").map((v) => v.trim()).filter(Boolean);
  if (!ids.length) throw new Error("--cases ne peut pas être vide.");
  const byId = new Map(cases.map((c) => [c.id, c]));
  const selected = [];
  for (const id of ids) {
    const found = byId.get(id);
    if (!found) {
      throw new Error(`--cases invalide : identifiant de cas inconnu "${id}". Identifiants disponibles : ${cases.map((c) => c.id).join(", ")}.`);
    }
    selected.push(found);
  }
  return selected;
}

// --- 3F.3.3-H1, Phase 2 : timeout réseau par appel (jamais une attente indéfinie) -------------------

export const DEFAULT_TIMEOUT_MS = 60000;

export function resolveTimeoutMs(rawValue) {
  if (rawValue === undefined) return DEFAULT_TIMEOUT_MS;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 1000) {
    throw new Error(`--timeout-ms invalide : "${rawValue}". Attendu un nombre entier >= 1000 (millisecondes).`);
  }
  return Math.round(value);
}

// 3F.3.3-X2-B-RS : budget de sortie Critic, configurable dans ce HARNESS seul (jamais le runtime de
// production). Défaut strictement égal à la valeur de production actuelle (2048), pour que tout appel
// existant qui ne passe pas --critic-max-completion-tokens reste bit-à-bit identique à avant.
export const DEFAULT_CRITIC_MAX_COMPLETION_TOKENS = 2048;

export function resolveCriticMaxCompletionTokens(rawValue) {
  if (rawValue === undefined) return DEFAULT_CRITIC_MAX_COMPLETION_TOKENS;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--critic-max-completion-tokens invalide : "${rawValue}". Attendu un entier >= 1.`);
  }
  return value;
}

let ROLES_FILTER;
try {
  ROLES_FILTER = resolveRoles(args.roles);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

let SELECTED_CASES;
try {
  SELECTED_CASES = resolveCases(corpus.cases, args.cases);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

export const TIMEOUT_MS = (() => {
  try {
    return resolveTimeoutMs(args["timeout-ms"]);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
})();

export const CRITIC_MAX_COMPLETION_TOKENS = (() => {
  try {
    return resolveCriticMaxCompletionTokens(args["critic-max-completion-tokens"]);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
})();

const RESUME = args.resume !== undefined;
export const CHECKPOINT_PATH = `${outputPath}.partial.json`;

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
export const WORKERS_AI_MODEL = args["workers-ai-model"] || RUNTIME_WORKERS_AI_MODEL;
export const GROQ_MODEL = args["groq-model"] || RUNTIME_GROQ_MODEL;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const PACING_MS = Math.max(0, Number(args["pacing-ms"] || 0));
export const GROQ_RETRY_DEFAULTS = Object.freeze({
  maxRetries: Math.max(0, Number(args["groq-max-retries"] ?? 5)),
  safetyMarginMs: Math.max(0, Number(args["groq-retry-margin-ms"] ?? 750)),
  defaultBackoffMs: Math.max(0, Number(args["groq-default-backoff-ms"] ?? 30000)),
  timeoutMs: TIMEOUT_MS
});

function providerAvailable(provider) {
  return provider === "workers-ai" ? Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) : Boolean(GROQ_API_KEY);
}

// 3F.3.3-X2-BATCH-R2 : sleep, parseRetryAfterMs, parseRetryDelayFromBody et fetchGroqWithRetry ont
// été RELOCALISÉS dans workers/groq/src/index.js (le runtime de production en avait besoin lui aussi
// — avant R2, seul ce harnais honorait Retry-After, jamais le pipeline Critic réel). Importés ci-
// dessus et réexportés ici tels quels (mêmes noms, même comportement) pour ne rien casser des usages/
// tests existants de ce fichier — une seule source de vérité, jamais une deuxième copie maintenue en
// parallèle.
export { parseRetryAfterMs, parseRetryDelayFromBody };

/**
 * fetchGroqWithRetry du harnais : même contrat externe qu'avant R2 (signature, retries/
 * rate_limited_wait_ms), mais délègue désormais l'implémentation réelle à la version partagée
 * (workers/groq/src/index.js), à laquelle GROQ_RETRY_DEFAULTS (configurable par CLI, propre à ce
 * harnais) est passé en overrides complets — la version de production sert de repli uniquement
 * quand cette fonction est absente de tout appelant, jamais utilisée ici.
 */
export async function fetchGroqWithRetry(url, requestInit, overrides = {}) {
  return fetchGroqWithRetryShared(url, requestInit, { ...GROQ_RETRY_DEFAULTS, ...overrides });
}

// 3F.3.3-H2 : signal optionnel, partagé depuis runRole (budget total du rôle) ; sans signal (appel
// direct), repli sur l'ancien comportement H1 (AbortSignal.timeout(TIMEOUT_MS) local à cet appel).
export async function callWorkersAI(systemPrompt, userMessage, schema, signal) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${WORKERS_AI_MODEL}`;
  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      response_format: { type: "json_schema", json_schema: schema },
      max_tokens: 2048,
      temperature: 0
    }),
    signal: signal ?? AbortSignal.timeout(TIMEOUT_MS)
  });
  const elapsed = Math.round(performance.now() - started);
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw Object.assign(new Error(`Workers AI HTTP ${response.status}: ${JSON.stringify(payload.errors || payload)}`), {
      elapsed,
      error_kind: response.status === 400 ? "http_400" : "http_other"
    });
  }
  const content = payload.result?.response ?? payload.result;
  return { content, elapsed, usage: payload.result?.usage || null };
}

/**
 * retryOverrides est un 5e paramètre optionnel, jamais utilisé par le runtime de production ni par
 * callProvider (qui appelle callGroq avec les 4 premiers arguments seulement, donc les réglages
 * CLI/GROQ_RETRY_DEFAULTS habituels). Il existe uniquement pour permettre aux tests d'injecter un
 * sleepFn instantané et des délais courts, sans jamais attendre réellement plusieurs dizaines de
 * secondes ni modifier le comportement réel du harnais en usage normal.
 */
export async function callGroq(role, systemPrompt, userMessage, schema, retryOverrides = {}) {
  const started = performance.now();
  let response;
  let retries = 0;
  let rate_limited_wait_ms = 0;
  try {
    ({ response, retries, rate_limited_wait_ms } = await fetchGroqWithRetry(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
        // Mêmes clés, mêmes valeurs, même nom de schéma que callGroqChatCompletion (workers/groq/src/index.js).
        response_format: { type: "json_schema", json_schema: { name: `oprie_${role}`, strict: true, schema } },
        reasoning_format: "hidden",
        reasoning_effort: "low",
        temperature: 0,
        // 3F.3.3-X2-B-RS : seul le rôle critic peut recevoir un budget non-défaut (--critic-max-completion-tokens) ;
        // analyst et arbiter restent à 2048, valeur de production, inchangée.
        max_completion_tokens: role === "critic" ? CRITIC_MAX_COMPLETION_TOKENS : 2048,
        stream: false
      })
    }, retryOverrides));
  } catch (retryExhaustedError) {
    // 429 épuisé après maxRetries, ou timeout d'une tentative : erreur technique, jamais
    // requalifiée en échec sémantique.
    throw Object.assign(retryExhaustedError, {
      elapsed: Math.round(performance.now() - started),
      error_kind: retryExhaustedError.error_kind ?? classifyNetworkError(retryExhaustedError)
    });
  }
  // Le temps passé à attendre le débit n'est pas une latence du modèle : il est exclu de "elapsed"
  // pour que latency_median_ms/p90 restent comparables entre exécutions, avec ou sans reprise.
  const elapsed = Math.max(0, Math.round(performance.now() - started) - rate_limited_wait_ms);
  const payload = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(`Groq HTTP ${response.status}: ${JSON.stringify(payload.error || payload)}`), {
      elapsed,
      error_kind: response.status === 400 ? "http_400" : "http_other"
    });
  }
  return { content: payload.choices?.[0]?.message?.content, elapsed, usage: payload.usage || null, retries, rate_limited_wait_ms };
}

// 3F.3.3-H2, Phase 4 : le pacing (--pacing-ms) n'est plus ici — il est exécuté par runRole AVANT que
// le budget --timeout-ms ne commence à courir (jamais compté dans le délai du rôle suivant).
async function callProvider(role, provider, systemPrompt, userMessage, schema, signal) {
  return provider === "workers-ai" ? callWorkersAI(systemPrompt, userMessage, schema, signal) : callGroq(role, systemPrompt, userMessage, schema, { signal });
}

// 3F.3.3-H1, Phase 11 : classification purement structurelle (jamais de correspondance textuelle
// approximative) d'une erreur réseau non déjà étiquetée à sa source — un abandon déclenché par
// AbortSignal.timeout porte toujours le nom "TimeoutError" (spécification WHATWG), distinct de tout
// autre échec réseau (DNS, connexion refusée, etc.), qui reste "network_error".
function classifyNetworkError(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "timeout";
  return "network_error";
}

/**
 * 3F.3.3-H2 : timeout-ms borne désormais l'exécution LOGIQUE complète d'un rôle (tentative initiale,
 * retries 429, sleeps de backoff, parsing, validation) — pas seulement chaque tentative HTTP
 * individuelle. Le pacing (--pacing-ms), lui, s'exécute AVANT que ce budget ne commence à courir
 * (Phase 4 : il n'est jamais compté dans le délai du rôle).
 *
 * Mécanisme : un AbortController est créé une seule fois pour tout l'appel (jamais recréé à chaque
 * retry, contrairement à l'ancien AbortSignal.timeout par tentative) et partagé jusqu'au fetch et au
 * sleep de backoff, qui l'un et l'autre s'interrompent proprement quand il s'abandonne. Un
 * Promise.race indépendant sert de filet de sécurité ultime : même un provider hostile qui ignorerait
 * totalement le signal (Promise qui ne se résout ni ne réagit jamais) ne peut plus garder runRole en
 * attente au-delà de roleTimeoutMs, puisque la course ne dépend d'aucune coopération de sa part.
 */
export async function runRole(role, provider, systemPrompt, userMessage, schema, parseFn, roleTimeoutMs = TIMEOUT_MS) {
  if (PACING_MS > 0) await sleep(PACING_MS);

  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), roleTimeoutMs);

  const timeoutPromise = new Promise((resolve) => {
    controller.signal.addEventListener("abort", () => resolve({
      valid_json: false,
      provider_error: `Délai global du rôle dépassé (timeout-ms=${roleTimeoutMs}).`,
      error_kind: "timeout",
      elapsed_ms: Math.round(performance.now() - started),
      rate_limited_exhausted: false,
      retries: 0,
      rate_limited_wait_ms: 0
    }), { once: true });
  });

  const rolePromise = (async () => {
    try {
      const { content, elapsed, usage, retries = 0, rate_limited_wait_ms = 0 } = await callProvider(role, provider, systemPrompt, userMessage, schema, controller.signal);
      // Un 429 réessayé avec succès produit exactement la même forme de résultat qu'un succès direct
      // (valid_json déterminé uniquement par la conformité du JSON, jamais par le fait qu'une reprise
      // ait eu lieu) ; retries/rate_limited_wait_ms ne sont que des champs d'observabilité additifs.
      try {
        return { valid_json: true, output: parseFn(content), elapsed_ms: elapsed, usage, retries, rate_limited_wait_ms, error_kind: null };
      } catch (parseError) {
        return { valid_json: false, error: parseError.message, error_kind: "json_error", elapsed_ms: elapsed, usage, retries, rate_limited_wait_ms };
      }
    } catch (callError) {
      return {
        valid_json: false,
        provider_error: callError.message,
        error_kind: callError.error_kind ?? classifyNetworkError(callError),
        elapsed_ms: callError.elapsed ?? Math.round(performance.now() - started),
        rate_limited_exhausted: callError.exhausted === true,
        retries: callError.retries ?? 0,
        rate_limited_wait_ms: callError.rate_limited_wait_ms ?? 0
      };
    }
  })();

  try {
    return await Promise.race([timeoutPromise, rolePromise]);
  } finally {
    clearTimeout(timer);
  }
}

// 3F.3.3-H1, Phase 3 : ligne de progression stable avant chaque appel réellement exécuté (un appel
// déjà présent dans un point de reprise rechargé n'est pas rejoué, donc n'imprime rien ici), puis
// son issue observable une fois l'appel terminé.
export function classifyOutcome(roleRun) {
  if (roleRun.valid_json) return "OK";
  if (roleRun.error_kind === "timeout") return "TIMEOUT";
  if (roleRun.error_kind === "http_429") return "RATE_LIMIT";
  return "ERROR";
}

function printProgressStart(progress, caseId, role, run) {
  progress.done += 1;
  process.stdout.write(`[${progress.done}/${progress.total}] ${caseId} / ${role} / run ${run}\n`);
}

function printProgressEnd(outcome) {
  process.stdout.write(`  -> ${outcome}\n`);
}

// --- 3F.3.3-H1, Phase 4/6 : clé de résultat, index des appels déjà complétés, point de reprise -----

export function buildResultKey(caseId, role, provider, run) {
  return `${caseId}::${role}::${provider}::${run}`;
}

export function buildCompletedIndex(rows) {
  const map = new Map();
  for (const row of rows) map.set(buildResultKey(row.case_id, row.role, row.provider, row.run), row);
  return map;
}

export function writeCheckpointSync(checkpointPath, data) {
  const tmpPath = `${checkpointPath}.tmp`;
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmpPath, checkpointPath);
}

export function readCheckpointIfExists(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) return null;
  return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
}

export function buildRunSignature({ provider, repetitions: reps, casesFilter, rolesFilter, timeoutMs, corpusCases }) {
  return {
    provider,
    repetitions: reps,
    cases_filter: casesFilter,
    roles_filter: rolesFilter,
    timeout_ms: timeoutMs,
    corpus_cases: corpusCases
  };
}

/**
 * Un point de reprise n'est jamais réutilisé pour une exécution aux paramètres structurants
 * différents (provider, repetitions, cases, roles, timeout, taille du corpus) : le mélanger avec
 * l'exécution en cours produirait un rapport scientifiquement incohérent. Tout écart est refusé
 * explicitement plutôt que silencieusement ignoré ou fusionné.
 */
export function assertCheckpointCompatible(checkpoint, expectedSignature) {
  const stored = checkpoint.run_signature || {};
  const mismatches = Object.keys(expectedSignature).filter(
    (key) => JSON.stringify(stored[key]) !== JSON.stringify(expectedSignature[key])
  );
  if (mismatches.length) {
    throw new Error(
      `--resume refusé : le point de reprise (${JSON.stringify(stored)}) est incompatible avec les paramètres actuels ` +
      `(${JSON.stringify(expectedSignature)}). Champs différents : ${mismatches.join(", ")}.`
    );
  }
}

/**
 * 3F.3.3-H2, Phase 6 : politique de reprise pour un résultat technique (préférence B du lot). Un
 * succès (valid_json=true) ou un échec sémantique (json_error — le JSON était syntaxiquement/
 * structurellement invalide, rejouer ne changerait rien à un défaut de contenu) restent des résultats
 * terminés, jamais rejoués. Un timeout ou une erreur réseau, en revanche, ne prouvent rien sur le
 * contenu que le rôle aurait produit : ce sont des échecs de l'INFRASTRUCTURE de l'appel, pas du
 * jugement du rôle, donc explicitement rejouables par --resume plutôt que gelés comme définitifs.
 */
export const RETRYABLE_ERROR_KINDS = Object.freeze(["timeout", "network_error"]);

export function isRetryableRow(row) {
  return row.valid_json === false && RETRYABLE_ERROR_KINDS.includes(row.error_kind);
}

/**
 * Sépare un point de reprise chargé en (kept: à conserver tel quel, jamais rejoué) et
 * (retryable: résultats techniques à rejouer). `kept` seul doit alimenter results/completedIndex au
 * démarrage d'une reprise : un résultat retryable en est délibérément absent pour que le code de
 * benchmark existant (déjà écrit pour "rejouer tout ce qui n'est pas dans completedIndex") le
 * ré-exécute sans aucun changement de sa propre logique.
 */
export function splitResumableCompleted(rows) {
  const kept = rows.filter((row) => !isRetryableRow(row));
  const retryable = rows.filter((row) => isRetryableRow(row));
  return { kept, retryable };
}

export function describeSigintStatus(results, checkpointPath) {
  return `\nInterrompu (SIGINT). ${results.length} résultat(s) déjà complété(s) et sauvegardé(s) dans ${checkpointPath}.\n` +
    "Relancer avec --resume (mêmes paramètres) pour reprendre à partir de ce point.\n";
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function estimateCostUsd(provider, usage) {
  if (!usage) return null;
  // Tarifs indicatifs, à ajuster lors de la lecture du rapport : documentés, jamais un critère de rejet (CDC §31).
  const rates = provider === "groq"
    ? { input: 0.0000002, output: 0.0000008 } // openai/gpt-oss-20b, ordre de grandeur par token
    : { input: 0.0000003, output: 0.0000005 }; // llama-3.3-70b Workers AI, ordre de grandeur par token
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  return Number((inputTokens * rates.input + outputTokens * rates.output).toFixed(6));
}

function toResultRow(caseId, role, provider, run, roleRun, score) {
  return {
    case_id: caseId,
    role,
    provider,
    run,
    valid_json: roleRun.valid_json,
    elapsed_ms: roleRun.elapsed_ms,
    error: roleRun.error || roleRun.provider_error || null,
    error_kind: roleRun.error_kind ?? null,
    rate_limited_exhausted: roleRun.rate_limited_exhausted === true,
    retries: roleRun.retries || 0,
    rate_limited_wait_ms: roleRun.rate_limited_wait_ms || 0,
    score,
    cost_usd: estimateCostUsd(provider, roleRun.usage),
    __output: roleRun.valid_json ? roleRun.output : null
  };
}

const ALL_ROLES_SET = new Set(SUPPORTED_ROLE_FILTERS);

export async function benchmarkAnalystAndCritic(testCase, provider, results, ctx = {}) {
  const { completedIndex = new Map(), rolesEnabled = ALL_ROLES_SET, progress = null, onResult = async () => {}, roleTimeoutMs = TIMEOUT_MS } = ctx;
  const includeCritic = rolesEnabled.has("critic");
  // 3F.3.3-H1, Phase 9 : pour role_under_test="analyst_and_critic", le Critique note toujours la
  // sortie de l'Analyste produite dans le MÊME appel (makeCriticUserMessage exige analyst_output) ;
  // aucune sortie d'Analyste figée n'existe pour ce chemin. Sélectionner "critic" seul inclut donc
  // automatiquement l'appel Analyste réel nécessaire — décision documentée, jamais une simulation,
  // jamais un repli sur un fixture inexistant.
  const includeAnalyst = rolesEnabled.has("analyst") || includeCritic;
  if (!includeAnalyst) return [];

  const outputs = [];
  for (let run = 1; run <= repetitions; run += 1) {
    const analystKey = buildResultKey(testCase.id, "analyst", provider, run);
    const cachedAnalystRow = completedIndex.get(analystKey);
    let analystRun;
    if (cachedAnalystRow) {
      analystRun = { valid_json: cachedAnalystRow.valid_json, output: cachedAnalystRow.__output };
    } else {
      const analystMessage = makeAnalystUserMessage(testCase.input);
      if (progress) printProgressStart(progress, testCase.id, "analyst", run);
      analystRun = await runRole("analyst", provider, ANALYST_SYSTEM_PROMPT, analystMessage, ANALYST_JSON_SCHEMA, parseAnalystOutput, roleTimeoutMs);
      if (progress) printProgressEnd(classifyOutcome(analystRun));
      const analystScore = analystRun.valid_json ? scoreAnalystOutput(analystRun.output, testCase.oracle.analyst || {}) : null;
      const analystRow = toResultRow(testCase.id, "analyst", provider, run, analystRun, analystScore);
      results.push(analystRow);
      await onResult(analystRow);
    }
    if (analystRun.valid_json) outputs.push(analystRun.output);

    if (!includeCritic || !analystRun.valid_json) continue;
    const criticKey = buildResultKey(testCase.id, "critic", provider, run);
    if (completedIndex.has(criticKey)) continue;
    const criticMessage = makeCriticUserMessage({ ...testCase.input, analyst_output: analystRun.output, previous_vetoes: [] });
    // 3F.3.3-X2-A : le schéma Critic dépend désormais du nombre réel de question_review_targets de
    // CET appel (mécanisme C) — reconstruit à chaque appel depuis le seul vrai analyst_output
    // disponible ici, jamais une valeur statique importée.
    const criticSchema = buildCriticJsonSchema(buildQuestionReviewTargets(analystRun.output));
    if (progress) printProgressStart(progress, testCase.id, "critic", run);
    const criticRun = await runRole("critic", provider, CRITIC_SYSTEM_PROMPT, criticMessage, criticSchema, parseCriticOutput, roleTimeoutMs);
    if (progress) printProgressEnd(classifyOutcome(criticRun));
    // 3F.3.3-C8, B-01B : analyst_output.issues fournit le seul contexte nécessaire pour vérifier
    // structurellement issue_id -> analyst_output.issues[].id dans illegitimate_question_found.
    const criticScore = criticRun.valid_json ? scoreCriticOutput(criticRun.output, testCase.oracle.critic || {}, { analyst_output: analystRun.output }) : null;
    const criticRow = toResultRow(testCase.id, "critic", provider, run, criticRun, criticScore);
    results.push(criticRow);
    await onResult(criticRow);
  }
  return outputs;
}

// 3F.3.3-C, A1 : original_request doit toujours provenir du cas de corpus réel (testCase.input),
// jamais d'une chaîne vide — un appel Critique/Arbitre isolé sans la demande originale ne respecte
// pas le contrat runtime (makeCriticUserMessage/makeArbiterUserMessage attendent original_request
// pour la comparaison sémantique) et invaliderait silencieusement tout jugement de dérive.
export async function benchmarkCriticIsolation(testCase, provider, results, ctx = {}) {
  if (!testCase.input || !testCase.input.original_request) {
    throw new Error(`Cas ${testCase.id} : role_under_test="critic_isolation" exige input.original_request (contrat runtime), aucune chaîne vide ne peut être substituée.`);
  }
  const { completedIndex = new Map(), rolesEnabled = ALL_ROLES_SET, progress = null, onResult = async () => {}, roleTimeoutMs = TIMEOUT_MS } = ctx;
  const includeArbiter = rolesEnabled.has("arbiter");
  // 3F.3.3-H1, Phase 9 : pour role_under_test="critic_isolation", l'Arbitre note toujours la sortie
  // du Critique produite dans le MÊME appel (makeArbiterUserMessage exige critic_output) ; aucun
  // fixture de sortie Critique n'existe dans le corpus. Sélectionner "arbiter" seul inclut donc
  // automatiquement l'appel Critique réel nécessaire — décision documentée, jamais une simulation.
  const includeCritic = rolesEnabled.has("critic") || includeArbiter;
  if (!includeCritic) return [];

  const { original_request, clarification_history = [] } = testCase.input;
  const criticRuns = [];
  for (let run = 1; run <= repetitions; run += 1) {
    const criticKey = buildResultKey(testCase.id, "critic", provider, run);
    const cachedCriticRow = completedIndex.get(criticKey);
    let criticRun;
    if (cachedCriticRow) {
      criticRun = { valid_json: cachedCriticRow.valid_json, output: cachedCriticRow.__output };
    } else {
      const criticMessage = makeCriticUserMessage({ original_request, clarification_history, analyst_output: testCase.fixture_analyst_output, previous_vetoes: [] });
      // 3F.3.3-X2-A : schéma reconstruit depuis la fixture_analyst_output réelle du cas (mécanisme C),
      // jamais une valeur statique.
      const criticSchema = buildCriticJsonSchema(buildQuestionReviewTargets(testCase.fixture_analyst_output));
      if (progress) printProgressStart(progress, testCase.id, "critic", run);
      criticRun = await runRole("critic", provider, CRITIC_SYSTEM_PROMPT, criticMessage, criticSchema, parseCriticOutput, roleTimeoutMs);
      if (progress) printProgressEnd(classifyOutcome(criticRun));
      const criticScore = criticRun.valid_json ? scoreCriticOutput(criticRun.output, testCase.oracle.critic || {}, { analyst_output: testCase.fixture_analyst_output }) : null;
      const criticRow = toResultRow(testCase.id, "critic", provider, run, criticRun, criticScore);
      results.push(criticRow);
      await onResult(criticRow);
    }
    criticRuns.push(criticRun);

    if (testCase.oracle.arbiter && criticRun.valid_json && includeArbiter) {
      const arbiterKey = buildResultKey(testCase.id, "arbiter", provider, run);
      if (!completedIndex.has(arbiterKey)) {
        const arbiterMessage = makeArbiterUserMessage({ original_request, clarification_history, analyst_output: testCase.fixture_analyst_output, critic_output: criticRun.output });
        if (progress) printProgressStart(progress, testCase.id, "arbiter", run);
        const arbiterRun = await runRole("arbiter", provider, ARBITER_SYSTEM_PROMPT, arbiterMessage, ARBITER_JSON_SCHEMA, parseArbiterOutput, roleTimeoutMs);
        if (progress) printProgressEnd(classifyOutcome(arbiterRun));
        // 3F.3.3-C1, B-02 : le gate déterministe est réellement branché ici, avec la provenance de
        // l'Analyste fixture comme seule source de vérité disponible pour ce chemin (Critic/Arbiter
        // n'émettent pas leur propre provenance_records dans ce contrat).
        const arbiterScore = arbiterRun.valid_json
          ? scoreArbiterOutput(arbiterRun.output, testCase.oracle.arbiter, { provenance_records: testCase.fixture_analyst_output.provenance_records })
          : null;
        const arbiterRow = toResultRow(testCase.id, "arbiter", provider, run, arbiterRun, arbiterScore);
        results.push(arbiterRow);
        await onResult(arbiterRow);
      }
    }
  }
  return criticRuns.filter((r) => r.valid_json).map((r) => r.output);
}

export function aggregate(role, provider, rows) {
  const roleRows = rows.filter((row) => row.role === role && row.provider === provider);
  if (!roleRows.length) return null;
  const validRows = roleRows.filter((row) => row.valid_json);
  const scored = validRows.filter((row) => row.score);
  const passed = scored.filter((row) => row.score.pass);
  const latencies = roleRows.map((row) => row.elapsed_ms).filter(Number.isFinite);
  const costs = roleRows.map((row) => row.cost_usd).filter((v) => Number.isFinite(v));
  const byCase = new Map();
  for (const row of validRows) {
    if (!byCase.has(row.case_id)) byCase.set(row.case_id, []);
    byCase.get(row.case_id).push(row);
  }
  const stabilityPerCase = [...byCase.entries()].map(([caseId, caseRows]) => ({
    case_id: caseId,
    ...assessStability(role, caseRows.map((row) => row.__output).filter(Boolean))
  }));
  const failedCriteria = {};
  for (const row of scored) {
    for (const criterion of row.score.criteria) {
      if (!criterion.pass) failedCriteria[criterion.criterion] = (failedCriteria[criterion.criterion] || 0) + 1;
    }
  }
  return {
    role,
    provider,
    cases: roleRows.length,
    valid_json_pct: Number((100 * validRows.length / roleRows.length).toFixed(1)),
    pass_pct: scored.length ? Number((100 * passed.length / scored.length).toFixed(1)) : null,
    failed_criteria_counts: failedCriteria,
    latency_median_ms: percentile(latencies, 0.5),
    latency_p90_ms: percentile(latencies, 0.9),
    cost_usd_total_estimate: costs.length ? Number(costs.reduce((sum, v) => sum + v, 0).toFixed(6)) : null,
    stability_by_case: stabilityPerCase
  };
}

// 3F.3.3-H1, Phase 5 : format final inchangé — mêmes clés, même ordre logique qu'avant H1, pour ne
// jamais casser un consommateur existant du rapport.
export function buildFinalReport({ repetitions: reps, corpusCasesCount, notExecuted, summary, results }) {
  return {
    version: "1.0",
    lot: "10G.3B.3F.3.3",
    generated_at: new Date().toISOString(),
    repetitions: reps,
    corpus_cases: corpusCasesCount,
    providers_not_executed: notExecuted,
    summary,
    raw_results: results
  };
}

// 3F.3.3-H1, Phase 3 : total indicatif de progression — une borne supérieure optimiste (elle suppose
// qu'un appel Analyste/Critique réussit toujours assez pour déclencher le suivant), jamais un
// engagement scientifique ; son seul rôle est d'informer l'utilisateur, jamais le scoring.
function countPlannedCalls(cases, providers, rolesEnabled, completedIndex, repetitionsCount) {
  const includeCritic = rolesEnabled.has("critic");
  const includeAnalyst = rolesEnabled.has("analyst") || includeCritic;
  const includeArbiter = rolesEnabled.has("arbiter");
  const includeCriticForArbiter = includeCritic || includeArbiter;
  let total = 0;
  for (const provider of providers) {
    for (const testCase of cases) {
      if (testCase.role_under_test === "analyst_and_critic") {
        if (!includeAnalyst) continue;
        for (let run = 1; run <= repetitionsCount; run += 1) {
          if (!completedIndex.has(buildResultKey(testCase.id, "analyst", provider, run))) total += 1;
          if (includeCritic && !completedIndex.has(buildResultKey(testCase.id, "critic", provider, run))) total += 1;
        }
      } else if (testCase.role_under_test === "critic_isolation") {
        if (!includeCriticForArbiter) continue;
        for (let run = 1; run <= repetitionsCount; run += 1) {
          if (!completedIndex.has(buildResultKey(testCase.id, "critic", provider, run))) total += 1;
          if (testCase.oracle?.arbiter && includeArbiter && !completedIndex.has(buildResultKey(testCase.id, "arbiter", provider, run))) total += 1;
        }
      }
    }
  }
  return total;
}

async function main() {
  const startedAt = new Date().toISOString();
  const runSignature = buildRunSignature({
    provider: args.provider ?? "all",
    repetitions,
    casesFilter: args.cases ?? null,
    rolesFilter: args.roles ?? null,
    timeoutMs: TIMEOUT_MS,
    corpusCases: corpus.cases.length
  });

  let results = [];
  if (RESUME) {
    const checkpoint = readCheckpointIfExists(CHECKPOINT_PATH);
    if (checkpoint) {
      assertCheckpointCompatible(checkpoint, runSignature);
      const { kept, retryable } = splitResumableCompleted(checkpoint.completed);
      results = kept;
      if (retryable.length) {
        process.stdout.write(`Reprise : ${retryable.length} résultat(s) technique(s) (timeout/erreur réseau) seront rejoués (jamais un succès ni un échec sémantique).\n`);
      }
      process.stdout.write(`Reprise depuis ${CHECKPOINT_PATH} : ${results.length} résultat(s) déjà complété(s), aucun ne sera rejoué.\n`);
    } else {
      process.stdout.write(`--resume demandé mais aucun point de reprise trouvé (${CHECKPOINT_PATH}) : exécution complète depuis le début.\n`);
    }
  }
  const completedIndex = buildCompletedIndex(results);
  const progress = { done: 0, total: countPlannedCalls(SELECTED_CASES, PROVIDERS, ROLES_FILTER, completedIndex, repetitions) };

  const persistCheckpoint = async () => {
    writeCheckpointSync(CHECKPOINT_PATH, {
      version: "1.0",
      status: "in_progress",
      started_at: startedAt,
      updated_at: new Date().toISOString(),
      run_signature: runSignature,
      completed: results
    });
  };

  let sigintAlreadyHandled = false;
  const onSigint = () => {
    if (sigintAlreadyHandled) process.exit(130);
    sigintAlreadyHandled = true;
    process.stderr.write(describeSigintStatus(results, CHECKPOINT_PATH));
    process.exit(130);
  };
  process.on("SIGINT", onSigint);

  const notExecuted = [];
  try {
    for (const provider of PROVIDERS) {
      if (!providerAvailable(provider)) {
        notExecuted.push({ provider, reason: provider === "workers-ai" ? "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN absents" : "GROQ_API_KEY absent" });
        continue;
      }
      for (const testCase of SELECTED_CASES) {
        const ctx = { completedIndex, rolesEnabled: ROLES_FILTER, progress, onResult: persistCheckpoint };
        if (testCase.role_under_test === "analyst_and_critic") await benchmarkAnalystAndCritic(testCase, provider, results, ctx);
        else if (testCase.role_under_test === "critic_isolation") await benchmarkCriticIsolation(testCase, provider, results, ctx);
      }
    }
  } finally {
    process.removeListener("SIGINT", onSigint);
  }

  const summary = [];
  for (const role of ROLES) for (const provider of PROVIDERS) {
    const row = aggregate(role, provider, results);
    if (row) summary.push(row);
  }

  const report = buildFinalReport({ repetitions, corpusCasesCount: corpus.cases.length, notExecuted, summary, results });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  if (fs.existsSync(CHECKPOINT_PATH)) fs.rmSync(CHECKPOINT_PATH);
  process.stdout.write(JSON.stringify({ status: notExecuted.length === PROVIDERS.length ? "NOT_EXECUTED" : "OK", providers_not_executed: notExecuted, output: outputPath }, null, 2) + "\n");
}

// Ne s'exécute que lorsque ce fichier est lancé directement (node run-role-benchmark.mjs), jamais
// lorsqu'il est importé (les tests importent resolveProviders/SUPPORTED_PROVIDER_FILTERS sans
// déclencher d'appel réseau réel). pathToFileURL est indispensable ici : une comparaison par simple
// concaténation de chaîne ("file://" + process.argv[1]) échoue silencieusement dès que le chemin
// contient un espace ou un caractère spécial — ce qui est le cas de ce dépôt ("Atelier Prompts").
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Échec du benchmark : ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
