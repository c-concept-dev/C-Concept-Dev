import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildRefQuestionSubstitutionReviewSchema, buildReviewEntryDefinitionR2, buildCriticJsonSchemaR2, LADDER_ALTERNATIVE_VALUES_R2 } from "./build-ref-review-schema-r2.mjs";
import { CRITIC_SYSTEM_PROMPT, buildCriticJsonSchema, buildQuestionReviewTargets, makeCriticUserMessage } from "../../../workers/shared/operational-request-core.js";

// LOT X2-A-R2 — tests locaux du schéma factorisé $defs/$ref, avant tout appel réseau (R2-1..16).
// Isolation : buildCriticJsonSchema/CRITIC_SYSTEM_PROMPT/makeCriticUserMessage/buildQuestionReviewTargets
// sont importés en LECTURE SEULE depuis la production (jamais modifiés) — c'est le même mécanisme que
// evaluation/lot10g3b3f3/run-role-benchmark.mjs. La comparaison de taille n'a de sens que si le body R2
// est construit avec le VRAI prompt et la VRAIE fixture, exactement comme X2-A-R1 l'a mesuré.

const FIXTURE_PATH = new URL("../fixtures/critic-b01b-sentinel.json", import.meta.url);
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const sentinelCase = fixture.cases[0];
const analystOutput = sentinelCase.fixture_analyst_output;
const targets = buildQuestionReviewTargets(analystOutput);

test("précondition : la sentinelle B-01B produit bien 4 targets (issue1-4)", () => {
  assert.deepEqual(targets.map((t) => t.issue_id).sort(), ["issue1", "issue2", "issue3", "issue4"]);
});

// --- R2-1 : sérialisable en JSON ----------------------------------------------------------------

test("R2-1 : le schéma factorisé est sérialisable en JSON sans erreur", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  assert.doesNotThrow(() => JSON.stringify(schema));
});

// --- R2-2 : question_substitution_review est un objet -------------------------------------------

test("R2-2 : question_substitution_review reste un objet (jamais un tableau)", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  assert.equal(schema.properties.question_substitution_review.type, "object");
});

// --- R2-3 : propriétés exactement issue1..issue4 -------------------------------------------------

test("R2-3 : les propriétés de question_substitution_review sont exactement issue1..issue4", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  assert.deepEqual(Object.keys(schema.properties.question_substitution_review.properties).sort(), ["issue1", "issue2", "issue3", "issue4"]);
});

// --- R2-4 : required exactement issue1..issue4 ----------------------------------------------------

test("R2-4 : required de question_substitution_review est exactement issue1..issue4", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  assert.deepEqual([...schema.properties.question_substitution_review.required].sort(), ["issue1", "issue2", "issue3", "issue4"]);
});

// --- R2-5 : additionalProperties === false ---------------------------------------------------------

test("R2-5 : additionalProperties === false à la racine, sur question_substitution_review, et sur la définition partagée", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.question_substitution_review.additionalProperties, false);
  assert.equal(schema.$defs.reviewEntry.additionalProperties, false);
});

// --- R2-6 : chaque issueX utilise $ref ---------------------------------------------------------------

test("R2-6 : chaque propriété issueX de question_substitution_review est une simple référence $ref", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  for (const issueId of ["issue1", "issue2", "issue3", "issue4"]) {
    const prop = schema.properties.question_substitution_review.properties[issueId];
    assert.deepEqual(Object.keys(prop), ["$ref"], `${issueId} doit être { "$ref": ... }, rien d'autre.`);
    assert.equal(typeof prop.$ref, "string");
  }
});

// --- R2-7 : toutes les $ref pointent vers une définition existante -----------------------------------

