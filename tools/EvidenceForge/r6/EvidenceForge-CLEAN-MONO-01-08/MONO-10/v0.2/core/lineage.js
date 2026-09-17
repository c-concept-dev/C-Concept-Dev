"use strict";
/**
 * MONO-10 v0.2 — core/lineage.js
 * Referencement + comparaison REELLE des bindings (fermeture F-03).
 * Une lignee vide n'est jamais acceptee (fermeture F-06).
 */

const crypto = require("crypto");
const { isNonEmptyStr, fail, isFixture, CLASS } = require("./execution-evidence.js");

/** Empreinte canonique, independante de l'ordre des cles. */
function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) || "null";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
function sha256Of(obj) { return crypto.createHash("sha256").update(canonical(obj)).digest("hex"); }

function artifactRef(artifact, artifactId) {
  if (!artifact || typeof artifact !== "object") throw fail("LINEAGE_REF_INVALID", "artefact absent.");
  return {
    artifactId: isNonEmptyStr(artifactId) ? artifactId : (artifact.artifactId || artifact.id || null),
    schema: artifact.schema || null, schemaVersion: artifact.schemaVersion || null,
    executionEvidenceClass: artifact.executionEvidenceClass || null,
    sha256: sha256Of(artifact),
  };
}

function assertBound(ref, label) {
  if (!ref || typeof ref !== "object") throw fail("LINEAGE_UNBOUND", label + " : reference absente.");
  if (!/^[0-9a-f]{64}$/.test(String(ref.sha256 || ""))) throw fail("LINEAGE_UNBOUND", label + " : sha256 absent ou invalide.");
  return true;
}

/** F-03 : comparaison REELLE, pas seulement syntaxique. */
function assertRefMatches(ref, currentArtifact, label) {
  assertBound(ref, label);
  const now = sha256Of(currentArtifact);
  if (ref.sha256 !== now) {
    throw fail("BINDING_MISMATCH", label + " : l'artefact reference a change (attendu " + ref.sha256.slice(0, 12) + "…, obtenu " + now.slice(0, 12) + "…).");
  }
  return true;
}

/** F-06 : une lignee vide n'est jamais valide. */
function assertLineageNonEmpty(refs, label) {
  if (!Array.isArray(refs) || refs.length === 0) throw fail("LINEAGE_EMPTY", (label || "lineage") + " : aucune reference — jamais accepte.");
  refs.forEach((r, i) => assertBound(r, (label || "lineage") + "[" + i + "]"));
  return true;
}

function assertHumanAct(act, label, mode) {
  mode = mode || {};
  if (!act || typeof act !== "object") throw fail("HUMAN_ACT_MISSING", label + " : acte absent.");
  if (act.actorType !== "human") throw fail("HUMAN_ACT_INVALID", label + " : actorType doit valoir exactement \"human\".");
  if (!isNonEmptyStr(act.actorIdentity)) throw fail("HUMAN_ACT_INVALID", label + " : actorIdentity non vide requise.");
  if (!isNonEmptyStr(act.decidedAt) || isNaN(Date.parse(act.decidedAt))) throw fail("HUMAN_ACT_INVALID", label + " : decidedAt doit etre un horodatage reel.");
  const fx = isFixture(act);
  if (fx && mode.production === true) throw fail("FIXTURE_IN_PRODUCTION", label + " : acte humain de fixture refuse en production.");
  return { isFixture: fx };
}

module.exports = { artifactRef, assertBound, assertRefMatches, assertLineageNonEmpty, assertHumanAct, sha256Of, canonical, CLASS };
