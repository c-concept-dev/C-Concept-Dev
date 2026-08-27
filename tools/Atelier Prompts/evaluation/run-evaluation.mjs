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
const defaultModels = provider === "groq" ? "groq/llama-3.1-8b-instant" : "@cf/meta/llama-3.1-8b-instruct-fast,@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";
const models = String(args.models || defaultModels).split(",").filter(Boolean);
const corpusPath = path.resolve(root, args.corpus || "evaluation/corpus-lot10g2a.json");
const outputPath = path.resolve(root, args.output || "evaluation/results/workers-ai-latest.json");
const corpusRaw = fs.readFileSync(corpusPath, "utf8");
const corpus = JSON.parse(corpusRaw);

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
        ? { model, case_id: item.id, run, oracle: oracleLabel(item), elapsed_ms: elapsed, latency_ms: elapsed, valid: true, decision: payload }
        : { model, case_id: item.id, run, oracle: oracleLabel(item), elapsed_ms: elapsed, latency_ms: elapsed, valid: false, error: payload?.message || `HTTP ${response.status}` };
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
    latency_p95_ms: percentile(latencies, 0.95)
  };
}

const results = [];
for (const model of models) {
  for (const item of corpus.cases) {
    for (let run = 1; run <= repetitions; run += 1) {
      const row = await evaluateOne(model, item, run);
      results.push(row);
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
  corpus_cases: corpus.cases.length,
  corpus_sha256: crypto.createHash("sha256").update(corpusRaw).digest("hex"),
  prompt_sha256: crypto.createHash("sha256").update(DECISION_MODEL_PROMPT).digest("hex"),
  models,
  scores: models.map((model) => scoreModel(model, results)),
  results
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
process.stdout.write(`\n${JSON.stringify(report.scores, null, 2)}\nRésultats : ${outputPath}\n`);
