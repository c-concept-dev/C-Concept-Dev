"use strict";
/**
 * MONO-10 v0.6 — core/operator-trust-verifier.js   (§4, §5, §12)
 *
 * LA SEULE SURFACE DE VERIFICATION DE PRODUCTION.
 *
 * L'appelant declare CE QU'IL VEUT FAIRE VERIFIER :
 *   attestation, expectedRunId, expectedMissionHash, expectedProducer,
 *   expectedExecutionMode, expectedRunManifestRootHash
 *
 * Il ne fournit JAMAIS les regles de confiance. Aucun parametre de cette
 * interface n'accepte une cle, un ancrage, une carte de confiance ni un
 * callback de verification. La cle vient de la frontiere operateur, et d'elle
 * seule.
 *
 * Un verificateur ne peut pas etre fabrique : il porte une marque d'origine que
 * seul ce module attribue. Un objet qui imiterait la forme de l'interface est
 * refuse par les consommateurs (assertProductionVerifier).
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const RA = require("./runtime-attestation.js");
const { evaluateKeyAt } = require("./key-lifecycle.js");
const OTB = require("./operator-trust-boundary.js");
const RP = require("./replay-protection.js");

const VERIFIER_BRAND = new WeakSet();
function isOperatorTrustVerifier(v) { return !!v && VERIFIER_BRAND.has(v); }

function assertProductionVerifier(v, label) {
  label = label || "verificateur de confiance";
  if (!isOperatorTrustVerifier(v)) {
    throw fail("TRUST_VERIFIER_FORGED", label + " : objet non issu d'une frontiere operateur — un appelant ne fabrique pas son verificateur.");
  }
  if (v.namespace !== OTB.NAMESPACE.PRODUCTION) {
    throw fail("TRUST_VERIFIER_NOT_PRODUCTION", label + " : espace " + v.namespace + " — une verification de TEST n'autorise jamais une execution de PRODUCTION.");
  }
  return true;
}

/** createOperatorTrustVerifier(boundary) — la frontiere est la SEULE entree. */
function createOperatorTrustVerifier(boundary) {
  if (!OTB.isOperatorTrustBoundary(boundary)) {
    throw fail("OPERATOR_TRUST_BOUNDARY_FORGED", "frontiere operateur absente ou fabriquee.");
  }
  const v = {
    schema: "EvidenceForge.OperatorTrustVerifier", schemaVersion: "MONO-10-v6",
    namespace: boundary.namespace,
    operatorTrustBoundaryId: boundary.operatorTrustBoundaryId,
    boundaryDescriptorHash: boundary.boundaryDescriptorHash,
    provisionedFrom: boundary.provisionedFrom,
    antiReplayPersistent: !!(boundary.replayStore && boundary.replayStore.persistent),

    /**
     * verifyRuntimeAttestation({ attestation, expectedRunId, expectedMissionHash,
     *   expectedProducer, expectedExecutionMode, expectedRunManifestRootHash,
     *   consumeNonce, now })
     * -> { valid, problems, attestationHash, keyId, authorityId, nonceConsumed }
     */
    verifyRuntimeAttestation(req) {
      req = req || {};
      const problems = [];
      const att = req.attestation;
      try { RA.assertAttestationShape(att); }
      catch (e) { return { valid: false, problems: [e.message], attestationHash: null, nonceConsumed: false }; }

      // L'espace de confiance de la frontiere prime sur ce que l'attestation declare.
      if (att.executionMode !== boundary.namespace) {
        problems.push("l'attestation declare l'espace " + att.executionMode + " alors que la frontiere operateur couvre " + boundary.namespace);
      }
      if (isNonEmptyStr(req.expectedExecutionMode) && att.executionMode !== req.expectedExecutionMode) {
        problems.push("mode d'execution " + att.executionMode + " alors que " + req.expectedExecutionMode + " est exige");
      }

      // §31 — relecture VIVE : une revocation prend effet sans redemarrage.
      // Une configuration devenue illisible vaut echec ferme.
      let key = boundary.lookupKey(att.authorityId, att.keyId);
      if (typeof boundary.reloadKey === "function") {
        const fresh = boundary.reloadKey(att.authorityId, att.keyId);
        if (fresh === undefined) {
          problems.push("configuration de confiance devenue illisible : la revocation ne peut pas etre verifiee — fail closed");
          return { valid: false, problems: problems, attestationHash: null, nonceConsumed: false };
        }
        key = fresh;   // null si la cle a disparu de la configuration
      }
      if (!key) {
        problems.push("autorite \"" + att.authorityId + "\" / cle \"" + att.keyId + "\" absente de la frontiere operateur");
        return { valid: false, problems: problems, attestationHash: null, nonceConsumed: false };
      }
      const ev = evaluateKeyAt(key, att.issuedAt, req.now);
      if (!ev.usable) problems.push("cle inutilisable : " + ev.reason);

      if (!RA.verifySignatureWithKey(att, key.publicKeyPem)) {
        problems.push("signature invalide — la charge attestee ne correspond pas a ce qu'a signe l'autorite");
      }

      const now = isNonEmptyStr(req.now) ? Date.parse(req.now) : Date.now();
      const issued = Date.parse(att.issuedAt);
      if (isNaN(issued)) problems.push("issuedAt n'est pas un horodatage reel");
      else if (issued > now + 60000) problems.push("attestation emise dans le futur");
      if (isNonEmptyStr(att.expiresAt)) {
        const exp = Date.parse(att.expiresAt);
        if (isNaN(exp)) problems.push("expiresAt n'est pas un horodatage reel");
        else if (exp <= now) problems.push("attestation expiree le " + att.expiresAt);
      } else if (boundary.namespace === OTB.NAMESPACE.PRODUCTION) {
        problems.push("une attestation de PRODUCTION doit porter une echeance explicite");
      }

      if (isNonEmptyStr(req.expectedRunId) && att.runId !== req.expectedRunId) problems.push("runId atteste \"" + att.runId + "\" different du run attendu \"" + req.expectedRunId + "\"");
      if (isNonEmptyStr(req.expectedMissionHash) && att.missionHash !== req.expectedMissionHash) problems.push("missionHash atteste different de la mission attendue");
      if (isNonEmptyStr(req.expectedRunManifestRootHash) && att.runManifestRootHash !== req.expectedRunManifestRootHash) {
        problems.push("runManifestRootHash atteste different de la racine de run attendue");
      }
      if (req.expectedProducer) {
        if (isNonEmptyStr(req.expectedProducer.producerId) && att.producerId !== req.expectedProducer.producerId) problems.push("producerId different du producteur attendu");
        if (isNonEmptyStr(req.expectedProducer.producerVersion) && att.producerVersion !== req.expectedProducer.producerVersion) problems.push("producerVersion differente de la version attendue");
      }

      // §25 — en PRODUCTION, la consommation du nonce est FORCEE : un drapeau
      // d'appel ne peut plus la desactiver. `req.consumeNonce === false` est
      // ignore et signale.
      let nonceConsumed = false;
      const store = boundary.replayStore;
      const forced = boundary.policy.forceNonceConsumption === true;
      const consume = forced ? true : (req.consumeNonce === true);
      if (forced && req.consumeNonce === false && req.readOnlyRevalidation !== true) {
        problems.push("consumeNonce=false ignore : la consommation du nonce est obligatoire en production");
      }
      // Revalidation en LECTURE : explicite, et seulement si le nonce a deja
      // ete consomme par CE run (§28).
      const readOnly = req.readOnlyRevalidation === true;
      if (boundary.policy.requireAntiReplay) {
        if (!RP.isProvisionedStore(store)) {
          problems.push("aucune protection anti-rejeu provisionnee par la frontiere operateur — fail closed");
        } else if (!store.coversAuthority(att.authorityId)) {
          problems.push("le store anti-rejeu ne couvre pas l'autorite \"" + att.authorityId + "\" — partage du namespace non garanti, fail closed");
        } else if (consume && !readOnly) {
          const c = store.checkAndConsume(att.authorityId, att.keyId, att.nonce, { runId: att.runId, attestationId: att.attestationId });
          nonceConsumed = c.consumed;
          if (!c.consumed) problems.push("attestation rejouee : " + c.reason);
        } else if (store.hasSeen(att.authorityId, att.keyId, att.nonce)) {
          // Reverification legitime : le nonce a ete consomme par CE run. Un
          // rejeu, lui, reutilise le nonce pour ouvrir un AUTRE run.
          const rec = store.getSeen(att.authorityId, att.keyId, att.nonce);
          if (!rec || rec.runId !== att.runId || (rec.attestationId && rec.attestationId !== att.attestationId)) {
            problems.push("attestation rejouee : nonce deja consomme par un autre run");
          }
        } else if (readOnly) {
          problems.push("revalidation en lecture demandee alors que le nonce n'a jamais ete consomme pour ce run");
        }
      } else if (RP.isProvisionedStore(store) && consume) {
        const c = store.checkAndConsume(att.authorityId, att.keyId, att.nonce, { runId: att.runId, attestationId: att.attestationId });
        nonceConsumed = c.consumed;
        if (!c.consumed) problems.push("attestation rejouee : " + c.reason);
      }

      return { valid: problems.length === 0, problems: problems,
        attestationHash: problems.length === 0 ? RA.attestationHash(att) : null,
        authorityId: att.authorityId, keyId: att.keyId,
        keyFingerprint: key.publicKeyFingerprint, keyStatus: key.status,
        operatorTrustBoundaryId: boundary.operatorTrustBoundaryId,
        nonceConsumed: nonceConsumed };
    },

    /** §17 — l'authentification humaine passe aussi par la frontiere. */
    verifyHumanAct(act, expected) {
      const mech = boundary.humanAuthMechanism;
      if (!mech) {
        return { authenticated: false, authentication: "NOT_AUTHENTICATED", mechanismId: null,
          problems: ["aucun mecanisme d'authentification humaine provisionne par la frontiere operateur — fail closed. Aucune signature humaine n'est inventee."] };
      }
      const res = mech.verifyHumanAct(act, expected || {});
      if (!res || res.authenticated !== true) {
        return { authenticated: false, authentication: "NOT_AUTHENTICATED", mechanismId: (res && res.mechanismId) || mech.mechanismId,
          problems: [(res && res.reason) || "acte refuse par le mecanisme provisionne"] };
      }
      return { authenticated: true, authentication: res.authentication, mechanismId: res.mechanismId,
        actorRecordHash: res.actorRecordHash || null, problems: [] };
    },

    hasHumanAuthMechanism() { return !!boundary.humanAuthMechanism; },
    requiresHumanActProof() { return boundary.policy.requireHumanActProof === true; },

    /** §5 — la capacite de validation d'acceptation vient de la frontiere. */
    acceptanceBoundary() { return boundary.acceptanceBoundary; },
    /** §45 — la capacite de sonde LLM vient de la frontiere. */
    llmCapabilityBoundary() { return boundary.llmCapabilityBoundary; },
    /** §32 — autorite de provenance : seule source des racines authentifiees. */
    provenanceAuthority() { return boundary.provenanceAuthority || null; },
    /** §7 — autorite d'entree historique ; absente => franchissement refuse. */
    historicalInputAuthority() { return boundary.historicalInputAuthority || null; },
    replayNamespaceId: (boundary.replayStore && boundary.replayStore.replayNamespaceId) || null,
    revocationModel: boundary.revocationModel,
  };
  VERIFIER_BRAND.add(v);
  return Object.freeze(v);
}

module.exports = { createOperatorTrustVerifier, isOperatorTrustVerifier, assertProductionVerifier };
