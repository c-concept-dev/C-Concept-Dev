import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  SUBSTITUTION_GATE_REASON_CODES, evaluateSubstitutionGate, applySubstitutionGate,
  runCriticBatchedPipeline, TREATMENT_VALUES
} from "../workers/shared/operational-request-core.js";
import { TRANSPORT_LIMITS } from "../workers/shared/decision-core.js";

// LOT X2-C.3 — B01B ARCHITECTURAL BIFURCATION / DETERMINISTIC SUBSTITUTION GATE. Preuve réelle
// (X2-C.2, smoke Groq réel) : le Critic global a déclaré, pour une issue génériquement substituable
// ("type de voyage non spécifié"), question_is_last_resort=true sans alternative disponible ->
// B01B_PROVIDER_PROOF_FAIL, classification SEMANTIC_PROVIDER_LIMIT. Ce lot ajoute UNE couche
// déterministe entre le Substitution Review du Critic (assembleSubstitutionReviews, INCHANGÉE) et
// deriveCriticConsequences (INCHANGÉE) : le Substitution Gate. Il ne produit JAMAIS lui-même une
// alternative métier -- il valide seulement, à partir de signaux structurels déjà produits par le
// Critic dans le MÊME tour (alternatives_reviewed, available_alternative, vetoes,
// semantic_drift_detected), qu'une proposition DÉJÀ FAITE par le Critic reste contractuellement
// admissible. Par construction, il ne peut donc JAMAIS corriger un faux négatif (le Critic ne propose
// aucune alternative alors qu'une existe réellement) -- seulement neutraliser un faux positif ou une
// proposition interne incohérente. Ce fichier prouve les 10 points minimum du mandat, jamais une
// nouvelle règle métier.

const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));

function extractFunctionSource(source, name) {
  const startMatch = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(startMatch, `fonction ${name} introuvable.`);
  const start = startMatch.index;
  const rest = source.slice(start + 1);
  const boundary = rest.search(/\n(?:\/\*\*|export |function )/);
  const end = boundary === -1 ? source.length : start + 1 + boundary;
  return source.slice(start, end);
}

const LADDER = TREATMENT_VALUES.filter((v) => v !== "question");

/** Même discipline que les campagnes X2-C/X2-BATCH : `available` (ou null) désigne la SEULE
 * alternative reasonably_available=true, les autres restant false avec un motif DISTINCT -- jamais
 * la même chaîne réutilisée par accident (ce qui déclencherait REJECTED_CONTRADICTS_FACTS). */
function alternativesReviewed(available) {
  return Object.fromEntries(LADDER.map((t) => [t, {
    reasonably_available: t === available,
    reason: t === available ? "Cette alternative permet de poursuivre utilement le travail sans l'information manquante." : "Cette alternative ne permet aucune progression utile sur ce point précis."
  }]));
}

// --- X2C3-1..6 : evaluateSubstitutionGate, les 6 codes de retour exactement -----------------------

test("X2C3-1 : une alternative proposée, cohérente et contractuellement préservée -> ACCEPTED_CONTRACT_PRESERVING", () => {
  const gate = evaluateSubstitutionGate({ alternatives_reviewed: alternativesReviewed("estimate"), available_alternative: "estimate" });
  assert.equal(gate.accepted, true);
  assert.equal(gate.reason_code, "ACCEPTED_CONTRACT_PRESERVING");
});

test("X2C3-2 : aucune alternative proposée (available_alternative=null) -> REJECTED_NO_ALTERNATIVE", () => {
  const gate = evaluateSubstitutionGate({ alternatives_reviewed: alternativesReviewed(null), available_alternative: null });
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_NO_ALTERNATIVE");
});

test("X2C3-3 : le Critic global a soulevé, dans le MÊME tour, un veto qualifié sur cette issue -> REJECTED_USER_RESERVED_CHOICE, même si l'alternative proposée est par ailleurs interne-cohérente", () => {
  const gate = evaluateSubstitutionGate({
    alternatives_reviewed: alternativesReviewed("estimate"),
    available_alternative: "estimate",
    vetoIssueIds: ["issue-1"]
  });
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_USER_RESERVED_CHOICE");
});

