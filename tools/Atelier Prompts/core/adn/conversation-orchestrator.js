export const CONVERSATION_ORCHESTRATOR_VERSION = "1.0";

export const CONVERSATION_STATES = Object.freeze([
  "clarification_required",
  "execution_ready",
  "blocked"
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function words(value) {
  const stop = new Set([
    "avec", "avez", "cette", "dans", "des", "elle", "est", "etes", "les",
    "pour", "que", "quel", "quelle", "quelles", "quels", "qui", "souhaitez",
    "une", "vous", "votre", "vos"
  ]);
  return new Set(
    text(value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter((item) => item.length > 2 && !stop.has(item))
  );
}

export function conversationQuestionsSimilar(left, right) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return text(left).toLowerCase() === text(right).toLowerCase();
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / Math.min(a.size, b.size) >= 0.7;
}

function isRepeated(question, previousQuestions) {
  return list(previousQuestions).some((previous) => conversationQuestionsSimilar(previous, question));
}

function requestedRoute(requestedMode, semanticRoute) {
  if (requestedMode === "architecte") return "architecte";
  return semanticRoute === "architecte" ? "architecte" : "rapide";
}

/**
 * Autorité conversationnelle unique. Elle ne comprend pas la demande elle-même :
 * elle arbitre uniquement les primitives universelles déjà produites par le
 * Decision Provider ou l'Execution Readiness Gate.
 */
export function nextConversationAction({
  provider_result = null,
  readiness = null,
  previous_questions = [],
  requested_mode = "rapide",
  provider_available = true
} = {}) {
  const previous = list(previous_questions).map(text).filter(Boolean);
  const decision = provider_result?.decision || provider_result || null;

  if (readiness) {
    const question = text(readiness.question) || null;
    const repeated = Boolean(question && isRepeated(question, previous));
    if (readiness.state === "clarification_required" && question && !repeated) {
      return clone({
        version: CONVERSATION_ORCHESTRATOR_VERSION,
        state: "clarification_required",
        question,
        route: null,
        reason: text(readiness.reason) || "Une information non substituable reste nécessaire.",
        missing_count: Math.max(1, Number(readiness.blocking_missing_count || 0)),
        question_repeated: false,
        source: "readiness"
      });
    }
    if (readiness.state === "execution_ready") {
      return clone({
        version: CONVERSATION_ORCHESTRATOR_VERSION,
        state: "execution_ready",
        question: null,
        route: requestedRoute(requested_mode, "architecte"),
        reason: text(readiness.reason) || "Le contrat est prêt pour l'exécution.",
        missing_count: 0,
        question_repeated: false,
        source: "readiness"
      });
    }
    return clone({
      version: CONVERSATION_ORCHESTRATOR_VERSION,
      state: "blocked",
      question: null,
      route: null,
      reason: repeated
        ? "La clarification proposée répète une question déjà traitée ; aucune progression n'est démontrée."
        : (text(readiness.reason) || "Aucune progression fiable n'est possible sans nouvelle information exploitable."),
      missing_count: Math.max(0, Number(readiness.blocking_missing_count || 0)),
      question_repeated: repeated,
      source: "readiness"
    });
  }

  if (provider_available !== false && decision?.etat_demande === "clarification_necessaire") {
    const question = text(decision.question);
    const repeated = Boolean(question && isRepeated(question, previous));
    if (question && !repeated) {
      return clone({
        version: CONVERSATION_ORCHESTRATOR_VERSION,
        state: "clarification_required",
        question,
        route: null,
        reason: text(decision.raison_interne) || "Une information non substituable reste nécessaire.",
        missing_count: 1,
        question_repeated: false,
        source: "provider"
      });
    }
    return clone({
      version: CONVERSATION_ORCHESTRATOR_VERSION,
      state: "blocked",
      question: null,
      route: null,
      reason: "La clarification proposée répète une question déjà traitée ; aucune progression n'est démontrée.",
      missing_count: 1,
      question_repeated: repeated,
      source: "provider"
    });
  }

  if (provider_available !== false && decision?.etat_demande === "exploitable") {
    return clone({
      version: CONVERSATION_ORCHESTRATOR_VERSION,
      state: "execution_ready",
      question: null,
      route: requestedRoute(requested_mode, decision.route),
      reason: text(decision.raison_interne) || "Le contrat est prêt pour l'exécution.",
      missing_count: 0,
      question_repeated: false,
      source: "provider"
    });
  }

  // Une panne technique n'est ni une clarification ni une preuve de complexité.
  // Le fallback reste utilisable et proportionné ; le choix explicite Architecte
  // est toutefois conservé.
  return clone({
    version: CONVERSATION_ORCHESTRATOR_VERSION,
    state: "execution_ready",
    question: null,
    route: requested_mode === "architecte" ? "architecte" : "rapide",
    reason: "Le fournisseur sémantique est indisponible ; le parcours local proportionné reste utilisable.",
    missing_count: 0,
    question_repeated: false,
    source: "local-prudent"
  });
}

export function createConversationAuditEvent(action, {
  turn,
  readiness_before = "contractualization",
  answer_received = false,
  progress_detected = false
} = {}) {
  if (!action || !CONVERSATION_STATES.includes(action.state)) {
    throw new TypeError("Action conversationnelle invalide.");
  }
  return {
    turn: Math.max(1, Number(turn || 1)),
    readiness_before: text(readiness_before) || "contractualization",
    missing_count: Math.max(0, Number(action.missing_count || 0)),
    treatment: action.state,
    question_generated: Boolean(action.question),
    question_repeated: action.question_repeated === true,
    answer_received: answer_received === true,
    progress_detected: progress_detected === true,
    readiness_after: action.state,
    route: action.route || null
  };
}

export function validateConversationAuditEvent(event) {
  const keys = [
    "turn", "readiness_before", "missing_count", "treatment",
    "question_generated", "question_repeated", "answer_received",
    "progress_detected", "readiness_after", "route"
  ];
  if (!event || Object.keys(event).length !== keys.length || keys.some((key) => !(key in event))) {
    throw new TypeError("Trace conversationnelle incomplète.");
  }
  if (!CONVERSATION_STATES.includes(event.treatment) || !CONVERSATION_STATES.includes(event.readiness_after)) {
    throw new TypeError("État conversationnel invalide dans l'audit.");
  }
  if (event.route !== null && !["rapide", "architecte"].includes(event.route)) {
    throw new TypeError("Route conversationnelle invalide dans l'audit.");
  }
  return clone(event);
}
