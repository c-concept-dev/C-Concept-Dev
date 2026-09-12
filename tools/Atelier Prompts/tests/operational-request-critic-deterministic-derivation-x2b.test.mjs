import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CRITIC_SYSTEM_PROMPT,
  CRITIC_JSON_SCHEMA,
  CRITIC_OUTPUT_FIELDS,
  LLM_CRITIC_REQUEST_FIELDS,
  TREATMENT_VALUES,
  buildQuestionSubstitutionReviewSchema,
  buildCriticJsonSchema,
  buildQuestionReviewTargets,
  deriveCriticConsequences,
  validateCriticOutput,
  parseCriticOutput,
  makeCriticUserMessage
} from "../workers/shared/operational-request-core.js";

// LOT X2-B — Dérivation déterministe D. Frontière : le LLM conserve uniquement les jugements
// réellement sémantiques (reasonably_available/reason par alternative, available_alternative,
// why_available, vetoes, semantic_drift, missed_material_issues, significant_stakes) ; les
// conséquences mécaniquement déductibles (question_is_last_resort, illegitimate_question_found,
// agreement) deviennent déterministes, calculées par deriveCriticConsequences — jamais demandées au
// LLM, jamais validées comme sa propre déclaration. available_alternative (singulier) reste LLM
// SEMANTIC dans ce lot : le diagnostic a établi qu'aucune règle de tie-break non arbitraire n'existe
// dans le contrat actuel pour choisir entre plusieurs alternatives disponibles — migrer vers un
// pluriel ou une sélection automatique est explicitement hors périmètre X2-B (cf. rapport).

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function alternativesReviewed(availableTreatments) {
  const trueSet = new Set(Array.isArray(availableTreatments) ? availableTreatments : [availableTreatments]);
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    { reasonably_available: trueSet.has(treatment), reason: `Évaluation structurelle de ${treatment} compte tenu des données reçues.` }
  ]));
}

function rawEntry(available, alternative, whyAvailable) {
  return { alternatives_reviewed: alternativesReviewed(available), available_alternative: alternative, why_available: alternative ? (whyAvailable ?? `Justification : ${alternative}.`) : null };
}

function rawCriticOutput(overrides = {}) {
  return {
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    question_substitution_review: {},
    ...overrides
  };
}

// --- X2B-1/X2B-2 : champs déterministes retirés du schéma/contrat LLM -----------------------------

test("X2B-1 : les champs classés déterministes (agreement, illegitimate_question_found, question_is_last_resort) ne sont plus requis du LLM", () => {
  assert.ok(!LLM_CRITIC_REQUEST_FIELDS.includes("agreement"));
  assert.ok(!LLM_CRITIC_REQUEST_FIELDS.includes("illegitimate_question_found"));
  const entrySchema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]).properties.issue1;
  assert.ok(!entrySchema.required.includes("question_is_last_resort"));
});

test("X2B-2 : le schéma provider (buildCriticJsonSchema) ne contient plus ces champs, à N=0 comme à N>0", () => {
  for (const targets of [[], [{ issue_id: "issue1" }], [{ issue_id: "issue1" }, { issue_id: "issue2" }, { issue_id: "issue3" }, { issue_id: "issue4" }]]) {
    const schema = buildCriticJsonSchema(targets);
    assert.ok(!("agreement" in schema.properties));
    assert.ok(!("illegitimate_question_found" in schema.properties));
    if (targets.length > 0) {
      assert.ok(!("question_is_last_resort" in schema.properties.question_substitution_review.properties.issue1.properties));
    }
  }
});

// --- X2B-3/4/5 : champs sémantiques restent présents et inchangés ----------------------------------

test("X2B-3 : les champs sémantiques (alternatives_reviewed, available_alternative, why_available, vetoes, semantic_drift, missed_material_issues, significant_stakes) restent dans le schéma", () => {
  const schema = buildCriticJsonSchema([{ issue_id: "issue1" }]);
  assert.deepEqual(new Set(LLM_CRITIC_REQUEST_FIELDS), new Set(["operational_request_candidate_review", "vetoes", "semantic_drift_detected", "semantic_drift_notes", "significant_stakes", "significant_stakes_reason", "question_substitution_review"]));
  const entry = schema.properties.question_substitution_review.properties.issue1;
  assert.deepEqual([...entry.required].sort(), ["alternatives_reviewed", "available_alternative", "why_available"]);
});

