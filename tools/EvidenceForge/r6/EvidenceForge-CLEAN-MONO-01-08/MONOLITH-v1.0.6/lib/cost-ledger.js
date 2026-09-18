"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/cost-ledger.js
 * LEDGER DE COUT par run : runs/<runId>/cost-ledger.jsonl, APPEND-ONLY (jamais reecrit), une ligne par appel :
 *   REAL_CALL (transport principal), KIT_CALL (EF-01B/EF-01C1 via MONO-04, capture par l'adaptateur additif),
 *   PROBE (sonde MONO-10), PREFLIGHT (sonde de disponibilite), REUSE (reponse reutilisee : cout 0, JAMAIS un appel reel).
 * Le tarif applique est le SNAPSHOT du run (runs/<runId>/pricing-snapshot.json, ecrit au premier appel) : un cout
 * historique se recalcule exactement (pricingVersion + pricingSnapshotHash sur chaque ligne). Le ledger n'entre dans
 * aucun checkpoint hache : la reprise ne depend jamais du tarif. Un modele non tarife => cost null, priced:false.
 * Registre de processus (registry) : les transports que le pipeline n'injecte pas (sonde MONO-10, module de transport
 * designe par la frontiere gelee) retrouvent le ledger du run par sa cle (runId ou attemptRunId).
 */
const fs = require("fs"), path = require("path");
const { createPricing } = require("./pricing.js");

const KINDS = Object.freeze(["REAL_CALL", "KIT_CALL", "PROBE", "PREFLIGHT", "REUSE"]);
const REAL_KINDS = Object.freeze(["REAL_CALL", "KIT_CALL", "PROBE", "PREFLIGHT"]);
const round6 = (v) => Math.round(v * 1e6) / 1e6;
const REGISTRY = new Map();

function writeAtomic(filePath, text) { const tmp = filePath + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2, 8); fs.writeFileSync(tmp, text); fs.renameSync(tmp, filePath); }
function readLines(p) { return fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []; }

/** Totaux depuis les lignes (fonction pure : la meme liste donne les memes totaux). */
function totalsOf(entries, meta) {
  const zeroTok = () => ({ input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 });
  const bucket = () => ({ totalUsd: 0, inputUsd: 0, outputUsd: 0, cacheWriteUsd: 0, cacheReadUsd: 0, real: 0, reuse: 0, unpriced: 0, tokens: zeroTok() });
  const t = Object.assign(bucket(), { schema: "EvidenceForge.CostTotals", currency: (meta && meta.currency) || "USD", pricingVersion: (meta && meta.pricingVersion) || null, pricingSnapshotHash: (meta && meta.pricingSnapshotHash) || null, pricingDrift: (meta && meta.pricingDrift) || null,
    calls: { real: 0, reuse: 0, realCall: 0, kit: 0, probe: 0, preflight: 0, unpriced: 0 }, byStage: {}, byModel: {}, byPurpose: {}, lastCall: null, firstAt: null, lastAt: null, entries: entries.length });
  const add = (b, e) => { const real = REAL_KINDS.indexOf(e.kind) !== -1; if (real) b.real++; else b.reuse++; if (real && e.priced === false) b.unpriced++;
    if (e.cost) { b.totalUsd += e.cost.totalUsd; b.inputUsd += e.cost.inputUsd; b.outputUsd += e.cost.outputUsd; b.cacheWriteUsd += e.cost.cacheWriteUsd; b.cacheReadUsd += e.cost.cacheReadUsd; }
    if (real && e.usage) Object.keys(b.tokens).forEach((k) => { b.tokens[k] += Number(e.usage[k]) || 0; }); };
  entries.forEach(function (e) {
    add(t, e);
    if (e.kind === "REAL_CALL") t.calls.realCall++; else if (e.kind === "KIT_CALL") t.calls.kit++; else if (e.kind === "PROBE") t.calls.probe++; else if (e.kind === "PREFLIGHT") t.calls.preflight++;
    const st = e.stage || "(hors etape)"; if (!t.byStage[st]) t.byStage[st] = bucket(); add(t.byStage[st], e);
    const m = e.model || "(inconnu)"; if (!t.byModel[m]) t.byModel[m] = bucket(); add(t.byModel[m], e);
    const p = e.purpose || "(sans finalite)"; if (!t.byPurpose[p]) t.byPurpose[p] = bucket(); add(t.byPurpose[p], e);
    if (REAL_KINDS.indexOf(e.kind) !== -1) { t.lastCall = { at: e.at, stage: e.stage || null, purpose: e.purpose || null, model: e.model || null, totalUsd: e.cost ? e.cost.totalUsd : null, priced: e.priced !== false }; }
    if (!t.firstAt || e.at < t.firstAt) t.firstAt = e.at; if (!t.lastAt || e.at > t.lastAt) t.lastAt = e.at;
  });
  t.calls.real = t.real; t.calls.reuse = t.reuse; t.calls.unpriced = t.unpriced;
  const fix = (b) => { ["totalUsd", "inputUsd", "outputUsd", "cacheWriteUsd", "cacheReadUsd"].forEach((k) => { b[k] = round6(b[k]); }); };
  fix(t); Object.keys(t.byStage).forEach((k) => fix(t.byStage[k])); Object.keys(t.byModel).forEach((k) => fix(t.byModel[k])); Object.keys(t.byPurpose).forEach((k) => fix(t.byPurpose[k]));
  return t;
}

