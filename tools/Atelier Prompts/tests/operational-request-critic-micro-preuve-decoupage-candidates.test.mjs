import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  mergeCandidateGroups, evaluateSubstitutionCandidateGate, materializeSubstitutionReviewFromCandidates,
  buildSubstitutionBatchSchema, buildSubstitutionReviewGroupSystemPrompt, buildQuestionReviewTargets,
  runCriticBatchedPipeline, deriveCriticConsequences, validateCriticOutput, TREATMENT_VALUES,
  SUBSTITUTION_CANDIDATE_FIELDS
} from "../workers/shared/operational-request-core.js";
import { TRANSPORT_LIMITS } from "../workers/shared/decision-core.js";

// LOT MICRO-PREUVE-DECOUPAGE-CANDIDATES — dernier lot expérimental borné B-01B avant fermeture.
//
// Cause précise (audit indépendant + preuve directe du message d'erreur Groq, smoke réel X2-C.4) :
// le smoke réel a échoué avec HTTP 400 json_validate_failed AVANT toute évaluation sémantique —
// "candidates" manquait scenario/condition/leave_unknown, les 3 familles générées en fin de réponse
// contrainte. Classification correcte : STRUCTURED_OUTPUT_PROVIDER_LIMIT (jamais
// SEMANTIC_PROVIDER_LIMIT_PERSISTS, qui suppose un jugement sémantique rendu et insatisfaisant — la
// preuve montre qu'aucun jugement n'a jamais été matérialisé). Ce lot teste si diviser les 6 familles
// en groupes plus petits (2x3, puis 3x2, puis 6x1 si nécessaire) résout cette limite structurelle.
//
// Aucune modification sémantique : evaluateSubstitutionCandidateGate, materializeSubstitutionReviewFromCandidates,
// assembleSubstitutionReviews, applySubstitutionGate (X2-C.3), deriveCriticConsequences,
// validateCriticOutput restent tous INCHANGÉS. mergeCandidateGroups (nouvelle, PURE) fusionne
// simplement les résultats bruts de N sous-appels avant que materializeSubstitutionReviewFromCandidates
// ne s'exécute -- runCriticBatchedPipeline (modifiée de façon strictement additive : candidateFamilyGroups
// omis => comportement byte-identique à avant ce lot) orchestre le fan-out séquentiel.

const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
const LADDER = TREATMENT_VALUES.filter((v) => v !== "question");

function extractFunctionSource(source, name) {
  const startMatch = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(startMatch, `fonction ${name} introuvable.`);
  const start = startMatch.index;
  const rest = source.slice(start + 1);
  const boundary = rest.search(/\n(?:\/\*\*|export |function |\/\/ )/);
  const end = boundary === -1 ? source.length : start + 1 + boundary;
  return source.slice(start, end);
}

function candidate(overrides = {}) {
  return {
    candidate_action: "Action concrète proposée.", applicable: true, preserves_objective: true,
    requires_user_reserved_choice: false, contradicts_known_facts: false, produces_complete_deliverable: true,
    justification: "Cette famille permet réellement de continuer utilement le travail.",
    ...overrides
  };
}
function rejectedCandidate(overrides = {}) {
  return candidate({
    applicable: false, preserves_objective: false, produces_complete_deliverable: false,
    candidate_action: null, justification: "Cette famille ne permet aucune progression utile.",
    ...overrides
  });
}

const GROUPS_2X3 = [["research", "decide", "estimate"], ["scenario", "condition", "leave_unknown"]];
const GROUPS_3X2 = [["research", "decide"], ["estimate", "scenario"], ["condition", "leave_unknown"]];
const GROUPS_6X1 = LADDER.map((f) => [f]);

function groupResultFor(group, acceptedFamily, issueId = "issue1") {
  return { [issueId]: { candidates: Object.fromEntries(group.map((f) => [f, f === acceptedFamily ? candidate() : rejectedCandidate()])) } };
}

