"use strict";
/**
 * MONO-10 v0.1 — lib/lineage.js
 * Referencement stable des artefacts. Aucune qualification scientifique
 * non liee : tout artefact MONO-10 reference par identifiant + empreinte
 * ce qu'il qualifie.
 */
const crypto = require("crypto");

const FIXTURE_ACTOR_PREFIX = "FIXTURE:";

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }
function sha256Of(obj) { return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex"); }

/** artifactRef(artifact, artifactId) -> { artifactId, schema, schemaVersion, sha256 } */
function artifactRef(artifact, artifactId) {
  if (!artifact || typeof artifact !== "object") throw fail("LINEAGE_REF_INVALID", "artefact absent.");
  return {
    artifactId: isNonEmptyStr(artifactId) ? artifactId : (artifact.artifactId || artifact.id || null),
    schema: artifact.schema || null,
    schemaVersion: artifact.schemaVersion || null,
    sha256: sha256Of(artifact),
  };
}

function fail(code, message, details) {
  const e = new Error(code + ": " + message); e.code = code; e.details = details || null; return e;
}

/** Toute reference doit porter un sha256 exploitable — jamais une chaine libre. */
function assertBound(ref, label) {
  if (!ref || typeof ref !== "object") throw fail("LINEAGE_UNBOUND", label + " : reference absente.");
  if (!/^[0-9a-f]{64}$/.test(String(ref.sha256 || ""))) throw fail("LINEAGE_UNBOUND", label + " : sha256 absent ou invalide.");
  return true;
}

/**
 * assertHumanAct(act, label) — invariants communs a TOUS les actes humains
 * de MONO-10. Aucun LLM, adaptateur, runtime ou defaut ne peut les satisfaire.
 */
function assertHumanAct(act, label, opts) {
  opts = opts || {};
  if (!act || typeof act !== "object") throw fail("HUMAN_ACT_MISSING", label + " : acte absent.");
  if (act.actorType !== "human") throw fail("HUMAN_ACT_INVALID", label + " : actorType doit valoir exactement \"human\" (recu " + JSON.stringify(act.actorType) + ").");
  if (!isNonEmptyStr(act.actorIdentity)) throw fail("HUMAN_ACT_INVALID", label + " : actorIdentity non vide requise.");
  if (!isNonEmptyStr(act.decidedAt) || isNaN(Date.parse(act.decidedAt))) throw fail("HUMAN_ACT_INVALID", label + " : decidedAt doit etre un horodatage reel.");
  const isFixture = act.actorIdentity.indexOf(FIXTURE_ACTOR_PREFIX) === 0 || (act.provenance && act.provenance.fixture === true);
  if (isFixture && opts.allowFixture !== true) {
    throw fail("FIXTURE_IN_PRODUCTION", label + " : acte humain de FIXTURE refuse en production (actorIdentity \"" + FIXTURE_ACTOR_PREFIX + "…\" ou provenance.fixture=true).");
  }
  return { isFixture: isFixture };
}

module.exports = { artifactRef, assertBound, assertHumanAct, sha256Of, isNonEmptyStr, fail, FIXTURE_ACTOR_PREFIX };