test("R2-7 : chaque $ref pointe vers une définition réellement présente sous $defs (résolution JSON Pointer depuis la racine)", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  for (const issueId of ["issue1", "issue2", "issue3", "issue4"]) {
    const ref = schema.properties.question_substitution_review.properties[issueId].$ref;
    assert.match(ref, /^#\/\$defs\//, "la référence doit être un JSON Pointer résolu depuis la racine du document.");
    const defName = ref.replace("#/$defs/", "");
    assert.ok(schema.$defs && Object.prototype.hasOwnProperty.call(schema.$defs, defName), `la définition "${defName}" doit exister sous schema.$defs.`);
  }
});

// --- R2-8 : la définition partagée contient exactement les six alternatives ---------------------------

test("R2-8 : la définition partagée (reviewEntry.alternatives_reviewed) contient exactement les six alternatives de la ladder canonique", () => {
  const entry = buildReviewEntryDefinitionR2();
  assert.deepEqual(Object.keys(entry.properties.alternatives_reviewed.properties).sort(), [...LADDER_ALTERNATIVE_VALUES_R2].sort());
});

// --- R2-9 : les six alternatives sont requises ---------------------------------------------------------

test("R2-9 : les six alternatives sont toutes requises dans alternatives_reviewed", () => {
  const entry = buildReviewEntryDefinitionR2();
  assert.deepEqual([...entry.properties.alternatives_reviewed.required].sort(), [...LADDER_ALTERNATIVE_VALUES_R2].sort());
});

// --- R2-10 : chaque alternative impose reasonably_available + reason -----------------------------------

test("R2-10 : chaque alternative impose exactement reasonably_available (boolean) et reason (string non vide)", () => {
  const entry = buildReviewEntryDefinitionR2();
  for (const alternative of LADDER_ALTERNATIVE_VALUES_R2) {
    const altSchema = entry.properties.alternatives_reviewed.properties[alternative];
    assert.deepEqual([...altSchema.required].sort(), ["reason", "reasonably_available"]);
    assert.equal(altSchema.properties.reasonably_available.type, "boolean");
    assert.equal(altSchema.properties.reason.type, "string");
    assert.equal(altSchema.properties.reason.minLength, 1);
  }
});

// --- R2-11 : chaque alternative a additionalProperties:false --------------------------------------------

test("R2-11 : chaque alternative individuelle a additionalProperties:false", () => {
  const entry = buildReviewEntryDefinitionR2();
  for (const alternative of LADDER_ALTERNATIVE_VALUES_R2) {
    assert.equal(entry.properties.alternatives_reviewed.properties[alternative].additionalProperties, false);
  }
});

// --- R2-12 : la définition complète n'est présente qu'une seule fois ------------------------------------

test("R2-12 : la définition complète de review n'existe qu'une seule fois dans le schéma (sous $defs.reviewEntry uniquement)", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  assert.equal(Object.keys(schema.$defs).length, 1, "une seule définition partagée doit exister sous $defs.");
  const fullSchemaJson = JSON.stringify(schema);
  // Le fragment distinctif est la définition COMPLÈTE (les six alternatives assemblées sous
  // alternatives_reviewed) : chaque alternative individuelle a la même forme ({reasonably_available,
  // reason}), donc seul l'ensemble des six ensemble est réellement distinctif d'une copie intégrale
  // de l'entrée — il ne doit apparaître qu'une seule fois dans tout le document (sous $defs.reviewEntry),
  // jamais recopié sous issue1..issue4.
  const distinctiveFragment = JSON.stringify(schema.$defs.reviewEntry);
  const occurrences = fullSchemaJson.split(distinctiveFragment).length - 1;
  assert.equal(occurrences, 1, `la définition complète ne doit apparaître qu'une fois dans tout le document (obtenu : ${occurrences}).`);
});

// --- R2-13 : aucune copie intégrale sous issue1..issue4 -------------------------------------------------

test("R2-13 : aucune copie intégrale du sous-schéma de review n'est dupliquée sous issue1..issue4 (chaque clé est une référence minuscule)", () => {
  const schema = buildCriticJsonSchemaR2(targets);
  const entrySize = JSON.stringify(schema.$defs.reviewEntry).length;
  for (const issueId of ["issue1", "issue2", "issue3", "issue4"]) {
    const propSize = JSON.stringify(schema.properties.question_substitution_review.properties[issueId]).length;
    assert.ok(propSize < 50, `${issueId} doit être une référence minuscule (obtenu : ${propSize} chars), pas une copie de ${entrySize} chars.`);
  }
});