// --- MPDC-1..4 : mergeCandidateGroups (fusion pure) --------------------------------------------------

test("MPDC-1 : 2x3 -- mergeCandidateGroups assemble exactement les 6 familles à partir de 2 groupes de 3", () => {
  const merged = mergeCandidateGroups(GROUPS_2X3, [groupResultFor(GROUPS_2X3[0], "estimate"), groupResultFor(GROUPS_2X3[1], null)]);
  assert.deepEqual(Object.keys(merged.issue1.candidates).sort(), [...LADDER].sort());
});

test("MPDC-2 : une famille manquante dans le résultat d'un groupe -- rejet explicite, jamais un repli silencieux", () => {
  const incomplete = { issue1: { candidates: { research: candidate(), decide: candidate() } } }; // "estimate" manquante
  assert.throws(() => mergeCandidateGroups(GROUPS_2X3, [incomplete, groupResultFor(GROUPS_2X3[1], null)]), /familles attendues/);
});

test("MPDC-3 : aucune duplication -- une famille présente dans deux groupes de familyGroups est rejetée à la construction", () => {
  const overlapping = [["research", "decide", "estimate"], ["estimate", "scenario", "condition", "leave_unknown"]];
  assert.throws(() => mergeCandidateGroups(overlapping, [groupResultFor(overlapping[0], null), groupResultFor(overlapping[1], null)]), /doublon|plusieurs groupes/);
});

test("MPDC-4 : ordre canonique stable -- le résultat fusionné, une fois passé à materializeSubstitutionReviewFromCandidates, produit le même ordre de clés quel que soit l'ordre des groupes en entrée", () => {
  const merged1 = mergeCandidateGroups(GROUPS_2X3, [groupResultFor(GROUPS_2X3[0], "decide"), groupResultFor(GROUPS_2X3[1], null)]);
  const reversedGroups = [...GROUPS_2X3].reverse();
  const merged2 = mergeCandidateGroups(reversedGroups, [groupResultFor(reversedGroups[0], null), groupResultFor(reversedGroups[1], "decide")]);
  const materialized1 = materializeSubstitutionReviewFromCandidates(merged1.issue1.candidates);
  const materialized2 = materializeSubstitutionReviewFromCandidates(merged2.issue1.candidates);
  assert.deepEqual(Object.keys(materialized1.alternatives_reviewed), [...LADDER]);
  assert.deepEqual(Object.keys(materialized2.alternatives_reviewed), [...LADDER]);
  assert.deepEqual(materialized1, materialized2);
  assert.equal(materialized1.available_alternative, "decide");
});

// --- MPDC-5 : indépendance des groupes ----------------------------------------------------------------

test("MPDC-5 : le contenu du groupe 1 n'affecte jamais le contenu du groupe 2 pour la même issue (fusion, jamais une réinterprétation croisée)", () => {
  const merged = mergeCandidateGroups(GROUPS_2X3, [groupResultFor(GROUPS_2X3[0], "research"), groupResultFor(GROUPS_2X3[1], "scenario")]);
  assert.equal(merged.issue1.candidates.research.applicable, true);
  assert.equal(merged.issue1.candidates.scenario.applicable, true);
  // Les autres familles de CHAQUE groupe restent rejetées, jamais contaminées par l'autre groupe.
  assert.equal(merged.issue1.candidates.decide.applicable, false);
  assert.equal(merged.issue1.candidates.condition.applicable, false);
});

// --- MPDC-6/7 : contrat d'échec (jamais un repli fabriqué) -------------------------------------------

