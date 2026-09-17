#!/usr/bin/env node
"use strict";
/**
 * MONO-11 v0.1 — tools/anti-hardcoding-scan.js   (Charte §18, mandat §5)
 *
 * Balaye code + contrats + fixtures + tests + docs du lot a la recherche de :
 *   - professions / disciplines / experts / panels fixes ;
 *   - mapping sujet -> profession ; quota de panel ; nombre attendu de jumeaux ;
 *   - fuites du cas d'application courant : noms de candidats, identifiants
 *     d'auteurs, libelles de discipline du RunContract, identifiants de cas ;
 *   - logique conditionnelle sur un cas (`if (... jmjs ...)`) ou sur un libelle de requete.
 *
 * Les jetons SPECIFIQUES AU CAS ne sont PAS ecrits dans le lot (ce serait la fuite
 * qu'on cherche) : ils sont lus, au moment du balayage, dans les artefacts du
 * cas d'application designes par EVIDENCEFORGE_CASE_ARTIFACTS (liste de fichiers
 * JSON separes par ':'). Absents, seul le balayage generique s'applique et le
 * rapport le dit.
 *
 * Sortie : JSON { FIXED_PROFESSION_LIST, FIXED_DISCIPLINE_LIST, FIXED_EXPERT_LIST,
 *                 FIXED_PANEL_SIZE, CASE_SPECIFIC_LEAK_FOUND, DOMAIN_HARDCODING_FOUND, hits[] }
 */
const fs = require("fs"), path = require("path");
const LOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["core", "contracts", "test", "tools", "index.js", "README.md", "NON-REGRESSION.md", "ANTI-HARDCODING.md", "ANTI-CIRCULARITY.md", "THREAT-MODEL.md", "LINEAGE.md", "MANIFEST.json"];
const CODE_EXT = [".js", ".json"];

/* Motifs GENERIQUES (independants du cas) : presence = hardcoding de domaine ou de structure. */
const GENERIC_PATTERNS = [
  { id: "DOMAIN_WORD", cls: "DOMAIN_HARDCODING", re: /\b(cardiolog|oncolog|avocat|juriste|ingenieur civil|civil engineer|pharmac|kinesith|physiotherap|psycholog|ergonom|neurolog|dermatolog)\w*/i, scope: "code" },
  { id: "SUBJECT_TO_PROFESSION_MAP", cls: "DOMAIN_HARDCODING", re: /(sujet|subject|topic)\s*(->|=>|→)\s*(profession|metier|discipline)/i, scope: "code" },
  { id: "FIXED_PANEL_SIZE", cls: "FIXED_PANEL_SIZE", re: /\b(maxPanel|panelSize|expectedTwins|minPanel|panelQuota|quota)\s*[:=]\s*[1-9]\d*\b/, scope: "code" },
  { id: "EXPECTED_TWIN_COUNT", cls: "FIXED_PANEL_SIZE", re: /\b(expected|attendu)\w*\s*(twins|jumeaux)\s*[:=]\s*[1-9]/i, scope: "code" },
  { id: "IF_CASE", cls: "CASE_SPECIFIC_LEAK", re: /\bif\s*\([^)]*\b(jmjs|jmmjs|d103|p0\.?1|s01|s02)\b/i, scope: "code" },
  { id: "QUERY_LABEL_DECISION", cls: "DOMAIN_HARDCODING", re: /\bif\s*\([^)]*\b(dimensionRef|discipline|queryLineage)\b[^)]*(===|==|indexOf|includes)/, scope: "code" },
];

function walk(p, out) {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isDirectory()) { fs.readdirSync(p).forEach((n) => walk(path.join(p, n), out)); return out; }
  out.push(p); return out;
}

function loadCaseTokens() {
  const spec = process.env.EVIDENCEFORGE_CASE_ARTIFACTS;
  const tokens = new Set(), files = [];
  if (!spec) return { tokens: tokens, files: files, declared: false };
  spec.split(":").filter(Boolean).forEach(function (f) {
    if (!fs.existsSync(f)) return;
    files.push(f);
    let j; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return; }
    const visit = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach(visit); return; }
      Object.keys(o).forEach(function (k) {
        const v = o[k];
        if (typeof v === "string") {
          if (/^(displayName|candidateId|candidateRef|orcid|affiliation|id|discipline|dimensionRef)$/.test(k) && v.length > 6) tokens.add(v);
          if (k === "disciplines" ) tokens.add(v);
        } else if (Array.isArray(v) && /^(disciplines|missionLabels)$/.test(k)) v.forEach((x) => { if (typeof x === "string" && x.length > 4) tokens.add(x); });
        else visit(v);
      });
    };
    visit(j);
  });
  return { tokens: tokens, files: files, declared: true };
}

function scan() {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(LOT, d), []));
  const caseTok = loadCaseTokens();
  const hits = [];
  files.forEach(function (f) {
    const rel = path.relative(LOT, f);
    if (rel === path.relative(LOT, __filename)) return;
    const text = fs.readFileSync(f, "utf8");
    const isCode = CODE_EXT.indexOf(path.extname(f)) !== -1;
    GENERIC_PATTERNS.forEach(function (p) {
      if (p.scope === "code" && !isCode) return;
      const m = p.re.exec(text);
      if (m) hits.push({ file: rel, pattern: p.id, classification: p.cls, sample: m[0].slice(0, 60) });
    });
    caseTok.tokens.forEach(function (t) {
      if (text.indexOf(t) !== -1) hits.push({ file: rel, pattern: "CASE_TOKEN", classification: "CASE_SPECIFIC_LEAK", sample: t.slice(0, 60) });
    });
  });
  const has = (cls) => hits.some((h) => h.classification === cls);
  return {
    schema: "EvidenceForge.AntiHardcodingScan", schemaVersion: "MONO-11-v1", scannedFiles: files.length,
    caseArtifactsDeclared: caseTok.declared, caseArtifactFiles: caseTok.files, caseTokens: caseTok.tokens.size,
    FIXED_PROFESSION_LIST: has("DOMAIN_HARDCODING") ? "YES" : "NO",
    FIXED_DISCIPLINE_LIST: hits.some((h) => h.pattern === "CASE_TOKEN" || h.pattern === "QUERY_LABEL_DECISION") ? "YES" : "NO",
    FIXED_EXPERT_LIST: hits.some((h) => h.pattern === "CASE_TOKEN") ? "YES" : "NO",
    FIXED_PANEL_SIZE: has("FIXED_PANEL_SIZE") ? "YES" : "NO",
    CASE_SPECIFIC_LEAK_FOUND: has("CASE_SPECIFIC_LEAK") ? "YES" : "NO",
    DOMAIN_HARDCODING_FOUND: has("DOMAIN_HARDCODING") ? "YES" : "NO",
    hits: hits,
  };
}

if (require.main === module) {
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.hits.length ? 1 : 0);
}
module.exports = { scan, GENERIC_PATTERNS, loadCaseTokens };
