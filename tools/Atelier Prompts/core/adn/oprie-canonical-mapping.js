/* ADN-CANON-01 — MAPPING OPRIE → CANONICAL EXECUTION CONTRACT
 * ============================================================================
 *
 * Mapping UNIQUE : Rapide et Architecte reçoivent le même contrat de base,
 * octet pour octet, pour une même sortie OPRIE. Aucun branchement par mode.
 *
 * Ce module est PUR et DÉTERMINISTE. Il n'appelle ni LLM, ni réseau, ni DOM,
 * ni fournisseur. Il ne décide pas READY, ne pose pas de question, ne
 * sélectionne aucun verrou, ne route pas et ne compile aucun prompt.
 *
 * INVARIANT : CANONICAL_EXECUTABLE <=> OPRIE.state === 'operational_request_ready'
 *
 * DEUX COUCHES, UNE SEULE SOURCE DE VÉRITÉ SÉMANTIQUE
 *
 *   CANONICAL BASE CONTRACT   ce module. Sémantique pure, indépendante du mode
 *                             et du routing. Produit par mapOprieToCanonicalContract().
 *   EXECUTION ENVELOPE        buildExecutionEnvelope(). CONSOMME la base via
 *                             canonical_base, puis y ajoute decision, routing,
 *                             locks, execution_policy, ethics et adn_summary.
 *
 * La base n'est PAS une copie parallèle de l'enveloppe : elle en est l'amont.
 * `canonicalBaseToEnvelopeInput()` ci-dessous est l'unique projection base →
 * enveloppe ; aucun second constructeur sémantique n'existe.
 *
 * NOTE D'ARCHITECTURE — pourquoi le mapper n'appelle pas buildExecutionEnvelope().
 * `buildAdnState()` exige une `decision` validée, et `validateDecision()` refuse
 * un état `exploitable` sans route (`rapide` ou `architecte`). Produire cette
 * route ferait router le mapper, ce que la gouvernance interdit, et rendrait le
 * contrat dépendant du mode — contredisant l'exigence d'un contrat de base unique.
 * Le mapper émet donc les champs SÉMANTIQUES du contrat, dans les mêmes noms et
 * la même structure que `env.contract` ; `decision`, `routing`, `execution_policy`,
 * `ethics` et `adn_summary.properties/techniques` restent produits en aval par le
 * moteur ADN, une fois le mode connu. Aucun contrat parallèle n'est créé.
 */

export const CANONICAL_CONTRACT_VERSION = "2.0";

/** États OPRIE, dans l'ordre du schéma Arbiter. Énumération close. */
export const OPRIE_STATES = Object.freeze([
  "operational_request_ready",
  "clarification_required",
  "confirmation_required",
  "blocked"
]);

/** Seul état autorisant l'exécution sémantique. */
export const OPRIE_EXECUTABLE_STATE = "operational_request_ready";

/** Champs OPRIE volontairement EXCLUS du contrat d'exécution : ils appartiennent
 *  au dialogue et à l'état transitoire, jamais au contrat. */
export const OPRIE_TRANSIENT_FIELDS = Object.freeze([
  "next_question",
  "confirmation_reason",
  "blocked_reason"
]);

/** Les TROIS marqueurs de gouvernance, et eux seuls. Toute autre affirmation
 *  d'évaluation est interdite dans le contrat de base : une collection vide
 *  signifie « aucune donnée présente », jamais « évaluée » ni « complète ». */
export const CANONICAL_EVALUATION_MARKERS = Object.freeze([
  "evidence.extraction_performed",
  "executability.evaluated",
  "semantic_lock_signals.signals_produced"
]);

/** Champs de premier niveau du Canonical Base Contract. Déclaration unique. */
export const CANONICAL_BASE_FIELDS = Object.freeze([
  "version", "request_id", "original_request", "intent", "evidence", "executability",
  "assumptions", "obligations", "quantities", "output", "checks",
  "semantic_lock_signals", "selected_locks", "adn_summary"
]);

/** Provenances admises pour toute valeur du contrat. Énumération close. */
export const CANONICAL_SOURCES = Object.freeze([
  "user_explicit", "material", "oprie", "derived_deterministic",
  "manual", "arch_analysis", "system_policy", "default"
]);

/** Un signal sémantique porte sa PROPRE énumération de source, celle attendue
 *  par `normalizeSignal()` du sélecteur adaptatif. Elle est distincte de la
 *  provenance canonique et ne doit pas être confondue avec elle. */
export const SEMANTIC_SIGNAL_SOURCES = Object.freeze(["user", "material", "system", "runtime"]);
export const SEMANTIC_SIGNAL_PRIORITIES = Object.freeze(["mandatory", "useful"]);

