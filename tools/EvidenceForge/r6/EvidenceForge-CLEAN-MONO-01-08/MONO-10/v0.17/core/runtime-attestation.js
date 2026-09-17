"use strict";
/**
 * MONO-10 v0.5 — core/runtime-attestation.js   (§14, §15)
 *
 * FORMAT et VERIFICATION CRYPTOGRAPHIQUE d'une attestation de run.
 *
 * Ce module est DELIBEREMENT de bas niveau et n'est PAS le chemin de production :
 * il ne sait pas a qui faire confiance. Il ne reçoit jamais un jeu d'ancrages
 * choisi par un appelant — c'est la frontiere operateur qui lui fournit la cle,
 * et elle seule (voir operator-trust-verifier.js). Il n'est pas exporte par
 * validators/index.js.
 */

const crypto = require("crypto");
const { canonical, sha256Of, isNonEmptyStr, isHash, fail } = require("./canonical.js");

const SCHEMA = "EvidenceForge.RuntimeAttestation";
const ALGORITHM = "ed25519";
const EXECUTION_MODE = { TEST: "TEST", PRODUCTION: "PRODUCTION" };

/** §14 + §15 — tous ces champs sont couverts par la signature. */
const SIGNED_FIELDS = ["attestationId", "authorityId", "keyId", "executionMode", "runId", "nonce",
  "missionHash", "producerId", "producerVersion", "runManifestRootHash", "issuedAt", "expiresAt"];

function signedPayload(att) {
  const p = {};
  SIGNED_FIELDS.forEach((k) => { p[k] = att[k] === undefined ? null : att[k]; });
  return p;
}
function attestationHash(att) { return sha256Of(Object.assign({}, signedPayload(att), { signature: att.signature })); }

/**
 * §15/§16 — engagement sur la racine du run. Calcule AVANT toute signature, a
 * partir des seuls parametres d'ouverture : aucune circularite avec les
 * artefacts, qui seront enregistres APRES.
 */
function computeRunManifestRootHash(intent) {
  intent = intent || {};
  ["runId", "missionHash", "producerId", "producerVersion", "executionMode", "openedAt"].forEach(function (f) {
    if (!isNonEmptyStr(intent[f])) throw fail("RUN_INTENT_INVALID", "champ \"" + f + "\" requis pour l'engagement de racine.");
  });
  return sha256Of({ runId: intent.runId, missionHash: intent.missionHash, producerId: intent.producerId,
    producerVersion: intent.producerVersion, executionMode: intent.executionMode, openedAt: intent.openedAt });
}

function assertAttestationShape(att) {
  if (!att || att.schema !== SCHEMA) throw fail("ATTESTATION_SHAPE_INVALID", "attestation absente ou de schema inattendu.");
  SIGNED_FIELDS.forEach(function (k) {
    if (k === "expiresAt") return;
    if (!isNonEmptyStr(att[k])) throw fail("ATTESTATION_SHAPE_INVALID", "champ signe \"" + k + "\" absent.");
  });
  if (!isHash(att.missionHash)) throw fail("ATTESTATION_SHAPE_INVALID", "missionHash n'est pas une empreinte.");
  if (!isHash(att.runManifestRootHash)) throw fail("ATTESTATION_SHAPE_INVALID", "runManifestRootHash n'est pas une empreinte.");
  if (!isNonEmptyStr(att.signature)) throw fail("ATTESTATION_SHAPE_INVALID", "signature absente.");
  if (att.executionMode !== EXECUTION_MODE.TEST && att.executionMode !== EXECUTION_MODE.PRODUCTION) {
    throw fail("ATTESTATION_SHAPE_INVALID", "executionMode invalide.");
  }
  return true;
}

/** Verification cryptographique pure contre UNE cle publique donnee. */
function verifySignatureWithKey(att, publicKeyPem) {
  try {
    return crypto.verify(null, Buffer.from(canonical(signedPayload(att)), "utf8"),
      crypto.createPublicKey(publicKeyPem), Buffer.from(att.signature, "base64"));
  } catch (e) { return false; }
}

module.exports = { assertAttestationShape, verifySignatureWithKey, signedPayload, attestationHash,
  computeRunManifestRootHash, SCHEMA, ALGORITHM, SIGNED_FIELDS, EXECUTION_MODE };
