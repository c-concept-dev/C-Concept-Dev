"use strict";
/**
 * MONO-10 v0.4 — core/run-evidence-manifest.js
 *
 * FERMETURE v0.3 B-1 (§3). Le manifeste ne se certifie plus lui-meme.
 *
 * v0.3 : `manifestHash` etait recalcule depuis les champs du manifeste. Le
 * manifeste attestait donc de lui-meme, et une chaine entierement fabriquee
 * devenait une « preuve de production ».
 *
 * v0.4 : la validite du manifeste EXIGE la verification reussie d'une
 * attestation EXTERIEURE, signee par une autorite dont la cle publique est
 * ancree par l'exploitant. Sans ancrage, rien n'est authentifie — fail-closed.
 *
 * DEUX NOTIONS DISTINCTES, JAMAIS CONFONDUES (§0) :
 *   INTERNAL_CHAIN_CONSISTENCY      la chaine est coherente avec elle-meme
 *   AUTHENTICATED_PRODUCTION_EXECUTION  un runtime exterieur atteste le run
 * Une chaine coherente n'est PAS une preuve de production.
 */

const { canonical, sha256Of, artifactHash, bareArtifact, isNonEmptyStr, isHash, fail } = require("./canonical.js");
const TRA = require("./trusted-runtime-authority.js");

const MODE = TRA.MODE;
const SCHEMA = "EvidenceForge.RunEvidenceManifest";

/**
 * createRunEvidenceManifest({ attestation, anchorSet, missionBinding, createdAt, verifyOpts })
 *
 * Le manifeste ne choisit ni son runId, ni son mode : il les REPREND de
 * l'attestation verifiee. Un appelant ne peut donc pas se declarer en
 * production ; il peut seulement presenter une attestation de production.
 */
function createRunEvidenceManifest(input) {
  input = input || {};
  const att = input.attestation;
  if (!att) throw fail("RUN_MANIFEST_UNATTESTED", "aucune TrustedRuntimeAttestation : un manifeste ne se certifie pas lui-meme.");
  const missionHash = isNonEmptyStr(input.missionHash) ? input.missionHash
    : (input.missionBinding ? sha256Of(input.missionBinding) : null);
  const v = TRA.assertAttestation(att, input.anchorSet, Object.assign({
    expectedMissionHash: missionHash || undefined,
  }, input.verifyOpts || {}), "RunEvidenceManifest");

  const m = {
    schema: SCHEMA, schemaVersion: "MONO-10-v4",
    runId: att.runId,
    executionMode: att.executionMode,
    authorityId: att.authorityId,
    trustedRuntimeAttestationId: att.attestationId,
    trustedRuntimeAttestationHash: v.attestationHash,
    trustAnchorHash: v.anchor.anchorHash,
    missionHash: missionHash,
    producers: [{ producerId: att.producerId, producerVersion: att.producerVersion }],
    missionBinding: input.missionBinding || null,
    createdAt: isNonEmptyStr(input.createdAt) ? input.createdAt : new Date().toISOString(),
    artifacts: [],
  };
  m.manifestBindingHash = sha256Of({
    runId: m.runId, executionMode: m.executionMode, authorityId: m.authorityId,
    trustedRuntimeAttestationHash: m.trustedRuntimeAttestationHash,
    trustAnchorHash: m.trustAnchorHash, missionHash: m.missionHash,
  });
  return m;
}

/**
 * bindArtifact(manifest, artifact, artifactId, artifactType)
 * L'empreinte croisee inclut l'attestation : un artefact ne peut pas etre
 * transporte vers un run atteste differemment.
 */
function bindArtifact(manifest, artifact, artifactId, artifactType) {
  assertManifestShape(manifest);
  if (!artifact || typeof artifact !== "object") throw fail("RUN_BINDING_INVALID", "artefact absent.");
  if (!isNonEmptyStr(artifactId)) throw fail("RUN_BINDING_INVALID", "artifactId requis.");
  const bare = bareArtifact(artifact);
  const h = sha256Of(bare);
  const crossHash = sha256Of({ manifestBindingHash: manifest.manifestBindingHash, runId: manifest.runId,
    attestationHash: manifest.trustedRuntimeAttestationHash, artifactId: artifactId, artifactHash: h });
  manifest.artifacts.push({ artifactId: artifactId, artifactType: artifactType || artifact.schema || null, artifactHash: h, crossHash: crossHash });
  return Object.assign({}, bare, {
    runBinding: { runId: manifest.runId, executionMode: manifest.executionMode, authorityId: manifest.authorityId,
      attestationId: manifest.trustedRuntimeAttestationId, attestationHash: manifest.trustedRuntimeAttestationHash,
      missionHash: manifest.missionHash, manifestBindingHash: manifest.manifestBindingHash,
      artifactId: artifactId, artifactHash: h, crossHash: crossHash },
  });
}

/** Coherence INTERNE du manifeste. Ne dit rien de son authenticite. */
function assertManifestShape(m) {
  if (!m || m.schema !== SCHEMA) throw fail("RUN_MANIFEST_MISSING", "RunEvidenceManifest requis.");
  const expected = sha256Of({ runId: m.runId, executionMode: m.executionMode, authorityId: m.authorityId,
    trustedRuntimeAttestationHash: m.trustedRuntimeAttestationHash, trustAnchorHash: m.trustAnchorHash, missionHash: m.missionHash });
  if (m.manifestBindingHash !== expected) throw fail("RUN_MANIFEST_TAMPERED", "manifestBindingHash incoherent — manifeste altere.");
  return true;
}

