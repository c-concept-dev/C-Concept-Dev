import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyCandidate,
  validateProvenanceRecord,
  normalizeProvenanceRecords,
  PROVENANCE_VALUES,
  CANDIDATE_FIELDS
} from "../core/adn/index.js";
import { ANALYST_JSON_SCHEMA, ANALYST_SYSTEM_PROMPT, validateAnalystOutput, parseAnalystOutput } from "../workers/shared/operational-request-core.js";

// 3F.3.3-P1 : reproduction locale, sans réseau, du défaut empirique observé sur Groq
// (case-12-italie, deux exécutions consécutives) : l'Analyst peut produire un JSON strictement
// conforme au schéma (la clé "value" était déjà présente et requise) mais dont la VALEUR est une
// chaîne vide — que le validateur rejette légitimement avec "ProvenanceRecord.value est obligatoire."
// La cause n'est jamais une divergence sur la PRÉSENCE de la clé (déjà alignée), mais sur sa
// NON-VACUITÉ : type:"string" seul autorise "". Ce fichier prouve : (1) le validateur reste
// strictement inchangé et fiable ; (2) le schéma documente désormais minLength:1 comme défense en
// profondeur (jamais vérifiée empiriquement ici, aucun smoke réseau) ; (3) aucune réparation
// synthétique n'existe nulle part dans le pipeline ; (4) le prompt exige désormais explicitement une
// valeur réelle et interdit l'invention. Aucune assertion ici ne porte sur la sélection des issues,
// la matérialité, recommended_treatment, substitutable, ou la readiness (hors périmètre P1).

function candidateWithObjective() {
  return { ...createEmptyCandidate(), objective: "Préparer un compte rendu." };
}

function minimalAnalystOutput(overrides = {}) {
  return {
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [],
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false },
    ...overrides
  };
}

// --- Phase 12 : ProvenanceRecord sans value -> rejeté ---------------------------------------------

test("P1-12 : un ProvenanceRecord sans la clé value est rejeté (avant même l'exécution runtime)", () => {
  assert.throws(() => validateProvenanceRecord({ field: "objective", provenance: "explicit_user_statement" }), TypeError);
});

// --- Phase 13 : value vide -> rejeté ----------------------------------------------------------------

test("P1-13 : value=\"\" (chaîne vide) est rejeté — c'est exactement la forme du défaut empirique reproduit (Groq, case-12-italie)", () => {
  assert.throws(() => validateProvenanceRecord({ field: "objective", value: "", provenance: "explicit_user_statement" }), /ProvenanceRecord\.value est obligatoire/);
});

test("P1-13b : value composé uniquement d'espaces est rejeté (jamais un contournement trivial de la non-vacuité)", () => {
  assert.throws(() => validateProvenanceRecord({ field: "objective", value: "   ", provenance: "explicit_user_statement" }), /ProvenanceRecord\.value est obligatoire/);
});

// --- Phase 14 : value=null -> rejeté ----------------------------------------------------------------

test("P1-14 : value=null est rejeté (le contrat n'autorise jamais null pour value)", () => {
  assert.throws(() => validateProvenanceRecord({ field: "objective", value: null, provenance: "explicit_user_statement" }), TypeError);
  assert.equal(ANALYST_JSON_SCHEMA.properties.provenance_records.items.properties.value.type, "string", "le schéma ne déclare jamais value comme nullable : contrairement à kind (Issue), aucune union [\"string\",\"null\"] n'est légitime ici.");
});

// --- Phase 15 : value valide -> accepté --------------------------------------------------------------

test("P1-15 : un ProvenanceRecord avec une valeur réelle et non vide est accepté", () => {
  const result = validateProvenanceRecord({ field: "objective", value: "Préparer un compte rendu.", provenance: "explicit_user_statement" });
  assert.equal(result.value, "Préparer un compte rendu.");
});

test("P1-15b : normalizeProvenanceRecords accepte une liste de records valides et rejette dès qu'un seul est invalide", () => {
  const valid = normalizeProvenanceRecords([
    { field: "objective", value: "Préparer un compte rendu.", provenance: "explicit_user_statement" },
    { field: "expected_deliverable", value: "Un document structuré.", provenance: "safe_deduction" }
  ]);
  assert.equal(valid.length, 2);
  assert.throws(() => normalizeProvenanceRecords([
    { field: "objective", value: "Préparer un compte rendu.", provenance: "explicit_user_statement" },
    { field: "expected_deliverable", value: "", provenance: "safe_deduction" }
  ]), /ProvenanceRecord\.value est obligatoire/);
});

// --- Phase 16 : test central P1 — alignement schéma / parseur / validateur -------------------------

