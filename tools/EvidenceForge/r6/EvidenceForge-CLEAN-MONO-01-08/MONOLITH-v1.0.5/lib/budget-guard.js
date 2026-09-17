"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/budget-guard.js
 * BUDGET DUR PAR RUN : runs/<runId>/budget.json (HORS state.json : une mise a jour par l'utilisateur pendant l'execution
 * n'est jamais ecrasee par le moteur). Verifie AVANT chaque appel LLM reel (transport principal, kits EF-01, sonde) :
 *   depense >= plafond  => BUDGET_LIMIT_REACHED (fatal, verrou de transport, reprenable : STOPPED, checkpoint conserve)
 *   depense >= alerte   => un evenement d'alerte, une seule fois par seuil
 *   modele non tarife alors qu'un plafond est pose => PRICING_UNKNOWN_FOR_MODEL (fail-closed : jamais un depassement
 *   silencieux faute de tarif).
 * Le depassement possible est borne par le cout d'UN appel (controle avant chaque appel, jamais apres). Aucun seuil
 * de confirmation n'ajoute une troisieme porte : l'augmentation du budget est un acte explicite via l'API, puis reprise.
 */
const fs = require("fs"), path = require("path");
const SCHEMA = "EvidenceForge.RunBudget";
const round2 = (v) => Math.round(v * 100) / 100;
function writeAtomic(filePath, text) { const tmp = filePath + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2, 8); fs.writeFileSync(tmp, text); fs.renameSync(tmp, filePath); }
const isMoney = (v) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);

