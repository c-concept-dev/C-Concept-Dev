import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCandidate } from "../core/adn/operational-request-state.js";
import {
  filterEmptyCandidateUnsupportedAdditions,
  runCriticBatchedPipeline
} from "../workers/shared/operational-request-core.js";

const CAPABILITY = Object.freeze({ fixedOverheadUnits: 100, perTargetUnits: 50, maxUnitsPerBatch: 220 });

function confirmationSignals() {
  return {
    multiple_ambiguities_resolved: false,
    complex_conflict_arbitrated: false,
    strong_restructuring: false,
    multiple_objectives_hierarchized: false,
    significant_delegation: false
  };
}

function analystOutput(candidate, provenance_records = []) {
  return {
    operational_request_candidate: candidate,
    provenance_records,
    issues: [],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  };
}

function rawCriticOutput(unsupported_additions_found, overrides = {}) {
  return {
    operational_request_candidate_review: {
      unsupported_additions_found,
      unsupported_removals_found: [],
      missed_material_issues: []
    },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    ...overrides
  };
}

async function runFixture(candidate, findings, { provenance_records = [], overrides = {} } = {}) {
  return runCriticBatchedPipeline(
    {
      original_request: "Demande de test structurelle.",
      clarification_history: [],
      analyst_output: analystOutput(candidate, provenance_records),
      previous_vetoes: [],
      capability: CAPABILITY
    },
    {
      executeGlobal: async () => rawCriticOutput(findings, overrides),
      executeBatch: async () => { throw new Error("Aucun batch attendu sans issue question."); }
    }
  );
}

test("FIX-UAF-1 : une string vide est ignorée", () => {
  const candidate = createEmptyCandidate();
  const output = filterEmptyCandidateUnsupportedAdditions(rawCriticOutput(["objective"]), analystOutput(candidate));
  assert.deepEqual(output.operational_request_candidate_review.unsupported_additions_found, []);
});

test("FIX-UAF-2 : un array vide est ignoré", () => {
  const candidate = createEmptyCandidate();
  const output = filterEmptyCandidateUnsupportedAdditions(rawCriticOutput(["secondary_objectives"]), analystOutput(candidate));
  assert.deepEqual(output.operational_request_candidate_review.unsupported_additions_found, []);
});

test("FIX-UAF-3 : plusieurs champs vides sont ignorés génériquement", () => {
  const candidate = createEmptyCandidate();
  const findings = Object.keys(candidate);
  const output = filterEmptyCandidateUnsupportedAdditions(rawCriticOutput(findings), analystOutput(candidate));
  assert.deepEqual(output.operational_request_candidate_review.unsupported_additions_found, []);
});

test("FIX-UAF-4 : un champ non vide correctement tracé reste absent", () => {
  const candidate = { ...createEmptyCandidate(), objective: "Objectif explicite" };
  const output = filterEmptyCandidateUnsupportedAdditions(
    rawCriticOutput([]),
    analystOutput(candidate, [{ field: "objective", value: candidate.objective, provenance: "explicit_user_statement" }])
  );
  assert.deepEqual(output.operational_request_candidate_review.unsupported_additions_found, []);
});

test("FIX-UAF-5 : un champ non vide signalé sans provenance reste détectable", () => {
  const candidate = { ...createEmptyCandidate(), objective: "Objectif sans provenance" };
  const output = filterEmptyCandidateUnsupportedAdditions(rawCriticOutput(["objective"]), analystOutput(candidate));
  assert.deepEqual(output.operational_request_candidate_review.unsupported_additions_found, ["objective"]);
});

test("FIX-UAF-6 : la fixture réelle FINAL_QA ne retourne plus les neuf faux findings", async () => {
  const candidate = { ...createEmptyCandidate(), objective: "Rédiger une synthèse concise de la demande utilisateur." };
  const findings = Object.keys(candidate).filter((field) => field !== "objective");
  const output = await runFixture(candidate, findings, {
    provenance_records: [{ field: "objective", value: candidate.objective, provenance: "explicit_user_statement" }]
  });
  assert.deepEqual(output.operational_request_candidate_review.unsupported_additions_found, []);
});

test("FIX-UAF-7 : agreement, vetoes et semantic_drift restent inchangés", async () => {
  const candidate = createEmptyCandidate();
  const output = await runFixture(candidate, ["objective"], {
    overrides: {
      vetoes: [{ issue_id: "ISSUE-1", new_information_trigger: "Fait nouveau", why_material: "Impact matériel", why_not_substitutable: "Aucune substitution fidèle" }],
      semantic_drift_detected: true,
      semantic_drift_notes: ["Dérive réelle"]
    }
  });
  assert.equal(output.agreement, "disagree");
  assert.equal(output.vetoes.length, 1);
  assert.equal(output.semantic_drift_detected, true);
  assert.deepEqual(output.semantic_drift_notes, ["Dérive réelle"]);
});

test("FIX-UAF-8 : un Critic nominal sans faux finding reste byte-identique", () => {
  const candidate = { ...createEmptyCandidate(), objective: "Objectif explicite" };
  const input = rawCriticOutput([]);
  const output = filterEmptyCandidateUnsupportedAdditions(input, analystOutput(candidate));
  assert.deepEqual(output, input);
  assert.notEqual(output, input, "la fonction reste pure et ne mute pas l'objet provider");
});
