"use strict";
/**
 * MONO-10 v0.6 — validators/index.js
 * Surface de VALIDATION du lot en un seul point. Aucun validateur n'accorde
 * quoi que ce soit par defaut ; tous echouent fermes.
 */
const OTB = require("../core/operator-trust-boundary.js");
const OAB = require("../core/operator-acceptance-boundary.js");
const OLB = require("../core/operator-llm-capability-boundary.js");
const HAB = require("../core/operator-human-auth-boundary.js");
const HAP = require("../core/human-act-proof.js");
const ATL = require("../core/artifact-trust-levels.js");
const OTV = require("../core/operator-trust-verifier.js");
const RP = require("../core/replay-protection.js");
const KL = require("../core/key-lifecycle.js");
const RM = require("../core/run-evidence-manifest.js");
const AAR = require("../core/authenticated-artifact-registry.js");
const LIN = require("../core/lineage.js");
const UNK = require("../core/unknowns.js");
const IDE = require("../core/identity-evidence.js");
const ESP = require("../core/evidence-source-provenance.js");
const HA = require("../core/human-act.js");
const PG = require("../core/panel-gate.js");
const EE = require("../core/effective-eligibility.js");
const LC = require("../core/llm-capability.js");
const SR = require("../core/scientific-readiness.js");
const SQ = require("../core/scientific-qualification.js");
const SUR = require("../core/scientific-unified-report.js");
const FRA = require("../core/final-report-acceptance.js");
const DA = require("../core/downstream-authorization.js");

module.exports = {
  acceptanceBoundary: { isProvisionedAcceptanceBoundary: OAB.isProvisionedAcceptanceBoundary, BLOCKING_DECISIONS: OAB.BLOCKING_DECISIONS },
  llmBoundary: { isProvisionedLlmBoundary: OLB.isProvisionedLlmBoundary },
  humanAuthBoundary: { isProvisionedHumanAuth: HAB.isProvisionedHumanAuth, AUTHENTICATION: HAB.AUTHENTICATION },
  humanActProof: { computeDecisionHash: HAP.computeDecisionHash, assertProofBoundTo: HAP.assertProofBoundTo, ACTION_TYPE: HAP.ACTION_TYPE },
  trustLevels: { TRUST_LEVEL: ATL.TRUST_LEVEL, assertAtLeast: ATL.assertAtLeast },
  operatorTrust: { provisionProductionTrustBoundary: OTB.provisionProductionTrustBoundary,
    provisionTestTrustBoundary: OTB.provisionTestTrustBoundary, assertProductionBoundary: OTB.assertProductionBoundary,
    isOperatorTrustBoundary: OTB.isOperatorTrustBoundary, ENV_VAR: OTB.ENV_VAR },
  trustVerifier: { createOperatorTrustVerifier: OTV.createOperatorTrustVerifier,
    assertProductionVerifier: OTV.assertProductionVerifier, isOperatorTrustVerifier: OTV.isOperatorTrustVerifier },
  replayProtection: { assertStoreContract: RP.assertStoreContract, isProvisionedStore: RP.isProvisionedStore },
  keyLifecycle: { makeKeyRecord: KL.makeKeyRecord, evaluateKeyAt: KL.evaluateKeyAt, publicKeyFingerprint: KL.publicKeyFingerprint, KEY_STATUS: KL.KEY_STATUS },
  run: { openRunEvidenceManifest: RM.openRunEvidenceManifest, assertManifestShape: RM.assertManifestShape,
    assertManifestAuthentic: RM.assertManifestAuthentic, assertArtifactBoundToRun: RM.assertArtifactBoundToRun,
    assertProductionEvidence: RM.assertProductionEvidence, isProductionContext: RM.isProductionContext },
  registry: { openAuthenticatedArtifactRegistry: AAR.openAuthenticatedArtifactRegistry, verifyExportedEventChain: AAR.verifyExportedEventChain,
    assertAuthenticatedRegistry: AAR.assertAuthenticatedRegistry, isAuthenticatedRegistry: AAR.isAuthenticatedRegistry },
  lineage: { resolveLineage: LIN.resolveLineage, assertLineageResolved: LIN.assertLineageResolved,
    assertRefMatches: LIN.assertRefMatches, RELATION: LIN.RELATION, EXPECTED_PARENTS: LIN.EXPECTED_PARENTS },
  unknowns: { assertChainValid: UNK.assertChainValid, assertNoSilentLoss: UNK.assertNoSilentLoss, blockingOpen: UNK.blockingOpen },
  identity: { deriveIdentityConfidence: IDE.deriveIdentityConfidence, independenceBetween: IDE.independenceBetween },
  provenance: { resolveEvidenceSourceProvenance: ESP.resolveEvidenceSourceProvenance, makeDocumentaryEvidenceRecord: ESP.makeDocumentaryEvidenceRecord },
  humanAct: { assertHumanActDeclaration: HA.assertHumanActDeclaration, verifyHumanActAuthenticity: HA.verifyHumanActAuthenticity,
    assertHumanActAuthentic: HA.assertHumanActAuthentic, CALLBACK_ORIGIN: HA.CALLBACK_ORIGIN },
  panel: { validatePanelValidation: PG.validatePanelValidation, buildPanelValidationTemplate: PG.buildPanelValidationTemplate },
  eligibility: { deriveEffectiveEligibility: EE.deriveEffectiveEligibility, isEligibleDecision: EE.isEligibleDecision },
  capability: { assertCapabilityUsable: LC.assertCapabilityUsable, validateProbePayload: LC.validateProbePayload },
  readiness: { evaluateReadiness: SR.evaluateReadiness, assertReadinessPhase: SR.assertReadinessPhase },
  qualification: { qualifyProcess: SQ.qualifyProcess, applyPriorVerdictPolicy: SQ.applyPriorVerdictPolicy },
  report: { buildScientificUnifiedReport: SUR.buildScientificUnifiedReport, assertReportBoundToQualification: SUR.assertReportBoundToQualification },
  acceptance: { buildAcceptanceTemplate: FRA.buildAcceptanceTemplate, acceptanceDecisionHash: FRA.acceptanceDecisionHash },
  downstream: { resolveDownstreamUseAuthorization: DA.resolveDownstreamUseAuthorization, sanitizePolicy: DA.sanitizePolicy, NON_NEGOTIABLE: DA.NON_NEGOTIABLE },
};
