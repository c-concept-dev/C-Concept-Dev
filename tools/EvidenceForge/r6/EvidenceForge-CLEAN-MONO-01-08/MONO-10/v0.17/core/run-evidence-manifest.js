"use strict";
/**
 * MONO-10 v0.5 — core/run-evidence-manifest.js   (§15, §16)
 *
 * Le manifeste ne recoit plus d'ancrages : il recoit un VERIFICATEUR issu de la
 * frontiere operateur. Il ne choisit ni son mode, ni son run, ni son autorite :
 * il les REPREND d'une attestation verifiee.
 *
 * ORDRE DE CREATION (§16), sans circularite :
 *   1. l'exploitant provisionne la frontiere            (hors processus)
 *   2. l'exploitant ouvre un run et fige son INTENTION  (runId, missionHash,
 *      producteur, mode, openedAt) -> runManifestRootHash
 *   3. l'autorite signe l'attestation, qui ENGAGE cette racine
 *   4. EvidenceForge verifie l'attestation
 *   5. le manifeste est cree A PARTIR de l'attestation verifiee
 *   6. les artefacts sont enregistres ENSUITE, lies par empreinte croisee
 *
 * La racine engage donc l'ouverture du run, jamais les artefacts — ceux-ci
 * n'existent pas encore au moment de la signature.
 */

const { canonical, sha256Of, artifactHash, bareArtifact, isNonEmptyStr, isHash, fail } = require("./canonical.js");
const RA = require("./runtime-attestation.js");
const OTV = require("./operator-trust-verifier.js");
const OTB = require("./operator-trust-boundary.js");

const SCHEMA = "EvidenceForge.RunEvidenceManifest";
const MODE = RA.EXECUTION_MODE;

/**
 * openRunEvidenceManifest({ verifier, attestation, runIntent, missionBinding, consumeNonce, now })
 * `runIntent` est l'intention d'ouverture figee a l'etape 2 ; sa racine doit
 * correspondre a celle qu'engage l'attestation.
 */
function openRunEvidenceManifest(input) {
  input = input || {};
  const verifier = input.verifier;
  if (!OTV.isOperatorTrustVerifier(verifier)) {
    throw fail("TRUST_VERIFIER_FORGED", "aucun verificateur issu d'une frontiere operateur : un manifeste ne se certifie pas lui-meme, et un appelant ne fournit pas sa racine de confiance.");
  }
  const att = input.attestation;
  if (!att) throw fail("RUN_MANIFEST_UNATTESTED", "aucune RuntimeAttestation fournie.");
  const intent = input.runIntent;
  if (!intent) throw fail("RUN_INTENT_MISSING", "intention d'ouverture de run requise — la racine doit etre engagee avant signature.");
  const expectedRoot = RA.computeRunManifestRootHash(intent);

  const v = verifier.verifyRuntimeAttestation({
    attestation: att,
    expectedRunId: intent.runId,
    expectedMissionHash: intent.missionHash,
    expectedExecutionMode: intent.executionMode,
    expectedRunManifestRootHash: expectedRoot,
    expectedProducer: { producerId: intent.producerId, producerVersion: intent.producerVersion },
    consumeNonce: input.consumeNonce !== false,
    now: input.now,
  });
  if (!v.valid) throw fail("RUNTIME_ATTESTATION_INVALID", "attestation de run refusee : " + v.problems.join(" ; "));

  const m = {
    schema: SCHEMA, schemaVersion: "MONO-10-v5",
    runId: att.runId, executionMode: att.executionMode,
    authorityId: att.authorityId, keyId: att.keyId,
    operatorTrustBoundaryId: v.operatorTrustBoundaryId,
    boundaryDescriptorHash: verifier.boundaryDescriptorHash,
    /** §4 (v0.9) — le manifeste ENGAGE la liaison de configuration. */
    configBindingHash: verifier.configBindingHash || null,
    runtimeAttestationId: att.attestationId,
    runtimeAttestationHash: v.attestationHash,
    runManifestRootHash: att.runManifestRootHash,
    missionHash: intent.missionHash,
    producers: [{ producerId: att.producerId, producerVersion: att.producerVersion }],
    missionBinding: input.missionBinding || null,
    openedAt: intent.openedAt,
    createdAt: isNonEmptyStr(input.createdAt) ? input.createdAt : new Date().toISOString(),
    artifacts: [],
  };
  m.manifestBindingHash = sha256Of({
    configBindingHash: m.configBindingHash,
    runId: m.runId, executionMode: m.executionMode, authorityId: m.authorityId, keyId: m.keyId,
    operatorTrustBoundaryId: m.operatorTrustBoundaryId, boundaryDescriptorHash: m.boundaryDescriptorHash,
    runtimeAttestationHash: m.runtimeAttestationHash, runManifestRootHash: m.runManifestRootHash, missionHash: m.missionHash,
  });
  return m;
}

