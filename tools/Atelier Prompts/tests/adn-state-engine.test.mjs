import test from "node:test";
import assert from "node:assert/strict";
import {
  ADN_STATE_VERSION,
  buildAdnState,
  validateAdnState,
  adnStateToExecutionContractSnapshot,
  createAdnAuditView
} from "../core/adn/adn-state.js";
import { buildExecutionContractShadow } from "../evaluation/lot10g3b3b/execution-contract.js";

function decision(state = "exploitable", route = "rapide") {
  return {
    etat_demande: state,
    route: state === "exploitable" ? route : null,
    confiance: "haute",
    raison_interne: state === "exploitable" ? "Décision runtime héritée." : "Clarification runtime héritée.",
    question: state === "exploitable" ? null : "Quel document faut-il traiter ?"
  };
}

test("ADN State v1 matérialise les cinq propriétés sans modifier la demande", () => {
  const state = buildAdnState({
    original_request: "Produis exactement 20 points en JSON.",
    decision: decision(),
    intent: {
      objective: "Produire une liste structurée",
      deliverable: "JSON",
      explicit_constraints: ["exactement 20 points", "JSON"]
    },
    quantities: [{ exact: 20, unit: "points", obligation_ids: ["REQ-001"] }],
    output: { format: "json", opening: "{", closing: "}" },
    checks: [{ type: "deterministic", rule: "JSON parseable", blocking: true }]
  });
  assert.equal(state.version, ADN_STATE_VERSION);
  assert.equal(state.original_request, "Produis exactement 20 points en JSON.");
  assert.equal(state.intent.preserved, true);
  assert.deepEqual(state.properties, {
    intentionality: "pass",
    executability: "pass",
    discipline: "pass",
    completeness: "pass",
    compliance: "pass"
  });
  assert.doesNotThrow(() => validateAdnState(state));
});

test("clarification désactive transversalement discipline et technique 9", () => {
  const state = buildAdnState({
    original_request: "Analyse le document mentionné.",
    decision: decision("clarification_necessaire")
  });
  assert.equal(state.executability.state, "clarification_necessaire");
  assert.equal(state.discipline.execute_now, false);
  assert.equal(state.discipline.final_injunction_active, false);
  assert.equal(state.discipline.comfort_questions_forbidden, false);
  assert.equal(state.techniques.final_injunction, false);
  assert.equal(state.routing.engine, null);
  assert.equal(state.properties.discipline, "not_applicable");
});

test("une demande exploitable active la technique 9 de façon transversale", () => {
  const state = buildAdnState({
    original_request: "Rédige le texte demandé.",
    decision: decision("exploitable", "rapide")
  });
  assert.equal(state.discipline.execute_now, true);
  assert.equal(state.discipline.final_injunction_active, true);
  assert.equal(state.discipline.comfort_questions_forbidden, true);
  assert.equal(state.techniques.final_injunction, true);
  assert.equal(state.properties.discipline, "pass");
});

test("faits, déductions, hypothèses et manques restent disjoints", () => {
  const state = buildAdnState({
    original_request: "Prépare une analyse.",
    decision: decision(),
    evidence: { user_facts: ["fait utilisateur"], material_facts: ["fait matériau"], deductions: ["déduction"] },
    assumptions: ["hypothèse substituable"]
  });
  assert.equal(state.evidence.user_facts[0].status, "fact");
  assert.equal(state.evidence.material_facts[0].source, "material");
  assert.equal(state.evidence.deductions[0].status, "deduction");
  assert.equal(state.assumptions[0].status, "assumption");
});

test("la chaîne contrainte → obligation → quantité est conservée", () => {
  const state = buildAdnState({
    original_request: "Donne exactement cinq éléments.",
    decision: decision(),
    intent: { explicit_constraints: ["exactement cinq éléments"] },
    quantities: [{ exact: 5, unit: "éléments", obligation_ids: ["REQ-001"] }]
  });
  assert.equal(state.intent.explicit_constraints[0].id, "REQ-001");
  assert.equal(state.completeness.obligations[0].constraint_id, "REQ-001");
  assert.deepEqual(state.completeness.quantities[0].obligation_ids, ["OBL-001"]);
});

test("ADN State se projette sans perte vers ExecutionContract v1", () => {
  const state = buildAdnState({
    request_id: "runtime-001",
    original_request: "Produis exactement cinq sections en markdown.",
    decision: decision(),
    intent: { objective: "Produire cinq sections", deliverable: "markdown", explicit_constraints: ["exactement cinq sections"] },
    quantities: [{ exact: 5, unit: "sections", obligation_ids: ["REQ-001"] }],
    output: { format: "markdown", opening: "#" },
    checks: [{ type: "deterministic", rule: "Compter cinq sections.", blocking: true, obligation_ids: ["REQ-001"] }]
  });
  const snapshot = adnStateToExecutionContractSnapshot(state, {
    locks: [{ id: "volume", reason: "Quantité explicite.", source_ids: ["REQ-001"], associated_checks: ["CHK-001"] }]
  });
  const contract = buildExecutionContractShadow(snapshot);
  assert.equal(contract.request_id, "runtime-001");
  assert.equal(contract.original_request, state.original_request);
  assert.equal(contract.execution_policy.execute_now, true);
  assert.equal(contract.execution_policy.final_injunction_active, true);
  assert.equal(contract.quantities[0].exact, 5);
  assert.equal(contract.routing.engine, "rapide");
});

test("vue d'audit n'expose pas la demande ni les preuves", () => {
  const state = buildAdnState({
    original_request: "Texte sensible à ne pas exposer dans la vue audit.",
    decision: decision(),
    evidence: { user_facts: ["secret de test"] }
  });
  const audit = createAdnAuditView(state);
  const serialized = JSON.stringify(audit);
  assert.equal(serialized.includes("Texte sensible"), false);
  assert.equal(serialized.includes("secret de test"), false);
  assert.equal(audit.discipline.final_injunction_active, true);
});

test("les invariants éthiques sont non désactivables", () => {
  const state = buildAdnState({ original_request: "Exécute une tâche autorisée.", decision: decision() });
  const invalid = structuredClone(state);
  invalid.ethics.user_autonomy_preserved = false;
  assert.throws(() => validateAdnState(invalid), /non désactivable/i);
});

test("aucune taxonomie métier n'est nécessaire à l'ADN State", () => {
  const fixtures = [
    "Construis une séquence inconnue de cinq unités.",
    "Évalue un artefact Zeta selon trois contraintes.",
    "Transforme un objet fictif en structure bornée."
  ];
  for (const original_request of fixtures) {
    const state = buildAdnState({ original_request, decision: decision() });
    assert.equal(state.intent.objective, original_request);
    assert.equal(state.intent.status, "preserved_raw");
    assert.equal(state.intent.preserved, true);
  }
});
