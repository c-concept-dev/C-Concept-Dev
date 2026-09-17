"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/llm-transport.js
 * TRANSPORT LLM pour la frontiere de confiance MONO-10 v0.19 (llmCapability.kind = OPERATOR_TRANSPORT).
 * Contrat gele (tools/reference-llm-transport.js) : probe(intent) -> { httpStatus, text, requestId, credentialProbeSkipped, costUsd, transportKind }.
 * Chemin reel : POST {LLM_WORKER_BASE_URL}/v1/messages, "Authorization: Bearer <EVIDENCEFORGE_WORKER_API_KEY>".
 * AUCUN secret journalise ni embarque : seule la PRESENCE de l'identifiant est attestee (credentialProbeSkipped).
 * Le journal (sans secret) va dans le run courant, designe par EVIDENCEFORGE_MONOLITH_LLM_LOG (pose par le pipeline).
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

async function probe(intent) {
  intent = intent || {};
  const base = process.env.LLM_WORKER_BASE_URL, key = process.env.EVIDENCEFORGE_WORKER_API_KEY;
  const localRequestId = "efm-probe-" + crypto.randomBytes(8).toString("hex");
  if (!base) throw Object.assign(new Error("PROVIDER_NOT_CONFIGURED: LLM_WORKER_BASE_URL absent — fail closed."), { code: "PROVIDER_NOT_CONFIGURED" });
  if (!key) return { httpStatus: 0, text: "", requestId: localRequestId, credentialProbeSkipped: true, costUsd: null, transportKind: "DELEGATED_WORKER_ANTHROPIC" };
  const body = JSON.stringify({ model: intent.modelId, max_tokens: intent.maxTokens || 64, messages: [{ role: "user", content: intent.prompt }] });
  const startedAt = new Date().toISOString();
  let res, raw; const timeoutMs = Number(process.env.EVIDENCEFORGE_LLM_PROBE_TIMEOUT_MS || (intent && intent.timeoutMs) || 60000);
  const ac = new AbortController(); let to = false; const timer = setTimeout(() => { to = true; ac.abort(); }, timeoutMs);   /* v1.0.2 : delai borne de la sonde (minuterie referencee) */
  try { res = await fetch(base.replace(/\/$/, "") + "/v1/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key, "x-evidenceforge-request-id": localRequestId }, body, signal: ac.signal }); raw = await res.text(); }
  catch (e) { throw Object.assign(new Error((to ? "PROVIDER_TIMEOUT" : "NETWORK_UNAVAILABLE") + ": " + e.message), { code: to ? "PROVIDER_TIMEOUT" : "NETWORK_UNAVAILABLE", userMessage: to ? "La sonde du fournisseur d'analyse n'a pas répondu dans le délai imparti." : "Réseau indisponible pendant la sonde du fournisseur d'analyse." }); }
  finally { clearTimeout(timer); }
  let text = "", providerRequestId = null, usage = null;
  try { const p = JSON.parse(raw); providerRequestId = p.id || null; usage = p.usage || null; text = Array.isArray(p.content) ? p.content.filter((c) => c.type === "text").map((c) => c.text).join("") : ""; } catch (e) { text = raw; }
  const logPath = process.env.EVIDENCEFORGE_MONOLITH_LLM_LOG;
  if (logPath) {
    const rec = { kind: "LLM_PROBE", startedAt, completedAt: new Date().toISOString(), localRequestId, providerRequestId, providerId: intent.providerId, modelId: intent.modelId, workerBindingId: intent.workerBindingId,
      runId: intent.runId || null, httpStatus: res.status, requestBodySha256: sha(body), responseSha256: sha(raw), assistantTextSha256: sha(text), usage, endpointHost: new URL(base).host };
    fs.mkdirSync(path.dirname(logPath), { recursive: true }); fs.appendFileSync(logPath, JSON.stringify(rec) + "\n");
  }
  return { httpStatus: res.status, text, requestId: providerRequestId || localRequestId, credentialProbeSkipped: false, costUsd: null, transportKind: "DELEGATED_WORKER_ANTHROPIC", providerRequestId, localRequestId };
}
module.exports = { probe };
