import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { buildDynamicReviewSchema, buildReviewEntrySchemaX1, LADDER_ALTERNATIVES_X1 } from "./build-dynamic-review-schema.mjs";
import { X1_SYSTEM_PROMPT, buildX1UserMessage, buildX1GroqRequestBody } from "./x1-prompt.mjs";

// LOT X1 — Dynamic Review Schema Probe. Ce fichier ne teste QUE le mécanisme de construction de
// schéma dynamique (question expérimentale unique du lot) : jamais un appel réseau, jamais une
// simulation de sortie LLM, jamais un jugement sémantique. Fixture générique dérivée de
// evaluation/lot10g3b3f3/fixtures/critic-b01b-sentinel.json (lue, jamais modifiée) : les targets
// issue1..issue4 y sont réellement les 4 issues material+question de la sentinelle B-01B existante.

function target(issueId, overrides = {}) {
  return { issue_id: issueId, type: "missing_information", description: "x", impact: "material", recommended_treatment: "question", ...overrides };
}

const FOUR_SENTINEL_TARGETS = ["issue1", "issue2", "issue3", "issue4"].map((id) => target(id));

// --- X1-1 : 0 target -> objet vide, properties vide, required vide --------------------------------

test("X1-1 : 0 target -> schéma avec properties={} et required=[]", () => {
  const schema = buildDynamicReviewSchema([]);
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.properties, {});
  assert.deepEqual(schema.required, []);
  assert.equal(schema.additionalProperties, false);
});

test("X1-1b : questionReviewTargets non fourni (undefined/null) -> même comportement que []", () => {
  assert.deepEqual(buildDynamicReviewSchema(undefined), buildDynamicReviewSchema([]));
  assert.deepEqual(buildDynamicReviewSchema(null), buildDynamicReviewSchema([]));
});

// --- X1-2 : 1 target -> exactement une propriété requise -------------------------------------------

test("X1-2 : 1 target -> exactement une propriété, exactement un required", () => {
  const schema = buildDynamicReviewSchema([target("issue1")]);
  assert.deepEqual(Object.keys(schema.properties), ["issue1"]);
  assert.deepEqual(schema.required, ["issue1"]);
});

// --- X1-3 : 4 targets (sentinelle) -> exactement quatre propriétés + quatre required ----------------

test("X1-3 : 4 targets (sentinelle issue1..issue4) -> exactement 4 propriétés et 4 required", () => {
  const schema = buildDynamicReviewSchema(FOUR_SENTINEL_TARGETS);
  assert.equal(Object.keys(schema.properties).length, 4);
  assert.equal(schema.required.length, 4);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["issue1", "issue2", "issue3", "issue4"]);
  assert.deepEqual([...schema.required].sort(), ["issue1", "issue2", "issue3", "issue4"]);
});

// --- X1-4 : required === ensemble exact de properties ------------------------------------------------

test("X1-4 : required est exactement l'ensemble des clés de properties, pour 0, 1, 4 et 7 targets", () => {
  for (const targets of [[], [target("issue1")], FOUR_SENTINEL_TARGETS, [target("a"), target("b"), target("c"), target("d"), target("e"), target("f"), target("g")]]) {
    const schema = buildDynamicReviewSchema(targets);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
    assert.equal(schema.required.length, Object.keys(schema.properties).length);
  }
});

// --- X1-5 : additionalProperties:false à tous les niveaux -------------------------------------------

test("X1-5 : additionalProperties:false au niveau racine, alternatives_reviewed, et chaque alternative", () => {
  const schema = buildDynamicReviewSchema(FOUR_SENTINEL_TARGETS);
  assert.equal(schema.additionalProperties, false, "niveau racine (question_substitution_review-as-objet).");
  for (const issueId of Object.keys(schema.properties)) {
    const entrySchema = schema.properties[issueId];
    assert.equal(entrySchema.additionalProperties, false, `niveau entrée (${issueId}).`);
    const alternativesReviewedSchema = entrySchema.properties.alternatives_reviewed;
    assert.equal(alternativesReviewedSchema.additionalProperties, false, `niveau alternatives_reviewed (${issueId}).`);
    for (const alternative of LADDER_ALTERNATIVES_X1) {
      assert.equal(alternativesReviewedSchema.properties[alternative].additionalProperties, false, `niveau alternative ${alternative} (${issueId}).`);
    }
  }
});

// --- X1-6 : les issue_id ne sont jamais reconstruits depuis du texte --------------------------------

