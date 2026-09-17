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
const OPA = require("./operator-provenance-authority.js");
const OHIA = require("./operator-historical-input-authority.js");
const HAB = require("./operator-human-auth-boundary.js");
const OLB = require("./operator-llm-capability-boundary.js");
/**
 * Chargement TARDIF : `authenticated-artifact-registry` depend (par
 * `run-evidence-manifest`) de ce module. Un require au sommet rendrait
 * `isOperatorTrustVerifier` indefini pendant le cycle de chargement, ce qui
 * ferait echouer des controles de confiance de facon silencieuse.
 */
const AC = { get: function () { return require("./artifact-capabilities.js"); } };
const AAR = { get: function () { return require("./authenticated-artifact-registry.js"); } };

/**
 * §7/§8 (v0.10) — FERMETURE B2. Un verificateur ne vaut que pour SON contexte.
 *
 * L'audit A a presente un verificateur TEST REEL — donc porteur d'une marque
 * d'origine authentique — sur un registre PRODUCTION. Comme chaque emetteur
 * comparait sa propre identite a celle que l'appelant lui passait, la
 * comparaison etait toujours satisfaite : le verificateur se comparait a
 * lui-meme.
 *
 * Ici la comparaison est faite contre le contexte ATTENDU (celui du registre
 * authentifie, du run), pas contre ce que l'appelant declare. Les trois
 * composantes sont exigees ; une composante attendue absente refuse.
 */
function assertContextMatches(identity, expected, label) {
  const problems = [];
  expected = expected || {};
  if (!isNonEmptyStr(expected.operatorBoundaryId)) {
    problems.push("contexte attendu sans operatorTrustBoundaryId — comparaison impossible, refus");
  } else if (expected.operatorBoundaryId !== identity.operatorBoundaryId) {
    problems.push("frontiere attendue \"" + expected.operatorBoundaryId + "\" != frontiere du verificateur \""
      + identity.operatorBoundaryId + "\"");
  }
  if (!isNonEmptyStr(expected.configBindingHash)) {
    problems.push("contexte attendu sans configBindingHash — une identite declaree seule est refusee");
  } else if (expected.configBindingHash !== identity.configBindingHash) {
    problems.push("liaison de configuration attendue " + String(expected.configBindingHash).slice(0, 12)
      + " != " + String(identity.configBindingHash).slice(0, 12));
  }
  if (!isNonEmptyStr(expected.executionMode)) {
    problems.push("contexte attendu sans executionMode — refus");
  } else if (expected.executionMode !== identity.executionMode) {
    problems.push("mode attendu " + expected.executionMode + " != mode du verificateur " + identity.executionMode
      + " — un verificateur de TEST n'authentifie jamais un run de PRODUCTION");
  }
  if (isNonEmptyStr(expected.issuerGeneration) && isNonEmptyStr(identity.issuerGeneration)
      && expected.issuerGeneration !== identity.issuerGeneration) {
    problems.push("generation d'emetteur attendue " + expected.issuerGeneration + " != " + identity.issuerGeneration);
  }
  if (problems.length === 0) return true;
  return { status: "PROVENANCE_VERIFIER_CONTEXT_MISMATCH", code: "PROVENANCE_VERIFIER_CONTEXT_MISMATCH",
    certified: false, sourceRootId: null, authorityRootId: null, familyRootId: null, derivationRef: null,
    problems: problems.map(function (m) { return (label || "operation") + " : " + m; }) };
}

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

/**
 * §6 (v0.10) — FERMETURE B1, volet SURFACE. Les emetteurs ne sont plus
 * accessibles a l'appelant.
 *
 * v0.9 exposait `verifier.provenanceAuthority()`,
 * `verifier.llmCapabilityBoundary()`, `verifier.historicalInputAuthority()` et
 * `boundary.humanAuthMechanism`. L'audit A a recupere l'emetteur reel par cette
 * surface et minte une concession.
 *
 * v0.10 : les emetteurs sont detenus PRIVEMENT par `operator-trust-boundary.js`
 * et remis a ce module au moment de construire le verificateur. Le verificateur
 * n'expose que des OPERATIONS qui rendent des RESULTATS deja derives :
 *
 *   resolveProvenanceRoots   certifyProvenance
 *   runLlmProbe              certifyLlmCapability
 *   verifyHumanAct           certifyHumanAuthenticated
 *   authorizeHistoricalInput
 *
 * L'appelant demande une operation. Il ne recoit jamais l'emetteur.
 */
