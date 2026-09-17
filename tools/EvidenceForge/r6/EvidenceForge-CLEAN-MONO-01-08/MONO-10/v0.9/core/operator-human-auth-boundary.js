"use strict";
/**
 * MONO-10 v0.9 — core/operator-human-auth-boundary.js   (§20, §21, §22)
 *
 * FERMETURE v0.5 B05. Le mecanisme ne dit plus « cet acteur existe », il dit
 * « cet ACTE a ete accompli par cet acteur » — et refuse tout le reste.
 *
 * Le noyau ne connait aucune technologie d'authentification. Le mecanisme de
 * TEST reste une fixture declaree ; le mecanisme de PRODUCTION verifie une
 * PREUVE D'ACTE liee a la decision, au run et a la mission.
 */

const crypto = require("crypto");
const fs = require("fs");
const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const HAP = require("./human-act-proof.js");
const AD = require("./authority-descriptor.js");

const HUMAN_AUTH_BRAND = new WeakSet();
const DESCRIPTORS = new WeakMap();
const AUTHENTICATION = {
  TEST_FIXTURE: "TEST_FIXTURE_DECLARED",
  OPERATOR_ACT_PROOF: "OPERATOR_ACT_PROOF_VERIFIED",
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
};
/**
 * FERMETURE B03 (v0.8). `createOperatorActProofMechanism({ registryPath })`
 * etait public : l'appelant ecrivait son propre registre d'acteurs et obtenait
 * un mecanisme authentiquement marque, donc la capacite HUMAN_AUTHENTICATED —
 * celle qu'exige le sink du corpus. Une marque prouve « cree par ce module »,
 * pas « emis par CETTE frontiere ».
 */
function isProvisionedHumanAuth(b, expected) {
  if (!b || !HUMAN_AUTH_BRAND.has(b)) return false;
  const d = DESCRIPTORS.get(b);
  if (!d) return false;
  // §4 (v0.9) — l'identite est COMPOSITE : identifiant declare + liaison de
  // configuration + espace d'execution. Un identifiant seul est declaratif.
  if (expected && (isNonEmptyStr(expected.operatorBoundaryId) || isNonEmptyStr(expected.configBindingHash))) {
    if (!isNonEmptyStr(expected.configBindingHash)) return false;   // fail closed
    if (!AD.sameBoundary(d, expected)) return false;
  }
  if (expected && expected.requireProduction === true && d.executionMode !== "PRODUCTION") return false;
  return true;
}
function descriptorOf(b) { return DESCRIPTORS.get(b) || null; }
function brand(b) { HUMAN_AUTH_BRAND.add(b); return Object.freeze(b); }

/** TEST : fixture declaree, jamais valable en production. */
function buildTestMechanism(namespaceId) {
  return brand({
    mechanismId: "test-fixture:" + (namespaceId || "anonymous"),
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST", requiresActProof: false,
    verifyHumanAct(act, expected) {
      if (!act || act.authenticationMode !== AUTHENTICATION.TEST_FIXTURE) {
        return { authenticated: false, reason: "un acte de TEST doit se declarer explicitement comme fixture" };
      }
      // Meme en TEST, l'acte doit porter la bonne empreinte de decision : un
      // test ne doit pas valider ce que la production refuserait pour cause de
      // liaison. Seule l'AUTHENTICITE est relachee, pas la LIAISON.
      if (expected && isNonEmptyStr(expected.decisionHash)) {
        if (act.decisionHash !== expected.decisionHash) {
          return { authenticated: false, reason: "empreinte de decision absente ou differente de l'acte presente" };
        }
      }
      return { authenticated: true, mechanismId: this.mechanismId, authentication: AUTHENTICATION.TEST_FIXTURE };
    },
  });
}

/**
 * PRODUCTION : registre d'acteurs + PREUVE D'ACTE.
 *
 * Le registre porte, pour chaque acteur, un secret d'attestation detenu par
 * l'exploitant (`actProofKeyRef`) que le mecanisme utilise pour recalculer la
 * valeur de preuve attendue. EvidenceForge ne le lit jamais hors de ce module,
 * et ne le transporte dans aucun artefact.
 *
 * L'appartenance au registre ne suffit PAS : sans preuve d'acte valide et liee,
 * l'acte est NOT_AUTHENTICATED.
 */
