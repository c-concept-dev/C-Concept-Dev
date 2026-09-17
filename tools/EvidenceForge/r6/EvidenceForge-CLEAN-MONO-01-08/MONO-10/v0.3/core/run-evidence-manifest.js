"use strict";
/**
 * MONO-10 v0.3 — core/run-evidence-manifest.js
 *
 * FERMETURE A-03 / §7 / §8. Aucune valeur auto-declaree ne constitue une preuve.
 *
 * En v0.2, `executionEvidenceClass: "REAL_RUNTIME"` etait un champ ECRIT PAR
 * L'ARTEFACT LUI-MEME. Le reecrire suffisait a blanchir une fixture. Ici, la
 * classe d'execution reste presente mais n'a AUCUNE force : la preuve vient du
 * RunEvidenceManifest fourni par le runtime, auquel chaque artefact est lie par
 * une empreinte que l'artefact ne peut pas se donner a lui-meme.
 */

const crypto = require("crypto");

const MODE = { TEST: "TEST", PRODUCTION: "PRODUCTION" };

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }
function fail(code, message, details) { const e = new Error(code + ": " + message); e.code = code; e.details = details || null; return e; }

function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) || "null";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
function sha256Of(obj) { return crypto.createHash("sha256").update(canonical(obj)).digest("hex"); }

/**
 * createRunEvidenceManifest({ runId, executionMode, producers, missionBinding, createdAt })
 * `producers` : composants ayant reellement produit les artefacts de ce run.
 */
function createRunEvidenceManifest(input) {
  input = input || {};
  if (!isNonEmptyStr(input.runId)) throw fail("RUN_MANIFEST_INVALID", "runId requis.");
  if (input.executionMode !== MODE.TEST && input.executionMode !== MODE.PRODUCTION) {
    throw fail("RUN_MANIFEST_INVALID", "executionMode doit valoir TEST ou PRODUCTION.");
  }
  const m = {
    schema: "EvidenceForge.RunEvidenceManifest", schemaVersion: "MONO-10-v3",
    runId: input.runId, executionMode: input.executionMode,
    producers: (input.producers || []).map(function (p) {
      return { producerId: p.producerId || null, producerVersion: p.producerVersion || null };
    }),
    missionBinding: input.missionBinding || null,
    createdAt: isNonEmptyStr(input.createdAt) ? input.createdAt : new Date().toISOString(),
    artifacts: [],
  };
  m.manifestSecret = null;   // jamais de secret ; champ present pour interdire son usage
  delete m.manifestSecret;
  m.manifestHash = sha256Of(m);
  return m;
}

/**
 * bindArtifact(manifest, artifact, artifactId, artifactType)
 * Retourne l'artefact ENRICHI d'un `runBinding` que l'artefact seul ne peut pas
 * forger : il contient le runId, le manifestHash et une empreinte croisee
 * artefact x manifest. Le manifest enregistre en retour l'entree correspondante.
 */
function bindArtifact(manifest, artifact, artifactId, artifactType) {
  assertManifest(manifest);
  if (!artifact || typeof artifact !== "object") throw fail("RUN_BINDING_INVALID", "artefact absent.");
  const bare = Object.assign({}, artifact); delete bare.runBinding;
  const artifactHash = sha256Of(bare);
  const crossHash = sha256Of({ manifestHash: manifest.manifestHash, runId: manifest.runId, artifactId: artifactId, artifactHash: artifactHash });
  manifest.artifacts.push({ artifactId: artifactId, artifactType: artifactType || artifact.schema || null, artifactHash: artifactHash, crossHash: crossHash });
  return Object.assign({}, bare, {
    runBinding: { runId: manifest.runId, manifestHash: manifest.manifestHash, artifactId: artifactId, artifactHash: artifactHash, crossHash: crossHash },
  });
}

function assertManifest(m) {
  if (!m || m.schema !== "EvidenceForge.RunEvidenceManifest") throw fail("RUN_MANIFEST_MISSING", "RunEvidenceManifest requis.");
  const copy = Object.assign({}, m); delete copy.manifestHash; delete copy.artifacts;
  const expected = sha256Of(Object.assign({}, copy, { artifacts: [] }));
  if (m.manifestHash !== expected) throw fail("RUN_MANIFEST_TAMPERED", "manifestHash incoherent — manifeste altere.");
  return true;
}

/**
 * assertArtifactBoundToRun(artifact, manifest, label, opts)
 * Verifie que l'artefact appartient REELLEMENT a ce run. Recalcule l'empreinte
 * de l'artefact et la croise avec le manifeste : un champ auto-declare reecrit
 * casse le crossHash.
 */
function assertArtifactBoundToRun(artifact, manifest, label, opts) {
  opts = opts || {};
  assertManifest(manifest);
  if (!artifact || typeof artifact !== "object") throw fail("RUN_BINDING_MISSING", label + " : artefact absent.");
  const b = artifact.runBinding;
  if (!b) throw fail("RUN_BINDING_MISSING", label + " : aucun runBinding — un artefact non lie a un run ne prouve rien.");
  if (b.runId !== manifest.runId) throw fail("RUN_BINDING_MISMATCH", label + " : runId \"" + b.runId + "\" different du run attendu \"" + manifest.runId + "\".");
  if (b.manifestHash !== manifest.manifestHash) throw fail("RUN_BINDING_MISMATCH", label + " : manifestHash different du manifeste attendu.");
  const bare = Object.assign({}, artifact); delete bare.runBinding;
  const now = sha256Of(bare);
  if (b.artifactHash !== now) throw fail("RUN_BINDING_MISMATCH", label + " : l'artefact a ete modifie depuis sa liaison au run (reetiquetage detecte).");
  const cross = sha256Of({ manifestHash: manifest.manifestHash, runId: manifest.runId, artifactId: b.artifactId, artifactHash: b.artifactHash });
  if (b.crossHash !== cross) throw fail("RUN_BINDING_MISMATCH", label + " : empreinte croisee invalide.");
  const entry = (manifest.artifacts || []).find((a) => a.artifactId === b.artifactId);
  if (!entry) throw fail("RUN_BINDING_MISMATCH", label + " : artefact absent du manifeste du run.");
  if (entry.crossHash !== b.crossHash) throw fail("RUN_BINDING_MISMATCH", label + " : l'entree du manifeste ne correspond pas.");
  return true;
}

/**
 * assertProductionEvidence(artifact, manifest, label)
 * La production exige un manifeste en mode PRODUCTION et une liaison valide.
 * `executionEvidenceClass` de l'artefact n'est JAMAIS consulte comme preuve.
 */
function assertProductionEvidence(artifact, manifest, label) {
  assertManifest(manifest);
  if (manifest.executionMode !== MODE.PRODUCTION) {
    throw fail("RUN_NOT_PRODUCTION", label + " : le manifeste du run est en mode " + manifest.executionMode + " — une fixture ne devient jamais une preuve reelle par reetiquetage.");
  }
  assertArtifactBoundToRun(artifact, manifest, label);
  return true;
}

module.exports = { createRunEvidenceManifest, bindArtifact, assertManifest, assertArtifactBoundToRun, assertProductionEvidence, sha256Of, canonical, isNonEmptyStr, fail, MODE };
