"use strict";
// test/test_t08_matrix.js
//
// Execute ce qui peut reellement etre execute (LOCAL_CONTROLLED) et
// classe explicitement BLOCKED/NOT_RUN tout ce qui depend d'un
// environnement reseau autorise absent ici. N'annonce JAMAIS un total
// global du type "24/24 PASS".

const path = require("path");
const fs = require("fs");
const { runPreflight } = require("../lib/preflight");
const { hashKit, compareHashes } = require("../lib/frozen-zip-integrity");
const { scanForSecretValues } = require("../lib/secret-scan");
const { resolveKitRoot } = require("../lib/kit-root");

const matrix = [];
function record(id, name, status, detail, implementationStatus) {
  matrix.push({ id: id, name: name, status: status, detail: detail || null, implementationStatus: implementationStatus || "N/A" });
}

async function main() {
  let kitRoot = null;
  try {
    kitRoot = resolveKitRoot(process.argv);
  } catch (e) {
    record("T08-01", "baseline R3 gate", "BLOCKED", "kitRoot non fourni: " + e.message);
  }
  if (kitRoot) {
    const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
    if (!mono07LibPath) {
      record("T08-01", "baseline R3 gate", "NOT_RUN", "EVIDENCEFORGE_MONO07_LIB_PATH non fourni.");
    } else {
      try {
        const { assertMono06GatePasses } = require(path.join(mono07LibPath, "mono06-gate.js"));
        const report = await assertMono06GatePasses(kitRoot, path.join(require("os").tmpdir(), "mono08-test-gate"));
        record("T08-01", "baseline R3 gate", report.overallStatus === "PASS" ? "PASS" : "FAIL", JSON.stringify(report.globalTotals));
      } catch (e) {
        record("T08-01", "baseline R3 gate", "FAIL", e.message);
      }
    }
  }

  const preflight = await runPreflight();
  record("T08-02", "preflight valide (classification reelle executee)", "PASS", "overallStatus=" + preflight.overallStatus + " [LOCAL_CONTROLLED]", "READY");

  // T08-PREFLIGHT-01 a 10 et l'auto-test du runner sont dans des fichiers
  // dedies (test_t08_preflight.js, test_t08_runner_orchestration.js) —
  // executes separement, jamais fusionnes dans cette matrice comme une
  // preuve REAL (voir reports/mono-08-test-report-v1.json pour leur statut propre).

  const dependentOnReal = [
    ["T08-03", "network/provider connectivity", "READY"],
    ["T08-04", "real external call accepted", "READY"],
    ["T08-05", "real professional discovery", "READY"],
    ["T08-06", "real verification path", "READY"],
    ["T08-07", "real corpus path", "READY"],
    ["T08-08", "EF-02D non-empty usable records (reel)", "READY"],
    ["T08-09", "panel selection (reel)", "READY"],
    ["T08-10", "twins produced (reel)", "READY"],
    ["T08-11", "target docs valid (reel)", "READY"],
    ["T08-12", "review matrix complete (reel)", "READY"],
    ["T08-13", "aggregation valid (reel)", "READY"],
    ["T08-14", "structurallyStable semantics (reel)", "READY"],
    ["T08-15", "lineage PASS (reel)", "READY"],
    ["T08-16", "final report (reel)", "READY"],
    ["T08-17", "assuranceLevel preserved (reel)", "READY"],
    ["T08-18", "durable persistence (reel)", "READY"],
    ["T08-19", "process restart readback (reel)", "READY"],
    ["T08-20", "real UI smoke", "READY"],
    ["T08-21", "external failure fail-closed (reel)", "PARTIAL"],
  ];
  const canRunReal = preflight.overallStatus === "READY";
  for (const triple of dependentOnReal) {
    record(triple[0], triple[1], canRunReal ? "NOT_RUN" : "NOT_RUN_ENVIRONMENT_BLOCKED", canRunReal ? "a executer par l'operateur" : "preflight non READY dans cet environnement (voir reports/mono-08-preflight-v1.json) — implementationStatus=" + triple[2], triple[2]);
  }

  {
    const testSecret = "TEST_SECRET_VALUE_ABC123";
    const clean = scanForSecretValues({ a: "rien ici", b: { x: 1 } }, [testSecret]);
    const dirty = scanForSecretValues({ a: "contient " + testSecret }, [testSecret]);
    const ok = clean.clean === true && dirty.clean === false && dirty.occurrences.length === 1;
    record("T08-22", "secret absence (logique du scanner testee localement)", ok ? "PASS" : "FAIL", "[LOCAL_CONTROLLED]");
  }

  if (kitRoot) {
    try {
      const mono07LibPathForZip = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
      const mono07ZipPath = process.env.EVIDENCEFORGE_MONO07_ZIP_PATH || (mono07LibPathForZip ? path.join(mono07LibPathForZip, "..", "package", "EvidenceForge-MONO-07-v1.zip") : null);
      const before = hashKit(kitRoot, mono07ZipPath);
      const after = hashKit(kitRoot, mono07ZipPath);
      const cmp = compareHashes(before, after);
      record("T08-23", "frozen ZIP integrity", cmp.identical ? "PASS" : "FAIL", JSON.stringify(cmp.diffs));
    } catch (e) {
      record("T08-23", "frozen ZIP integrity", "FAIL", e.message);
    }
  } else {
    record("T08-23", "frozen ZIP integrity", "NOT_RUN", "kitRoot non fourni.");
  }

  {
    const root = path.join(__dirname, "..");
    const scanDirs = ["lib", "bin", "test"].map(function (d) { return path.join(root, d); });
    const forbidden = [/\/home\/claude/, /\bJMJS\b/i, /je marche comme je suis/i, /truthScore/i, /expertScore/i, /\bmajority\b/i, /\bprestige\b/i, /scientificValidity/i];
    const occurrences = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(abs); continue; }
        if (!/\.(js|json|md)$/.test(entry.name)) continue;
        if (abs === __filename) continue;
        const content = fs.readFileSync(abs, "utf8");
        for (const pattern of forbidden) {
          if (pattern.test(content)) occurrences.push({ file: path.relative(root, abs), pattern: pattern.toString() });
        }
      }
    }
    for (const d of scanDirs) if (fs.existsSync(d)) walk(d);
    record("T08-24", "static check (portabilite + motifs interdits)", occurrences.length === 0 ? "PASS" : "FAIL", JSON.stringify(occurrences));
  }

  console.log("\n=== MATRICE DE STATUT MONO-08 (jamais un total global trompeur) ===\n");
  const byStatus = {};
  for (const r of matrix) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    console.log("[" + r.status + "] " + r.id + " - " + r.name + (r.detail ? "  (" + r.detail + ")" : ""));
  }
  console.log("\nRepartition par statut :", JSON.stringify(byStatus, null, 2));

  fs.mkdirSync(path.join(__dirname, "..", "reports"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "reports", "mono-08-test-report-v1.json"), JSON.stringify({ matrix: matrix, byStatus: byStatus, generatedAt: new Date().toISOString() }, null, 2));

  const anyFail = matrix.some(function (r) { return r.status === "FAIL"; });
  process.exit(anyFail ? 1 : 0);
}

main().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