const text = (value) => (typeof value === "string" ? value.trim() : "");
const list = (value) => (Array.isArray(value) ? value : []);
const strings = (value) => list(value).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Enveloppe une valeur textuelle OPRIE dans la forme canonique tracée. */
const oprieItem = (value) => ({ text: value, source: "oprie" });

/* -------------------------------------------------------------------------
 * ISSUES — aucun champ perdu.
 * ---------------------------------------------------------------------- */

function normalizeIssue(issue) {
  return {
    id: text(issue?.id),
    type: text(issue?.type),
    kind: issue?.kind === null ? null : text(issue?.kind) || null,
    description: text(issue?.description),
    impact: text(issue?.impact),
    substitutable: issue?.substitutable === true,
    recommended_treatment: text(issue?.recommended_treatment),
    source: "oprie"
  };
}

/** Une issue non substituable et matérielle bloque ; les autres sont substituables.
 *  Une issue non substituable mais non matérielle est rétrogradée AVEC sa raison,
 *  pour rester auditable. */
function routeIssues(issues) {
  const critical = [];
  const substitutable = [];
  for (const raw of list(issues)) {
    const issue = normalizeIssue(raw);
    if (issue.substitutable) {
      substitutable.push(issue);
    } else if (issue.impact === "material") {
      critical.push(issue);
    } else {
      substitutable.push({ ...issue, demotion_reason: "non_material" });
    }
  }
  return { critical, substitutable };
}

/* -------------------------------------------------------------------------
 * SIGNAUX SÉMANTIQUES — uniquement ceux qu'OPRIE peut fournir génériquement.
 * Aucune règle métier : les déclencheurs sont des énumérations fermées du
 * schéma Arbiter. Le mapper NE SÉLECTIONNE AUCUN VERROU : il émet des signaux
 * que `selectAdaptiveLocks` consommera en aval.
 * ---------------------------------------------------------------------- */

const TREATMENT_SIGNALS = Object.freeze({
  research: "provenance",
  estimate: "assumptions",
  scenario: "assumptions",
  condition: "assumptions",
  leave_unknown: "assumptions"
});

function buildSemanticLockSignals({ assumptionsAllowed, externalFacts, issues }) {
  const byId = new Map();
  const add = (id, reason, sourceIds) => {
    const existing = byId.get(id);
    if (existing) {
      for (const sourceId of sourceIds) if (!existing.source_ids.includes(sourceId)) existing.source_ids.push(sourceId);
      return;
    }
    byId.set(id, {
      id,
      needed: true,
      reason,
      priority: "useful",
      source: "runtime",
      source_ids: [...sourceIds],
      associated_checks: []
    });
  };

  if (assumptionsAllowed.length) {
    add("assumptions", "Des hypothèses ont été explicitement autorisées ; elles doivent rester déclarées.", []);
  }
  if (externalFacts.length) {
    add("provenance", "Des faits externes restent à rechercher ; leur statut doit rester distinct des faits établis.", []);
  }
  for (const issue of list(issues)) {
    const id = TREATMENT_SIGNALS[text(issue?.recommended_treatment)];
    if (!id) continue;
    add(id, "Le traitement recommandé pour au moins un obstacle impose de rendre ce cadrage explicite.", [text(issue?.id)].filter(Boolean));
  }

  return [...byId.values()];
}

/* -------------------------------------------------------------------------
 * MAPPER
 * ---------------------------------------------------------------------- */

/**
 * @param {object} arbiterOutput  sortie Arbiter validée par validateArbiterOutput
 * @param {object} options        { request_id, original_request }
 * @returns {object} contrat canonique
 */
