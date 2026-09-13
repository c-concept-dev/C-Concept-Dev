#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const HTML = path.join(ROOT, "atelier-prompts-v11.5-lot10g-decision-provider.html");
const PROXY = "https://openai-proxy.11drumboy11.workers.dev/";
const OPENAI_ENDPOINT = "/v1/responses";
const MODEL = "gpt-5.6-sol";
const ORIGIN = "https://c-concept-dev.github.io";
const GPT_INPUT_USD_PER_M = 4;
const GPT_OUTPUT_USD_PER_M = 20;
const HTTP_TIMEOUT_MS = 180_000;

function args() {
  const out = {};
  for (const raw of process.argv.slice(2)) {
    const [key, ...rest] = raw.replace(/^--/, "").split("=");
    out[key] = rest.length ? rest.join("=") : true;
  }
  return out;
}

function now() { return new Date().toISOString(); }
function msSince(start) { return Number(process.hrtime.bigint() - start) / 1e6; }
function round(value, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function safeError(error) {
  return { name: error?.name || "Error", message: String(error?.message || error) };
}
function usageOf(json) {
  const usage = json?.usage;
  if (!usage) return null;
  return {
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? null
  };
}
function costOf(usage) {
  if (!usage || usage.input_tokens === null || usage.output_tokens === null) return null;
  return round((usage.input_tokens * GPT_INPUT_USD_PER_M + usage.output_tokens * GPT_OUTPUT_USD_PER_M) / 1_000_000, 8);
}
function responseText(json) {
  if (typeof json?.output_text === "string" && json.output_text) return json.output_text;
  return (json?.output || []).flatMap(item => item?.content || [])
    .filter(item => item?.type === "output_text" && typeof item.text === "string")
    .map(item => item.text).join("");
}
function gptRecord(json, status, latencyMs, body) {
  const usage = usageOf(json);
  return {
    timestamp: now(),
    endpoint: OPENAI_ENDPOINT,
    status_http: status,
    latency_ms: round(latencyMs),
    response_id: json?.id || null,
    response_status: json?.status || null,
    model_requested: body.model,
    model_returned: json?.model || null,
    usage,
    estimated_cost_usd: costOf(usage),
    incomplete_details: json?.incomplete_details || null,
    error: json?.error || null,
    output: responseText(json)
  };
}

async function postResponses(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  const start = process.hrtime.bigint();
  let response;
  try {
    response = await fetch(PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-endpoint": OPENAI_ENDPOINT },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const latencyMs = msSince(start);
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); }
    catch { json = { error: { message: text.slice(0, 1000) || "Réponse non JSON." } }; }
    const record = gptRecord(json, response.status, latencyMs, body);
    if (!response.ok) throw Object.assign(new Error(`Proxy OpenAI HTTP ${response.status}: ${json?.error?.message || "erreur sans message"}`), { record });
    if (record.model_returned !== MODEL) throw Object.assign(new Error(`Modèle retourné inattendu: ${record.model_returned || "absent"}`), { record });
    return record;
  } catch (error) {
    if (error.record) throw error;
    throw Object.assign(error, { record: {
      timestamp: now(), endpoint: OPENAI_ENDPOINT, status_http: response?.status ?? null,
      latency_ms: round(msSince(start)), model_requested: body.model,
      model_returned: null, usage: null, estimated_cost_usd: null,
      output: "", error: safeError(error)
    } });
  } finally { clearTimeout(timer); }
}