function readBudget(runDir) {
  const p = path.join(runDir, "budget.json"); if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

/** Normalise une demande de budget (creation ou mise a jour). Refuse les valeurs invalides ; l'alerte ne depasse jamais le plafond. */
function normalizeBudgetInput(input) {
  input = input || {};
  const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const budget = toNum(input.costBudgetUsd), warning = toNum(input.warningThresholdUsd);
  if (!isMoney(budget) || !isMoney(warning)) { const e = new Error("BUDGET_INVALID"); e.code = "BUDGET_INVALID"; e.userMessage = "Le budget et le seuil d'alerte doivent être des montants positifs (en USD), ou vides."; throw e; }
  if (budget !== null && warning !== null && warning > budget) { const e = new Error("BUDGET_INVALID: alerte > plafond"); e.code = "BUDGET_INVALID"; e.userMessage = "Le seuil d'alerte ne peut pas dépasser le budget maximum."; throw e; }
  return { costBudgetUsd: budget === null ? null : round2(budget), warningThresholdUsd: warning === null ? null : round2(warning) };
}

function createBudgetGuard(opts) {
  opts = opts || {}; if (!opts.runDir || !opts.ledger) throw Object.assign(new Error("BUDGET_GUARD_INPUT_INVALID"), { code: "BUDGET_GUARD_INPUT_INVALID" });
  const file = path.join(opts.runDir, "budget.json");
  const emit = (ev) => { if (typeof opts.onEvent === "function") { try { opts.onEvent(ev); } catch (e) { /* observabilite */ } } };
  function read() { return readBudget(opts.runDir) || { schema: SCHEMA, runId: opts.runId || null, currency: "USD", costBudgetUsd: null, warningThresholdUsd: null, updatedAt: null, warningRaisedAt: null, limitReachedAt: null, history: [] }; }
  function set(input, who) {
    const n = normalizeBudgetInput(input); const cur = read(); const now = new Date().toISOString();
    const next = Object.assign({}, cur, { schema: SCHEMA, runId: opts.runId || cur.runId || null, currency: "USD", costBudgetUsd: n.costBudgetUsd, warningThresholdUsd: n.warningThresholdUsd, updatedAt: now, setBy: who || "user",
      /* un seuil modifie redevient armable ; un plafond releve efface la marque d'arret (la reprise redevient possible sans faux arret immediat) */
      warningRaisedAt: n.warningThresholdUsd === cur.warningThresholdUsd ? cur.warningRaisedAt : null, limitReachedAt: n.costBudgetUsd === cur.costBudgetUsd ? cur.limitReachedAt : null,
      history: (cur.history || []).concat([{ at: now, costBudgetUsd: n.costBudgetUsd, warningThresholdUsd: n.warningThresholdUsd, previous: { costBudgetUsd: cur.costBudgetUsd, warningThresholdUsd: cur.warningThresholdUsd }, setBy: who || "user" }]) });
    fs.mkdirSync(opts.runDir, { recursive: true }); writeAtomic(file, JSON.stringify(next, null, 2) + "\n");
    emit({ type: "budget_set", budget: next }); return next;
  }
  function status() {
    const b = read(); const t = opts.ledger.totals(); const spent = t.totalUsd;
    return { budget: b, spentUsd: spent, unpricedCalls: t.calls.unpriced, remainingUsd: b.costBudgetUsd === null ? null : round2(Math.max(0, b.costBudgetUsd - spent)),
      warningReached: b.warningThresholdUsd !== null && spent >= b.warningThresholdUsd, limitReached: b.costBudgetUsd !== null && spent >= b.costBudgetUsd };
  }
  /** A appeler AVANT tout appel reel. ctx = { model, purpose, where }. Rend le statut ; leve si l'appel ne doit pas partir. */
  function assertAllowed(ctx) {
    ctx = ctx || {}; const b = read(); if (b.costBudgetUsd === null && b.warningThresholdUsd === null) return { allowed: true, budget: b };
    const p = opts.ledger.pricing(); const t = opts.ledger.totals(); const spent = t.totalUsd;
    /* alerte d'abord (une fois par seuil), puis plafond : franchir les deux d'un coup emet l'alerte ET refuse l'appel */
    if (b.warningThresholdUsd !== null && spent >= b.warningThresholdUsd && !b.warningRaisedAt) {
      const cur = read(); cur.warningRaisedAt = new Date().toISOString(); cur.warningRaisedSpentUsd = spent; writeAtomic(file, JSON.stringify(cur, null, 2) + "\n");
      emit({ type: "budget_warning", spentUsd: spent, warningThresholdUsd: b.warningThresholdUsd, costBudgetUsd: b.costBudgetUsd });
    }
    if (b.costBudgetUsd !== null) {
      if (ctx.model && !p.resolve(ctx.model)) { const e = new Error("PRICING_UNKNOWN_FOR_MODEL: " + ctx.model); e.code = "PRICING_UNKNOWN_FOR_MODEL"; e.fatal = true; e.details = { model: ctx.model, pricingVersion: p.version };
        e.userMessage = "Un budget est fixé mais le modèle d'analyse configuré (" + ctx.model + ") n'a pas de tarif connu (tarification " + p.version + ") : EvidenceForge refuse tout appel plutôt que de dépasser votre budget sans le savoir."; throw e; }
      if (t.calls.unpriced > 0) { const e = new Error("PRICING_UNKNOWN_FOR_MODEL: " + t.calls.unpriced + " appel(s) non tarife(s) dans le ledger"); e.code = "PRICING_UNKNOWN_FOR_MODEL"; e.fatal = true; e.details = { unpricedCalls: t.calls.unpriced };
        e.userMessage = "Ce run contient " + t.calls.unpriced + " appel(s) dont le coût n'a pas pu être calculé : le respect du budget ne peut pas être garanti, aucun nouvel appel n'est lancé."; throw e; }
      if (spent >= b.costBudgetUsd) {
        if (!b.limitReachedAt) { const cur = read(); cur.limitReachedAt = new Date().toISOString(); cur.limitReachedSpentUsd = spent; writeAtomic(file, JSON.stringify(cur, null, 2) + "\n"); }
        const e = new Error("BUDGET_LIMIT_REACHED: " + spent.toFixed(2) + " >= " + b.costBudgetUsd.toFixed(2) + " USD"); e.code = "BUDGET_LIMIT_REACHED"; e.fatal = true; e.details = { spentUsd: spent, costBudgetUsd: b.costBudgetUsd, where: ctx.where || null, purpose: ctx.purpose || null };
        e.userMessage = "Le budget maximum que vous avez fixé (" + b.costBudgetUsd.toFixed(2) + " USD) est atteint : " + spent.toFixed(2) + " USD dépensés. Le run est arrêté proprement AVANT tout nouvel appel payant ; les résultats déjà validés sont conservés. Pour poursuivre, augmentez le budget puis reprenez le run.";
        emit({ type: "budget_limit", spentUsd: spent, costBudgetUsd: b.costBudgetUsd, where: ctx.where || null }); throw e; }
    }
    return { allowed: true, budget: b, spentUsd: spent };
  }
  return Object.freeze({ read, set, status, assertAllowed, file });
}

module.exports = { createBudgetGuard, readBudget, normalizeBudgetInput, SCHEMA };
