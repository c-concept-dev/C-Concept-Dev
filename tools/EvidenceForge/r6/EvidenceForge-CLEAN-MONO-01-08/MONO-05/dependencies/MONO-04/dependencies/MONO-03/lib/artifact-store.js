"use strict";

const { sha256Hex } = require("./canonical-hash.js");
const { createPersistenceError } = require("./persistence-errors.js");

// ArtifactStore — CDC MONO-03 section 4. Store global d'artefacts,
// namespace "artifacts" du PersistenceBackend injecté. Ne modifie JAMAIS le
// payload métier — clone défensif assuré par backend.put()/get()
// (structuredClone), jamais une mutation en place.
//
// Chaque artefact est identifié par artifactId = sha256(runId, nodeId,
// contract, schemaVersion, missionId, contentHash) — deux artefacts
// distincts (même par accident) ne peuvent jamais partager un artifactId.
const NAMESPACE = "artifacts";

function computeArtifactId({ runId, nodeId, contract, schemaVersion, missionId, contentHash }) {
  return sha256Hex({ runId, nodeId, contract, schemaVersion, missionId, contentHash });
}

function createArtifactStore(backend) {
  if (!backend || typeof backend.get !== "function" || typeof backend.put !== "function" || typeof backend.has !== "function") {
    throw new Error("createArtifactStore: backend invalide (attendu {get, put, has, delete, keys}) — jamais construit implicitement, voir lib/persistence-backend.js.");
  }

  async function putArtifact({ runId, nodeId, contract, schemaVersion, missionId, payload }) {
    if (!runId || !nodeId || !contract || !schemaVersion || !missionId) {
      throw createPersistenceError("PERSISTENCE_WRITE_FAILED", "putArtifact: runId/nodeId/contract/schemaVersion/missionId requis.", { runId, nodeId, contract });
    }
    if (payload === undefined) {
      throw createPersistenceError("PERSISTENCE_WRITE_FAILED", "putArtifact: payload manquant — jamais un artefact vide silencieusement accepté.", { runId, nodeId });
    }
    const contentHash = sha256Hex(payload);
    const artifactId = computeArtifactId({ runId, nodeId, contract, schemaVersion, missionId, contentHash });

    let existing;
    try {
      existing = await backend.has(NAMESPACE, artifactId);
    } catch (e) {
      throw createPersistenceError("PERSISTENCE_READ_FAILED", "putArtifact: échec de vérification de présence avant écriture.", { cause: String(e && e.message) });
    }
    if (existing) {
      const record = await backend.get(NAMESPACE, artifactId);
      if (record.contentHash === contentHash) {
        return record; // idempotent : même identité, même contenu -> renvoyer l'existant
      }
      throw createPersistenceError("ARTIFACT_CONFLICT", `putArtifact: artifactId "${artifactId}" existe déjà avec un contentHash différent — jamais un écrasement silencieux.`, { artifactId, existingHash: record.contentHash, newHash: contentHash });
    }

    const record = {
      schema: "EvidenceForge.ArtifactRecord",
      schemaVersion: "MONO-03-v1",
      artifactId,
      runId,
      nodeId,
      contract,
      contractSchemaVersion: schemaVersion,
      missionId,
      contentHash,
      createdAt: new Date().toISOString(),
      payload,
    };

    try {
      await backend.put(NAMESPACE, artifactId, record);
    } catch (e) {
      throw createPersistenceError("PERSISTENCE_WRITE_FAILED", `putArtifact: échec d'écriture durable pour l'artefact "${artifactId}".`, { artifactId, cause: String(e && e.message) });
    }

    // Vérification immédiate après écriture — jamais confiant sans revérifier.
    let verify;
    try {
      verify = await getArtifact(artifactId);
    } catch (e) {
      verify = null;
    }
    if (!verify || verify.contentHash !== contentHash) {
      throw createPersistenceError("PERSISTENCE_WRITE_FAILED", `putArtifact: vérification immédiate après écriture a échoué pour "${artifactId}".`, { artifactId });
    }

    return record;
  }

  async function getArtifact(artifactId, expected) {
    let record;
    try {
      record = await backend.get(NAMESPACE, artifactId);
    } catch (e) {
      throw createPersistenceError("PERSISTENCE_READ_FAILED", `getArtifact: échec de lecture durable pour "${artifactId}".`, { artifactId, cause: String(e && e.message) });
    }
    if (record === undefined) {
      throw createPersistenceError("ARTIFACT_NOT_FOUND", `getArtifact: aucun artefact pour artifactId="${artifactId}".`, { artifactId });
    }

    const recomputed = sha256Hex(record.payload);
    if (recomputed !== record.contentHash) {
      throw createPersistenceError("PERSISTED_ARTIFACT_MISMATCH", `getArtifact: contentHash incohérent pour "${artifactId}" — corruption détectée, jamais une réparation heuristique.`, { artifactId, storedHash: record.contentHash, computedHash: recomputed });
    }

    if (expected) {
      for (const field of ["runId", "missionId", "contract", "nodeId"]) {
        if (expected[field] !== undefined && expected[field] !== record[field]) {
          throw createPersistenceError("PERSISTED_ARTIFACT_MISMATCH", `getArtifact: ${field} attendu "${expected[field]}" mais artefact "${artifactId}" porte ${field}="${record[field]}".`, { artifactId, field, expected: expected[field], found: record[field] });
        }
      }
      if (expected.schemaVersion !== undefined && expected.schemaVersion !== record.contractSchemaVersion) {
        throw createPersistenceError("PERSISTED_ARTIFACT_MISMATCH", `getArtifact: schemaVersion attendue "${expected.schemaVersion}" mais artefact "${artifactId}" porte "${record.contractSchemaVersion}".`, { artifactId, expected: expected.schemaVersion, found: record.contractSchemaVersion });
      }
    }

    return record;
  }

  async function hasArtifact(artifactId) {
    return backend.has(NAMESPACE, artifactId);
  }

  return { putArtifact, getArtifact, hasArtifact, computeArtifactId };
}

module.exports = { createArtifactStore, computeArtifactId };
