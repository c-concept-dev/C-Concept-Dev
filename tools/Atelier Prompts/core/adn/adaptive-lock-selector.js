export const ADAPTIVE_LOCK_SELECTOR_VERSION = "1.0";

export const ADAPTIVE_LOCK_IDS = Object.freeze([
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
export function selectAdaptiveLocks(state, { semantic_signals = [] } = {}) {
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

export function validateAdaptiveLockSelection(selection) {
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

export function applyAdaptiveLocksToExecutionSnapshot(state, selectorOptions = {}, snapshotExtras = {}) {
  const selection = selectAdaptiveLocks(state, selectorOptions);
  validateAdaptiveLockSelection(selection);
  return {
    ...clone(snapshotExtras),
    locks: selection.locks.map(({ origins, ...lock }) => clone(lock)),
    lock_selection_audit: clone(selection)
  };
}

export function createAdaptiveLockAuditView(selection) {
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
