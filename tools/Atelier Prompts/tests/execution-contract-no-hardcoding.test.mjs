import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildExecutionContractShadow } from "../evaluation/lot10g3b3b/execution-contract.js";

const source = fs.readFileSync(new URL("../evaluation/lot10g3b3b/execution-contract.js", import.meta.url), "utf8");
const schema = fs.readFileSync(new URL("../audit/lot10g3b3b/02-EXECUTION-CONTRACT-SCHEMA.json", import.meta.url), "utf8");

test("le cœur et le schéma ne contiennent aucun champ ou domaine métier", () => {
  const forbiddenFields = ["travel_budget", "cv_job", "medical_context", "computer_type"];
  const forbiddenDomains = ["voyage", "italie", "boulangerie", "photosynthèse", "newsletter", "python", "médical"];
  for (const term of [...forbiddenFields, ...forbiddenDomains]) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
    assert.doesNotMatch(schema, new RegExp(term, "i"));
  }
});

test("une mutation complète des noms et du contexte conserve la même structure logique", () => {
  const make = (request, recipient, target) => buildExecutionContractShadow({
    original_request: request,
    decision: { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "runtime", question: null },
    intent: { recipient, explicit_constraints: ["exactement 7 unités"] },
    quantities: [{ exact: 7, unit: "unités", target, obligation_ids: ["REQ-001"] }],
    locks: [
      { id: "recipient", reason: "Le destinataire modifie la forme." },
      { id: "volume", reason: "Une borne exacte existe.", source_ids: ["REQ-001"] }
    ]
  });
  const a = make("Prépare le résultat pour Alpha.", "Alpha", "objets Alpha");
  const b = make("Prépare le résultat pour Zeta.", "Zeta", "objets Zeta");
  assert.deepEqual(Object.keys(a), Object.keys(b));
  assert.deepEqual(a.locks.map((lock) => lock.id), b.locks.map((lock) => lock.id));
  assert.equal(a.quantities[0].exact, b.quantities[0].exact);
  assert.equal(a.routing.engine, b.routing.engine);
});

