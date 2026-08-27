import {
  DECISION_JSON_SCHEMA,
  DECISION_MODEL_PROMPT,
  handleDecisionRequest,
  makeDecisionUserMessage,
  parseDecisionCandidate
} from "../../shared/decision-core.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

export async function decideWithWorkersAI(input, env) {
  const result = await env.AI.run(MODEL, {
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

export default {
  fetch(request, env) {
    return handleDecisionRequest(request, env, decideWithWorkersAI);
  }
};
