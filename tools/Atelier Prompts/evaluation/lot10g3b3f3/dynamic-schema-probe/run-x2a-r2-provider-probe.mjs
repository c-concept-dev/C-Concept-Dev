// LOT X2-A-R2 — Probe provider réel : $defs/$ref chez Groq, jamais du code de production.
//
// Teste empiriquement si Groq accepte, en mode JSON Schema strict, un schéma Critic complet où
// question_substitution_review référence (via $ref) une définition partagée unique ($defs.reviewEntry)
// au lieu de dupliquer le sous-schéma une fois par issue_id (X2-A réel). Mesure la taille réelle du
// schéma/body envoyés, et vérifie que le provider produit toujours exactement les 4 clés attendues
// (issue1-4), sans clé manquante ni fantôme, avec les six alternatives présentes par entrée.
//
// Isolation : CRITIC_SYSTEM_PROMPT, buildCriticJsonSchema, buildQuestionReviewTargets sont importés
// en LECTURE SEULE depuis la production (jamais modifiés, jamais réécrits) — même discipline que
// evaluation/lot10g3b3f3/run-role-benchmark.mjs. Le schéma factorisé lui-même vient exclusivement de
// build-ref-review-schema-r2.mjs (probe isolé, jamais workers/).
//
// Authentification : GROQ_API_KEY uniquement, jamais affichée, jamais journalisée, jamais écrite
// dans un artefact.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCriticJsonSchemaR2 } from "./build-ref-review-schema-r2.mjs";
import { CRITIC_SYSTEM_PROMPT, buildCriticJsonSchema, buildQuestionReviewTargets, makeCriticUserMessage } from "../../../workers/shared/operational-request-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const FIXTURE_PATH = path.resolve(here, "../fixtures/critic-b01b-sentinel.json");
const RESULTS_DIR = path.resolve(root, "evaluation/lot10g3b3f3/results/x2a-r2");
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";

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

/** Classification précise du type d'échec (Étape 7 de la mission) — jamais un "ERROR" générique. */
function classifyFailure({ httpStatus, rawBody, errorMessage }) {
  const haystack = `${rawBody || ""} ${errorMessage || ""}`.toLowerCase();
  if (httpStatus === 413 || /request too large|rate_limit_exceeded/.test(haystack)) return "tpm";
  if (/\$defs|unsupported keyword|invalid schema/.test(haystack)) return "provider_compat_defs";
  if (/\$ref|unresolved reference|unsupported \$ref/.test(haystack)) return "provider_compat_ref";
  return "other";
}

async function callGroqOnce({ schema, userMessage }) {
  if (!process.env.GROQ_API_KEY) {
    return { provider_ok: false, http_status: null, error: "GROQ_API_KEY absent.", error_kind: "auth_missing" };
  }
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: CRITIC_SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ],
    response_format: { type: "json_schema", json_schema: { name: "oprie_critic_r2", strict: true, schema } },
    reasoning_format: "hidden",
    reasoning_effort: "low",
    temperature: 0,
    max_completion_tokens: 2048,
    stream: false
  };
  try {
    const { response } = await fetchGroqWithRetry({
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const rawBody = await response.text();
    if (!response.ok) {
      const failureKind = classifyFailure({ httpStatus: response.status, rawBody });
      return {
        provider_ok: false,
        http_status: response.status,
        error: `Groq HTTP ${response.status}: ${rawBody.slice(0, 500)}`,
        error_kind: response.status === 413 ? "http_413" : failureKind
      };
    }
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      return { provider_ok: true, http_status: response.status, valid_json: false, error: `Réponse Groq non-JSON : ${parseError.message}`, error_kind: "json_error" };
    }
    const content = payload.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      return { provider_ok: true, http_status: response.status, valid_json: false, error: parseError.message, error_kind: "json_error", raw_content: content };
    }
    return { provider_ok: true, http_status: response.status, valid_json: true, output: parsed, usage: payload.usage || null };
  } catch (error) {
    return { provider_ok: false, http_status: null, error: error.message, error_kind: error.error_kind ?? classifyNetworkError(error) };
  }
}

