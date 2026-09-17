"use strict";
// test/cross-process/fixtures.js — LOCAL_CONTROLLED, partage entre
// worker-a.js et worker-b.js (deux processus Node SEPARES : ce fichier est
// require() independamment par chacun, jamais une valeur passee entre eux —
// seul du texte JSON transite via argv/stdout).

function buildMission() {
  return { dimensions: [{ id: "DIM_A", label: "Dimension A" }], targetDocuments: [{ documentId: "t1", title: "Target 1", url: "https://example.invalid/t1" }] };
}

function buildLocalControlledAdapter() {
  return {
    discoverProfessionals: async function (inputs) {
      const dims = (inputs.missionDimensionSet && inputs.missionDimensionSet.dimensions) || [];
      return { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", candidates: dims.map(function (d, i) { return { candidateRef: "LC-" + i, displayName: "X" + i, dimensionRef: d.id, source: "lc-fixture", orcid: "0000-0000-0000-000" + i }; }) };
    },
    verifyProfessionals: async function (inputs) {
      const c = (inputs.professionalDiscovery && inputs.professionalDiscovery.candidates) || [];
      return { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", verified: c.map(function (x) { return { candidateRef: x.candidateRef, displayName: x.displayName, verificationMethod: "ORCID_PRESENT", verifiedIdentifiers: { orcid: x.orcid } }; }) };
    },
    buildProfessionalCorpus: async function (inputs) {
      const v = (inputs.professionalVerification && inputs.professionalVerification.verified) || [];
      return {
        schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2",
        professionalCorpora: v.map(function (x) {
          return {
            professionalRef: x.candidateRef, status: "complete", identityRef: { displayName: x.displayName, orcid: x.verifiedIdentifiers.orcid },
            corpus: { works: [{ workRef: "W-" + x.candidateRef, title: "Travail local controle (LOCAL_CONTROLLED_FIXTURE)", doi: "10.0000/lc-" + x.candidateRef, publicationYear: 2024, topics: [] }] },
            summary: { workCount: 1 },
          };
        }),
      };
    },
  };
}

function jsonResponse(body) { return { ok: true, status: 200, json: async function () { return body; } }; }
function buildOpenAlexFetchImpl() { return async function () { return jsonResponse({ results: [{ display_name: "Source OA locale (LOCAL_CONTROLLED_FIXTURE)" }] }); }; }
function buildWorkerCallFn() { return async function () { return "{}"; }; }
function buildDocumentBytesByUrl() { return { "https://example.invalid/t1": new TextEncoder().encode("Contenu de test document 1 (CROSS_PROCESS)") }; }
function buildDocumentContentByUrl() { return { "https://example.invalid/t1": "Contenu de test document 1 (CROSS_PROCESS) - texte pour EF-03A/EF-03." }; }

module.exports = {
  buildMission, buildLocalControlledAdapter, buildOpenAlexFetchImpl, buildWorkerCallFn,
  buildDocumentBytesByUrl, buildDocumentContentByUrl,
};
