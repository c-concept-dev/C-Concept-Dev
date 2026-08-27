import { validateDecisionInput } from "../../shared/decision-core.js";
import { decideWithWorkersAIModel, EVALUATION_MODELS } from "../../workers-ai/src/index.js";

const REQUEST_KEYS = ["input", "model"];

function validateEvaluationRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Requête d’évaluation invalide.");
  const keys = Object.keys(value).sort();
  if (keys.length !== REQUEST_KEYS.length || keys.some((key, index) => key !== REQUEST_KEYS[index])) throw new Error("Champs d’évaluation invalides.");
  if (!EVALUATION_MODELS.includes(value.model)) throw new Error("Modèle hors liste d’évaluation.");
  return { model: value.model, input: validateDecisionInput(value.input) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/evaluate" || request.method !== "POST") return Response.json({ error: "not_found" }, { status: 404 });
    const started = performance.now();
    try {
      const evaluation = validateEvaluationRequest(await request.json());
      const decision = await decideWithWorkersAIModel(evaluation.input, env, evaluation.model);
      return Response.json({ valid: true, model: evaluation.model, decision, latency_ms: Math.round(performance.now() - started) });
    } catch (error) {
      return Response.json({ valid: false, error: error instanceof Error ? error.message : "Erreur inconnue.", latency_ms: Math.round(performance.now() - started) });
    }
  }
};
