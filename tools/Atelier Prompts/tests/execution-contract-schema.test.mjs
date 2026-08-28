import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EXECUTION_CONTRACT_VERSION, EXECUTION_LOCK_IDS } from "../evaluation/lot10g3b3b/execution-contract.js";

const schema = JSON.parse(fs.readFileSync(new URL("../audit/lot10g3b3b/02-EXECUTION-CONTRACT-SCHEMA.json", import.meta.url), "utf8"));

test("ExecutionContract v1 possède un schéma fermé et versionné", () => {
  assert.equal(EXECUTION_CONTRACT_VERSION, "1.0");
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.version.const, EXECUTION_CONTRACT_VERSION);
  assert.deepEqual(schema.properties.locks.items.properties.id.enum, EXECUTION_LOCK_IDS);
  assert.deepEqual(schema.properties.locks.items.required, ["id", "reason", "priority", "source", "source_ids", "associated_checks", "active"]);
  assert.equal(schema.properties.obligations.items.properties.id.pattern, "^OBL-[0-9]{3,}$");
  assert.equal(schema.properties.ethics.additionalProperties, false);
});

test("le schéma représente les cinq propriétés et la technique 9", () => {
  assert.deepEqual(Object.keys(schema.properties.adn_summary.properties).sort(), ["completeness","compliance","discipline","executability","intentionality"]);
  assert.equal(schema.properties.execution_policy.properties.execute_now.type, "boolean");
  assert.equal(schema.properties.execution_policy.properties.final_injunction_active.type, "boolean");
  assert.ok(schema.allOf.some((rule) => JSON.stringify(rule).includes("clarification_necessaire") || JSON.stringify(rule).includes("execute_now")));
});