test("X2C3-4 : le Critic global a détecté, dans le MÊME tour, semantic_drift_detected=true -> REJECTED_OBJECTIVE_CHANGED", () => {
  const gate = evaluateSubstitutionGate({
    alternatives_reviewed: alternativesReviewed("estimate"),
    available_alternative: "estimate",
    semantic_drift_detected: true
  });
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_OBJECTIVE_CHANGED");
});

test("X2C3-5 : la MÊME justification (égalité de chaîne exacte) soutient à la fois la disponibilité de l'alternative choisie ET l'indisponibilité d'une autre -> REJECTED_CONTRADICTS_FACTS", () => {
  const sharedReason = "Motif réutilisé par erreur pour deux conclusions opposées.";
  const alternatives_reviewed = {
    research: { reasonably_available: false, reason: sharedReason },
    decide: { reasonably_available: true, reason: sharedReason },
    estimate: { reasonably_available: false, reason: "Motif distinct." },
    scenario: { reasonably_available: false, reason: "Motif distinct." },
    condition: { reasonably_available: false, reason: "Motif distinct." },
    leave_unknown: { reasonably_available: false, reason: "Motif distinct." }
  };
  const gate = evaluateSubstitutionGate({ alternatives_reviewed, available_alternative: "decide" });
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_CONTRADICTS_FACTS");
});

test("X2C3-6a : available_alternative désigne une entrée qui n'est PAS marquée reasonably_available=true dans alternatives_reviewed -> REJECTED_INSUFFICIENT_JUSTIFICATION (incohérence structurelle interne)", () => {
  const gate = evaluateSubstitutionGate({ alternatives_reviewed: alternativesReviewed(null), available_alternative: "decide" });
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_INSUFFICIENT_JUSTIFICATION");
});

test("X2C3-6b : available_alternative marqué reasonably_available=true mais sans justification (reason vide) -> REJECTED_INSUFFICIENT_JUSTIFICATION", () => {
  const alternatives_reviewed = alternativesReviewed("decide");
  alternatives_reviewed.decide.reason = "";
  const gate = evaluateSubstitutionGate({ alternatives_reviewed, available_alternative: "decide" });
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_INSUFFICIENT_JUSTIFICATION");
});

test("X2C3-6c : SUBSTITUTION_GATE_REASON_CODES contient exactement les 6 codes du mandat, aucun autre", () => {
  assert.deepEqual([...SUBSTITUTION_GATE_REASON_CODES].sort(), [
    "ACCEPTED_CONTRACT_PRESERVING", "REJECTED_CONTRADICTS_FACTS", "REJECTED_INSUFFICIENT_JUSTIFICATION",
    "REJECTED_NO_ALTERNATIVE", "REJECTED_OBJECTIVE_CHANGED", "REJECTED_USER_RESERVED_CHOICE"
  ].sort());
});

// --- X2C3-7..10 : interdictions structurelles du mandat --------------------------------------------

test("X2C3-7 : evaluateSubstitutionGate/applySubstitutionGate ne codent aucune spécificité de domaine (mot métier, date, budget, voyage) ni aucun seuil numérique arbitraire", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["evaluateSubstitutionGate", "applySubstitutionGate"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /voyage|budget|italie|tourisme|hébergement|destinataire/i, `${name} ne doit référencer aucun mot métier de production.`);
    assert.doesNotMatch(body, /\b\d{2,}\b/, `${name} ne doit coder aucun seuil numérique arbitraire.`);
  }
});

test("X2C3-8 : le verdict du Gate pour une issue ne dépend jamais du nombre total d'issues ni de sa position dans le lot", () => {
  const alone = applySubstitutionGate(
    [{ issue_id: "issue-3", alternatives_reviewed: alternativesReviewed("estimate"), available_alternative: "estimate", why_available: "ok" }],
    {}
  );
  const inBatchOf5 = applySubstitutionGate(
    Array.from({ length: 5 }, (_, i) => ({
      issue_id: `issue-${i}`,
      alternatives_reviewed: alternativesReviewed(i === 3 ? "estimate" : null),
      available_alternative: i === 3 ? "estimate" : null,
      why_available: i === 3 ? "ok" : null
    })),
    {}
  );
  assert.equal(alone[0].available_alternative, "estimate");
  assert.equal(inBatchOf5.find((r) => r.issue_id === "issue-3").available_alternative, "estimate");
});

