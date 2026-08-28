export const OPERATIONAL_REQUEST_STATE_VERSION = "1.0";

// États publics de sortie d'un tour OPRIE (CDC V1.1 §3.1, §4, corrections confirmation/dégradation).
export const OPERATIONAL_REQUEST_STATES = Object.freeze([
  "clarification_required",
  "confirmation_required",
  "operational_request_ready",
  "blocked",
  "degraded_state"
]);

// Transitions légales entre états. "understanding" est l'état de travail neutre avant tout verdict.
// degraded_state ne peut jamais aboutir directement à operational_request_ready ni à blocked : une
// panne technique doit repasser par une analyse complète avant tout verdict sémantique (CDC §22).
export const OPERATIONAL_REQUEST_TRANSITIONS = Object.freeze({
  understanding: Object.freeze(["clarification_required", "confirmation_required", "operational_request_ready", "blocked", "degraded_state"]),
  clarification_required: Object.freeze(["understanding"]),
  confirmation_required: Object.freeze(["operational_request_ready", "understanding"]),
  blocked: Object.freeze(["understanding"]),
  degraded_state: Object.freeze(["understanding"]),
  operational_request_ready: Object.freeze([])
});

// Provenance obligatoire pour tout élément matériel du candidat (CDC §6).
export const PROVENANCE_VALUES = Object.freeze([
  "explicit_user_statement",
  "clarification_answer",
  "confirmed_preference",
  "safe_deduction",
  "delegated_decision",
  "external_fact_to_research",
  "labeled_estimate",
  "conditional_scenario"
]);

// Provenance de l'historique de clarification (CDC §5.2) : uniquement l'utilisateur répond.
export const CLARIFICATION_PROVENANCE_VALUES = Object.freeze(["user"]);

// Types d'issues (CDC §7), "conflict" utilise la primitive unifiée §7.3 au lieu d'une taxonomie éclatée.
export const ISSUE_TYPES = Object.freeze([
  "missing_information",
  "ambiguity",
  "conflict",
  "deliverable_unclear",
  "dependency",
  "decision_authority_unclear",
  "information_overload",
  "multi_objective_disorder"
]);

export const CONFLICT_KINDS = Object.freeze([
  "logical_contradiction",
  "constraint_tension",
  "priority_conflict"
]);

export const ISSUE_IMPACTS = Object.freeze(["material", "non_material"]);

