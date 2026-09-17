"use strict";

const { createBaselinePort } = require("./lib/baseline-port");
const { createMissionPort } = require("./ports/mission-port");
const { createCorpusSnapshotPort } = require("./ports/corpus-snapshot-port");
const { createEFOrchExecutionPort } = require("./ports/ef-orch-execution-port");
const { createProfessionalPipelinePort } = require("./ports/professional-pipeline-port");
const { createEligibilityPanelPort } = require("./ports/eligibility-panel-port");
const { createGovernancePort } = require("./ports/governance-port");
const { createDocumentaryTwinPort } = require("./ports/documentary-twin-port");
const { createTargetDocumentPort } = require("./ports/target-document-port");
const { createReviewSchemaPort } = require("./ports/review-schema-port");
const { createDocumentaryReviewPort } = require("./ports/documentary-review-port");
const { createAggregationPort } = require("./ports/aggregation-port");
const { createStabilityPort } = require("./ports/stability-port");
const { createLineagePort, isLineagePass } = require("./ports/lineage-port");
const { createReportPort } = require("./ports/report-port");
const { createExternalExecutionPort } = require("./ports/external-execution-port");

// createMono01(registryPathOrObject, options?)
//
// options.efOrchDurableBackend : backend durable (contrat get/put/has/keys)
// à injecter dans EFOrchExecutionPort — createMono01() ne construit JAMAIS
// ce backend lui-même et n'en devient jamais propriétaire ; il ne fait que
// le transmettre tel quel. Sans cette option, efOrchExecutionPort existe
// (les 15 autres ports restent pleinement utilisables) mais refuse
// explicitement toute opération réelle (start/resume/getStatus/getResult) —
// voir ports/ef-orch-execution-port.js. La frontière d'injection s'arrête
// ici : la fourniture d'une implémentation de production (IndexedDB ou
// équivalent) appartient à un futur MONO-03, jamais à MONO-01.
function createMono01(registryPathOrObject, options) {
  options = options || {};
  const baselinePort = createBaselinePort(registryPathOrObject);
  return {
    baselinePort,
    missionPort: createMissionPort(baselinePort),
    corpusSnapshotPort: createCorpusSnapshotPort(baselinePort),
    efOrchExecutionPort: createEFOrchExecutionPort(baselinePort, { durableBackend: options.efOrchDurableBackend }),
    professionalPipelinePort: createProfessionalPipelinePort(baselinePort),
    eligibilityPanelPort: createEligibilityPanelPort(baselinePort),
    governancePort: createGovernancePort(baselinePort),
    documentaryTwinPort: createDocumentaryTwinPort(baselinePort),
    targetDocumentPort: createTargetDocumentPort(baselinePort),
    reviewSchemaPort: createReviewSchemaPort(baselinePort),
    documentaryReviewPort: createDocumentaryReviewPort(baselinePort),
    aggregationPort: createAggregationPort(baselinePort),
    stabilityPort: createStabilityPort(baselinePort),
    lineagePort: createLineagePort(baselinePort),
    reportPort: createReportPort(baselinePort),
    externalExecutionPort: createExternalExecutionPort(baselinePort),
  };
}

module.exports = { createMono01, isLineagePass };
