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
  const manifest = { schema: "EvidenceForge.MonolithManifest", product: cfg.product, generatedAt: new Date().toISOString(), frozenLots: cfg.frozenLots, files: entries, fileCount: entries.length,
    contentHash: crypto.createHash("sha256").update(entries.map((e) => e.sha256 + "  " + e.path).join("\n")).digest("hex") };
  fs.writeFileSync(path.join(ROOT, "SHA256SUMS.txt"), entries.map((e) => e.sha256 + "  " + e.path).join("\n") + "\n");
  fs.writeFileSync(path.join(ROOT, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
function verify() { const lines = fs.readFileSync(path.join(ROOT, "SHA256SUMS.txt"), "utf8").trim().split("\n"); const bad = []; lines.forEach((l) => { const [h, r] = l.split(/\s+/); if (!fs.existsSync(path.join(ROOT, r)) || sha(path.join(ROOT, r)) !== h) bad.push(r); }); return { ok: bad.length === 0, files: lines.length, bad }; }
if (require.main === module) { if (process.argv[2] === "--verify") { const v = verify(); console.log(JSON.stringify(v)); process.exit(v.ok ? 0 : 1); } const m = build(); console.log("MANIFEST " + m.fileCount + " fichiers, contentHash " + m.contentHash); }
module.exports = { build, verify };
