"use strict";
/**
 * MONO-10 v0.4 — tools/ephemeral-authority.js
 *
 * SIMULATEUR D'AUTORITE POUR LES TESTS. N'EST PAS DU CODE DE PRODUCTION.
 *
 * Il genere une paire de cles EN MEMOIRE a chaque appel. Aucune cle n'est
 * ecrite sur disque, aucune cle n'est embarquee dans ce fichier, et aucune cle
 * ne survit au processus. Le paquet ne contient donc AUCUNE matiere de
 * signature privee — voir TRUST-MODEL.md.
 *
 * En exploitation reelle, l'autorite runtime est un composant EXTERIEUR : ce
 * lot n'en fournit que le VERIFICATEUR (core/trusted-runtime-authority.js) et
 * ne peut pas emettre d'attestation de production, faute de cle.
 *
 * Le fait que n'importe qui puisse fabriquer une autorite avec cet outil n'est
 * pas une faiblesse : une autorite ne vaut que si sa cle publique a ete ANCREE
 * par l'exploitant pour le mode d'execution vise. Voir THREAT-MODEL.md.
 */
const crypto = require("crypto");
const { canonical, sha256Of, isNonEmptyStr, fail } = require("../core/canonical.js");
const { MODE, ALGORITHM, ATTESTATION_SCHEMA, signedPayload } = require("../core/trusted-runtime-authority.js");

function createEphemeralAuthority(authorityId, executionMode) {
  if (!isNonEmptyStr(authorityId)) throw fail("AUTHORITY_INVALID", "authorityId requis.");
  if (executionMode !== MODE.TEST && executionMode !== MODE.PRODUCTION) throw fail("AUTHORITY_INVALID", "executionMode TEST ou PRODUCTION requis.");
  const { publicKey, privateKey } = crypto.generateKeyPairSync(ALGORITHM);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  return {
    authorityId: authorityId,
    executionMode: executionMode,
    /** Seule matiere exportable : la cle PUBLIQUE. */
    anchor: function () { return { authorityId: authorityId, executionMode: executionMode, publicKeyPem: publicKeyPem, algorithm: ALGORITHM }; },
    /** Emet une attestation signee. La cle privee reste captive de la fermeture. */
    attest: function (input) {
      input = input || {};
      const att = {
        schema: ATTESTATION_SCHEMA, schemaVersion: "MONO-10-v4",
        attestationId: isNonEmptyStr(input.attestationId) ? input.attestationId : ("att-" + crypto.randomBytes(8).toString("hex")),
        authorityId: authorityId,
        executionMode: isNonEmptyStr(input.executionMode) ? input.executionMode : executionMode,
        runId: input.runId, nonce: isNonEmptyStr(input.nonce) ? input.nonce : crypto.randomBytes(16).toString("hex"),
        missionHash: input.missionHash,
        producerId: input.producerId, producerVersion: input.producerVersion,
        issuedAt: isNonEmptyStr(input.issuedAt) ? input.issuedAt : new Date().toISOString(),
        expiresAt: input.expiresAt === null ? null : (isNonEmptyStr(input.expiresAt) ? input.expiresAt : new Date(Date.now() + 3600000).toISOString()),
      };
      att.signature = crypto.sign(null, Buffer.from(canonical(signedPayload(att)), "utf8"), privateKey).toString("base64");
      return att;
    },
  };
}

module.exports = { createEphemeralAuthority };