test("X2B-4 : reasonably_available reste booléen dans le schéma", () => {
  const entry = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]).properties.issue1;
  for (const alt of LADDER) assert.equal(entry.properties.alternatives_reviewed.properties[alt].properties.reasonably_available.type, "boolean");
});

test("X2B-5 : reason reste obligatoire et non vide selon le contrat actuel (validateur inchangé)", () => {
  const raw = rawCriticOutput({ question_substitution_review: { issue1: { alternatives_reviewed: { ...alternativesReviewed([]), research: { reasonably_available: false, reason: "" } }, available_alternative: null, why_available: null } } });
  assert.throws(() => validateCriticOutput(deriveCriticConsequences(raw)), /reason est obligatoire/);
});

// --- X2B-6/7/8/9 : dérivation de question_is_last_resort -------------------------------------------

test("X2B-6 : question_is_last_resort dérivé est true quand les six alternatives sont false", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry([], null) } }));
  assert.equal(derived.question_substitution_review[0].question_is_last_resort, true);
});

test("X2B-7 : question_is_last_resort dérivé est false si au moins une alternative est true", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry("estimate", "estimate") } }));
  assert.equal(derived.question_substitution_review[0].question_is_last_resort, false);
});

test("X2B-8 : la dérivation fonctionne avec exactement 1 alternative true", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry("scenario", "scenario") } }));
  assert.equal(derived.question_substitution_review[0].question_is_last_resort, false);
  assert.equal(derived.illegitimate_question_found.length, 1);
});

test("X2B-9 : la dérivation fonctionne avec plusieurs alternatives true", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry(["estimate", "scenario", "leave_unknown"], "estimate") } }));
  assert.equal(derived.question_substitution_review[0].question_is_last_resort, false);
  assert.equal(derived.illegitimate_question_found.length, 1);
});

// --- X2B-10/11 : available_alternative préservé, jamais une sélection arbitraire -------------------

test("X2B-10 : la projection historique available_alternative reste cohérente (valeur du LLM reportée telle quelle)", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry(["estimate", "scenario"], "scenario") } }));
  assert.equal(derived.question_substitution_review[0].available_alternative, "scenario", "la dérivation ne recalcule jamais available_alternative : elle reporte le choix du LLM tel quel.");
});

test("X2B-11 : aucune sélection arbitraire d'une alternative préférée n'est introduite quand plusieurs sont disponibles (pas de tie-break 'première vraie' silencieux)", () => {
  // Le LLM choisit "leave_unknown" alors que "estimate" est alphabétiquement/positionnellement
  // premier dans la ladder — la dérivation ne doit jamais l'écraser par un choix différent.
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry(["estimate", "decide", "leave_unknown"], "leave_unknown") } }));
  assert.equal(derived.question_substitution_review[0].available_alternative, "leave_unknown");
  assert.equal(derived.illegitimate_question_found[0].available_alternative, "leave_unknown");
});

// --- X2B-12/13/14/15 : illegitimate_question_found dérivé --------------------------------------------

test("X2B-12 : illegitimate_question_found est dérivé correctement pour une question non-last-resort", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry("estimate", "estimate", "x") } }));
  assert.deepEqual(derived.illegitimate_question_found, [{ issue_id: "issue1", available_alternative: "estimate", why_available: "x" }]);
});

test("X2B-13 : aucun signal illégitime pour une question réellement last-resort", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry([], null) } }));
  assert.equal(derived.illegitimate_question_found.length, 0);
});

test("X2B-14 : aucun signal fantôme pour un issue_id absent de question_substitution_review", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry("estimate", "estimate") } }));
  assert.ok(!derived.illegitimate_question_found.some((f) => f.issue_id === "issue-fantome"));
  assert.equal(derived.illegitimate_question_found.length, 1);
});

test("X2B-15 : pas de duplicate signal pour le même issue_id (une seule entrée source -> un seul signal, par construction)", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry("estimate", "estimate") } }));
  const ids = derived.illegitimate_question_found.map((f) => f.issue_id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- X2B-16 : why_available cohérent ------------------------------------------------------------------

test("X2B-16 : why_available dérivé est exactement celui fourni par le LLM dans la revue source, jamais reformulé", () => {
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry("estimate", "estimate", "Justification précise et distincte.") } }));
  assert.equal(derived.illegitimate_question_found[0].why_available, "Justification précise et distincte.");
});

