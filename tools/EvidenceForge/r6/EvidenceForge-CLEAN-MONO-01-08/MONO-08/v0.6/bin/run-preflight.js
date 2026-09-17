#!/usr/bin/env node
"use strict";
/**
 * bin/run-preflight.js — CLI portable. Exit codes :
 *   0 = READY, 2 = ENVIRONMENT_BLOCKED, 3 = PRODUCT_CONFIG_ERROR
 */

const fs = require("fs");
const path = require("path");
const { runPreflight } = require("../lib/preflight");

async function main() {
  let report;
  try {
    report = await runPreflight();
  } catch (e) {
    console.error("PRODUCT_CONFIG_ERROR:", e.message);
    process.exit(3);
  }

  console.log(JSON.stringify(report, null, 2));

  const outDir = path.join(__dirname, "..", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "mono-08-preflight-v1.json"), JSON.stringify(report, null, 2));

  if (report.overallStatus === "READY") {
    process.exit(0);
  } else {
    process.exit(2);
  }
}

main();
