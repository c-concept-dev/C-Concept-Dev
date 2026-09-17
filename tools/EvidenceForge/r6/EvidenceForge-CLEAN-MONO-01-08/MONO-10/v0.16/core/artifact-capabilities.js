"use strict";
/**
 * MONO-10 v0.11 — core/artifact-capabilities.js   (§26, §27, §28, §29, §30, §31)
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
const AD = require("./authority-descriptor.js");

const CAPABILITY = CC.CAPABILITY;

/** §30 — ce que chaque sink critique EXIGE. Documente et teste. */
const SINK_REQUIREMENTS = Object.freeze({
  "panel-gate:evidence-presented-to-human": CAPABILITY.AUTHENTICATED_PROVENANCE,
  "panel-gated-adapter:corpus-sink": CAPABILITY.HUMAN_AUTHENTICATED,
  "llm-capability:production-use": CAPABILITY.PRODUCTION_LLM_CAPABILITY,
});

/**
 * §11/§27/§29 — quelle autorite peut emettre quelle capacite, ET a quelle
 * frontiere elle doit appartenir.
 *
 * FERMETURE v0.8. En v0.7, `check` ne verifiait que la marque de module : une
 * autorite reellement construite par l'appelant depuis un chemin a lui la
 * satisfaisait. Desormais chaque predicat recoit `expected` et exige
 * l'appartenance a LA frontiere courante.
 */