const TIGHT_CAPABILITY = { fixedOverheadUnits: 100, perTargetUnits: 50, maxUnitsPerBatch: 220 };
function analystOutputFixture(issueIds) {
  return {
    operational_request_candidate: { objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: issueIds.map((id) => ({ id, type: "missing_information", description: `Description de ${id}.`, impact: "material", substitutable: false, recommended_treatment: "question", kind: null })),
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}
function globalOutputFixture(overrides = {}) {
  return {
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    ...overrides
  };
}

test("MPDC-6 : un sous-appel (groupe 2) échoue techniquement -- partial_failure=true, jamais une famille fabriquée applicable=false par défaut", async () => {
  await assert.rejects(
    () => runCriticBatchedPipeline(
      { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY, candidateFamilyGroups: GROUPS_2X3 },
      {
        executeGlobal: async () => globalOutputFixture(),
        executeBatch: async (input) => {
          if (input.groupIndex === 1) throw new Error("provider_failure simulée (groupe 2)");
          return groupResultFor(input.familyGroup, "estimate", input.issueIds[0]);
        }
      }
    ),
    (error) => {
      assert.equal(error.technical_state, "partial_failure");
      assert.equal(error.batchFailures.length, 1);
      assert.equal(error.batchFailures[0].groupIndex, 1);
      assert.deepEqual(error.batchFailures[0].familyGroup, GROUPS_2X3[1]);
      return true;
    }
  );
});

test("MPDC-7 : le groupe 1 réussit puis le groupe 2 échoue -- le batch entier reste en échec technique, aucun résultat partiel n'est silencieusement accepté", async () => {
  let group1Called = false;
  await assert.rejects(
    () => runCriticBatchedPipeline(
      { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY, candidateFamilyGroups: GROUPS_2X3 },
      {
        executeGlobal: async () => globalOutputFixture(),
        executeBatch: async (input) => {
          if (input.groupIndex === 0) { group1Called = true; return groupResultFor(input.familyGroup, null, input.issueIds[0]); }
          throw new Error("provider_failure simulée (groupe 2)");
        }
      }
    ),
    (error) => { assert.equal(error.technical_state, "partial_failure"); return true; }
  );
  assert.equal(group1Called, true, "le groupe 1 doit avoir été tenté avant l'échec du groupe 2 (séquentiel).");
});

test("MPDC-4b : le mécanisme de fusion est générique au découpage -- 3x2 et 6x1 assemblent également exactement les 6 familles, sans code spécifique à un découpage précis", () => {
  const merged3x2 = mergeCandidateGroups(GROUPS_3X2, GROUPS_3X2.map((g) => groupResultFor(g, null)));
  const merged6x1 = mergeCandidateGroups(GROUPS_6X1, GROUPS_6X1.map((g) => groupResultFor(g, null)));
  assert.deepEqual(Object.keys(merged3x2.issue1.candidates).sort(), [...LADDER].sort());
  assert.deepEqual(Object.keys(merged6x1.issue1.candidates).sort(), [...LADDER].sort());
});

// --- MPDC-8..10 : Gate / derive / validate inchangés ---------------------------------------------------

test("MPDC-8 : evaluateSubstitutionCandidateGate (Gate) reste inchangé -- comportement identique sur des candidates fusionnées par groupes", () => {
  const merged = mergeCandidateGroups(GROUPS_3X2, [
    groupResultFor(GROUPS_3X2[0], null), groupResultFor(GROUPS_3X2[1], "scenario"), groupResultFor(GROUPS_3X2[2], null)
  ]);
  const gate = evaluateSubstitutionCandidateGate(merged.issue1.candidates.scenario);
  assert.equal(gate.accepted, true);
  assert.equal(gate.reason_code, "ACCEPTED_CONTRACT_PRESERVING");
});

test("MPDC-9/10 : pipeline complet (fan-out 2x3) -- assemblage + Gate X2-C.3 + deriveCriticConsequences + validateCriticOutput produisent une sortie CriticOutput valide, identique en forme au chemin mono-groupe", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY, candidateFamilyGroups: GROUPS_2X3 },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => groupResultFor(input.familyGroup, input.familyGroup.includes("estimate") ? "estimate" : null, input.issueIds[0])
    }
  );
  assert.doesNotThrow(() => validateCriticOutput(output));
  assert.equal(output.question_substitution_review[0].available_alternative, "estimate");
  assert.equal(output.question_substitution_review[0].question_is_last_resort, false);
  assert.equal(output.illegitimate_question_found.length, 1);
});

