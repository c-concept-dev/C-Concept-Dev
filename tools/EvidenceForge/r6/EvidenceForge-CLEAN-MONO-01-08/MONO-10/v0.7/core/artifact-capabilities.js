"use strict";
/**
 * MONO-10 v0.7 — core/artifact-capabilities.js   (§26, §27, §28, §29, §30, §31)
 *
 * FERMETURE M7. v0.6 livrait une echelle ORDINALE
 * (`REGISTERED < BOUND_TO_RUN < AUTHENTICATED_PROVENANCE < HUMAN_AUTHENTICATED
 *   < PRODUCTION_CAPABILITY_PROVED`) avec deux defauts constates :
 *
 *   1. `elevate(id, niveau, justificationHash)` acceptait N'IMPORTE QUELLE
 *      chaine comme justification : un artefact documentaire synthetique
 *      atteignait le niveau le plus haut avec `sha256({motif:"je le decrete"})` ;
 *   2. aucun consommateur critique ne lisait le niveau — la hierarchie etait
 *      decorative.
 *
 * v0.7 applique §31 : ces proprietes sont ORTHOGONALES, pas ordonnees. Une
 * preuve documentaire authentifiee n'est pas « inferieure » a un acte humain :
 * ce sont deux choses differentes. L'echelle est donc remplacee par des
 * CAPACITES TYPEES, chacune :
 *
 *   - emise par la capacite operateur COMPETENTE (§27), jamais par un hash ;
 *   - restreinte aux schemas d'artefact appropries (§29) ;
 *   - EXIGEE par un sink critique nomme (§30).
 *
 * Une capacite non exigee par un sink n'a pas de raison d'exister : la table
 * `SINK_REQUIREMENTS` est le contrat, et le test `T37` verifie qu'un sink
 * refuse reellement une capacite absente.
 */

const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");
const CC = require("./canonical-contracts.js");
const HAB = require("./operator-human-auth-boundary.js");
const OLB = require("./operator-llm-capability-boundary.js");
const OPA = require("./operator-provenance-authority.js");

const CAPABILITY = CC.CAPABILITY;

/** §30 — ce que chaque sink critique EXIGE. Documente et teste. */
const SINK_REQUIREMENTS = Object.freeze({
  "panel-gate:evidence-presented-to-human": CAPABILITY.AUTHENTICATED_PROVENANCE,
  "panel-gated-adapter:corpus-sink": CAPABILITY.HUMAN_AUTHENTICATED,
  "llm-capability:production-use": CAPABILITY.PRODUCTION_LLM_CAPABILITY,
});

/** §27/§29 — quelle autorite peut emettre quelle capacite. */
const ISSUER_OF = Object.freeze({
  [CAPABILITY.AUTHENTICATED_PROVENANCE]: { check: OPA.isProvisionedProvenanceAuthority, label: "EvidenceProvenanceAuthority" },
  [CAPABILITY.HUMAN_AUTHENTICATED]: { check: HAB.isProvisionedHumanAuth, label: "mecanisme d'acte humain de l'exploitant" },
  [CAPABILITY.PRODUCTION_LLM_CAPABILITY]: { check: OLB.isProvisionedLlmBoundary, label: "frontiere de capacite LLM de l'exploitant" },
});

const GRANT_BRAND = new WeakSet();

/**
 * mintCapabilityGrant(input) — le SEUL chemin vers une capacite.
 * `issuer` doit etre une capacite operateur reellement provisionnee : un objet
 * de forme compatible est refuse (marque d'origine module-privee).
 */
