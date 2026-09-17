"use strict";
/**
 * MONO-10 v0.7 — tools/operator-provisioning.js
 *
 * OUTILLAGE D'EXPLOITANT. N'EST PAS DU CODE DE PRODUCTION EVIDENCEFORGE, et
 * n'est importe par aucun module de core/.
 *
 * Il simule le role d'exploitant : generer une autorite, ecrire la configuration
 * de confiance, tenir le registre d'acteurs habilites. Ces gestes supposent le
 * controle du systeme de fichiers et de l'environnement — c'est precisement ce
 * qui distingue l'exploitant de l'appelant d'EvidenceForge.
 *
 * Aucune cle n'est embarquee ici : les paires sont generees EN MEMOIRE et la
 * cle privee ne quitte jamais la fermeture. Seule la cle PUBLIQUE est ecrite.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { canonical, isNonEmptyStr, fail } = require("../core/canonical.js");
const RA = require("../core/runtime-attestation.js");

/** Autorite d'exploitation. La cle privee reste captive. */
function mintOperatorAuthority(input) {
  input = input || {};
  const authorityId = input.authorityId, keyId = input.keyId || ("key-" + crypto.randomBytes(6).toString("hex"));
  const namespace = input.namespace;
  if (!isNonEmptyStr(authorityId)) throw fail("AUTHORITY_INVALID", "authorityId requis.");
  if (namespace !== "TEST" && namespace !== "PRODUCTION") throw fail("AUTHORITY_INVALID", "namespace TEST ou PRODUCTION requis.");
  const { publicKey, privateKey } = crypto.generateKeyPairSync(RA.ALGORITHM);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  return {
    authorityId, keyId, namespace,
    keyRecord(over) {
      return Object.assign({ keyId: keyId, publicKeyPem: publicKeyPem, status: "ACTIVE",
        validFrom: new Date(Date.now() - 3600000).toISOString(), validUntil: null }, over || {});
    },
    /** Signe une attestation de run. Engage la racine du manifeste (§15). */
    attest(intent, over) {
      const att = Object.assign({
        schema: RA.SCHEMA, schemaVersion: "MONO-10-v5",
        attestationId: "att-" + crypto.randomBytes(8).toString("hex"),
        authorityId: authorityId, keyId: keyId,
        executionMode: intent.executionMode,
        runId: intent.runId, nonce: crypto.randomBytes(16).toString("hex"),
        missionHash: intent.missionHash,
        producerId: intent.producerId, producerVersion: intent.producerVersion,
        runManifestRootHash: RA.computeRunManifestRootHash(intent),
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }, over || {});
      att.signature = crypto.sign(null, Buffer.from(canonical(RA.signedPayload(att)), "utf8"), privateKey).toString("base64");
      return att;
    },
  };
}

/** Ecrit la configuration de confiance que la frontiere lira depuis l'environnement. */
function writeOperatorTrustConfig(configPath, cfg) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const body = JSON.stringify(cfg, null, 2);
  if (/PRIVATE KEY/.test(body)) throw fail("OPERATOR_CONFIG_CONTAINS_SECRET", "refus d'ecrire une configuration contenant de la matiere privee.");
  fs.writeFileSync(configPath, body + "\n");
  return configPath;
}

/** Registre d'acteurs habilites, tenu par l'exploitant. */
function writeHumanActorRegistry(registryPath, actors) {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify({ actors: actors || [] }, null, 2) + "\n");
  return registryPath;
}

/** §32/§33 — registre des RACINES DE PROVENANCE, tenu par l'exploitant. */
function writeProvenanceRootRegistry(registryPath, roots) {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify({ roots: roots || [] }, null, 2) + "\n");
  return registryPath;
}

/** §7/§8 — registre des ENTREES HISTORIQUES autorisees, tenu par l'exploitant. */
function writeHistoricalInputRegistry(registryPath, authorized) {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify({ authorized: authorized || [] }, null, 2) + "\n");
  return registryPath;
}

/**
 * §21 — emet une PREUVE D'ACTE pour le compte du mecanisme de l'exploitant.
 * C'est un geste d'EXPLOITATION : il exige le secret d'attestation de l'acteur,
 * que seul l'exploitant detient. EvidenceForge ne l'emet jamais lui-meme.
 */
function issueHumanActProof(input) {
  input = input || {};
  ["actorId", "actionType", "decisionHash", "runId", "missionHash", "mechanismRef", "actProofSecret"].forEach(function (f) {
    if (!isNonEmptyStr(input[f])) throw fail("ACT_PROOF_INPUT_INVALID", "champ \"" + f + "\" requis.");
  });
  const issuedAt = isNonEmptyStr(input.issuedAt) ? input.issuedAt : new Date().toISOString();
  const payload = { actorId: input.actorId, actionType: input.actionType, decisionHash: input.decisionHash,
    runId: input.runId, missionHash: input.missionHash, issuedAt: issuedAt, mechanismRef: input.mechanismRef };
  const { sha256Of } = require("../core/canonical.js");
  const proofValue = crypto.createHmac("sha256", input.actProofSecret).update(sha256Of(payload)).digest("hex");
  return Object.assign({}, payload, { proofValue: proofValue });
}

module.exports = { mintOperatorAuthority, writeOperatorTrustConfig, writeHumanActorRegistry,
  writeProvenanceRootRegistry, writeHistoricalInputRegistry, issueHumanActProof };
