import assert from "node:assert/strict";
import test from "node:test";

import { ANALYST_JSON_SCHEMA, CRITIC_JSON_SCHEMA, ARBITER_JSON_SCHEMA } from "../workers/shared/operational-request-core.js";

// Vérifie récursivement que les 3 schémas des rôles OPRIE respectent les contraintes du mode strict
// de Groq/OpenAI Structured Outputs :
//   - tout nœud "object" ayant des "properties" déclare un "required" qui couvre EXACTEMENT les
//     mêmes clés (ni plus, ni moins) — c'est la règle dont la violation a produit les HTTP 400
//     réels observés sur "kind" (issues) en 3F.3.3-B ;
//   - additionalProperties: false sur tout nœud "object" ;
//   - un "enum" contenant null implique que "type" inclut "null", et réciproquement une valeur
//     nullable ([T, "null"]) qui porte un enum doit inclure null dans cet enum.
// Ce fichier ne fait aucun appel réseau : c'est un contrôle purement statique sur les objets schéma
// déjà exportés, avant toute exécution réelle contre un provider.

function typesOf(node) {
  if (Array.isArray(node.type)) return node.type;
  if (typeof node.type === "string") return [node.type];
  return [];
}

function auditNode(node, path, problems) {
  if (!node || typeof node !== "object") return;

  if (node.properties && typeof node.properties === "object") {
    if (!typesOf(node).includes("object")) {
      problems.push(`${path} : porte "properties" mais "type" (${JSON.stringify(node.type)}) n'inclut pas "object".`);
    }
    if (node.additionalProperties !== false) {
      problems.push(`${path} : additionalProperties doit être exactement false (mode strict Groq/OpenAI).`);
    }
    const propertyKeys = Object.keys(node.properties).sort();
    const requiredKeys = Array.isArray(node.required) ? [...node.required].sort() : null;
    if (!requiredKeys) {
      problems.push(`${path} : "required" est absent alors que "properties" est défini.`);
    } else if (requiredKeys.length !== propertyKeys.length || requiredKeys.some((key, index) => key !== propertyKeys[index])) {
      problems.push(`${path} : "required" (${JSON.stringify(requiredKeys)}) ne couvre pas exactement "properties" (${JSON.stringify(propertyKeys)}).`);
    }
    for (const [key, subSchema] of Object.entries(node.properties)) {
      auditNode(subSchema, `${path}.properties.${key}`, problems);
    }
  }

  if (Array.isArray(node.enum) && node.enum.includes(null) && !typesOf(node).includes("null")) {
    problems.push(`${path} : "enum" contient null mais "type" (${JSON.stringify(node.type)}) n'inclut pas "null".`);
  }
  if (typesOf(node).includes("null") && Array.isArray(node.enum) && !node.enum.includes(null)) {
    problems.push(`${path} : "type" inclut "null" mais son "enum" ne contient pas null.`);
  }

  if (node.items) auditNode(node.items, `${path}.items`, problems);
}

function assertGroqStrictCompatible(schema, name) {
  const problems = [];
  auditNode(schema, name, problems);
  assert.deepEqual(problems, [], `${name} incompatible avec le mode strict Groq/OpenAI :\n${problems.join("\n")}`);
}

test("ANALYST_JSON_SCHEMA est intégralement compatible avec le mode strict Groq (required == properties, récursif)", () => {
  assertGroqStrictCompatible(ANALYST_JSON_SCHEMA, "ANALYST_JSON_SCHEMA");
});

test("CRITIC_JSON_SCHEMA est intégralement compatible avec le mode strict Groq (required == properties, récursif)", () => {
  assertGroqStrictCompatible(CRITIC_JSON_SCHEMA, "CRITIC_JSON_SCHEMA");
});

test("ARBITER_JSON_SCHEMA est intégralement compatible avec le mode strict Groq (required == properties, récursif)", () => {
  assertGroqStrictCompatible(ARBITER_JSON_SCHEMA, "ARBITER_JSON_SCHEMA");
});

