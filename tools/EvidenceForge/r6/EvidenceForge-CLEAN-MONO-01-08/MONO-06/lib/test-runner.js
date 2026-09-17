"use strict";
/**
 * MONO-06 — test-runner.js  (T06-05 a T06-11)
 *
 * Execute REELLEMENT la suite de tests de chaque artefact, exclusivement
 * dans son EXECUTION WORKSPACE. Toute commande externe passe par
 * execWithTimeout (aucun execFileSync nu, aucune execution sans timeout
 * — correction post-audit du 30 aout 2026).
 *
 * PROTOCOLE MONO-05 (correction post-audit) : le CDC officiel exige
 * explicitement "65/65 avec npm ci + Chromium" pour MONO-05 (T06-10).
 * Une premiere version utilisait `npm install` pour tous les artefacts,
 * y compris MONO-05 — ce n'est PAS le protocole gele de ce lot (son
 * propre README documente `npm ci` comme methode de reference). Corrige
 * en distinguant explicitement npmInstallMode: "ci" (MONO-05) vs
 * "install" (les autres, dont aucun package-lock.json n'est fourni pour
 * garantir `npm ci`).
 */

const fs = require("fs");
const path = require("path");
const { execWithTimeout, TIMEOUTS_MS } = require("./exec-with-timeout");

function countFromOutput(output) {
  const totalCumule = output.match(/TOTAL CUMULE\s*:\s*(\d+)\s*tests/);
  if (totalCumule) return { count: parseInt(totalCumule[1], 10), method: "TOTAL_CUMULE" };

  const passesLines = [...output.matchAll(/TOUS LES TESTS PASSENT\s*\((\d+)\)/g)];
  if (passesLines.length > 0) {
    const sum = passesLines.reduce((acc, m) => acc + parseInt(m[1], 10), 0);
    return { count: sum, method: `SUM_TOUS_LES_TESTS_PASSENT(${passesLines.length}_fichiers)` };
  }

  const fallbackPassLines = output.split("\n").filter((l) => /\bPASS\s*$/.test(l.trim()));
  if (fallbackPassLines.length > 0) {
    return { count: fallbackPassLines.length, method: "FALLBACK_COUNT_PASS_LINES" };
  }

  return { count: null, method: "AUCUN_MOTIF_RECONNU" };
}

function runNpmArtifact(executionDir, artifact) {
  if (artifact.npmInstall) {
    let installResult;
    if (artifact.npmInstallPackage) {
      // Installation historique deterministe (correction post-audit) : version
      // exacte figee, jamais "latest" — voir artifact-registry.js pour la
      // provenance documentee de cette version.
      const pkgSpec = artifact.npmInstallPackageVersion
        ? `${artifact.npmInstallPackage}@${artifact.npmInstallPackageVersion}`
        : artifact.npmInstallPackage;
      installResult = execWithTimeout(
        "npm", ["install", "--no-save", pkgSpec],
        { cwd: executionDir, encoding: "utf8" },
        TIMEOUTS_MS.DEPENDENCY_INSTALL_TIMEOUT, "DEPENDENCY_INSTALL_TIMEOUT"
      );
    } else if (artifact.npmInstallMode === "ci") {
      // Protocole gele de MONO-05 (voir README du lot) : npm ci, jamais npm install.
      installResult = execWithTimeout(
        "npm", ["ci"],
        { cwd: executionDir, encoding: "utf8" },
        TIMEOUTS_MS.DEPENDENCY_INSTALL_TIMEOUT, "DEPENDENCY_INSTALL_TIMEOUT"
      );
    } else {
      installResult = execWithTimeout(
        "npm", ["install"],
        { cwd: executionDir, encoding: "utf8" },
        TIMEOUTS_MS.DEPENDENCY_INSTALL_TIMEOUT, "DEPENDENCY_INSTALL_TIMEOUT"
      );
    }
    if (!installResult.ok) {
      return {
        status: "FAIL",
        phase: installResult.timedOut ? "install_timeout" : "install",
        timedOut: installResult.timedOut,
        error: installResult.error,
        stderrTail: (installResult.stderr || "").split("\n").slice(-10).join("\n")
      };
    }

    if (artifact.playwrightInstall) {
      const pwResult = execWithTimeout(
        "npx", ["playwright", "install", "chromium"],
        { cwd: executionDir, encoding: "utf8" },
        TIMEOUTS_MS.BROWSER_INSTALL_TIMEOUT, "BROWSER_INSTALL_TIMEOUT"
      );
      if (!pwResult.ok) {
        return {
          status: "FAIL",
          phase: pwResult.timedOut ? "playwright_install_timeout" : "playwright_install",
          timedOut: pwResult.timedOut,
          error: pwResult.error
        };
      }
    }
  }

  const testResult = execWithTimeout(
    "npm", ["test"],
    { cwd: executionDir, encoding: "utf8" },
    TIMEOUTS_MS.TEST_TIMEOUT, "TEST_TIMEOUT"
  );

  if (testResult.timedOut) {
    return { status: "FAIL", phase: "test_timeout", timedOut: true, error: testResult.error };
  }

  const combinedOutput = (testResult.stdout || "") + "\n" + (testResult.stderr || "");
  const { count, method } = countFromOutput(combinedOutput);
  const status = testResult.exitCode === 0 && count === artifact.expectedTests ? "PASS" : "FAIL";
  return {
    status,
    exitCode: testResult.exitCode,
    testsObserved: count,
    testsExpected: artifact.expectedTests,
    countMethod: method,
    npmInstallMode: artifact.npmInstallMode === "ci" ? "ci" : (artifact.npmInstall ? "install" : "none"),
    outputTail: combinedOutput.split("\n").slice(-15).join("\n")
  };
}