function mintCapabilityGrant(input) {
  input = input || {};
  const cap = input.capability;
  if (!CAPABILITY[cap]) throw fail("CAPABILITY_UNKNOWN", "capacite \"" + cap + "\" inconnue de la source canonique.");
  if (cap === CAPABILITY.RUN_BOUND) {
    throw fail("CAPABILITY_NOT_GRANTABLE", "RUN_BOUND est etabli par l'enregistrement lui-meme ; il ne s'octroie pas.");
  }
  const issuerSpec = ISSUER_OF[cap];
  if (!issuerSpec || issuerSpec.check(input.issuer) !== true) {
    throw fail("CAPABILITY_ISSUER_INVALID",
      "la capacite \"" + cap + "\" ne peut etre emise que par " + ((issuerSpec && issuerSpec.label) || "une autorite competente")
      + ". Un hash, une chaine ou un objet de forme compatible n'est pas une autorite.");
  }
  ["artifactId", "artifactHash", "artifactSchema", "runId", "missionHash"].forEach(function (f) {
    if (!isNonEmptyStr(input[f])) throw fail("CAPABILITY_GRANT_INCOMPLETE", "champ \"" + f + "\" requis pour une capacite.");
  });
  // §29 — un artefact d'un type inapproprie n'obtient jamais la capacite.
  const eligible = CC.CAPABILITY_ELIGIBLE_SCHEMAS[cap] || [];
  if (eligible.indexOf(input.artifactSchema) === -1) {
    throw fail("CAPABILITY_SCHEMA_INELIGIBLE",
      "un artefact \"" + input.artifactSchema + "\" ne peut pas porter la capacite \"" + cap
      + "\" — schemas eligibles : " + eligible.join(", ") + ".");
  }
  // Une capacite de PRODUCTION ne s'emet pas depuis un espace de TEST.
  if (cap === CAPABILITY.PRODUCTION_LLM_CAPABILITY && input.issuer && input.issuer.namespace !== "PRODUCTION") {
    throw fail("CAPABILITY_ISSUER_NAMESPACE",
      "PRODUCTION_LLM_CAPABILITY ne peut pas etre emise par une frontiere de namespace \"" + input.issuer.namespace + "\".");
  }
  if (!isNonEmptyStr(input.derivationRef)) {
    throw fail("CAPABILITY_DERIVATION_MISSING",
      "une capacite doit nommer la DERIVATION qui l'etablit (reference de preuve resolue, empreinte d'acte, identifiant de sonde) — "
      + "une justification libre n'est pas une derivation.");
  }
  const grant = {
    schema: "EvidenceForge.ArtifactCapabilityGrant", schemaVersion: "MONO-10-v7",
    capability: cap, artifactId: input.artifactId, artifactHash: input.artifactHash,
    artifactSchema: input.artifactSchema, runId: input.runId, missionHash: input.missionHash,
    issuerId: isNonEmptyStr(input.issuerId) ? input.issuerId : null,
    issuerKind: issuerSpec.label, derivationRef: input.derivationRef,
    grantedAt: isNonEmptyStr(input.grantedAt) ? input.grantedAt : new Date().toISOString(),
  };
  grant.grantHash = sha256Of(grant);
  GRANT_BRAND.add(grant);
  return Object.freeze(grant);
}

function isCapabilityGrant(g) { return !!g && GRANT_BRAND.has(g); }

/** assertCapability(entry, capability, sinkLabel) — refus explicite au sink. */
function assertCapability(entry, capability, sinkLabel) {
  const have = (entry && Array.isArray(entry.capabilities)) ? entry.capabilities : [];
  if (have.indexOf(capability) === -1) {
    throw fail("ARTIFACT_CAPABILITY_MISSING",
      (sinkLabel || "sink") + " : l'artefact \"" + ((entry && entry.artifactId) || "?") + "\" ne porte pas la capacite \""
      + capability + "\" (capacites presentes : " + (have.join(", ") || "aucune") + ").");
  }
  return true;
}
function hasCapability(entry, capability) {
  return !!entry && Array.isArray(entry.capabilities) && entry.capabilities.indexOf(capability) !== -1;
}
/** Ce qu'exige un sink nomme ; null si le sink n'est pas au contrat. */
function requirementOf(sinkId) { return SINK_REQUIREMENTS[sinkId] || null; }

module.exports = { CAPABILITY, SINK_REQUIREMENTS, ISSUER_OF, mintCapabilityGrant, isCapabilityGrant,
  assertCapability, hasCapability, requirementOf };