export function mapOprieToCanonicalContract(arbiterOutput, { request_id, original_request } = {}) {
  if (!arbiterOutput || typeof arbiterOutput !== "object" || Array.isArray(arbiterOutput)) {
    throw new TypeError("ADN-CANON-01 : une sortie Arbiter est requise.");
  }
  const state = text(arbiterOutput.state);
  if (!OPRIE_STATES.includes(state)) {
    throw new TypeError(`ADN-CANON-01 : état OPRIE invalide (${state || "vide"}).`);
  }
  const originalRequest = text(original_request);
  if (!originalRequest) {
    throw new TypeError("ADN-CANON-01 : la demande originale est obligatoire et ne peut pas être dérivée du candidat.");
  }
  const requestId = text(request_id);
  if (!requestId) throw new TypeError("ADN-CANON-01 : un request_id est requis.");

  const candidate = arbiterOutput.operational_request_candidate && typeof arbiterOutput.operational_request_candidate === "object"
    ? arbiterOutput.operational_request_candidate
    : {};
  const preservation = arbiterOutput.intent_preservation && typeof arbiterOutput.intent_preservation === "object"
    ? arbiterOutput.intent_preservation
    : {};

  const { critical, substitutable } = routeIssues(arbiterOutput.issues);
  const assumptionsAllowed = strings(candidate.assumptions_allowed).map(oprieItem);
  const externalFacts = strings(candidate.external_facts_to_research).map((description) => ({
    description, source: "oprie", status: "to_research"
  }));

  /* L'exploitabilité canonique dérive STRICTEMENT de l'état OPRIE. Aucun autre
     état ne peut devenir exploitable ; la dérivation reste rétro-compatible avec
     l'énumération à deux valeurs du moteur ADN. */
  const executable = state === OPRIE_EXECUTABLE_STATE;

  const signals = buildSemanticLockSignals({ assumptionsAllowed, externalFacts, issues: arbiterOutput.issues });

  return {
    version: CANONICAL_CONTRACT_VERSION,
    request_id: requestId,

    /* La demande originale est la seule source de vérité du texte utilisateur.
       Le candidat OPRIE en est une lecture validée, jamais un remplacement. */
    original_request: originalRequest,

    intent: {
      objective: text(candidate.objective) || null,
      deliverable: text(candidate.expected_deliverable) || null,
      /* ADN-RECIPIENT-00 : aucun producteur générique n'existe. `null` signifie
         « non établi », jamais « sans objet ». Rien n'est déduit ici. */
      recipient: null,
      secondary_objectives: strings(candidate.secondary_objectives).map(oprieItem),
      explicit_constraints: strings(candidate.confirmed_constraints).map((value) => ({
        text: value, source: "oprie", confirmed: true, evidence_id: null
      })),
      priorities: strings(candidate.confirmed_priorities).map(oprieItem),
      preferences: strings(candidate.confirmed_preferences).map(oprieItem),
      delegated_decisions: strings(candidate.delegated_decisions).map(oprieItem),
      /* Bloc IMMUABLE. Le mapper le recopie et ne le « répare » jamais. */
      preservation: {
        objective_preserved: preservation.objective_preserved === true,
        priorities_preserved: preservation.priorities_preserved === true,
        semantic_equivalence: preservation.semantic_equivalence === true,
        concerns: strings(preservation.concerns),
        source: "oprie"
      },
      source: "oprie"
    },

    evidence: {
      /* OPRIE n'extrait pas de faits : le marqueur reste false, et une collection
         vide signifie « non évaluée », jamais « rien à trouver ». */
      extraction_performed: false,
      user_facts: [],
      material_facts: [],
      deductions: [],
      external_facts: externalFacts,
      provenance: [],
      external_knowledge_needed: externalFacts.length > 0,
      freshness_needed: false
    },

    executability: {
      /* Copie EXACTE de l'état OPRIE : les quatre états sont préservés sans perte. */
      oprie_state: state,
      /* Dérivation stricte, rétro-compatible avec l'énumération du moteur ADN. */
      state: executable ? "exploitable" : "clarification_necessaire",
      /* Vrai parce qu'OPRIE a réellement évalué la demande — jamais par défaut. */
      evaluated: true,
      confidence: null,
      critical_missing: critical,
      substitutable_missing: substitutable,
      remaining_unknowns: strings(candidate.remaining_unknowns).map(oprieItem),
      source: "oprie"
    },

    assumptions: {
      /* Seule `allowed` vient d'OPRIE. `forbidden` et `explicit` restent vides :
         elles appartiennent à l'enrichissement Architecte. Aucun marqueur dédié
         ici — l'absence de marqueur signifie qu'AUCUNE affirmation d'évaluation
         complète n'est faite sur cette famille. */
      allowed: assumptionsAllowed,
      forbidden: [],
      explicit: []
    },

    /* OPRIE ne produit ni obligation, ni quantité, ni sortie, ni contrôle.
       Une collection vide signifie « aucune donnée présente » — jamais
       « évaluée », « complète » ni « validée ». Aucun marqueur surnuméraire :
       le futur Quality Gate devra apporter ses propres preuves. */
    obligations: [],
    quantities: [],
    output: { format: null, structure: [], opening: null, closing: null, length_policy: null, tone: null },
    checks: [],

    semantic_lock_signals: {
      signals,
      /* Les signaux génériques OPRIE ont bien été produits ; ceux qui exigent
         l'analyse Architecte (notamment `scope`) restent à venir. */
      signals_produced: true
    },

    /* La sélection appartient à l'ADN. Le mapper n'écrit jamais selected=true. */
    selected_locks: { locks: [], decisions: [] },

    adn_summary: {
      /* Texte d'audit et de provenance : aucune autorité supplémentaire. */
      readiness_rationale: text(arbiterOutput.reason) || null,
      source: "oprie"
    }
  };
}