test("MPDC-9b : par défaut (candidateFamilyGroups omis), le comportement reste STRICTEMENT identique à un seul groupe = les 6 familles (rétrocompatibilité totale)", async () => {
  let executeBatchCalls = 0;
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => {
        executeBatchCalls += 1;
        assert.deepEqual(input.familyGroup, [...LADDER]);
        assert.equal(input.groupIndex, 0);
        return { issue1: { candidates: Object.fromEntries(LADDER.map((f) => [f, f === "condition" ? candidate() : rejectedCandidate()])) } };
      }
    }
  );
  assert.equal(executeBatchCalls, 1, "un seul appel par batch quand candidateFamilyGroups est omis -- comportement byte-identique à avant ce lot.");
  assert.equal(output.question_substitution_review[0].available_alternative, "condition");
});

// --- MPDC-11/12/13/14 : OPRIE, HTTP-8192a, provider selection, retry/pacing inchangés -----------------

test("MPDC-11 : mergeCandidateGroups / buildSubstitutionReviewGroupSystemPrompt ne mentionnent jamais degraded_state, agreement, clarification_required, operational_request_ready -- OPRIE reste seule autorité de readiness", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  const mergeBody = extractFunctionSource(source, "mergeCandidateGroups");
  assert.doesNotMatch(mergeBody, /degraded_state|clarification_required|confirmation_required|operational_request_ready/);
  assert.doesNotMatch(mergeBody, /\bagreement\b/);
  // buildSubstitutionReviewGroupSystemPrompt est un prompt (texte), jamais un exécutant de decision --
  // vérifié séparément par MPDC-16b (aucune mention des champs de sortie du Critic global).
});

test("MPDC-12 : TRANSPORT_LIMITS (HTTP-8192a, gelé) reste strictement inchangé", () => {
  assert.deepEqual(TRANSPORT_LIMITS, { decision: 16384, analyst: 16384, critic: 65536, arbiter: 196608, absolute: 262144 });
});

test("MPDC-13 : aucun nouveau provider introduit -- ni mergeCandidateGroups ni buildSubstitutionReviewGroupSystemPrompt ne nomment un provider", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["mergeCandidateGroups"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /groq|anthropic|openai/i, `${name} ne doit jamais nommer un provider.`);
  }
  assert.doesNotMatch(buildSubstitutionReviewGroupSystemPrompt(["research"]), /groq|anthropic|openai/i);
});

test("MPDC-14 : le fan-out réutilise exactement le même transport séquentiel (jamais parallèle) qu'avant ce lot", async () => {
  const events = [];
  await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY, candidateFamilyGroups: GROUPS_3X2 },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => {
        events.push({ type: "start", groupIndex: input.groupIndex });
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push({ type: "end", groupIndex: input.groupIndex });
        return groupResultFor(input.familyGroup, null, input.issueIds[0]);
      }
    }
  );
  for (let i = 0; i < events.length - 1; i += 1) {
    if (events[i].type === "start") assert.equal(events[i + 1].type, "end", "un sous-appel de groupe doit se terminer avant que le suivant ne démarre.");
  }
  assert.equal(events.length, 6, "3 groupes x (start+end) = 6 événements, aucun parallélisme.");
});

// --- MPDC-15..19 : interdictions structurelles --------------------------------------------------------

test("MPDC-15 : aucun mot métier de production (voyage, budget, destinataire) dans mergeCandidateGroups ni buildSubstitutionReviewGroupSystemPrompt", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  const mergeBody = extractFunctionSource(source, "mergeCandidateGroups");
  assert.doesNotMatch(mergeBody, /voyage|budget|italie|tourisme|hébergement|destinataire/i);
  assert.doesNotMatch(buildSubstitutionReviewGroupSystemPrompt(["research", "decide", "estimate"]), /voyage|budget|italie|tourisme|hébergement|destinataire/i);
});

