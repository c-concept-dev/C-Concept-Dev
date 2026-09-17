"use strict";
/**
 * MONO-06 — harness.js
 *
 * Orchestrateur principal du Frozen Regression Harness. Ne contient
 * aucune logique metier EvidenceForge — uniquement l'ordre d'execution
 * des verifications, conforme a "ORDRE RECOMMANDE" de la decision de
 * gouvernance du 30 aout 2026 (isolation baseline pristine / execution
 * workspace).
 *
 * Rejoue TOUJOURS depuis des extractions fraiches (jamais depuis la
 * memoire, jamais depuis un cache d'une execution precedente) — chaque
 * appel a runHarness() est independant et reproductible (T06-18).
 */

const fs = require("fs");
const path = require("path");

const { ARTIFACTS, EXPECTED_MONO_TOTAL, EXPECTED_HISTORIQUE_TOTAL } = require("./artifact-registry");
const { checkPresence } = require("./package-presence-checker");
const { createIsolatedPair, freshDir } = require("./workspace");
const { verifyArtifactManifests } = require("./manifest-hash-verifier");
const { compareNestedSubtree, verifyMono01ProvenanceChain } = require("./nested-dependency-verifier");
const { runArtifactTests } = require("./test-runner");
const { checkContracts } = require("./contract-presence-checker");
const { searchPilotHardcoding, searchEpistemicDrift, searchRealSecrets } = require("./static-search-runner");
const { checkKnownLimitations } = require("./known-limitations-checker");

const NESTED_CHAIN = {
  "MONO-02": [{ nestedRel: "dependencies/MONO-01", standaloneId: "MONO-01" }],
  "MONO-03": [
    { nestedRel: "dependencies/MONO-02", standaloneId: "MONO-02" },
    { nestedRel: "dependencies/MONO-02/dependencies/MONO-01", standaloneId: "MONO-01" }
  ],
  "MONO-04": [
    { nestedRel: "dependencies/MONO-03", standaloneId: "MONO-03" },
    { nestedRel: "dependencies/MONO-03/dependencies/MONO-02", standaloneId: "MONO-02" },
    { nestedRel: "dependencies/MONO-03/dependencies/MONO-02/dependencies/MONO-01", standaloneId: "MONO-01" }
  ],
  "MONO-05": [
    { nestedRel: "dependencies/MONO-04", standaloneId: "MONO-04" },
    { nestedRel: "dependencies/MONO-04/dependencies/MONO-03", standaloneId: "MONO-03" },
    { nestedRel: "dependencies/MONO-04/dependencies/MONO-03/dependencies/MONO-02", standaloneId: "MONO-02" },
    { nestedRel: "dependencies/MONO-04/dependencies/MONO-03/dependencies/MONO-02/dependencies/MONO-01", standaloneId: "MONO-01" }
  ]
};