/* -------------------------------------------------------------------------
 * VALIDATEUR — fail-closed.
 * ---------------------------------------------------------------------- */

function fail(problems, message) {
  problems.push(message);
}

/**
 * @param {object} contract        contrat produit par le mapper
 * @param {object} [reference]     { arbiterOutput, original_request } pour les contrôles de non-perte
 * @returns {{ok: boolean, problems: string[]}}
 */
export function validateCanonicalContract(contract, { arbiterOutput = null, original_request = null } = {}) {
  const problems = [];
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return { ok: false, problems: ["Contrat canonique absent ou illisible."] };
  }

  // 1-2. demande originale présente et préservée
  if (!text(contract.original_request)) fail(problems, "original_request vide.");
  if (original_request !== null && contract.original_request !== text(original_request)) {
    fail(problems, "original_request altérée par le mapping.");
  }

  // 5-6. état OPRIE valide, et seul READY est exploitable
  const oprieState = text(contract.executability?.oprie_state);
  if (!OPRIE_STATES.includes(oprieState)) fail(problems, `executability.oprie_state invalide (${oprieState || "vide"}).`);
  const executable = contract.executability?.state === "exploitable";
  if (executable !== (oprieState === OPRIE_EXECUTABLE_STATE)) {
    fail(problems, "Seul operational_request_ready peut produire un état exploitable.");
  }

  // 3-4. sur READY, objectif et livrable doivent être établis
  if (oprieState === OPRIE_EXECUTABLE_STATE) {
    if (!text(contract.intent?.objective)) fail(problems, "intent.objective vide sur une demande prête.");
    if (!text(contract.intent?.deliverable)) fail(problems, "intent.deliverable vide sur une demande prête.");
  }

  // 14. champs transitoires de dialogue absents du contrat
  const serialized = JSON.stringify(contract);
  for (const field of OPRIE_TRANSIENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(contract, field)) fail(problems, `${field} ne doit pas figurer dans le contrat.`);
    if (serialized.includes(`"${field}"`)) fail(problems, `${field} apparaît dans le contrat.`);
  }

  // 10. exact / min / max cohérents
  for (const quantity of list(contract.quantities)) {
    const hasExact = quantity?.exact !== null && quantity?.exact !== undefined;
    const hasRange = (quantity?.min ?? null) !== null || (quantity?.max ?? null) !== null;
    if (hasExact && hasRange) fail(problems, "Une quantité exacte ne peut pas porter min ou max.");
    if ((quantity?.min ?? null) !== null && (quantity?.max ?? null) !== null && quantity.min > quantity.max) {
      fail(problems, "Quantité incohérente : min > max.");
    }
  }

  // 11. provenance valide partout où elle est déclarée
  const checkSources = (value, path) => {
    if (Array.isArray(value)) { value.forEach((item, i) => checkSources(item, `${path}[${i}]`)); return; }
    if (!value || typeof value !== "object") return;
    if (typeof value.source === "string" && !CANONICAL_SOURCES.includes(value.source)) {
      fail(problems, `Provenance invalide en ${path}.source : ${value.source}.`);
    }
    for (const [key, child] of Object.entries(value)) {
      /* Les signaux sémantiques relèvent de leur propre énumération, contrôlée
         juste après : les inclure ici confondrait deux vocabulaires distincts. */
      if (key !== "source" && key !== "semantic_lock_signals") checkSources(child, `${path}.${key}`);
    }
  };
  checkSources(contract, "contract");

  for (const [i, signal] of list(contract.semantic_lock_signals?.signals).entries()) {
    if (!SEMANTIC_SIGNAL_SOURCES.includes(signal?.source)) {
      fail(problems, `semantic_lock_signals.signals[${i}].source invalide : ${signal?.source}.`);
    }
    if (!SEMANTIC_SIGNAL_PRIORITIES.includes(signal?.priority)) {
      fail(problems, `semantic_lock_signals.signals[${i}].priority invalide : ${signal?.priority}.`);
    }
    if (signal?.needed !== true) fail(problems, `semantic_lock_signals.signals[${i}] doit être needed.`);
    if (!text(signal?.reason)) fail(problems, `semantic_lock_signals.signals[${i}] doit porter une raison.`);
  }

  // 13. aucune valeur par défaut promue en contrainte ou obligation utilisateur
  for (const item of list(contract.intent?.explicit_constraints)) {
    if (item?.source === "default" || item?.source === "system_policy") {
      fail(problems, "Une valeur par défaut ne peut pas devenir une contrainte utilisateur.");
    }
  }
  for (const item of list(contract.obligations)) {
    if (item?.source === "default") fail(problems, "Une valeur par défaut ne peut pas devenir une obligation.");
  }

  // les TROIS marqueurs officiels, présents et bien typés
  if (typeof contract.evidence?.extraction_performed !== "boolean") fail(problems, "evidence.extraction_performed manquant.");
  if (contract.executability?.evaluated !== true) fail(problems, "executability.evaluated doit refléter une évaluation OPRIE réelle.");
  if (typeof contract.semantic_lock_signals?.signals_produced !== "boolean") fail(problems, "semantic_lock_signals.signals_produced manquant.");

  /* Aucun marqueur d'évaluation hors des trois officiels. Un quatrième marqueur
     rouvrirait la porte au faux PASS que la gouvernance a fermée. */
  const walkMarkers = (value, path) => {
    if (Array.isArray(value)) { value.forEach((item, i) => walkMarkers(item, `${path}[${i}]`)); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const full = `${path}.${key}`.replace(/^contract\./, "");
      if (/^(extraction_performed|evaluated|signals_produced)$/.test(key) && !CANONICAL_EVALUATION_MARKERS.includes(full)) {
        fail(problems, `Marqueur d'évaluation non autorisé : ${full}.`);
      }
      walkMarkers(child, `${path}.${key}`);
    }
  };
  walkMarkers(contract, "contract");

  // 12. aucun verrou sélectionné par le mapping
  if (list(contract.selected_locks?.locks).length) fail(problems, "Le mapping OPRIE ne sélectionne aucun verrou.");

  if (arbiterOutput && typeof arbiterOutput === "object") {
    const candidate = arbiterOutput.operational_request_candidate || {};

    // 7. aucune contrainte confirmée perdue
    const expected = strings(candidate.confirmed_constraints);
    const actual = list(contract.intent?.explicit_constraints).map((item) => text(item?.text));
    if (expected.length !== actual.length || expected.some((value) => !actual.includes(value))) {
      fail(problems, "Une contrainte confirmée par OPRIE a été perdue ou altérée.");
    }

    // 8. assumptions.allowed est exactement l'ensemble OPRIE
    const allowedExpected = strings(candidate.assumptions_allowed);
    const allowedActual = list(contract.assumptions?.allowed).map((item) => text(item?.text));
    if (allowedExpected.length !== allowedActual.length || allowedExpected.some((v) => !allowedActual.includes(v))) {
      fail(problems, "assumptions.allowed diverge de l'autorisation OPRIE.");
    }

    // 9. aucune issue perdue
    const issueCount = list(arbiterOutput.issues).length;
    const mapped = list(contract.executability?.critical_missing).length + list(contract.executability?.substitutable_missing).length;
    if (issueCount !== mapped) fail(problems, "Une issue OPRIE a été perdue par le mapping.");

    // 12. intent.preservation recopié sans réparation
    const preservation = arbiterOutput.intent_preservation || {};
    const target = contract.intent?.preservation || {};
    for (const key of ["objective_preserved", "priorities_preserved", "semantic_equivalence"]) {
      if (target[key] !== (preservation[key] === true)) fail(problems, `intent.preservation.${key} altéré.`);
    }
    if (strings(preservation.concerns).length !== list(target.concerns).length) {
      fail(problems, "intent.preservation.concerns altéré.");
    }
  }

  return { ok: problems.length === 0, problems };
}