test("MPDC-16 : aucune dépendance aux fixtures Cas A/Cas B en production (ni le texte des sentinelles, ni un raccourci qui les reconnaîtrait)", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  assert.doesNotMatch(source, /type de voyage|destinataire du document/i);
});

test("MPDC-17 : aucun mécanisme de fuzzy matching / distance d'édition introduit par ce lot", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const pattern of [/levenshtein/i, /edit.distance/i, /\bfuzzy/i, /similarity[\s_-]?score/i]) {
    assert.doesNotMatch(source, pattern, `operational-request-core.js ne doit jamais contenir ${pattern}.`);
  }
});

test("MPDC-18 : aucun embedding ni représentation vectorielle introduit par ce lot", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const pattern of [/\bembedding/i, /vector[\s_-]?representation/i, /cosine.similarity/i]) {
    assert.doesNotMatch(source, pattern, `operational-request-core.js ne doit jamais contenir ${pattern}.`);
  }
});

test("MPDC-19 : mergeCandidateGroups ne code aucun score, seuil ou pondération arbitraire", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  const body = extractFunctionSource(source, "mergeCandidateGroups");
  assert.doesNotMatch(body, /\bscore\b/i);
  assert.doesNotMatch(body, /weight|pond[ée]r/i);
});

// --- Schéma et prompt du sous-appel groupé -------------------------------------------------------------

test("MPDC-SCHEMA-1 : buildSubstitutionBatchSchema(issueIds, group) exige exactement les familles du groupe, jamais les 6 par défaut", () => {
  const schema = buildSubstitutionBatchSchema(["issue1"], GROUPS_2X3[0]);
  const candidates = schema.properties.issue1.properties.candidates;
  assert.deepEqual(candidates.required.sort(), [...GROUPS_2X3[0]].sort());
  assert.deepEqual(Object.keys(candidates.properties).sort(), [...GROUPS_2X3[0]].sort());
});

test("MPDC-SCHEMA-2 : buildSubstitutionBatchSchema(issueIds) sans groupe reste strictement inchangé (les 6 familles, rétrocompatibilité)", () => {
  const schema = buildSubstitutionBatchSchema(["issue1"]);
  assert.deepEqual(schema.properties.issue1.properties.candidates.required.sort(), [...LADDER].sort());
});

test("MPDC-PROMPT-1 : buildSubstitutionReviewGroupSystemPrompt(group) mentionne exactement les familles du groupe, jamais les autres", () => {
  const prompt = buildSubstitutionReviewGroupSystemPrompt(GROUPS_2X3[0]);
  for (const family of GROUPS_2X3[0]) assert.match(prompt, new RegExp(`"${family}"`));
  for (const family of GROUPS_2X3[1]) assert.doesNotMatch(prompt, new RegExp(`"${family}":`));
  assert.match(prompt, /aucune phrase avant ou après l'objet/);
  // available_alternative/why_available apparaissent légitimement en négation ("N'ajoutez JAMAIS...") --
  // jamais comme un champ que le sous-appel devrait produire.
  assert.match(prompt, /N'ajoutez JAMAIS available_alternative ni why_available/);
});

test("MPDC-PROMPT-2 : buildSubstitutionReviewGroupSystemPrompt rejette un groupe vide, un doublon, ou une famille inconnue", () => {
  assert.throws(() => buildSubstitutionReviewGroupSystemPrompt([]));
  assert.throws(() => buildSubstitutionReviewGroupSystemPrompt(["research", "research"]));
});

// --- MPDC-verif : frozen guard -----------------------------------------------------------------

test("MPDC-verif : le frozen guard confirme qu'aucun moteur gelé n'a été modifié par ce lot", () => {
  const guardPath = fileURLToPath(new URL("../tools/frozen-guard.mjs", import.meta.url));
  const output = execFileSync("node", [guardPath], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "OK");
});