test("X1-6 : le schéma dépend exclusivement du champ issue_id verbatim, jamais de description/type/impact", () => {
  const a = buildDynamicReviewSchema([{ issue_id: "issue1", type: "missing_information", description: "Les dates de voyage ne sont pas précisées.", impact: "material" }]);
  const b = buildDynamicReviewSchema([{ issue_id: "issue1", type: "ambiguity", description: "Un texte totalement différent, sans aucun rapport.", impact: "non_material" }]);
  assert.deepEqual(a, b, "changer description/type/impact sans changer issue_id ne doit jamais changer le schéma généré.");

  // La clé de propriété est EXACTEMENT la chaîne issue_id fournie, jamais normalisée/transformée.
  const weirdId = "Issue_Étrange-42";
  const schema = buildDynamicReviewSchema([{ issue_id: weirdId }]);
  assert.deepEqual(Object.keys(schema.properties), [weirdId]);
  assert.deepEqual(schema.required, [weirdId]);
});

test("X1-6b : un target sans issue_id (ou vide) n'introduit jamais de propriété reconstruite", () => {
  const schema = buildDynamicReviewSchema([{ description: "x" }, { issue_id: "" }, { issue_id: "issue1" }]);
  assert.deepEqual(Object.keys(schema.properties), ["issue1"]);
});

// --- X1-7 / X1-8 : aucun fuzzy matching, aucun embedding/similarité (audit statique du source) -------

test("X1-7 : le code source du builder ne contient aucune trace de fuzzy matching / edit distance", () => {
  const sourcePath = fileURLToPath(new URL("./build-dynamic-review-schema.mjs", import.meta.url));
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /levenshtein|jaro|edit[-_ ]?distance|fuzzy/i);
});

test("X1-8 : le code source du builder ne contient aucune trace d'embeddings / similarité vectorielle", () => {
  const sourcePath = fileURLToPath(new URL("./build-dynamic-review-schema.mjs", import.meta.url));
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /embedding|cosine|vector[-_ ]?similarity|tf-?idf|n-?gram/i);
});

// --- X1-9 : les six alternatives sont obligatoires ---------------------------------------------------

test("X1-9 : alternatives_reviewed exige exactement les six alternatives de la ladder, jamais une de plus ou de moins", () => {
  const entrySchema = buildReviewEntrySchemaX1();
  const alternativesReviewedSchema = entrySchema.properties.alternatives_reviewed;
  assert.deepEqual([...alternativesReviewedSchema.required].sort(), [...LADDER_ALTERNATIVES_X1].sort());
  assert.deepEqual(Object.keys(alternativesReviewedSchema.properties).sort(), [...LADDER_ALTERNATIVES_X1].sort());
  assert.equal(LADDER_ALTERNATIVES_X1.length, 6);
});

// --- X1-10 : reasonably_available est boolean ---------------------------------------------------------

test("X1-10 : reasonably_available est déclaré type boolean pour chacune des six alternatives", () => {
  const entrySchema = buildReviewEntrySchemaX1();
  for (const alternative of LADDER_ALTERNATIVES_X1) {
    assert.equal(entrySchema.properties.alternatives_reviewed.properties[alternative].properties.reasonably_available.type, "boolean");
    assert.ok(entrySchema.properties.alternatives_reviewed.properties[alternative].required.includes("reasonably_available"));
  }
});

// --- X1-11 : reason est non vide -----------------------------------------------------------------------

test("X1-11 : reason est déclaré type string avec minLength:1 (défense en profondeur documentée), et obligatoire", () => {
  const entrySchema = buildReviewEntrySchemaX1();
  for (const alternative of LADDER_ALTERNATIVES_X1) {
    const reasonSchema = entrySchema.properties.alternatives_reviewed.properties[alternative].properties.reason;
    assert.equal(reasonSchema.type, "string");
    assert.equal(reasonSchema.minLength, 1);
    assert.ok(entrySchema.properties.alternatives_reviewed.properties[alternative].required.includes("reason"));
  }
});

// --- X1-12 : aucun champ cross-field (D-partiel) n'apparaît dans le schéma X1 -------------------------

test("X1-12 : aucun champ cross-field de production (question_is_last_resort, available_alternative(s), preferred_alternative, illegitimate_question_found, agreement) n'apparaît dans le schéma X1", () => {
  const schema = buildDynamicReviewSchema(FOUR_SENTINEL_TARGETS);
  const serialized = JSON.stringify(schema);
  for (const forbidden of ["question_is_last_resort", "available_alternative", "available_alternatives", "preferred_alternative", "illegitimate_question_found", "agreement"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden), `${forbidden} ne doit jamais apparaître dans le schéma X1.`);
  }
});

test("X1-12b : le prompt système X1 ne mentionne aucun de ces champs cross-field", () => {
  for (const forbidden of ["question_is_last_resort", "available_alternative", "preferred_alternative", "illegitimate_question_found", "agreement"]) {
    assert.doesNotMatch(X1_SYSTEM_PROMPT, new RegExp(forbidden));
  }
});

// --- X1-13 : le builder ne modifie pas le schéma de production ----------------------------------------

