#!/usr/bin/env node
"use strict";
/**
 * MONO-11 v0.3 — benchmark/replay.js : REJEU DETERMINISTE HORS LIGNE des sequences de revues reelles (fixtures anonymisees,
 * reponses byte-exactes). Aucun appel LLM. Mesure : detection des repetitions exactes, decomposition des citations rejetees
 * en fragments litteraux, eligibilite a la reparation ciblee, acceptation par recomposition des corrections historiques,
 * matrice differentielle v0.2/v0.3 sur le validateur (inchange). Separe OBSERVED / DETERMINISTICALLY_REPLAYABLE / PROJECTED.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const RE = require("../core/review-enforcer.js");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const DIR = path.join(__dirname, "fixtures");
function load() { return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))); }
function schemaOf(fx) { return { schema: "EvidenceForge.ReviewSchema", dimensions: fx.dimensions.map((id) => ({ id })) }; }
function run() {
  const fixtures = load(); const rows = []; const summary = { fixtures: fixtures.length, occurrencesTargetRef: 0, exactRepeatsDetected: 0, wastedIdenticalPasses: 0, targetedEligibleSequences: 0, splices: 0, inventions: 0, truncations: 0, historicalCorrectionAcceptedByRecomposition: 0, falseAcceptances: 0, regressions: 0, tokensWastedIdentical: { input: 0, output: 0 }, tokensR1: { input: 0, output: 0 } };
  fixtures.forEach(function (fx) {
    const schema = schemaOf(fx), twin = fx.twin, doc = fx.document; let prevRaw = null, prevCodes = null; let parsed1 = null; const seq = { id: fx.id, kind: fx.kind, passes: [] };
    fx.passes.forEach(function (p, i) {
      const v = RE.validateReviewCandidate(p.responseText, twin, doc, schema);   /* validateur INCHANGE v0.2/v0.3 */
      const codes = Array.from(new Set(v.errors.map((e) => e.code))).sort();
      const sameAsHistory = v.ok === p.valid;   /* differentiel : meme verdict que le run d'origine (v0.2) */
      if (!sameAsHistory) { if (v.ok) summary.falseAcceptances++; else summary.regressions++; }
      const exact = i > 0 && prevRaw !== null && sha(p.responseText) === sha(prevRaw) && JSON.stringify(codes) === JSON.stringify(prevCodes);
      if (exact) { summary.exactRepeatsDetected++; summary.wastedIdenticalPasses++; summary.tokensWastedIdentical.input += p.usage.input_tokens || 0; summary.tokensWastedIdentical.output += p.usage.output_tokens || 0; }
      if (fx.id === "R1") { summary.tokensR1.input += p.usage.input_tokens || 0; summary.tokensR1.output += p.usage.output_tokens || 0; }
      const targetRefErrs = v.errors.filter((e) => e.code === RE.TARGET_REF_CODE); summary.occurrencesTargetRef += targetRefErrs.length;
      const rejected = v.parsed ? RE.rejectedRefsOf(v.errors, v.parsed) : {}; const frags = {};
      Object.keys(rejected).forEach((d) => { frags[d] = rejected[d].map((ref) => { const f = RE.literalFragments(ref, doc.content); if (!f.literal) { if (f.fragments.length >= 2) summary.splices++; else if (f.fragments.length === 1) summary.truncations++; else summary.inventions++; } return { ref, literal: f.literal, fragments: f.fragments.map((x) => x.text), coverage: f.coverage }; }); });
      if (i === 0 && v.parsed) parsed1 = v.parsed;
      seq.passes.push({ pass: p.pass, historicalValid: p.valid, replayValid: v.ok, sameVerdict: sameAsHistory, codes, exactRepeat: exact, targetedEligible: RE.onlyTargetRefErrors(v.errors) && !!v.parsed, rejected: rejected, fragments: frags, usage: p.usage });
      prevRaw = p.responseText; prevCodes = codes;
    });
    if (seq.passes[0] && seq.passes[0].targetedEligible) summary.targetedEligibleSequences++;
    /* correction historique (passe acceptee) rejouee comme REPARATION CIBLEE recomposee sur la passe 1 : acceptee ? */
    const acc = fx.passes.find((p) => p.valid && p.pass > 1);
    if (acc && parsed1) { const pv = RE.validateReviewCandidate(acc.responseText, twin, doc, schema); const dims = RE.faultyDimensions(RE.validateReviewCandidate(fx.passes[0].responseText, twin, doc, schema).errors);
      if (pv.ok && pv.parsed && dims.length) { const repairs = {}; pv.parsed.findings.forEach((f) => { if (dims.indexOf(f.dimensionId) !== -1) repairs[f.dimensionId] = f.targetEvidenceRefs; }); const rc = RE.recompose(parsed1, repairs); const rv = RE.validateReviewCandidate(JSON.stringify(rc), twin, doc, schema); seq.historicalCorrectionAsTargetedRepair = { faultyDimensions: dims, accepted: rv.ok, errors: rv.errors.map((e) => e.code) }; if (rv.ok) summary.historicalCorrectionAcceptedByRecomposition++; } }
    /* prompt cible que v0.3 aurait construit apres la passe 1 (deterministe) */
    const e1 = seq.passes[0]; if (e1 && e1.targetedEligible) { const v1 = RE.validateReviewCandidate(fx.passes[0].responseText, twin, doc, schema); const dims = RE.faultyDimensions(v1.errors); const rejected = RE.rejectedRefsOf(v1.errors, v1.parsed); const fragments = {}; dims.forEach((d) => { fragments[d] = rejected[d].map((ref) => Object.assign({ ref }, RE.literalFragments(ref, doc.content))); });
      const prompt = RE.targetedRepairPrompt({ targetDoc: doc, faultyDimensions: dims, rejectedRefs: rejected, fragments, pass: 2, strategyChange: false }); seq.targetedPromptPass2 = { sha256: sha(prompt), chars: prompt.length, mentionsFragments: /NE SONT PAS CONTIGUS/.test(prompt), mentionsEmptyFallback: /rendez \[\]/.test(prompt), containsDocument: prompt.indexOf(doc.content) !== -1, reinjectsFullPreviousResponse: prompt.indexOf(fx.passes[0].responseText) !== -1 }; }
    rows.push(seq);
  });
  return { summary, rows };
}
if (require.main === module) { const r = run(); const out = path.join(__dirname, "replay-results.json"); fs.writeFileSync(out, JSON.stringify(r, null, 1)); console.log(JSON.stringify(r.summary, null, 1)); r.rows.forEach((s) => console.log(s.id, s.kind, s.passes.map((p) => (p.replayValid ? "OK" : p.codes.join("+")) + (p.exactRepeat ? "*" : "")).join(" -> "), s.historicalCorrectionAsTargetedRepair ? "| correction historique recomposee : " + (s.historicalCorrectionAsTargetedRepair.accepted ? "ACCEPTEE" : "REFUSEE " + s.historicalCorrectionAsTargetedRepair.errors) : "", s.targetedPromptPass2 ? "| prompt cible p2 : fragments=" + s.targetedPromptPass2.mentionsFragments + " []=" + s.targetedPromptPass2.mentionsEmptyFallback + " doc=" + s.targetedPromptPass2.containsDocument + " reinjection=" + s.targetedPromptPass2.reinjectsFullPreviousResponse : "")); }
module.exports = { run, load };
