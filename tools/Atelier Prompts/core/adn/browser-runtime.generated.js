/* GENERATED — LOT 10G.3B.3F.1
 * source-sha256: 0420937495c3db4ad8b44c2b9f8f10b6c27f7d235937e7617c876e8fbe563b2b
 * Ne pas modifier manuellement. Régénérer avec tools/build-adn-browser-runtime.mjs
 */
(function(global){
'use strict';
const ADN=(()=>{
const ADN_STATE_VERSION = "1.0";

const ADN_PROPERTY_IDS = Object.freeze([
  "intentionality",
  "executability",
  "discipline",
  "completeness",
  "compliance"
]);

const ADN_TECHNIQUE_IDS = Object.freeze([
  "prior_contract",
  "evasion_blocking",
  "no_unnecessary_questions",
  "strict_format",
  "forced_start",
  "explicit_forbidden",
  "absolute_obligations",
  "quantified_rules",
  "final_injunction"
]);

const ADN_ETHIC_IDS = Object.freeze([
  "user_autonomy_preserved",
  "factual_integrity_required",
  "critical_invention_forbidden",
  "proportionality_required",
  "functional_transparency_required",
  "safety_overrides_execution",
  "material_rights_respected",
  "reversibility_preserved",
  "human_efficiency_required"
]);

const STATES = new Set(["exploitable", "clarification_necessaire"]);
const ROUTES = new Set(["rapide", "architecte", null]);
const CONFIDENCE = Object.freeze({ haute: "high", moyenne: "medium", high: "high", medium: "medium" });

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function uniqueStrings(items) {
  const seen = new Set();
  const result = [];
  for (const item of list(items)) {
    const value = text(typeof item === "string" ? item : item?.text || item?.contenu || item?.information);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function numbered(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function simpleHash(input) {
  let hash = 2166136261;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeConstraints(items) {
  return uniqueStrings(items).map((value, index) => ({
    id: numbered("REQ", index),
    text: value,
    source: "user"
  }));
}

function normalizeEvidenceItem(item, index, source, status) {
  const value = typeof item === "string" ? { text: item } : item || {};
  return {
    id: text(value.id) || numbered(source === "material" ? "MAT" : source === "deduction" ? "DED" : "FACT", index),
    text: text(value.text || value.contenu),
    source,
    status
  };
}

function normalizeEvidence(input = {}) {
  return {
    user_facts: list(input.user_facts).map((item, index) => normalizeEvidenceItem(item, index, "user", "fact")).filter((item) => item.text),
    material_facts: list(input.material_facts).map((item, index) => normalizeEvidenceItem(item, index, "material", "fact")).filter((item) => item.text),
    deductions: list(input.deductions).map((item, index) => normalizeEvidenceItem(item, index, "deduction", "deduction")).filter((item) => item.text),
    external_knowledge_needed: input.external_knowledge_needed === true,
    freshness_needed: input.freshness_needed === true
  };
}

function normalizeMissing(items, prefix, status) {
  return uniqueStrings(items).map((value, index) => ({ id: numbered(prefix, index), text: value, status }));
}

function normalizeAssumptions(items) {
  return uniqueStrings(items).map((value, index) => ({
    id: numbered("ASM", index),
    text: value,
    source: "deduction",
    status: "assumption"
  }));
}

function normalizeObligations(items, constraints) {
  const candidates = [
    ...constraints.map((constraint) => ({ text: constraint.text, source: "user", mandatory: true, verifiable: true, constraint_id: constraint.id })),
    ...list(items)
  ];
  const seen = new Set();
  const result = [];
  for (const item of candidates) {
    const value = typeof item === "string" ? { text: item } : item || {};
    const body = text(value.text || value.contenu);
    const source = ["user", "material", "system"].includes(value.source) ? value.source : "user";
    const key = `${source}|${body}`;
    if (!body || seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: numbered("OBL", result.length),
      text: body,
      source,
      mandatory: value.mandatory !== false,
      verifiable: value.verifiable !== false,
      constraint_id: text(value.constraint_id) || constraints.find((constraint) => constraint.text === body)?.id || null
    });
  }
  return result;
}

function resolveObligationIds(ids, obligations) {
  const result = [];
  for (const id of list(ids)) {
    const found = obligations.find((item) => item.id === id || item.constraint_id === id);
    if (found && !result.includes(found.id)) result.push(found.id);
  }
  return result;
}

function normalizeQuantities(items, obligations) {
  return list(items).map((item, index) => {
    const value = item || {};
    const exact = Number.isInteger(value.exact) ? value.exact : null;
    const min = exact === null && Number.isInteger(value.min) ? value.min : null;
    const max = exact === null && Number.isInteger(value.max) ? value.max : null;
    return {
      id: text(value.id) || numbered("Q", index),
      target: text(value.target) || null,
      unit: text(value.unit || value.unite) || null,
      exact,
      min,
      max,
      obligation_ids: resolveObligationIds(value.obligation_ids, obligations)
    };
  });
}

function normalizeOutput(input = {}) {
  return {
    format: text(input.format) || null,
    structure: uniqueStrings(input.structure),
    opening: text(input.opening || input.amorce) || null,
    closing: text(input.closing || input.cloture) || null,
    length_policy: text(input.length_policy || input.longueur) || null
  };
}

function normalizeChecks(items, obligations) {
  return list(items).map((item, index) => {
    const value = typeof item === "string" ? { rule: item } : item || {};
    return {
      id: text(value.id) || numbered("CHK", index),
      type: ["deterministic", "heuristic", "semantic", "manual"].includes(value.type) ? value.type : "manual",
      target: text(value.target) || "deliverable",
      rule: text(value.rule || value.text || value.nom),
      blocking: value.blocking === true,
      obligation_ids: resolveObligationIds(value.obligation_ids, obligations)
    };
  }).filter((item) => item.rule);
}

function determineIntentStatus({ originalRequest, objective, deliverable, constraints }) {
  if (!originalRequest) return "invalid";
  if (objective && deliverable) return "resolved";
  if (objective || deliverable || constraints.length) return "preserved_partial";
  return "preserved_raw";
}

function derivePropertyStates(state) {
  const exploitable = state.executability.state === "exploitable";
  const intentionality = state.intent.status === "invalid" ? "fail" : "pass";
  const executability = state.executability.state === "clarification_necessaire" ? "blocked" : "pass";
  const discipline = exploitable
    && state.discipline.execute_now
    && state.discipline.comfort_questions_forbidden
    && state.discipline.final_injunction_active ? "pass" : (exploitable ? "fail" : "not_applicable");
  const completeness = state.completeness.obligations.every((item) => item.mandatory !== true || Boolean(item.text)) ? "pass" : "fail";
  const compliance = state.compliance.controls_ready ? "pass" : "partial";
  return { intentionality, executability, discipline, completeness, compliance };
}

function deriveTechniques(state) {
  const exploitable = state.executability.state === "exploitable";
  const hasFormatContract = Boolean(state.compliance.output.format || state.compliance.output.structure.length || state.compliance.output.opening || state.compliance.output.closing);
  const hasForbidden = state.discipline.forbidden_behaviors.length > 0;
  const hasQuantities = state.completeness.quantities.length > 0;
  return {
    prior_contract: exploitable,
    evasion_blocking: exploitable && state.discipline.evasion_blocked,
    no_unnecessary_questions: exploitable ? state.discipline.comfort_questions_forbidden : true,
    strict_format: hasFormatContract,
    forced_start: Boolean(state.compliance.output.opening),
    explicit_forbidden: hasForbidden,
    absolute_obligations: state.completeness.obligations.some((item) => item.mandatory === true),
    quantified_rules: hasQuantities,
    final_injunction: exploitable && state.discipline.final_injunction_active && state.discipline.execute_now
  };
}

function validateDecision(decision = {}) {
  const state = decision.etat_demande;
  const route = decision.route ?? null;
  if (!STATES.has(state)) throw new TypeError("État d’exécutabilité ADN invalide.");
  if (!ROUTES.has(route)) throw new TypeError("Route ADN invalide.");
  if (state === "clarification_necessaire" && route !== null) throw new TypeError("Une clarification ADN exige route=null.");
  if (state === "exploitable" && !["rapide", "architecte"].includes(route)) throw new TypeError("Une demande exploitable exige une route.");
  return {
    etat_demande: state,
    route,
    confiance: CONFIDENCE[decision.confiance] || "medium",
    raison_interne: text(decision.raison_interne),
    question: decision.question === null ? null : text(decision.question) || null
  };
}

function buildAdnState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Une entrée ADN runtime est requise.");
  const originalRequest = text(input.original_request || input.demande);
  if (!originalRequest) throw new TypeError("La demande originale est obligatoire.");

  const decision = validateDecision(input.decision || {});
  const constraints = normalizeConstraints(input.intent?.explicit_constraints || input.constraints);
  const objective = text(input.intent?.objective);
  const deliverable = text(input.intent?.deliverable) || null;
  const recipient = text(input.intent?.recipient) || null;
  const obligations = normalizeObligations(input.obligations, constraints);
  const quantities = normalizeQuantities(input.quantities, obligations);
  const evidence = normalizeEvidence(input.evidence);
  const criticalMissingSource = list(input.executability?.critical_missing).length
    ? input.executability.critical_missing
    : (decision.etat_demande === "clarification_necessaire" && decision.question ? [decision.question] : []);
  const criticalMissing = normalizeMissing(criticalMissingSource, "MISS", "missing");
  const substitutableMissing = normalizeMissing(input.executability?.substitutable_missing, "SUB", "substitutable");
  const assumptions = normalizeAssumptions(input.assumptions);
  const output = normalizeOutput(input.output);
  const checks = normalizeChecks(input.checks, obligations);
  const exploitable = decision.etat_demande === "exploitable";
  const forbiddenBehaviors = uniqueStrings(input.discipline?.forbidden_behaviors || [
    ...(exploitable ? ["preambule_parasite", "promesse_sans_execution", "question_de_confort", "report_evitable"] : [])
  ]);

  const state = {
    version: ADN_STATE_VERSION,
    request_id: text(input.request_id) || `adn-${simpleHash(originalRequest)}`,
    original_request: originalRequest,
    intent: {
      objective: objective || originalRequest,
      deliverable,
      recipient,
      explicit_constraints: constraints,
      status: determineIntentStatus({ originalRequest, objective, deliverable, constraints }),
      preserved: true
    },
    evidence,
    executability: {
      state: decision.etat_demande,
      confidence: decision.confiance,
      critical_missing: criticalMissing,
      substitutable_missing: substitutableMissing,
      clarification_question: decision.etat_demande === "clarification_necessaire" ? decision.question : null
    },
    assumptions,
    discipline: {
      execute_now: exploitable,
      comfort_questions_forbidden: exploitable,
      meta_discussion_forbidden: exploitable,
      complete_delivery_required: exploitable,
      evasion_blocked: exploitable,
      final_injunction_active: exploitable,
      forbidden_behaviors: forbiddenBehaviors
    },
    completeness: {
      obligations,
      quantities,
      coverage_target: obligations.length ? "100%" : null
    },
    compliance: {
      output,
      checks,
      controls_ready: checks.length > 0 || Boolean(output.format || output.structure.length || output.opening || output.closing)
    },
    routing: {
      engine: decision.route,
      reason: decision.raison_interne,
      confidence: decision.confiance
    },
    ethics: Object.fromEntries(ADN_ETHIC_IDS.map((id) => [id, true])),
    properties: null,
    techniques: null
  };

  state.properties = derivePropertyStates(state);
  state.techniques = deriveTechniques(state);
  validateAdnState(state);
  return clone(state);
}

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function exactKeys(value, keys, path) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${path} doit être un objet.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${path} contient des champs inattendus ou manquants.`);
}

function validateAdnState(state) {
  exactKeys(state, ["version","request_id","original_request","intent","evidence","executability","assumptions","discipline","completeness","compliance","routing","ethics","properties","techniques"], "ADNState");
  assert(state.version === ADN_STATE_VERSION, "Version ADNState incompatible.");
  assert(text(state.request_id), "request_id ADN obligatoire.");
  assert(text(state.original_request), "La demande originale doit être conservée.");
  assert(state.intent.preserved === true, "L’intention originale doit être préservée.");
  assert(STATES.has(state.executability.state), "État d’exécutabilité invalide.");
  assert(["high", "medium"].includes(state.executability.confidence), "Confiance d’exécutabilité invalide.");
  const exploitable = state.executability.state === "exploitable";
  assert(exploitable === state.discipline.execute_now, "execute_now doit suivre exactement l’exploitabilité.");
  assert(exploitable === state.discipline.final_injunction_active, "La technique 9 doit suivre exactement l’exploitabilité.");
  assert(exploitable === state.discipline.comfort_questions_forbidden, "L’interdiction de question de confort doit suivre l’exploitabilité.");
  assert(exploitable ? ["rapide", "architecte"].includes(state.routing.engine) : state.routing.engine === null, "Route incohérente avec l’exploitabilité.");
  for (const item of state.evidence.user_facts) assert(item.status === "fact" && item.source === "user", "Fait utilisateur mal classé.");
  for (const item of state.evidence.material_facts) assert(item.status === "fact" && item.source === "material", "Fait matériau mal classé.");
  for (const item of state.evidence.deductions) assert(item.status === "deduction", "Une déduction doit rester étiquetée.");
  for (const item of state.assumptions) assert(item.status === "assumption", "Une hypothèse doit rester étiquetée.");
  for (const item of state.executability.critical_missing) assert(item.status === "missing", "Un manque critique doit rester absent.");
  for (const quantity of state.completeness.quantities) {
    assert(quantity.unit || quantity.target, "Une quantité doit avoir une unité ou une cible.");
    assert(quantity.exact !== null || quantity.min !== null || quantity.max !== null, "Une quantité doit porter une borne.");
  }
  for (const key of ADN_ETHIC_IDS) assert(state.ethics[key] === true, `Invariant éthique ${key} non désactivable.`);
  assert(JSON.stringify(state.properties) === JSON.stringify(derivePropertyStates(state)), "Les cinq propriétés doivent être purement dérivées.");
  assert(JSON.stringify(state.techniques) === JSON.stringify(deriveTechniques(state)), "Les neuf techniques doivent être purement dérivées.");
  return clone(state);
}

function adnStateToExecutionContractSnapshot(state, extras = {}) {
  validateAdnState(state);
  const snapshot = {
    request_id: state.request_id,
    original_request: state.original_request,
    intent: {
      objective: state.intent.objective,
      deliverable: state.intent.deliverable,
      recipient: state.intent.recipient,
      explicit_constraints: state.intent.explicit_constraints.map((item) => item.text)
    },
    evidence: clone(state.evidence),
    executability: {
      state: state.executability.state,
      confidence: state.executability.confidence,
      critical_missing: state.executability.critical_missing.map((item) => item.text),
      substitutable_missing: state.executability.substitutable_missing.map((item) => item.text)
    },
    assumptions: state.assumptions.map((item) => item.text),
    obligations: state.completeness.obligations.map((item) => ({
      text: item.text,
      source: item.source,
      mandatory: item.mandatory,
      verifiable: item.verifiable,
      constraint_id: item.constraint_id
    })),
    quantities: clone(state.completeness.quantities),
    output: clone(state.compliance.output),
    checks: clone(state.compliance.checks),
    decision: {
      etat_demande: state.executability.state,
      route: state.routing.engine,
      confiance: state.executability.confidence === "high" ? "haute" : "moyenne",
      raison_interne: state.routing.reason,
      question: state.executability.state === "clarification_necessaire" ? state.executability.clarification_question : null
    },
    ...clone(extras)
  };
  return snapshot;
}

function createAdnAuditView(state) {
  validateAdnState(state);
  return {
    version: state.version,
    request_id: state.request_id,
    properties: clone(state.properties),
    techniques: clone(state.techniques),
    executability: {
      state: state.executability.state,
      confidence: state.executability.confidence,
      critical_missing_count: state.executability.critical_missing.length,
      substitutable_missing_count: state.executability.substitutable_missing.length
    },
    discipline: {
      execute_now: state.discipline.execute_now,
      final_injunction_active: state.discipline.final_injunction_active
    },
    completeness: {
      obligations_count: state.completeness.obligations.length,
      quantities_count: state.completeness.quantities.length
    },
    compliance: {
      checks_count: state.compliance.checks.length,
      controls_ready: state.compliance.controls_ready
    },
    routing: clone(state.routing),
    ethics: clone(state.ethics)
  };
}

return {ADN_STATE_VERSION,ADN_PROPERTY_IDS,ADN_TECHNIQUE_IDS,ADN_ETHIC_IDS,buildAdnState,validateAdnState,adnStateToExecutionContractSnapshot,createAdnAuditView};
})();
const LOCKS=(()=>{
const ADAPTIVE_LOCK_SELECTOR_VERSION = "1.0";

const ADAPTIVE_LOCK_IDS = Object.freeze([
  "role",
  "recipient",
  "data",
  "provenance",
  "scope",
  "plan",
  "format",
  "volume",
  "opening_closing",
  "forbidden",
  "assumptions",
  "length",
  "final_check"
]);

const LOCK_SET = new Set(ADAPTIVE_LOCK_IDS);
const PRIORITIES = new Set(["mandatory", "useful"]);
const SOURCES = new Set(["user", "material", "system", "runtime"]);

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

function normalizeSignal(signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    throw new TypeError("Un signal de verrou doit être un objet.");
  }
  const id = text(signal.id || signal.lock_id);
  if (!LOCK_SET.has(id)) throw new TypeError(`Verrou adaptatif inconnu : ${id || "(vide)"}.`);
  return {
    id,
    needed: signal.needed !== false,
    reason: text(signal.reason),
    priority: PRIORITIES.has(signal.priority) ? signal.priority : "useful",
    source: SOURCES.has(signal.source) ? signal.source : "runtime",
    source_ids: uniqueStrings(signal.source_ids),
    associated_checks: uniqueStrings(signal.associated_checks)
  };
}

function assertAdnStateShape(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new TypeError("ADN State requis pour sélectionner les verrous.");
  if (!state.intent || !state.executability || !state.discipline || !state.completeness || !state.compliance || !state.evidence) {
    throw new TypeError("ADN State incomplet pour la sélection adaptative.");
  }
}

function ids(items) {
  return uniqueStrings(list(items).map((item) => item?.id));
}

function quantitySourceIds(state) {
  const result = [];
  for (const quantity of list(state.completeness?.quantities)) {
    if (quantity?.id) result.push(quantity.id);
    result.push(...list(quantity?.obligation_ids));
  }
  return uniqueStrings(result);
}

function checksForObligations(state, obligationIds) {
  const wanted = new Set(obligationIds);
  return uniqueStrings(list(state.compliance?.checks)
    .filter((check) => list(check?.obligation_ids).some((id) => wanted.has(id)))
    .map((check) => check?.id));
}

function deterministicCandidates(state) {
  const candidates = [];
  const exploitable = state.executability.state === "exploitable";
  const output = state.compliance.output || {};

  // Le rôle reste proportionné : il devient utile seulement lorsqu'un livrable explicite existe.
  if (text(state.intent.deliverable)) {
    candidates.push({
      id: "role",
      reason: "Un livrable explicite est identifié ; un cadrage fonctionnel aide à orienter la production vers ce livrable.",
      priority: "useful",
      source: "runtime",
      source_ids: [],
      associated_checks: []
    });
  }

  if (text(state.intent.recipient)) {
    candidates.push({
      id: "recipient",
      reason: "Le destinataire est explicitement connu et peut matériellement influencer le registre ou la technicité.",
      priority: "mandatory",
      source: "user",
      source_ids: [],
      associated_checks: []
    });
  }

  const materialIds = ids(state.evidence.material_facts);
  if (materialIds.length) {
    candidates.push({
      id: "data",
      reason: "Du matériau fourni doit rester distingué des instructions.",
      priority: "mandatory",
      source: "material",
      source_ids: materialIds,
      associated_checks: []
    });
  }

  const provenanceIds = uniqueStrings([
    ...materialIds,
    ...ids(state.evidence.deductions),
    ...ids(state.evidence.user_facts)
  ]);
  if (materialIds.length || state.evidence.external_knowledge_needed === true || state.evidence.freshness_needed === true || ids(state.evidence.deductions).length) {
    candidates.push({
      id: "provenance",
      reason: "Le statut ou l'origine des informations influence la fiabilité ou la conduite de l'exécution.",
      priority: "mandatory",
      source: "runtime",
      source_ids: provenanceIds,
      associated_checks: []
    });
  }

  if (list(output.structure).length) {
    candidates.push({
      id: "plan",
      reason: "Une structure de sortie explicite doit être préservée.",
      priority: "mandatory",
      source: "runtime",
      source_ids: [],
      associated_checks: []
    });
  }

  if (text(output.format)) {
    candidates.push({
      id: "format",
      reason: "Un format de sortie explicite constitue une contrainte opposable.",
      priority: "mandatory",
      source: "runtime",
      source_ids: [],
      associated_checks: []
    });
  }

  const quantityIds = quantitySourceIds(state);
  if (list(state.completeness.quantities).length) {
    candidates.push({
      id: "volume",
      reason: "Une ou plusieurs contraintes quantitatives doivent être rendues vérifiables.",
      priority: "mandatory",
      source: "runtime",
      source_ids: quantityIds,
      associated_checks: checksForObligations(state, quantityIds)
    });
  }

  if (text(output.opening) || text(output.closing)) {
    candidates.push({
      id: "opening_closing",
      reason: "Une amorce ou une clôture explicite borne le livrable.",
      priority: "mandatory",
      source: "runtime",
      source_ids: [],
      associated_checks: []
    });
  }

  if (exploitable && list(state.discipline.forbidden_behaviors).length) {
    candidates.push({
      id: "forbidden",
      reason: "Des comportements parasites sont explicitement interdits pendant l'exécution.",
      priority: "mandatory",
      source: "system",
      source_ids: [],
      associated_checks: []
    });
  }

  const assumptionIds = uniqueStrings([
    ...ids(state.assumptions),
    ...ids(state.executability.substitutable_missing)
  ]);
  if (assumptionIds.length) {
    candidates.push({
      id: "assumptions",
      reason: "Des hypothèses ou informations substituables doivent rester explicites sans devenir des faits.",
      priority: "mandatory",
      source: "runtime",
      source_ids: assumptionIds,
      associated_checks: []
    });
  }

  if (text(output.length_policy)) {
    candidates.push({
      id: "length",
      reason: "Une politique de longueur ou de reprise est explicitement définie.",
      priority: "mandatory",
      source: "runtime",
      source_ids: [],
      associated_checks: []
    });
  }

  if (exploitable) {
    candidates.push({
      id: "final_check",
      reason: "Tout livrable exécutable doit être contrôlé avant livraison conformément à l'ADN Atelier.",
      priority: "mandatory",
      source: "system",
      source_ids: [],
      associated_checks: ids(state.compliance.checks)
    });
  }

  return candidates;
}

function mergeCandidate(map, candidate, origin) {
  const previous = map.get(candidate.id);
  const normalized = {
    id: candidate.id,
    reason: text(candidate.reason) || "Risque structurel identifié par le sélecteur adaptatif.",
    priority: PRIORITIES.has(candidate.priority) ? candidate.priority : "useful",
    source: SOURCES.has(candidate.source) ? candidate.source : "runtime",
    source_ids: uniqueStrings(candidate.source_ids),
    associated_checks: uniqueStrings(candidate.associated_checks),
    active: true,
    origins: [origin]
  };
  if (!previous) {
    map.set(candidate.id, normalized);
    return;
  }
  previous.reason = previous.reason === normalized.reason ? previous.reason : `${previous.reason} ${normalized.reason}`.trim();
  previous.priority = previous.priority === "mandatory" || normalized.priority === "mandatory" ? "mandatory" : "useful";
  previous.source = previous.source === normalized.source ? previous.source : "runtime";
  previous.source_ids = uniqueStrings([...previous.source_ids, ...normalized.source_ids]);
  previous.associated_checks = uniqueStrings([...previous.associated_checks, ...normalized.associated_checks]);
  previous.origins = uniqueStrings([...previous.origins, origin]);
}

/**
 * Sélectionne les verrous à partir des propriétés structurelles de l'ADN State.
 * `semantic_signals` est une interface générique optionnelle pour les besoins
 * non déductibles de façon déterministe (ex. scope). Aucun domaine métier n'est requis.
 */
function selectAdaptiveLocks(state, { semantic_signals = [] } = {}) {
  assertAdnStateShape(state);
  const selected = new Map();

  for (const candidate of deterministicCandidates(state)) {
    mergeCandidate(selected, candidate, "deterministic");
  }

  const normalizedSignals = list(semantic_signals).map(normalizeSignal);
  for (const signal of normalizedSignals) {
    if (!signal.needed) continue;
    mergeCandidate(selected, signal, "semantic_signal");
  }

  const locks = ADAPTIVE_LOCK_IDS.filter((id) => selected.has(id)).map((id) => selected.get(id));
  const selectedSet = new Set(locks.map((lock) => lock.id));
  const decisions = ADAPTIVE_LOCK_IDS.map((id) => ({
    id,
    selected: selectedSet.has(id),
    origins: selected.get(id)?.origins || [],
    reason: selected.get(id)?.reason || "Aucun besoin structurel ou signal sémantique n'impose ce verrou dans l'état courant."
  }));

  return clone({
    version: ADAPTIVE_LOCK_SELECTOR_VERSION,
    request_id: text(state.request_id) || null,
    locks,
    decisions,
    metrics: {
      selected_count: locks.length,
      available_count: ADAPTIVE_LOCK_IDS.length,
      proportionality_ratio: Number((locks.length / ADAPTIVE_LOCK_IDS.length).toFixed(4))
    }
  });
}

function validateAdaptiveLockSelection(selection) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new TypeError("Sélection adaptative requise.");
  if (selection.version !== ADAPTIVE_LOCK_SELECTOR_VERSION) throw new TypeError("Version Adaptive Lock Selector incompatible.");
  const locks = list(selection.locks);
  const seen = new Set();
  for (const lock of locks) {
    if (!LOCK_SET.has(lock?.id)) throw new TypeError(`Verrou adaptatif inconnu : ${lock?.id}.`);
    if (seen.has(lock.id)) throw new TypeError(`Verrou dupliqué : ${lock.id}.`);
    seen.add(lock.id);
    if (!text(lock.reason)) throw new TypeError(`Le verrou ${lock.id} doit être justifié.`);
    if (!PRIORITIES.has(lock.priority)) throw new TypeError(`Priorité invalide pour ${lock.id}.`);
    if (!SOURCES.has(lock.source)) throw new TypeError(`Source invalide pour ${lock.id}.`);
    if (lock.active !== true) throw new TypeError(`Un verrou sélectionné doit être actif : ${lock.id}.`);
  }
  if (list(selection.decisions).length !== ADAPTIVE_LOCK_IDS.length) throw new TypeError("Les 13 décisions de verrou doivent être auditables.");
  return clone(selection);
}

function applyAdaptiveLocksToExecutionSnapshot(state, selectorOptions = {}, snapshotExtras = {}) {
  const selection = selectAdaptiveLocks(state, selectorOptions);
  validateAdaptiveLockSelection(selection);
  return {
    ...clone(snapshotExtras),
    locks: selection.locks.map(({ origins, ...lock }) => clone(lock)),
    lock_selection_audit: clone(selection)
  };
}

function createAdaptiveLockAuditView(selection) {
  validateAdaptiveLockSelection(selection);
  return {
    version: selection.version,
    request_id: selection.request_id,
    selected_ids: selection.locks.map((lock) => lock.id),
    selected_count: selection.metrics.selected_count,
    proportionality_ratio: selection.metrics.proportionality_ratio,
    decisions: selection.decisions.map(({ id, selected, origins }) => ({ id, selected, origins: clone(origins) }))
  };
}

return {ADAPTIVE_LOCK_SELECTOR_VERSION,ADAPTIVE_LOCK_IDS,selectAdaptiveLocks,validateAdaptiveLockSelection,applyAdaptiveLocksToExecutionSnapshot,createAdaptiveLockAuditView};
})();
const ROUTING=(()=>{
const ROUTING_ENGINE_VERSION = "1.0";

const ROUTING_ENGINES = Object.freeze(["rapide", "architecte"]);

const PREPARATION_SIGNAL_IDS = Object.freeze([
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
function routeExecution(state, {
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

function validateRoutingDecision(decision) {
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

function createRoutingAuditView(decision) {
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

return {ROUTING_ENGINE_VERSION,ROUTING_ENGINES,PREPARATION_SIGNAL_IDS,routeExecution,validateRoutingDecision,createRoutingAuditView};
})();
const READINESS=(()=>{
const EXECUTION_READINESS_VERSION = "1.0";

const EXECUTION_READINESS_STATES = Object.freeze([
  "contractualization",
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
    "avec","avez","cette","dans","des","elle","est","etes","les","pour","que",
    "quel","quelle","quelles","quels","qui","souhaitez","une","vous","votre","vos"
  ]);
  return new Set(
    text(value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter((item) => item.length > 2 && !stop.has(item))
  );
}

function questionsSimilar(left, right) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return text(left).toLowerCase() === text(right).toLowerCase();
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / Math.min(a.size, b.size) >= 0.7;
}

function novelQuestions(questions, previousQuestions) {
  const previous = list(previousQuestions).map(text).filter(Boolean);
  return list(questions)
    .map(text)
    .filter(Boolean)
    .filter((question) => !previous.some((old) => questionsSimilar(question, old)));
}

function assertAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    throw new TypeError("Une analyse Architecte est requise pour évaluer l'état d'exécution.");
  }
  if (!analysis.evaluation || !analysis.comprehension) {
    throw new TypeError("Analyse Architecte incomplète pour l'Execution Readiness Gate.");
  }
}

/**
 * Pendant la contractualisation, la technique 9 n'est pas encore activée.
 * Le système a le droit — et le devoir — de poser une clarification réellement
 * non substituable. Les invariants de sécurité et de non-invention restent actifs.
 */
function contractForContractualization(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new TypeError("ExecutionContract requis.");
  }
  const result = clone(contract);
  result.readiness = {
    version: EXECUTION_READINESS_VERSION,
    state: "contractualization",
    can_analyze: true,
    can_execute: false
  };
  result.execution_policy = {
    ...(result.execution_policy || {}),
    execute_now: false,
    comfort_questions_forbidden: false,
    meta_discussion_forbidden: true,
    complete_delivery_required: true,
    final_injunction_active: false
  };
  return result;
}

/**
 * Évalue uniquement des primitives universelles déjà produites par Architecte.
 * Aucun domaine, mot-clé métier ni quantité arbitraire n'est utilisé.
 */
function assessAnalysisReadiness(analysis, { previous_questions = [] } = {}) {
  assertAnalysis(analysis);
  const ev = analysis.evaluation || {};
  const missing = list(analysis.comprehension?.informations_manquantes);
  const blockingMissing = missing.filter((item) => item && item.bloquant === true);
  const candidates = novelQuestions(ev.questions_a_poser, previous_questions);
  const complete = ev.livrable_complet_possible === true;
  const action = text(ev.action_recommandee);

  if ((action === "questionner" || !complete || blockingMissing.length > 0) && candidates.length > 0) {
    return clone({
      version: EXECUTION_READINESS_VERSION,
      state: "clarification_required",
      execution_ready: false,
      question: candidates[0],
      remaining_candidate_questions: candidates.slice(1),
      blocking_missing_count: blockingMissing.length,
      reason: "Une information non substituable susceptible de modifier matériellement le livrable reste à obtenir."
    });
  }

  if (complete && action === "continuer" && blockingMissing.length === 0) {
    return clone({
      version: EXECUTION_READINESS_VERSION,
      state: "execution_ready",
      execution_ready: true,
      question: null,
      remaining_candidate_questions: [],
      blocking_missing_count: 0,
      reason: "Aucune information non substituable bloquante ne reste avant exécution."
    });
  }

  return clone({
    version: EXECUTION_READINESS_VERSION,
    state: "blocked",
    execution_ready: false,
    question: null,
    remaining_candidate_questions: candidates,
    blocking_missing_count: blockingMissing.length,
    reason: candidates.length === 0 && list(ev.questions_a_poser).length > 0
      ? "L'analyse réclame une clarification déjà posée ; elle ne doit pas provoquer une boucle."
      : "Le livrable complet n'est pas encore déclaré possible et aucune clarification exploitable nouvelle n'est disponible."
  });
}

/**
 * Instruction sémantique universelle injectée APRÈS le système Architecte historique.
 * Elle précise la notion d'exploitabilité sans modifier le moteur gelé.
 */
function buildExecutionReadinessInstruction() {
  return `## EXECUTION READINESS GATE — RÈGLE TRANSVERSALE PRIORITAIRE

Cette étape ne cherche pas simplement à savoir s'il est possible de produire "quelque chose d'utile". Elle doit déterminer si la DEMANDE PRÉPARÉE est suffisamment complète et opérationnelle pour que le livrable final puisse ensuite être exécuté sans décider silencieusement à la place de l'utilisateur sur un paramètre qui lui appartient et qui modifierait matériellement le résultat.

Distinguez strictement :
- CONTRACTUALISABLE : assez d'information pour analyser et poursuivre le cadrage ;
- EXECUTION_READY : assez d'information pour exécuter le livrable complet sans inconnue non substituable restante.

Pour CHAQUE information absente qui pourrait modifier matériellement le résultat, choisissez le traitement le plus approprié :
1. rechercher, si c'est un fait externe vérifiable ;
2. décider raisonnablement, si l'utilisateur a délégué ce choix ou si plusieurs choix sont équivalents pour son objectif ;
3. estimer et étiqueter l'estimation, si une précision exacte n'est pas nécessaire ;
4. scénariser ou conditionner, si plusieurs valeurs peuvent être traitées proprement ;
5. laisser inconnue localement, si elle n'empêche pas le livrable complet ;
6. QUESTIONNER uniquement si l'information est réellement non substituable : elle appartient à l'utilisateur ou à son contexte, son absence change matériellement le livrable, et aucune des cinq stratégies précédentes ne préserve honnêtement le résultat.

Il n'existe AUCUN nombre cible de questions. Posez autant de cycles de clarification que nécessaire pour atteindre EXECUTION_READY, et zéro question de confort. À chaque analyse, placez dans questions_a_poser la question la plus déterminante en premier ; l'application n'en posera qu'une avant de réanalyser avec la réponse.

Une réponse antérieure "À vous de choisir" est une délégation explicite : prenez alors une décision raisonnable et étiquetez-la comme décision, sans redemander le même choix. Une réponse "Je ne sais pas" interdit de répéter mécaniquement la même question : recherchez, estimez, décidez si cela a été délégué, scénarisez ou conservez l'inconnue ; ne posez une autre question que si elle permet réellement d'avancer.

Ne considérez jamais comme suffisant le seul fait qu'une réponse générale soit possible. Si la demande vise une préparation personnalisée ou opérationnelle et qu'une information non substituable changerait substantiellement ce qui sera produit, marquez livrable_complet_possible=false et action_recommandee="questionner".

Inversement, ne questionnez jamais sur une information que l'IA peut raisonnablement rechercher, décider, estimer, scénariser ou laisser à confirmer sans dégrader matériellement le livrable complet.

Cette règle est universelle : n'utilisez aucun questionnaire métier, aucune liste de champs par domaine et aucun mot-clé sectoriel. Raisonnez uniquement en termes d'objectif, de livrable, de dépendance, d'impact, de substituabilité, d'autorité de décision et de risque d'invention.`;
}

function buildFinalExecutionDirective() {
  return `## EXÉCUTION IMMÉDIATE
La demande est maintenant déclarée EXECUTION_READY. Ne proposez plus de préparer, planifier ou discuter le travail : produisez maintenant le livrable complet demandé. Ne posez aucune question de confort. Respectez toutes les contraintes, décisions, hypothèses étiquetées, quantités, formats et contrôles définis ci-dessus. Avant l'envoi, vérifiez silencieusement la complétude et la conformité, corrigez les écarts détectés, puis livrez uniquement le résultat utile.`;
}

function createReadinessAuditView(readiness) {
  if (!readiness || !EXECUTION_READINESS_STATES.includes(readiness.state)) {
    throw new TypeError("État Execution Readiness invalide.");
  }
  return {
    version: readiness.version,
    state: readiness.state,
    execution_ready: readiness.execution_ready === true,
    has_question: Boolean(readiness.question),
    blocking_missing_count: Number(readiness.blocking_missing_count || 0)
  };
}

return {EXECUTION_READINESS_VERSION,EXECUTION_READINESS_STATES,contractForContractualization,assessAnalysisReadiness,buildExecutionReadinessInstruction,buildFinalExecutionDirective,createReadinessAuditView};
})();
const ADAPTERS=((deps)=>{
const {buildAdnState,adnStateToExecutionContractSnapshot,selectAdaptiveLocks,validateAdaptiveLockSelection,routeExecution,validateRoutingDecision,contractForContractualization}=deps;




const ENGINE_ADAPTERS_VERSION = '1.0';

const LEGACY_LOCK_MAP = Object.freeze({
  role: 'role',
  recipient: 'destinataire',
  data: 'donnees',
  provenance: 'provenance',
  scope: 'perimetre',
  plan: 'gabarit',
  format: 'format',
  volume: 'volume',
  opening_closing: 'amorce',
  forbidden: 'interdits',
  assumptions: 'hypotheses',
  length: 'longueur',
  final_check: 'controle'
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(items) {
  return [...new Set(list(items).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))];
}

function normalizeProvider(providerResult) {
  if (!providerResult || typeof providerResult !== 'object') {
    return { available: false, source: null, decision: null };
  }
  const source = text(providerResult.source) || null;
  const available = source !== 'local-prudent' && providerResult.decision && typeof providerResult.decision === 'object';
  return { available, source, decision: available ? clone(providerResult.decision) : null };
}

function fallbackDecision(providerResult) {
  const raw = providerResult?.decision;
  if (raw?.etat_demande === 'clarification_necessaire') return clone(raw);
  return {
    etat_demande: 'exploitable',
    route: 'rapide',
    confiance: 'moyenne',
    raison_interne: 'Fallback structurel : aucune preuve de préparation substantielle n’est disponible.',
    question: null
  };
}

function buildExecutionEnvelope({
  request,
  material = '',
  provider_result = null,
  intent = {},
  evidence = {},
  executability = {},
  assumptions = [],
  obligations = [],
  quantities = [],
  output = {},
  checks = [],
  discipline = {},
  semantic_lock_signals = [],
  preparation_signals = []
} = {}) {
  const originalRequest = text(request);
  if (!originalRequest) throw new TypeError('Une demande est requise pour construire l’enveloppe d’exécution.');

  const provider = normalizeProvider(provider_result);
  const decisionForState = provider.available ? provider.decision : fallbackDecision(provider_result);

  const state = buildAdnState({
    demande: originalRequest,
    decision: decisionForState,
    intent,
    evidence: {
      ...clone(evidence),
      material_facts: list(evidence.material_facts).length
        ? clone(evidence.material_facts)
        : (text(material) ? [{ text: 'Matériau utilisateur présent.' }] : [])
    },
    executability,
    assumptions,
    obligations,
    quantities,
    output,
    checks,
    discipline
  });

  const locks = selectAdaptiveLocks(state, { semantic_signals: semantic_lock_signals });
  validateAdaptiveLockSelection(locks);

  const routing = routeExecution(state, {
    provider_decision: provider.decision,
    provider_source: provider.source,
    provider_available: provider.available,
    preparation_signals
  });
  validateRoutingDecision(routing);

  const contract = adnStateToExecutionContractSnapshot(state, {
    version: '1.0',
    locks: locks.locks.map((lock) => ({
      id: lock.id,
      reason: lock.reason,
      priority: lock.priority,
      source: lock.source,
      source_ids: clone(lock.source_ids),
      associated_checks: clone(lock.associated_checks)
    })),
    execution_policy: {
      execute_now: state.discipline.execute_now,
      comfort_questions_forbidden: state.discipline.comfort_questions_forbidden,
      meta_discussion_forbidden: state.discipline.meta_discussion_forbidden,
      complete_delivery_required: state.discipline.complete_delivery_required,
      final_injunction_active: state.discipline.final_injunction_active
    },
    routing: {
      engine: routing.route,
      reason: routing.reason,
      confidence: routing.confidence,
      mode: routing.mode
    },
    ethics: clone(state.ethics),
    adn_summary: {
      properties: clone(state.properties),
      techniques: clone(state.techniques)
    }
  });

  return clone({
    version: ENGINE_ADAPTERS_VERSION,
    state,
    locks,
    routing,
    contract
  });
}

function baseProjection(envelope) {
  if (!envelope || typeof envelope !== 'object' || envelope.version !== ENGINE_ADAPTERS_VERSION) {
    throw new TypeError('Enveloppe d’exécution ADN invalide.');
  }
  return {
    request_id: envelope.state.request_id,
    request: envelope.state.original_request,
    route: envelope.routing.route,
    execution_policy: clone(envelope.contract.execution_policy),
    legacy_lock_ids: envelope.locks.locks.map((lock) => LEGACY_LOCK_MAP[lock.id]).filter(Boolean),
    lock_ids: envelope.locks.locks.map((lock) => lock.id),
    contract: clone(envelope.contract)
  };
}

function projectToRapide(envelope, { material = '', format = null, level = null } = {}) {
  const base = baseProjection(envelope);
  if (base.route !== 'rapide') throw new TypeError('La projection Rapide exige route=rapide.');
  return clone({
    ...base,
    engine: 'rapide',
    material: text(material),
    format: text(format) || envelope.state.compliance.output.format || null,
    level: text(level) || null
  });
}

function projectToArchitecte(envelope, { material = '', preferences = '' } = {}) {
  const base = baseProjection(envelope);
  if (base.route !== 'architecte') throw new TypeError('La projection Architecte exige route=architecte.');
  return clone({
    ...base,
    engine: 'architecte',
    material: text(material),
    preferences: text(preferences),
    contract_context: (() => {
      const contractualization = contractForContractualization(envelope.contract);
      return {
        obligations: clone(contractualization.obligations),
        assumptions: clone(contractualization.assumptions),
        quantities: clone(contractualization.quantities),
        output: clone(contractualization.output),
        locks: clone(contractualization.locks),
        execution_policy: clone(contractualization.execution_policy),
        readiness: clone(contractualization.readiness)
      };
    })()
  });
}

function projectToAtelier(envelope, { material = '' } = {}) {
  const base = baseProjection(envelope);
  return clone({
    ...base,
    engine: 'atelier',
    material: text(material),
    user_controlled: true
  });
}

function validateLegacyLockMapping() {
  const expected = [
    'role','destinataire','donnees','provenance','perimetre','gabarit','format',
    'volume','amorce','interdits','hypotheses','longueur','controle'
  ];
  const actual = Object.values(LEGACY_LOCK_MAP);
  if (expected.length !== actual.length || expected.some((id) => !actual.includes(id))) {
    throw new TypeError('Le mapping des 13 verrous vers le runtime historique est incomplet.');
  }
  return clone(LEGACY_LOCK_MAP);
}

function createAdapterAuditView(envelope) {
  const base = baseProjection(envelope);
  return {
    version: envelope.version,
    request_id: base.request_id,
    route: base.route,
    lock_ids: clone(base.lock_ids),
    legacy_lock_ids: clone(base.legacy_lock_ids),
    execution_policy: clone(base.execution_policy),
    properties: clone(envelope.state.properties),
    techniques: clone(envelope.state.techniques)
  };
}

return {ENGINE_ADAPTERS_VERSION,buildExecutionEnvelope,projectToRapide,projectToArchitecte,projectToAtelier,validateLegacyLockMapping,createAdapterAuditView};
})({...ADN,...LOCKS,...ROUTING,...READINESS});
global.__ATELIER_ADN_RUNTIME__=Object.freeze({...ADN,...LOCKS,...ROUTING,...READINESS,...ADAPTERS,source_sha256:'0420937495c3db4ad8b44c2b9f8f10b6c27f7d235937e7617c876e8fbe563b2b'});
})(window);
