#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0 — tools/secret-scan.js
 * Verifie qu'AUCUN secret n'est embarque : cles API (motifs), URL de worker, jetons Bearer litteraux, et — si l'environnement
 * du scanner porte EVIDENCEFORGE_WORKER_API_KEY / LLM_WORKER_BASE_URL — que leurs VALEURS n'apparaissent dans aucun fichier
 * du paquet (les valeurs ne sont jamais imprimees ; seule leur presence est indiquee). Code de retour 1 si un hit.
 */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PATTERNS = [/sk-ant-[A-Za-z0-9_-]{10,}/, /sk-[A-Za-z0-9]{32,}/, /authorization:\s*["'`]Bearer\s+[A-Za-z0-9._-]{16,}/i, /https:\/\/[a-z0-9.-]+\.workers\.dev/i, /AKIA[0-9A-Z]{16}/, /-----BEGIN (RSA |EC |)PRIVATE KEY-----/, /EVIDENCEFORGE_WORKER_API_KEY\s*=\s*["'][^"']+["']/, /LLM_WORKER_BASE_URL\s*=\s*["']https?:/];
function walk(dir, out) { fs.readdirSync(dir).forEach(function (f) { const p = path.join(dir, f); const st = fs.statSync(p); if (st.isDirectory()) { if (["runs", "node_modules", ".git", "scratch"].indexOf(f) === -1) walk(p, out); } else out.push(p); }); return out; }
function scan(root) {
  const files = walk(root || ROOT, []); const hits = []; const envVals = ["EVIDENCEFORGE_WORKER_API_KEY", "LLM_WORKER_BASE_URL"].map((k) => ({ k, v: process.env[k] })).filter((x) => x.v && x.v.length >= 8);
  files.forEach(function (f) { if (/\.(zip|png|jpg|pdf)$/.test(f)) return; const txt = fs.readFileSync(f, "utf8"); const rel = path.relative(root || ROOT, f);
    if (rel === "tools/secret-scan.js") return;
    PATTERNS.forEach((re) => { if (re.test(txt)) hits.push({ file: rel, pattern: String(re) }); });
    envVals.forEach((x) => { if (txt.indexOf(x.v) !== -1) hits.push({ file: rel, pattern: "VALUE_OF_" + x.k }); }); });
  return { ok: hits.length === 0, filesScanned: files.length, envValuesChecked: envVals.map((x) => x.k), hits };
}
if (require.main === module) { const r = scan(); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
module.exports = { scan, PATTERNS };