/** Vue d'audit sans contenu utilisateur, pour la traçabilité ADN. */
export function createCanonicalMappingAuditView(contract) {
  if (!contract || typeof contract !== "object") throw new TypeError("Contrat canonique requis.");
  return clone({
    version: contract.version,
    request_id: contract.request_id,
    oprie_state: contract.executability?.oprie_state ?? null,
    executable: contract.executability?.state === "exploitable",
    evaluated: contract.executability?.evaluated === true,
    extraction_performed: contract.evidence?.extraction_performed === true,
    signals_produced: contract.semantic_lock_signals?.signals_produced === true,
    counts: {
      secondary_objectives: list(contract.intent?.secondary_objectives).length,
      explicit_constraints: list(contract.intent?.explicit_constraints).length,
      priorities: list(contract.intent?.priorities).length,
      preferences: list(contract.intent?.preferences).length,
      delegated_decisions: list(contract.intent?.delegated_decisions).length,
      external_facts: list(contract.evidence?.external_facts).length,
      assumptions_allowed: list(contract.assumptions?.allowed).length,
      critical_missing: list(contract.executability?.critical_missing).length,
      substitutable_missing: list(contract.executability?.substitutable_missing).length,
      remaining_unknowns: list(contract.executability?.remaining_unknowns).length,
      semantic_lock_signals: list(contract.semantic_lock_signals?.signals).length
    }
  });
}

