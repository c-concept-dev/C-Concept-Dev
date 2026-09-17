"use strict";
/**
 * MONO-07 — runner-policy.js
 *
 * BUG CORRIGE (trouve par audit independant) : une version anterieure de
 * test/run-all.js appliquait une nouvelle tentative (jusqu'a 3 essais) a
 * TOUTE exception, y compris un echec d'ASSERTION FONCTIONNELLE reel.
 * Un fichier de test reellement defaillant pouvait ainsi etre declare PASS
 * si une tentative ulterieure passait - masquant une vraie regression.
 * C'est strictement interdit.
 *
 * Politique corrigee :
 *   - Groupe Node/API : AUCUNE nouvelle tentative, jamais (1 seule execution).
 *   - Groupe Browser : nouvelle tentative UNIQUEMENT si la PREMIERE tentative
 *     est classifiee INFRASTRUCTURE (jamais FUNCTIONAL), et alors un seul
 *     essai supplementaire (2 tentatives au total, jamais 3).
 *   - Un echec fonctionnel (le fichier s'est execute jusqu'au bout et a
 *     rapporte "ECHECS : N") n'est JAMAIS retente, quelle que soit sa cause.
 *   - Un echec non reconnu (ne correspond a aucun motif d'infrastructure
 *     explicite) est traite par defaut comme FUNCTIONAL - jamais retente.
 */

const INFRASTRUCTURE_PATTERNS = [
  /browserType\.launch:/i,
  /Failed to launch (the )?browser/i,
  /Executable doesn't exist/i,
  /Target page, context or browser has been closed/i,
  /Browser has been closed/i,
  /Browser closed unexpectedly/i,
  /page\.goto: Target closed/i,
  /net::ERR_CONNECTION_REFUSED/i,
];

const INFRASTRUCTURE_SIGNALS = new Set(["SIGKILL", "SIGABRT", "SIGSEGV"]);

function classifyOutcome(outcome) {
  if (outcome.ok) return "PASS";
  const e = outcome.err;
  const combinedOutput = String((e && e.stdout) || "") + "\n" + String((e && e.stderr) || "") + "\n" + String((e && e.message) || "");

  if (/\nECHECS\s*:\s*\d+/.test(combinedOutput)) return "FUNCTIONAL";

  if (e && e.signal && INFRASTRUCTURE_SIGNALS.has(e.signal)) return "INFRASTRUCTURE";
  for (const pattern of INFRASTRUCTURE_PATTERNS) {
    if (pattern.test(combinedOutput)) return "INFRASTRUCTURE";
  }
  return "FUNCTIONAL";
}

function runOnceWith(runFn) {
  try {
    const out = runFn();
    return { ok: true, out };
  } catch (e) {
    return { ok: false, err: e };
  }
}

function runWithPolicy(runFn, group) {
  const attempts = [];
  const t0 = Date.now();
  const first = runOnceWith(runFn);
  const firstClassification = classifyOutcome(first);
  attempts.push({
    attempt: 1,
    classification: firstClassification,
    status: first.ok ? 0 : (first.err && first.err.status) || null,
    signal: first.ok ? null : (first.err && first.err.signal) || null,
    stderrExcerpt: first.ok ? "" : String((first.err && first.err.stderr) || "").slice(0, 500),
    durationMs: Date.now() - t0,
  });

  if (first.ok) return { ok: true, out: first.out, attempts };

  if (group !== "browser") return { ok: false, err: first.err, attempts };

  if (firstClassification !== "INFRASTRUCTURE") return { ok: false, err: first.err, attempts };

  const t1 = Date.now();
  const second = runOnceWith(runFn);
  const secondClassification = classifyOutcome(second);
  attempts.push({
    attempt: 2,
    classification: secondClassification,
    status: second.ok ? 0 : (second.err && second.err.status) || null,
    signal: second.ok ? null : (second.err && second.err.signal) || null,
    stderrExcerpt: second.ok ? "" : String((second.err && second.err.stderr) || "").slice(0, 500),
    durationMs: Date.now() - t1,
  });

  if (second.ok) return { ok: true, out: second.out, attempts };
  return { ok: false, err: second.err, attempts };
}

module.exports = { classifyOutcome, runOnceWith, runWithPolicy, INFRASTRUCTURE_PATTERNS, INFRASTRUCTURE_SIGNALS };
