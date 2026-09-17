"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.startsWith("test_") && f.endsWith(".js"))
  .sort();

let totalTests = 0;
let anyFailed = false;

for (const f of files) {
  const full = path.join(__dirname, f);
  console.log("\n=== " + f + " ===");
  try {
    const out = execFileSync(process.execPath, [full], { encoding: "utf8", stdio: "pipe", cwd: __dirname });
    process.stdout.write(out);
    const m = out.match(/TOUS LES TESTS PASSENT \((\d+)\)/);
    if (m) totalTests += parseInt(m[1], 10);
    else anyFailed = true;
  } catch (e) {
    anyFailed = true;
    process.stdout.write(e.stdout || "");
    process.stderr.write(e.stderr || "");
    console.log("ECHEC : " + f);
  }
}

console.log("\n============================================");
console.log("TOTAL CUMULE : " + totalTests + " tests");
console.log(anyFailed ? "ECHECS PRESENTS" : "AUCUNE REGRESSION");
process.exit(anyFailed ? 1 : 0);
