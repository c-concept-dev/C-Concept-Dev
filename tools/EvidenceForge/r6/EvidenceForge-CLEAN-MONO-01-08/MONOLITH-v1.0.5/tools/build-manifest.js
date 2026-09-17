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
    predecessor: { version: "MONOLITH-v1.0.4", zipSha256: "97b999adcff395ab49f7cd33e8e70bab767c7df22ffdda0967771db5595dd961", mono11: "v0.3-r1 (zip 3c44b397dda0997d0fff6ab4c8e8a8b311430e6a5ac7aeee38149f8349296b0b), inchange" },
    /* v1.0.5 — autorite de tarification mesuree (version + hash du snapshot canonique) */
    pricing: (function () { try { const pr = require("../lib/pricing.js").createPricing(); return { version: pr.version, snapshotHash: pr.hash, models: pr.snapshot().models.map((m) => m.model) }; } catch (e) { return { error: e.code || e.message }; } })(),
    frozenLotsMeasured: frozenMeasured, tests: tr ? { total: tr.total, passed: tr.passed, failed: tr.failed, ranAt: tr.ranAt } : null,
    professionals: { maxCandidatesToEvaluate: cfg.professionals.maxCandidatesToEvaluate, selection: "PROFESSIONAL-SELECTION-v1 (inchangee)", capIsGuardNotTarget: true, earlyStopPolicy: "NONE" },
    provenance: "MONOLITH v1.0.5 = v1.0.4 (GELEE, inchangee) + couche additive : ledger de cout (tarif versionne, snapshot par run), budget dur par run (verifie avant chaque appel reel, BUDGET_LIMIT_REACHED reprenable), projection separee, revue de portefeuille du corpus (notADecision) avant la Porte 2, economie du panel (mesure, aucun early-stop), assistant de cadrage hors run, aide. Lots geles MONO-01..MONO-11, EF-01B/EF-01C1, MONO-04 : aucun fichier touche. Contrat scientifique, validateur, cap 150, checkpoints, lignee, reuse inchanges.",
    status: "CANDIDAT (v1.0.5) — NON GELE : tests fonctionnels/adversariaux passes ; audit independant differentiel et run reel sous cette version requis avant gel" };
  const manifest = { schema: "EvidenceForge.MonolithManifest", product: cfg.product, generatedAt: new Date().toISOString(), frozenLots: cfg.frozenLots, integration: integration, files: entries, fileCount: entries.length,
    contentHash: crypto.createHash("sha256").update(entries.map((e) => e.sha256 + "  " + e.path).join("\n")).digest("hex") };
  fs.writeFileSync(path.join(ROOT, "SHA256SUMS.txt"), entries.map((e) => e.sha256 + "  " + e.path).join("\n") + "\n");
  fs.writeFileSync(path.join(ROOT, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
function verify() { const lines = fs.readFileSync(path.join(ROOT, "SHA256SUMS.txt"), "utf8").trim().split("\n"); const bad = []; lines.forEach((l) => { const [h, r] = l.split(/\s+/); if (!fs.existsSync(path.join(ROOT, r)) || sha(path.join(ROOT, r)) !== h) bad.push(r); }); return { ok: bad.length === 0, files: lines.length, bad }; }
if (require.main === module) { if (process.argv[2] === "--verify") { const v = verify(); console.log(JSON.stringify(v)); process.exit(v.ok ? 0 : 1); } const m = build(); console.log("MANIFEST " + m.fileCount + " fichiers, contentHash " + m.contentHash); }
module.exports = { build, verify };
