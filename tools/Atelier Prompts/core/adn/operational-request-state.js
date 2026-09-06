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

/* Provenance obligatoire pour tout élément matériel du candidat (CDC §6).
 *
 * OPRIE-MATERIAL-PROVENANCE-02 — UNE VALEUR AJOUTÉE, ET LA RAISON DE L'AJOUT.
 *
 * Le vocabulaire du CDC §6 décrivait COMMENT un fait est venu à la connaissance du système, à une
 * époque où le plan profond ne recevait que deux sources : la demande et l'historique. Depuis
 * OPRIE-MATERIAL-CONTENT-02, il en reçoit une troisième — material_content — et l'audit
 * OPRIE-MATERIAL-PROVENANCE-01 a établi qu'AUCUNE des huit valeurs ne désigne un fait porté par
 * elle : « la personne a écrit ZX-4821 » et « ZX-4821 figure dans le document qu'elle a joint »
 * sont deux origines distinctes, et le contrat ne savait pas les distinguer.
 *
 * Faute de valeur juste, l'Analyste en employait une fausse, et le Critique la sanctionnait — à
 * juste titre. Ce n'est pas le contrôle qui était trop strict : c'est le vocabulaire qui était
 * incomplet.
 *
 * UNE SEULE VALEUR, ET GÉNÉRIQUE. Pas de document_fact, pas de pdf_fact, pas de csv_fact : le
 * nom ne doit encoder ni format, ni domaine, ni fournisseur, ni protocole. Les huit valeurs
 * historiques sont inchangées, à l'octet près, et gardent exactement leur sens.
 *
 * CE QU'UNE PROVENANCE DIT, ET CE QU'ELLE NE DIT PAS. Elle décrit une ORIGINE, jamais une
 * fiabilité, jamais une suffisance, jamais une readiness. Un fait correctement sourcé sur un
 * matériau utilisateur n'est ni vrai, ni suffisant, ni pertinent pour autant.
 */
export const PROVENANCE_VALUES = Object.freeze([
  "explicit_user_statement",
  "clarification_answer",
  "confirmed_preference",
  "safe_deduction",
  "delegated_decision",
  "external_fact_to_research",
  "labeled_estimate",
  "conditional_scenario",
  "user_provided_material"
]);

/* Définitions normatives. Le CDC §6 nommait les valeurs sans les définir : l'audit
 * OPRIE-MATERIAL-PROVENANCE-01 l'a établi, et c'est ce silence qui rendait indécidable la
 * question « quelle provenance pour un fait lu dans un matériau ? ». Les deux valeurs que ce lot
 * met en jeu sont donc définies ici, sans ouvrir la définition des six autres — dont les usages
 * historiques restent l'unique référence, inchangés. */
export const PROVENANCE_DEFINITIONS = Object.freeze({
  explicit_user_statement:
    "Fait explicitement déclaré par la personne dans original_request ou dans clarification_history.",
  user_provided_material:
    "Fait explicitement présent dans le contenu d'un matériau fourni par la personne et transmis à l'Analyste pendant le tour courant (material_content). Décrit l'origine du fait, jamais sa véracité, sa suffisance ni sa pertinence."
});

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

/* OPRIE-EXPECTED-DELIVERABLE-SEMANTICS-01 — CE QUE expected_deliverable CONTIENT, ENFIN ÉCRIT.
 *
 * Le CDC §5.3 nommait les champs sans les définir. Le schéma les déclare `{type:"string"}`, sans
 * description. La sémantique n'existait donc que dans l'usage — et l'usage, lui, est parfaitement
 * constant : « Compte rendu structuré en trois sections », « Liste de 10 conseils », « Document
 * d'une page avec les trois indicateurs clés ». Une FORME, parfois ses paramètres structurels,
 * jamais un contenu.
 *
 * C'est ce silence qui a produit un veto que personne ne pouvait trancher : l'Analyste inscrivait
 * la valeur extraite d'un matériau dans expected_deliverable, et le Critique y voyait — à raison —
 * le livrable rédigé pendant la préparation.
 *
 * LA LIGNE DE PARTAGE N'EST PAS « FAIT OU PAS FAIT », C'EST LE RÔLE DU FAIT. Un fait qui SPÉCIFIE
 * la demande appartient au candidat, avec sa provenance. Un fait qui EST le résultat demandé n'y
 * appartient pas : le candidat prépare, il n'exécute pas.
 *
 * Seuls les deux champs que ce lot a dû trancher sont définis ici. Les huit autres restent définis
 * par leurs usages, inchangés — ce lot n'ouvre pas un chantier encyclopédique. */