function __buildVerifier(boundary, issuers) {
  issuers = issuers || {};
  const identity = { operatorBoundaryId: boundary.operatorTrustBoundaryId,
    configBindingHash: boundary.configBindingHash || null, executionMode: boundary.namespace,
    issuerGeneration: boundary.issuerGeneration || null };
  /**
   * Chaque emetteur remis doit appartenir a CETTE frontiere. Un appelant qui
   * appellerait ce constructeur avec ses propres emetteurs — de TEST ou d'une
   * autre configuration — est refuse ici (fermeture B2 a la source).
   */
  if (issuers.provenance && !OPA.isProvisionedProvenanceAuthority(issuers.provenance, identity)) {
    throw fail("VERIFIER_ISSUER_FOREIGN", "autorite de provenance n'appartenant pas a cette frontiere.");
  }
  if (issuers.historical && !OHIA.isProvisionedHistoricalInputAuthority(issuers.historical, identity)) {
    throw fail("VERIFIER_ISSUER_FOREIGN", "autorite d'entree historique n'appartenant pas a cette frontiere.");
  }
  if (issuers.humanAuth && !HAB.isProvisionedHumanAuth(issuers.humanAuth, identity)) {
    throw fail("VERIFIER_ISSUER_FOREIGN", "mecanisme d'acte humain n'appartenant pas a cette frontiere.");
  }
  if (issuers.llm && !OLB.isProvisionedLlmBoundary(issuers.llm, identity)) {
    throw fail("VERIFIER_ISSUER_FOREIGN", "frontiere de capacite LLM n'appartenant pas a cette frontiere.");
  }
  return createVerifierObject(boundary, issuers, identity);
}