/* -------------------------------------------------------------------------
 * PROJECTION BASE → ENVELOPPE
 *
 * Unique passerelle entre le Canonical Base Contract et buildExecutionEnvelope().
 * Elle existe pour que l'enveloppe CONSOMME la base au lieu de reconstruire une
 * sémantique concurrente à partir d'arguments épars. Toute évolution de la base
 * se répercute ici, en un seul point.
 * ---------------------------------------------------------------------- */

/** Vrai si l'objet a la forme d'un Canonical Base Contract. */
export function isCanonicalBaseContract(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof value.original_request === "string"
    && !!value.intent && typeof value.intent === "object"
    && !!value.executability && typeof value.executability === "object"
    && OPRIE_STATES.includes(text(value.executability.oprie_state));
}

/**
 * Projette un Canonical Base Contract vers les entrées attendues par
 * buildExecutionEnvelope(). Les normaliseurs du moteur ADN attendent des
 * chaînes : la projection les extrait des structures tracées de la base.
 * La base reste la source de vérité ; l'enveloppe en est une lecture.
 */
export function canonicalBaseToEnvelopeInput(base) {
  if (!isCanonicalBaseContract(base)) throw new TypeError("Canonical Base Contract requis.");
  const items = (collection, key = "text") => list(collection).map((item) => text(item?.[key])).filter(Boolean);

  return {
    request: base.original_request,
    intent: {
      objective: base.intent.objective || "",
      deliverable: base.intent.deliverable || null,
      recipient: base.intent.recipient || null,
      explicit_constraints: items(base.intent.explicit_constraints)
    },
    evidence: clone(base.evidence) || {},
    executability: {
      critical_missing: items(base.executability.critical_missing, "description"),
      substitutable_missing: items(base.executability.substitutable_missing, "description")
    },
    assumptions: items(base.assumptions?.allowed),
    obligations: clone(base.obligations) || [],
    quantities: clone(base.quantities) || [],
    output: clone(base.output) || {},
    checks: clone(base.checks) || [],
    semantic_lock_signals: clone(base.semantic_lock_signals?.signals) || []
  };
}

/* -------------------------------------------------------------------------
 * ADN-CANON-02 — VALIDATEUR DE CONVERGENCE BASE ↔ ENVELOPPE
 *
 * Prouve qu'une Execution Envelope construite depuis un Canonical Base Contract
 * n'a perdu aucune donnée sémantique. Les pertes de PRÉSENTATION (la projection
 * vers l'état ADN aplatit les structures tracées en chaînes) sont admises et
 * documentées ; toute perte SÉMANTIQUE est un échec.
 * ---------------------------------------------------------------------- */

/** Champs sémantiques dont la disparition est INACCEPTABLE. */
export const CANONICAL_SEMANTIC_FIELDS = Object.freeze([
  "original_request",
  "intent.objective", "intent.deliverable", "intent.secondary_objectives",
  "intent.explicit_constraints", "intent.priorities", "intent.preferences",
  "intent.delegated_decisions", "intent.preservation",
  "executability.oprie_state", "executability.state", "executability.evaluated",
  "executability.critical_missing", "executability.substitutable_missing",
  "executability.remaining_unknowns",
  "assumptions.allowed",
  "evidence.external_facts"
]);

/** Pertes admises, classées : elles ne portent aucune sémantique de la demande. */
export const ACCEPTED_PRESENTATION_LOSSES = Object.freeze([
  { field: "intent.explicit_constraints[].source", classification: "AUDIT_METADATA_LOSS",
    reason: "L'état ADN aplatit les contraintes tracées en chaînes ; la base conserve la provenance." },
  { field: "executability.*_missing[].{id,type,kind,impact,substitutable,recommended_treatment}",
    classification: "AUDIT_METADATA_LOSS",
    reason: "L'état ADN ne retient que la description ; la base conserve les sept champs d'issue." },
  { field: "assumptions.allowed[].source", classification: "AUDIT_METADATA_LOSS",
    reason: "L'état ADN aplatit les hypothèses en chaînes ; la base conserve la provenance." },
  { field: "evidence.external_facts[] dans contract.evidence", classification: "SAFE_PRESENTATION_LOSS",
    reason: "contract.evidence n'expose que le booléen dérivé ; la liste reste entière dans la base attachée." }
]);

const at = (root, dotted) => dotted.split(".").reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), root);

/**
 * @param {object} base      Canonical Base Contract
 * @param {object} envelope  Execution Envelope produite depuis cette base
 * @returns {{ok:boolean, problems:string[], semantic_loss_count:number, accepted_losses:number}}
 */
