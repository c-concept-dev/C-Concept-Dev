// LOT X2-A-R2B — Probe du calcul TPM Groq : max_completion_tokens fait-il varier "Requested" ?
//
// Expérience ISOLÉE, jamais du code de production, jamais du probe R2 existant (celui-ci n'est ni
// modifié ni importé — la seule chose reprise est le SCHÉMA $defs/$ref déjà validé par R2, via
// build-ref-review-schema-r2.mjs, réutilisé en LECTURE SEULE). Objectif unique : faire varier
// UNIQUEMENT max_completion_tokens (2048, 1536, 1024, 512) à travers 4 appels réels séparés dans le
// temps (pacing >= 30s), tout le reste du body restant rigoureusement identique (même prompt, même
// message, même schéma R2, mêmes autres paramètres), et observer si le "Requested" retourné par
// Groq en cas de HTTP 429/413 varie en conséquence — un diagnostic pour comprendre le calcul TPM
// réel avant X2-B, jamais une décision de configuration production.
//
// Isolation : CRITIC_SYSTEM_PROMPT, buildQuestionReviewTargets, makeCriticUserMessage importés en
// LECTURE SEULE depuis la production (jamais modifiés). buildCriticJsonSchemaR2 importé en lecture
// seule depuis build-ref-review-schema-r2.mjs (jamais modifié, jamais dupliqué).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCriticJsonSchemaR2 } from "./build-ref-review-schema-r2.mjs";
import { CRITIC_SYSTEM_PROMPT, buildQuestionReviewTargets, makeCriticUserMessage } from "../../../workers/shared/operational-request-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const FIXTURE_PATH = path.resolve(here, "../fixtures/critic-b01b-sentinel.json");
const RESULTS_DIR = path.resolve(root, "evaluation/lot10g3b3f3/results/x2a-r2b");
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";

export const VALUES_TESTED = Object.freeze([2048, 1536, 1024, 512]);
export const PACING_MS = 45000; // >= 30s exigé par la mission ; 45s pour marge de sécurité TPM.
export const TIMEOUT_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parsing structurel du message Groq "Limit 8000, Requested 8952" (ou variante) — jamais recopié à
 * la main. Ne tente qu'un motif étroit et documenté ; retourne null si non trouvé, plutôt que
 * d'halluciner une valeur.
 */
export function parseLimitAndRequested(rawMessage) {
  if (typeof rawMessage !== "string") return { limit: null, requested: null };
  const limitMatch = /Limit\s+(\d+)/i.exec(rawMessage);
  const requestedMatch = /Requested\s+(\d+)/i.exec(rawMessage);
  return {
    limit: limitMatch ? Number(limitMatch[1]) : null,
    requested: requestedMatch ? Number(requestedMatch[1]) : null
  };
}

function classifyNetworkError(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "timeout";
  return "network_error";
}

