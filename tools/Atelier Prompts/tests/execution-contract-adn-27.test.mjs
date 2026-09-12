import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EXECUTION_LOCK_IDS,
  buildExecutionContractAuditView,
  buildExecutionContractShadow,
  deriveAdnSummary,
  validateExecutionContract
} from "../evaluation/lot10g3b3b/execution-contract.js";

const proof = fs.readFileSync(new URL("../audit/lot10g3b3b/12-ADN-NON-REGRESSION-PROOF.md", import.meta.url), "utf8");

function fullContract() {
  return buildExecutionContractShadow({
    request_id: "adn-27",
    original_request: "Produis exactement deux éléments dans le format fourni.",
    decision: { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "Décision héritée.", question: null },
    intent: { explicit_constraints: ["exactement deux éléments"] },
    quantities: [{ exact: 2, unit: "éléments", target: "résultat", obligation_ids: ["REQ-001"] }],
    output: { format: "format fourni", opening: "début", closing: "fin", length_policy: "complète" },
    checks: [{ id: "CHK-001", type: "deterministic", target: "deliverable", rule: "Vérifier deux éléments.", blocking: true, obligation_ids: ["REQ-001"] }],
    locks: EXECUTION_LOCK_IDS.map((id) => ({
      id,
      reason: `Primitive ${id} héritée du runtime.`,
      priority: "mandatory",
      source: "runtime",
      source_ids: ["REQ-001"],
      associated_checks: ["CHK-001"],
      active: true
    }))
  });
}

test("la preuve documentaire contient exactement 5 + 9 + 13 éléments ADN", () => {
  const rows = proof.split("\n").filter((line) => /^\| [PTV]\d+ /.test(line));
  assert.equal(rows.filter((line) => /^\| P\d+ /.test(line)).length, 5);
  assert.equal(rows.filter((line) => /^\| T\d+ /.test(line)).length, 9);
  assert.equal(rows.filter((line) => /^\| V\d+ /.test(line)).length, 13);
  assert.equal(rows.length, 27);
  assert.match(proof, /\*\*27\/27\*\*/);
});

test("les 5 propriétés, 9 techniques et 13 verrous sont simultanément représentables", () => {
  const contract = fullContract();
  assert.deepEqual(contract.adn_summary, deriveAdnSummary(contract));
  assert.deepEqual(contract.locks.map((lock) => lock.id), EXECUTION_LOCK_IDS);
  const techniques = [
    contract.version === "1.0" && contract.obligations.length > 0 && contract.checks.length > 0,
    contract.execution_policy.evasion_blocked,
    contract.execution_policy.comfort_questions_forbidden,
    contract.output.format === "format fourni",
    contract.output.opening === "début" && contract.execution_policy.execute_now,
    contract.locks.some((lock) => lock.id === "forbidden") && contract.execution_policy.meta_discussion_forbidden,
    contract.obligations.every((obligation) => obligation.mandatory),
    contract.quantities.some((quantity) => quantity.exact === 2 && quantity.obligation_ids[0] === "OBL-001"),
    contract.execution_policy.final_injunction_active && contract.execution_policy.complete_delivery_required
  ];
  assert.deepEqual(techniques, Array(9).fill(true));
  assert.equal(contract.obligations[0].id, "OBL-001");
  assert.equal(contract.quantities[0].obligation_ids[0], "OBL-001");
  assert.equal(contract.checks[0].obligation_ids[0], "OBL-001");
  assert.ok(contract.locks.every((lock) => lock.source === "runtime" && lock.associated_checks[0] === "CHK-001" && lock.active));
});

test("adn_summary ne peut pas diverger de sa dérivation pure", () => {
  const contract = fullContract();
  contract.adn_summary.discipline = "missing";
  assert.throws(() => validateExecutionContract(contract), /purement dérivé|cinq propriétés/i);
});

test("la vue d'audit est utile sans recopier les contenus sensibles", () => {
  const view = buildExecutionContractAuditView(fullContract());
  assert.equal(view.contract_version, "1.0");
  assert.equal(view.routing.engine, "rapide");
  assert.equal(view.locks.length, 13);
  assert.ok(view.obligations.every((item) => !("text" in item)));
  assert.ok(!("original_request" in view));
  assert.ok(!("evidence" in view));
  assert.ok(!("assumptions" in view));
});
