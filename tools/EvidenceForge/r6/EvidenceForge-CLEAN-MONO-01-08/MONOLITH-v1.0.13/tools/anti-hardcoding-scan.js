#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0 — tools/anti-hardcoding-scan.js
 * Refuse toute constante de CAS dans le code du produit : identifiants de mission, noms de cas, disciplines, noms de candidats,
 * effectifs de panel/quota, references d'un run particulier. Les jetons de cas viennent de EVIDENCEFORGE_CASE_ARTIFACTS
 * (fichiers JSON d'un run reel : les noms/identifiants qu'ils contiennent ne doivent apparaitre nulle part dans le code).
 * Sortie : { ok, hits[] } ; code de retour 1 si un hit.
 */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SCAN = ["lib", "server.js", "index.html", "config/monolith.config.json", "tools", "test"];
/* v1.0.5 : jetons du run reel JMJS/D103P0.1 (cas de test, jamais des regles) : COSMIN, framework d'ingenierie ontologique, "Responsible AI" ; quotas/seuils numeriques de professionnels ou de sources */
const FORBIDDEN = [/\bJMJS\b/i, /\bD103\b/, /\bS0[12]\b/, /ma-mission-001/, /\bCOSMIN\b/i, /ontology engineering framework/i, /\bResponsible AI\b/i, /maxPsychometric/i, /earlyStop(Threshold|Rank|At)\s*[:=]\s*\d+/i, /\b(48|110|36|88|22) (candidats?|sources?|professionnels?)\b/i, /quota\s*[:=]\s*\d+/i, /panelSize\s*[:=]\s*\d+/i, /fixedPanel/i,
  /sciences-information-documentation/, /sante-publique/, /\bA5\d{9,10}\b/, /snapshot-00c24be44264/, /00c24be4426458639bbca5de12df14937a8408dda/, /c26415e3300ab926b0ef8447913e6db45ce4d289/];
function listFiles(p) { const a = path.join(ROOT, p); if (!fs.existsSync(a)) return []; const st = fs.statSync(a); if (st.isFile()) return [a]; return fs.readdirSync(a).flatMap((f) => listFiles(path.join(p, f))); }
function caseTokens() {
  const env = process.env.EVIDENCEFORGE_CASE_ARTIFACTS; if (!env) return [];
  const toks = new Set();
  env.split(":").filter(Boolean).forEach(function (f) { if (!fs.existsSync(f)) return; let j; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return; }
    (function walk(v) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.keys(v).forEach((k) => { if (["displayName", "missionId", "snapshotId", "runId", "candidateRef", "orcid", "affiliation", "titre", "title", "sourceId", "doi"].indexOf(k) !== -1 && typeof v[k] === "string" && v[k].length >= 12) toks.add(v[k]); walk(v[k]); }); })(j); });   /* v1.0.5 : titres/identifiants de sources d'un run reel = jetons interdits */
  return Array.from(toks);
}
function scan(files, extraTokens) {
  const hits = [];
  files.forEach(function (f) { if (f.endsWith(".zip") || /\.(png|jpg)$/.test(f)) return; const txt = fs.readFileSync(f, "utf8"); const rel = path.relative(ROOT, f);
    if (rel === "tools/anti-hardcoding-scan.js" || rel === "test/results.json") return;   /* le scanner porte ses propres motifs ; results.json cite les libelles des tests */
    FORBIDDEN.forEach((re) => { const m = re.exec(txt); if (m) hits.push({ file: rel, pattern: String(re), sample: m[0] }); });
    (extraTokens || []).forEach((t) => { if (txt.indexOf(t) !== -1) hits.push({ file: rel, pattern: "case-token", sample: t }); }); });
  return hits;
}
if (require.main === module) {
  const files = SCAN.flatMap(listFiles); const hits = scan(files, caseTokens());
  console.log(JSON.stringify({ ok: hits.length === 0, filesScanned: files.length, caseTokens: caseTokens().length, hits }, null, 2)); process.exit(hits.length ? 1 : 0);
}
module.exports = { scan, listFiles, FORBIDDEN, caseTokens, SCAN };