function runHarness({ kitRoot, workRoot, skipTestExecution = false }) {
  const report = {
    generatedAt: new Date().toISOString(),
    kitRoot,
    presence: null,
    perArtifact: {},
    globalTotals: {},
    staticSearch: {},
    knownLimitations: null,
    overallStatus: "UNKNOWN"
  };

  freshDir(workRoot);

  // 1. Presence physique (T06-01 / T06-02)
  report.presence = checkPresence(kitRoot, ARTIFACTS);
  if (report.presence.status === "FAIL") {
    report.overallStatus = "FAIL";
    report.stopReason = "Artefact(s) canonique(s) manquant(s) — STOP, aucune fabrication de substitut.";
    return report;
  }

  // 2. Extraction isolee (baseline pristine + execution workspace) par artefact
  const pairs = {};
  for (const artifact of ARTIFACTS) {
    pairs[artifact.id] = createIsolatedPair(kitRoot, artifact, workRoot);
  }

  const baselineDirsById = {};
  for (const id of Object.keys(pairs)) {
    if (!pairs[id].missing) baselineDirsById[id] = pairs[id].baselineDir;
  }

  // 3-6. Verifications sur baseline pristine (manifest, nested, contrats, statique)
  for (const artifact of ARTIFACTS) {
    const pair = pairs[artifact.id];
    const entry = { id: artifact.id, group: artifact.group };

    if (pair.missing) {
      entry.extraction = { status: "FAIL", reason: pair.reason || "extraction impossible" };
      report.perArtifact[artifact.id] = entry;
      continue;
    }

    entry.manifest = verifyArtifactManifests(pair.baselineDir, artifact);

    if (NESTED_CHAIN[artifact.id]) {
      entry.nested = NESTED_CHAIN[artifact.id].map(({ nestedRel, standaloneId }) => {
        const nestedAbs = path.join(pair.baselineDir, nestedRel);
        const standaloneAbs = baselineDirsById[standaloneId];
        const result = compareNestedSubtree(nestedAbs, standaloneAbs);
        return { nestedRel, standaloneId, ...result };
      });
    }

    if (artifact.id === "MONO-01") {
      const historicalZipNames = {
        "EF-ORCH-RELEASE-v0.1.zip": baselineDirsById["EF-ORCH"],
        "EF-PR-GEN-01-FINAL.zip": baselineDirsById["EF-PR-GEN-01"],
        "EF-02D-v1.zip": baselineDirsById["EF-02D"],
        "EF-02E-v1.zip": baselineDirsById["EF-02E"],
        "EF-03-v1.zip": baselineDirsById["EF-03"],
        "EF-04-v1.zip": baselineDirsById["EF-04"]
      };
      entry.provenanceChain = verifyMono01ProvenanceChain(pair.baselineDir, historicalZipNames);
    }

    entry.contracts = checkContracts(pair.baselineDir, artifact);

    entry.staticSearch = {
      pilotHardcoding: searchPilotHardcoding(pair.baselineDir, artifact),
      epistemicDrift: searchEpistemicDrift(pair.baselineDir),
      realSecrets: searchRealSecrets(pair.baselineDir, artifact)
    };

    report.perArtifact[artifact.id] = entry;
  }

  // 7. Limites connues (baseline pristine)
  report.knownLimitations = checkKnownLimitations(baselineDirsById);

  // 8. Execution reelle des tests (execution workspace uniquement)
  if (!skipTestExecution) {
    for (const artifact of ARTIFACTS) {
      const pair = pairs[artifact.id];
      if (pair.missing) continue;
      report.perArtifact[artifact.id].execution = runArtifactTests(pair.executionDir, artifact);
    }
  }

  // 9. Totaux globaux et statut global
  let monoTotal = 0;
  let histTotal = 0;
  let anyFail = false;
  for (const artifact of ARTIFACTS) {
    const entry = report.perArtifact[artifact.id];
    const checks = [
      entry.extraction,
      entry.manifest,
      ...(entry.nested || []),
      entry.provenanceChain,
      entry.contracts,
      entry.execution,
      entry.staticSearch && entry.staticSearch.pilotHardcoding,
      entry.staticSearch && entry.staticSearch.epistemicDrift,
      entry.staticSearch && entry.staticSearch.realSecrets
    ].filter(Boolean);

    const artifactFailed = checks.some((c) => c.status === "FAIL");
    entry.artifactStatus = artifactFailed ? "FAIL" : "PASS";
    if (artifactFailed) anyFail = true;

    if (entry.execution && typeof entry.execution.testsObserved === "number") {
      if (artifact.group === "MONO") monoTotal += entry.execution.testsObserved;
      else histTotal += entry.execution.testsObserved;
    }
  }

  if (report.knownLimitations && report.knownLimitations.status === "FAIL") anyFail = true;

  report.globalTotals = {
    monoObserved: monoTotal,
    monoExpected: EXPECTED_MONO_TOTAL,
    monoMatch: monoTotal === EXPECTED_MONO_TOTAL,
    historiqueObserved: histTotal,
    historiqueExpected: EXPECTED_HISTORIQUE_TOTAL,
    historiqueMatch: histTotal === EXPECTED_HISTORIQUE_TOTAL
  };

  if (skipTestExecution) {
    report.overallStatus = anyFail ? "FAIL" : "PASS_WITHOUT_TEST_EXECUTION";
  } else {
    const totalsMatch = report.globalTotals.monoMatch && report.globalTotals.historiqueMatch;
    report.overallStatus = anyFail || !totalsMatch ? "FAIL" : "PASS";
  }

  return report;
}

module.exports = { runHarness };
