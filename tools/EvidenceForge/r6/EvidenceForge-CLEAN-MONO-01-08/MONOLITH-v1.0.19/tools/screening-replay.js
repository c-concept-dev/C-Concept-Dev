#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0.5 — tools/screening-replay.js <runDir> [--json]
 * REJEU EN LECTURE SEULE du screening et de la revue de portefeuille d'un run reel : les reponses de PASSE 1 conservees dans llm-cache sont
 * re-validees (a) par le validateur ANTERIEUR (litteral, titre+resume) et (b) par le validateur COURANT (SCREENING-EVIDENCE-NORMALIZATION-v1,
 * champs configures, reprise ciblee), puis le cout est recompose : BASELINE (ledger reel) vs NORMALIZATION ONLY vs NORMALIZATION + TARGETED RETRY
 * vs FULL OPTIMIZER (+ bornes de sortie, ESTIMATE). Aucun appel fournisseur ; rien n'est ecrit dans le dossier du run. Les estimations de
 * tokens des reprises ciblees utilisent le ratio caracteres/token mesure sur les appels reels du run ; les bornes de sortie sont estimees par
 * proxy caracteres sur les reponses reelles (ESTIMATE — NOT GUARANTEE). Faux accepts : chaque evidence acceptee par normalisation est
 * re-verifiee comme sous-chaine litterale du champ rendu (doit etre 0).
 */
const fs = require("fs"), path = require("path");
const SE = require("../lib/screening-evidence.js"), CPR = require("../lib/corpus-portfolio-review.js"), SN = require("../lib/screening-normalization.js");
const { createPricing } = require("../lib/pricing.js"); const P = require("../lib/paths.js");
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
function legacyEvidenceOk(src, ev) { const hay = src ? ((src.titre || "") + "\n" + (src.resume || "")) : ""; return isStr(ev) && hay.indexOf(ev) !== -1; }
function parseJson(t) { t = String(t || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, ""); const a = t.indexOf("{"), b = t.lastIndexOf("}"); try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }

function replay(runDir, opts) {
  opts = opts || {}; const J = (f) => JSON.parse(fs.readFileSync(path.join(runDir, f), "utf8")); const L = (f) => fs.readFileSync(path.join(runDir, f), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const calls = L("llm-calls.jsonl").filter((c) => c.kind === "LLM_CALL"), led = fs.existsSync(path.join(runDir, "cost-ledger.jsonl")) ? L("cost-ledger.jsonl") : []; const ledCost = new Map(led.map((l) => [l.providerRequestId, (l.cost && l.cost.totalUsd) || 0]));
  const pricing = createPricing(); const sources = J("sources-enriched.json").enriched; const byId = new Map(sources.map((s) => [s.sourceId, s]));
  const dims = J("disciplines.json").runContract.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.discipline, label: d.discipline, definition: d.justification }));
  const mission = (fs.existsSync(path.join(runDir, "mission.json")) && J("mission.json").question) || J("state.json").mission.question; const scfg = Object.assign({}, P.CONFIG.screening, opts.screening || {}), pcfg = Object.assign({}, CPR.DEFAULTS, P.CONFIG.portfolio || {}, opts.portfolio || {});
  const cache = (h, k) => { const f = path.join(runDir, "llm-cache", h + "." + k + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
  const text = (c) => { const r = cache(c.responseSha256, "response"); return r ? (r.content || []).map((b) => b.text || "").join("") : null; };
  const prompt = (c) => { const r = cache(c.promptSha256, "request"); return r ? r.prompt : null; };
  const model = (calls.find((c) => /screening|portfolio/.test(c.purpose)) || {}).modelId; const entry = pricing.resolve(model, null); const perIn = entry ? entry.inputPerMillion / 1e6 : 0, perOut = entry ? entry.outputPerMillion / 1e6 : 0;
  const costByReq = { get: (id) => ledCost.has(id) ? ledCost.get(id) : null }; const costOf = (c) => { const v = costByReq.get(c.providerRequestId); if (v !== null) return v; const r = pricing.costOf(c.usage, pricing.resolve(c.modelId, c.completedAt)); return r ? r.totalUsd : 0; };
  /* ratio caracteres / token d'entree mesure sur les appels reels */
  const p1 = calls.filter((c) => (c.purpose === "screening" || c.purpose === "portfolio review") && c.usage); const charsPerTok = p1.reduce((a, c) => a + (prompt(c) || "").length, 0) / Math.max(1, p1.reduce((a, c) => a + c.usage.input_tokens, 0));
  const out = { runId: J("state.json").runId, model, charsPerInputToken: +charsPerTok.toFixed(2), rules: { evidence: SN.RULE_ID, fields: scfg.evidenceFields, retry: scfg.retryStrategy }, families: {}, items: [], falseAccepts: 0, normalizedAccepted: 0, stillRejected: [], decisionDiffs: [] };
  const fam = (name) => (out.families[name] = out.families[name] || { firstPass: { calls: 0, inTok: 0, outTok: 0, usd: 0 }, retriesReal: { calls: 0, inTok: 0, outTok: 0, usd: 0 }, retriesAfterNorm: { calls: 0, usd: 0, itemsInvalid: 0, batches: [] }, retriesTargeted: { calls: 0, inTokEst: 0, outTokEst: 0, usdEst: 0 }, outputBoundedRatio: null, boundedChars: 0, chars: 0 });
  /* parcours des lots : passe 1 + reprises reelles qui suivent (meme famille) */
  for (let i = 0; i < calls.length; i++) { const c = calls[i]; if (c.purpose !== "screening" && c.purpose !== "portfolio review") continue; const isScreen = c.purpose === "screening"; const F = fam(isScreen ? "screening" : "portfolio");
    F.firstPass.calls++; F.firstPass.inTok += c.usage.input_tokens; F.firstPass.outTok += c.usage.output_tokens; F.firstPass.usd += costOf(c);
    const pr = prompt(c), tx = text(c); if (!pr || !tx) continue; const ids = pr.split("\n").filter((l) => l.startsWith("{\"sourceId\"")).map((l) => { try { return JSON.parse(l).sourceId; } catch (e) { return null; } }).filter(Boolean); const batch = ids.map((id) => Object.assign({}, byId.get(id), isScreen ? {} : { justification: null }));
    const d = parseJson(tx); const items = d && (d.decisions || d.assessments) || []; F.chars += JSON.stringify(d || {}).length;
    const bounded = isScreen ? { decisions: items.map((x) => ({ sourceId: x.sourceId, decision: x.decision, justification: String(x.justification || "").slice(0, scfg.outputBounds.justificationMaxChars), evidence: (x.evidence || []).slice(0, scfg.outputBounds.evidenceMaxFragments).map((e) => String(e).slice(0, scfg.outputBounds.evidenceMaxChars)), confiance: x.confiance })) }
      : { assessments: items.map((x) => ({ sourceId: x.sourceId, domainRelevance: x.domainRelevance, methodologicalRelevance: x.methodologicalRelevance, methodologicalInterest: String(x.methodologicalInterest || "").slice(0, pcfg.outputBounds.interestMaxChars), anglesConcernes: x.anglesConcernes, evidence: (x.evidence || []).slice(0, pcfg.outputBounds.evidenceMaxFragments).map((e) => String(e).slice(0, pcfg.outputBounds.evidenceMaxChars)) })) };
    F.boundedChars += JSON.stringify(bounded).length;
    /* validateur courant */
    const v = isScreen ? SE.validateBatch(tx, batch, scfg) : CPR.validateBatch(tx, batch, dims, pcfg); const invalidIds = Object.keys(v.perItem || {}); const batchErr = (v.batchErrors || []).length > 0;
    /* validateur anterieur : items refuses (evidence litterale titre/resume, enumerations) — reconstitue depuis la reponse */
    const legacyInvalid = new Set(); items.forEach((x, k) => { const src = byId.get(x.sourceId); if (!src) { legacyInvalid.add("?" + k); return; } (x.evidence || []).forEach((e) => { if (!legacyEvidenceOk(src, e)) legacyInvalid.add(x.sourceId); }); if (isScreen && ["inclus", "exclu"].indexOf(x.decision) === -1) legacyInvalid.add(x.sourceId); if (!isScreen && (["haute", "moyenne", "basse"].indexOf(x.domainRelevance) === -1 || ["haute", "moyenne", "basse"].indexOf(x.methodologicalRelevance) === -1)) legacyInvalid.add(x.sourceId); });
    /* faux accepts : chaque evidence acceptee par normalisation doit etre litteralement dans le champ rendu */
    (v.normalizations || []).forEach((n) => { out.normalizedAccepted++; const src = byId.get(n.sourceId); if (!src || String(src[n.field] || "").indexOf(n.literal) === -1) out.falseAccepts++; });
    invalidIds.forEach((id) => out.stillRejected.push({ family: isScreen ? "screening" : "portfolio", sourceId: id, errors: v.perItem[id] }));
    /* reprises reelles suivant ce lot */
    const real = []; for (let j = i + 1; j < calls.length && /informed-retry/.test(calls[j].purpose || "") && calls[j].purpose.startsWith(isScreen ? "screening" : "portfolio"); j++) real.push(calls[j]);
    real.forEach((r) => { F.retriesReal.calls++; F.retriesReal.inTok += r.usage.input_tokens; F.retriesReal.outTok += r.usage.output_tokens; F.retriesReal.usd += costOf(r); });
    const rec = { family: isScreen ? "screening" : "portfolio", batch: ids.length, legacyInvalidItems: legacyInvalid.size, realRetries: real.length, currentInvalidItems: invalidIds.length, batchError: batchErr, normalizations: (v.normalizations || []).length, retryAvoided: real.length > 0 && invalidIds.length === 0 && !batchErr };
    if (real.length && (invalidIds.length || batchErr)) { F.retriesAfterNorm.calls += real.length; F.retriesAfterNorm.usd += real.reduce((a, r) => a + costOf(r), 0); F.retriesAfterNorm.itemsInvalid += invalidIds.length; F.retriesAfterNorm.batches.push(rec);
      /* reprise ciblee estimee : prompt reel construit avec les seuls items invalides ; sortie proportionnelle */
      const pending = batch.filter((s) => invalidIds.indexOf(s.sourceId) !== -1); const errorsById = {}; invalidIds.forEach((id) => { errorsById[id] = v.perItem[id]; }); const previousById = {}; items.forEach((x) => { if (invalidIds.indexOf(x.sourceId) !== -1) previousById[x.sourceId] = x; });
      const tp = batchErr ? pr : (isScreen ? SE.targetedRetryPrompt(mission, dims, pending, errorsById, previousById, 2, scfg) : CPR.targetedRetryPrompt(mission, dims, pending, errorsById, previousById, 2, pcfg));
      const inTok = Math.round(tp.length / charsPerTok), outTok = Math.round(c.usage.output_tokens * (batchErr ? 1 : pending.length / Math.max(1, ids.length))); F.retriesTargeted.calls++; F.retriesTargeted.inTokEst += inTok; F.retriesTargeted.outTokEst += outTok; F.retriesTargeted.usdEst += inTok * perIn + outTok * perOut; }
    /* decisions : sous reprise ciblee, les items valides en passe 1 sont immuables ; les reprises reelles ont pu les changer */
    if (real.length && items.length) { const last = parseJson(text(real[real.length - 1])); const lastItems = last && (last.decisions || last.assessments) || []; items.forEach((x) => { if (invalidIds.indexOf(x.sourceId) !== -1) return; const y = lastItems.find((z) => z.sourceId === x.sourceId); if (!y) return; const a = isScreen ? x.decision : x.domainRelevance + "/" + x.methodologicalRelevance, b = isScreen ? y.decision : y.domainRelevance + "/" + y.methodologicalRelevance; if (a !== b) out.decisionDiffs.push({ family: rec.family, sourceId: x.sourceId, pass1Kept: a, realRetryGave: b }); }); }
    out.items.push(rec);
  }
  Object.keys(out.families).forEach((k) => { const F = out.families[k]; F.outputBoundedRatio = F.chars ? +(F.boundedChars / F.chars).toFixed(3) : null; });
  /* tableau comparatif */
  const sum = (sel) => Object.keys(out.families).reduce((a, k) => a + sel(out.families[k]), 0);
  const base = sum((F) => F.firstPass.usd + F.retriesReal.usd), normOnly = sum((F) => F.firstPass.usd + F.retriesAfterNorm.usd), normTargeted = sum((F) => F.firstPass.usd + F.retriesTargeted.usdEst);
  const outUsd = sum((F) => (F.firstPass.outTok * perOut) * (1 - (F.outputBoundedRatio || 1))) + sum((F) => (F.retriesTargeted.outTokEst * perOut) * (1 - (F.outputBoundedRatio || 1)));
  out.table = { BASELINE: { usd: +base.toFixed(4), calls: sum((F) => F.firstPass.calls + F.retriesReal.calls), retries: sum((F) => F.retriesReal.calls) },
    NORMALIZATION_ONLY: { usd: +normOnly.toFixed(4), calls: sum((F) => F.firstPass.calls + F.retriesAfterNorm.calls), retries: sum((F) => F.retriesAfterNorm.calls), retriesAvoided: sum((F) => F.retriesReal.calls - F.retriesAfterNorm.calls), savedUsd: +(base - normOnly).toFixed(4) },
    NORMALIZATION_PLUS_TARGETED_RETRY: { usd: +normTargeted.toFixed(4), calls: sum((F) => F.firstPass.calls + F.retriesTargeted.calls), retries: sum((F) => F.retriesTargeted.calls), savedUsd: +(base - normTargeted).toFixed(4), estimate: "tokens des reprises ciblees estimes (ratio caracteres/token mesure sur le run)" },
    FULL_OPTIMIZER: { usd: +(normTargeted - outUsd).toFixed(4), savedUsd: +(base - normTargeted + outUsd).toFixed(4), outputBoundsSavedUsd: +outUsd.toFixed(4), estimate: "ESTIMATE — NOT GUARANTEE : bornes de sortie estimees par proxy caracteres sur les reponses reelles ; a mesurer en reel" } };
  out.inputTokensAvoided = sum((F) => F.retriesReal.inTok - F.retriesTargeted.inTokEst); out.outputTokensAvoided = sum((F) => F.retriesReal.outTok - F.retriesTargeted.outTokEst);
  return out;
}
if (require.main === module) { const dir = process.argv[2]; if (!dir) { console.error("usage: screening-replay.js <runDir> [--json]"); process.exit(2); } const r = replay(path.resolve(dir)); if (process.argv.indexOf("--json") !== -1) console.log(JSON.stringify(r, null, 1)); else { console.log(JSON.stringify(r.table, null, 1)); console.log("faux accepts", r.falseAccepts, "/ normalisations acceptees", r.normalizedAccepted, "; items encore refuses", r.stillRejected.length, "; decisions differentes (immuabilite passe 1)", r.decisionDiffs.length); } }
module.exports = { replay };