export function validateCanonicalEnvelopeConvergence(base, envelope) {
  const problems = [];
  if (!isCanonicalBaseContract(base)) {
    return { ok: false, problems: ["Canonical Base Contract absent ou illisible."], semantic_loss_count: 1, accepted_losses: 0 };
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { ok: false, problems: ["Execution Envelope absente ou illisible."], semantic_loss_count: 1, accepted_losses: 0 };
  }

  const attached = envelope.canonical_base;
  if (!attached) {
    fail(problems, "L'enveloppe ne porte pas la base canonique : la sémantique serait perdue.");
    return { ok: false, problems, semantic_loss_count: CANONICAL_SEMANTIC_FIELDS.length, accepted_losses: 0 };
  }

  /* Aucun champ sémantique ne peut diverger entre la base et sa copie attachée. */
  let lost = 0;
  for (const field of CANONICAL_SEMANTIC_FIELDS) {
    const expected = JSON.stringify(at(base, field) ?? null);
    const actual = JSON.stringify(at(attached, field) ?? null);
    if (expected !== actual) { fail(problems, `Perte ou altération sémantique : ${field}.`); lost += 1; }
  }

  /* Les champs que l'état ADN sait porter doivent effectivement provenir de la base. */
  const contract = envelope.contract || {};
  if (text(contract.original_request) !== text(base.original_request)) {
    fail(problems, "original_request de l'enveloppe diverge de la base."); lost += 1;
  }
  if (text(contract.intent?.objective) !== text(base.intent.objective || "")) {
    fail(problems, "intent.objective de l'enveloppe diverge de la base."); lost += 1;
  }
  const deliverable = base.intent.deliverable || null;
  if ((contract.intent?.deliverable ?? null) !== deliverable) {
    fail(problems, "intent.deliverable de l'enveloppe diverge de la base."); lost += 1;
  }
  const baseConstraints = list(base.intent.explicit_constraints).map((item) => text(item?.text));
  const envConstraints = list(contract.intent?.explicit_constraints).map((item) => text(typeof item === "string" ? item : item?.text));
  if (baseConstraints.length !== envConstraints.length || baseConstraints.some((v) => !envConstraints.includes(v))) {
    fail(problems, "Une contrainte explicite a été perdue par l'enveloppe."); lost += 1;
  }
  const baseAssumptions = list(base.assumptions?.allowed).map((item) => text(item?.text));
  const envAssumptions = list(contract.assumptions).map((item) => text(typeof item === "string" ? item : item?.text));
  if (baseAssumptions.some((v) => !envAssumptions.includes(v))) {
    fail(problems, "Une hypothèse autorisée a été perdue par l'enveloppe."); lost += 1;
  }

  /* La readiness ne peut jamais être promue en aval. */
  const executable = base.executability.oprie_state === OPRIE_EXECUTABLE_STATE;
  if (!executable && envelope.state?.executability?.state === "exploitable") {
    fail(problems, "L'enveloppe a promu une readiness que la base n'accorde pas."); lost += 1;
  }

  /* Aucun champ transitoire de dialogue ne peut réapparaître en aval. */
  const serialized = JSON.stringify(envelope);
  for (const field of OPRIE_TRANSIENT_FIELDS) {
    if (serialized.includes(`"${field}"`)) { fail(problems, `${field} réapparaît dans l'enveloppe.`); lost += 1; }
  }

  /* Aucune contrainte utilisateur inventée en aval. */
  for (const value of envConstraints) {
    if (!baseConstraints.includes(value)) { fail(problems, `Contrainte inventée par l'enveloppe : ${value}.`); lost += 1; }
  }

  /* CORRECTION-ADN-CANON-02-01 — contrôles de readiness. */
  const readinessRule = CANONICAL_READINESS_MATRIX[text(base.executability.oprie_state)];
  const envState = envelope.state?.executability?.state ?? null;
  const envRoute = envelope.routing?.route ?? null;

  if (readinessRule && envState !== null && envState !== readinessRule.state) {
    fail(problems, envState === "exploitable"
      ? "Readiness promue en aval : l'enveloppe déclare exploitable une base qui ne l'est pas."
      : "Readiness démotée silencieusement : l'enveloppe contredit une base exploitable.");
    lost += 1;
  }
  if (readinessRule && !readinessRule.route_allowed && envRoute !== null) {
    fail(problems, `Route active (${envRoute}) sur une base non exploitable.`); lost += 1;
  }
  if (text(attached.executability?.oprie_state) !== text(base.executability.oprie_state)) {
    fail(problems, "executability.oprie_state altéré dans la base attachée."); lost += 1;
  }
  if (attached.executability?.state !== base.executability.state) {
    fail(problems, "executability.state altéré dans la base attachée."); lost += 1;
  }
  if (JSON.stringify(attached) !== JSON.stringify(base)) {
    fail(problems, "La base attachée diverge de la base d'origine : mutation en aval."); lost += 1;
  }

  return {
    ok: problems.length === 0,
    problems,
    semantic_loss_count: lost,
    accepted_losses: ACCEPTED_PRESENTATION_LOSSES.length
  };
}

