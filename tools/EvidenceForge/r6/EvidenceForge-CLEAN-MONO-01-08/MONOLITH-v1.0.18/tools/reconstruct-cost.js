#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0.5 — tools/reconstruct-cost.js <runDir> [--json]
 * RECONSTRUCTION EN LECTURE SEULE du cout d'un run ANTERIEUR a v1.0.5 (sans cost-ledger.jsonl) a partir de son journal
 * llm-calls.jsonl (usage fournisseur reel, modele observe) et de l'autorite de tarification COURANTE (config/llm-pricing.json).
 * N'ecrit RIEN dans le dossier du run (les runs reels sont des preuves). Limite declaree : les appels des kits EF-01B/EF-01C1
 * (resolveur, planificateur) n'ont pas d'usage journalise avant v1.0.5 : ils sont comptes en nombre (kitRealCalls) mais pas en cout.
 */
const fs = require("fs"), path = require("path");
const { createPricing } = require("../lib/pricing.js"); const CL = require("../lib/cost-ledger.js");
function reconstruct(runDir) {
  const p = path.join(runDir, "llm-calls.jsonl"); if (!fs.existsSync(p)) throw new Error("llm-calls.jsonl absent : " + runDir);
  const pricing = createPricing(); const state = fs.existsSync(path.join(runDir, "state.json")) ? JSON.parse(fs.readFileSync(path.join(runDir, "state.json"), "utf8")) : null;
  const stages = (state && state.stages) || {}; const stageAt = (t) => { let s = null; Object.keys(stages).forEach((k) => { const v = stages[k]; if (v.startedAt && t >= v.startedAt && (!v.completedAt || t <= v.completedAt)) s = k; }); return s; };
  const entries = []; let seq = 0;
  fs.readFileSync(p, "utf8").split("\n").filter(Boolean).forEach(function (l) { let e; try { e = JSON.parse(l); } catch (x) { return; }
    if (e.kind !== "LLM_CALL" && e.kind !== "LLM_PROBE" && e.kind !== "LLM_REUSE") return; const at = e.completedAt || e.startedAt || e.reusedAt || null;
    const kind = e.kind === "LLM_REUSE" ? "REUSE" : (e.kind === "LLM_PROBE" ? "PROBE" : "REAL_CALL"); const entry = pricing.resolve(e.modelId, at); const cost = kind === "REUSE" ? { inputUsd: 0, outputUsd: 0, cacheWriteUsd: 0, cacheReadUsd: 0, totalUsd: 0 } : pricing.costOf(e.usage, entry);
    entries.push({ seq: ++seq, at, stage: stageAt(at), kind, purpose: e.purpose || null, model: e.modelId || null, usage: kind === "REUSE" ? null : pricing.normalizeUsage(e.usage), cost, priced: kind === "REUSE" ? true : !!cost, candidateRef: null }); });
  const totals = CL.totalsOf(entries, { currency: pricing.currency, pricingVersion: pricing.version, pricingSnapshotHash: pricing.hash });
  return { schema: "EvidenceForge.CostReconstruction", runId: state ? state.runId : path.basename(runDir), status: state ? state.status : null, stage: state ? state.stage : null, model: state && state.provider ? state.provider.model : null, pricingVersion: pricing.version, pricingSnapshotHash: pricing.hash, readOnly: true,
    limits: ["appels des kits EF-01B/EF-01C1 sans usage journalise avant v1.0.5 : non valorises (kitRealCalls = " + ((state && state.counters && state.counters.kitRealCalls) || 0) + ")", "etape attribuee par fenetre temporelle des etapes (state.stages), pas par le ledger"], totals, generatedAt: new Date().toISOString() };
}
if (require.main === module) {
  const dir = process.argv[2]; if (!dir) { console.error("usage: node tools/reconstruct-cost.js <runDir> [--json]"); process.exit(2); }
  const r = reconstruct(path.resolve(dir)); if (process.argv.indexOf("--json") !== -1) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  const t = r.totals; console.log(r.runId + " · " + r.status + " · " + r.stage + " · modele " + r.model + " · tarif " + r.pricingVersion);
  console.log("  appels reels " + t.calls.real + " (dont sondes " + t.calls.probe + ") · reuse " + t.calls.reuse + " · non tarifes " + t.calls.unpriced);
  console.log("  tokens entree " + t.tokens.input + " · sortie " + t.tokens.output + " · cache ecriture " + (t.tokens.cacheWrite5m + t.tokens.cacheWrite1h) + " · cache lecture " + t.tokens.cacheRead);
  console.log("  COUT RECONSTRUIT : " + t.totalUsd.toFixed(2) + " USD (entree " + t.inputUsd.toFixed(2) + " · sortie " + t.outputUsd.toFixed(2) + " · cache " + (t.cacheWriteUsd + t.cacheReadUsd).toFixed(2) + ")");
  Object.keys(t.byStage).forEach((s) => console.log("    " + s + " : " + t.byStage[s].totalUsd.toFixed(2) + " USD · " + t.byStage[s].real + " appel(s)"));
  Object.keys(t.byPurpose).sort((a, b) => t.byPurpose[b].totalUsd - t.byPurpose[a].totalUsd).slice(0, 8).forEach((k) => console.log("    [" + k + "] " + t.byPurpose[k].totalUsd.toFixed(2) + " USD · " + t.byPurpose[k].real + " appel(s)"));
  r.limits.forEach((l) => console.log("  limite : " + l));
}
module.exports = { reconstruct };
