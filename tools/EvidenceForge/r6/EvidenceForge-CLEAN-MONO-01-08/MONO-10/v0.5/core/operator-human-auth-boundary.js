"use strict";
/**
 * MONO-10 v0.5 — core/operator-human-auth-boundary.js   (§17, §18, §44)
 *
 * Meme principe que la racine de confiance : EvidenceForge demande « cet acte
 * humain est-il authentique ? », mais ne fournit pas le mecanisme qui repond OUI.
 *
 * En v0.4, `humanActVerifier` etait un callback passe par l'appelant : celui-la
 * meme qui fabriquait les decisions decidait si elles etaient authentiques.
 * En v0.5, le mecanisme est PROVISIONNE par la frontiere operateur, et un
 * callback fourni par l'appelant est refuse en production.
 *
 * Ce module ne connait aucun mecanisme concret : carte a puce, SSO, registre
 * signe, parapheur… tout cela reste hors d'EvidenceForge. Il n'implemente ici
 * qu'une forme verifiable localement — une liste d'acteurs habilites, scellee
 * par l'exploitant — pour que le CONTRAT soit testable sans inventer de
 * signature humaine.
 */

const fs = require("fs");
const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");

const HUMAN_AUTH_BRAND = new WeakSet();
const AUTHENTICATION = {
  TEST_FIXTURE: "TEST_FIXTURE_DECLARED",
  OPERATOR_MECHANISM: "OPERATOR_MECHANISM_VERIFIED",
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
};

function isProvisionedHumanAuth(b) { return !!b && HUMAN_AUTH_BRAND.has(b); }
function brand(b) { HUMAN_AUTH_BRAND.add(b); return Object.freeze(b); }

/**
 * Mecanisme de TEST : accepte uniquement des actes qui se DECLARENT fixtures,
 * et uniquement dans l'espace TEST. Il ne peut jamais authentifier en production.
 */
function createTestHumanAuthMechanism(namespaceId) {
  return brand({
    mechanismId: "test-fixture:" + (namespaceId || "anonymous"),
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST",
    verifyHumanAct(act) {
      if (!act || act.authenticationMode !== AUTHENTICATION.TEST_FIXTURE) {
        return { authenticated: false, reason: "un acte de TEST doit se declarer explicitement comme fixture" };
      }
      return { authenticated: true, mechanismId: this.mechanismId, authentication: AUTHENTICATION.TEST_FIXTURE };
    },
  });
}

/**
 * Mecanisme provisionne par l'exploitant : registre d'acteurs habilites, scelle
 * hors du processus. Le fichier est relu a chaque verification pour qu'une
 * revocation prenne effet sans redemarrage.
 */
function createOperatorRegistryHumanAuthMechanism(cfg) {
  if (!cfg || !isNonEmptyStr(cfg.registryPath)) throw fail("HUMAN_AUTH_CONFIG_INVALID", "registryPath requis.");
  const registryPath = cfg.registryPath;
  const mechanismId = "operator-registry:" + sha256Of({ p: registryPath }).slice(0, 16);
  return brand({
    mechanismId: mechanismId, namespace: "PRODUCTION", provisionedFrom: "ENVIRONMENT",
    verifyHumanAct(act, ctx) {
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
      // Le registre peut restreindre un acteur a un run ou a une mission.
      if (Array.isArray(entry.allowedRunIds) && ctx && isNonEmptyStr(ctx.runId) && entry.allowedRunIds.indexOf(ctx.runId) === -1) {
        return { authenticated: false, reason: "acteur non habilite pour ce run" };
      }
      return { authenticated: true, mechanismId: mechanismId, authentication: AUTHENTICATION.OPERATOR_MECHANISM,
        actorRecordHash: sha256Of(entry) };
    },
  });
}

module.exports = { createTestHumanAuthMechanism, createOperatorRegistryHumanAuthMechanism,
  isProvisionedHumanAuth, AUTHENTICATION };