async function createProduct() {
  const source = await fs.readFile(HTML, "utf8");
  const providerCalls = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => {
    if (!/Not implemented: (window\.scrollTo|navigation)/.test(error.message)) {
      providerCalls.push({ kind: "jsdom_error", error: safeError(error) });
    }
  });
  const dom = new JSDOM(source, {
    url: "https://c-concept-dev.github.io/C-Concept-Dev/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.crypto = crypto.webcrypto;
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.alert = () => {};
      window.confirm = () => true;
      window.fetch = async (url, options = {}) => {
        const startedAt = now();
        const start = process.hrtime.bigint();
        const headers = new Headers(options.headers || {});
        headers.set("Origin", ORIGIN);
        let input = null;
        try { input = JSON.parse(options.body || "null"); } catch {}
        try {
          const init = { ...options, headers };
          delete init.signal;
          let nodeController = null;
          if (options.signal) {
            nodeController = new AbortController();
            if (options.signal.aborted) nodeController.abort();
            else options.signal.addEventListener("abort", () => nodeController.abort(), { once: true });
            init.signal = nodeController.signal;
          }
          const response = await fetch(url, init);
          const clone = response.clone();
          let responseBody = null;
          try { responseBody = await clone.json(); } catch {}
          providerCalls.push({
            kind: "decision_provider", endpoint: String(url), started_at: startedAt,
            latency_ms: round(msSince(start)), status_http: response.status,
            request: input, response: responseBody, error: null
          });
          return response;
        } catch (error) {
          providerCalls.push({
            kind: "decision_provider", endpoint: String(url), started_at: startedAt,
            latency_ms: round(msSince(start)), status_http: null,
            request: input, response: null, error: safeError(error)
          });
          throw error;
        }
      };
    }
  });
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  if (typeof dom.window.askDecisionProvider !== "function") throw new Error("Le Decision Provider du HTML n'est pas accessible.");
  if (typeof dom.window.assemblerRapideAdaptatif !== "function") throw new Error("Le moteur Rapide du HTML n'est pas accessible.");
  if (!dom.window.__ARCHITECTE_V10__) throw new Error("Le moteur Architecte du HTML n'est pas accessible.");
  return { dom, window: dom.window, providerCalls, htmlSha256: sha256(source) };
}

function setValue(window, selector, value) {
  const element = window.document.querySelector(selector);
  if (!element) throw new Error(`Champ HTML absent: ${selector}`);
  element.value = value || "";
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function compositeDemand(original, answers) {
  if (!answers.length) return original;
  return original + "\n\nPrécisions apportées pendant le dialogue :\n" +
    answers.map(item => `- ${item.question} — Réponse : ${item.answer}`).join("\n");
}

function clarificationAnswer(testCase, index) {
  return testCase.clarification_answers?.[index]
    || testCase.clarification_answers?.at(-1)
    || "Je ne sais pas ; utilisez des hypothèses raisonnables et signalez-les clairement.";
}

async function decide(product, testCase) {
  const callsBefore = product.providerCalls.length;
  const turns = [];
  let demande = testCase.demande;
  let result = null;
  for (let index = 0; index <= 3; index += 1) {
    result = await product.window.askDecisionProvider({
      demande,
      materiau_present: Boolean(testCase.materiau_present),
      mode_demande: "rapide"
    });
    if (result.decision.etat_demande !== "clarification_necessaire") break;
    if (index >= 3) break;
    const answer = clarificationAnswer(testCase, index);
    turns.push({ question: result.decision.question, answer });
    demande = compositeDemand(testCase.demande, turns);
  }
  const providerCalls = product.providerCalls.slice(callsBefore).filter(call => call.kind === "decision_provider");
  const exhausted = result?.decision?.etat_demande === "clarification_necessaire";
  return {
    result: exhausted ? {
      source: result.source,
      decision: { ...result.decision, etat_demande: "exploitable", route: "architecte", question: null },
      forced_after_max_clarifications: true
    } : result,
    turns,
    demande,
    providerCalls
  };
}

function buildRapid(product, demande, material = "") {
  const start = process.hrtime.bigint();
  setValue(product.window, "#rapide-demande", demande);
  setValue(product.window, "#rapide-texte", material);
  const result = product.window.assemblerRapideAdaptatif();
  if (!result?.prompt) throw new Error("Le moteur Rapide n'a pas produit de prompt.");
  return {
    engine: "rapide",
    latency_ms: round(msSince(start)),
    format: result.format,
    niveau: result.niveau,
    prompt: result.prompt
  };
}

async function buildArchitect(product, demande, material = "") {
  const start = process.hrtime.bigint();
  setValue(product.window, "#arch-demande", demande);
  setValue(product.window, "#arch-materiau", material);
  const api = product.window.__ARCHITECTE_V10__;
  const context = JSON.parse(JSON.stringify(api.contexte()));
  const body = {
    model: MODEL,
    reasoning: { effort: "high" },
    input: api.requete(),
    max_output_tokens: 8000
  };
  let analysisCall;
  try { analysisCall = await postResponses(body); }
  catch (error) { throw Object.assign(error, { stage: "architecte_analyse", call: error.record }); }
  let parsed;
  try {
    const candidates = api.extraireJson(analysisCall.output);
    if (candidates.length !== 1) throw new Error(`${candidates.length} objet(s) JSON valide(s) trouvé(s)`);
    parsed = candidates[0].objet;
  } catch (error) { throw Object.assign(new Error(`Analyse Architecte non exploitable: ${error.message}`), { stage: "architecte_analyse", call: analysisCall }); }
  const validation = Array.from(api.valider(parsed));
  if (validation.length) throw Object.assign(new Error(`Analyse Architecte refusée: ${validation.join(" · ")}`), { stage: "architecte_validation", call: analysisCall, validation });
  if (!api.importer(parsed)) throw Object.assign(new Error("Import Architecte refusé."), { stage: "architecte_import", call: analysisCall });
  const prompt = api.compiler();
  if (!prompt) throw Object.assign(new Error("Compilation Architecte vide."), { stage: "architecte_compilation", call: analysisCall });
  return {
    engine: "architecte",
    latency_ms: round(msSince(start)),
    context,
    analysis: parsed,
    analysis_call: analysisCall,
    validation,
    prompt
  };
}

async function finalAtelier(engine) {
  const body = {
    model: MODEL,
    instructions: engine.engine === "rapide"
      ? "Répondez directement et complètement à la demande suivante."
      : "Répondez directement et complètement au prompt suivant.",
    input: engine.prompt,
    max_output_tokens: 2500
  };
  try { return await postResponses(body); }
  catch (error) { throw Object.assign(error, { stage: "atelier_execution", call: error.record }); }
}

function looksLikeClarification(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 2500) return false;
  const questions = (value.match(/\?/g) || []).length;
  if (!questions || questions > 12) return false;
  const words = value.split(/\s+/).length;
  return words <= 320;
}

