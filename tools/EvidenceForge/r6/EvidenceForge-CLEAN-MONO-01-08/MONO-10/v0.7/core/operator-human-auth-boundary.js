"use strict";
/**
 * MONO-10 v0.6 — core/operator-human-auth-boundary.js   (§20, §21, §22)
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

const HUMAN_AUTH_BRAND = new WeakSet();
const AUTHENTICATION = {
  TEST_FIXTURE: "TEST_FIXTURE_DECLARED",
  OPERATOR_ACT_PROOF: "OPERATOR_ACT_PROOF_VERIFIED",
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
};
function isProvisionedHumanAuth(b) { return !!b && HUMAN_AUTH_BRAND.has(b); }
function brand(b) { HUMAN_AUTH_BRAND.add(b); return Object.freeze(b); }

/** TEST : fixture declaree, jamais valable en production. */
function createTestHumanAuthMechanism(namespaceId) {
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
function createOperatorActProofMechanism(cfg) {
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

module.exports = { createTestHumanAuthMechanism, createOperatorActProofMechanism,
  isProvisionedHumanAuth, AUTHENTICATION };