// --- X2B-17 : agreement dérivé si et seulement si totalement déterministe ---------------------------

test("X2B-17 : agreement est dérivé exactement selon la formule déjà imposée par le validateur (vetoes/drift/missed/illegitimate tous propres -> agree, sinon disagree)", () => {
  const clean = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry([], null) } }));
  assert.equal(clean.agreement, "agree");
  const withVeto = deriveCriticConsequences(rawCriticOutput({ vetoes: [{ issue_id: "i1", new_information_trigger: "x", why_material: "y", why_not_substitutable: "z" }] }));
  assert.equal(withVeto.agreement, "disagree");
  const withDrift = deriveCriticConsequences(rawCriticOutput({ semantic_drift_detected: true, semantic_drift_notes: ["x"] }));
  assert.equal(withDrift.agreement, "disagree");
  const withMissed = deriveCriticConsequences(rawCriticOutput({ operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [{ id: "i1", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }] } }));
  assert.equal(withMissed.agreement, "disagree");
  const withIllegitimate = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry("estimate", "estimate") } }));
  assert.equal(withIllegitimate.agreement, "disagree");
});

// --- X2B-18/19/20/21 : les autres responsabilités Critic continuent de fonctionner -----------------

test("X2B-18 : vetoes continuent de fonctionner (transmis tels quels, validés par validateCriticOutput inchangé)", () => {
  const raw = rawCriticOutput({ vetoes: [{ issue_id: "i1", new_information_trigger: "x", why_material: "y", why_not_substitutable: "z" }] });
  const result = validateCriticOutput(deriveCriticConsequences(raw));
  assert.equal(result.vetoes.length, 1);
});

test("X2B-19 : semantic_drift continue de fonctionner", () => {
  const raw = rawCriticOutput({ semantic_drift_detected: true, semantic_drift_notes: ["dérive détectée"] });
  const result = validateCriticOutput(deriveCriticConsequences(raw));
  assert.equal(result.semantic_drift_detected, true);
  assert.deepEqual(result.semantic_drift_notes, ["dérive détectée"]);
});

test("X2B-20 : missed_material_issues continue de fonctionner", () => {
  const issue = { id: "i1", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null };
  const raw = rawCriticOutput({ operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [issue] } });
  const result = validateCriticOutput(deriveCriticConsequences(raw));
  assert.equal(result.operational_request_candidate_review.missed_material_issues.length, 1);
});

test("X2B-21 : significant_stakes continue de fonctionner", () => {
  const raw = rawCriticOutput({ significant_stakes: true, significant_stakes_reason: "Conséquences majeures." });
  const result = validateCriticOutput(deriveCriticConsequences(raw));
  assert.equal(result.significant_stakes, true);
  assert.equal(result.significant_stakes_reason, "Conséquences majeures.");
});

// --- X2B-22/23 : N=0 -------------------------------------------------------------------------------

test("X2B-22 : N=0 -> question_substitution_review n'est jamais demandé au LLM (absent du schéma)", () => {
  const schema = buildCriticJsonSchema([]);
  assert.ok(!("question_substitution_review" in schema.properties));
});

test("X2B-23 : N=0 -> la sortie normalisée reste compatible downstream (question_substitution_review=[], illegitimate_question_found=[], agreement dérivé)", () => {
  const raw = rawCriticOutput();
  delete raw.question_substitution_review;
  const derived = deriveCriticConsequences(raw);
  const result = validateCriticOutput(derived);
  assert.deepEqual(result.question_substitution_review, []);
  assert.deepEqual(result.illegitimate_question_found, []);
  assert.equal(result.agreement, "agree");
});

// --- X2B-24/25 : N=1 et N=4 exacts -------------------------------------------------------------------

test("X2B-24 : N=1 exact — une clé, un signal dérivé si disponible", () => {
  const targets = [{ issue_id: "issue1" }];
  const schema = buildQuestionSubstitutionReviewSchema(targets);
  assert.deepEqual(Object.keys(schema.properties), ["issue1"]);
  const derived = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: { issue1: rawEntry("estimate", "estimate") } }));
  assert.equal(derived.question_substitution_review.length, 1);
});

