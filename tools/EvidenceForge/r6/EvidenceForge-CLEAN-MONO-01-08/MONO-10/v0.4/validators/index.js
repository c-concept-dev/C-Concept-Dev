"use strict";
/**
 * MONO-10 v0.4 — validators/index.js
 *
 * Surface de VALIDATION du lot, en un seul point. Un consommateur n'a pas a
 * deviner quel module porte quel controle, ni a reimplementer une verification
 * en la croyant equivalente.
 *
 * Aucun de ces validateurs n'accorde quoi que ce soit par defaut : tous
 * echouent fermes.
 */
const TRA = require("../core/trusted-runtime-authority.js");
const RM = require("../core/run-evidence-manifest.js");
const LIN = require("../core/lineage.js");
const UNK = require("../core/unknowns.js");
const IDE = require("../core/identity-evidence.js");
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
  trust: { createTrustAnchorSet: TRA.createTrustAnchorSet, verifyAttestation: TRA.verifyAttestation, assertAttestation: TRA.assertAttestation },
  run: { assertManifestShape: RM.assertManifestShape, assertManifestAuthentic: RM.assertManifestAuthentic,
         assertArtifactBoundToRun: RM.assertArtifactBoundToRun, assertProductionEvidence: RM.assertProductionEvidence },
  lineage: { resolveLineage: LIN.resolveLineage, assertLineageResolved: LIN.assertLineageResolved, assertRefMatches: LIN.assertRefMatches,
             RELATION: LIN.RELATION, EXPECTED_PARENTS: LIN.EXPECTED_PARENTS },
  unknowns: { assertChainValid: UNK.assertChainValid, assertNoSilentLoss: UNK.assertNoSilentLoss, blockingOpen: UNK.blockingOpen },
  identity: { deriveIdentityConfidence: IDE.deriveIdentityConfidence, independenceBetween: IDE.independenceBetween, createAuthorityRegistry: IDE.createAuthorityRegistry },
  humanAct: { assertHumanActDeclaration: HA.assertHumanActDeclaration, verifyHumanActAuthenticity: HA.verifyHumanActAuthenticity, assertHumanActAuthentic: HA.assertHumanActAuthentic },
  panel: { validatePanelValidation: PG.validatePanelValidation, buildPanelValidationTemplate: PG.buildPanelValidationTemplate },
  eligibility: { deriveEffectiveEligibility: EE.deriveEffectiveEligibility, isEligible: EE.isEligible },
  capability: { assertCapabilityUsable: LC.assertCapabilityUsable, validateProbePayload: LC.validateProbePayload },
  readiness: { evaluateReadiness: SR.evaluateReadiness, assertReadinessPhase: SR.assertReadinessPhase, assertReadinessSourcesMatch: SR.assertReadinessSourcesMatch },
  qualification: { qualifyProcess: SQ.qualifyProcess, applyPriorVerdictPolicy: SQ.applyPriorVerdictPolicy },
  report: { buildScientificUnifiedReport: SUR.buildScientificUnifiedReport, assertReportBoundToQualification: SUR.assertReportBoundToQualification, assertPriorUntouched: SUR.assertPriorUntouched },
  acceptance: { buildAcceptanceTemplate: FRA.buildAcceptanceTemplate, validateAcceptance: FRA.validateAcceptance },
  downstream: { resolveDownstreamUseAuthorization: DA.resolveDownstreamUseAuthorization, sanitizePolicy: DA.sanitizePolicy, NON_NEGOTIABLE: DA.NON_NEGOTIABLE },
};
