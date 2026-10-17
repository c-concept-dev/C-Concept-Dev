"use strict";
/** EvidenceForge MONOLITH v1.0 — lib/paths.js : resolution des chemins et INTEGRITE des lots geles au demarrage. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "monolith.config.json"), "utf8"));
const BUNDLE = path.resolve(ROOT, CONFIG.bundleRoot);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const shaFile = (p) => sha(fs.readFileSync(p));

function verifySealFile(dir, sealRel) {
  const sealPath = path.join(dir, sealRel);
  if (!fs.existsSync(sealPath)) return { verified: false, divergences: ["sceau absent : " + sealPath], files: 0 };
  const lines = fs.readFileSync(sealPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const div = [];
  lines.forEach(function (line) { const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line); if (!m) { div.push("illisible: " + line); return; }
    const p = path.join(dir, m[2]); if (!fs.existsSync(p)) div.push("absent: " + m[2]); else if (shaFile(p) !== m[1]) div.push("modifie: " + m[2]); });
  return { verified: div.length === 0, divergences: div, files: lines.length, sealSha256: shaFile(sealPath) };
}

/** Verifie TOUS les lots geles declares ; toute divergence est fatale (le produit ne demarre pas sur un lot altere). */
function verifyFrozenLots() {
  const out = {};
  Object.keys(CONFIG.frozenLots).forEach(function (k) {
    const c = CONFIG.frozenLots[k]; const dir = path.join(BUNDLE, c.dir);
    const r = verifySealFile(dir, c.seal);
    if (c.canonicalZip) { const z = path.join(BUNDLE, c.canonicalZip); r.canonicalZipSha256 = fs.existsSync(z) ? shaFile(z) : null; r.canonicalZipMatches = r.canonicalZipSha256 === c.canonicalZipSha256; if (!r.canonicalZipMatches) { r.verified = false; r.divergences.push("zip canonique " + (r.canonicalZipSha256 ? "different" : "absent")); } }
    out[k] = Object.assign({ dir: dir }, r);
  });
  const altered = Object.keys(out).filter((k) => !out[k].verified);
  if (altered.length) { const e = new Error("FROZEN_LOT_ALTERED: " + altered.map((k) => k + " (" + out[k].divergences.slice(0, 2).join("; ") + ")").join(" ; ")); e.code = "FROZEN_LOT_ALTERED"; e.details = out; throw e; }
  return out;
}

const P = Object.freeze({
  ROOT: ROOT, CONFIG: CONFIG, BUNDLE: BUNDLE,
  MONO01: path.join(BUNDLE, "MONO-01"), MONO02: path.join(BUNDLE, "MONO-02"), MONO04: path.join(BUNDLE, "MONO-04"), MONO05: path.join(BUNDLE, "MONO-05"), MONO07_LIB: path.join(BUNDLE, "MONO-07", "lib"),
  MONO08_V06: path.join(BUNDLE, "MONO-08", "v0.6"), MONO08_V08: path.join(BUNDLE, "MONO-08", "v0.8"),
  MONO09: path.join(BUNDLE, "MONO-09", "v0.2"), MONO10: path.join(BUNDLE, "MONO-10", "v0.19"), MONO11: path.join(BUNDLE, CONFIG.frozenLots["MONO-11"].dir),   /* v1.0.4 : une seule source de verite (config) pour le lot MONO-11 */
  MONO11_ZIP: path.join(BUNDLE, CONFIG.frozenLots["MONO-11"].canonicalZip), MONO11_VERSION: CONFIG.frozenLots["MONO-11"].version,
  EF01B: path.resolve(ROOT, CONFIG.operatorKit.ef01bRoot), EF01C1: path.resolve(ROOT, CONFIG.operatorKit.ef01c1Root),
  KIT: path.join(ROOT, "vendor", "operator-kit-r1.3"),
  RUNS: process.env.EVIDENCEFORGE_RUNS_ROOT ? path.resolve(process.env.EVIDENCEFORGE_RUNS_ROOT) : path.resolve(ROOT, CONFIG.runsRoot),   // EVIDENCEFORGE_RUNS_ROOT : isolation (tests)
  sha: sha, shaFile: shaFile, verifyFrozenLots: verifyFrozenLots, verifySealFile: verifySealFile,
});
module.exports = P;
