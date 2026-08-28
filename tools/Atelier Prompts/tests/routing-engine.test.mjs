import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdnState,
  routeExecution,
  validateRoutingDecision,
  createRoutingAuditView,
  PREPARATION_SIGNAL_IDS
} from "../core/adn/index.js";

function state(decision = {
  etat_demande: "exploitable",
  route: "rapide",
  confiance: "haute",
  raison_interne: "runtime",
  question: null
}) {
  return buildAdnState({
    demande: "Produire un résultat borné et directement utilisable.",
    decision,
    intent: {
      objective: "Produire un résultat",
      deliverable: "résultat borné",
      explicit_constraints: []
    },
    checks: [{ id: "CHK-001", type: "manual", rule: "Résultat présent." }]
  });
}

test("provider valide: route héritée sans réinterprétation", () => {
  const s = state();
  const decision = routeExecution(s, {
    provider_source: "groq",
    provider_available: true,
    provider_decision: {
      etat_demande: "exploitable",
      route: "rapide",
      confiance: "haute",
      raison_interne: "ok",
      question: null
    }
  });
  assert.equal(decision.route, "rapide");
  assert.equal(decision.mode, "provider");
  assert.equal(decision.provider.decision_used, true);
  validateRoutingDecision(decision);
});

test("échec provider: l'indisponibilité seule ne force plus Architecte", () => {
  const s = state();
  const decision = routeExecution(s, {
    provider_source: "local-prudent",
    provider_available: false
  });
  assert.equal(decision.route, "rapide");
  assert.equal(decision.mode, "structural-fallback");
  assert.equal(decision.preparation.required, false);
  validateRoutingDecision(decision);
});

test("fallback: un besoin positif de stratégie route Architecte", () => {
  const s = state();
  const decision = routeExecution(s, {
    provider_source: "local-prudent",
    provider_available: false,
    preparation_signals: [{
      id: "strategy_design",
      needed: true,
      reason: "Une stratégie doit être conçue avant le livrable."
    }]
  });
  assert.equal(decision.route, "architecte");
  assert.equal(decision.preparation.required, true);
  assert.deepEqual(decision.preparation.signals.map((x) => x.id), ["strategy_design"]);
  validateRoutingDecision(decision);
});

test("fallback: dépendances liées route Architecte", () => {
  const s = state();
  const decision = routeExecution(s, {
    provider_available: false,
    preparation_signals: [{
      id: "dependent_components",
      reason: "Plusieurs composants dépendants doivent être coordonnés."
    }]
  });
  assert.equal(decision.route, "architecte");
});

test("un signal marqué needed=false n'escalade pas", () => {
  const s = state();
  const decision = routeExecution(s, {
    provider_available: false,
    preparation_signals: [{
      id: "constraint_arbitration",
      needed: false,
      reason: "Aucun arbitrage réel."
    }]
  });
  assert.equal(decision.route, "rapide");
});

test("clarification: aucune route, même avec signaux de préparation", () => {
  const s = state({
    etat_demande: "clarification_necessaire",
    route: null,
    confiance: "moyenne",
    raison_interne: "missing",
    question: "Quel élément manque ?"
  });
  const decision = routeExecution(s, {
    provider_available: false,
    preparation_signals: [{
      id: "strategy_design",
      reason: "Signal présent mais non routable avant exploitabilité."
    }]
  });
  assert.equal(decision.route, null);
  assert.equal(decision.mode, "clarification");
});

test("le nombre de verrous ne constitue pas un signal de complexité", () => {
  const s = state();
  const decision = routeExecution(s, {
    provider_available: false
  });
  assert.equal(decision.route, "rapide");
  assert.equal(decision.invariants.lock_count_is_not_route, true);
});

test("aucun identifiant métier n'est accepté comme signal", () => {
  const s = state();
  assert.throws(() => routeExecution(s, {
    provider_available: false,
    preparation_signals: [{
      id: "travel_budget",
      reason: "Interdit"
    }]
  }), /Signal de préparation inconnu/);
});

test("les six signaux autorisés sont génériques et stables", () => {
  assert.deepEqual(PREPARATION_SIGNAL_IDS, [
    "strategy_design",
    "dependent_components",
    "constraint_arbitration",
    "linked_scenarios",
    "architecture_coordination",
    "research_planning"
  ]);
});

test("audit view n'expose que le nécessaire", () => {
  const s = state();
  const decision = routeExecution(s, {
    provider_available: false,
    preparation_signals: [{
      id: "architecture_coordination",
      reason: "Architecture préalable nécessaire.",
      source_ids: ["OBL-001"]
    }]
  });
  const audit = createRoutingAuditView(decision);
  assert.equal(audit.route, "architecte");
  assert.deepEqual(audit.preparation_signal_ids, ["architecture_coordination"]);
  assert.equal("reason" in audit, false);
});

test("simulation S07/S08/S09: double échec provider ne force plus Architecte", () => {
  for (const requestId of ["S07", "S08", "S09"]) {
    const s = state();
    s.request_id = requestId;
    const decision = routeExecution(s, {
      provider_source: "local-prudent",
      provider_available: false,
      preparation_signals: []
    });
    assert.equal(decision.route, "rapide", requestId);
  }
});

test("cas complexe en fallback reste Architecte si la préparation est prouvée", () => {
  const s = state();
  const decision = routeExecution(s, {
    provider_source: "local-prudent",
    provider_available: false,
    preparation_signals: [
      { id: "constraint_arbitration", reason: "Contraintes en tension." },
      { id: "dependent_components", reason: "Étapes dépendantes." }
    ]
  });
  assert.equal(decision.route, "architecte");
  assert.equal(decision.preparation.signals.length, 2);
});
