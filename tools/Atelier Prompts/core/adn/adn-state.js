export const ADN_STATE_VERSION = "1.0";

export const ADN_PROPERTY_IDS = Object.freeze([
  "intentionality",
  "executability",
  "discipline",
  "completeness",
  "compliance"
]);

export const ADN_TECHNIQUE_IDS = Object.freeze([
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

export const ADN_ETHIC_IDS = Object.freeze([
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

export function buildAdnState(input) {
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

export function validateAdnState(state) {
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

export function adnStateToExecutionContractSnapshot(state, extras = {}) {
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

export function createAdnAuditView(state) {
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
