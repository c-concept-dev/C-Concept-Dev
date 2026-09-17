"use strict";
// test/run-all.js — execute toute la suite de tests MONO-07 (unit + e2e +
// browser). Resolution du kit STRICTEMENT via resolveKitRoot().
//
// BUG CORRIGE (audit independant) : une version anterieure appliquait un
// retry generique (jusqu'a 3 essais) a TOUTE exception, y compris un echec
// d'assertion fonctionnelle reel - pouvant masquer une vraie regression.
// Politique corrigee : voir lib/runner-policy.js. Node/API n'a JAMAIS de
// retry. Browser n'a un retry (unique) que si la premiere tentative est
// classifiee INFRASTRUCTURE (jamais sur un echec fonctionnel).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { resolveKitRoot } = require("../lib/kit-root");
const { runWithPolicy } = require("../lib/runner-policy");

let kitRoot;
try {
  kitRoot = resolveKitRoot();
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

function listTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith("test_") && f.endsWith(".js")).map((f) => path.join(dir, f)).sort();
}

function runGroup(files, kitRoot, group) {
  let total = 0;
  let anyFailed = false;
  const perFile = [];
  for (const f of files) {
    const fileLabel = path.relative(path.join(__dirname), f);
    console.log("\n=== " + fileLabel + " (groupe: " + group + ") ===");
    const runFn = function () {
      return execFileSync(process.execPath, [f, kitRoot], { encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
    };
    const result = runWithPolicy(runFn, group);

    for (const a of result.attempts) {
      console.log(
        "  tentative " + a.attempt + " - classification=" + a.classification + " status=" + a.status + " signal=" + a.signal + " duree=" + a.durationMs + "ms" +
        (a.stderrExcerpt ? " stderr=\"" + a.stderrExcerpt.slice(0, 200) + "\"" : "")
      );
    }

    if (result.ok) {
      process.stdout.write(result.out);
      const m = result.out.match(/TOUS LES TESTS PASSENT \((\d+)\)/);
      if (m) {
        total += parseInt(m[1], 10);
        perFile.push({ file: fileLabel, tests: parseInt(m[1], 10), status: "PASS", attempts: result.attempts });
      } else {
        anyFailed = true;
        perFile.push({ file: fileLabel, tests: 0, status: "FAIL", attempts: result.attempts });
      }
    } else {
      anyFailed = true;
      const e = result.err;
      process.stdout.write((e && e.stdout) || "");
      process.stderr.write((e && e.stderr) || "");
      const lastClassification = result.attempts[result.attempts.length - 1].classification;
      console.log("ECHEC DEFINITIF (" + result.attempts.length + " tentative(s), derniere classification=" + lastClassification + ") : " + fileLabel);
      perFile.push({ file: fileLabel, tests: 0, status: "ERROR", attempts: result.attempts });
    }
  }
  return { total: total, anyFailed: anyFailed, perFile: perFile };
}

const nodeApiFiles = listTestFiles(path.join(__dirname, "unit")).concat(listTestFiles(path.join(__dirname, "e2e")));
const browserFiles = listTestFiles(path.join(__dirname, "browser"));

const nodeApiGroup = runGroup(nodeApiFiles, kitRoot, "node-api");
const browserGroup = browserFiles.length > 0 ? runGroup(browserFiles, kitRoot, "browser") : null;

const anyFailed = nodeApiGroup.anyFailed || (browserGroup && browserGroup.anyFailed);
const totalGlobal = nodeApiGroup.total + (browserGroup ? browserGroup.total : 0);

console.log("\n============================================");
console.log("TESTS NODE/API : " + nodeApiGroup.total);
if (browserGroup) {
  console.log("TESTS BROWSER  : " + browserGroup.total);
} else {
  console.log("TESTS BROWSER  : AUCUN FICHIER TROUVE (test/browser/ absent ou vide)");
}
console.log("TOTAL GLOBAL   : " + totalGlobal);
console.log("TOTAL CUMULE : " + totalGlobal + " tests");
console.log(anyFailed || !browserGroup ? "ECHECS PRESENTS" : "AUCUNE REGRESSION");
console.log(JSON.stringify({ nodeApi: nodeApiGroup.perFile, browser: browserGroup ? browserGroup.perFile : null }, null, 2));
process.exit(anyFailed || !browserGroup ? 1 : 0);
