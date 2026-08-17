import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE_PATH = path.join(ROOT, "src/core/free-text-interpretation-core.js");
const REAL_PATH = path.join(ROOT, "benchmark/d102g1/corpus-real.jsonl");
const SPEC_PATH = path.join(ROOT, "benchmark/d102g1/corpus-spec.jsonl");

function loadCore() {
  const source = fs.readFileSync(CORE_PATH, "utf8");
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.JMMJSFreeTextInterpretationCore;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${path.relative(ROOT, file)}:${index + 1}: JSON invalide — ${error.message}`); }
  });
}

function unique(arr) { return [...new Set(arr)]; }
function sameScalar(a, b) { return (a ?? null) === (b ?? null); }
function arraySetEqual(a = [], b = []) {
  const aa = unique(a).sort();
  const bb = unique(b).sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

function classify(entry, core) {
  const candidate = core.interpretFreeText(entry.text || "");
  const issues = core.detectCoherenceIssues(candidate, entry.structured || {});
  const positiveTerrain = (candidate.triggers || [])
    .map(t => t.trigger)
    .filter(t => ["Descente", "Montée", "Terrain irrégulier", "Station debout"].includes(t));
  const negativeTerrain = (candidate.negations || []).map(n => n.trigger);
  const durationMinutes = candidate.temporal?.durations?.map(d => d.approxMinutes) || [];
  const pauseNeed = (candidate.needs || []).some(n => n.type === "pause-assise");
  return {
    side: candidate.side ?? null,
    bodyAreas: candidate.bodyAreas || [],
    positiveTerrain,
    negativeTerrain,
    durationMinutes,
    pauseNeed,
    painConflict: issues.some(i => i.type === "contradiction" && i.field === "painIntensity"),
    limitsConflict: issues.some(i => i.type === "contradiction" && i.field === "limits"),
    uncertain: (candidate.uncertain || []).length > 0,
  };
}

const DIMENSIONS = [
  ["side", "Latéralité", "scalar"],
  ["bodyAreas", "Zone corporelle", "set"],
  ["positiveTerrain", "Déclencheurs terrain positifs", "set"],
  ["negativeTerrain", "Négations terrain", "set"],
  ["durationMinutes", "Durée / temporalité explicite", "set"],
  ["pauseNeed", "Besoin de pause assise", "scalar"],
  ["painConflict", "Contradiction avec pain", "scalar"],
  ["limitsConflict", "Contradiction avec limites", "scalar"],
  ["uncertain", "Détection d’incertitude", "scalar"],
];

function confusionForSet(expected = [], actual = []) {
  const e = new Set(expected), a = new Set(actual);
  let tp = 0, fp = 0, fn = 0;
  for (const v of a) e.has(v) ? tp++ : fp++;
  for (const v of e) if (!a.has(v)) fn++;
  return { tp, fp, fn };
}

function ratio(n, d) { return d ? n / d : null; }
function pct(v) { return v === null ? "n/a" : `${(v * 100).toFixed(1)}%`; }

function evaluate(entries, core) {
  const rows = [];
  const agg = Object.fromEntries(DIMENSIONS.map(([key, label, type]) => [key, { key, label, type, total: 0, correct: 0, tp: 0, fp: 0, fn: 0 }]));
  for (const entry of entries) {
    if (!entry.oracle) throw new Error(`${entry.id || "(sans id)"}: oracle manquant`);
    const actual = classify(entry, core);
    const failures = [];
    for (const [key, label, type] of DIMENSIONS) {
      const expected = entry.oracle[key];
      if (expected === undefined) continue;
      const stat = agg[key];
      stat.total++;
      let ok;
      if (type === "set") {
        ok = arraySetEqual(expected, actual[key]);
        const c = confusionForSet(expected, actual[key]);
        stat.tp += c.tp; stat.fp += c.fp; stat.fn += c.fn;
      } else {
        ok = sameScalar(expected, actual[key]);
        if (typeof expected === "boolean") {
          if (actual[key] === true && expected === true) stat.tp++;
          if (actual[key] === true && expected === false) stat.fp++;
          if (actual[key] === false && expected === true) stat.fn++;
        }
      }
      if (ok) stat.correct++;
      else failures.push(`${label}: attendu=${JSON.stringify(expected)} obtenu=${JSON.stringify(actual[key])}`);
    }
    rows.push({ id: entry.id, provenance: entry.provenance, failures, actual });
  }
  const metrics = Object.values(agg).map(s => ({
    ...s,
    accuracy: ratio(s.correct, s.total),
    precision: ratio(s.tp, s.tp + s.fp),
    recall: ratio(s.tp, s.tp + s.fn),
    fpRate: ratio(s.fp, s.tp + s.fp),
  }));
  return { rows, metrics };
}

const ELIGIBLE_PROVENANCE = new Set(["beta-user", "realistic-human", "manual-rewrite"]);
const MIN_ELIGIBLE_TOTAL = 100;

function gate(metrics, eligibleCount) {
  if (eligibleCount < MIN_ELIGIBLE_TOTAL) {
    return { status: "INSUFFICIENT_CORPUS", reason: `${eligibleCount}/${MIN_ELIGIBLE_TOTAL} entrées humaines éligibles` };
  }
  const failures = [];
  for (const m of metrics) {
    if (!m.total) continue;
    const critical = ["positiveTerrain", "negativeTerrain", "painConflict", "limitsConflict", "uncertain"].includes(m.key);
    const minAccuracy = critical ? 0.95 : 0.90;
    if (m.accuracy !== null && m.accuracy < minAccuracy) failures.push(`${m.label}: exactitude ${pct(m.accuracy)} < ${pct(minAccuracy)}`);
    if (critical && m.precision !== null && m.precision < 0.95) failures.push(`${m.label}: précision ${pct(m.precision)} < 95.0%`);
    if (critical && m.fpRate !== null && m.fpRate > 0.03) failures.push(`${m.label}: taux FP ${pct(m.fpRate)} > 3.0%`);
  }
  return failures.length ? { status: "GO_MODEL_STUDY", failures } : { status: "NO_GO_MODEL_V1", reason: "seuils déterministes atteints par dimension" };
}

function printReport(title, entries, result, gateResult = null) {
  console.log(`\n=== ${title} ===`);
  console.log(`Entrées : ${entries.length}`);
  for (const m of result.metrics) {
    if (!m.total) continue;
    console.log(`- ${m.label}: exactitude=${pct(m.accuracy)} précision=${pct(m.precision)} rappel=${pct(m.recall)} FP=${m.fp}`);
  }
  const failed = result.rows.filter(r => r.failures.length);
  console.log(`Cas avec écart oracle : ${failed.length}/${entries.length}`);
  for (const r of failed.slice(0, 20)) {
    console.log(`  • ${r.id}: ${r.failures.join(" | ")}`);
  }
  if (gateResult) console.log(`Gate: ${gateResult.status}${gateResult.reason ? ` — ${gateResult.reason}` : ""}`);
  if (gateResult?.failures) for (const f of gateResult.failures) console.log(`  • ${f}`);
}

const core = loadCore();
const spec = readJsonl(SPEC_PATH);
const real = readJsonl(REAL_PATH);

const specResult = evaluate(spec, core);
printReport("Calibration projet (hors gate)", spec, specResult);

const eligible = real.filter(e => ELIGIBLE_PROVENANCE.has(e.provenance));
const realResult = evaluate(eligible, core);
const decision = gate(realResult.metrics, eligible.length);
printReport("Corpus humain D102G1", eligible, realResult, decision);

const report = {
  generatedAt: new Date().toISOString(),
  calibration: { count: spec.length, metrics: specResult.metrics, failures: specResult.rows.filter(r => r.failures.length) },
  humanCorpus: { count: eligible.length, metrics: realResult.metrics, decision },
};
fs.writeFileSync(path.join(ROOT, "benchmark/d102g1/latest-report.json"), JSON.stringify(report, null, 2));

if (specResult.rows.some(r => r.failures.length)) process.exitCode = 2;