async function callGroqOnce({ schema, userMessage, maxCompletionTokens }) {
  if (!process.env.GROQ_API_KEY) {
    return { provider_ok: false, http_status: null, error: "GROQ_API_KEY absent.", error_kind: "auth_missing" };
  }
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: CRITIC_SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ],
    response_format: { type: "json_schema", json_schema: { name: "oprie_critic_r2b", strict: true, schema } },
    reasoning_format: "hidden",
    reasoning_effort: "low",
    temperature: 0,
    max_completion_tokens: maxCompletionTokens,
    stream: false
  };
  const bodyJson = JSON.stringify(body);
  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: bodyJson,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const rawBody = await response.text();
    if (!response.ok) {
      let rawErrorMessage = rawBody;
      try {
        const parsed = JSON.parse(rawBody);
        rawErrorMessage = parsed?.error?.message ?? rawBody;
      } catch {}
      const { limit, requested } = parseLimitAndRequested(rawErrorMessage);
      return {
        provider_ok: false,
        http_status: response.status,
        error_kind: response.status === 429 ? "http_429" : (response.status === 413 ? "http_413" : "http_other"),
        raw_error_message: String(rawErrorMessage).slice(0, 800),
        limit,
        requested,
        body_size_chars: bodyJson.length
      };
    }
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      return { provider_ok: true, http_status: response.status, valid_json: false, error_kind: "json_error", error: parseError.message, body_size_chars: bodyJson.length };
    }
    return { provider_ok: true, http_status: response.status, valid_json: true, usage: payload.usage || null, body_size_chars: bodyJson.length };
  } catch (error) {
    return { provider_ok: false, http_status: null, error: error.message, error_kind: error.error_kind ?? classifyNetworkError(error), body_size_chars: bodyJson.length };
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  if (!process.env.GROQ_API_KEY) {
    process.stdout.write("GROQ_API_KEY=NOT_SET\n");
    const summary = {
      values_tested: [...VALUES_TESTED],
      requested_by_value: {},
      limit_by_value: {},
      requested_minus_completion_by_value: {},
      deltas: null,
      linear_relationship_detected: null,
      ratio_estimate: null,
      first_http_success_if_any: null,
      verdict: "X2-A-R2B INCONCLUSIF — ENVIRONMENT (GROQ_API_KEY absent, aucun appel tenté)"
    };
    for (const value of VALUES_TESTED) {
      const runRecord = {
        max_completion_tokens: value,
        http_status: null,
        provider_ok: false,
        error_kind: "auth_missing",
        requested: null,
        limit: null,
        raw_error_message: "GROQ_API_KEY absent.",
        body_size_chars: null,
        schema_size_chars: null
      };
      writeJson(path.join(RESULTS_DIR, `run-${value}.json`), runRecord);
    }
    writeJson(path.join(RESULTS_DIR, "summary.json"), summary);
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    return;
  }

  process.stdout.write("GROQ_API_KEY=SET\n");

  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  const testCase = fixture.cases[0];
  const analystOutput = testCase.fixture_analyst_output;
  const targets = buildQuestionReviewTargets(analystOutput);
  const schema = buildCriticJsonSchemaR2(targets);
  const schemaJson = JSON.stringify(schema);
  const userMessage = makeCriticUserMessage({
    original_request: testCase.input.original_request,
    clarification_history: testCase.input.clarification_history,
    analyst_output: analystOutput,
    previous_vetoes: []
  });

  const results = {};
  let firstHttpSuccess = null;
  for (let i = 0; i < VALUES_TESTED.length; i += 1) {
    const value = VALUES_TESTED[i];
    if (i > 0) {
      process.stdout.write(`Pacing ${PACING_MS}ms avant le prochain appel...\n`);
      await sleep(PACING_MS);
    }
    process.stdout.write(`[max_completion_tokens=${value}] appel Groq...\n`);
    const callResult = await callGroqOnce({ schema, userMessage, maxCompletionTokens: value });
    const runRecord = {
      max_completion_tokens: value,
      http_status: callResult.http_status,
      provider_ok: callResult.provider_ok === true,
      error_kind: callResult.error_kind ?? null,
      requested: callResult.requested ?? null,
      limit: callResult.limit ?? null,
      raw_error_message: callResult.raw_error_message ?? callResult.error ?? null,
      body_size_chars: callResult.body_size_chars ?? null,
      schema_size_chars: schemaJson.length
    };
    if (callResult.provider_ok && firstHttpSuccess === null) firstHttpSuccess = value;
    results[value] = runRecord;
    writeJson(path.join(RESULTS_DIR, `run-${value}.json`), runRecord);
    process.stdout.write(`  -> http_status=${runRecord.http_status} requested=${runRecord.requested} limit=${runRecord.limit}\n`);
  }

  const requestedByValue = Object.fromEntries(VALUES_TESTED.map((v) => [v, results[v].requested]));
  const limitByValue = Object.fromEntries(VALUES_TESTED.map((v) => [v, results[v].limit]));
  const requestedMinusCompletionByValue = Object.fromEntries(
    VALUES_TESTED.map((v) => [v, Number.isFinite(requestedByValue[v]) ? requestedByValue[v] - v : null])
  );

  const deltas = {};
  for (let i = 0; i < VALUES_TESTED.length - 1; i += 1) {
    const a = VALUES_TESTED[i];
    const b = VALUES_TESTED[i + 1];
    const ra = requestedByValue[a];
    const rb = requestedByValue[b];
    deltas[`${a}_${b}`] = Number.isFinite(ra) && Number.isFinite(rb) ? ra - rb : null;
  }

  const validDeltas = Object.values(deltas).filter((d) => Number.isFinite(d));
  const deltaMaxCompletion = 512;
  let ratioEstimate = null;
  let verdict = "X2-A-R2B INCONCLUSIF — ENVIRONMENT";
  if (validDeltas.length === VALUES_TESTED.length - 1) {
    const avgDelta = validDeltas.reduce((sum, d) => sum + d, 0) / validDeltas.length;
    ratioEstimate = Number((avgDelta / deltaMaxCompletion).toFixed(3));
    if (ratioEstimate >= 0.85) verdict = "X2-A-R2B CONFIRME";
    else if (ratioEstimate > 0.1) verdict = "X2-A-R2B CONFIRME PARTIELLEMENT";
    else verdict = "X2-A-R2B INFIRME";
  }

  const summary = {
    values_tested: [...VALUES_TESTED],
    requested_by_value: requestedByValue,
    limit_by_value: limitByValue,
    requested_minus_completion_by_value: requestedMinusCompletionByValue,
    deltas,
    linear_relationship_detected: ratioEstimate !== null ? ratioEstimate >= 0.85 : null,
    ratio_estimate: ratioEstimate,
    first_http_success_if_any: firstHttpSuccess,
    verdict
  };
  writeJson(path.join(RESULTS_DIR, "summary.json"), summary);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Échec du probe X2-A-R2B : ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