function buildActProofMechanism(cfg) {
  if (!cfg || !isNonEmptyStr(cfg.registryPath)) throw fail("HUMAN_AUTH_CONFIG_INVALID", "registryPath requis.");
  const registryPath = cfg.registryPath;
  const mechanismId = "operator-act-proof:" + sha256Of({ p: registryPath }).slice(0, 16);

  return brand({
    mechanismId: mechanismId, namespace: "PRODUCTION", provisionedFrom: "ENVIRONMENT", requiresActProof: true,
    verifyHumanAct(act, expected) {
      expected = expected || {};
      if (!act || !isNonEmptyStr(act.actorIdentity)) return { authenticated: false, reason: "acteur non identifie" };
      if (act.authenticationMode === AUTHENTICATION.TEST_FIXTURE) {
        return { authenticated: false, reason: "acte de fixture presente a un mecanisme de production" };
      }
      let reg;
      try { reg = JSON.parse(fs.readFileSync(registryPath, "utf8")); }
      catch (e) { return { authenticated: false, reason: "registre d'acteurs illisible : " + ((e && e.message) || e) }; }
      const entry = (reg.actors || []).filter((a) => a && a.actorIdentity === act.actorIdentity)[0];
      if (!entry) return { authenticated: false, reason: "acteur absent du registre provisionne par l'exploitant" };
      if (entry.status && entry.status !== "ACTIVE") return { authenticated: false, reason: "acteur " + entry.status + " dans le registre" };

      // §20/§21 — l'appartenance ne suffit pas : il faut une PREUVE D'ACTE.
      const proof = act.humanActProof;
      try { HAP.assertProofBoundTo(proof, { actorId: act.actorIdentity, actionType: expected.actionType,
        decisionHash: expected.decisionHash, runId: expected.runId, missionHash: expected.missionHash }, "acte de " + act.actorIdentity); }
      catch (e) { return { authenticated: false, reason: e.message }; }
      if (proof.mechanismRef !== mechanismId) {
        return { authenticated: false, reason: "preuve emise par un autre mecanisme (" + proof.mechanismRef + ")" };
      }
      if (!isNonEmptyStr(entry.actProofSecret)) {
        return { authenticated: false, reason: "aucun materiau d'attestation d'acte provisionne pour cet acteur — fail closed" };
      }
      const expectedValue = crypto.createHmac("sha256", entry.actProofSecret)
        .update(sha256Of({ actorId: proof.actorId, actionType: proof.actionType, decisionHash: proof.decisionHash,
          runId: proof.runId, missionHash: proof.missionHash, issuedAt: proof.issuedAt, mechanismRef: proof.mechanismRef }))
        .digest("hex");
      let ok = false;
      try {
        const a = Buffer.from(String(proof.proofValue), "hex"), b = Buffer.from(expectedValue, "hex");
        ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch (e) { ok = false; }
      if (!ok) return { authenticated: false, reason: "preuve d'acte invalide — le mecanisme de l'exploitant ne la reconnait pas" };

      return { authenticated: true, mechanismId: mechanismId, authentication: AUTHENTICATION.OPERATOR_ACT_PROOF,
        actorRecordHash: sha256Of({ id: entry.actorIdentity, status: entry.status || "ACTIVE" }),
        actProofHash: sha256Of(proof) };
    },
  });
}

/**
 * createFromBoundary(issuance, cfg) — le seul chemin. Le chemin du registre
 * d'acteurs vient de la configuration DEJA CHARGEE par la frontiere (§7, §8).
 */
function createFromBoundary(issuance, cfg) {
  const OTB = require("./operator-trust-boundary.js");
  if (!OTB.isBoundaryIssuanceHandle(issuance)) {
    throw fail("AUTHORITY_ISSUER_NOT_BOUNDARY",
      "un mecanisme d'acte humain ne se construit que depuis une OperatorTrustBoundary provisionnee.");
  }
  cfg = cfg || {};
  let mech;
  if (cfg.kind === "OPERATOR_ACT_PROOF") {
    const registryPath = issuance.operatorConfigPaths.humanActorsRegistryPath;
    if (!isNonEmptyStr(registryPath)) {
      throw fail("HUMAN_AUTH_CONFIG_INVALID", "la configuration de l'exploitant ne declare aucun humanActorsRegistryPath.");
    }
    mech = buildActProofMechanism({ registryPath: registryPath });
  } else if (cfg.kind === "TEST_FIXTURE") {
    if (issuance.namespace !== "TEST") {
      throw fail("HUMAN_AUTH_INSUFFICIENT", "un mecanisme de fixture ne peut pas authentifier hors TEST.");
    }
    mech = buildTestMechanism(issuance.operatorBoundaryId);
  } else {
    throw fail("HUMAN_AUTH_CONFIG_INVALID", "genre de mecanisme d'acte humain inconnu.");
  }
  DESCRIPTORS.set(mech, AD.makeAuthorityDescriptor(issuance, AD.KIND.HUMAN_ACT, { kind: cfg.kind }));
  return mech;
}

/** §14 — fabrique de TEST explicite. */
function createTestHumanActAuthority(namespaceId) {
  const pseudo = Object.freeze({ operatorBoundaryId: "otb-test-inprocess:" + sha256Of({ n: namespaceId || "test" }).slice(0, 12),
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST",
    configBindingHash: sha256Of({ inProcess: true, n: namespaceId || "test" }), issuerGeneration: "test",
    operatorConfigPaths: {} });
  const mech = buildTestMechanism(namespaceId || "test");
  DESCRIPTORS.set(mech, AD.makeAuthorityDescriptor(pseudo, AD.KIND.HUMAN_ACT, { kind: "TEST_FIXTURE" }));
  return mech;
}

module.exports = { createFromBoundary, createTestHumanActAuthority, descriptorOf,
  isProvisionedHumanAuth, AUTHENTICATION };