test("P1-16 (test central) : une forme conforme au TYPE déclaré par le schéma (value: chaîne) mais violant sa non-vacuité échoue de façon identique et déterministe à chaque étape du pipeline, jamais un passage silencieux", () => {
  const emptyValueRecord = { field: "objective", value: "", provenance: "explicit_user_statement" };
  // 1. Le schéma déclare bien value comme chaîne non vide (minLength:1) : la forme observée le viole
  //    explicitement — ce n'est donc jamais une forme que le schéma "autorise sans réserve".
  const valueSchema = ANALYST_JSON_SCHEMA.properties.provenance_records.items.properties.value;
  assert.equal(valueSchema.type, "string");
  assert.equal(valueSchema.minLength, 1);
  assert.ok(emptyValueRecord.value.length < valueSchema.minLength, "préconditions du test : la fixture doit réellement violer minLength.");
  // 2. Le parseur JSON complet (parseAnalystOutput) rejette cette forme avec le MÊME message que le
  //    validateur direct, jamais un message différent ni un succès inattendu.
  const analystOutputWithEmptyValue = minimalAnalystOutput({
    operational_request_candidate: candidateWithObjective(),
    provenance_records: [emptyValueRecord]
  });
  assert.throws(() => parseAnalystOutput(JSON.stringify(analystOutputWithEmptyValue)), /ProvenanceRecord\.value est obligatoire/);
  // 3. Le validateur direct (validateAnalystOutput, appelé par parseAnalystOutput) produit exactement
  //    la même erreur, à l'identique — aucune divergence entre les deux points d'entrée.
  assert.throws(() => validateAnalystOutput(analystOutputWithEmptyValue), /ProvenanceRecord\.value est obligatoire/);
  // Jamais de passage silencieux : aucune des trois étapes ne laisse passer la forme vide sans erreur.
});

test("P1-16b : symétriquement, une forme réellement conforme (value non vide) traverse les trois étapes sans aucune erreur", () => {
  const validRecord = { field: "objective", value: "Préparer un compte rendu.", provenance: "explicit_user_statement" };
  const analystOutput = minimalAnalystOutput({ operational_request_candidate: candidateWithObjective(), provenance_records: [validRecord] });
  const viaParser = parseAnalystOutput(JSON.stringify(analystOutput));
  const viaValidator = validateAnalystOutput(analystOutput);
  assert.deepEqual(viaParser.provenance_records, viaValidator.provenance_records);
  assert.equal(viaParser.provenance_records[0].value, "Préparer un compte rendu.");
});

// --- Phase 17 : contrat strict JSON Groq — required couvre explicitement value ---------------------

test("P1-17 : le schéma strict (ANALYST_JSON_SCHEMA.provenance_records) exige explicitement value au bon niveau", () => {
  const provenanceItemSchema = ANALYST_JSON_SCHEMA.properties.provenance_records.items;
  assert.deepEqual([...provenanceItemSchema.required].sort(), ["field", "provenance", "value"]);
  assert.equal(provenanceItemSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(provenanceItemSchema.properties).sort(), ["field", "provenance", "value"], "aucun champ supplémentaire, aucun champ manquant : required doit couvrir exactement properties (mode strict Groq/OpenAI).");
  assert.equal(provenanceItemSchema.properties.value.minLength, 1, "défense en profondeur documentée dans le schéma — non vérifiée empiriquement dans ce lot (aucun smoke réseau).");
});

// --- Phase 18 : aucune réparation synthétique -------------------------------------------------------

test("P1-18 : aucune réparation synthétique n'existe — un value manquant/vide n'est jamais silencieusement remplacé par \"\", \"unknown\", le champ ou la source", () => {
  const attempts = [
    { field: "objective", provenance: "explicit_user_statement" }, // value totalement absent
    { field: "objective", value: "", provenance: "explicit_user_statement" },
    { field: "objective", value: null, provenance: "explicit_user_statement" }
  ];
  for (const attempt of attempts) {
    assert.throws(() => validateProvenanceRecord(attempt), TypeError, `${JSON.stringify(attempt)} doit échouer, jamais être réparé silencieusement.`);
  }
  // Preuve positive : un ProvenanceRecord valide ressort EXACTEMENT tel quel (clone), jamais réécrit,
  // jamais enrichi, jamais substitué à partir de field/source.
  const original = { field: "objective", value: "Une valeur réellement fournie.", provenance: "safe_deduction" };
  const result = validateProvenanceRecord(original);
  assert.deepEqual(result, original);
});

// --- Phase 9/10 : le prompt Analyst exige désormais explicitement une valeur réelle, jamais inventée ---

test("P1-9 : le prompt Analyst exige explicitement une valeur non vide et interdit toute invention/fabrication de provenance", () => {
  assert.match(ANALYST_SYSTEM_PROMPT, /value de chaque enregistrement de provenance.{0,120}(valeur réelle et non vide|non vide)/is);
  assert.match(ANALYST_SYSTEM_PROMPT, /n'émettez jamais un enregistrement de provenance avec un value vide ou inventé/i);
  assert.match(ANALYST_SYSTEM_PROMPT, /n'en créez aucun pour satisfaire le schéma/i);
});

// --- Non-régression : PROVENANCE_VALUES / CANDIDATE_FIELDS inchangés (P1 ne touche pas la sémantique) ---

test("P1 : PROVENANCE_VALUES et CANDIDATE_FIELDS restent inchangés (P1 ne modifie aucune règle de matérialité/valeurs légales)", () => {
  assert.deepEqual(PROVENANCE_VALUES, [
    "explicit_user_statement", "clarification_answer", "confirmed_preference", "safe_deduction",
    "delegated_decision", "external_fact_to_research", "labeled_estimate", "conditional_scenario"
  ]);
  assert.ok(CANDIDATE_FIELDS.includes("objective"));
});