export const CANDIDATE_FIELD_DEFINITIONS = Object.freeze({
  objective:
    "Ce que la demande vise à obtenir, formulé comme une intention. Jamais le résultat lui-même.",
  expected_deliverable:
    "La forme du résultat attendu et ses caractéristiques structurelles — nature, structure, volume, sections. Jamais le contenu final, jamais une valeur qui constituerait à elle seule le résultat demandé.",
  available_inputs:
    "Intrant que l'Analyste juge nécessaire à l'exécution et dont la disponibilité est établie à ce tour. Décrit l'intrant — ce dont l'exécution aura besoin — jamais son contenu, jamais le résultat qu'il permettra de produire. Disponible ne signifie ni suffisant, ni correct, ni pertinent, et ne rend jamais une demande prête."
});
export const CANDIDATE_LIST_FIELDS = Object.freeze([
  "secondary_objectives",
  "confirmed_constraints",
  "confirmed_priorities",
  "confirmed_preferences",
  "delegated_decisions",
  "external_facts_to_research",
  "assumptions_allowed",
  "remaining_unknowns",
  /* OPRIE-INPUT-AVAILABILITY-FIELD-01 — LE CANAL QUI MANQUAIT.
   *
   * Le candidat savait dire ce qu'il ignore (remaining_unknowns), ce qu'il suppose
   * (assumptions_allowed), ce qu'il faut aller chercher (external_facts_to_research). Il ne savait
   * pas dire l'inverse : « cet intrant est nécessaire, et il est là ». Faute de cet emplacement,
   * l'Analyste enregistrait la disponibilité par EFFET DE BORD, en recopiant la valeur dans
   * expected_deliverable — ce que le Critique sanctionnait, à raison. Et l'interdire sans fournir
   * le canal a fait passer blocked de 10/30 à 23/30 : l'information disparaissait au lieu de
   * changer de place.
   *
   * IL DÉCRIT L'INTRANT, IL NE LE RECOPIE PAS. « le numéro de dossier, présent dans le matériau
   * transmis » — jamais « ZX-4821 ». Disponible ne veut dire ni suffisant, ni correct, ni
   * pertinent, et ne rend jamais une demande prête. */
  "available_inputs"
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
  /* OPRIE-INPUT-AVAILABILITY-FIELD-01 — LE SEUL CHAMP OPTIONNEL DU CANDIDAT, ET IL L'EST EXPRÈS.
     available_inputs est requis du MODÈLE — le schéma JSON l'exige, pour qu'il s'en serve — mais
     toléré absent du VALIDATEUR : tout candidat écrit avant ce lot reste valide à l'octet près,
     et son absence vaut liste vide. Sans cela, ajouter un champ à un schéma dont `required` égale
     `properties` invaliderait d'un coup chaque candidat historique. exactKeys reste la règle pour
     les dix autres : on n'ouvre pas le contrat, on nomme l'unique exception. */
  const complete = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    && !Object.prototype.hasOwnProperty.call(candidate, "available_inputs")
      ? { ...candidate, available_inputs: [] }
      : candidate;
  exactKeys(complete, CANDIDATE_FIELDS, "OperationalRequestCandidate");
  candidate = complete;
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
/**
 * kind est structurellement toujours présent (jamais omis) : requis par les schémas JSON stricts
 * (Groq exige que "required" couvre exactement toutes les clés de "properties" — cf.
 * workers/shared/operational-request-core.js). Sa valeur reste null hors conflict : ce n'est jamais
 * une information métier inventée, seulement une case techniquement remplie pour rester compatible
 * avec le mode strict, sans jamais transformer "non applicable" en une valeur qui aurait un sens.
 */
export function validateIssue(issue) {
  const isConflict = issue && issue.type === "conflict";
  exactKeys(issue, ["id", "type", "description", "impact", "substitutable", "recommended_treatment", "kind"], "Issue");
  assert(text(issue.id), "issue.id est obligatoire.");
  assert(ISSUE_TYPES.includes(issue.type), "issue.type invalide.");
  assert(text(issue.description), "issue.description est obligatoire.");
  assert(ISSUE_IMPACTS.includes(issue.impact), "issue.impact invalide.");
  assert(typeof issue.substitutable === "boolean", "issue.substitutable doit être un booléen.");
  assert(text(issue.recommended_treatment), "issue.recommended_treatment est obligatoire.");
  if (isConflict) {
    assert(CONFLICT_KINDS.includes(issue.kind), "issue.kind invalide pour un conflict.");
  } else {
    assert(issue.kind === null, "issue.kind doit être null en dehors d'un conflict (jamais omis, jamais inventé).");
  }
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
    kind: issue?.type === "conflict" ? (issue?.kind ?? null) : null
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