const ISSUER_OF = Object.freeze({
  [CAPABILITY.AUTHENTICATED_PROVENANCE]: { check: OPA.isProvisionedProvenanceAuthority,
    kind: AD.KIND.PROVENANCE, descriptorOf: OPA.descriptorOf, label: "EvidenceProvenanceAuthority",
    decisionKind: "PROVENANCE_ROOT_RESOLUTION" },
  [CAPABILITY.HUMAN_AUTHENTICATED]: { check: HAB.isProvisionedHumanAuth,
    kind: AD.KIND.HUMAN_ACT, descriptorOf: HAB.descriptorOf, label: "mecanisme d'acte humain de l'exploitant",
    decisionKind: "HUMAN_ACT_CERTIFICATION" },
  [CAPABILITY.PRODUCTION_LLM_CAPABILITY]: { check: OLB.isProvisionedLlmBoundary,
    kind: AD.KIND.LLM_CAPABILITY, descriptorOf: OLB.descriptorOf, label: "frontiere de capacite LLM de l'exploitant",
    decisionKind: "LLM_PROBE_EXECUTION" },
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
  if (!issuerSpec) throw fail("CAPABILITY_ISSUER_INVALID", "aucun emetteur competent pour \"" + cap + "\".");
  /**
   * §11/§12 — l'emetteur doit appartenir a la frontiere NOMMEE. Sans
   * `operatorBoundaryId`, on refuse : on ne verifie pas une origine contre rien.
   */
  if (!isNonEmptyStr(input.operatorBoundaryId)) {
    throw fail("CAPABILITY_BOUNDARY_UNNAMED",
      "l'emission d'une capacite exige de nommer la frontiere operateur courante (operatorBoundaryId).");
  }
  /**
   * §4 (v0.9) — FERMETURE R1. L'identifiant declare ne suffit plus : la
   * LIAISON DE CONFIGURATION est exigee et comparee. Sans elle, refus.
   */
  if (!isNonEmptyStr(input.configBindingHash)) {
    throw fail("CAPABILITY_CONFIG_BINDING_UNNAMED",
      "l'emission d'une capacite exige la liaison de configuration de la frontiere courante "
      + "(configBindingHash) : un identifiant declare est declaratif.");
  }
  const expected = { operatorBoundaryId: input.operatorBoundaryId,
    configBindingHash: input.configBindingHash, executionMode: input.executionMode || undefined,
    requireProduction: cap === CAPABILITY.PRODUCTION_LLM_CAPABILITY };
  if (issuerSpec.check(input.issuer, expected) !== true) {
    throw fail("CAPABILITY_ISSUER_INVALID",
      "la capacite \"" + cap + "\" ne peut etre emise que par " + issuerSpec.label
      + " EMIS PAR LA FRONTIERE \"" + input.operatorBoundaryId + "\". Un constructeur public, un chemin de fichier "
      + "fourni par l'appelant, un hash ou un objet de forme compatible ne sont pas des autorites.");
  }
  const issuerDescriptor = issuerSpec.descriptorOf ? issuerSpec.descriptorOf(input.issuer) : null;
  if (!issuerDescriptor) throw fail("CAPABILITY_ISSUER_UNDESCRIBED", "autorite emettrice sans descripteur d'emission.");
  AD.assertSameBoundary(issuerDescriptor, expected, "autorite emettrice");
  if (issuerDescriptor.authorityKind !== issuerSpec.kind) {
    throw fail("CAPABILITY_ISSUER_KIND_MISMATCH",
      "genre d'autorite \"" + issuerDescriptor.authorityKind + "\" incompatible avec la capacite \"" + cap + "\".");
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
  if (cap === CAPABILITY.PRODUCTION_LLM_CAPABILITY && issuerDescriptor.executionMode !== "PRODUCTION") {
    throw fail("CAPABILITY_ISSUER_NAMESPACE",
      "PRODUCTION_LLM_CAPABILITY ne peut pas etre emise par une autorite d'espace \"" + issuerDescriptor.executionMode + "\".");
  }
  if (!isNonEmptyStr(input.derivationRef)) {
    throw fail("CAPABILITY_DERIVATION_MISSING",
      "une capacite doit nommer la DERIVATION qui l'etablit — une justification libre n'est pas une derivation.");
  }
  /**
   * §3/§5 (v0.10) — FERMETURE B1. LA DERIVATION EST VERIFIEE AUPRES DE SON
   * EMETTEUR.
   *
   * v0.9 n'exigeait qu'une chaine non vide : l'audit A a minte
   * AUTHENTICATED_PROVENANCE avec `derivationRef: "je-decrete-que-cest-
   * authentifie"` sur des racines que l'autorite officielle declarait
   * UNRESOLVED, puis atteint PRESENT_FOR_HUMAN_REVIEW.
   *
   * Desormais la concession n'existe que si l'emetteur a REELLEMENT pris la
   * decision correspondante — pour cet artefact, ce run, cette mission et ce
   * mode d'execution. Une reference inventee est refusee ; une decision prise
   * pour un autre sujet est refusee.
   */
  if (typeof input.issuer.verifyDecision !== "function") {
    throw fail("CAPABILITY_ISSUER_HAS_NO_LEDGER",
      "l'emetteur ne tient pas de registre de decisions : sa derivation n'est pas verifiable — fail closed.");
  }
  /**
   * §5 (v0.11) — pour une capacite LLM, le SUJET EXACT fait partie des attentes.
   * `verifyDecision` de la frontiere de capacite exige desormais les sept
   * dimensions autoritaires ; une attente absente est un refus, jamais une
   * dispense (fermeture B10-01).
   */
  const llmSubject = input.llmSubject || {};
  const verdict = input.issuer.verifyDecision(input.derivationRef, {
    decisionKind: issuerSpec.decisionKind,
    artifactId: input.artifactId, artifactHash: input.artifactHash,
    runId: input.runId, missionHash: input.missionHash,
    executionMode: issuerDescriptor.executionMode,
    requestId: input.probeRequestId || undefined,
    providerId: llmSubject.providerId, modelId: llmSubject.modelId,
    workerBindingId: llmSubject.workerBindingId,
  });
  if (!verdict || verdict.valid !== true) {
    throw fail("CAPABILITY_DERIVATION_UNVERIFIABLE",
      "la derivation \"" + String(input.derivationRef).slice(0, 48) + "\" ne correspond a aucune decision "
      + "reellement prise par " + issuerSpec.label + " pour cet artefact : "
      + (((verdict && verdict.problems) || []).join(" ; ") || "refus") + ".");
  }
  const grant = {
    schema: "EvidenceForge.ArtifactCapabilityGrant", schemaVersion: "MONO-10-v8",
    capability: cap, artifactId: input.artifactId, artifactHash: input.artifactHash,
    artifactSchema: input.artifactSchema, runId: input.runId, missionHash: input.missionHash,
    /** §11 — la capacite porte l'identite de son emetteur ET de la frontiere. */
    operatorBoundaryId: input.operatorBoundaryId,
    /** §4 — la concession PORTE la liaison, et ses consommateurs la COMPARENT. */
    configBindingHash: issuerDescriptor.configBindingHash,
    issuerAuthorityId: issuerDescriptor.authorityId,
    issuerAuthorityKind: issuerDescriptor.authorityKind,
    issuerDescriptorHash: issuerDescriptor.descriptorHash,
    issuerGeneration: issuerDescriptor.issuerGeneration,
    executionMode: issuerDescriptor.executionMode,
    /** §5 — le genre de decision et son empreinte sont consignes. */
    decisionKind: issuerSpec.decisionKind,
    decisionHash: sha256Of(verdict.decision),
    /** §6 (v0.11) — la concession NOMME le sujet exact qu'elle certifie. */
    decisionSubjectHash: verdict.decision.decisionSubjectHash || null,
    certifiedSubject: isNonEmptyStr(llmSubject.providerId)
      ? Object.freeze({ providerId: llmSubject.providerId, modelId: llmSubject.modelId,
        workerBindingId: llmSubject.workerBindingId }) : null,
    issuerId: isNonEmptyStr(input.issuerId) ? input.issuerId : issuerDescriptor.authorityId,
    issuerKind: issuerSpec.label, derivationRef: input.derivationRef,
    grantedAt: isNonEmptyStr(input.grantedAt) ? input.grantedAt : new Date().toISOString(),
  };
  grant.grantHash = sha256Of(grant);
  GRANT_BRAND.add(grant);
  return Object.freeze(grant);
}

function isCapabilityGrant(g) { return !!g && GRANT_BRAND.has(g); }

/** assertCapability(entry, capability, sinkLabel) — refus explicite au sink. */
/**
 * assertCapability(entry, capability, sinkLabel, expectedBoundaryId)
 * §12/§15 — le sink verifie DEUX choses : la capacite est presente, et elle a
 * ete emise par la frontiere courante. Une capacite venue d'une autre
 * frontiere est refusee, meme si tout le reste concorde.
 */
function assertCapability(entry, capability, sinkLabel, expectedBoundary) {
  const have = (entry && Array.isArray(entry.capabilities)) ? entry.capabilities : [];
  const expected = AD.boundaryIdentityOf(expectedBoundary);
  if (have.indexOf(capability) !== -1) {
    if (typeof expectedBoundary === "string" || (expectedBoundary && !expected)) {
      throw fail("ARTIFACT_CAPABILITY_EXPECTATION_INCOMPLETE",
        (sinkLabel || "sink") + " : l'identite de frontiere attendue est incomplete (configBindingHash requis) — "
        + "un identifiant declare ne prouve pas une origine (R1).");
    }
    if (expected) {
      const grants = (entry && Array.isArray(entry.capabilityGrants)) ? entry.capabilityGrants : [];
      const g = grants.filter((x) => x && x.capability === capability)[0];
      if (!g) {
        throw fail("ARTIFACT_CAPABILITY_UNTRACED",
          (sinkLabel || "sink") + " : capacite \"" + capability + "\" presente sans concession tracee — refus.");
      }
      AD.assertSameBoundary(g, expected, (sinkLabel || "sink") + " : capacite \"" + capability + "\"");
    }
  }
  if (have.indexOf(capability) === -1) {
    throw fail("ARTIFACT_CAPABILITY_MISSING",
      (sinkLabel || "sink") + " : l'artefact \"" + ((entry && entry.artifactId) || "?") + "\" ne porte pas la capacite \""
      + capability + "\" (capacites presentes : " + (have.join(", ") || "aucune") + ").");
  }
  return true;
}
/** §4 — refus explicite d'une concession hors identite composite. */
function assertGrantBoundary(grant, expectedBoundary, label) {
  const expected = AD.boundaryIdentityOf(expectedBoundary);
  if (!expected) {
    throw fail("CAPABILITY_BOUNDARY_EXPECTATION_INCOMPLETE",
      (label || "concession") + " : identite de frontiere attendue incomplete (configBindingHash requis).");
  }
  return AD.assertSameBoundary(grant, expected, label || "concession");
}
function hasCapability(entry, capability) {
  return !!entry && Array.isArray(entry.capabilities) && entry.capabilities.indexOf(capability) !== -1;
}

/**
 * §10 (v0.10) — hasCapability CONSTATE une presence ; il ne VERIFIE rien.
 *
 * Les consommateurs critiques doivent verifier que la concession a ete DERIVEE
 * par le verificateur du run en cours. Cette fonction est la forme publique de
 * ce controle, et elle refuse par defaut : pas de verificateur, pas de
 * concession, pas de derivation verifiable => false.
 *
 * §27 (v0.7) — une API publique de validation ne doit jamais etre plus
 * permissive que ses consommateurs critiques.
 */
function capabilityVerifiedBy(entry, capability, verifier, expectations) {
  if (!hasCapability(entry, capability)) return { verified: false, problems: ["capacite absente"] };
  const grants = (entry && Array.isArray(entry.capabilityGrants)) ? entry.capabilityGrants : [];
  const g = grants.filter(function (x) { return x && x.capability === capability; })[0];
  if (!g) return { verified: false, problems: ["capacite listee sans concession tracee"] };
  if (!verifier || typeof verifier.verifyIssuerDecision !== "function") {
    return { verified: false, problems: ["aucun verificateur de frontiere operateur pour verifier la derivation "
      + String(g.derivationRef) + " — fail closed"] };
  }
  const e = expectations || {};
  const vd = verifier.verifyIssuerDecision(capability, g.derivationRef, {
    decisionKind: g.decisionKind || (ISSUER_OF[capability] || {}).decisionKind,
    artifactId: g.artifactId, artifactHash: g.artifactHash,
    runId: e.runId, missionHash: e.missionHash, executionMode: e.executionMode });
  if (!vd || vd.valid !== true) {
    return { verified: false, grant: g,
      problems: ["derivation " + String(g.derivationRef) + " non verifiable aupres de son emetteur : "
        + ((vd && vd.problems) || ["registre muet"]).slice(0, 2).join(" ; ")] };
  }
  return { verified: true, grant: g, problems: [] };
}
/** Ce qu'exige un sink nomme ; null si le sink n'est pas au contrat. */
function requirementOf(sinkId) { return SINK_REQUIREMENTS[sinkId] || null; }

module.exports = { CAPABILITY, SINK_REQUIREMENTS, ISSUER_OF, mintCapabilityGrant, isCapabilityGrant,
  assertCapability, assertGrantBoundary, hasCapability, capabilityVerifiedBy, requirementOf };