function bindArtifact(manifest, artifact, artifactId, artifactType) {
  assertManifestShape(manifest);
  if (!artifact || typeof artifact !== "object") throw fail("RUN_BINDING_INVALID", "artefact absent.");
  if (!isNonEmptyStr(artifactId)) throw fail("RUN_BINDING_INVALID", "artifactId requis.");
  const bare = bareArtifact(artifact);
  const h = sha256Of(bare);
  const crossHash = sha256Of({ manifestBindingHash: manifest.manifestBindingHash, runId: manifest.runId,
    attestationHash: manifest.runtimeAttestationHash, artifactId: artifactId, artifactHash: h });
  manifest.artifacts.push({ artifactId: artifactId, artifactType: artifactType || artifact.schema || null, artifactHash: h, crossHash: crossHash });
  return Object.assign({}, bare, {
    runBinding: { runId: manifest.runId, executionMode: manifest.executionMode, authorityId: manifest.authorityId,
      operatorTrustBoundaryId: manifest.operatorTrustBoundaryId,
      attestationId: manifest.runtimeAttestationId, attestationHash: manifest.runtimeAttestationHash,
      missionHash: manifest.missionHash, manifestBindingHash: manifest.manifestBindingHash,
      artifactId: artifactId, artifactHash: h, crossHash: crossHash },
  });
}

/** Coherence INTERNE seule. Ne dit rien de l'authenticite. */
function assertManifestShape(m) {
  if (!m || m.schema !== SCHEMA) throw fail("RUN_MANIFEST_MISSING", "RunEvidenceManifest requis.");
  const expected = sha256Of({ configBindingHash: m.configBindingHash,
    runId: m.runId, executionMode: m.executionMode, authorityId: m.authorityId, keyId: m.keyId,
    operatorTrustBoundaryId: m.operatorTrustBoundaryId, boundaryDescriptorHash: m.boundaryDescriptorHash,
    runtimeAttestationHash: m.runtimeAttestationHash, runManifestRootHash: m.runManifestRootHash, missionHash: m.missionHash });
  if (m.manifestBindingHash !== expected) throw fail("RUN_MANIFEST_TAMPERED", "manifestBindingHash incoherent — manifeste altere.");
  return true;
}

/** L'authenticite : la frontiere qui a ouvert le run est-elle bien celle-ci ? */
function assertManifestAuthentic(manifest, ctx) {
  ctx = ctx || {};
  assertManifestShape(manifest);
  const verifier = ctx.verifier;
  if (!OTV.isOperatorTrustVerifier(verifier)) throw fail("TRUST_VERIFIER_FORGED", "verificateur absent ou fabrique.");
  if (verifier.operatorTrustBoundaryId !== manifest.operatorTrustBoundaryId) {
    throw fail("OPERATOR_TRUST_BOUNDARY_MISMATCH", "le run a ete ouvert sous une autre frontiere operateur.");
  }
  // §4 (v0.9) — l'identifiant declare ne suffit pas : la LIAISON DE
  // CONFIGURATION est comparee. Deux configurations distinctes portant le meme
  // operatorTrustBoundaryId ne sont pas la meme frontiere (R1).
  if (isNonEmptyStr(manifest.configBindingHash) || isNonEmptyStr(verifier.configBindingHash)) {
    if (!isNonEmptyStr(manifest.configBindingHash) || !isNonEmptyStr(verifier.configBindingHash)) {
      throw fail("OPERATOR_TRUST_CONFIG_BINDING_MISSING",
        "liaison de configuration absente d'un cote : une identite de frontiere incomplete n'est pas verifiable.");
    }
    if (manifest.configBindingHash !== verifier.configBindingHash) {
      throw fail("OPERATOR_TRUST_CONFIG_BINDING_MISMATCH",
        "meme identifiant de frontiere declare, mais liaison de configuration differente — "
        + "le run a ete ouvert sous une autre configuration de confiance.");
    }
  }
  if (verifier.boundaryDescriptorHash !== manifest.boundaryDescriptorHash) {
    throw fail("OPERATOR_TRUST_BOUNDARY_CHANGED", "la frontiere operateur a change depuis l'ouverture du run.");
  }
  if (!ctx.attestation) throw fail("RUN_MANIFEST_UNATTESTED", "attestation du run non fournie a la verification.");
  // §28 — revalidation en LECTURE : le nonce a deja ete consomme a l'ouverture
  // de CE run ; on ne le reconsomme pas, et on ne le prend pas pour un rejeu.
  const v = verifier.verifyRuntimeAttestation({ attestation: ctx.attestation,
    expectedRunId: manifest.runId, expectedMissionHash: manifest.missionHash,
    expectedExecutionMode: manifest.executionMode,
    expectedRunManifestRootHash: manifest.runManifestRootHash,
    readOnlyRevalidation: true, consumeNonce: false, now: ctx.now });
  if (!v.valid) throw fail("RUNTIME_ATTESTATION_INVALID", v.problems.join(" ; "));
  if (v.attestationHash !== manifest.runtimeAttestationHash) {
    throw fail("RUN_MANIFEST_ATTESTATION_MISMATCH", "l'attestation presentee n'est pas celle qui a ouvert ce run.");
  }
  return v;
}