// Champs du candidat opérationnel canonique (CDC §5.3). Tous adaptatifs : un champ vide est valide,
// aucun n'est une checklist à remplir "parce qu'il existe".
export const CANDIDATE_SCALAR_FIELDS = Object.freeze(["objective", "expected_deliverable"]);
export const CANDIDATE_LIST_FIELDS = Object.freeze([
  "secondary_objectives",
  "confirmed_constraints",
  "confirmed_priorities",
  "confirmed_preferences",
  "delegated_decisions",
  "external_facts_to_research",
  "assumptions_allowed",
  "remaining_unknowns"
]);
export const CANDIDATE_FIELDS = Object.freeze([...CANDIDATE_SCALAR_FIELDS, ...CANDIDATE_LIST_FIELDS]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
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

function numbered(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

/**
 * Enregistrement racine. original_request n'est jamais réécrit : toute évolution du dialogue
 * passe par appendClarificationTurn, qui retourne un nouvel enregistrement en propageant la même
 * valeur d'original_request telle quelle (jamais recalculée, reformulée ni "améliorée").
 */
export function createOriginalRequestRecord(originalRequest) {
  const value = text(originalRequest);
  assert(value, "Une demande originale non vide est requise.");
  return Object.freeze({
    version: OPERATIONAL_REQUEST_STATE_VERSION,
    original_request: value,
    clarification_history: Object.freeze([])
  });
}

export function validateOriginalRequestRecord(record) {
  exactKeys(record, ["version", "original_request", "clarification_history"], "OriginalRequestRecord");
  assert(record.version === OPERATIONAL_REQUEST_STATE_VERSION, "Version OperationalRequestState incompatible.");
  assert(text(record.original_request), "original_request doit rester non vide.");
  list(record.clarification_history).forEach((turn, index) => {
    exactKeys(turn, ["turn", "question", "answer", "provenance"], `clarification_history[${index}]`);
    assert(Number.isInteger(turn.turn) && turn.turn === index + 1, `clarification_history[${index}].turn doit être ${index + 1}.`);
    assert(text(turn.question), `clarification_history[${index}].question doit être non vide.`);
    assert(text(turn.answer), `clarification_history[${index}].answer doit être non vide.`);
    assert(CLARIFICATION_PROVENANCE_VALUES.includes(turn.provenance), `clarification_history[${index}].provenance invalide.`);
  });
  return clone(record);
}

/**
 * Ajoute un tour de clarification sans jamais muter l'enregistrement précédent ni réassigner
 * original_request. C'est la seule voie légitime de faire évoluer clarification_history.
 */
export function appendClarificationTurn(record, { question, answer, provenance = "user" } = {}) {
  validateOriginalRequestRecord(record);
  const q = text(question);
  const a = text(answer);
  assert(q, "La question du tour de clarification est obligatoire.");
  assert(a, "La réponse du tour de clarification est obligatoire.");
  assert(CLARIFICATION_PROVENANCE_VALUES.includes(provenance), "Provenance de clarification invalide.");
  const nextTurn = Object.freeze({
    turn: record.clarification_history.length + 1,
    question: q,
    answer: a,
    provenance
  });
  const next = Object.freeze({
    version: record.version,
    original_request: record.original_request,
    clarification_history: Object.freeze([...record.clarification_history, nextTurn])
  });
  assertSameOriginalRequest(record, next);
  return next;
}

/** Garde d'immuabilité explicite, à appeler par tout code qui produit un nouvel enregistrement. */
export function assertSameOriginalRequest(before, after) {
  assert(before.original_request === after.original_request, "original_request ne doit jamais être réécrit.");
}

export function createEmptyCandidate() {
  const candidate = {};
  for (const field of CANDIDATE_SCALAR_FIELDS) candidate[field] = "";
  for (const field of CANDIDATE_LIST_FIELDS) candidate[field] = [];
  return candidate;
}

/**
 * Valide et clone un candidat. Un champ vide est valide (règle anti-questionnaire universel,
 * CDC §5.3) : cette fonction ne vérifie jamais qu'un champ est renseigné, uniquement sa forme.
 */
export function normalizeCandidate(candidate) {
  exactKeys(candidate, CANDIDATE_FIELDS, "OperationalRequestCandidate");
  const result = {};
  for (const field of CANDIDATE_SCALAR_FIELDS) {
    assert(typeof candidate[field] === "string", `${field} doit être une chaîne.`);
    result[field] = text(candidate[field]);
  }
  for (const field of CANDIDATE_LIST_FIELDS) {
    assert(Array.isArray(candidate[field]), `${field} doit être une liste.`);
    result[field] = candidate[field].map((item, index) => {
      const value = text(item);
      assert(value, `${field}[${index}] ne doit pas être une chaîne vide.`);
      return value;
    });
  }
  return result;
}

export function validateProvenanceValue(value) {
  assert(PROVENANCE_VALUES.includes(value), `Valeur de provenance invalide : ${value}.`);
  return value;
}

/**
 * Valide une issue. Le champ kind (primitive conflict unifiée, CDC §7.3) est obligatoire
 * uniquement pour type="conflict" et interdit pour tout autre type.
 */
export function validateIssue(issue) {
  const isConflict = issue && issue.type === "conflict";
  const expectedKeys = ["id", "type", "description", "impact", "substitutable", "recommended_treatment"]
    .concat(isConflict ? ["kind"] : []);
  exactKeys(issue, expectedKeys, "Issue");
  assert(text(issue.id), "issue.id est obligatoire.");
  assert(ISSUE_TYPES.includes(issue.type), "issue.type invalide.");
  assert(text(issue.description), "issue.description est obligatoire.");
  assert(ISSUE_IMPACTS.includes(issue.impact), "issue.impact invalide.");
  assert(typeof issue.substitutable === "boolean", "issue.substitutable doit être un booléen.");
  assert(text(issue.recommended_treatment), "issue.recommended_treatment est obligatoire.");
  if (isConflict) assert(CONFLICT_KINDS.includes(issue.kind), "issue.kind invalide pour un conflict.");
  return clone(issue);
}

/** Assigne un identifiant stable aux issues qui n'en portent pas encore, puis valide chacune. */
export function normalizeIssues(issues) {
  return list(issues).map((issue, index) => validateIssue({
    id: text(issue?.id) || numbered("ISSUE", index),
    type: issue?.type,
    description: text(issue?.description),
    impact: issue?.impact,
    substitutable: issue?.substitutable === true,
    recommended_treatment: text(issue?.recommended_treatment),
    ...(issue?.type === "conflict" ? { kind: issue?.kind } : {})
  }));
}

/** Un enregistrement de provenance relie une valeur exacte d'un champ du candidat à sa source. */
export function validateProvenanceRecord(record) {
  exactKeys(record, ["field", "value", "provenance"], "ProvenanceRecord");
  assert(CANDIDATE_FIELDS.includes(record.field), "ProvenanceRecord.field invalide.");
  assert(text(record.value), "ProvenanceRecord.value est obligatoire.");
  validateProvenanceValue(record.provenance);
  return clone(record);
}

export function normalizeProvenanceRecords(records) {
  return list(records).map(validateProvenanceRecord);
}

/** Une reclassification tracée d'un élément du candidat (ex. suppression justifiée). */
export function validateStatusChange(change) {
  exactKeys(change, ["field", "value", "reason"], "StatusChange");
  assert(CANDIDATE_FIELDS.includes(change.field), "StatusChange.field invalide.");
  assert(text(change.value), "StatusChange.value est obligatoire.");
  assert(text(change.reason), "StatusChange.reason est obligatoire.");
  return clone(change);
}

export function normalizeStatusChanges(changes) {
  return list(changes).map(validateStatusChange);
}

/** Une résolution tracée d'une issue matérielle (contradiction/conflit) entre deux tours. */
export function validateResolution(resolution) {
  exactKeys(resolution, ["issue_id", "provenance", "note"], "Resolution");
  assert(text(resolution.issue_id), "Resolution.issue_id est obligatoire.");
  validateProvenanceValue(resolution.provenance);
  assert(text(resolution.note), "Resolution.note est obligatoire.");
  return clone(resolution);
}

export function normalizeResolutions(resolutions) {
  return list(resolutions).map(validateResolution);
}

export function isLegalTransition(from, to) {
  const allowed = OPERATIONAL_REQUEST_TRANSITIONS[from];
  assert(Array.isArray(allowed), `État de transition inconnu : ${from}.`);
  return allowed.includes(to);
}
