#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0.14 — tools/ef03b-registry-import.js : IMPORT HORS LIGNE des revues EF-03B deja VALID d'un run dans son registre
 * `reviews-valid.jsonl` (lib/ef03b-resilience.js), pour qu'un replay cible (POST /api/runs/:id/replay-reviews) les serve a 0 appel.
 * Deux sources, toutes deux RE-VALIDEES par le validateur local gele (MONO-11) ET le parseur EF-03B gele (MONO-01) avant import :
 *   1. les revues `complete` du reviewSet final (reviews.json) — candidat = projection des 9 cles du contrat, dans l'ordre du schema ;
 *   2. les candidats VALID d'une tentative precedente (magasin de reuse : validationStatus VALID) reconstruits depuis llm-cache
 *      (reponse complete, ou recomposition deterministe reponse parsable + reparation ciblee), si le jumeau (preuves) est inchange.
 * Cle du registre = sha256 du prompt EF-03B de passe 1 (traces d'enforcement) + sceau + contrat. Aucun appel fournisseur. Idempotent (aucun doublon).
 * Usage : node tools/ef03b-registry-import.js <runDir> [--dry-run]
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, ".."); const P = require(path.join(ROOT, "lib", "paths.js")); const SP = require(path.join(ROOT, "lib", "stage-professionals.js")); const EF3 = require(path.join(ROOT, "lib", "ef03b-resilience.js"));
const RE = require(path.join(P.MONO11, "core", "review-enforcer.js")); const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const CONTRACT = (P.CONFIG.frozenLots["MONO-11"] || {}).contractVersion || "MONO-11-v3";   /* v1.0.12 (R6) : contrat courant lu dans la configuration du lot gele */
const lines = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
const json = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
function importRun(runDir, opts) {
  opts = opts || {}; const { F, SEAL } = SP.loadSealedMono11(); const state = json(path.join(runDir, "state.json"));
  /* v1.0.12 (R6, decision proprietaire Q5) : FAIL CLOSED — aucun import automatique d'un run produit sous un autre sceau MONO-11 ou sous un autre contrat de validation. */
  const runSeal = state.seal && state.seal.runtimeSealSha256 || null;
  if (runSeal && runSeal !== SEAL.runtimeSealSha256) throw Object.assign(new Error("REGISTRY_IMPORT_SEAL_MISMATCH: le run a ete produit sous le sceau MONO-11 " + String(runSeal).slice(0, 12) + "… ; sceau courant " + SEAL.runtimeSealSha256.slice(0, 12) + "… — import refuse (aucune migration, aucune reutilisation inter-sceau)"), { code: "REGISTRY_IMPORT_SEAL_MISMATCH", runSeal: runSeal, currentSeal: SEAL.runtimeSealSha256 });
  const foreign = EF3.createReviewRegistry({ runDir }).list().filter((e) => (e.validationContract || null) !== CONTRACT || (e.sourceSealHash || null) !== SEAL.runtimeSealSha256);
  if (foreign.length) throw Object.assign(new Error("REGISTRY_IMPORT_CONTRACT_MISMATCH: " + foreign.length + " entree(s) du registre portent un autre contrat ou un autre sceau (contrat courant " + CONTRACT + ") — import refuse"), { code: "REGISTRY_IMPORT_CONTRACT_MISMATCH", entries: foreign.length, contract: CONTRACT }); const traces = json(path.join(runDir, "enforcement-traces.json")).reviews; const reviews = json(path.join(runDir, "reviews.json")).reviews;
  const twins = json(path.join(runDir, "twins.json")).twins; const tds = json(path.join(runDir, "target-document-set.json")); const schema = json(path.join(runDir, "review-schema.json")); const twinById = {}; twins.forEach((t) => { twinById[t.twinId] = t; });
  const calls = lines(path.join(runDir, "llm-calls.jsonl")).filter((c) => c.kind === "LLM_CALL" && /^EF-03B/.test(c.purpose || "") && c.httpStatus === 200); const led = {}; lines(path.join(runDir, "cost-ledger.jsonl")).forEach((e) => { if (e.callId && !led[e.callId]) led[e.callId] = e; }); const store = {}; lines(path.join(P.RUNS, "llm-reuse-store.jsonl")).forEach((e) => { if (e.responseSha256) store[e.responseSha256] = e; });
  const registry = EF3.createReviewRegistry({ runDir }); const existing = new Set(registry.list().map((e) => e.basePromptSha256 + "|" + e.candidateSha256)); const out = { imported: [], skipped: [], refused: [] };
  const textOf = (id) => { try { const j = json(path.join(runDir, "llm-cache", id + ".response.json")); return j.content.filter((c) => c.type === "text").map((c) => c.text).join(""); } catch (e) { return null; } };
  const finalAttempt = Math.max.apply(null, Object.values(led).map((e) => e.attemptId || 0));
  /* v1.0.14 (B4) — l'empreinte d'autorite est calculee sur le document NORMALISE du run (target-document-set.json est deja le jeu normalise
     produit par MONO-11) ; jamais sur le brut, jamais sur le prompt. Document d'autorite indisponible ou non normalise => IMPORT FAIL CLOSED. */
  const TN = require(path.join(P.MONO11, "core", "target-normalizer.js"));
  const authoritySha = (doc) => { const c = doc && typeof doc.content === "string" ? doc.content : null;
    if (!c || !c.length) throw Object.assign(new Error("REGISTRY_IMPORT_AUTHORITY_MISSING: aucun document d'autorite pour la cible " + JSON.stringify(doc && doc.targetId)), { code: "REGISTRY_IMPORT_AUTHORITY_MISSING" });
    if (TN.normalizeText(c).normalized !== c) throw Object.assign(new Error("REGISTRY_IMPORT_AUTHORITY_NOT_NORMALIZED: le document d'autorite de la cible " + JSON.stringify(doc.targetId) + " n'est pas normalise (regles " + TN.RULE_SET_ID + ")"), { code: "REGISTRY_IMPORT_AUTHORITY_NOT_NORMALIZED" });
    return sha(c); };
  const tryImport = (t, twin, doc, candidate, source, extra) => { const v = RE.validateReviewCandidate(candidate, twin, doc, schema); if (!v.ok) { out.refused.push({ twinId: t.twinId, source, errors: v.errors.slice(0, 3).map((e) => e.code) }); return false; }
    try { F.M01.RR.parseReviewResponse(candidate, twin, doc, schema); } catch (e) { out.refused.push({ twinId: t.twinId, source, errors: ["EF03B_FROZEN_PARSER: " + String(e.message).slice(0, 80)] }); return false; }
    const key = t.passes[0].promptSha256 + "|" + sha(candidate); if (existing.has(key)) { out.skipped.push({ twinId: t.twinId, source, reason: "deja au registre" }); return true; }
    const entry = Object.assign({ basePromptSha256: t.passes[0].promptSha256, documentAuthoritySha256: authoritySha(doc), twinId: t.twinId, targetId: t.targetId, runId: state.runId, candidateSha256: sha(candidate), candidate, validationContract: CONTRACT, sourceSealHash: SEAL.runtimeSealSha256, modelId: null, providerId: "anthropic", source }, extra || {}); if (!opts.dryRun) registry.put(entry); existing.add(key); out.imported.push({ twinId: t.twinId, source, candidateSha256: entry.candidateSha256, attemptId: entry.attemptId || finalAttempt }); return true; };
  for (const t of traces) { const twin = twinById[t.twinId]; const doc = F.M01.TDS.getDocumentForTarget(tds, t.targetId); if (!twin || !doc || !t.passes.length) continue; const rv = reviews.find((r) => r.twinId === t.twinId && r.targetId === t.targetId);
    if (rv && rv.reviewStatus === "complete" && Array.isArray(rv.findings)) { const findings = rv.findings.map((f) => { const o = {}; RE.FINDING_KEYS.forEach((k) => { o[k] = f[k]; }); return o; }); tryImport(t, twin, doc, JSON.stringify({ findings }), "FINAL_REVIEWSET_COMPLETE", { attemptId: finalAttempt, acceptedPass: t.acceptedPass }); continue; }
    /* revue en erreur : candidat VALID d'une tentative precedente, reconstruit et re-valide (preuves inchangees exigees par le validateur) */
    const hist = calls.filter((x) => x.twinId === t.twinId && led[x.responseSha256] && led[x.responseSha256].attemptId < finalAttempt).sort((a, b) => (led[a.responseSha256].attemptId - led[b.responseSha256].attemptId) || (a.pass - b.pass)); let parsed = null, done = false;
    for (const x of hist) { const text = textOf(x.responseSha256); if (text == null) continue; let candidate = text; const j0 = RE.extractJson(text); if (j0.ok && j0.value && Array.isArray(j0.value.repairs) && parsed) { const rp = RE.parseRepair(text, parsed.findings.map((f) => f.dimensionId)); candidate = JSON.stringify(RE.recompose(parsed, RE.mergeRepairLineage(parsed, rp.repairs || {}, doc.content).applied)); }
      const v = RE.validateReviewCandidate(candidate, twin, doc, schema); if (v.parsed && Array.isArray(v.parsed.findings)) parsed = v.parsed;
      if ((store[x.responseSha256] || {}).validationStatus === "VALID" && !done) { done = tryImport(t, twin, doc, candidate, "HISTORICAL_VALID_REVALIDATED_OFFLINE", { attemptId: led[x.responseSha256].attemptId, acceptedPass: x.pass, historicalCallId: x.responseSha256 }); } }
  }
  return out;
}
if (require.main === module) { const args = process.argv.slice(2); const runDir = args[0]; if (!runDir || !fs.existsSync(path.join(runDir, "enforcement-traces.json"))) { console.error("usage: node tools/ef03b-registry-import.js <runDir> [--dry-run]"); process.exit(2); }
  const r = importRun(path.resolve(runDir), { dryRun: args.indexOf("--dry-run") !== -1 }); console.log(JSON.stringify({ imported: r.imported.length, skipped: r.skipped.length, refused: r.refused.length, bySource: r.imported.reduce((o, x) => { o[x.source] = (o[x.source] || 0) + 1; return o; }, {}), refusedDetail: r.refused, dryRun: args.indexOf("--dry-run") !== -1, providerCalls: 0 }, null, 2)); }
module.exports = { importRun };