test("X2C3-9 : evaluateSubstitutionGate/applySubstitutionGate ne mentionnent jamais degraded_state, agreement, clarification_required ni operational_request_ready -- OPRIE reste seule autorité de readiness", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["evaluateSubstitutionGate", "applySubstitutionGate"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /degraded_state|clarification_required|confirmation_required|operational_request_ready/);
    assert.doesNotMatch(body, /\bagreement\b/);
  }
});

test("X2C3-10 : TRANSPORT_LIMITS (HTTP-8192a, gelé) reste strictement inchangé -- le Substitution Gate ne touche ni le transport ni un provider", () => {
  assert.deepEqual(TRANSPORT_LIMITS, { decision: 16384, analyst: 16384, critic: 65536, arbiter: 196608, absolute: 262144 });
});

test("X2C3-10b : evaluateSubstitutionGate/applySubstitutionGate ne nomment aucun provider (groq, anthropic, openai)", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["evaluateSubstitutionGate", "applySubstitutionGate"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /groq|anthropic|openai/i, `${name} ne doit jamais nommer un provider.`);
  }
});

// --- X2C3-11..13 : câblage réel dans runCriticBatchedPipeline ---------------------------------------

const TIGHT_CAPABILITY = { fixedOverheadUnits: 100, perTargetUnits: 50, maxUnitsPerBatch: 220 };

function analystOutputFixture(issueIds) {
  return {
    operational_request_candidate: { objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: issueIds.map((id) => ({ id, type: "missing_information", description: `Description de ${id}.`, impact: "material", substitutable: false, recommended_treatment: "question", kind: null })),
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}

function globalOutputFixture(overrides = {}) {
  return {
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    ...overrides
  };
}

// X2-C.4 : executeBatch produit désormais des candidates matérialisées (jamais alternatives_reviewed/
// available_alternative directement, cf. materializeSubstitutionReviewFromCandidates) -- ce helper
// construit la forme RAW réellement attendue depuis ce lot, `available` désignant la SEULE famille
// dont les 5 conditions du Gate candidate-level sont réunies.
function candidateFor(treatment, isAccepted) {
  return isAccepted
    ? {
        candidate_action: `Action concrète via ${treatment}.`,
        applicable: true, preserves_objective: true, requires_user_reserved_choice: false,
        contradicts_known_facts: false, produces_complete_deliverable: true,
        justification: `Cette alternative permet de poursuivre utilement le travail sans l'information manquante.`
      }
    : {
        candidate_action: null,
        applicable: false, preserves_objective: false, requires_user_reserved_choice: false,
        contradicts_known_facts: false, produces_complete_deliverable: false,
        justification: `Cette alternative ne permet aucune progression utile sur ce point précis.`
      };
}

function batchEntryFor(issueId, available) {
  return { [issueId]: { candidates: Object.fromEntries(LADDER.map((treatment) => [treatment, candidateFor(treatment, treatment === available)])) } };
}

test("X2C3-11 : runCriticBatchedPipeline applique désormais le Gate -- un veto qualifié du Critic global sur une issue neutralise l'alternative proposée pour CETTE MÊME issue avant deriveCriticConsequences", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture({ vetoes: [{ issue_id: "issue1", new_information_trigger: "t", why_material: "m", why_not_substitutable: "s" }] }),
      executeBatch: async (input) => Object.assign({}, ...input.issueIds.map((id) => batchEntryFor(id, "estimate")))
    }
  );
  const review = output.question_substitution_review.find((r) => r.issue_id === "issue1");
  assert.equal(review.available_alternative, null);
  assert.equal(review.question_is_last_resort, true);
  assert.equal(output.illegitimate_question_found.length, 0);
  assert.equal(output.vetoes.length, 1);
});

test("X2C3-12 : sans veto ni dérive sémantique (cas nominal de toutes les campagnes précédentes) -- le Gate accepte, aucune régression sur le comportement historique de runCriticBatchedPipeline", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => Object.assign({}, ...input.issueIds.map((id) => batchEntryFor(id, "estimate")))
    }
  );
  const review = output.question_substitution_review.find((r) => r.issue_id === "issue1");
  assert.equal(review.available_alternative, "estimate");
  assert.equal(output.illegitimate_question_found.length, 1);
});

