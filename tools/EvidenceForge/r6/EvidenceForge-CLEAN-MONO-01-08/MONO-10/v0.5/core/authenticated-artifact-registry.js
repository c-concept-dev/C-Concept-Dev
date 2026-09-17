"use strict";
/**
 * MONO-10 v0.5 — core/authenticated-artifact-registry.js   (§29)
 *
 * Un registre d'artefacts fourni librement par l'appelant permettrait de
 * presenter tout un univers artificiel comme « la realite » : il suffirait d'y
 * declarer les preuves que l'on veut voir resoudre.
 *
 * v0.5 : le registre est CREE A PARTIR d'un manifeste de run authentifie, et
 * chaque entree doit etre effectivement liee a ce run. Il porte une marque
 * d'origine ; un objet de meme forme fabrique par l'appelant est refuse.
 */

const { artifactHash, isNonEmptyStr, fail } = require("./canonical.js");
const { EXPECTED_PARENTS } = require("./lineage.js");
const RM = require("./run-evidence-manifest.js");

const REGISTRY_BRAND = new WeakSet();
function isAuthenticatedRegistry(r) { return !!r && REGISTRY_BRAND.has(r); }

function assertAuthenticatedRegistry(r, manifest, label) {
  label = label || "registre d'artefacts";
  if (!isAuthenticatedRegistry(r)) {
    throw fail("ARTIFACT_REGISTRY_FORGED", label + " : registre non rattache a un run authentifie — un appelant ne declare pas sa propre realite.");
  }
  if (manifest && r.runId !== manifest.runId) throw fail("ARTIFACT_REGISTRY_RUN_MISMATCH", label + " : registre d'un autre run.");
  if (manifest && r.attestationHash !== manifest.runtimeAttestationHash) throw fail("ARTIFACT_REGISTRY_RUN_MISMATCH", label + " : registre atteste autrement.");
  return true;
}

/**
 * createAuthenticatedArtifactRegistry(manifest, entries, opts)
 * entries : [{ artifactId, relation, artifact }]
 * Chaque artefact doit porter une liaison valide au run du manifeste.
 */
function createAuthenticatedArtifactRegistry(manifest, entries, opts) {
  opts = opts || {};
  RM.assertManifestShape(manifest);
  const map = new Map();
  (entries || []).forEach(function (e, i) {
    const tag = "entree[" + i + "]";
    if (!e || !isNonEmptyStr(e.artifactId) || !e.artifact) throw fail("REGISTRY_INVALID", tag + " : artifactId et artifact requis.");
    if (!isNonEmptyStr(e.relation) || !Object.prototype.hasOwnProperty.call(EXPECTED_PARENTS, e.relation)) {
      throw fail("REGISTRY_INVALID", tag + " : relation \"" + e.relation + "\" hors du graphe canonique.");
    }
    // §29 — l'appartenance au run est VERIFIEE, pas declaree.
    RM.assertArtifactBoundToRun(e.artifact, manifest, tag + " (" + e.artifactId + ")");
    const b = e.artifact.runBinding;
    map.set(e.artifactId, { relation: e.relation, artifactType: e.artifact.schema || null,
      artifact: e.artifact, hash: artifactHash(e.artifact),
      runId: b.runId, missionHash: b.missionHash, attestationHash: b.attestationHash });
  });
  const reg = {
    schema: "EvidenceForge.AuthenticatedArtifactRegistry", schemaVersion: "MONO-10-v5",
    runId: manifest.runId, missionHash: manifest.missionHash,
    attestationHash: manifest.runtimeAttestationHash,
    operatorTrustBoundaryId: manifest.operatorTrustBoundaryId,
    executionMode: manifest.executionMode,
    size: map.size,
    get(artifactId) { return map.get(artifactId) || null; },
    has(artifactId) { return map.has(artifactId); },
    entries() { return Array.from(map.entries()).map(([id, e]) => ({ artifactId: id, relation: e.relation, sha256: e.hash })); },
    forEach(fn) { map.forEach((v, k) => fn(v, k)); },
  };
  REGISTRY_BRAND.add(reg);
  return Object.freeze(reg);
}

module.exports = { createAuthenticatedArtifactRegistry, isAuthenticatedRegistry, assertAuthenticatedRegistry };
