import test from "node:test";
import assert from "node:assert/strict";

import {
  contractForContractualization,
  assessAnalysisReadiness,
  buildExecutionReadinessInstruction,
  buildFinalExecutionDirective,
  createReadinessAuditView
} from "../core/adn/index.js";

function analysis({
  action = "continuer",
  complete = true,
  questions = [],
  missing = []
} = {}) {
  return {
    comprehension: { informations_manquantes: missing },
    evaluation: {
      action_recommandee: action,
      livrable_complet_possible: complete,
      questions_a_poser: questions
    }
  };
}

test("contractualisation désactive la technique 9 sans désactiver l'exigence de complétude", () => {
  const contract = {
    version: "1.0",
    execution_policy: {
      execute_now: true,
      comfort_questions_forbidden: true,
      meta_discussion_forbidden: true,
      complete_delivery_required: true,
      final_injunction_active: true
    }
  };
  const c = contractForContractualization(contract);
  assert.equal(c.readiness.state, "contractualization");
  assert.equal(c.readiness.can_execute, false);
  assert.equal(c.execution_policy.execute_now, false);
  assert.equal(c.execution_policy.comfort_questions_forbidden, false);
  assert.equal(c.execution_policy.final_injunction_active, false);
  assert.equal(c.execution_policy.complete_delivery_required, true);
  assert.equal(contract.execution_policy.execute_now, true, "l'original ne doit pas être muté");
});

test("une analyse complète et continue devient execution_ready", () => {
  const r = assessAnalysisReadiness(analysis());
  assert.equal(r.state, "execution_ready");
  assert.equal(r.execution_ready, true);
  assert.equal(r.question, null);
});

test("une information non substituable produit une clarification", () => {
  const r = assessAnalysisReadiness(analysis({
    action: "questionner",
    complete: false,
    questions: ["Quelle contrainte doit absolument être respectée ?"],
    missing: [{ information: "Contrainte détenue par l'utilisateur", bloquant: true }]
  }));
  assert.equal(r.state, "clarification_required");
  assert.equal(r.question, "Quelle contrainte doit absolument être respectée ?");
});

test("la porte peut enchaîner un nombre non borné de cycles sans compteur arbitraire", () => {
  let previous = [];
  const labels = ["alphaone","bravotwo","charliethree","deltafour","echofive","foxtrotsix","golfseven","hoteleight","indianine","julietten","kiloeleven","limatwelve"];
  for (const label of labels) {
    const q = `Précision ${label} ?`;
    const r = assessAnalysisReadiness(analysis({
      action: "questionner",
      complete: false,
      questions: [q]
    }), { previous_questions: previous });
    assert.equal(r.state, "clarification_required");
    assert.equal(r.question, q);
    previous.push(q);
  }
});

test("une question déjà posée est écartée au profit d'une nouvelle", () => {
  const old = "Quelle contrainte principale souhaitez-vous retenir ?";
  const fresh = "Quel résultat doit être prioritaire ?";
  const r = assessAnalysisReadiness(analysis({
    action: "questionner",
    complete: false,
    questions: [old, fresh]
  }), { previous_questions: [old] });
  assert.equal(r.question, fresh);
});

test("si toutes les questions se répètent, le système bloque au lieu de boucler", () => {
  const q = "Quelle contrainte principale souhaitez-vous retenir ?";
  const r = assessAnalysisReadiness(analysis({
    action: "questionner",
    complete: false,
    questions: [q]
  }), { previous_questions: [q] });
  assert.equal(r.state, "blocked");
  assert.equal(r.question, null);
});

test("livrable incomplet sans question nouvelle ne doit pas être compilé", () => {
  const r = assessAnalysisReadiness(analysis({
    action: "produire_partiellement",
    complete: false,
    questions: []
  }));
  assert.equal(r.state, "blocked");
  assert.equal(r.execution_ready, false);
});

test("un manque marqué bloquant interdit execution_ready", () => {
  const r = assessAnalysisReadiness(analysis({
    action: "continuer",
    complete: true,
    questions: [],
    missing: [{ information: "Paramètre non substituable", bloquant: true }]
  }));
  assert.equal(r.state, "blocked");
});

test("l'instruction de readiness est universelle et refuse le questionnaire métier", () => {
  const prompt = buildExecutionReadinessInstruction();
  assert.match(prompt, /autant de cycles de clarification que nécessaire/i);
  assert.match(prompt, /aucun questionnaire métier/i);
  assert.match(prompt, /rechercher/i);
  assert.match(prompt, /décider raisonnablement/i);
  assert.match(prompt, /estimer/i);
  assert.match(prompt, /scénariser/i);
  for (const forbidden of ["voyage", "cv", "médical", "ordinateur", "budget"]) {
    assert.equal(prompt.toLowerCase().includes(forbidden), false);
  }
});

test("la directive finale n'est qu'une directive d'exécution, pas de clarification", () => {
  const prompt = buildFinalExecutionDirective();
  assert.match(prompt, /EXECUTION_READY/);
  assert.match(prompt, /produisez maintenant/i);
  assert.match(prompt, /aucune question de confort/i);
});

test("la vue d'audit n'expose pas la question brute", () => {
  const r = assessAnalysisReadiness(analysis({
    action: "questionner",
    complete: false,
    questions: ["Question sensible ?"]
  }));
  const audit = createReadinessAuditView(r);
  assert.equal(audit.has_question, true);
  assert.equal("question" in audit, false);
});
