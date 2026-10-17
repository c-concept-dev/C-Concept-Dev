"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/pricing.js
 * AUTORITE DE TARIFICATION (unique, versionnee) : config/llm-pricing.json. Aucun tarif n'est code ailleurs.
 *   resolve(model, atIso) -> entree tarifaire applicable (prefixe de modele accepte, derniere effectiveFrom <= at) ou null
 *   costOf(usage, entry)  -> { inputUsd, outputUsd, cacheWriteUsd, cacheReadUsd, totalUsd } (par MILLION de tokens)
 *   snapshot()            -> { schema, version, currency, source, verifiedAt, hash, models } (persiste par run au premier appel)
 * Formule (contrat fournisseur : `input_tokens` = tokens d'entree NON caches ; les tokens caches sont dans
 * cache_creation_input_tokens / cache_read_input_tokens, ventilation 5m/1h dans usage.cache_creation) :
 *   total = input*in + output*out + write5m*w5 + write1h*w1h + read*rd, chaque terme en tokens/1e6 * USD/M.
 * Un modele inconnu => null (jamais un cout invente).
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const M = 1e6;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const round6 = (v) => Math.round(v * 1e6) / 1e6;

function loadPricing(file) {
  const raw = fs.readFileSync(file, "utf8"); const j = JSON.parse(raw);
  if (!j || j.schema !== "EvidenceForge.LlmPricing" || !Array.isArray(j.models) || !j.version) throw Object.assign(new Error("PRICING_INVALID: " + file), { code: "PRICING_INVALID" });
  j.models.forEach(function (m, i) { ["inputPerMillion", "outputPerMillion", "cacheWrite5mPerMillion", "cacheWrite1hPerMillion", "cacheReadPerMillion"].forEach((k) => { if (typeof m[k] !== "number" || !(m[k] >= 0)) throw Object.assign(new Error("PRICING_INVALID: models[" + i + "]." + k), { code: "PRICING_INVALID" }); }); if (typeof m.model !== "string" || !m.model) throw Object.assign(new Error("PRICING_INVALID: models[" + i + "].model"), { code: "PRICING_INVALID" }); });
  return { doc: j, hash: sha(raw) };
}

/** Le snapshot est CANONIQUE (cles triees) : deux fichiers de meme contenu tarifaire ont le meme hash. */
function canonicalSnapshot(doc) {
  const models = doc.models.map((m) => ({ model: m.model, effectiveFrom: m.effectiveFrom || null, inputPerMillion: m.inputPerMillion, outputPerMillion: m.outputPerMillion, cacheWrite5mPerMillion: m.cacheWrite5mPerMillion, cacheWrite1hPerMillion: m.cacheWrite1hPerMillion, cacheReadPerMillion: m.cacheReadPerMillion }))
    .sort((a, b) => (a.model + "|" + a.effectiveFrom).localeCompare(b.model + "|" + b.effectiveFrom));
  const snap = { schema: "EvidenceForge.PricingSnapshot", version: doc.version, currency: doc.currency || "USD", source: doc.source || null, verifiedAt: doc.verifiedAt || null, models };
  snap.hash = sha(JSON.stringify(models) + "|" + snap.version + "|" + snap.currency);
  return snap;
}

function createPricing(input) {
  let snap;
  if (input && input.snapshot) { snap = input.snapshot; if (!snap || !Array.isArray(snap.models) || !snap.hash) throw Object.assign(new Error("PRICING_SNAPSHOT_INVALID"), { code: "PRICING_SNAPSHOT_INVALID" }); }
  else { const file = (input && input.file) || path.join(__dirname, "..", "config", "llm-pricing.json"); snap = canonicalSnapshot(loadPricing(file).doc); }
  function resolve(model, atIso) {
    if (typeof model !== "string" || !model) return null;
    const at = atIso ? String(atIso) : "9999-12-31";
    const cands = snap.models.filter((m) => (model === m.model || model.indexOf(m.model) === 0) && (!m.effectiveFrom || m.effectiveFrom <= at));
    if (!cands.length) return null;
    /* correspondance la plus longue d'abord (ex. un id date derive du modele), puis la plus recente */
    cands.sort((a, b) => (b.model.length - a.model.length) || String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || "")));
    return cands[0];
  }
  function normalizeUsage(u) {
    u = u || {}; const cc = u.cache_creation || {};
    const w5 = num(cc.ephemeral_5m_input_tokens), w1h = num(cc.ephemeral_1h_input_tokens);
    const wTotal = num(u.cache_creation_input_tokens);
    /* ventilation absente => tout compte comme ecriture 5 min (hypothese conservatrice documentee : le tarif 5 min est le plus bas) */
    const write5m = (w5 + w1h) > 0 ? w5 : wTotal, write1h = (w5 + w1h) > 0 ? w1h : 0;
    return { input: num(u.input_tokens), output: num(u.output_tokens), cacheWrite5m: write5m, cacheWrite1h: write1h, cacheRead: num(u.cache_read_input_tokens) };
  }
  function costOf(usage, entry) {
    if (!entry) return null; const n = normalizeUsage(usage);
    const inputUsd = n.input / M * entry.inputPerMillion, outputUsd = n.output / M * entry.outputPerMillion;
    const cacheWriteUsd = n.cacheWrite5m / M * entry.cacheWrite5mPerMillion + n.cacheWrite1h / M * entry.cacheWrite1hPerMillion, cacheReadUsd = n.cacheRead / M * entry.cacheReadPerMillion;
    return { inputUsd: round6(inputUsd), outputUsd: round6(outputUsd), cacheWriteUsd: round6(cacheWriteUsd), cacheReadUsd: round6(cacheReadUsd), totalUsd: round6(inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd) };
  }
  return Object.freeze({ resolve, costOf, normalizeUsage, snapshot: () => snap, version: snap.version, hash: snap.hash, currency: snap.currency });
}

module.exports = { createPricing, loadPricing, canonicalSnapshot };