/**
 * assertManifestAuthentic(manifest, anchorSet, attestation, opts)
 * LE controle qui compte : le manifeste est-il adosse a une attestation
 * exterieure, verifiee, emise par une autorite ancree pour CE mode ?
 */
function assertManifestAuthentic(manifest, anchorSet, attestation, opts) {
  assertManifestShape(manifest);
  if (!attestation) throw fail("RUN_MANIFEST_UNATTESTED", "attestation du run non fournie a la verification.");
  const v = TRA.assertAttestation(attestation, anchorSet, Object.assign({
    expectedRunId: manifest.runId, expectedMode: manifest.executionMode, expectedMissionHash: manifest.missionHash || undefined,
  }, opts || {}), "RunEvidenceManifest");
  if (v.attestationHash !== manifest.trustedRuntimeAttestationHash) {
    throw fail("RUN_MANIFEST_ATTESTATION_MISMATCH", "l'attestation presentee n'est pas celle qui a fonde ce manifeste.");
  }
  if (v.anchor.anchorHash !== manifest.trustAnchorHash) {
    throw fail("RUN_MANIFEST_ANCHOR_MISMATCH", "l'ancrage de confiance a change depuis la creation du manifeste.");
  }
  if (attestation.authorityId !== manifest.authorityId) throw fail("RUN_MANIFEST_AUTHORITY_MISMATCH", "autorite differente.");
  return v;
}

function assertArtifactBoundToRun(artifact, manifest, label, opts) {
  assertManifestShape(manifest);
  if (!artifact || typeof artifact !== "object") throw fail("RUN_BINDING_MISSING", label + " : artefact absent.");
  const b = artifact.runBinding;
  if (!b) throw fail("RUN_BINDING_MISSING", label + " : aucun runBinding — un artefact non lie a un run ne prouve rien.");
  if (b.runId !== manifest.runId) throw fail("RUN_BINDING_MISMATCH", label + " : runId \"" + b.runId + "\" different du run \"" + manifest.runId + "\".");
  if (b.attestationHash !== manifest.trustedRuntimeAttestationHash) throw fail("RUN_BINDING_MISMATCH", label + " : attestation differente de celle du manifeste.");
  if (b.manifestBindingHash !== manifest.manifestBindingHash) throw fail("RUN_BINDING_MISMATCH", label + " : manifeste different.");
  const now = sha256Of(bareArtifact(artifact));
  if (b.artifactHash !== now) throw fail("RUN_BINDING_MISMATCH", label + " : l'artefact a ete modifie depuis sa liaison au run (reetiquetage detecte).");
  const cross = sha256Of({ manifestBindingHash: manifest.manifestBindingHash, runId: manifest.runId,
    attestationHash: manifest.trustedRuntimeAttestationHash, artifactId: b.artifactId, artifactHash: b.artifactHash });
  if (b.crossHash !== cross) throw fail("RUN_BINDING_MISMATCH", label + " : empreinte croisee invalide.");
  const entry = (manifest.artifacts || []).find((a) => a.artifactId === b.artifactId);
  if (!entry) throw fail("RUN_BINDING_MISMATCH", label + " : artefact absent du manifeste du run.");
  if (entry.crossHash !== b.crossHash) throw fail("RUN_BINDING_MISMATCH", label + " : l'entree du manifeste ne correspond pas.");
  return true;
}

/**
 * assertProductionEvidence(artifact, ctx, label)
 * ctx : { manifest, anchorSet, attestation, now, seenNonces }
 * Exige TOUT : mode PRODUCTION, attestation exterieure verifiee, liaison croisee.
 */
function assertProductionEvidence(artifact, ctx, label) {
  ctx = ctx || {};
  const m = ctx.manifest;
  assertManifestShape(m);
  if (m.executionMode !== MODE.PRODUCTION) {
    throw fail("RUN_NOT_PRODUCTION", label + " : le run est atteste en mode " + m.executionMode
      + " — une fixture ne devient jamais une preuve reelle, ni par reetiquetage, ni par regeneration.");
  }
  assertManifestAuthentic(m, ctx.anchorSet, ctx.attestation, { now: ctx.now, seenNonces: ctx.seenNonces });
  assertArtifactBoundToRun(artifact, m, label);
  return true;
}

/** Le mode effectif d'un contexte, DERIVE de l'attestation, jamais declare. */
function effectiveMode(ctx) {
  return (ctx && ctx.manifest && ctx.manifest.executionMode) || null;
}
function isProductionContext(ctx) { return effectiveMode(ctx) === MODE.PRODUCTION; }

module.exports = { createRunEvidenceManifest, bindArtifact, assertManifestShape, assertManifestAuthentic,
  assertArtifactBoundToRun, assertProductionEvidence, effectiveMode, isProductionContext,
  sha256Of, canonical, artifactHash, bareArtifact, isNonEmptyStr, isHash, fail, MODE, SCHEMA };