async function runPure(testCase) {
  const startedAt = now();
  const start = process.hrtime.bigint();
  const calls = [];
  const turns = [];
  let body = { model: MODEL, input: testCase.demande, max_output_tokens: 2500 };
  for (let index = 0; index <= 3; index += 1) {
    let call;
    try { call = await postResponses(body); }
    catch (error) {
      calls.push(error.record);
      return { started_at: startedAt, completed_at: now(), latency_total_ms: round(msSince(start)), calls, turns, output: "", error: safeError(error) };
    }
    calls.push(call);
    if (!looksLikeClarification(call.output) || index >= 3) {
      return {
        started_at: startedAt, completed_at: now(), latency_total_ms: round(msSince(start)),
        calls, turns, output: call.output, error: null,
        initial_request_exact: testCase.demande,
        clarification_detection: "heuristique documentée"
      };
    }
    const answer = clarificationAnswer(testCase, index);
    turns.push({ question: call.output, answer });
    body = { model: MODEL, previous_response_id: call.response_id, input: answer, max_output_tokens: 2500 };
  }
}

function sumUsage(calls) {
  const valid = calls.filter(call => call?.usage);
  if (!valid.length) return { input_tokens: null, output_tokens: null, total_tokens: null, estimated_cost_usd: null };
  return {
    input_tokens: valid.reduce((sum, call) => sum + (call.usage.input_tokens || 0), 0),
    output_tokens: valid.reduce((sum, call) => sum + (call.usage.output_tokens || 0), 0),
    total_tokens: valid.reduce((sum, call) => sum + (call.usage.total_tokens || 0), 0),
    estimated_cost_usd: round(valid.reduce((sum, call) => sum + (call.estimated_cost_usd || 0), 0), 8)
  };
}