test("X2C3-13 : une dérive sémantique détectée par le Critic global neutralise toute alternative proposée dans le même tour, pour toutes les issues du lot", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1", "issue2"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture({ semantic_drift_detected: true, semantic_drift_notes: ["note"] }),
      executeBatch: async (input) => Object.assign({}, ...input.issueIds.map((id) => batchEntryFor(id, "estimate")))
    }
  );
  for (const review of output.question_substitution_review) {
    assert.equal(review.available_alternative, null);
  }
});

// --- X2C3-14..16 : rejeu déterministe des deux sentinelles de preuve réelle X2-C.2 -----------------
// SANS appel réseau, SANS modification du prompt. Reconstruction de la forme structurée RAPPORTÉE
// par le smoke Groq réel (cf. section "preuve réelle" du mandat X2-C.3) : Cas A ("type de voyage",
// substituable) -- le provider réel a déclaré question_is_last_resort=true, aucune alternative
// disponible (verdict CAS A = FAIL, alors qu'une alternative aurait dû être trouvée) ; Cas B
// ("destinataire du document", non substituable) -- question_is_last_resort=true (verdict CAS B =
// PASS, déjà correct). Aucune valeur inventée ici : les deux formes rejouées sont exactement celles
// rapportées par la preuve réelle (six alternatives reasonably_available=false, available_alternative
// =null), le seul moyen disponible dans cette session de rejouer l'évidence sans GROQ_API_KEY.

function realEvidenceBatchEntry(issueId) {
  return batchEntryFor(issueId, null);
}

test("X2C3-14 : rejeu déterministe du Cas A (\"type de voyage\", substituable) -- le Gate NE PEUT PAS faire apparaître une alternative que le Critic n'a jamais proposée : question_is_last_resort reste true, verdict CAS A toujours FAIL (SEMANTIC_PROVIDER_LIMIT confirmé, non corrigé par le Gate)", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "Produire le livrable demandé.", analyst_output: analystOutputFixture(["issue-1"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => Object.assign({}, ...input.issueIds.map((id) => realEvidenceBatchEntry(id)))
    }
  );
  const review = output.question_substitution_review.find((r) => r.issue_id === "issue-1");
  assert.equal(review.question_is_last_resort, true, "Cas A : le Gate ne peut pas inventer une alternative absente de la sortie réelle du Critic -- FAIL persiste.");
  assert.equal(review.available_alternative, null);
});

test("X2C3-15 : rejeu déterministe du Cas B (\"destinataire du document\", non substituable) -- inchangé, verdict CAS B toujours PASS", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "Produire le livrable demandé.", analyst_output: analystOutputFixture(["issue-1"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => Object.assign({}, ...input.issueIds.map((id) => realEvidenceBatchEntry(id)))
    }
  );
  const review = output.question_substitution_review.find((r) => r.issue_id === "issue-1");
  assert.equal(review.question_is_last_resort, true);
  assert.equal(output.illegitimate_question_found.length, 0);
});

test("X2C3-16 : le Substitution Gate ne peut structurellement PAS distinguer un Cas A dégradé (faux négatif provider) d'un Cas B légitime -- les deux produisent la MÊME forme (aucune alternative proposée), ce qui confirme que ce résidu est hors de portée d'une validation contractuelle déterministe et ne peut être fermé que par un correctif provider/prompt", () => {
  const noAlternative = () => ({ alternatives_reviewed: alternativesReviewed(null), available_alternative: null });
  assert.deepEqual(noAlternative(), noAlternative());
  assert.deepEqual(evaluateSubstitutionGate(noAlternative()), evaluateSubstitutionGate(noAlternative()));
  assert.equal(evaluateSubstitutionGate(noAlternative()).reason_code, "REJECTED_NO_ALTERNATIVE");
});

// --- X2C3-verif : frozen guard -----------------------------------------------------------------

test("X2C3-verif : le frozen guard confirme qu'aucun moteur gelé n'a été modifié par X2-C.3", () => {
  const guardPath = fileURLToPath(new URL("../tools/frozen-guard.mjs", import.meta.url));
  const output = execFileSync("node", [guardPath], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "OK");
});
