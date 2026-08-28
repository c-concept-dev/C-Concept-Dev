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
// Usage :
//   node evaluation/lot10g3b3f3/run-role-benchmark.mjs [--repetitions=3] [--provider=all|workers-ai|groq] [--output=chemin.json]

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

function providerAvailable(provider) {
  return provider === "workers-ai" ? Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) : Boolean(GROQ_API_KEY);
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

export async function callGroq(role, systemPrompt, userMessage, schema) {
  const started = performance.now();
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
  });
  const elapsed = Math.round(performance.now() - started);
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(`Groq HTTP ${response.status}: ${JSON.stringify(payload.error || payload)}`), { elapsed });
  return { content: payload.choices?.[0]?.message?.content, elapsed, usage: payload.usage || null };
}

async function callProvider(role, provider, systemPrompt, userMessage, schema) {
  return provider === "workers-ai" ? callWorkersAI(systemPrompt, userMessage, schema) : callGroq(role, systemPrompt, userMessage, schema);
}

async function runRole(role, provider, systemPrompt, userMessage, schema, parseFn) {
  try {
    const { content, elapsed, usage } = await callProvider(role, provider, systemPrompt, userMessage, schema);
    try {
      return { valid_json: true, output: parseFn(content), elapsed_ms: elapsed, usage };
    } catch (parseError) {
      return { valid_json: false, error: parseError.message, elapsed_ms: elapsed, usage };
    }
  } catch (callError) {
    return { valid_json: false, provider_error: callError.message, elapsed_ms: callError.elapsed ?? null };
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
    results.push({ case_id: testCase.id, role: "analyst", provider, run, valid_json: analystRun.valid_json, elapsed_ms: analystRun.elapsed_ms, error: analystRun.error || analystRun.provider_error || null, score: analystScore, cost_usd: estimateCostUsd(provider, analystRun.usage), __output: analystRun.valid_json ? analystRun.output : null });
    if (criticRun) results.push({ case_id: testCase.id, role: "critic", provider, run, valid_json: criticRun.valid_json, elapsed_ms: criticRun.elapsed_ms, error: criticRun.error || criticRun.provider_error || null, score: criticScore, cost_usd: estimateCostUsd(provider, criticRun.usage), __output: criticRun.valid_json ? criticRun.output : null });
  }
  return runs.filter((r) => r.analystRun.valid_json).map((r) => r.analystRun.output);
}

async function benchmarkCriticIsolation(testCase, provider, results) {
  const criticRuns = [];
  for (let run = 1; run <= repetitions; run += 1) {
    const criticMessage = makeCriticUserMessage({ original_request: "", analyst_output: testCase.fixture_analyst_output, previous_vetoes: [] });
    const criticRun = await runRole("critic", provider, CRITIC_SYSTEM_PROMPT, criticMessage, CRITIC_JSON_SCHEMA, parseCriticOutput);
    const criticScore = criticRun.valid_json ? scoreCriticOutput(criticRun.output, testCase.oracle.critic || {}) : null;
    results.push({ case_id: testCase.id, role: "critic", provider, run, valid_json: criticRun.valid_json, elapsed_ms: criticRun.elapsed_ms, error: criticRun.error || criticRun.provider_error || null, score: criticScore, cost_usd: estimateCostUsd(provider, criticRun.usage), __output: criticRun.valid_json ? criticRun.output : null });

    if (testCase.oracle.arbiter && criticRun.valid_json) {
      const arbiterMessage = makeArbiterUserMessage({ original_request: "", analyst_output: testCase.fixture_analyst_output, critic_output: criticRun.output });
      const arbiterRun = await runRole("arbiter", provider, ARBITER_SYSTEM_PROMPT, arbiterMessage, ARBITER_JSON_SCHEMA, parseArbiterOutput);
      const arbiterScore = arbiterRun.valid_json ? scoreArbiterOutput(arbiterRun.output, testCase.oracle.arbiter) : null;
      results.push({ case_id: testCase.id, role: "arbiter", provider, run, valid_json: arbiterRun.valid_json, elapsed_ms: arbiterRun.elapsed_ms, error: arbiterRun.error || arbiterRun.provider_error || null, score: arbiterScore, cost_usd: estimateCostUsd(provider, arbiterRun.usage), __output: arbiterRun.valid_json ? arbiterRun.output : null });
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
