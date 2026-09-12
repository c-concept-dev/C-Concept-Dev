import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionContractShadow, validateExecutionContract } from "../evaluation/lot10g3b3b/execution-contract.js";

function exploitable(overrides = {}) {
  return buildExecutionContractShadow({
    original_request: "Produis exactement 20 éléments.",
    decision: { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "Décision runtime conservée.", question: null },
    intent: { explicit_constraints: ["exactement 20 éléments"] },
    quantities: [{ exact: 20, unit: "éléments", obligation_ids: ["REQ-001"] }],
    locks: [{ id: "volume", reason: "Une quantité explicite est présente.", source_ids: ["REQ-001"] }],
    checks: [{ type: "deterministic", rule: "Compter exactement 20 éléments.", blocking: true, obligation_ids: ["REQ-001"] }],
    ...overrides
  });
}

test("la traçabilité REQ → OBL → quantité → verrou → contrôle est conservée", () => {
  const contract = exploitable();
  assert.equal(contract.original_request, "Produis exactement 20 éléments.");
  assert.deepEqual(contract.intent.explicit_constraints[0], { id: "REQ-001", text: "exactement 20 éléments", source: "user" });
  assert.equal(contract.obligations[0].id, "OBL-001");
  assert.equal(contract.obligations[0].constraint_id, "REQ-001");
  assert.deepEqual(contract.quantities[0].obligation_ids, ["OBL-001"]);
  assert.deepEqual(contract.locks[0].source_ids, ["REQ-001"]);
  assert.deepEqual(contract.checks[0].obligation_ids, ["OBL-001"]);
});

test("les faits, déductions, hypothèses et manques restent disjoints", () => {
  const contract = exploitable({
    evidence: { user_facts: ["fait fourni"], material_facts: ["fait du document"], deductions: ["inférence"] },
    assumptions: ["choix substituable"]
  });
  assert.equal(contract.evidence.user_facts[0].status, "fact");
  assert.equal(contract.evidence.deductions[0].status, "deduction");
  assert.equal(contract.assumptions[0].status, "assumption");
  const invalid = structuredClone(contract);
  invalid.evidence.user_facts[0].status = "assumption";
  assert.throws(() => validateExecutionContract(invalid), /hypothèse ou déduction/i);
});

test("clarification désactive exécution et injonction finale", () => {
  const contract = buildExecutionContractShadow({
    original_request: "Traite le document mentionné.",
    decision: { etat_demande: "clarification_necessaire", route: null, confiance: "moyenne", raison_interne: "Document absent.", question: "Pouvez-vous joindre le document ?" }
  });
  assert.equal(contract.execution_policy.execute_now, false);
  assert.equal(contract.execution_policy.final_injunction_active, false);
  assert.equal(contract.routing.engine, null);
  assert.equal(contract.executability.critical_missing[0].status, "missing");
});

test("sécurité, autonomie, unités et raisons de verrou sont strictes", () => {
  const contract = exploitable();
  for (const value of Object.values(contract.ethics)) assert.equal(value, true);
  const unsafe = structuredClone(contract);
  unsafe.ethics.safety_overrides_execution = false;
  assert.throws(() => validateExecutionContract(unsafe), /ne peut pas être désactivé/i);
  const noUnit = structuredClone(contract);
  noUnit.quantities[0].unit = null;
  noUnit.quantities[0].target = null;
  assert.throws(() => validateExecutionContract(noUnit), /unité ou une cible/i);
  const noReason = structuredClone(contract);
  noReason.locks[0].reason = "";
  assert.throws(() => validateExecutionContract(noReason), /doit avoir une raison/i);
});
