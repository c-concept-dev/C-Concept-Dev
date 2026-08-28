import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CONVERSATION_STATES,
  conversationQuestionsSimilar,
  createConversationAuditEvent,
  nextConversationAction,
  validateConversationAuditEvent
} from "../core/adn/conversation-orchestrator.js";

const corpus = JSON.parse(fs.readFileSync(new URL("../evaluation/lot10g3b3f2/multiturn-corpus.json", import.meta.url), "utf8"));
const reasons = {
  clarification: "Une information non substituable reste nécessaire.",
  rapide: "Exécution directe.",
  architecte: "Préparation substantielle requise."
};

function provider(decision, source = "workers-ai") {
  return { source, decision };
}

function clarification(question) {
  return { etat_demande: "clarification_necessaire", route: null, confiance: "haute", raison_interne: reasons.clarification, question };
}

function ready(route) {
  return { etat_demande: "exploitable", route, confiance: "haute", raison_interne: reasons[route], question: null };
}

test("le corpus couvre les dix comportements obligatoires et le cas Italie", () => {
  assert.equal(corpus.length, 11);
  for (const prefix of "ABCDEFGHIJ") assert.ok(corpus.some((item) => item.id.startsWith(prefix + "-")));
  assert.ok(corpus.some((item) => item.id === "ITALIE-multiturn"));
  assert.ok(new Set(corpus.map((item) => item.domain)).size >= 8);
});

test("une demande complète route sans clarification", () => {
  const rapide = nextConversationAction({ provider_result: provider(ready("rapide")) });
  const architecte = nextConversationAction({ provider_result: provider(ready("architecte")) });
  assert.deepEqual([rapide.state, rapide.route, rapide.question], ["execution_ready", "rapide", null]);
  assert.deepEqual([architecte.state, architecte.route, architecte.question], ["execution_ready", "architecte", null]);
});

test("Rapide et Architecte peuvent chacun enchaîner plusieurs clarifications", () => {
  for (const requested_mode of ["rapide", "architecte"]) {
    const first = nextConversationAction({ provider_result: provider(clarification("Quel usage personnel doit guider le résultat ?")), requested_mode });
    const second = nextConversationAction({
      provider_result: provider(clarification("Quelle contrainte personnelle modifierait le plus le résultat ?")),
      previous_questions: [first.question],
      requested_mode
    });
    const last = nextConversationAction({ provider_result: provider(ready(requested_mode)), previous_questions: [first.question, second.question], requested_mode });
    assert.deepEqual([first.state, second.state, last.state], ["clarification_required", "clarification_required", "execution_ready"]);
    assert.equal(last.route, requested_mode);
  }
});

test("le nombre de tours est déterminé par les décisions et non par un plafond", () => {
  const previous = [];
  const questions = [
    "Quel destinataire doit recevoir le résultat ?", "Quelle échéance vous appartient ?",
    "Quel usage personnel doit guider le travail ?", "Quelle limite ne doit pas être dépassée ?",
    "Quel choix souhaitez-vous réserver ?", "Quelle source devez-vous fournir ?",
    "Quel niveau de détail vous est indispensable ?", "Quelle priorité doit l'emporter ?",
    "Quel résultat devez-vous pouvoir vérifier ?", "Quelle dépendance impose votre contexte ?",
    "Quel risque refusez-vous d'accepter ?", "Quelle décision finale gardez-vous ?"
  ];
  for (const question of questions) {
    const action = nextConversationAction({ provider_result: provider(clarification(question)), previous_questions: previous });
    assert.equal(action.state, "clarification_required");
    previous.push(action.question);
  }
  assert.equal(previous.length, 12);
});

test("délégation et réponse inconnue n'imposent jamais la répétition", () => {
  const previous = ["Quelle préférence doit guider ce choix ?"];
  const delegated = nextConversationAction({ provider_result: provider(ready("architecte")), previous_questions: previous, requested_mode: "architecte" });
  const unknown = nextConversationAction({ provider_result: provider(clarification("Quelle autre information disponible permettrait d'avancer ?")), previous_questions: previous });
  assert.equal(delegated.state, "execution_ready");
  assert.equal(unknown.state, "clarification_required");
  assert.equal(unknown.question_repeated, false);
});

test("une reformulation sémantiquement répétée bloque au lieu de boucler", () => {
  const previous = ["Quel destinataire doit recevoir ce document ?"];
  const action = nextConversationAction({ provider_result: provider(clarification("À quel destinataire ce document est-il destiné ?")), previous_questions: previous });
  assert.equal(conversationQuestionsSimilar(previous[0], "À quel destinataire ce document est-il destiné ?"), true);
  assert.equal(action.state, "blocked");
  assert.equal(action.question_repeated, true);
  assert.equal(action.route, null);
});

test("une panne provider n'est ni une clarification ni une preuve de complexité", () => {
  const rapide = nextConversationAction({ provider_result: null, provider_available: false, requested_mode: "rapide" });
  const explicitArchitecte = nextConversationAction({ provider_result: null, provider_available: false, requested_mode: "architecte" });
  assert.deepEqual([rapide.state, rapide.route], ["execution_ready", "rapide"]);
  assert.deepEqual([explicitArchitecte.state, explicitArchitecte.route], ["execution_ready", "architecte"]);
});

test("le même pilote interprète aussi l'Execution Readiness Gate", () => {
  const question = nextConversationAction({ readiness: { state: "clarification_required", question: "Quelle décision vous appartient encore ?", blocking_missing_count: 2 }, requested_mode: "architecte" });
  const readyAction = nextConversationAction({ readiness: { state: "execution_ready", question: null, blocking_missing_count: 0 }, requested_mode: "architecte" });
  assert.deepEqual([question.state, question.missing_count], ["clarification_required", 2]);
  assert.deepEqual([readyAction.state, readyAction.route], ["execution_ready", "architecte"]);
});

test("l'audit contient les dix champs demandés sans contenu brut", () => {
  const action = nextConversationAction({ provider_result: provider(clarification("Question utilisateur confidentielle ?")) });
  const event = createConversationAuditEvent(action, { turn: 4, readiness_before: "clarification_required", answer_received: true, progress_detected: true });
  assert.deepEqual(Object.keys(event), ["turn", "readiness_before", "missing_count", "treatment", "question_generated", "question_repeated", "answer_received", "progress_detected", "readiness_after", "route"]);
  assert.equal(JSON.stringify(event).includes("confidentielle"), false);
  assert.deepEqual(validateConversationAuditEvent(event), event);
  assert.deepEqual(new Set(CONVERSATION_STATES), new Set(["clarification_required", "execution_ready", "blocked"]));
});

test("le pilote ne contient aucune taxonomie métier", () => {
  const source = fs.readFileSync(new URL("../core/adn/conversation-orchestrator.js", import.meta.url), "utf8").toLowerCase();
  for (const forbidden of ["voyage", "italie", "rome", "florence", "cv", "médical", "restaurant", "ordinateur"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
