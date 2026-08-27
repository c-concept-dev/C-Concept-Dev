import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECISION_MODEL_PROMPT } from "../workers/shared/decision-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const endpoint = args.endpoint || "http://127.0.0.1:8791/evaluate";
const provider = args.provider || "workers-ai";
const origin = args.origin || "https://c-concept-dev.github.io";
const repetitions = Math.max(1, Math.min(5, Number(args.repetitions || 3)));
const delayMs = Math.max(0, Number(args["delay-ms"] || 0));
const defaultModels = provider === "groq" ? "groq/openai-gpt-oss-20b" : "@cf/meta/llama-3.1-8b-instruct-fast,@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";
const models = String(args.models || defaultModels).split(",").filter(Boolean);
const corpusPath = path.resolve(root, args.corpus || "evaluation/corpus-lot10g2a.json");
const outputPath = path.resolve(root, args.output || "evaluation/results/workers-ai-latest.json");
const checkpointPath = `${outputPath}.checkpoint.json`;
const corpusRaw = fs.readFileSync(corpusPath, "utf8");
const corpus = JSON.parse(corpusRaw);
const corpusSha256 = crypto.createHash("sha256").update(corpusRaw).digest("hex");
const promptSha256 = crypto.createHash("sha256").update(DECISION_MODEL_PROMPT).digest("hex");

function oracleLabel(item) {
  return item.oracle.question_required ? "architecte_question" : item.oracle.route;
}

function decisionLabel(decision) {
  return decision.question_indispensable !== null ? "architecte_question" : decision.route;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function evaluateOne(model, item, run) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  const started = performance.now();
  try {
    const input = { demande: item.demande, materiau_present: item.materiau_present, mode_demande: "rapide" };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(provider === "groq" ? { Origin: origin } : {})
      },
      body: JSON.stringify(provider === "groq" ? input : { model, input }),
      signal: controller.signal
    });
    const payload = await response.json();
    const elapsed = Math.round(performance.now() - started);
    if (provider === "groq") {
      return response.ok
        ? { model, case_id: item.id, run, oracle: oracleLabel(item), elapsed_ms: elapsed, latency_ms: elapsed, http_status: response.status, valid: true, decision: payload }
        : { model, case_id: item.id, run, oracle: oracleLabel(item), elapsed_ms: elapsed, latency_ms: elapsed, http_status: response.status, valid: false, error: payload?.message || `HTTP ${response.status}` };
    }
    return { model, case_id: item.id, run, oracle: oracleLabel(item), elapsed_ms: elapsed, ...payload };
  } catch (error) {
    return { model, case_id: item.id, run, oracle: oracleLabel(item), valid: false, elapsed_ms: Math.round(performance.now() - started), error: error instanceof Error ? error.message : "Erreur inconnue" };
  } finally {
    clearTimeout(timer);
  }
}

