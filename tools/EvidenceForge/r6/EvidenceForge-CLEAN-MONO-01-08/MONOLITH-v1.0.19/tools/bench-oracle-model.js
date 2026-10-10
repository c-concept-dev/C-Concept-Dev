#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0.5 — tools/bench-oracle-model.js <runDir> --models claude-haiku-4-5,claude-sonnet-5 [--sample 30] [--out <dir>]
 * BENCHMARK DE ROUTAGE DE MODELE pour l'oracle EF-02D2 (evaluation de pertinence d'un professionnel) : rejoue, via le worker REEL
 * (appels payants, journalises dans <out>/bench-ledger.jsonl), les PROMPTS EXACTS deja emis par un run reel (llm-cache/*.request.json)
 * avec d'autres modeles, valide chaque reponse avec le PARSEUR GELE (MONO-01 EF-02D2, + normalisation des references de v1.0.5) et
 * compare aux jugements de reference du run (modele d'origine). Le run source est lu en LECTURE SEULE ; rien n'y est ecrit.
 * Sortie : <out>/bench-oracle-<runId>.json (accord par dimension, accord de classe, cout par modele, appels refuses) — jamais un secret.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, ".."); const P = require(path.join(ROOT, "lib", "paths.js")); const { createPricing } = require(path.join(ROOT, "lib", "pricing.js")); const WN = require(path.join(ROOT, "lib", "workref-normalization.js")); const PD = require(path.join(ROOT, "lib", "provider-diagnostic.js"));
const D2 = require(path.join(P.MONO01, "dependencies", "ef-02d2-mission-relevance-v1.js"));
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const args = process.argv.slice(2); const runDir = path.resolve(args[0] || ""); const opt = (k, d) => { const i = args.indexOf(k); return i !== -1 ? args[i + 1] : d; };
const MODELS = String(opt("--models", "claude-haiku-4-5")).split(",").map((s) => s.trim()).filter(Boolean); const SAMPLE = Number(opt("--sample", 30)); const OUT = path.resolve(opt("--out", path.join(P.RUNS, "_bench")));
const classOf = (d) => { const sup = d.judgments.filter((j) => j.relevanceStatus === "mission_relevant"), par = d.judgments.filter((j) => j.relevanceStatus === "partially_relevant"); return sup.length ? "SUPPORTED" : (par.length ? "PARTIAL" : "OUT_OF_SCOPE"); };
function corpusFromPrompt(prompt) { const m = /\(métadonnées réelles uniquement\)\n(\{[\s\S]*?\})\n\nRÈGLES/.exec(prompt); const c = JSON.parse(m[1]); return { professionalRef: null, corpus: { works: c.works.map((w) => ({ title: w.title, doi: w.doi })) } }; }
function dimsFromPrompt(prompt) { const m = /DIMENSIONS DE MISSION[^\n]*\n([\s\S]*?)\n\nCORPUS/.exec(prompt); return (m ? m[1] : "").split("\n").map((l) => (/^\s*-?\s*([A-Za-z0-9_-]+)\s*[:—-]/.exec(l) || [])[1]).filter(Boolean); }
const dimensionSetOf = (ids) => ({ schema: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", dimensions: ids.map((id) => ({ id, label: id, definition: id })) });
function parseWith(text, dimensionSet, corpus) { const n = WN.normalizeWorkRefs(text, corpus); return { d: D2.parseRelevanceResponse(n.text, dimensionSet, corpus), normalized: n.normalized }; }
async function callWorker(model, prompt, env) {
  const t0 = Date.now(); const res = await fetch(env.LLM_WORKER_BASE_URL.replace(/\/$/, "") + "/v1/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.EVIDENCEFORGE_WORKER_API_KEY, "x-evidenceforge-request-id": "efm-bench-" + crypto.randomBytes(4).toString("hex") }, body: JSON.stringify({ model, max_tokens: 8192, messages: [{ role: "user", content: prompt }] }) });
  const raw = await res.text(); let p = null; try { p = JSON.parse(raw); } catch (e) { p = null; } const text = p && Array.isArray(p.content) ? p.content.filter((c) => c.type === "text").map((c) => c.text).join("") : "";
  return { status: res.status, text, usage: p && p.usage, model: p && p.model, ms: Date.now() - t0, raw };
}
(async () => {
  if (!fs.existsSync(path.join(runDir, "llm-calls.jsonl"))) { console.error("usage: node tools/bench-oracle-model.js <runDir> --models a,b [--sample N] [--out dir]"); process.exit(2); }
  const cs = PD.credentialsStatus(process.env); if (!cs.usable) { console.error("fournisseur non configure : " + cs.code); process.exit(1); }
  const pricing = createPricing(); fs.mkdirSync(OUT, { recursive: true }); const ledgerPath = path.join(OUT, "bench-ledger.jsonl");
  const calls = fs.readFileSync(path.join(runDir, "llm-calls.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.kind === "LLM_CALL" && c.purpose === "EF-02D2 relevance");
  const led = fs.readFileSync(path.join(runDir, "cost-ledger.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); const candOf = {}; led.forEach((e) => { if (e.candidateRef && e.callId) candOf[e.callId] = e.candidateRef; });
  /* reference = premiere reponse d'origine par candidat, relue avec normalisation (meme regle que le run apres v1.0.5) */
  const refs = []; const seen = new Set();
  calls.forEach((c) => { const cid = candOf[c.responseSha256]; if (!cid || seen.has(cid)) return; const reqP = path.join(runDir, "llm-cache", c.promptSha256 + ".request.json"), resP = path.join(runDir, "llm-cache", c.responseSha256 + ".response.json"); if (!fs.existsSync(reqP) || !fs.existsSync(resP)) return; seen.add(cid);
    const prompt = JSON.parse(fs.readFileSync(reqP, "utf8")).prompt; const body = JSON.parse(fs.readFileSync(resP, "utf8")); const text = (body.content || []).filter((x) => x.type === "text").map((x) => x.text).join(""); const corpus = corpusFromPrompt(prompt); const dimIds = dimsFromPrompt(prompt); const dimensionSet = dimensionSetOf(dimIds);
    let ref = null; try { ref = parseWith(text, dimensionSet, corpus).d; } catch (e) { ref = null; }
    refs.push({ candidateRef: cid, prompt, dimensionSet, corpus, refJudgments: ref, refClass: ref ? classOf(ref) : "UNKNOWN", refModel: c.modelId, refUsage: c.usage }); });
  /* echantillon stratifie par classe de reference, deterministe (hash du candidat) */
  const byClass = {}; refs.forEach((r) => { (byClass[r.refClass] = byClass[r.refClass] || []).push(r); }); Object.keys(byClass).forEach((k) => byClass[k].sort((a, b) => sha(a.candidateRef).localeCompare(sha(b.candidateRef))));
  const total = refs.length; const sample = []; Object.keys(byClass).sort().forEach((k) => { const n = Math.max(k === "SUPPORTED" ? byClass[k].length : 1, Math.round(SAMPLE * byClass[k].length / total)); sample.push(...byClass[k].slice(0, n)); });
  console.log("reference : " + total + " candidats (" + Object.keys(byClass).map((k) => k + " " + byClass[k].length).join(", ") + ") ; echantillon " + sample.length + " ; modeles " + MODELS.join(", "));
  const result = { schema: "EvidenceForge.OracleModelBenchmark", runId: path.basename(runDir), referenceModel: refs[0] && refs[0].refModel, pricingVersion: pricing.version, sample: sample.length, models: {}, generatedAt: new Date().toISOString() };
  for (const model of MODELS) {
    const entry = pricing.resolve(model); const m = { model, priced: !!entry, calls: 0, refused: 0, parseFailed: 0, normalized: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, classAgreement: 0, dimAgreement: 0, dimTotal: 0, supportedAgreement: { ref: 0, hit: 0, falsePositive: 0 }, perCandidate: [] };
    for (const r of sample) {
      const c = await callWorker(model, r.prompt, process.env); m.calls++; const cost = c.status === 200 && entry ? pricing.costOf(c.usage, entry).totalUsd : 0; m.costUsd += cost; if (c.usage) { m.inputTokens += c.usage.input_tokens || 0; m.outputTokens += c.usage.output_tokens || 0; }
      fs.appendFileSync(ledgerPath, JSON.stringify({ at: new Date().toISOString(), kind: "BENCH_CALL", model, observedModel: c.model, candidateRef: r.candidateRef, httpStatus: c.status, usage: c.usage, costUsd: cost, ms: c.ms, promptSha256: sha(r.prompt), responseSha256: sha(c.raw) }) + "\n");
      if (c.status !== 200) { m.refused++; m.perCandidate.push({ candidateRef: r.candidateRef, status: c.status }); continue; }
      let d = null, norm = false; try { const p = parseWith(c.text, r.dimensionSet, r.corpus); d = p.d; norm = p.normalized; } catch (e) { m.parseFailed++; m.perCandidate.push({ candidateRef: r.candidateRef, parseError: String(e.message).slice(0, 120), refClass: r.refClass }); continue; }
      if (norm) m.normalized++; const cls = classOf(d); const refJ = r.refJudgments; let agree = 0;
      if (refJ) { refJ.judgments.forEach((rj) => { const dj = d.judgments.find((x) => x.dimensionId === rj.dimensionId); m.dimTotal++; if (dj && dj.relevanceStatus === rj.relevanceStatus) { agree++; m.dimAgreement++; } }); if (cls === r.refClass) m.classAgreement++; if (r.refClass === "SUPPORTED") { m.supportedAgreement.ref++; if (cls === "SUPPORTED") m.supportedAgreement.hit++; } else if (cls === "SUPPORTED") m.supportedAgreement.falsePositive++; }
      m.perCandidate.push({ candidateRef: r.candidateRef, refClass: r.refClass, cls, dimAgree: refJ ? agree + "/" + refJ.judgments.length : null, costUsd: Math.round(cost * 1e4) / 1e4, outputTokens: c.usage && c.usage.output_tokens });
      process.stdout.write("."); }
    const compared = m.perCandidate.filter((x) => x.cls).length; m.classAgreementRate = compared ? Math.round(1000 * m.classAgreement / compared) / 1000 : null; m.dimAgreementRate = m.dimTotal ? Math.round(1000 * m.dimAgreement / m.dimTotal) / 1000 : null; m.costPerEvaluationUsd = m.calls ? Math.round(1e4 * m.costUsd / m.calls) / 1e4 : null; m.costUsd = Math.round(m.costUsd * 1e4) / 1e4;
    result.models[model] = m; console.log("\n" + model + " : " + m.calls + " appels, cout " + m.costUsd + " USD (" + m.costPerEvaluationUsd + "/eval), accord classe " + m.classAgreementRate + ", accord par dimension " + m.dimAgreementRate + ", SUPPORTED retrouves " + m.supportedAgreement.hit + "/" + m.supportedAgreement.ref + " (faux positifs " + m.supportedAgreement.falsePositive + "), refus " + m.refused + ", parse KO " + m.parseFailed + ", normalises " + m.normalized);
  }
  const refCost = sample.reduce((a, r) => a + (r.refUsage && pricing.resolve(r.refModel) ? pricing.costOf(r.refUsage, pricing.resolve(r.refModel)).totalUsd : 0), 0); result.referenceCostUsd = Math.round(refCost * 1e4) / 1e4; result.referenceCostPerEvaluationUsd = Math.round(1e4 * refCost / sample.length) / 1e4;
  const outFile = path.join(OUT, "bench-oracle-" + path.basename(runDir) + ".json"); fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n"); console.log("reference " + result.referenceModel + " : " + result.referenceCostPerEvaluationUsd + " USD/eval (premier appel) ; resultat : " + outFile);
})().catch((e) => { console.error(e); process.exit(1); });
