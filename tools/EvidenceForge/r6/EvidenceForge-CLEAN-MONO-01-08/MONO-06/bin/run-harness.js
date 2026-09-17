#!/usr/bin/env node
"use strict";
/**
 * MONO-06 — bin/run-harness.js
 *
 * Usage :
 *   node bin/run-harness.js --kit-root <chemin racine du kit HANDOFF> [--work-root <chemin>] [--skip-tests] [--out <chemin json>]
 *
 * Ne code en dur aucun chemin de session (T06 portabilite) — le chemin du
 * kit est toujours un argument explicite, jamais un defaut implicite lie
 * a un environnement particulier.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { runHarness } = require("../lib/harness");

function parseArgs(argv) {
  const args = { workRoot: null, skipTests: false, out: null, kitRoot: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--kit-root") args.kitRoot = argv[++i];
    else if (argv[i] === "--work-root") args.workRoot = argv[++i];
    else if (argv[i] === "--skip-tests") args.skipTests = true;
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.kitRoot) {
    console.error("Usage: node bin/run-harness.js --kit-root <chemin> [--work-root <chemin>] [--skip-tests] [--out <fichier.json>]");
    process.exit(2);
  }
  const kitRoot = path.resolve(args.kitRoot);
  const workRoot = args.workRoot ? path.resolve(args.workRoot) : fs.mkdtempSync(path.join(os.tmpdir(), "mono06-"));

  const report = runHarness({ kitRoot, workRoot, skipTestExecution: args.skipTests });

  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, json);
    console.log(`Rapport ecrit: ${args.out}`);
  } else {
    console.log(json);
  }

  console.log(`\nSTATUT GLOBAL: ${report.overallStatus}`);
  process.exit(report.overallStatus === "FAIL" ? 1 : 0);
}

main();
