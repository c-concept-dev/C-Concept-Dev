import test from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTIVE_LOCK_IDS,
  selectAdaptiveLocks,
  validateAdaptiveLockSelection,
  applyAdaptiveLocksToExecutionSnapshot,
  createAdaptiveLockAuditView
} from "../core/adn/adaptive-lock-selector.js";
import { buildAdnState, adnStateToExecutionContractSnapshot } from "../core/adn/adn-state.js";
import { buildExecutionContractShadow } from "../evaluation/lot10g3b3b/execution-contract.js";

function decision(state = "exploitable", route = "rapide") {
  return {
    etat_demande: state,
    route: state === "exploitable" ? route : null,
    confiance: "haute",
    raison_interne: "Décision héritée du runtime.",
    question: state === "exploitable" ? null : "Quel matériau faut-il traiter ?"
  };
}

function ids(selection) {
  return selection.locks.map((lock) => lock.id);
}

test("demande exploitable minimale active seulement les protections transversales nécessaires", () => {
  const state = buildAdnState({ original_request: "Exécute la tâche demandée.", decision: decision() });
  const selection = selectAdaptiveLocks(state);
  assert.deepEqual(ids(selection), ["forbidden", "final_check"]);
  assert.equal(selection.metrics.selected_count, 2);
  assert.equal(selection.metrics.available_count, 13);
});

test("clarification n'active ni interdits d'exécution ni contrôle final", () => {
  const state = buildAdnState({ original_request: "Analyse le document mentionné.", decision: decision("clarification_necessaire") });
  const selection = selectAdaptiveLocks(state);
  assert.equal(ids(selection).includes("forbidden"), false);
  assert.equal(ids(selection).includes("final_check"), false);
});

test("les propriétés structurelles sélectionnent les verrous déterministes sans domaine métier", () => {
  const state = buildAdnState({
    original_request: "Transforme le matériau fourni en exactement cinq blocs structurés.",
    decision: decision(),
    intent: {
      deliverable: "artefact structuré",
      recipient: "lecteur expert",
      explicit_constraints: ["exactement cinq blocs"]
    },
    evidence: {
      material_facts: ["élément source"],
      deductions: ["relation déduite"]
    },
    assumptions: ["préférence substituable"],
    executability: { substitutable_missing: ["détail secondaire"] },
    quantities: [{ exact: 5, unit: "blocs", obligation_ids: ["REQ-001"] }],
    output: {
      format: "structure-formelle",
      structure: ["section A", "section B"],
      opening: "BEGIN",
      closing: "END",
      length_policy: "terminer proprement"
    },
    checks: [{ id: "CHK-001", type: "deterministic", rule: "Compter cinq blocs", blocking: true, obligation_ids: ["REQ-001"] }]
  });
  const selection = selectAdaptiveLocks(state, {
    semantic_signals: [{ id: "scope", needed: true, reason: "La frontière du livrable est déterminante.", priority: "mandatory" }]
  });
  assert.deepEqual(ids(selection), ADAPTIVE_LOCK_IDS);
  assert.doesNotThrow(() => validateAdaptiveLockSelection(selection));
});

test("scope peut être activé par un signal sémantique générique sans taxonomie métier", () => {
  const state = buildAdnState({ original_request: "Traite seulement la partie pertinente.", decision: decision() });
  const selection = selectAdaptiveLocks(state, {
    semantic_signals: [{ id: "scope", reason: "Une frontière explicite de sortie est nécessaire.", source: "runtime", source_ids: ["REQ-001"] }]
  });
  assert.equal(ids(selection).includes("scope"), true);
  assert.equal(selection.locks.find((lock) => lock.id === "scope").reason.includes("frontière"), true);
});

test("un signal négatif n'active pas un verrou", () => {
  const state = buildAdnState({ original_request: "Réponds directement.", decision: decision() });
  const selection = selectAdaptiveLocks(state, {
    semantic_signals: [{ id: "scope", needed: false, reason: "Pas de risque de dérive." }]
  });
  assert.equal(ids(selection).includes("scope"), false);
});