/* -------------------------------------------------------------------------
 * CORRECTION-ADN-CANON-02-01 — GARDE CENTRALE DE READINESS
 *
 * Quand un Canonical Base Contract est présent, il est l'UNIQUE source de
 * readiness. Aucune décision de fournisseur, aucune route, aucun argument
 * legacy, aucun défaut et aucun mode ne peut la promouvoir ni la démoter.
 *
 * Choix explicite sur les contradictions : FAIL CLOSED dans les DEUX sens.
 * Une donnée aval qui contredit la base est une incohérence d'appelant, pas
 * une préférence à arbitrer. Une fusion silencieuse — dans un sens comme dans
 * l'autre — rendrait l'invariant indémontrable.
 * ---------------------------------------------------------------------- */

/** Matrice officielle des quatre états. Aucune autre combinaison n'existe. */
export const CANONICAL_READINESS_MATRIX = Object.freeze({
  operational_request_ready: { state: "exploitable", route_allowed: true },
  clarification_required: { state: "clarification_necessaire", route_allowed: false },
  confirmation_required: { state: "clarification_necessaire", route_allowed: false },
  blocked: { state: "clarification_necessaire", route_allowed: false }
});

/**
 * Vérifie l'invariant et RENVOIE la décision imposée par la base.
 * L'appelant doit utiliser cette décision, jamais la sienne.
 *
 * @throws {TypeError} sur toute contradiction ou incohérence — fail closed.
 */
export function assertCanonicalReadinessInvariant(canonicalBase, providerResult = null) {
  if (!isCanonicalBaseContract(canonicalBase)) {
    throw new TypeError("Garde readiness : Canonical Base Contract requis.");
  }
  const executability = canonicalBase.executability;
  const oprieState = text(executability.oprie_state);
  const rule = CANONICAL_READINESS_MATRIX[oprieState];
  if (!rule) throw new TypeError(`Garde readiness : état OPRIE invalide (${oprieState || "vide"}).`);

  if (executability.state !== rule.state) {
    throw new TypeError(
      `Garde readiness : ${oprieState} impose executability.state=${rule.state}, trouvé ${executability.state}.`
    );
  }
  if (executability.evaluated !== true) {
    throw new TypeError("Garde readiness : une base non évaluée ne peut produire aucune enveloppe.");
  }

  const executable = rule.state === "exploitable";
  const supplied = providerResult && typeof providerResult === "object" && providerResult.decision && typeof providerResult.decision === "object"
    ? providerResult.decision
    : null;

  const suppliedState = supplied ? text(supplied.etat_demande) : "";
  const suppliedRoute = supplied ? (supplied.route ?? null) : null;
  const canonicalState = executable ? "exploitable" : "clarification_necessaire";

  /* Contradiction d'état, dans les deux sens : promotion ET démotion. */
  if (suppliedState && suppliedState !== canonicalState) {
    throw new TypeError(
      `Garde readiness : la base impose ${canonicalState} (${oprieState}) ; l'appelant a fourni ${suppliedState}. `
      + "Aucune fusion n'est possible : corrigez l'appelant."
    );
  }

  /* Une base non exploitable n'autorise aucune route active. */
  if (!rule.route_allowed && suppliedRoute !== null) {
    throw new TypeError(
      `Garde readiness : ${oprieState} interdit toute route active ; l'appelant a fourni « ${suppliedRoute} ».`
    );
  }

  /* Une base exploitable exige une route, décidée par la couche de routage —
     jamais par la base, qui reste indépendante du mode. */
  if (rule.route_allowed && suppliedRoute === null) {
    throw new TypeError(
      "Garde readiness : une base exploitable exige une route fournie par la couche de routage."
    );
  }

  return {
    etat_demande: canonicalState,
    route: rule.route_allowed ? suppliedRoute : null,
    confiance: supplied && text(supplied.confiance) ? supplied.confiance : "haute",
    raison_interne: "Readiness reprise du contrat canonique ; aucune dérivation aval.",
    question: null
  };
}

/** Nombre de sources de readiness actives. Toujours 1 avec une base canonique. */
export function activeReadinessSourceCount(canonicalBase) {
  return isCanonicalBaseContract(canonicalBase) ? 1 : 0;
}
