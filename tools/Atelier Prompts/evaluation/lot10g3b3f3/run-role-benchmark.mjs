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
// Usage :
//   node evaluation/lot10g3b3f3/run-role-benchmark.mjs [--repetitions=3] [--provider=all|workers-ai|groq] [--output=chemin.json]
//     [--pacing-ms=0] [--groq-max-retries=5] [--groq-retry-margin-ms=750] [--groq-default-backoff-ms=30000]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ANALYST_SYSTEM_PROMPT, ANALYST_JSON_SCHEMA, makeAnalystUserMessage, parseAnalystOutput,
  CRITIC_SYSTEM_PROMPT, CRITIC_JSON_SCHEMA, makeCriticUserMessage, parseCriticOutput,
  ARBITER_SYSTEM_PROMPT, ARBITER_JSON_SCHEMA, makeArbiterUserMessage, parseArbiterOutput
} from "../../workers/shared/operational-request-core.js";
import { scoreAnalystOutput, scoreCriticOutput, scoreArbiterOutput, assessStability } from "./score-role-outputs.mjs";
import { PRIMARY_MODEL as RUNTIME_WORKERS_AI_MODEL } from "../../workers/workers-ai/src/index.js";
import { MODEL as RUNTIME_GROQ_MODEL } from "../../workers/groq/src/index.js";

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
  defaultBackoffMs: Math.max(0, Number(args["groq-default-backoff-ms"] ?? 30000))
});

function providerAvailable(provider) {
  return provider === "workers-ai" ? Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) : Boolean(GROQ_API_KEY);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Exécute fetch(url, requestInit) avec reprise automatique sur HTTP 429 : même appel, même corps,
 * après avoir attendu le délai indiqué par le provider (+ marge de sécurité) ou un repli fixe si
 * aucun délai n'est exploitable. Borné par maxRetries pour exclure toute boucle infinie. N'importe
 * quelle autre réponse (succès ou autre erreur) est retournée telle quelle, sans retry — un 429
 * réessayé avec succès est indiscernable, pour l'appelant, d'un succès du premier coup, hormis les
 * compteurs retries/rate_limited_wait_ms retournés à titre d'observabilité.
 */
export async function fetchGroqWithRetry(url, requestInit, overrides = {}) {
  const { maxRetries, safetyMarginMs, defaultBackoffMs, sleepFn = sleep } = { ...GROQ_RETRY_DEFAULTS, ...overrides };
  let attempt = 0;
  let rateLimitedWaitMs = 0;
  while (true) {
    const response = await fetch(url, requestInit);
    if (response.status !== 429) return { response, retries: attempt, rate_limited_wait_ms: rateLimitedWaitMs };
    if (attempt >= maxRetries) {
      throw Object.assign(
        new Error(`Groq HTTP 429 : limite de débit atteinte après ${maxRetries} tentative(s) de reprise.`),
        { rateLimited: true, exhausted: true, retries: attempt, rate_limited_wait_ms: rateLimitedWaitMs }
      );
    }
    const raw = await response.clone().text().catch(() => "");
    const retryAfterMs = parseRetryAfterMs(response) ?? parseRetryDelayFromBody(raw) ?? defaultBackoffMs;
    const waitMs = retryAfterMs + safetyMarginMs;
    rateLimitedWaitMs += waitMs;
    attempt += 1;
    await sleepFn(waitMs);
  }
}

export async function callWorkersAI(systemPrompt, userMessage, schema) {
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
    })
  });
  const elapsed = Math.round(performance.now() - started);
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw Object.assign(new Error(`Workers AI HTTP ${response.status}: ${JSON.stringify(payload.errors || payload)}`), { elapsed });
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
        max_completion_tokens: 2048,
        stream: false
      })
    }, retryOverrides));
  } catch (retryExhaustedError) {
    // 429 épuisé après maxRetries : erreur technique, jamais requalifiée en échec sémantique.
    throw Object.assign(retryExhaustedError, { elapsed: Math.round(performance.now() - started) });
  }
  // Le temps passé à attendre le débit n'est pas une latence du modèle : il est exclu de "elapsed"
  // pour que latency_median_ms/p90 restent comparables entre exécutions, avec ou sans reprise.
  const elapsed = Math.max(0, Math.round(performance.now() - started) - rate_limited_wait_ms);
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(`Groq HTTP ${response.status}: ${JSON.stringify(payload.error || payload)}`), { elapsed });
  return { content: payload.choices?.[0]?.message?.content, elapsed, usage: payload.usage || null, retries, rate_limited_wait_ms };
}

async function callProvider(role, provider, systemPrompt, userMessage, schema) {
  if (PACING_MS > 0) await sleep(PACING_MS);
  return provider === "workers-ai" ? callWorkersAI(systemPrompt, userMessage, schema) : callGroq(role, systemPrompt, userMessage, schema);
}

async function runRole(role, provider, systemPrompt, userMessage, schema, parseFn) {
  try {
    const { content, elapsed, usage, retries = 0, rate_limited_wait_ms = 0 } = await callProvider(role, provider, systemPrompt, userMessage, schema);
    // Un 429 réessayé avec succès produit exactement la même forme de résultat qu'un succès direct
    // (valid_json déterminé uniquement par la conformité du JSON, jamais par le fait qu'une reprise
    // ait eu lieu) ; retries/rate_limited_wait_ms ne sont que des champs d'observabilité additifs.
    try {
      return { valid_json: true, output: parseFn(content), elapsed_ms: elapsed, usage, retries, rate_limited_wait_ms };
    } catch (parseError) {
      return { valid_json: false, error: parseError.message, elapsed_ms: elapsed, usage, retries, rate_limited_wait_ms };
    }
  } catch (callError) {
    return {
      valid_json: false,
      provider_error: callError.message,
      elapsed_ms: callError.elapsed ?? null,
      rate_limited_exhausted: callError.exhausted === true,
      retries: callError.retries ?? 0,
      rate_limited_wait_ms: callError.rate_limited_wait_ms ?? 0
    };
  }
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
    rate_limited_exhausted: roleRun.rate_limited_exhausted === true,
    retries: roleRun.retries || 0,
    rate_limited_wait_ms: roleRun.rate_limited_wait_ms || 0,
    score,
    cost_usd: estimateCostUsd(provider, roleRun.usage),
    __output: roleRun.valid_json ? roleRun.output : null
  };
}