test("X2B-25 : N=4 exact — quatre clés, cardinalité et dérivation correctes sur la sentinelle B-01B", () => {
  const targets = [{ issue_id: "issue1" }, { issue_id: "issue2" }, { issue_id: "issue3" }, { issue_id: "issue4" }];
  const schema = buildQuestionSubstitutionReviewSchema(targets);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["issue1", "issue2", "issue3", "issue4"]);
  const derived = deriveCriticConsequences(rawCriticOutput({
    question_substitution_review: {
      issue1: rawEntry([], null),
      issue2: rawEntry("estimate", "estimate"),
      issue3: rawEntry("scenario", "scenario"),
      issue4: rawEntry([], null)
    }
  }));
  assert.equal(derived.question_substitution_review.length, 4);
  assert.equal(derived.illegitimate_question_found.length, 2);
});

// --- X2B-26/27/28 : pas de fuzzy matching, pas d'embedding, pas de hardcoding métier ----------------

test("X2B-26 : aucun fuzzy matching ni distance d'édition dans le code de production modifié par X2-B", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /fuzzy|levenshtein|edit[\s_-]?distance|similarity[\s_-]?score/i);
});

test("X2B-27 : aucun embedding ni représentation vectorielle dans le code de production modifié par X2-B", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /embedding|vector[\s_-]?representation|cosine[\s_-]?similarity/i);
});

test("X2B-28 : aucun hardcoding de case_id/corpus/mot métier dans deriveCriticConsequences ni les schémas X2-B", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution|case-12/i);
});

// --- X2B-29 : S4 inchangé ----------------------------------------------------------------------------

test("X2B-29 : la calibration sémantique S4 (reasonably_available) reste intacte, verbatim", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /resolve the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /continue productively despite the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /research=true uniquement si l'information manquante peut réellement être obtenue ou approximée par une source externe pertinente/);
  assert.match(CRITIC_SYSTEM_PROMPT, /decide=true si le système peut raisonnablement retenir/);
  assert.match(CRITIC_SYSTEM_PROMPT, /estimate=true si une valeur, une plage ou une hypothèse approximative/);
  assert.match(CRITIC_SYSTEM_PROMPT, /scenario=true si plusieurs variantes plausibles permettent d'avancer malgré l'inconnue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /condition=true si une partie du travail peut être formulée sous la forme si X →/);
  assert.match(CRITIC_SYSTEM_PROMPT, /leave_unknown=true si l'inconnue peut rester explicitement ouverte/);
});

// --- X2B-30 : moteurs gelés byte-identical -----------------------------------------------------------

test("X2B-30 : le frozen guard confirme qu'aucun moteur gelé n'a été modifié par X2-B", () => {
  const guardPath = fileURLToPath(new URL("../tools/frozen-guard.mjs", import.meta.url));
  const output = execFileSync("node", [guardPath], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "OK", `frozen guard doit rapporter OK (obtenu : ${JSON.stringify(report)}).`);
});

// --- Vérification supplémentaire : round-trip réel sur la sentinelle B-01B --------------------------

test("X2B-verif : parseCriticOutput round-trip complet sur la forme réelle N=4 (sentinelle B-01B), sortie compatible downstream", () => {
  const userMessage = makeCriticUserMessage({
    original_request: "x",
    analyst_output: {
      issues: [
        { id: "issue1", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null },
        { id: "issue2", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null },
        { id: "issue3", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null },
        { id: "issue4", type: "ambiguity", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }
      ]
    },
    previous_vetoes: []
  });
  const targets = JSON.parse(userMessage).question_review_targets;
  assert.equal(targets.length, 4);
  const schema = buildCriticJsonSchema(targets);
  assert.deepEqual(Object.keys(schema.properties.question_substitution_review.properties).sort(), ["issue1", "issue2", "issue3", "issue4"]);

  const rawLlmJson = JSON.stringify(rawCriticOutput({
    question_substitution_review: {
      issue1: rawEntry([], null),
      issue2: rawEntry("estimate", "estimate"),
      issue3: rawEntry("scenario", "scenario"),
      issue4: rawEntry([], null)
    }
  }));
  const result = parseCriticOutput(rawLlmJson);
  assert.equal(result.question_substitution_review.length, 4);
  assert.equal(result.illegitimate_question_found.length, 2);
  assert.equal(result.agreement, "disagree");
  assert.deepEqual([...CRITIC_OUTPUT_FIELDS], Object.keys(result).sort ? [...CRITIC_OUTPUT_FIELDS] : [...CRITIC_OUTPUT_FIELDS]);
  assert.deepEqual(Object.keys(result).sort(), [...CRITIC_OUTPUT_FIELDS].sort());
});