async function runAtelier(testCase) {
  const startedAt = now();
  const start = process.hrtime.bigint();
  const product = await createProduct();
  let decision;
  let engine;
  let finalCall;
  let error = null;
  try {
    decision = await decide(product, testCase);
    engine = decision.result.decision.route === "rapide"
      ? buildRapid(product, decision.demande)
      : await buildArchitect(product, decision.demande);
    finalCall = await finalAtelier(engine);
  } catch (caught) {
    error = { ...safeError(caught), stage: caught.stage || "atelier", call: caught.call || null, validation: caught.validation || null };
  } finally {
    product.dom.window.close();
  }
  const gptCalls = [engine?.analysis_call, finalCall, error?.call].filter((call, index, all) => call && all.indexOf(call) === index);
  const providerCalls = decision?.providerCalls || product.providerCalls.filter(call => call.kind === "decision_provider");
  const providerLatency = providerCalls.reduce((sum, call) => sum + (call.latency_ms || 0), 0);
  return {
    started_at: startedAt,
    completed_at: now(),
    html_sha256: product.htmlSha256,
    latency_total_ms: round(msSince(start)),
    time_to_first_useful_result_ms: finalCall ? round(msSince(start)) : null,
    route_finale: decision?.result?.decision?.route || null,
    moteur_final: engine?.engine || null,
    decision_source: decision?.result?.source || null,
    decision: decision?.result?.decision || null,
    decision_provider_calls: providerCalls,
    decision_provider_latency_ms: round(providerLatency),
    clarifications: decision?.turns || [],
    nombre_reanalyses: decision?.turns?.length || 0,
    engine,
    final_call: finalCall || null,
    output: finalCall?.output || "",
    total_llm_calls: providerCalls.length + gptCalls.length,
    gpt_usage: sumUsage(gptCalls),
    fallback: decision?.result?.source === "groq" || decision?.result?.source === "local-prudent",
    retries: 0,
    error
  };
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main() {
  const options = args();
  if (!options.corpus || !options.output) throw new Error("Arguments requis: --corpus=... --output=...");
  const corpusPath = path.resolve(HERE, String(options.corpus));
  const outputPath = path.resolve(HERE, String(options.output));
  const checkpointPath = outputPath.replace(/\.json$/i, ".checkpoint.json");
  const corpus = JSON.parse(await fs.readFile(corpusPath, "utf8"));
  const htmlSource = await fs.readFile(HTML, "utf8");
  let report = {
    protocol: {
      lot: "10G.3B.2", corpus: path.basename(corpusPath), corpus_sha256: sha256(JSON.stringify(corpus)),
      corpus_frozen_at: corpus.frozen_at, started_at: now(), completed_at: null,
      product_html: path.relative(ROOT, HTML), product_html_sha256: sha256(htmlSource),
      openai_proxy: PROXY, openai_endpoint: OPENAI_ENDPOINT, model: MODEL,
      model_pricing_usd_per_million_tokens: { input: GPT_INPUT_USD_PER_M, output: GPT_OUTPUT_USD_PER_M, as_of: "2026-08-28" },
      initial_request_rule: "La demande initiale brute est strictement identique dans les deux branches.",
      retries: "Aucun retry sémantique.",
      pure_branch_prompting: "Aucune instruction spéciale; input initial égal à demande.",
      product_changes: "Aucune; instrumentation externe additive."
    },
    cases: []
  };
  try {
    const previous = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
    if (previous.protocol?.corpus_sha256 === report.protocol.corpus_sha256) report = previous;
  } catch {}
  const done = new Set(report.cases.map(item => item.id));
  for (const testCase of corpus.cases) {
    if (done.has(testCase.id)) continue;
    process.stdout.write(`[${testCase.id}] Atelier...\n`);
    const atelier = await runAtelier(testCase);
    await writeJson(path.join(HERE, "raw", path.basename(outputPath, ".json"), "atelier", `${testCase.id}.json`), atelier);
    process.stdout.write(`[${testCase.id}] GPT-5.6 Sol pur...\n`);
    const pure = await runPure(testCase);
    await writeJson(path.join(HERE, "raw", path.basename(outputPath, ".json"), "gpt56sol", `${testCase.id}.json`), pure);
    report.cases.push({
      id: testCase.id, category: testCase.category, domain: testCase.domain,
      demande: testCase.demande, materiau_present: testCase.materiau_present,
      expected_atelier: testCase.expected_atelier, atelier, gpt56sol_pur: pure,
      evaluation_humaine: { score_valeur_ajoutee: null, statut: "à valider humainement" }
    });
    await writeJson(checkpointPath, report);
    process.stdout.write(`[${testCase.id}] terminé — Atelier ${atelier.error ? "ERREUR" : atelier.route_finale}, pur ${pure.error ? "ERREUR" : "OK"}.\n`);
  }
  report.protocol.completed_at = now();
  await writeJson(outputPath, report);
  await fs.rm(checkpointPath, { force: true });
  process.stdout.write(`Terminé: ${outputPath}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