/** Lecture seule (etat public, API) : null si le run n'a pas de ledger (run anterieur a v1.0.5). */
function readTotals(runDir) {
  const p = path.join(runDir, "cost-ledger.jsonl"); if (!fs.existsSync(p)) return null;
  const snapPath = path.join(runDir, "pricing-snapshot.json"); let snap = null; try { snap = fs.existsSync(snapPath) ? JSON.parse(fs.readFileSync(snapPath, "utf8")) : null; } catch (e) { snap = null; }
  return totalsOf(readLines(p), snap ? { currency: snap.currency, pricingVersion: snap.version, pricingSnapshotHash: snap.hash } : null);
}
function readEntries(runDir) { return readLines(path.join(runDir, "cost-ledger.jsonl")); }

/**
 * createCostLedger({ runDir, runId, pricing?, onRecord?(entry, totals) })
 * -> { record, totals, entries, setStage, setAttempt, stage(), pricing(), snapshotPath, ledgerPath, activate(keys) }
 */
function createCostLedger(opts) {
  opts = opts || {}; if (!opts.runDir || !opts.runId) throw Object.assign(new Error("COST_LEDGER_INPUT_INVALID: runDir et runId requis"), { code: "COST_LEDGER_INPUT_INVALID" });
  const ledgerPath = path.join(opts.runDir, "cost-ledger.jsonl"), snapshotPath = path.join(opts.runDir, "pricing-snapshot.json");
  const current = opts.pricing || createPricing();
  let pricing = null, drift = null, stage = null, attemptId = null;
  /* SNAPSHOT DU RUN : ecrit une fois ; s'il existe deja, il fait autorite pour ce run (recalcul exact), la derive est signalee, jamais appliquee */
  function ensurePricing() {
    if (pricing) return pricing;
    fs.mkdirSync(opts.runDir, { recursive: true });
    if (fs.existsSync(snapshotPath)) {
      const snap = JSON.parse(fs.readFileSync(snapshotPath, "utf8")); pricing = createPricing({ snapshot: snap });
      if (snap.hash !== current.hash) drift = { runSnapshotVersion: snap.version, runSnapshotHash: snap.hash, currentVersion: current.version, currentHash: current.hash, note: "le tarif de la configuration a change depuis le debut du run : le snapshot du run reste applique (recalcul exact), la derive est signalee" };
    } else { const snap = Object.assign({}, current.snapshot(), { runId: opts.runId, persistedAt: new Date().toISOString() }); writeAtomic(snapshotPath, JSON.stringify(snap, null, 2) + "\n"); pricing = createPricing({ snapshot: snap }); }
    return pricing;
  }
  function meta() { const p = ensurePricing(); return { currency: p.currency, pricingVersion: p.version, pricingSnapshotHash: p.hash, pricingDrift: drift }; }
  function entries() { return readLines(ledgerPath); }
  function totals() { return totalsOf(entries(), meta()); }
  function record(e) {
    e = e || {}; if (KINDS.indexOf(e.kind) === -1) throw Object.assign(new Error("COST_LEDGER_KIND_INVALID: " + e.kind), { code: "COST_LEDGER_KIND_INVALID" });
    const p = ensurePricing(); const at = e.at || new Date().toISOString();
    const isReuse = e.kind === "REUSE"; const entry = p.resolve(e.model, at);
    const usage = isReuse ? null : p.normalizeUsage(e.usage);
    const cost = isReuse ? { inputUsd: 0, outputUsd: 0, cacheWriteUsd: 0, cacheReadUsd: 0, totalUsd: 0 } : p.costOf(e.usage, entry);
    const line = { schema: "EvidenceForge.CostLedgerEntry", seq: entries().length + 1, at, runId: opts.runId, attemptId: e.attemptId != null ? e.attemptId : attemptId, stage: e.stage || stage || null, kind: e.kind, purpose: e.purpose || null, pass: e.pass != null ? e.pass : null,
      model: e.model || null, providerRequestId: e.providerRequestId || null, callId: e.callId || null, localRequestId: e.localRequestId || null, httpStatus: e.httpStatus != null ? e.httpStatus : null, reused: isReuse,
      usage, cost, priced: isReuse ? true : !!cost, pricingVersion: p.version, pricingSnapshotHash: p.hash, pricedModel: entry ? entry.model : null,
      candidateRef: e.candidateRef || null, twinId: e.twinId || null, targetId: e.targetId || null, sourceRunId: e.sourceRunId || null };
    fs.appendFileSync(ledgerPath, JSON.stringify(line) + "\n");
    if (typeof opts.onRecord === "function") { try { opts.onRecord(line, totals()); } catch (x) { /* observabilite : jamais bloquant */ } }
    return line;
  }
  const api = { record, totals, entries, setStage: (s) => { stage = s || null; }, setAttempt: (a) => { attemptId = a != null ? a : null; }, stage: () => stage, pricing: ensurePricing, ledgerPath, snapshotPath, runId: opts.runId, runDir: opts.runDir,
    activate: (keys) => { (keys || []).forEach((k) => { if (k) REGISTRY.set(String(k), api); }); return api; }, deactivate: (keys) => { (keys || []).forEach((k) => REGISTRY.delete(String(k))); },
    /* garde de budget attachee (les transports non injectes la retrouvent avec le ledger) */
    budget: opts.budget || null, attachBudget: (b) => { api.budget = b || null; return api; } };
  return api;
}

/** Registre : ledger actif pour une cle (runId, attemptRunId). Les transports non injectes l'interrogent ; absent => aucun enregistrement (jamais une erreur). */
function lookup(key) { return key ? REGISTRY.get(String(key)) || null : null; }

module.exports = { createCostLedger, readTotals, readEntries, totalsOf, lookup, KINDS, REAL_KINDS };