test("tout verrou sélectionné possède raison, source, priorité et état actif", () => {
  const state = buildAdnState({
    original_request: "Produis trois unités.",
    decision: decision(),
    quantities: [{ exact: 3, unit: "unités" }]
  });
  const selection = selectAdaptiveLocks(state);
  for (const lock of selection.locks) {
    assert.ok(lock.reason.length > 0);
    assert.ok(["mandatory", "useful"].includes(lock.priority));
    assert.ok(["user", "material", "system", "runtime"].includes(lock.source));
    assert.equal(lock.active, true);
  }
});

test("volume conserve la traçabilité quantité/obligation/contrôle", () => {
  const state = buildAdnState({
    original_request: "Produis exactement quatre éléments.",
    decision: decision(),
    intent: { explicit_constraints: ["exactement quatre éléments"] },
    quantities: [{ id: "Q-001", exact: 4, unit: "éléments", obligation_ids: ["REQ-001"] }],
    checks: [{ id: "CHK-001", type: "deterministic", rule: "Compter quatre éléments", obligation_ids: ["REQ-001"] }]
  });
  const volume = selectAdaptiveLocks(state).locks.find((lock) => lock.id === "volume");
  assert.ok(volume.source_ids.includes("Q-001"));
  assert.ok(volume.source_ids.includes("OBL-001"));
  assert.ok(volume.associated_checks.includes("CHK-001"));
});

test("le contrôle final référence tous les contrôles existants", () => {
  const state = buildAdnState({
    original_request: "Produis le livrable.",
    decision: decision(),
    checks: [
      { id: "CHK-001", rule: "Contrôle un", type: "manual" },
      { id: "CHK-002", rule: "Contrôle deux", type: "semantic" }
    ]
  });
  const finalCheck = selectAdaptiveLocks(state).locks.find((lock) => lock.id === "final_check");
  assert.deepEqual(finalCheck.associated_checks, ["CHK-001", "CHK-002"]);
});

test("la sélection se projette sans perte dans ExecutionContract v1", () => {
  const state = buildAdnState({
    request_id: "sel-001",
    original_request: "Produis exactement cinq sections en format structuré.",
    decision: decision(),
    intent: { deliverable: "document", explicit_constraints: ["exactement cinq sections"] },
    quantities: [{ exact: 5, unit: "sections", obligation_ids: ["REQ-001"] }],
    output: { format: "format-structuré", structure: ["A", "B"] }
  });
  const selectionExtras = applyAdaptiveLocksToExecutionSnapshot(state);
  const snapshot = adnStateToExecutionContractSnapshot(state, { locks: selectionExtras.locks });
  const contract = buildExecutionContractShadow(snapshot);
  assert.deepEqual(contract.locks.map((lock) => lock.id), selectionExtras.locks.map((lock) => lock.id));
  assert.equal(contract.locks.every((lock) => Boolean(lock.reason)), true);
});

test("la vue audit ne contient pas la demande ni le matériau", () => {
  const state = buildAdnState({
    original_request: "Demande sensible secrète",
    decision: decision(),
    evidence: { material_facts: ["matériau secret"] }
  });
  const audit = createAdaptiveLockAuditView(selectAdaptiveLocks(state));
  const raw = JSON.stringify(audit);
  assert.equal(raw.includes("Demande sensible"), false);
  assert.equal(raw.includes("matériau secret"), false);
});

test("les signaux métier inconnus sont rejetés plutôt que transformés en nouveaux verrous", () => {
  const state = buildAdnState({ original_request: "Tâche universelle.", decision: decision() });
  assert.throws(
    () => selectAdaptiveLocks(state, { semantic_signals: [{ id: "travel_budget", reason: "interdit" }] }),
    /Verrou adaptatif inconnu/
  );
});

test("la sélection reste stable quand seuls les noms de domaine changent", () => {
  const requests = [
    "Prépare un artefact Alpha en trois unités.",
    "Prépare un artefact Zeta en trois unités.",
    "Prépare un artefact Oméga en trois unités."
  ];
  const selections = requests.map((original_request) => {
    const state = buildAdnState({
      original_request,
      decision: decision(),
      quantities: [{ exact: 3, unit: "unités" }]
    });
    return ids(selectAdaptiveLocks(state));
  });
  assert.deepEqual(selections[0], selections[1]);
  assert.deepEqual(selections[1], selections[2]);
});
