"use strict";
/**
 * MONO-10 v0.2 — core/execution-evidence.js
 *
 * FERMETURE F-04 / F-10. Tout artefact porte explicitement la classe de son
 * execution. Une fixture ne peut jamais etre requalifiee en preuve reelle.
 */

const CLASS = { TEST_FIXTURE: "TEST_FIXTURE", REAL_RUNTIME: "REAL_RUNTIME" };
const FIXTURE_ACTOR_PREFIX = "FIXTURE:";

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }
function fail(code, message, details) { const e = new Error(code + ": " + message); e.code = code; e.details = details || null; return e; }

/** Stamp obligatoire sur tout artefact produit par le noyau. */
function stamp(evidenceClass) {
  if (evidenceClass !== CLASS.TEST_FIXTURE && evidenceClass !== CLASS.REAL_RUNTIME) {
    throw fail("EXECUTION_EVIDENCE_CLASS_REQUIRED", "executionEvidenceClass doit valoir TEST_FIXTURE ou REAL_RUNTIME (recu " + JSON.stringify(evidenceClass) + ").");
  }
  return { executionEvidenceClass: evidenceClass };
}

/** Detecte une fixture, quelle que soit la voie utilisee. */
function isFixture(artifact) {
  if (!artifact || typeof artifact !== "object") return false;
  if (artifact.executionEvidenceClass === CLASS.TEST_FIXTURE) return true;
  if (artifact.provenance && artifact.provenance.fixture === true) return true;
  if (isNonEmptyStr(artifact.actorIdentity) && artifact.actorIdentity.indexOf(FIXTURE_ACTOR_PREFIX) === 0) return true;
  return false;
}

/**
 * assertProductionEvidence(artifact, label, mode)
 * mode.production === true : toute fixture est refusee, et l'absence de
 * classe explicite est refusee (jamais un defaut permissif).
 */
function assertProductionEvidence(artifact, label, mode) {
  mode = mode || {};
  if (!artifact || typeof artifact !== "object") throw fail("EVIDENCE_ARTIFACT_MISSING", label + " : artefact absent.");
  if (mode.production !== true) return { productionMode: false, isFixture: isFixture(artifact) };
  if (artifact.executionEvidenceClass !== CLASS.REAL_RUNTIME) {
    throw fail("EXECUTION_EVIDENCE_NOT_REAL", label + " : executionEvidenceClass=" + JSON.stringify(artifact.executionEvidenceClass) + " — REAL_RUNTIME requis en production.");
  }
  if (isFixture(artifact)) {
    throw fail("FIXTURE_IN_PRODUCTION", label + " : marqueur de fixture detecte — jamais recevable comme preuve reelle.");
  }
  return { productionMode: true, isFixture: false };
}

module.exports = { CLASS, stamp, isFixture, assertProductionEvidence, isNonEmptyStr, fail, FIXTURE_ACTOR_PREFIX };
