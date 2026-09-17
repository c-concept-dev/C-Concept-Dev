"use strict";
/**
 * MONO-10 v0.4 — core/trusted-runtime-authority.js
 *
 * FERMETURE DU BLOQUEUR v0.3 B-1.
 *
 * En v0.3, le RunEvidenceManifest se certifiait lui-meme : le meme appelant
 * creait le manifeste et les artefacts, et `manifestHash` etait recalcule depuis
 * les champs du manifeste. Une chaine entierement synthetique atteignait donc
 * AUTHORIZED. La racine de confiance avait ete DEPLACEE, pas etablie.
 *
 * v0.4 introduit une racine EXTERIEURE a la chaine : une autorite runtime dont
 * la cle publique est un ancrage de confiance CONFIGURE PAR L'EXPLOITANT, hors
 * du paquet et hors des artefacts. Un run ne vaut comme execution authentifiee
 * que s'il porte une attestation SIGNEE par une autorite ancree pour CE mode
 * d'execution.
 *
 * INVARIANT DE PAQUETAGE : ce lot ne contient AUCUNE matiere de signature
 * privee. Il n'embarque aucun ancrage de production : un ancrage absent vaut
 * fail-closed, jamais permissif.
 *
 * Ce module ne connait aucun metier, aucun fournisseur, aucun cas d'usage :
 * `authorityId` et `producerId` sont des chaines opaques.
 */

const crypto = require("crypto");
const { canonical, sha256Of, isNonEmptyStr, isHash, fail } = require("./canonical.js");

const MODE = { TEST: "TEST", PRODUCTION: "PRODUCTION" };
const ALGORITHM = "ed25519";
const ATTESTATION_SCHEMA = "EvidenceForge.TrustedRuntimeAttestation";

/** Les champs SIGNES. Tout ce qui n'est pas ici n'est pas couvert par la signature. */
const SIGNED_FIELDS = ["attestationId", "authorityId", "executionMode", "runId", "nonce",
  "missionHash", "producerId", "producerVersion", "issuedAt", "expiresAt"];

function signedPayload(att) {
  const p = {};
  SIGNED_FIELDS.forEach((k) => { p[k] = att[k] === undefined ? null : att[k]; });
  return p;
}

/**
 * createTrustAnchorSet(anchors)
 * anchors : [{ authorityId, executionMode, publicKeyPem, algorithm? }]
 *
 * Refuse toute matiere privee : un ancrage n'est jamais un secret.
 */
function createTrustAnchorSet(anchors) {
  const set = new Map();
  (anchors || []).forEach(function (a, i) {
    const tag = "anchor[" + i + "]";
    if (!a || !isNonEmptyStr(a.authorityId)) throw fail("TRUST_ANCHOR_INVALID", tag + " : authorityId requis.");
    if (a.executionMode !== MODE.TEST && a.executionMode !== MODE.PRODUCTION) {
      throw fail("TRUST_ANCHOR_INVALID", tag + " : executionMode doit valoir TEST ou PRODUCTION — un ancrage n'est jamais valable pour les deux.");
    }
    if (!isNonEmptyStr(a.publicKeyPem)) throw fail("TRUST_ANCHOR_INVALID", tag + " : publicKeyPem requis.");
    if (/PRIVATE KEY/.test(a.publicKeyPem) || isNonEmptyStr(a.privateKeyPem) || isNonEmptyStr(a.secret)) {
      throw fail("TRUST_ANCHOR_CONTAINS_SECRET", tag + " : matiere privee refusee — un ancrage de confiance ne contient jamais de secret.");
    }
    // La cle est scindee par MODE : une meme autorite ne peut pas couvrir les deux.
    const key = a.executionMode + "|" + a.authorityId;
    if (set.has(key)) throw fail("TRUST_ANCHOR_DUPLICATE", tag + " : ancrage deja declare pour " + key + ".");
    set.set(key, { authorityId: a.authorityId, executionMode: a.executionMode,
      publicKeyPem: a.publicKeyPem, algorithm: a.algorithm || ALGORITHM,
      anchorHash: sha256Of({ authorityId: a.authorityId, executionMode: a.executionMode, publicKeyPem: a.publicKeyPem }) });
  });
  return set;
}

function attestationHash(att) { return sha256Of(Object.assign({}, signedPayload(att), { signature: att.signature })); }

/**
 * verifyAttestation(attestation, anchorSet, opts) -> { valid, problems, anchor, attestationHash }
 *
 * opts.now                 horodatage d'evaluation (injecte ; aucun appel systeme cache)
 * opts.expectedRunId       liaison au run attendu
 * opts.expectedMissionHash liaison a la mission attendue
 * opts.expectedMode        mode exige (TEST ou PRODUCTION)
 * opts.seenNonces          Set des nonces deja consommes -> anti-rejeu
 */