function createVerifierObject(boundary, issuers, identity) {
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
      const mech = issuers.humanAuth;
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

    hasHumanAuthMechanism() { return !!issuers.humanAuth; },
    requiresHumanActProof() { return boundary.policy.requireHumanActProof === true; },
    hasProvenanceAuthority() { return !!issuers.provenance; },
    /**
     * §6 — un IDENTIFIANT n'est pas un emetteur. Ces trois lectures rendent des
     * chaines de caracteres opaques, necessaires pour rediger une demande
     * (`mechanismRef` d'un acte humain, tracabilite d'un rapport). Elles ne
     * rendent aucun objet capable d'emettre une capacite.
     */
    humanAuthMechanismId() { return issuers.humanAuth ? issuers.humanAuth.mechanismId : null; },
    llmBoundaryId() { return issuers.llm ? issuers.llm.llmBoundaryId : null; },
    provenanceAuthorityId() { return issuers.provenance ? issuers.provenance.authorityId : null; },
    hasLlmCapability() { return !!issuers.llm; },
    hasHistoricalInputAuthority() { return !!issuers.historical; },

    /** §5 — la capacite de validation d'acceptation vient de la frontiere.
     *  Elle n'emet aucune capacite d'artefact : elle valide une acceptation. */
    acceptanceBoundary() { return boundary.acceptanceBoundary; },

    /**
     * §8 (v0.10) — resolution de racines, avec comparaison STRICTE du contexte.
     * `expected` doit porter l'identite composite attendue ET le mode
     * d'execution attendu. Un verificateur TEST presente sur un contexte
     * PRODUCTION est refuse ici (fermeture B2).
     */
    resolveProvenanceRoots(descriptor, expected) {
      const ctxCheck = assertContextMatches(identity, expected, "resolution de provenance");
      if (ctxCheck !== true) return ctxCheck;
      if (!issuers.provenance) {
        return { status: "UNRESOLVED", sourceRootId: null, authorityRootId: null, familyRootId: null,
          problems: ["aucune autorite de provenance provisionnee par cette frontiere — fail closed"], derivationRef: null };
      }
      const res = issuers.provenance.resolveRoots(descriptor || {});
      return Object.assign({}, res, { provenanceAuthorityId: issuers.provenance.authorityId,
        declaration: issuers.provenance.declaredVersusAuthenticated(descriptor || {}, res) });
    },

    /**
     * §4 — CERTIFICATION causale : resout, puis — si et seulement si la
     * resolution a REELLEMENT authentifie — emet la capacite et l'inscrit.
     */
    certifyProvenance(input) {
      input = input || {};
      const registry = input.registry;
      if (!AAR.get().isAuthenticatedRegistry(registry)) {
        return { certified: false, problems: ["registre d'artefacts authentifie requis"] };
      }
      const expected = { operatorBoundaryId: registry.operatorTrustBoundaryId,
        configBindingHash: (registry.boundaryIdentity || {}).configBindingHash,
        executionMode: registry.executionMode };
      const ctxCheck = assertContextMatches(identity, expected, "certification de provenance");
      if (ctxCheck !== true) return { certified: false, problems: ctxCheck.problems };
      const entry = registry.get(input.artifactId);
      if (!entry) return { certified: false, problems: ["artefact \"" + input.artifactId + "\" non enregistre"] };
      if (!issuers.provenance) return { certified: false, problems: ["aucune autorite de provenance provisionnee"] };
      const res = issuers.provenance.resolveRoots({ sourceRootId: entry.artifact.sourceRootId,
        locator: entry.artifact.locator || null, contentHash: entry.artifact.contentHash || null,
        artifactId: input.artifactId, artifactHash: entry.hash,
        runId: registry.runId, missionHash: registry.missionHash });
      if (res.status !== "AUTHENTICATED") return { certified: false, resolution: res, problems: res.problems };
      let grant;
      try { grant = AC.get().mintCapabilityGrant({ issuer: issuers.provenance,
        capability: AC.get().CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: input.artifactId,
        artifactHash: entry.hash, artifactSchema: entry.artifactType,
        runId: registry.runId, missionHash: registry.missionHash,
        operatorBoundaryId: identity.operatorBoundaryId, configBindingHash: identity.configBindingHash,
        executionMode: identity.executionMode, derivationRef: res.derivationRef }); }
      catch (e) { return { certified: false, resolution: res, problems: [String(e.message)] }; }
      registry.grantCapability(input.artifactId, grant);
      return { certified: true, resolution: res, grant: grant, problems: [] };
    },

    /** §11 — la sonde LLM est executee PAR la frontiere, et enregistree. */
    async runLlmProbe(config, ctx) {
      if (!issuers.llm) {
        return { schema: "EvidenceForge.LlmCapability", status: "UNAVAILABLE",
          failureReason: "aucune frontiere de capacite LLM provisionnee par cette frontiere — fail closed" };
      }
      const LCmod = require("./llm-capability.js");
      return LCmod.runActiveProbe(config, Object.assign({}, ctx || {}, { __llmBoundary: issuers.llm }));
    },

    /** §11 — la capacite n'est emise que si la sonde a ete REELLEMENT executee. */
    certifyLlmCapability(input) {
      input = input || {};
      const registry = input.registry;
      if (!AAR.get().isAuthenticatedRegistry(registry)) {
        return { certified: false, problems: ["registre d'artefacts authentifie requis"] };
      }
      const expected = { operatorBoundaryId: registry.operatorTrustBoundaryId,
        configBindingHash: (registry.boundaryIdentity || {}).configBindingHash,
        executionMode: registry.executionMode };
      const ctxCheck = assertContextMatches(identity, expected, "certification de capacite LLM");
      if (ctxCheck !== true) return { certified: false, problems: ctxCheck.problems };
      if (identity.executionMode !== OTB.NAMESPACE.PRODUCTION) {
        return { certified: false, problems: ["PRODUCTION_LLM_CAPABILITY ne s'emet pas depuis un espace "
          + identity.executionMode + " : un transport de test ne prouve aucune capacite de production"] };
      }
      const entry = registry.get(input.artifactId);
      if (!entry) return { certified: false, problems: ["artefact de capacite non enregistre"] };
      const art = entry.artifact;
      if (!isNonEmptyStr(art.probeRef)) {
        return { certified: false, problems: ["l'artefact de capacite ne porte aucune reference de sonde : "
          + "une capacite non sondee n'existe pas"] };
      }
      /**
       * §6 (v0.11) — le SUJET ATTENDU est reconstruit DEPUIS L'ARTEFACT a
       * certifier, puis confronte par l'emetteur au sujet reellement sonde.
       * C'est ici que se ferme B10-01 : une sonde legitime sur un fournisseur
       * autorise ne certifie plus un artefact qui en declare un autre.
       */
      const cert = issuers.llm.certifyProbedArtifact({ probeRef: art.probeRef,
        artifactId: input.artifactId, artifactHash: entry.hash,
        subject: { providerId: art.providerId, modelId: art.modelId, workerBindingId: art.workerBindingId,
          requestId: art.requestId, runId: art.probeRunId, missionHash: registry.missionHash } });
      if (!cert.certified) return { certified: false, problems: cert.problems };
      let grant;
      try { grant = AC.get().mintCapabilityGrant({ issuer: issuers.llm,
        capability: AC.get().CAPABILITY.PRODUCTION_LLM_CAPABILITY, artifactId: input.artifactId,
        artifactHash: entry.hash, artifactSchema: entry.artifactType,
        runId: registry.runId, missionHash: registry.missionHash,
        operatorBoundaryId: identity.operatorBoundaryId, configBindingHash: identity.configBindingHash,
        executionMode: identity.executionMode, derivationRef: cert.derivationRef,
        probeRequestId: art.requestId,
        llmSubject: { providerId: art.providerId, modelId: art.modelId, workerBindingId: art.workerBindingId } }); }
      catch (e) { return { certified: false, problems: [String(e.message)] }; }
      registry.grantCapability(input.artifactId, grant);
      return { certified: true, grant: grant, decision: cert.decision,
        decisionSubjectHash: cert.decision.decisionSubjectHash, problems: [] };
    },

    /**
     * §9 (v0.11) — verification LECTURE SEULE du sujet d'une capacite LLM,
     * valable dans tous les espaces. Rend un verdict, jamais une capacite.
     */
    verifyLlmSubject(input) {
      input = input || {};
      const registry = input.registry;
      if (!AAR.get().isAuthenticatedRegistry(registry)) {
        return { matches: false, problems: ["registre d'artefacts authentifie requis"] };
      }
      const expected = { operatorBoundaryId: registry.operatorTrustBoundaryId,
        configBindingHash: (registry.boundaryIdentity || {}).configBindingHash,
        executionMode: registry.executionMode };
      const ctxCheck = assertContextMatches(identity, expected, "verification de sujet LLM");
      if (ctxCheck !== true) return { matches: false, problems: ctxCheck.problems };
      if (!issuers.llm || typeof issuers.llm.verifyProbedSubject !== "function") {
        return { matches: false, problems: ["aucune frontiere de capacite LLM provisionnee — fail closed"] };
      }
      const entry = registry.get(input.artifactId);
      if (!entry) return { matches: false, problems: ["artefact de capacite non enregistre"] };
      const art = entry.artifact;
      if (!isNonEmptyStr(art.probeRef)) {
        return { matches: false, problems: ["l'artefact ne porte aucune reference de sonde"] };
      }
      return issuers.llm.verifyProbedSubject({ probeRef: art.probeRef,
        artifactId: input.artifactId, artifactHash: entry.hash,
        subject: { providerId: art.providerId, modelId: art.modelId, workerBindingId: art.workerBindingId,
          requestId: art.requestId, runId: art.probeRunId, missionHash: registry.missionHash } });
    },

    /** §4 — la capacite humaine n'est emise qu'apres verification des actes. */
    certifyHumanAuthenticated(input) {
      input = input || {};
      const registry = input.registry;
      if (!AAR.get().isAuthenticatedRegistry(registry)) {
        return { certified: false, problems: ["registre d'artefacts authentifie requis"] };
      }
      const expected = { operatorBoundaryId: registry.operatorTrustBoundaryId,
        configBindingHash: (registry.boundaryIdentity || {}).configBindingHash,
        executionMode: registry.executionMode };
      const ctxCheck = assertContextMatches(identity, expected, "certification d'acte humain");
      if (ctxCheck !== true) return { certified: false, problems: ctxCheck.problems };
      const entry = registry.get(input.artifactId);
      if (!entry) return { certified: false, problems: ["artefact de decision non enregistre"] };
      if (!issuers.humanAuth) return { certified: false, problems: ["aucun mecanisme d'acte humain provisionne"] };
      const cert = issuers.humanAuth.certifyArtifact({ artifactId: input.artifactId, artifactHash: entry.hash,
        runId: registry.runId, missionHash: registry.missionHash, acts: input.acts || [] });
      if (!cert.certified) return { certified: false, problems: cert.problems };
      let grant;
      try { grant = AC.get().mintCapabilityGrant({ issuer: issuers.humanAuth,
        capability: AC.get().CAPABILITY.HUMAN_AUTHENTICATED, artifactId: input.artifactId,
        artifactHash: entry.hash, artifactSchema: entry.artifactType,
        runId: registry.runId, missionHash: registry.missionHash,
        operatorBoundaryId: identity.operatorBoundaryId, configBindingHash: identity.configBindingHash,
        executionMode: identity.executionMode, derivationRef: cert.derivationRef }); }
      catch (e) { return { certified: false, problems: [String(e.message)] }; }
      registry.grantCapability(input.artifactId, grant);
      return { certified: true, grant: grant, problems: [] };
    },

    /**
     * §6/§7 — l'appelant DEMANDE une autorisation historique ; il ne recoit
     * jamais l'autorite. `expected` est le contexte du run de DESTINATION,
     * derive du manifeste ou du registre authentifie — pas de ce verificateur.
     */
    authorizeHistoricalInput(request, expected) {
      const ctxCheck = assertContextMatches(identity, expected, "entree historique");
      if (ctxCheck !== true) return { authorized: false, authorization: null, problems: ctxCheck.problems };
      if (!issuers.historical) {
        return { authorized: false, authorization: null,
          problems: ["aucune autorite d'entree historique provisionnee — franchissement refuse par defaut"] };
      }
      return issuers.historical.authorize(request);
    },
    replayNamespaceId: (boundary.replayStore && boundary.replayStore.replayNamespaceId) || null,
    /** §5 — verification LECTURE SEULE d'une derivation aupres de son emetteur. */
    verifyIssuerDecision(capability, derivationRef, expectations) {
      const map = { AUTHENTICATED_PROVENANCE: issuers.provenance, HUMAN_AUTHENTICATED: issuers.humanAuth,
        PRODUCTION_LLM_CAPABILITY: issuers.llm };
      const issuer = map[capability];
      if (!issuer || typeof issuer.verifyDecision !== "function") {
        return { valid: false, problems: ["aucun emetteur competent pour \"" + capability + "\" dans cette frontiere"] };
      }
      return issuer.verifyDecision(derivationRef, expectations || {});
    },
    /** §4 (v0.9) — identite COMPOSITE de la frontiere courante. */
    configBindingHash: boundary.configBindingHash || null,
    executionMode: boundary.namespace,
    boundaryIdentity: Object.freeze({ operatorBoundaryId: boundary.operatorTrustBoundaryId,
      configBindingHash: boundary.configBindingHash || null, executionMode: boundary.namespace,
      issuerGeneration: boundary.issuerGeneration || null }),
    revocationModel: boundary.revocationModel,
  };
  VERIFIER_BRAND.add(v);
  return Object.freeze(v);
}

/**
 * §6 — `__build` n'est appelable utilement que par `operator-trust-boundary.js`,
 * qui detient les emetteurs. Un appelant qui l'appelle avec des emetteurs qu'il
 * a construits lui-meme est refuse par `VERIFIER_ISSUER_FOREIGN`. Un appelant
 * qui l'appelle sans emetteur obtient un verificateur qui refuse toute
 * certification (fail closed), jamais un verificateur permissif.
 */
module.exports = { __build: __buildVerifier, isOperatorTrustVerifier, assertProductionVerifier,
  PROVENANCE_VERIFIER_CONTEXT_MISMATCH: "PROVENANCE_VERIFIER_CONTEXT_MISMATCH" };