function compareIssueIds(expectedIssueIds, actualIssueIds) {
  const expectedSet = new Set(expectedIssueIds);
  const actualSet = new Set(actualIssueIds);
  const missing_issue_ids = expectedIssueIds.filter((id) => !actualSet.has(id));
  const unexpected_issue_ids = actualIssueIds.filter((id) => !expectedSet.has(id));
  const exact_cardinality = missing_issue_ids.length === 0 && unexpected_issue_ids.length === 0 && expectedSet.size === actualSet.size;
  return { missing_issue_ids, unexpected_issue_ids, exact_cardinality };
}

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function checkAlternatives(review) {
  if (!review || typeof review !== "object" || !review.alternatives_reviewed) return false;
  return LADDER.every((alt) => {
    const entry = review.alternatives_reviewed[alt];
    return entry && typeof entry.reasonably_available === "boolean" && typeof entry.reason === "string" && entry.reason.length > 0;
  });
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  const testCase = fixture.cases[0];
  const analystOutput = testCase.fixture_analyst_output;
  const targets = buildQuestionReviewTargets(analystOutput);
  const expectedIssueIds = targets.map((t) => t.issue_id);

  const schemaR2 = buildCriticJsonSchemaR2(targets);
  const schemaBaseline = buildCriticJsonSchema(targets);
  const schemaR2Json = JSON.stringify(schemaR2);
  const schemaBaselineJson = JSON.stringify(schemaBaseline);

  const userMessage = makeCriticUserMessage({
    original_request: testCase.input.original_request,
    clarification_history: testCase.input.clarification_history,
    analyst_output: analystOutput,
    previous_vetoes: []
  });

  function fullBodyJson(schema) {
    return JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: CRITIC_SYSTEM_PROMPT }, { role: "user", content: userMessage }],
      response_format: { type: "json_schema", json_schema: { name: "oprie_critic_r2", strict: true, schema } },
      reasoning_format: "hidden", reasoning_effort: "low", temperature: 0, max_completion_tokens: 2048, stream: false
    });
  }
  const bodyR2Json = fullBodyJson(schemaR2);
  const bodyBaselineJson = fullBodyJson(schemaBaseline);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const runs = [];
  for (let run = 1; run <= RUNS_REQUESTED; run += 1) {
    if (run > 1) await sleep(PACING_MS);
    process.stdout.write(`[run ${run}/${RUNS_REQUESTED}] appel Groq R2 (model=${MODEL})...\n`);
    const callResult = await callGroqOnce({ schema: schemaR2, userMessage });

    let actualIssueIds = [];
    let reviewsSixAlternatives = {};
    if (callResult.provider_ok && callResult.valid_json) {
      actualIssueIds = Object.keys(callResult.output?.question_substitution_review || {});
      for (const issueId of actualIssueIds) {
        reviewsSixAlternatives[issueId] = checkAlternatives(callResult.output.question_substitution_review[issueId]);
      }
    }
    const { missing_issue_ids, unexpected_issue_ids, exact_cardinality } = compareIssueIds(expectedIssueIds, actualIssueIds);

    const runRecord = {
      run,
      provider: "groq",
      model: MODEL,
      provider_ok: callResult.provider_ok === true,
      http_status: callResult.http_status ?? null,
      valid_json: callResult.valid_json === true,
      error: callResult.error ?? null,
      error_kind: callResult.error_kind ?? null,
      actual_keys: actualIssueIds,
      missing_keys: missing_issue_ids,
      unexpected_keys: unexpected_issue_ids,
      exact_cardinality: callResult.provider_ok === true && callResult.valid_json === true && exact_cardinality,
      six_alternatives_present_per_issue: reviewsSixAlternatives,
      output: callResult.output ?? null,
      usage: callResult.usage ?? null,
      schema_size_chars: schemaR2Json.length,
      body_size_chars: bodyR2Json.length
    };
    runs.push(runRecord);
    writeJson(path.join(RESULTS_DIR, `run${String(run).padStart(2, "0")}.json`), runRecord);
    process.stdout.write(`  -> provider_ok=${runRecord.provider_ok} http_status=${runRecord.http_status} valid_json=${runRecord.valid_json} exact_cardinality=${runRecord.exact_cardinality}\n`);
  }

  const providerSuccesses = runs.filter((r) => r.provider_ok).length;
  const validJsonCount = runs.filter((r) => r.valid_json).length;
  const exactCardinalityCount = runs.filter((r) => r.exact_cardinality).length;
  const schemaSavingsChars = schemaBaselineJson.length - schemaR2Json.length;
  const bodySavingsChars = bodyBaselineJson.length - bodyR2Json.length;

  const summary = {
    runs_requested: RUNS_REQUESTED,
    runs_completed: runs.length,
    provider_successes: providerSuccesses,
    valid_json_count: validJsonCount,
    exact_cardinality_count: exactCardinalityCount,
    all_runs_exact: exactCardinalityCount === RUNS_REQUESTED,
    schema_size_chars: schemaR2Json.length,
    schema_size_bytes: Buffer.byteLength(schemaR2Json, "utf8"),
    body_size_chars: bodyR2Json.length,
    body_size_bytes: Buffer.byteLength(bodyR2Json, "utf8"),
    baseline_schema_size_chars: schemaBaselineJson.length,
    baseline_body_size_chars: bodyBaselineJson.length,
    schema_savings_chars: schemaSavingsChars,
    schema_savings_percent: Number((100 * schemaSavingsChars / schemaBaselineJson.length).toFixed(1)),
    body_savings_chars: bodySavingsChars,
    body_savings_percent: Number((100 * bodySavingsChars / bodyBaselineJson.length).toFixed(1))
  };
  writeJson(path.join(RESULTS_DIR, "summary.json"), summary);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Échec du probe X2-A-R2 : ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