function verifyAttestation(attestation, anchorSet, opts) {
  opts = opts || {};
  const problems = [];
  if (!attestation || attestation.schema !== ATTESTATION_SCHEMA) {
    return { valid: false, problems: ["attestation absente ou de schema inattendu"], anchor: null, attestationHash: null };
  }
  if (!anchorSet || typeof anchorSet.get !== "function") {
    return { valid: false, problems: ["aucun jeu d'ancrages de confiance configure : sans racine externe, rien n'est authentifie"], anchor: null, attestationHash: null };
  }
  SIGNED_FIELDS.forEach(function (k) {
    if (k === "expiresAt") return;
    if (!isNonEmptyStr(attestation[k])) problems.push("champ signe \"" + k + "\" absent");
  });
  if (attestation.executionMode !== MODE.TEST && attestation.executionMode !== MODE.PRODUCTION) {
    problems.push("executionMode invalide");
  }
  if (!isHash(attestation.missionHash)) problems.push("missionHash n'est pas une empreinte");
  if (!isNonEmptyStr(attestation.signature)) problems.push("signature absente");

  // §2 — un ancrage est lie a UN mode. Une attestation TEST ne peut jamais etre
  // validee comme PRODUCTION, meme en reecrivant executionMode : la cle de
  // recherche d'ancrage inclut le mode, et la signature couvre le mode.
  const anchor = problems.length ? null : anchorSet.get(attestation.executionMode + "|" + attestation.authorityId);
  if (!anchor) {
    problems.push("aucune autorite ancree pour \"" + attestation.authorityId + "\" en mode " + attestation.executionMode
      + " — autorite inconnue, ou ancree pour un autre mode d'execution");
    return { valid: false, problems: problems, anchor: null, attestationHash: null };
  }

  let sigOk = false;
  try {
    sigOk = crypto.verify(null, Buffer.from(canonical(signedPayload(attestation)), "utf8"),
      crypto.createPublicKey(anchor.publicKeyPem), Buffer.from(attestation.signature, "base64"));
  } catch (e) { problems.push("verification de signature impossible : " + ((e && e.message) || e)); }
  if (!sigOk) problems.push("signature invalide — la charge attestee ne correspond pas a ce qu'a signe l'autorite");

  const now = isNonEmptyStr(opts.now) ? Date.parse(opts.now) : Date.now();
  const issued = Date.parse(attestation.issuedAt);
  if (isNaN(issued)) problems.push("issuedAt n'est pas un horodatage reel");
  else if (issued > now + 60000) problems.push("attestation emise dans le futur");
  if (isNonEmptyStr(attestation.expiresAt)) {
    const exp = Date.parse(attestation.expiresAt);
    if (isNaN(exp)) problems.push("expiresAt n'est pas un horodatage reel");
    else if (exp <= now) problems.push("attestation expiree le " + attestation.expiresAt);
  } else if (attestation.executionMode === MODE.PRODUCTION) {
    problems.push("une attestation de PRODUCTION doit porter une echeance explicite");
  }

  if (isNonEmptyStr(opts.expectedMode) && attestation.executionMode !== opts.expectedMode) {
    problems.push("mode d'execution " + attestation.executionMode + " alors que " + opts.expectedMode + " est exige");
  }
  if (isNonEmptyStr(opts.expectedRunId) && attestation.runId !== opts.expectedRunId) {
    problems.push("runId atteste \"" + attestation.runId + "\" different du run attendu \"" + opts.expectedRunId + "\"");
  }
  if (isNonEmptyStr(opts.expectedMissionHash) && attestation.missionHash !== opts.expectedMissionHash) {
    problems.push("missionHash atteste different de la mission attendue");
  }
  // §5/§27-T05 — anti-rejeu : le nonce n'est consommable qu'une fois.
  if (opts.seenNonces && typeof opts.seenNonces.has === "function") {
    if (opts.seenNonces.has(attestation.nonce)) problems.push("nonce deja consomme — attestation rejouee");
  }

  return { valid: problems.length === 0, problems: problems, anchor: anchor,
    attestationHash: problems.length === 0 ? attestationHash(attestation) : null };
}

function assertAttestation(attestation, anchorSet, opts, label) {
  const v = verifyAttestation(attestation, anchorSet, opts);
  if (!v.valid) throw fail("TRUSTED_RUNTIME_ATTESTATION_INVALID", (label || "attestation") + " : " + v.problems.join(" ; "));
  if (opts && opts.seenNonces && typeof opts.seenNonces.add === "function") opts.seenNonces.add(attestation.nonce);
  return v;
}

module.exports = { createTrustAnchorSet, verifyAttestation, assertAttestation, attestationHash, signedPayload,
  MODE, ALGORITHM, ATTESTATION_SCHEMA, SIGNED_FIELDS };
