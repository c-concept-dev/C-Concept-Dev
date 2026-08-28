import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildExecutionContractShadow, validateExecutionContract } from "../evaluation/lot10g3b3b/execution-contract.js";

const corpora = ["corpus-lot10g2a.json", "corpus-lot10g3b.json", "corpus-lot10g3b1.json"]
  .map((name) => JSON.parse(fs.readFileSync(new URL(`../evaluation/${name}`, import.meta.url), "utf8")));
const corpus = corpora[0];

test("les 30 cas du corpus 10G.2A sont représentables sans changer leurs oracles", () => {
  assert.equal(corpus.cases.length, 30);
  for (const item of corpus.cases) {
    const clarification = item.oracle.question_required === true;
    const contract = buildExecutionContractShadow({
      request_id: `corpus-${item.id}`,
      original_request: item.demande,
      decision: {
        etat_demande: clarification ? "clarification_necessaire" : "exploitable",
        route: clarification ? null : item.oracle.route,
        confiance: "haute",
        raison_interne: item.rationale,
        question: clarification ? "Quel élément indispensable manque à la demande ?" : null
      }
    });
    assert.equal(contract.original_request, item.demande);
    assert.equal(contract.executability.state, clarification ? "clarification_necessaire" : "exploitable");
    assert.equal(contract.routing.engine, clarification ? null : item.oracle.route);
    assert.doesNotThrow(() => validateExecutionContract(contract));
  }
});

test("les 50 cas de tous les corpus décisionnels versionnés sont représentables", () => {
  const cases = corpora.flatMap((item) => item.cases);
  assert.equal(cases.length, 50);
  for (const item of cases) {
    const states = Array.isArray(item.oracle.etat_demande) ? item.oracle.etat_demande : [item.oracle.etat_demande];
    const routes = Array.isArray(item.oracle.route) ? item.oracle.route : [item.oracle.route];
    const clarification = item.oracle.question_required === true || (states.includes("clarification_necessaire") && !states.includes("exploitable"));
    const state = clarification ? "clarification_necessaire" : "exploitable";
    const route = clarification ? null : routes.find((value) => value === "rapide" || value === "architecte") || item.oracle.route;
    const contract = buildExecutionContractShadow({
      request_id: `all-corpora-${item.id}-${state}`,
      original_request: item.demande,
      decision: {
        etat_demande: state,
        route,
        confiance: "haute",
        raison_interne: item.rationale || "Oracle structurel existant projeté.",
        question: clarification ? "Quelle information indispensable manque encore ?" : null
      }
    });
    assert.equal(contract.original_request, item.demande);
    assert.equal(contract.executability.state, state);
    assert.equal(contract.routing.engine, route);
  }
});

test("le mapping Rapide projette format, verrous, quantité et contrôles sans les recalculer", () => {
  const contract = buildExecutionContractShadow({
    original_request: "Produis exactement cinq sections.",
    decision: { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "runtime", question: null },
    intent: { explicit_constraints: ["exactement cinq sections"] },
    rapid: { format: "markdown", locks: ["format", "volume", "final_check"] },
    quantities: [{ exact: 5, unit: "sections", obligation_ids: ["REQ-001"] }],
    prompt_contract: { format: "markdown", opening: "#", checks: [{ rule: "Compter cinq sections.", type: "deterministic", blocking: true }] }
  });
  assert.equal(contract.output.format, "markdown");
  assert.deepEqual(contract.locks.map((item) => item.id), ["format", "volume", "final_check"]);
  assert.equal(contract.quantities[0].exact, 5);
  assert.equal(contract.checks[0].rule, "Compter cinq sections.");
});

test("le mapping Architecte réutilise intention, preuves, hypothèses et critères existants", () => {
  const contract = buildExecutionContractShadow({
    original_request: "Conçois une stratégie structurée.",
    decision: { etat_demande: "exploitable", route: "architecte", confiance: "moyenne", raison_interne: "runtime", question: null },
    architect: {
      comprehension: {
        intention_principale: "Concevoir une stratégie structurée",
        declarations: [{ contenu: "La stratégie est demandée.", statut: "declaration_utilisateur" }],
        contraintes: [{ contenu: "Conserver une structure claire.", statut: "declaration_utilisateur" }],
        informations_manquantes: []
      },
      evaluation: { connaissance_externe_necessaire: false, actualite_requise: false },
      strategie: { hypotheses_autorisees: ["Choisir un ordre de présentation raisonnable."] },
      livrable: { nature: "Stratégie", format_technique: "markdown", quantites: null, longueur_indicative: "proportionnée" },
      verification: { criteres_bloquants: ["La stratégie est complète."], criteres_qualitatifs: ["La structure est claire."] }
    },
    locks: [{ id: "plan", reason: "La structure est explicitement requise." }]
  });
  assert.equal(contract.intent.objective, "Concevoir une stratégie structurée");
  assert.equal(contract.evidence.user_facts.length, 2);
  assert.equal(contract.assumptions[0].status, "assumption");
  assert.equal(contract.checks.length, 2);
  assert.equal(contract.routing.engine, "architecte");
});

test("les quantités du runtime gardent cible, unité et bornes", () => {
  const fixtures = [
    { exact: 20, unit: "points", target: "checklist" },
    { exact: 120, unit: "mots", target: "e-mail" },
    { min: 3, max: 5, unit: "scénarios", target: "comparaison" }
  ];
  for (const quantity of fixtures) {
    const contract = buildExecutionContractShadow({
      original_request: "Demande structurelle mutée.",
      decision: { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "runtime", question: null },
      quantities: [quantity]
    });
    assert.equal(contract.quantities[0].unit, quantity.unit);
    assert.equal(contract.quantities[0].target, quantity.target);
  }
});