test("le schéma next_question de l'Arbitre (objet imbriqué) déclare bien required == properties", () => {
  const nextQuestion = ARBITER_JSON_SCHEMA.properties.next_question;
  assert.deepEqual([...nextQuestion.required].sort(), Object.keys(nextQuestion.properties).sort());
  assert.equal(nextQuestion.additionalProperties, false);
});

// --- Test qui aurait détecté exactement le défaut réel observé sur Groq (HTTP 400 sur "kind") -------

test("le vérificateur détecte le défaut réel constaté sur Groq : kind absent de required (issues)", () => {
  const brokenIssueSchema = {
    type: "object",
    additionalProperties: false,
    // Reproduit exactement l'état défectueux d'avant correctif : "kind" est déclaré dans
    // properties mais absent de required.
    required: ["id", "type", "description", "impact", "substitutable", "recommended_treatment"],
    properties: {
      id: { type: "string" },
      type: { type: "string", enum: ["missing_information", "conflict"] },
      kind: { type: "string", enum: ["logical_contradiction", "constraint_tension", "priority_conflict"] },
      description: { type: "string" },
      impact: { type: "string", enum: ["material", "non_material"] },
      substitutable: { type: "boolean" },
      recommended_treatment: { type: "string" }
    }
  };
  const problems = [];
  auditNode(brokenIssueSchema, "BrokenIssueSchema", problems);
  assert.equal(problems.length, 1, "le vérificateur doit détecter exactement l'écart required/properties introduit.");
  assert.match(problems[0], /BrokenIssueSchema/);
  assert.match(problems[0], /ne couvre pas exactement/);
  assert.match(problems[0], /"kind"/, "le message doit désigner la propriété fautive (kind) présente dans properties mais absente de required.");
});

test("le vérificateur accepte le schéma Issue réel (post-correctif) que Groq a effectivement rejeté avant correction", () => {
  const problems = [];
  auditNode(ANALYST_JSON_SCHEMA.properties.issues.items, "ANALYST_JSON_SCHEMA.properties.issues.items", problems);
  assert.deepEqual(problems, []);
  const criticProblems = [];
  auditNode(CRITIC_JSON_SCHEMA.properties.operational_request_candidate_review.properties.missed_material_issues.items, "CRITIC.missed_material_issues.items", criticProblems);
  assert.deepEqual(criticProblems, [], "reproduit exactement le second chemin d'erreur réel signalé par Groq (missed_material_issues).");
});

// --- additionalProperties, unions nullable, tableaux/items, enums (audit explicite au-delà du récursif) ---

test("aucun schéma de rôle n'omet additionalProperties:false sur un objet imbriqué", () => {
  for (const [name, schema] of [["ANALYST_JSON_SCHEMA", ANALYST_JSON_SCHEMA], ["CRITIC_JSON_SCHEMA", CRITIC_JSON_SCHEMA], ["ARBITER_JSON_SCHEMA", ARBITER_JSON_SCHEMA]]) {
    const problems = [];
    auditNode(schema, name, problems);
    const additionalPropertiesProblems = problems.filter((p) => p.includes("additionalProperties"));
    assert.deepEqual(additionalPropertiesProblems, []);
  }
});

test("les champs nullables scalaires (confirmation_reason, blocked_reason) restent des unions simples, pas des objets", () => {
  assert.deepEqual(ARBITER_JSON_SCHEMA.properties.confirmation_reason, { type: ["string", "null"] });
  assert.deepEqual(ARBITER_JSON_SCHEMA.properties.blocked_reason, { type: ["string", "null"] });
});

test("le champ kind d'une issue est nullable (union) et son enum inclut explicitement null", () => {
  const kindSchema = ANALYST_JSON_SCHEMA.properties.issues.items.properties.kind;
  assert.deepEqual(kindSchema.type, ["string", "null"]);
  assert.ok(kindSchema.enum.includes(null));
});