function assertArtifactBoundToRun(artifact, manifest, label) {
  assertManifestShape(manifest);
  if (!artifact || typeof artifact !== "object") throw fail("RUN_BINDING_MISSING", label + " : artefact absent.");
  const b = artifact.runBinding;
  if (!b) throw fail("RUN_BINDING_MISSING", label + " : aucun runBinding — un artefact non lie a un run ne prouve rien.");
  if (b.runId !== manifest.runId) throw fail("RUN_BINDING_MISMATCH", label + " : runId \"" + b.runId + "\" different du run \"" + manifest.runId + "\".");
  if (b.attestationHash !== manifest.runtimeAttestationHash) throw fail("RUN_BINDING_MISMATCH", label + " : attestation differente de celle du manifeste.");
  if (b.manifestBindingHash !== manifest.manifestBindingHash) throw fail("RUN_BINDING_MISMATCH", label + " : manifeste different.");
  if (b.operatorTrustBoundaryId !== manifest.operatorTrustBoundaryId) throw fail("RUN_BINDING_MISMATCH", label + " : frontiere operateur differente.");
  const now = sha256Of(bareArtifact(artifact));
  if (b.artifactHash !== now) throw fail("RUN_BINDING_MISMATCH", label + " : l'artefact a ete modifie depuis sa liaison au run.");
  const cross = sha256Of({ manifestBindingHash: manifest.manifestBindingHash, runId: manifest.runId,
    attestationHash: manifest.runtimeAttestationHash, artifactId: b.artifactId, artifactHash: b.artifactHash });
  if (b.crossHash !== cross) throw fail("RUN_BINDING_MISMATCH", label + " : empreinte croisee invalide.");
  const entry = (manifest.artifacts || []).find((a) => a.artifactId === b.artifactId);
  if (!entry) throw fail("RUN_BINDING_MISMATCH", label + " : artefact absent du manifeste du run.");
  if (entry.crossHash !== b.crossHash) throw fail("RUN_BINDING_MISMATCH", label + " : l'entree du manifeste ne correspond pas.");
  return true;
}

/** Preuve de PRODUCTION : frontiere de production + attestation + liaison. */
function assertProductionEvidence(artifact, ctx, label) {
  ctx = ctx || {};
  const m = ctx.manifest;
  assertManifestShape(m);
  OTV.assertProductionVerifier(ctx.verifier, label);
  if (m.executionMode !== MODE.PRODUCTION) {
    throw fail("RUN_NOT_PRODUCTION", label + " : run atteste en mode " + m.executionMode
      + " — une fixture ne devient jamais une preuve reelle, ni par reetiquetage, ni par regeneration.");
  }
  assertManifestAuthentic(m, ctx);
  assertArtifactBoundToRun(artifact, m, label);
  return true;
}

function effectiveMode(ctx) { return (ctx && ctx.manifest && ctx.manifest.executionMode) || null; }
function isProductionContext(ctx) {
  return effectiveMode(ctx) === MODE.PRODUCTION && OTV.isOperatorTrustVerifier(ctx && ctx.verifier)
    && ctx.verifier.namespace === OTB.NAMESPACE.PRODUCTION;
}

module.exports = { openRunEvidenceManifest, bindArtifact, assertManifestShape, assertManifestAuthentic,
  assertArtifactBoundToRun, assertProductionEvidence, effectiveMode, isProductionContext,
  sha256Of, canonical, artifactHash, bareArtifact, isNonEmptyStr, isHash, fail, MODE, SCHEMA };
