"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/llm-transport.js
 * TRANSPORT LLM pour la frontiere de confiance MONO-10 v0.19 (llmCapability.kind = OPERATOR_TRANSPORT).
 * Contrat gele (tools/reference-llm-transport.js) : probe(intent) -> { httpStatus, text, requestId, credentialProbeSkipped, costUsd, transportKind }.
 * Chemin reel : POST {LLM_WORKER_BASE_URL}/v1/messages, "Authorization: Bearer <EVIDENCEFORGE_WORKER_API_KEY>".
 * AUCUN secret journalise ni embarque : seule la PRESENCE de l'identifiant est attestee (credentialProbeSkipped).
 * Le journal (sans secret) va dans le run courant, designe par EVIDENCEFORGE_MONOLITH_LLM_LOG (pose par le pipeline).
 * v1.0.5 — ce module est designe par la frontiere GELEE MONO-10 (transportModuleRef), donc rien ne lui est injecte : il retrouve le
 * ledger de cout du run par le registre (cle = intent.runId), verifie le budget AVANT la sonde et renseigne costUsd (prevu par le contrat).
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const CL = require("./cost-ledger.js"); const PD = require("./provider-diagnostic.js");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

async function probe(intent) {
  intent = intent || {};
  const base = process.env.LLM_WORKER_BASE_URL, key = process.env.EVIDENCEFORGE_WORKER_API_KEY;
  const localRequestId = "efm-probe-" + crypto.randomBytes(8).toString("hex");
  if (!base) throw Object.assign(new Error("PROVIDER_NOT_CONFIGURED: LLM_WORKER_BASE_URL absent — fail closed."), { code: "PROVIDER_NOT_CONFIGURED" });
  const cs = PD.credentialsStatus(process.env); if (key && !cs.usable) throw Object.assign(new Error(cs.code + ": configuration inutilisable — fail closed."), { code: cs.code, userMessage: cs.userMessage });   /* v1.0.5 : placeholder / URL invalide */
  if (!key) return { httpStatus: 0, text: "", requestId: localRequestId, credentialProbeSkipped: true, costUsd: null, transportKind: "DELEGATED_WORKER_ANTHROPIC" };
  const ledger = CL.lookup(intent.runId); const budget = ledger && ledger.budget ? ledger.budget : null;
  if (budget) budget.assertAllowed({ model: intent.modelId, purpose: "probe", where: "probe" });   /* v1.0.5 : AVANT la sonde (appel reel) */
  const body = JSON.stringify({ model: intent.modelId, max_tokens: intent.maxTokens || 64, messages: [{ role: "user", content: intent.prompt }] });
  const startedAt = new Date().toISOString();
  let res, raw; const timeoutMs = Number(process.env.EVIDENCEFORGE_LLM_PROBE_TIMEOUT_MS || (intent && intent.timeoutMs) || 60000);
  const ac = new AbortController(); let to = false; const timer = setTimeout(() => { to = true; ac.abort(); }, timeoutMs);   /* v1.0.2 : delai borne de la sonde (minuterie referencee) */
  try { res = await fetch(base.replace(/\/$/, "") + "/v1/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key, "x-evidenceforge-request-id": localRequestId }, body, signal: ac.signal }); raw = await res.text(); }
  catch (e) { const code = PD.classifyFetchError(e, to); throw Object.assign(new Error(code + ": " + String(e.message).slice(0, 200)), { code, userMessage: PD.USER[code] }); }   /* v1.0.5 : DNS / connexion / TLS / URL / delai distingues */
  finally { clearTimeout(timer); }
  let text = "", providerRequestId = null, usage = null, observedModel = null;
  try { const p = JSON.parse(raw); providerRequestId = p.id || null; usage = p.usage || null; observedModel = p.model || null; text = Array.isArray(p.content) ? p.content.filter((c) => c.type === "text").map((c) => c.text).join("") : ""; } catch (e) { text = raw; }
  let costUsd = null;
  if (ledger && res.status === 200) { try { const line = ledger.record({ kind: "PROBE", purpose: "probe", model: observedModel || intent.modelId, usage, providerRequestId, localRequestId, httpStatus: 200 }); costUsd = line.cost ? line.cost.totalUsd : null; } catch (e) { costUsd = null; } }
  const logPath = process.env.EVIDENCEFORGE_MONOLITH_LLM_LOG;
  if (logPath) {
    const rec = { kind: "LLM_PROBE", startedAt, completedAt: new Date().toISOString(), localRequestId, providerRequestId, providerId: intent.providerId, modelId: intent.modelId, workerBindingId: intent.workerBindingId,
      runId: intent.runId || null, httpStatus: res.status, requestBodySha256: sha(body), responseSha256: sha(raw), assistantTextSha256: sha(text), usage, endpointHost: new URL(base).host };
    fs.mkdirSync(path.dirname(logPath), { recursive: true }); fs.appendFileSync(logPath, JSON.stringify(rec) + "\n");
  }
  return { httpStatus: res.status, text, requestId: providerRequestId || localRequestId, credentialProbeSkipped: false, costUsd, transportKind: "DELEGATED_WORKER_ANTHROPIC", providerRequestId, localRequestId };
}
module.exports = { probe };