// --- R2-14/15/16 : tailles mesurées et comparaison à la baseline X2-A-R1 --------------------------------

test("R2-14/15/16 : tailles réelles du schéma R2 et du body complet, comparées à la baseline X2-A (mesure, jamais un seuil arbitraire)", () => {
  const schemaR2 = buildCriticJsonSchemaR2(targets);
  const schemaR2Json = JSON.stringify(schemaR2);
  const schemaBaseline = buildCriticJsonSchema(targets);
  const schemaBaselineJson = JSON.stringify(schemaBaseline);

  const userMessage = makeCriticUserMessage({
    original_request: sentinelCase.input.original_request,
    clarification_history: sentinelCase.input.clarification_history,
    analyst_output: analystOutput,
    previous_vetoes: []
  });

  function buildBody(schema) {
    return {
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: CRITIC_SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_schema", json_schema: { name: "oprie_critic", strict: true, schema } },
      reasoning_format: "hidden",
      reasoning_effort: "low",
      temperature: 0,
      max_completion_tokens: 2048,
      stream: false
    };
  }

  const bodyR2Json = JSON.stringify(buildBody(schemaR2));
  const bodyBaselineJson = JSON.stringify(buildBody(schemaBaseline));

  // R2-14 : taille du schéma R2 mesurée (jamais un seuil arbitraire — juste rapportée).
  // eslint-disable-next-line no-console
  console.log(`R2-14 schema R2 : ${schemaR2Json.length} chars / ${Buffer.byteLength(schemaR2Json, "utf8")} bytes (baseline X2-A réelle : ${schemaBaselineJson.length} chars).`);
  // R2-15 : taille du body R2 mesurée.
  // eslint-disable-next-line no-console
  console.log(`R2-15 body R2 : ${bodyR2Json.length} chars / ${Buffer.byteLength(bodyR2Json, "utf8")} bytes (baseline X2-A réelle : ${bodyBaselineJson.length} chars).`);
  // R2-16 : réduction par rapport à X2-A-R1, mesurée et rapportée, jamais assertée à un seuil strict.
  const schemaSavingsChars = schemaBaselineJson.length - schemaR2Json.length;
  const bodySavingsChars = bodyBaselineJson.length - bodyR2Json.length;
  // eslint-disable-next-line no-console
  console.log(`R2-16 gain schema : ${schemaSavingsChars} chars (${(100 * schemaSavingsChars / schemaBaselineJson.length).toFixed(1)}%) ; gain body : ${bodySavingsChars} chars (${(100 * bodySavingsChars / bodyBaselineJson.length).toFixed(1)}%).`);

  assert.ok(schemaR2Json.length < schemaBaselineJson.length, "le schéma factorisé doit être strictement plus petit que le schéma dupliqué (mesure, pas un seuil arbitraire).");
  assert.ok(bodyR2Json.length < bodyBaselineJson.length, "le body R2 doit être strictement plus petit que le body X2-A réel.");
});

// --- Isolation : aucune modification de production, aucune deuxième source de vérité sur la ladder -----

test("isolation : buildCriticJsonSchema (production) n'est jamais mutée par ce probe", () => {
  const before = JSON.stringify(buildCriticJsonSchema(targets));
  buildCriticJsonSchemaR2(targets);
  const after = JSON.stringify(buildCriticJsonSchema(targets));
  assert.equal(before, after, "buildCriticJsonSchema(production) doit produire un résultat identique avant/après exécution du probe R2.");
});

test("isolation : aucun mot métier de production n'apparaît dans le code du probe R2", () => {
  const sourcePath = new URL("./build-ref-review-schema-r2.mjs", import.meta.url);
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});
