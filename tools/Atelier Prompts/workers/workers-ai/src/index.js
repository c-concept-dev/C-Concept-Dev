import {
  DECISION_JSON_SCHEMA,
  DECISION_MODEL_PROMPT,
  handleDecisionRequest,
  makeDecisionUserMessage,
  parseDecisionCandidate
} from "../../shared/decision-core.js";

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
  return parseDecisionCandidate(result?.response ?? result);
}

export function decideWithWorkersAI(input, env) {
  return decideWithWorkersAIModel(input, env, PRIMARY_MODEL);
}

export default {
  fetch(request, env) {
    return handleDecisionRequest(request, env, decideWithWorkersAI);
  }
};
