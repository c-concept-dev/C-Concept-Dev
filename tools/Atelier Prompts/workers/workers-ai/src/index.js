import {
  DECISION_JSON_SCHEMA,
  DECISION_MODEL_PROMPT,
  handleDecisionRequest,
  makeDecisionUserMessage,
  parseDecisionCandidate
} from "../../shared/decision-core.js";
import { ROLE_DEFINITIONS, OPRIE_ROLES, handleRoleRequest } from "../../shared/operational-request-core.js";

export const PRIMARY_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const EVALUATION_MODELS = Object.freeze([
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
]);

export async function decideWithWorkersAIModel(input, env, model) {
  if (!EVALUATION_MODELS.includes(model)) throw new Error("Modèle Workers AI non autorisé.");
  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: DECISION_MODEL_PROMPT },
      { role: "user", content: makeDecisionUserMessage(input) }
    ],
    response_format: {
      type: "json_schema",
      json_schema: DECISION_JSON_SCHEMA
    },
    max_tokens: 160,
    temperature: 0
  });
  return parseDecisionCandidate(result?.response ?? result, input.demande);
}

export function decideWithWorkersAI(input, env) {
  return decideWithWorkersAIModel(input, env, PRIMARY_MODEL);
}

/**
 * Exécute un rôle OPRIE (analyst | critic | arbiter) sur Workers AI, avec exactement le même
 * prompt système et le même schéma JSON que n'importe quel autre provider — le registre
 * ROLE_DEFINITIONS (operational-request-core.js) est l'unique source de vérité pour les deux.
 * Ce fichier ne définit aucune logique de rôle, uniquement le transport vers Workers AI.
 */
export async function runRoleWithWorkersAI(role, input, env) {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) throw new Error(`Rôle OPRIE inconnu : ${role}.`);
  const result = await env.AI.run(PRIMARY_MODEL, {
    messages: [
      { role: "system", content: definition.systemPrompt },
      { role: "user", content: definition.buildUserMessage(input) }
    ],
    response_format: {
      type: "json_schema",
      json_schema: definition.schema
    },
    max_tokens: 2048,
    temperature: 0
  });
  return definition.parseOutput(result?.response ?? result);
}

function roleFromPathname(pathname) {
  const role = pathname.replace(/^\//, "");
  return OPRIE_ROLES.includes(role) ? role : null;
}

export default {
  fetch(request, env) {
    const role = roleFromPathname(new URL(request.url).pathname);
    if (role) return handleRoleRequest(request, env, { role, execute: (input, roleEnv) => runRoleWithWorkersAI(role, input, roleEnv) });
    // Route historique /decision, strictement inchangée.
    return handleDecisionRequest(request, env, decideWithWorkersAI);
  }
};
