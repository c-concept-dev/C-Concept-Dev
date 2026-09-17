#!/usr/bin/env node
"use strict";
/** MONOLITH v1.0 — tools/build-manifest.js : MANIFEST.json + SHA256SUMS.txt du paquet (hors runs/, hors les deux fichiers produits). */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
function walk(dir, out) { fs.readdirSync(dir).sort().forEach(function (f) { const p = path.join(dir, f); const st = fs.statSync(p); if (st.isDirectory()) { if (["runs", "node_modules", "scratch"].indexOf(f) === -1) walk(p, out); } else out.push(p); }); return out; }
function build() {
  const files = walk(ROOT, []).map((p) => path.relative(ROOT, p)).filter((r) => r !== "MANIFEST.json" && r !== "SHA256SUMS.txt" && !r.endsWith(".zip"));
  const entries = files.map((r) => ({ path: r, sha256: sha(path.join(ROOT, r)), bytes: fs.statSync(path.join(ROOT, r)).size }));
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "monolith.config.json"), "utf8"));
  /* v1.0.4 — PROVENANCE MESUREE (jamais tapee) : sceau MONO-11 par la garde reelle, sceaux des lots geles verifies, resultats de tests lus, contrat de validation lu dans lib/llm.js */
  const P = require("../lib/paths.js"); const SP = require("../lib/stage-professionals.js"); const { SEAL } = SP.loadSealedMono11(); const lots = P.verifyFrozenLots();
  const frozenMeasured = {}; Object.keys(lots).forEach((k) => { frozenMeasured[k] = { files: lots[k].files, divergences: lots[k].divergences.length, sealSha256: lots[k].sealSha256 || null, canonicalZipSha256: lots[k].canonicalZipSha256 || null }; });
  const resultsPath = path.join(ROOT, "test", "results.json"); const tr = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, "utf8")) : null;
  const vc = /VALIDATION_CONTRACT = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "lib", "llm.js"), "utf8"));
  const integration = { mono11: { version: SEAL.mono11Version, zipSha256: SEAL.mono11ZipSha256, runtimeSealSha256: SEAL.runtimeSealSha256, sourceSealHash: SEAL.runtimeSealSha256, runCodeHash: SEAL.runCodeHash, manifestSha256: SEAL.mono11ManifestSha256 || null, validationContract: vc ? vc[1] : null,
      note: "sourceSealHash = runtimeSealSha256 du lot MONO-11 charge : cle de contexte de la reuse (lib/llm.js reuseContextCheck) ; validationContract = contrat SCIENTIFIQUE (inchange), distinct de la version du code" },
    predecessor: { version: "MONOLITH-v1.0.3-r1", zipSha256: "9034a95fe101090b57b9addeffc9cb1a8eb0567b07ed6e62c001035f295e3ff4", mono11: "v0.2 (zip 5c208cbbd13231e732fe20475347f9f7cbe6f890f3ce4823581093c7eba60005)" },
    frozenLotsMeasured: frozenMeasured, tests: tr ? { total: tr.total, passed: tr.passed, failed: tr.failed, ranAt: tr.ranAt } : null,
    professionals: { maxCandidatesToEvaluate: cfg.professionals.maxCandidatesToEvaluate, selection: "PROFESSIONAL-SELECTION-v1 (inchangee)" },
    provenance: "Integration controlee MONO-11 v0.3-r1 (GELE, decision de gouvernance 2026-09-16) dans MONOLITH v1.0.3-r1 : composition + adaptation (config, chemins, version attendue par la garde de sceau, libelles) ; aucun code du lot copie ni modifie ; contrat scientifique, validateur, cap 150, checkpoints, lignee, reuse inchanges.",
    status: "IMPLEMENTATION GELABLE (candidat) — NON GELE : audit independant differentiel requis ; aucun run reel (H1/H2) effectue sous cette version" };
  const manifest = { schema: "EvidenceForge.MonolithManifest", product: cfg.product, generatedAt: new Date().toISOString(), frozenLots: cfg.frozenLots, integration: integration, files: entries, fileCount: entries.length,
    contentHash: crypto.createHash("sha256").update(entries.map((e) => e.sha256 + "  " + e.path).join("\n")).digest("hex") };
  fs.writeFileSync(path.join(ROOT, "SHA256SUMS.txt"), entries.map((e) => e.sha256 + "  " + e.path).join("\n") + "\n");
  fs.writeFileSync(path.join(ROOT, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
function verify() { const lines = fs.readFileSync(path.join(ROOT, "SHA256SUMS.txt"), "utf8").trim().split("\n"); const bad = []; lines.forEach((l) => { const [h, r] = l.split(/\s+/); if (!fs.existsSync(path.join(ROOT, r)) || sha(path.join(ROOT, r)) !== h) bad.push(r); }); return { ok: bad.length === 0, files: lines.length, bad }; }
if (require.main === module) { if (process.argv[2] === "--verify") { const v = verify(); console.log(JSON.stringify(v)); process.exit(v.ok ? 0 : 1); } const m = build(); console.log("MANIFEST " + m.fileCount + " fichiers, contentHash " + m.contentHash); }
module.exports = { build, verify };