function scoreModel(model, results) {
  const rows = results.filter((row) => row.model === model);
  const valid = rows.filter((row) => row.valid && row.decision);
  const correct = valid.filter((row) => decisionLabel(row.decision) === row.oracle).length;
  const low = valid.filter((row) => row.decision.confiance === "faible").length;
  const excessiveEligible = valid.filter((row) => row.oracle !== "architecte_question");
  const missingEligible = valid.filter((row) => row.oracle === "architecte_question");
  const excessive = excessiveEligible.filter((row) => row.decision.question_indispensable !== null).length;
  const missing = missingEligible.filter((row) => row.decision.question_indispensable === null).length;
  const latencies = rows.map((row) => row.latency_ms ?? row.elapsed_ms).filter(Number.isFinite);
  const classes = ["rapide", "architecte", "architecte_question"];
  const accuracyByClass = Object.fromEntries(classes.map((label) => {
    const eligible = rows.filter((row) => row.oracle === label);
    const classCorrect = eligible.filter((row) => row.valid && row.decision && decisionLabel(row.decision) === label).length;
    return [label, eligible.length ? Number((100 * classCorrect / eligible.length).toFixed(1)) : null];
  }));
  const byCase = new Map();
  for (const row of valid) {
    if (!byCase.has(row.case_id)) byCase.set(row.case_id, []);
    byCase.get(row.case_id).push(row.decision.route);
  }
  const agreements = [...byCase.values()].map((routes) => Math.max(...[...new Set(routes)].map((route) => routes.filter((item) => item === route).length)) / routes.length);
  return {
    model,
    calls: rows.length,
    accuracy_pct: Number((100 * correct / rows.length).toFixed(1)),
    accuracy_by_class_pct: accuracyByClass,
    valid_output_pct: Number((100 * valid.length / rows.length).toFixed(1)),
    invalid_pct: Number((100 * (rows.length - valid.length) / rows.length).toFixed(1)),
    route_stability_pct: agreements.length ? Number((100 * agreements.reduce((sum, value) => sum + value, 0) / agreements.length).toFixed(1)) : 0,
    fully_stable_cases_pct: agreements.length ? Number((100 * agreements.filter((value) => value === 1).length / agreements.length).toFixed(1)) : 0,
    stability_case_coverage_pct: Number((100 * byCase.size / corpus.cases.length).toFixed(1)),
    low_confidence_pct: valid.length ? Number((100 * low / valid.length).toFixed(1)) : 0,
    excessive_question_pct: excessiveEligible.length ? Number((100 * excessive / excessiveEligible.length).toFixed(1)) : 0,
    missed_required_question_pct: missingEligible.length ? Number((100 * missing / missingEligible.length).toFixed(1)) : 0,
    latency_mean_ms: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
    latency_p50_ms: percentile(latencies, 0.5),
    latency_p90_ms: percentile(latencies, 0.9),
    latency_p95_ms: percentile(latencies, 0.95),
    latency_max_ms: latencies.length ? Math.max(...latencies) : null,
    http_429_count: rows.filter((row) => row.http_status === 429).length,
    provider_error_count: rows.filter((row) => !row.valid).length
  };
}

const benchmarkStarted = Date.now();
let results = [];
if (args.resume !== "false" && fs.existsSync(checkpointPath)) {
  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  if (checkpoint.corpus_sha256 !== corpusSha256 || checkpoint.prompt_sha256 !== promptSha256) {
    throw new Error("Checkpoint incompatible avec le corpus ou le prompt courant.");
  }
  results = checkpoint.results;
}
const completed = new Set(results.map((row) => `${row.model}\t${row.case_id}\t${row.run}`));
for (const model of models) {
  for (const item of corpus.cases) {
    for (let run = 1; run <= repetitions; run += 1) {
      if (completed.has(`${model}\t${item.id}\t${run}`)) continue;
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const row = await evaluateOne(model, item, run);
      results.push(row);
      fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
      fs.writeFileSync(checkpointPath, JSON.stringify({ corpus_sha256: corpusSha256, prompt_sha256: promptSha256, results }, null, 2) + "\n");
      process.stdout.write(`${model}\t${item.id}\t${run}\t${row.valid ? decisionLabel(row.decision) : "INVALIDE"}\t${row.latency_ms ?? row.elapsed_ms} ms\n`);
    }
  }
}
const report = {
  version: "10G.2A",
  generated_at: new Date().toISOString(),
  endpoint,
  provider,
  repetitions,
  delay_ms: delayMs,
  benchmark_total_ms: Date.now() - benchmarkStarted,
  provider_http_total_ms: results.reduce((sum, row) => sum + (row.latency_ms ?? row.elapsed_ms ?? 0), 0),
  corpus_cases: corpus.cases.length,
  corpus_sha256: corpusSha256,
  prompt_sha256: promptSha256,
  models,
  scores: models.map((model) => scoreModel(model, results)),
  results
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
process.stdout.write(`\n${JSON.stringify(report.scores, null, 2)}\nRésultats : ${outputPath}\n`);
