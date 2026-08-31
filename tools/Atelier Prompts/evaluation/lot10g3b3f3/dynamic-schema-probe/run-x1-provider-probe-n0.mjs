// PRECHECK X2 — Probe provider N=0 (edge-case zéro target), isolé, jamais du code de production.
//
// Question unique : le provider Groq accepte-t-il, en mode JSON Schema strict, un schéma dynamique
// vide (properties={}, required=[], additionalProperties:false) construit par le même builder X1
// (build-dynamic-review-schema.mjs, non modifié), et produit-il alors l'objet vide attendu
// { "question_substitution_review": {} } — ou l'équivalent exact imposé par ce schéma ?
//
// Distinct de run-x1-provider-probe.mjs (qui teste N=4 sur la fixture sentinelle B-01B) : ce
// fichier existe uniquement pour ne pas modifier ce harness déjà livré, conformément à la
// consigne PRECHECK X2 de ne pas toucher aux fichiers X1 existants. Mêmes mécanismes réutilisés à
// l'identique : provider Groq, modèle importé de workers/groq/src/index.js, authentification
// GROQ_API_KEY, builder et prompt X1 inchangés. 3 runs réels maximum (edge-case de compatibilité,
// pas une mesure de cardinalité N>0 déjà établie séparément).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDynamicReviewSchema } from "./build-dynamic-review-schema.mjs";
import { X1_SYSTEM_PROMPT, buildX1UserMessage, buildX1GroqRequestBody } from "./x1-prompt.mjs";
import { MODEL as RUNTIME_GROQ_MODEL } from "../../../workers/groq/src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const RESULTS_DIR = path.resolve(root, "evaluation/lot10g3b3f3/results/x1-provider-probe-n0");
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const RUNS_REQUESTED = 3;
export const PACING_MS = 3000;
export const MAX_RETRIES = 5;
export const DEFAULT_BACKOFF_MS = 15000;
export const RETRY_SAFETY_MARGIN_MS = 750;
export const TIMEOUT_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response) {
  const header = typeof response?.headers?.get === "function" ? response.headers.get("retry-after") : null;
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

async function fetchGroqWithRetry(requestInit) {
  let attempt = 0;
  while (true) {
    const response = await fetch(GROQ_ENDPOINT, { ...requestInit, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status !== 429) return { response, retries: attempt };
    if (attempt >= MAX_RETRIES) {
      throw Object.assign(new Error(`Groq HTTP 429 : rate-limit non résolu après ${MAX_RETRIES} tentative(s).`), {
        error_kind: "http_429", retries: attempt
      });
    }
    const waitMs = (parseRetryAfterMs(response) ?? DEFAULT_BACKOFF_MS) + RETRY_SAFETY_MARGIN_MS;
    attempt += 1;
    await sleep(waitMs);
  }
}

function classifyNetworkError(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "timeout";
  return "network_error";
}

async function callGroqOnce({ dynamicSchema, userMessage }) {
  if (!process.env.GROQ_API_KEY) {
    return { provider_ok: false, error: "GROQ_API_KEY absent.", error_kind: "auth_missing" };
  }
  const body = buildX1GroqRequestBody({ model: RUNTIME_GROQ_MODEL, dynamicSchema, userMessage });
  try {
    const { response } = await fetchGroqWithRetry({
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      return {
        provider_ok: false,
        error: `Groq HTTP ${response.status}: ${JSON.stringify(payload.error || payload)}`,
        error_kind: response.status === 400 ? "http_400" : "http_other"
      };
    }
    const content = payload.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      return { provider_ok: true, valid_json: false, error: parseError.message, error_kind: "json_error", raw_content: content };
    }
    return { provider_ok: true, valid_json: true, output: parsed, usage: payload.usage || null };
  } catch (error) {
    return { provider_ok: false, error: error.message, error_kind: error.error_kind ?? classifyNetworkError(error) };
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const questionReviewTargets = [];
  const dynamicSchema = buildDynamicReviewSchema(questionReviewTargets);
  const userMessage = buildX1UserMessage({
    original_request: "Aide-moi à préparer un voyage en Italie.",
    analyst_candidate: {},
    question_review_targets: questionReviewTargets
  });

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const runs = [];
  for (let run = 1; run <= RUNS_REQUESTED; run += 1) {
    if (run > 1) await sleep(PACING_MS);
    process.stdout.write(`[run ${run}/${RUNS_REQUESTED}] appel Groq N=0 (model=${RUNTIME_GROQ_MODEL})...\n`);
    const callResult = await callGroqOnce({ dynamicSchema, userMessage });
    const outputKeys = callResult.provider_ok && callResult.valid_json ? Object.keys(callResult.output || {}) : [];
    const isEmptyObject = callResult.provider_ok && callResult.valid_json && outputKeys.length === 0;

    const runRecord = {
      run,
      provider: "groq",
      model: RUNTIME_GROQ_MODEL,
      provider_ok: callResult.provider_ok === true,
      valid_json: callResult.valid_json === true,
      output_keys: outputKeys,
      is_empty_object: isEmptyObject,
      output: callResult.output ?? null,
      error: callResult.error ?? null,
      error_kind: callResult.error_kind ?? null,
      usage: callResult.usage ?? null
    };
    runs.push(runRecord);
    writeJson(path.join(RESULTS_DIR, `run-${String(run).padStart(2, "0")}.json`), runRecord);
    process.stdout.write(`  -> provider_ok=${runRecord.provider_ok} valid_json=${runRecord.valid_json} is_empty_object=${runRecord.is_empty_object}\n`);
  }

  const providerSuccesses = runs.filter((r) => r.provider_ok).length;
  const validJsonCount = runs.filter((r) => r.valid_json).length;
  const emptyObjectCount = runs.filter((r) => r.is_empty_object).length;
  const summary = {
    runs_requested: RUNS_REQUESTED,
    runs_completed: runs.length,
    provider_successes: providerSuccesses,
    valid_json_count: validJsonCount,
    empty_object_count: emptyObjectCount,
    all_runs_empty: emptyObjectCount === RUNS_REQUESTED,
    schema_properties: dynamicSchema.properties,
    schema_required: dynamicSchema.required,
    schema_additional_properties: dynamicSchema.additionalProperties
  };
  writeJson(path.join(RESULTS_DIR, "summary.json"), summary);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Échec du probe N=0 : ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
