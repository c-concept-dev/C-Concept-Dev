import {
  DECISION_JSON_SCHEMA,
  DECISION_MODEL_PROMPT,
  handleDecisionRequest,
  makeDecisionUserMessage,
  parseDecisionCandidate
} from "../../shared/decision-core.js";
import {
  ROLE_DEFINITIONS, OPRIE_ROLES, handleRoleRequest, resolveRoleSchema,
  CRITIC_GLOBAL_SYSTEM_PROMPT, CRITIC_GLOBAL_JSON_SCHEMA, makeCriticGlobalUserMessage,
  SUBSTITUTION_REVIEW_SYSTEM_PROMPT, buildSubstitutionBatchSchema, makeSubstitutionReviewBatchUserMessage,
  estimateSubstitutionBatchOutputUnits, runCriticBatchedPipeline
} from "../../shared/operational-request-core.js";

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
 * Appel Workers AI de bas niveau pour un rôle OPRIE — factorisé pour être réutilisable par le
 * chemin mono-call générique (runRoleWithWorkersAI) ET par le chemin batché du critic
 * (runCriticWithWorkersAI, 3F.3.3-X2-BATCH-R1) : introduit aucune logique de prompt ou de schéma,
 * les reçoit en paramètre — exactement le même principe que callGroqChatCompletion côté Groq.
 */
async function callWorkersAIChatCompletion({ systemPrompt, userMessage, schema, env, maxTokens }) {
  const result = await env.AI.run(PRIMARY_MODEL, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    response_format: { type: "json_schema", json_schema: schema },
    max_tokens: maxTokens,
    temperature: 0
  });
  return result?.response ?? result;
}

/**
 * Exécute un rôle OPRIE (analyst | critic | arbiter) sur Workers AI, avec exactement le même
 * prompt système et le même schéma JSON que n'importe quel autre provider — le registre
 * ROLE_DEFINITIONS (operational-request-core.js) est l'unique source de vérité pour les deux.
 *
 * 3F.3.3-X2-BATCH-R1 : pour le rôle critic, cette fonction reste le chemin MONOLITHIQUE hérité —
 * conservé intact comme référence/rollback explicite (section 4 du lot R1), plus le chemin par
 * défaut. Pour analyst et arbiter (mono-call par nature), c'est toujours ici le chemin réel.
 */
export async function runRoleWithWorkersAI(role, input, env) {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) throw new Error(`Rôle OPRIE inconnu : ${role}.`);
  const content = await callWorkersAIChatCompletion({
    systemPrompt: definition.systemPrompt,
    userMessage: definition.buildUserMessage(input),
    schema: resolveRoleSchema(definition, input),
    env,
    maxTokens: 2048
  });
  return definition.parseOutput(content);
}

// ---------------------------------------------------------------------------------------------
// 3F.3.3-X2-BATCH-R1 : chemin RUNTIME PAR DÉFAUT du rôle critic sur Workers AI — même orchestration
// provider-agnostique (runCriticBatchedPipeline) que côté Groq, aucune duplication d'architecture
// entre providers (section 2 du lot) : seul le transport (callWorkersAIChatCompletion) et les
// constantes de capacité, propres à ce provider, vivent ici.
//
// Aucun smoke réseau réel n'a jamais été exécuté contre Workers AI pour ce mécanisme (le seul smoke
// réel de ce lignage, X2-B, portait sur Groq) : input_budget/max_completion_units ci-dessous
// reprennent PAR PRUDENCE les valeurs validées côté Groq plutôt qu'une estimation Workers AI propre
// — à confirmer ou ajuster par un smoke Workers AI dédié avant tout GELÉ sur ce provider.
// ---------------------------------------------------------------------------------------------
const WORKERS_AI_CRITIC_CAPABILITY = Object.freeze({
  input_budget: 24400,
  tpm_budget: null,                    // non documenté/observé pour Workers AI à ce jour
  rpm_budget: null,
  global_max_completion_units: 2048,
  fixed_output_units: 20,
  per_target_output_units: 260,
  completion_safety_factor: 1.25,
  min_completion_units: 256,
  max_completion_units: 2048,
  per_target_input_units_fallback: 1767
});

function workersAiCriticBatchPlanCapability({ original_request, clarification_history, analyst_output }) {
  const fixedOverheadUnits = SUBSTITUTION_REVIEW_SYSTEM_PROMPT.length + JSON.stringify({
    original_request, clarification_history, analyst_output, question_review_targets: []
  }).length;
  return {
    fixedOverheadUnits,
    perTargetUnits: WORKERS_AI_CRITIC_CAPABILITY.per_target_input_units_fallback,
    maxUnitsPerBatch: WORKERS_AI_CRITIC_CAPABILITY.input_budget,
    unitsForTarget: (target) => JSON.stringify(target).length
  };
}

function workersAiCriticOutputCapability() {
  return {
    perIssueOutputUnits: WORKERS_AI_CRITIC_CAPABILITY.per_target_output_units,
    fixedOutputOverheadUnits: WORKERS_AI_CRITIC_CAPABILITY.fixed_output_units,
    safetyMarginRatio: WORKERS_AI_CRITIC_CAPABILITY.completion_safety_factor - 1,
    minOutputUnits: WORKERS_AI_CRITIC_CAPABILITY.min_completion_units,
    maxOutputUnits: WORKERS_AI_CRITIC_CAPABILITY.max_completion_units
  };
}

/** Chemin critic réel de production sur Workers AI — même contrat que runCriticWithGroq. */
export async function runCriticWithWorkersAI(input, env) {
  return runCriticBatchedPipeline(
    { ...input, capability: workersAiCriticBatchPlanCapability(input) },
    {
      executeGlobal: (globalInput) => callWorkersAIChatCompletion({
        systemPrompt: CRITIC_GLOBAL_SYSTEM_PROMPT,
        userMessage: makeCriticGlobalUserMessage(globalInput),
        schema: CRITIC_GLOBAL_JSON_SCHEMA,
        env,
        maxTokens: WORKERS_AI_CRITIC_CAPABILITY.global_max_completion_units
      }),
      executeBatch: (batchInput) => callWorkersAIChatCompletion({
        systemPrompt: SUBSTITUTION_REVIEW_SYSTEM_PROMPT,
        userMessage: makeSubstitutionReviewBatchUserMessage(batchInput),
        schema: buildSubstitutionBatchSchema(batchInput.issueIds),
        env,
        maxTokens: estimateSubstitutionBatchOutputUnits(batchInput.issueIds.length, workersAiCriticOutputCapability())
      })
    }
  );
}

function roleFromPathname(pathname) {
  const role = pathname.replace(/^\//, "");
  return OPRIE_ROLES.includes(role) ? role : null;
}

// 3F.3.3-X2-BATCH-R1 : même routage que côté Groq — critic vers le pipeline batché, analyst/arbiter
// inchangés.
function executeForRole(role) {
  return role === "critic"
    ? (input, roleEnv) => runCriticWithWorkersAI(input, roleEnv)
    : (input, roleEnv) => runRoleWithWorkersAI(role, input, roleEnv);
}

export default {
  fetch(request, env) {
    const role = roleFromPathname(new URL(request.url).pathname);
    if (role) return handleRoleRequest(request, env, { role, execute: executeForRole(role) });
    // Route historique /decision, strictement inchangée.
    return handleDecisionRequest(request, env, decideWithWorkersAI);
  }
};
