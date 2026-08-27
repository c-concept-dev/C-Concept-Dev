import {
  DECISION_JSON_SCHEMA,
  DECISION_MODEL_PROMPT,
  handleDecisionRequest,
  makeDecisionUserMessage,
  parseDecisionCandidate,
  readBoundedText
} from "../../shared/decision-core.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

export async function decideWithGroq(input, env) {
  if (!env.GROQ_API_KEY) throw new Error("Secret GROQ_API_KEY absent.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: DECISION_MODEL_PROMPT },
          { role: "user", content: makeDecisionUserMessage(input) }
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_completion_tokens: 160,
        stream: false
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  const raw = await readBoundedText(response);
  if (!response.ok) throw new Error(`Groq a répondu ${response.status}.`);
  const envelope = JSON.parse(raw);
  return parseDecisionCandidate(envelope?.choices?.[0]?.message?.content);
}

export default {
  fetch(request, env) {
    return handleDecisionRequest(request, env, decideWithGroq);
  }
};