function runEfOrchArtifact(executionDir, artifact) {
  const codeDir = path.join(executionDir, "code");

  const installResult = execWithTimeout(
    "npm", ["install", "fake-indexeddb", "--no-save"],
    { cwd: codeDir, encoding: "utf8" },
    TIMEOUTS_MS.DEPENDENCY_INSTALL_TIMEOUT, "DEPENDENCY_INSTALL_TIMEOUT"
  );
  if (!installResult.ok) {
    return { status: "FAIL", phase: installResult.timedOut ? "install_timeout" : "install", timedOut: installResult.timedOut, error: installResult.error };
  }

  const buildResult = execWithTimeout(
    "node", ["build-monolith.js"],
    { cwd: codeDir, encoding: "utf8" },
    TIMEOUTS_MS.BUILD_TIMEOUT, "BUILD_TIMEOUT"
  );
  if (!buildResult.ok) {
    return { status: "FAIL", phase: buildResult.timedOut ? "build_timeout" : "build", timedOut: buildResult.timedOut, error: buildResult.error };
  }

  const verifyResult = execWithTimeout(
    "node", ["verify-monolith-fidelity.js"],
    { cwd: codeDir, encoding: "utf8" },
    TIMEOUTS_MS.BUILD_TIMEOUT, "BUILD_TIMEOUT"
  );
  if (!verifyResult.ok) {
    return { status: "FAIL", phase: verifyResult.timedOut ? "verify_timeout" : "verify", timedOut: verifyResult.timedOut, error: verifyResult.error };
  }

  const testFiles = fs.readdirSync(codeDir).filter((f) => /^test_ef_orch_.*\.js$/.test(f)).sort();
  let total = 0;
  const failures = [];
  for (const f of testFiles) {
    const r = execWithTimeout(
      "node", [f],
      { cwd: codeDir, encoding: "utf8" },
      TIMEOUTS_MS.BUILD_TIMEOUT, "BUILD_TIMEOUT"
    );
    if (r.timedOut) {
      failures.push({ file: f, phase: "test_timeout", error: r.error });
      continue;
    }
    const combined = (r.stdout || "") + "\n" + (r.stderr || "");
    const { count } = countFromOutput(combined);
    if (r.exitCode !== 0 || count === null) {
      failures.push({ file: f, exitCode: r.exitCode, tail: combined.split("\n").slice(-5).join("\n") });
    } else {
      total += count;
    }
  }

  const status = failures.length === 0 && total === artifact.expectedTests ? "PASS" : "FAIL";
  return {
    status,
    testsObserved: total,
    testsExpected: artifact.expectedTests,
    filesRun: testFiles.length,
    failures,
    countMethod: `SUM_PER_FILE(${testFiles.length}_fichiers_test_ef_orch)`
  };
}

function runMono00Artifact(executionDir, artifact) {
  const pyFiles = ["tests/test_mono00_classification_logic.py", "tests/test_mono00_script_portability.py", "tests/test_mono00_t00_15_external_dependencies.py"];
  const jsFiles = ["tests/test_mono00_manifest_integrity.js"];
  let total = 0;
  const failures = [];
  const perFile = [];

  for (const rel of pyFiles) {
    const r = execWithTimeout(
      "python3", [rel],
      { cwd: executionDir, encoding: "utf8" },
      TIMEOUTS_MS.TEST_TIMEOUT, "TEST_TIMEOUT"
    );
    if (r.timedOut) { failures.push({ file: rel, phase: "test_timeout", error: r.error }); continue; }
    const combined = (r.stdout || "") + "\n" + (r.stderr || "");
    const { count, method } = countFromOutput(combined);
    perFile.push({ file: rel, exitCode: r.exitCode, count, method });
    if (r.exitCode !== 0 || count === null) failures.push({ file: rel, exitCode: r.exitCode, tail: combined.split("\n").slice(-8).join("\n") });
    else total += count;
  }

  for (const rel of jsFiles) {
    const r = execWithTimeout(
      "node", [rel],
      { cwd: executionDir, encoding: "utf8" },
      TIMEOUTS_MS.TEST_TIMEOUT, "TEST_TIMEOUT"
    );
    if (r.timedOut) { failures.push({ file: rel, phase: "test_timeout", error: r.error }); continue; }
    const combined = (r.stdout || "") + "\n" + (r.stderr || "");
    const { count, method } = countFromOutput(combined);
    perFile.push({ file: rel, exitCode: r.exitCode, count, method });
    if (r.exitCode !== 0 || count === null) failures.push({ file: rel, exitCode: r.exitCode, tail: combined.split("\n").slice(-8).join("\n") });
    else total += count;
  }

  const status = failures.length === 0 && total === artifact.expectedTests ? "PASS" : "FAIL";
  return {
    status,
    testsObserved: total,
    testsExpected: artifact.expectedTests,
    perFile,
    failures,
    countMethod: "SUM_PYTEST_SCRIPTS+NODE_SCRIPT"
  };
}

function runArtifactTests(executionDir, artifact) {
  if (artifact.runner === "npm") return runNpmArtifact(executionDir, artifact);
  if (artifact.runner === "efOrch") return runEfOrchArtifact(executionDir, artifact);
  if (artifact.runner === "mono00") return runMono00Artifact(executionDir, artifact);
  return { status: "FAIL", reason: `runner inconnu: ${artifact.runner}` };
}

module.exports = { countFromOutput, runArtifactTests };
