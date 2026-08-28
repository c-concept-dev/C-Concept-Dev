export const ROUTING_ENGINE_VERSION = "1.0";

export const ROUTING_ENGINES = Object.freeze(["rapide", "architecte"]);

export const PREPARATION_SIGNAL_IDS = Object.freeze([
  "strategy_design",
  "dependent_components",
  "constraint_arbitration",
  "linked_scenarios",
  "architecture_coordination",
  "research_planning"
]);

const PREPARATION_SIGNAL_SET = new Set(PREPARATION_SIGNAL_IDS);
const ROUTE_SET = new Set(ROUTING_ENGINES);
const PROVIDER_SOURCES = new Set(["workers-ai", "groq", "local-prudent", "none", null]);
const CONFIDENCE = new Set(["high", "medium"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(items) {
  return [...new Set(list(items).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}

function assertAdnState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("ADN State requis pour le Routing Engine.");
  }
  if (!state.executability || !state.intent || !state.completeness || !state.compliance || !state.discipline) {
    throw new TypeError("ADN State incomplet pour le Routing Engine.");
  }
  if (!["exploitable", "clarification_necessaire"].includes(state.executability.state)) {
    throw new TypeError("État d'exécutabilité invalide pour le Routing Engine.");
  }
}

function normalizePreparationSignal(signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    throw new TypeError("Un signal de préparation doit être un objet.");
  }
  const id = text(signal.id);
  if (!PREPARATION_SIGNAL_SET.has(id)) {
    throw new TypeError(`Signal de préparation inconnu : ${id || "(vide)"}.`);
  }
  return {
    id,
    needed: signal.needed !== false,
    reason: text(signal.reason) || "Besoin de préparation identifié.",
    source: text(signal.source) || "runtime",
    source_ids: uniqueStrings(signal.source_ids)
  };
}

function normalizeProviderDecision(providerDecision) {
  if (!providerDecision) return null;
  if (typeof providerDecision !== "object" || Array.isArray(providerDecision)) {
    throw new TypeError("Décision provider invalide.");
  }
  const state = providerDecision.etat_demande;
  const route = providerDecision.route ?? null;
  const confidence = providerDecision.confiance === "haute" || providerDecision.confiance === "high" ? "high" : "medium";
  if (!["exploitable", "clarification_necessaire"].includes(state)) {
    throw new TypeError("État provider invalide.");
  }
  if (state === "clarification_necessaire" && route !== null) {
    throw new TypeError("Une clarification provider exige route=null.");
  }
  if (state === "exploitable" && !ROUTE_SET.has(route)) {
    throw new TypeError("Une décision provider exploitable exige une route.");
  }
  return {
    etat_demande: state,
    route,
    confidence,
    reason: text(providerDecision.raison_interne)
  };
}

function preparationEvidence(signals) {
  return signals.filter((signal) => signal.needed).map((signal) => ({
    id: signal.id,
    reason: signal.reason,
    source: signal.source,
    source_ids: clone(signal.source_ids)
  }));
}

function routeReason(route, mode) {
  if (route === "architecte") {
    return mode === "provider"
      ? "Le provider a identifié un besoin réel de préparation avant exécution."
      : "La demande exploitable requiert une préparation préalable substantielle : stratégie, dépendances, arbitrages, scénarios liés, architecture ou planification de recherche.";
  }
  return mode === "provider"
    ? "Le provider a identifié une exécution directe sans préparation structurelle préalable."
    : "Aucun besoin de préparation substantielle n'est établi ; l'exécution directe est proportionnée.";
}

/**
 * Routing Engine universel.
 *
 * Principes :
 * - clarification => aucune route ;
 * - un succès provider valide est conservé comme signal sémantique autoritaire du runtime actuel ;
 * - une indisponibilité provider n'est JAMAIS interprétée comme de la complexité ;
 * - en fallback, Architecte n'est choisi que si un besoin de préparation est positivement établi ;
 * - longueur, domaine, nombre de sections, quantité ou nombre de verrous ne suffisent jamais à eux seuls.
 */
export function routeExecution(state, {
  provider_decision = null,
  provider_source = null,
  provider_available = provider_decision !== null,
  preparation_signals = []
} = {}) {
  assertAdnState(state);

  const source = provider_source ?? null;
  if (!PROVIDER_SOURCES.has(source)) {
    throw new TypeError(`Source provider inconnue : ${source}.`);
  }

  const provider = normalizeProviderDecision(provider_decision);
  const signals = list(preparation_signals).map(normalizePreparationSignal);
  const activePreparation = preparationEvidence(signals);

  if (state.executability.state === "clarification_necessaire") {
    return clone({
      version: ROUTING_ENGINE_VERSION,
      request_id: text(state.request_id) || null,
      route: null,
      confidence: state.executability.confidence === "high" ? "high" : "medium",
      mode: "clarification",
      reason: "La demande n'est pas encore exploitable ; aucune route d'exécution ne doit être choisie.",
      provider: {
        source,
        available: provider_available === true,
        decision_used: false
      },
      preparation: {
        required: false,
        signals: activePreparation
      },
      invariants: {
        provider_failure_is_not_complexity: true,
        length_is_not_complexity: true,
        domain_is_not_route: true,
        lock_count_is_not_route: true
      }
    });
  }

  // Un provider ayant effectivement rendu une décision exploitable reste la source
  // sémantique du runtime courant. 3E ne réécrit pas encore le provider.
  if (provider_available === true && provider && provider.etat_demande === "exploitable") {
    return clone({
      version: ROUTING_ENGINE_VERSION,
      request_id: text(state.request_id) || null,
      route: provider.route,
      confidence: provider.confidence,
      mode: "provider",
      reason: routeReason(provider.route, "provider"),
      provider: {
        source,
        available: true,
        decision_used: true
      },
      preparation: {
        required: provider.route === "architecte",
        signals: activePreparation
      },
      invariants: {
        provider_failure_is_not_complexity: true,
        length_is_not_complexity: true,
        domain_is_not_route: true,
        lock_count_is_not_route: true
      }
    });
  }

  // Fallback proportionné : l'échec technique du classifieur ne vaut pas preuve de
  // complexité. Architecte exige un signal positif de préparation.
  const needsPreparation = activePreparation.length > 0;
  const route = needsPreparation ? "architecte" : "rapide";

  return clone({
    version: ROUTING_ENGINE_VERSION,
    request_id: text(state.request_id) || null,
    route,
    confidence: needsPreparation ? "medium" : "medium",
    mode: "structural-fallback",
    reason: routeReason(route, "structural-fallback"),
    provider: {
      source,
      available: false,
      decision_used: false
    },
    preparation: {
      required: needsPreparation,
      signals: activePreparation
    },
    invariants: {
      provider_failure_is_not_complexity: true,
      length_is_not_complexity: true,
      domain_is_not_route: true,
      lock_count_is_not_route: true
    }
  });
}

export function validateRoutingDecision(decision) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    throw new TypeError("Décision de routage requise.");
  }
  if (decision.version !== ROUTING_ENGINE_VERSION) throw new TypeError("Version Routing Engine incompatible.");
  if (decision.route !== null && !ROUTE_SET.has(decision.route)) throw new TypeError("Route universelle invalide.");
  if (!CONFIDENCE.has(decision.confidence)) throw new TypeError("Confiance de routage invalide.");
  if (!["clarification", "provider", "structural-fallback"].includes(decision.mode)) throw new TypeError("Mode de routage invalide.");
  if (decision.mode === "clarification" && decision.route !== null) throw new TypeError("Une clarification ne doit pas router.");
  if (decision.mode === "structural-fallback" && decision.provider.available !== false) throw new TypeError("Le fallback structurel exige un provider indisponible.");
  if (decision.route === "architecte" && decision.mode === "structural-fallback" && decision.preparation.signals.length === 0) {
    throw new TypeError("Architecte en fallback exige une preuve positive de préparation.");
  }
  if (decision.invariants.provider_failure_is_not_complexity !== true
      || decision.invariants.domain_is_not_route !== true
      || decision.invariants.length_is_not_complexity !== true
      || decision.invariants.lock_count_is_not_route !== true) {
    throw new TypeError("Les invariants universels de routage doivent rester actifs.");
  }
  return clone(decision);
}

export function createRoutingAuditView(decision) {
  validateRoutingDecision(decision);
  return {
    version: decision.version,
    request_id: decision.request_id,
    route: decision.route,
    confidence: decision.confidence,
    mode: decision.mode,
    provider: clone(decision.provider),
    preparation_required: decision.preparation.required,
    preparation_signal_ids: decision.preparation.signals.map((signal) => signal.id),
    invariants: clone(decision.invariants)
  };
}
