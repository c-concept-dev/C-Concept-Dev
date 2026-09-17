// EvidenceForge — EF-ORCH — Capacités des connecteurs EF-01C2 — v0.1
// Distingue les connecteurs que le vrai EF-01C2 sait appeler automatiquement
// (EXECUTABLE_CONNECTORS = ["openalex","crossref","pubmed"], vérifié dans le
// code source) de tous les autres, qui exigent une saisie humaine manuelle
// (web_public, institutional, tout connecteur ajouté librement en C1).
//
// Défaut volontairement conservateur : tout connecteur inconnu est
// "manual_required", jamais "automatic" — un futur nom de connecteur ne doit
// jamais être exécuté automatiquement par accident.
"use strict";

const AUTOMATIC_CONNECTORS = Object.freeze(["openalex", "crossref", "pubmed"]);

function capabilityFor(connectorId) {
  return AUTOMATIC_CONNECTORS.includes(String(connectorId || "").trim()) ? "automatic" : "manual_required";
}

const EFOrchEF01C2ConnectorCapabilities = { AUTOMATIC_CONNECTORS, capabilityFor };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01C2ConnectorCapabilities;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01C2ConnectorCapabilities = EFOrchEF01C2ConnectorCapabilities;
}
