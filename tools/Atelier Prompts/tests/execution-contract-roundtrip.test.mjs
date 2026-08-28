import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionContractShadow,
  canonicalizeExecutionContract,
  hashExecutionContract,
  parseExecutionContract,
  serializeExecutionContract
} from "../evaluation/lot10g3b3b/execution-contract.js";

function fixture() {
  return buildExecutionContractShadow({
    request_id: "roundtrip-001",
    original_request: "Produis trois éléments vérifiables.",
    decision: { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "runtime", question: null },
    intent: { explicit_constraints: ["trois éléments vérifiables"] },
    quantities: [{ exact: 3, unit: "éléments", obligation_ids: ["REQ-001"] }],
    locks: [{ id: "volume", reason: "Quantité exacte.", source_ids: ["REQ-001"] }]
  });
}

test("build → serialize → parse ne perd aucune information", () => {
  const contract = fixture();
  const parsed = parseExecutionContract(serializeExecutionContract(contract));
  assert.deepEqual(parsed, contract);
  assert.equal(parsed.version, "1.0");
});

test("la représentation canonique et le hash sont stables", () => {
  const contract = fixture();
  const reordered = Object.fromEntries(Object.entries(contract).reverse());
  assert.deepEqual(canonicalizeExecutionContract(reordered), canonicalizeExecutionContract(contract));
  assert.equal(hashExecutionContract(reordered), hashExecutionContract(contract));
  assert.match(hashExecutionContract(contract), /^[a-f0-9]{64}$/);
});