async function benchmarkAnalystAndCritic(testCase, provider, results) {
  const runs = [];
  for (let run = 1; run <= repetitions; run += 1) {
    const analystMessage = makeAnalystUserMessage(testCase.input);
    const analystRun = await runRole("analyst", provider, ANALYST_SYSTEM_PROMPT, analystMessage, ANALYST_JSON_SCHEMA, parseAnalystOutput);
    let criticRun = null;
    if (analystRun.valid_json) {
      const criticMessage = makeCriticUserMessage({ ...testCase.input, analyst_output: analystRun.output, previous_vetoes: [] });
      criticRun = await runRole("critic", provider, CRITIC_SYSTEM_PROMPT, criticMessage, CRITIC_JSON_SCHEMA, parseCriticOutput);
    }
    runs.push({ run, analystRun, criticRun });
  }
  for (const { run, analystRun, criticRun } of runs) {
    const analystScore = analystRun.valid_json ? scoreAnalystOutput(analystRun.output, testCase.oracle.analyst || {}) : null;
    const criticScore = criticRun?.valid_json ? scoreCriticOutput(criticRun.output, testCase.oracle.critic || {}) : null;
    results.push(toResultRow(testCase.id, "analyst", provider, run, analystRun, analystScore));
    if (criticRun) results.push(toResultRow(testCase.id, "critic", provider, run, criticRun, criticScore));
  }
  return runs.filter((r) => r.analystRun.valid_json).map((r) => r.analystRun.output);
}

// 3F.3.3-C, A1 : original_request doit toujours provenir du cas de corpus réel (testCase.input),
// jamais d'une chaîne vide — un appel Critique/Arbitre isolé sans la demande originale ne respecte
// pas le contrat runtime (makeCriticUserMessage/makeArbiterUserMessage attendent original_request
// pour la comparaison sémantique) et invaliderait silencieusement tout jugement de dérive.
export async function benchmarkCriticIsolation(testCase, provider, results) {
  if (!testCase.input || !testCase.input.original_request) {
    throw new Error(`Cas ${testCase.id} : role_under_test="critic_isolation" exige input.original_request (contrat runtime), aucune chaîne vide ne peut être substituée.`);
  }
  const { original_request, clarification_history = [] } = testCase.input;
  const criticRuns = [];
  for (let run = 1; run <= repetitions; run += 1) {
    const criticMessage = makeCriticUserMessage({ original_request, clarification_history, analyst_output: testCase.fixture_analyst_output, previous_vetoes: [] });
    const criticRun = await runRole("critic", provider, CRITIC_SYSTEM_PROMPT, criticMessage, CRITIC_JSON_SCHEMA, parseCriticOutput);
    const criticScore = criticRun.valid_json ? scoreCriticOutput(criticRun.output, testCase.oracle.critic || {}) : null;
    results.push(toResultRow(testCase.id, "critic", provider, run, criticRun, criticScore));

    if (testCase.oracle.arbiter && criticRun.valid_json) {
      const arbiterMessage = makeArbiterUserMessage({ original_request, clarification_history, analyst_output: testCase.fixture_analyst_output, critic_output: criticRun.output });
      const arbiterRun = await runRole("arbiter", provider, ARBITER_SYSTEM_PROMPT, arbiterMessage, ARBITER_JSON_SCHEMA, parseArbiterOutput);
      // 3F.3.3-C1, B-02 : le gate déterministe est réellement branché ici, avec la provenance de
      // l'Analyste fixture comme seule source de vérité disponible pour ce chemin (Critic/Arbiter
      // n'émettent pas leur propre provenance_records dans ce contrat).
      const arbiterScore = arbiterRun.valid_json
        ? scoreArbiterOutput(arbiterRun.output, testCase.oracle.arbiter, { provenance_records: testCase.fixture_analyst_output.provenance_records })
        : null;
      results.push(toResultRow(testCase.id, "arbiter", provider, run, arbiterRun, arbiterScore));
    }
    criticRuns.push(criticRun);
  }
  return criticRuns.filter((r) => r.valid_json).map((r) => r.output);
}

function aggregate(role, provider, rows) {
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

async function main() {
  const results = [];
  const notExecuted = [];
  for (const provider of PROVIDERS) {
    if (!providerAvailable(provider)) {
      notExecuted.push({ provider, reason: provider === "workers-ai" ? "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN absents" : "GROQ_API_KEY absent" });
      continue;
    }
    for (const testCase of corpus.cases) {
      if (testCase.role_under_test === "analyst_and_critic") await benchmarkAnalystAndCritic(testCase, provider, results);
      else if (testCase.role_under_test === "critic_isolation") await benchmarkCriticIsolation(testCase, provider, results);
    }
  }

  const summary = [];
  for (const role of ROLES) for (const provider of PROVIDERS) {
    const row = aggregate(role, provider, results);
    if (row) summary.push(row);
  }

  const report = {
    version: "1.0",
    lot: "10G.3B.3F.3.3",
    generated_at: new Date().toISOString(),
    repetitions,
    corpus_cases: corpus.cases.length,
    providers_not_executed: notExecuted,
    summary,
    raw_results: results
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
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
