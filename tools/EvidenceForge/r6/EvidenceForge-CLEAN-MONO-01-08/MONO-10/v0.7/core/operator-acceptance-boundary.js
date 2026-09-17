"use strict";
/**
 * MONO-10 v0.6 — core/operator-acceptance-boundary.js   (§5, §6, §7, §8, §9)
 *
 * FERMETURE v0.5 B01 — le bloqueur le plus grave de v0.5.
 *
 * En v0.5, `resolveDownstreamUseAuthorization` acceptait un `acceptanceValidator`
 * FOURNI PAR L'APPELANT et lui deleguait toute la validation. Un validateur
 * fabrique transformait en AUTHORIZED : un acteur inconnu, une acceptation
 * VIDE, et jusqu'au REFUS EXPLICITE d'un humain.
 *
 * v0.6 : la validation d'acceptation est une CAPACITE PROVISIONNEE. L'appelant
 * fournit l'artefact d'acceptation ; il ne fournit pas la fonction qui decide
 * si cet artefact est valide.
 *
 *   §7 — un refus humain ne peut JAMAIS devenir une autorisation.
 *   §8 — un objet vide ou incomplet ne peut JAMAIS autoriser.
 *   §9 — l'exigence d'acceptation humaine ne se desactive pas en production.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");

const ACCEPTANCE_BRAND = new WeakSet();
function isProvisionedAcceptanceBoundary(b) { return !!b && ACCEPTANCE_BRAND.has(b); }
function brand(b) { ACCEPTANCE_BRAND.add(b); return Object.freeze(b); }

const DECISION = { ACCEPT: "ACCEPT_AS_REPORTED", ACCEPT_WITH_RESERVATIONS: "ACCEPT_WITH_RESERVATIONS", REJECT: "REJECT_FOR_REVIEW" };
/** §7 — la liste des decisions qui BLOQUENT, en dur et non surchargeable. */
const BLOCKING_DECISIONS = [DECISION.REJECT];
const CONTINUATION_OK = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS];

/**
 * createAcceptanceBoundary({ namespace, validate })
 * `validate` est la fonction de validation LIVREE, injectee ici par le module
 * d'acceptation lui-meme au moment du provisionnement. Elle n'est jamais reçue
 * d'un appelant : la frontiere est construite par la frontiere de confiance.
 */
function createAcceptanceBoundary(input) {
  input = input || {};
  if (input.namespace !== "TEST" && input.namespace !== "PRODUCTION") {
    throw fail("ACCEPTANCE_BOUNDARY_INVALID", "namespace TEST ou PRODUCTION requis.");
  }
  if (typeof input.validate !== "function") throw fail("ACCEPTANCE_BOUNDARY_INVALID", "fonction de validation livree requise.");
  const validate = input.validate;
  const namespace = input.namespace;

  return brand({
    boundaryKind: "EvidenceForge.OperatorAcceptanceBoundary", schemaVersion: "MONO-10-v6",
    namespace: namespace,
    acceptanceBoundaryId: "oab-" + sha256Of({ ns: namespace, id: input.boundaryId || namespace }).slice(0, 20),
    /** humanAcceptanceRequired est un CONTRAT de la frontiere, pas une option d'appel. */
    humanAcceptanceRequired: input.humanAcceptanceRequired !== false,

    /**
     * validateAcceptance(acceptance, report, ctx) -> { valid, problems,
     *   continuationAllowed, humanActAuthenticated, blockingDecision }
     */
    validateAcceptance(acceptance, report, ctx) {
      // §8 — un objet vide ou incomplet est refuse avant tout le reste.
      if (!acceptance || typeof acceptance !== "object" || !isNonEmptyStr(acceptance.schema)) {
        return { valid: false, continuationAllowed: false, humanActAuthenticated: false, blockingDecision: false,
          problems: ["acceptation absente ou incomplete — un objet vide n'autorise jamais rien."] };
      }
      // §7 — le refus humain est ABSOLU et evalue AVANT toute autre logique.
      if (BLOCKING_DECISIONS.indexOf(acceptance.decision) !== -1) {
        return { valid: false, continuationAllowed: false, humanActAuthenticated: false, blockingDecision: true,
          problems: ["decision humaine \"" + acceptance.decision + "\" : refus explicite. Aucune politique, aucun mecanisme "
            + "ne peut convertir un refus humain en autorisation."] };
      }
      const res = validate(acceptance, report, ctx) || {};
      const out = { valid: res.valid === true, problems: res.problems || [],
        continuationAllowed: res.valid === true && CONTINUATION_OK.indexOf(acceptance.decision) !== -1,
        humanActAuthenticated: res.humanActAuthenticated === true, blockingDecision: false,
        acceptanceBoundaryId: this.acceptanceBoundaryId, namespace: namespace };
      if (out.valid && !out.continuationAllowed) out.problems = out.problems.concat(["decision d'acceptation incompatible avec une continuation"]);
      return out;
    },
  });
}

module.exports = { createAcceptanceBoundary, isProvisionedAcceptanceBoundary,
  DECISION, BLOCKING_DECISIONS, CONTINUATION_OK };
