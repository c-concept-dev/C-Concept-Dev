"use strict";
// MONO-00 — T00-11/T00-12 : détection de mutation et de suppression.
// Entièrement AUTO-SUFFISANT : utilise la fixture synthétique embarquée
// (fixtures/sample-package/), jamais un chemin absolu vers un lot gelé
// réel — un test à froid sur une machine tierce ne doit dépendre que du
// contenu de CE paquet.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const SOURCE = path.join(__dirname, "fixtures", "sample-package");
const MANIFEST = "SAMPLE-MANIFEST-SHA256.txt";

function freshCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mono00-adversarial-"));
  execSync(`cp -r ${SOURCE}/* ${dir}/`);
  return dir;
}

// === T00-11 : mutation d'un fichier canonique -> détection FAIL ===
{
  const dir = freshCopy();
  fs.appendFileSync(path.join(dir, "src/sample-module.js"), "\n// mutation adversariale MONO-00\n");
  let failed = false;
  try {
    execSync(`cd ${dir} && sha256sum -c ${MANIFEST} --quiet`, { stdio: "pipe" });
  } catch (e) {
    failed = true;
  }
  check("T00-11: mutation d'un fichier canonique -> sha256sum -c échoue", failed);
}

// === T00-12 : suppression d'une entrée du manifeste -> détection ===
{
  const dir = freshCopy();
  fs.unlinkSync(path.join(dir, "src/sample-module.js"));
  const manifestLines = fs.readFileSync(path.join(dir, MANIFEST), "utf8").split("\n").filter(Boolean);
  const manifestFiles = new Set(manifestLines.map((l) => l.split(/\s+/)[1]));
  function walk(d, base) {
    let out = [];
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === MANIFEST) continue;
      const full = path.join(d, entry.name);
      const rel = path.join(base, entry.name);
      if (entry.isDirectory()) out = out.concat(walk(full, rel));
      else out.push(rel);
    }
    return out;
  }
  const realFiles = new Set(walk(dir, ""));
  const missingFromDisk = [...manifestFiles].filter((f) => !realFiles.has(f));
  check("T00-12: suppression d'un fichier -> détectée comme entrée manifeste sans fichier correspondant", missingFromDisk.length === 1 && missingFromDisk[0] === "src/sample-module.js");
}

let allPass = true;
for (const r of results) { if (!r.pass) allPass = false; console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name); }
console.log("\n" + (allPass ? "TOUS LES TESTS PASSENT (" + results.length + ")" : "ECHECS DETECTES"));
process.exit(allPass ? 0 : 1);
