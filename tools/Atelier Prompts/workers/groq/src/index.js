import {
  DECISION_JSON_SCHEMA,
  DECISION_MODEL_PROMPT,
  handleDecisionRequest,
  makeDecisionUserMessage,
  parseDecisionCandidate,
  readBoundedText
} from "../../shared/decision-core.js";
import { ROLE_DEFINITIONS, OPRIE_ROLES, handleRoleRequest } from "../../shared/operational-request-core.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const MODEL = "openai/gpt-oss-20b";

/**
 * Appel Groq de bas niveau, partagé entre le Decision Provider legacy et les 3 rôles OPRIE.
 * N'introduit aucune logique de prompt ou de schéma : elle reçoit les deux en paramètre.
 */
async function callGroqChatCompletion({ systemPrompt, userMessage, schema, schemaName, env, maxCompletionTokens }) {
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
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema
          }
        },
        reasoning_format: "hidden",
        reasoning_effort: "low",
        temperature: 0,
        max_completion_tokens: maxCompletionTokens,
        stream: false
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  const raw = await readBoundedText(response);
  if (!response.ok) {
    let code = "unknown";
    let message = "Message Groq indisponible.";
    try {
      const error = JSON.parse(raw)?.error;
      code = String(error?.code || "unknown");
      message = String(error?.message || message);
    } catch {}
    const redact = (value) => value
      .replace(/Bearer\s+\S+/gi, "Bearer [EXPURGÉ]")
      .replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]+\b/g, "[EXPURGÉ]")
      .replace(/\s+/g, " ")
      .slice(0, 500);
    console.error({ event: "groq_api_error", status: response.status, code: redact(code), message: redact(message) });
    throw new Error(`Groq a répondu ${response.status}.`);
  }
  const envelope = JSON.parse(raw);
  return envelope?.choices?.[0]?.message?.content;
}

export async function decideWithGroq(input, env) {
  const content = await callGroqChatCompletion({
    systemPrompt: DECISION_MODEL_PROMPT,
    userMessage: makeDecisionUserMessage(input),
    schema: DECISION_JSON_SCHEMA,
    schemaName: "decision_provider",
    env,
    maxCompletionTokens: 512
  });
  return parseDecisionCandidate(content, input.demande);
}

/**
 * Exécute un rôle OPRIE (analyst | critic | arbiter) sur Groq, avec exactement le même prompt
 * système et le même schéma JSON que Workers AI — le registre ROLE_DEFINITIONS
 * (operational-request-core.js) est l'unique source de vérité pour les deux.
 */
export async function runRoleWithGroq(role, input, env) {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) throw new Error(`Rôle OPRIE inconnu : ${role}.`);
  const content = await callGroqChatCompletion({
    systemPrompt: definition.systemPrompt,
    userMessage: definition.buildUserMessage(input),
    schema: definition.schema,
    schemaName: `oprie_${role}`,
    env,
    maxCompletionTokens: 2048
  });
  return definition.parseOutput(content);
}

function roleFromPathname(pathname) {
  const role = pathname.replace(/^\//, "");
  return OPRIE_ROLES.includes(role) ? role : null;
}

export default {
  fetch(request, env) {
    if (!request.headers.get("Origin")) {
      return Response.json({ error: "origin_not_allowed" }, { status: 403 });
    }
    const role = roleFromPathname(new URL(request.url).pathname);
    if (role) return handleRoleRequest(request, env, { role, execute: (input, roleEnv) => runRoleWithGroq(role, input, roleEnv) });
    // Route historique /decision, strictement inchangée.
    return handleDecisionRequest(request, env, decideWithGroq);
  }
};
