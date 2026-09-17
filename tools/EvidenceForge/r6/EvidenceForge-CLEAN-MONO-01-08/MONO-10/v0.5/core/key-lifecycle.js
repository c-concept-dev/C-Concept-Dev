"use strict";
/**
 * MONO-10 v0.5 — core/key-lifecycle.js   (§9, §10, §11)
 *
 * Cycle de vie generique d'une cle d'autorite. Aucun fournisseur, aucune
 * technologie imposee : HSM, KMS, keychain ou fichier protege produisent tous
 * la meme description.
 *
 * ACTIVE   utilisable pour signer et pour verifier
 * RETIRED  ne signe plus ; les signatures emises PENDANT sa validite restent
 *          verifiables — une rotation ne reecrit pas l'histoire
 * REVOKED  jamais valide, ni avant ni apres : la revocation est retroactive
 */

const { sha256Hex, isNonEmptyStr, fail } = require("./canonical.js");

const KEY_STATUS = { ACTIVE: "ACTIVE", RETIRED: "RETIRED", REVOKED: "REVOKED" };

/** Empreinte publique et non secrete d'une cle. */
function publicKeyFingerprint(publicKeyPem) {
  const body = String(publicKeyPem || "").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return sha256Hex(Buffer.from(body, "base64"));
}

function makeKeyRecord(k) {
  k = k || {};
  ["authorityId", "keyId", "publicKeyPem", "validFrom"].forEach(function (f) {
    if (!isNonEmptyStr(k[f])) throw fail("KEY_RECORD_INVALID", "champ \"" + f + "\" requis.");
  });
  if (/PRIVATE KEY/.test(k.publicKeyPem) || isNonEmptyStr(k.privateKeyPem) || isNonEmptyStr(k.secret)) {
    throw fail("KEY_RECORD_CONTAINS_SECRET", "matiere privee refusee — un enregistrement de cle ne contient jamais de secret.");
  }
  const status = KEY_STATUS[k.status] ? k.status : KEY_STATUS.ACTIVE;
  if (isNaN(Date.parse(k.validFrom))) throw fail("KEY_RECORD_INVALID", "validFrom doit etre un horodatage reel.");
  if (isNonEmptyStr(k.validUntil) && isNaN(Date.parse(k.validUntil))) throw fail("KEY_RECORD_INVALID", "validUntil invalide.");
  if (status === KEY_STATUS.REVOKED && !isNonEmptyStr(k.revokedAt)) throw fail("KEY_RECORD_INVALID", "une cle REVOKED doit porter revokedAt.");
  const fp = publicKeyFingerprint(k.publicKeyPem);
  if (isNonEmptyStr(k.publicKeyFingerprint) && k.publicKeyFingerprint !== fp) {
    throw fail("KEY_FINGERPRINT_MISMATCH", "l'empreinte declaree ne correspond pas a la cle publique.");
  }
  return Object.freeze({
    authorityId: k.authorityId, keyId: k.keyId, publicKeyPem: k.publicKeyPem,
    publicKeyFingerprint: fp, status: status,
    validFrom: k.validFrom, validUntil: isNonEmptyStr(k.validUntil) ? k.validUntil : null,
    revokedAt: isNonEmptyStr(k.revokedAt) ? k.revokedAt : null,
    revocationReason: isNonEmptyStr(k.revocationReason) ? k.revocationReason : null,
    supersedesKeyId: isNonEmptyStr(k.supersedesKeyId) ? k.supersedesKeyId : null,
  });
}

/**
 * evaluateKeyAt(key, signedAtIso, nowIso) -> { usable, reason }
 *
 * `signedAtIso` : le moment de l'EMISSION de la signature — c'est lui qui decide,
 * pas l'instant de la verification. Une cle RETIRED reste donc verifiable pour
 * ce qu'elle a signe pendant sa validite (§10).
 * Une cle REVOKED n'est jamais utilisable (§11), quelle que soit la date.
 */
function evaluateKeyAt(key, signedAtIso, nowIso) {
  if (!key) return { usable: false, reason: "cle inconnue de la frontiere operateur" };
  if (key.status === KEY_STATUS.REVOKED) {
    return { usable: false, reason: "cle REVOQUEE le " + key.revokedAt + (key.revocationReason ? " (" + key.revocationReason + ")" : "") + " — jamais valide, y compris retroactivement" };
  }
  const signedAt = Date.parse(signedAtIso);
  if (isNaN(signedAt)) return { usable: false, reason: "date d'emission de la signature absente ou invalide" };
  if (signedAt < Date.parse(key.validFrom)) return { usable: false, reason: "signature emise avant validFrom de la cle" };
  if (key.validUntil && signedAt > Date.parse(key.validUntil)) return { usable: false, reason: "signature emise apres validUntil de la cle" };
  if (key.status === KEY_STATUS.ACTIVE) return { usable: true, reason: "cle ACTIVE, signature dans sa fenetre de validite" };
  if (key.status === KEY_STATUS.RETIRED) {
    return { usable: true, reason: "cle RETIREE : elle ne signe plus, mais ce qu'elle a signe pendant sa validite reste verifiable (politique historique)" };
  }
  return { usable: false, reason: "statut de cle inconnu" };
}

module.exports = { makeKeyRecord, evaluateKeyAt, publicKeyFingerprint, KEY_STATUS };
