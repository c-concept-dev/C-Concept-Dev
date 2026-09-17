"use strict";
/**
 * MONO-11 v0.2 — core/run-seal-guard.js   (mandat v0.2 §1 ; audit v0.1 F1)
 *
 * SCELLER AVANT D'EXECUTER. Dans le run v0.1, l'orchestrateur a ete modifie 68 s apres le run
 * final, avant le scellement : le run n'etait pas attribuable octet pour octet au lot scelle.
 *
 * Ce garde est appele par tout run reel AVANT la premiere action :
 *   - verifie que chaque fichier scelle (SHA256SUMS.txt du lot) est present et inchange ;
 *   - verifie qu'aucun fichier de code non scelle ne se trouve dans core/ ou contracts/ ;
 *   - calcule runtimeSealSha256 (hash du fichier de sceau), runCodeHash (hash des sources core/
 *     + contracts + index.js dans l'ordre du sceau), mono11ManifestSha256, et compare le zip
 *     canonique fourni par l'exploitant (mono11ZipSha256) a sa valeur attendue ;
 *   - toute divergence => RUN_ON_UNSEALED_CODE, jamais un avertissement.
 * Le resultat est ECRIT dans l'etat du run et dans l'ancre du ledger.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const shaFile = (p) => sha(fs.readFileSync(p));
const CODE_DIRS = ["core", "contracts"], CODE_FILES = ["index.js"];

function readSeal(lotDir) {
  const sealPath = path.join(lotDir, "SHA256SUMS.txt");
  if (!fs.existsSync(sealPath)) return null;
  return { path: sealPath, entries: fs.readFileSync(sealPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map(function (line) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line); return m ? { sha256: m[1], file: m[2] } : { invalid: line };
  }) };
}

function walk(d, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach((n) => { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); }); return out; }

/**
 * assertSealedRuntime({ lotDir, expectedZipSha256?, zipPath?, expectedVersion })
 * -> { sealed: true, mono11Version, runtimeSealSha256, runCodeHash, mono11ManifestSha256, mono11ZipSha256, sealedFiles, verifiedAt }
 * Leve RUN_ON_UNSEALED_CODE sur toute divergence.
 */
function assertSealedRuntime(input) {
  input = input || {};
  const lotDir = input.lotDir || path.resolve(__dirname, "..");
  const problems = [];
  const seal = readSeal(lotDir);
  if (!seal) throw fail("RUN_ON_UNSEALED_CODE", "aucun SHA256SUMS.txt : le lot n'est pas scelle — le run est refuse.", { lotDir });
  seal.entries.forEach(function (e) {
    if (e.invalid) { problems.push("ligne de sceau illisible : " + e.invalid); return; }
    const p = path.join(lotDir, e.file);
    if (!fs.existsSync(p)) problems.push("fichier scelle absent : " + e.file);
    else if (shaFile(p) !== e.sha256) problems.push("fichier scelle modifie : " + e.file);
  });
  /* code non scelle : tout fichier de code present sur disque mais absent du sceau */
  const sealedSet = new Set(seal.entries.map((e) => e.file));
  const onDisk = CODE_DIRS.flatMap((d) => walk(path.join(lotDir, d), [])).concat(CODE_FILES.map((f) => path.join(lotDir, f)).filter(fs.existsSync)).map((p) => path.relative(lotDir, p));
  onDisk.forEach((rel) => { if (!sealedSet.has(rel)) problems.push("fichier de code NON scelle present : " + rel); });
  const manifestPath = path.join(lotDir, "MANIFEST.json");
  if (!fs.existsSync(manifestPath)) problems.push("MANIFEST.json absent");
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (e) { problems.push("MANIFEST.json illisible"); }
  if (manifest && input.expectedVersion && manifest.version !== input.expectedVersion) problems.push("version du manifeste " + manifest.version + " != " + input.expectedVersion);
  let zipSha = null;
  if (input.zipPath) {
    if (!fs.existsSync(input.zipPath)) problems.push("zip canonique absent : " + input.zipPath);
    else { zipSha = shaFile(input.zipPath); if (input.expectedZipSha256 && zipSha !== input.expectedZipSha256) problems.push("zip canonique different de la valeur attendue"); }
  }
  if (problems.length) throw fail("RUN_ON_UNSEALED_CODE", problems.slice(0, 5).join(" ; "), { problems });
  const codeFiles = seal.entries.filter((e) => !e.invalid && (CODE_DIRS.some((d) => e.file.indexOf(d + "/") === 0) || CODE_FILES.indexOf(e.file) !== -1)).sort((a, b) => a.file.localeCompare(b.file));
  const runCodeHash = sha(codeFiles.map((e) => e.file + "\n" + e.sha256 + "\n").join(""));
  return Object.freeze({
    sealed: true, mono11Version: manifest ? manifest.version : null, lotDir: lotDir,
    runtimeSealSha256: shaFile(seal.path), runCodeHash: runCodeHash, mono11ManifestSha256: shaFile(manifestPath),
    mono11ZipSha256: zipSha, sealedFiles: seal.entries.length, codeFilesSealed: codeFiles.length, verifiedAt: new Date().toISOString(),
  });
}

function fail(code, message, details) { const e = new Error(code + ": " + message); e.code = code; e.details = details || null; return e; }

module.exports = { assertSealedRuntime, readSeal };