test("X1-13 : le module builder n'importe jamais workers/shared/operational-request-core.js (isolation totale)", () => {
  const sourcePath = fileURLToPath(new URL("./build-dynamic-review-schema.mjs", import.meta.url));
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /operational-request-core/, "aucune dépendance vers le contrat de production.");
});

test("X1-13b : CRITIC_JSON_SCHEMA de production reste inchangé après import et exécution du builder X1", async () => {
  const { CRITIC_JSON_SCHEMA: before } = await import("../../../workers/shared/operational-request-core.js");
  const beforeSerialized = JSON.stringify(before);
  buildDynamicReviewSchema(FOUR_SENTINEL_TARGETS);
  buildDynamicReviewSchema([]);
  const { CRITIC_JSON_SCHEMA: after } = await import("../../../workers/shared/operational-request-core.js");
  assert.equal(JSON.stringify(after), beforeSerialized, "exécuter le builder X1 ne doit jamais muter CRITIC_JSON_SCHEMA (même module singleton importé ailleurs).");
});

// --- X1-14 : le builder est déterministe ---------------------------------------------------------------

test("X1-14 : mêmes targets -> même schéma (déterminisme structurel, deux appels indépendants)", () => {
  const schemaA = buildDynamicReviewSchema(FOUR_SENTINEL_TARGETS);
  const schemaB = buildDynamicReviewSchema(FOUR_SENTINEL_TARGETS.map((t) => ({ ...t })));
  assert.deepEqual(schemaA, schemaB);
});

// --- X1-15 : deux listes de targets différentes -> deux required différents ----------------------------

test("X1-15 : deux listes de targets différentes produisent deux required différents", () => {
  const schemaA = buildDynamicReviewSchema([target("issue1"), target("issue2")]);
  const schemaB = buildDynamicReviewSchema([target("issue1"), target("issue3")]);
  assert.notDeepEqual([...schemaA.required].sort(), [...schemaB.required].sort());
});

// --- Prompt X1 : minimal, contient les 5 éléments requis, jamais le prompt de production complet -----

test("X1-prompt-1 : le prompt système X1 contient les 5 éléments requis (rôle/tâche, définition, six alternatives)", () => {
  assert.match(X1_SYSTEM_PROMPT, /poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur/);
  assert.match(X1_SYSTEM_PROMPT, /déterminer définitivement la valeur inconnue/);
  for (const alternative of LADDER_ALTERNATIVES_X1) {
    assert.match(X1_SYSTEM_PROMPT, new RegExp(alternative));
  }
  assert.match(X1_SYSTEM_PROMPT, /question_review_targets/);
});

test("X1-prompt-2 : le prompt système X1 ne contient aucune trace du contrat de production (G3/G4/S3 narratif)", () => {
  for (const forbidden of ["CHAÎNE DE COHÉRENCE OBLIGATOIRE", "CLÉS EXACTES", "CARDINALITÉ OBLIGATOIRE", "SIGNAL OBLIGATOIRE", "operational_request_candidate_review"]) {
    assert.doesNotMatch(X1_SYSTEM_PROMPT, new RegExp(forbidden));
  }
});

test("X1-prompt-3 : le message utilisateur X1 transporte original_request, analyst_candidate et question_review_targets, rien de plus", () => {
  const message = JSON.parse(buildX1UserMessage({
    original_request: "x",
    analyst_candidate: { objective: "x" },
    question_review_targets: FOUR_SENTINEL_TARGETS
  }));
  assert.deepEqual(Object.keys(message).sort(), ["analyst_candidate", "original_request", "question_review_targets"]);
  assert.equal(message.question_review_targets.length, 4);
});

test("X1-prompt-4 : le corps de requête Groq assemblé (jamais exécuté ici) porte le schéma dynamique en response_format strict", () => {
  const dynamicSchema = buildDynamicReviewSchema(FOUR_SENTINEL_TARGETS);
  const body = buildX1GroqRequestBody({
    model: "openai/gpt-oss-20b",
    dynamicSchema,
    userMessage: buildX1UserMessage({ original_request: "x", analyst_candidate: {}, question_review_targets: FOUR_SENTINEL_TARGETS })
  });
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema, dynamicSchema);
  assert.equal(body.messages[0].content, X1_SYSTEM_PROMPT);
  assert.equal(body.stream, false);
});

// --- Aucun mot métier de production dans le code de l'expérience ---------------------------------------

test("X1-16 : aucun mot métier de production (Italie, voyage, budget, sentinel) dans le code de l'expérience", () => {
  for (const relativePath of ["./build-dynamic-review-schema.mjs", "./x1-prompt.mjs"]) {
    const sourcePath = fileURLToPath(new URL(relativePath, import.meta.url));
    const source = fs.readFileSync(sourcePath, "utf8");
    assert.doesNotMatch(source, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
  }
});
