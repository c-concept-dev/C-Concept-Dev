"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { runPackageCheck } = require("./package-check.js");

function collect(dir) {
  return fs.readdirSync(dir).filter((f) => f.startsWith("test_") && f.endsWith(".js")).sort().map((f) => path.join(dir, f));
}

let totalTests = 0;
let anyFailed = false;

function runFile(full) {
  console.log("\n=== " + path.relative(__dirname, full) + " ===");
  try {
    const out = execFileSync(process.execPath, [full], { encoding: "utf8", stdio: "pipe", cwd: __dirname });
    process.stdout.write(out);
    const m = out.match(/TOUS LES TESTS PASSENT \((\d+)\)/);
    if (m) totalTests += parseInt(m[1], 10);
  } catch (e) {
    anyFailed = true;
    process.stdout.write(e.stdout || "");
    process.stderr.write(e.stderr || "");
    const m = (e.stdout || "").match(/TOUS LES TESTS PASSENT \((\d+)\)/);
    if (m) totalTests += parseInt(m[1], 10);
  }
}

(async () => {
  for (const f of [...collect(path.join(__dirname, "unit")), ...collect(path.join(__dirname, "integration"))]) {
    runFile(f);
  }

  console.log("\n=== test/package-check.js ===");
  const packageCheck = await runPackageCheck();
  if (!packageCheck.ok) {
    console.log(`FAIL — [${packageCheck.reason}] ${packageCheck.message}` + (packageCheck.cause ? `\n  cause: ${packageCheck.cause}` : ""));
    console.log("\n=== tests navigateur ===");
    console.log("NON EXÉCUTÉS — Playwright/Chromium indisponible dans cet environnement. Procédure : npm ci && npx playwright install chromium && npm test");
    anyFailed = true;
  } else {
    console.log("PASS — playwright résolu et chromium.launch() réussit dans cet environnement.");
    for (const f of collect(path.join(__dirname, "browser"))) {
      runFile(f);
    }
  }

  console.log("\n============================================");
  console.log("TOTAL CUMULE : " + totalTests + " tests");
  console.log(anyFailed ? "REGRESSION DETECTEE" : "AUCUNE REGRESSION");
  if (anyFailed) process.exit(1);
})();
