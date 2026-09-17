"use strict";
/** MONO-11 v0.1 — Autonomous Panel Successor. Compose MONO-10 v0.19, MONO-09 v0.2 et MONO-01 (geles) sans les modifier. */
module.exports = {
  frozenBridge: require("./core/frozen-bridge.js"),
  corpusSufficiencyProbe: require("./core/corpus-sufficiency-probe.js"),
  semanticRelevanceOracle: require("./core/semantic-relevance-oracle.js"),
  machineEvidenceGate: require("./core/machine-evidence-gate.js"),
  autonomousPanelAdapter: require("./core/autonomous-panel-adapter.js"),
  composedQualification: require("./core/composed-qualification.js"),
  ledger: require("./core/mono11-ledger.js"),
  contracts: require("./contracts/mono11-contracts.json"),
};
