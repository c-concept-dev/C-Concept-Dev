import { buildAdnState, adnStateToExecutionContractSnapshot } from './adn-state.js';
import { canonicalBaseToEnvelopeInput, assertCanonicalReadinessInvariant } from './oprie-canonical-mapping.js';
import { selectAdaptiveLocks, validateAdaptiveLockSelection } from './adaptive-lock-selector.js';
import { routeExecution, validateRoutingDecision } from './routing-engine.js';
import { contractForContractualization } from './execution-readiness.js';

export const ENGINE_ADAPTERS_VERSION = '1.0';

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

/* CORRECTION-ADN-CANON-01-01 — L'ENVELOPPE CONSOMME LA BASE CANONIQUE.
 *
 *   CANONICAL BASE CONTRACT  sémantique pure, sans mode ni routing
 *   EXECUTION ENVELOPE       cette fonction : base + decision + routing + locks
 *                            + execution_policy + ethics + adn_summary
 *
 * Quand `canonical_base` est fourni, TOUTES les entrées sémantiques en sont
 * dérivées par l'unique projection `canonicalBaseToEnvelopeInput()`. Aucune
 * seconde sémantique n'est reconstruite ici. Sans `canonical_base`, la signature
 * historique reste opérante à l'identique — la migration des appelants relève
 * d'ADN-CANON-02. */
export function buildExecutionEnvelope({
  request,
  material = '',
  provider_result = null,
  canonical_base = null,
  /* ADN-RAPIDE-FEED-00 — ALIMENTATION SANS MIGRATION.
   * `true` (défaut, comportement inchangé) : la base canonique est la source des
   * entrées sémantiques de l'état ADN.
   * `false` : la base est ATTACHÉE et gouverne la READINESS, mais les entrées
   * sémantiques restent celles de l'appelant. C'est le palier transitoire du
   * chemin Rapide : la base y devient disponible et la promotion y devient
   * impossible, AVANT que ADN-RAPIDE-01 ne migre la projection elle-même.
   * Dans les deux cas la readiness vient de la base, jamais d'un repli. */
  canonical_semantics = true,
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
  /* ADN-CANON-02 — AUCUNE PERTE SÉMANTIQUE.
   * Les normaliseurs du moteur ADN ne savent porter qu'un sous-ensemble de la
   * base (chaînes, sans provenance). Faire transiter TOUTE la base par eux
   * perdrait secondary_objectives, priorities, preferences, delegated_decisions,
   * remaining_unknowns, la liste external_facts et oprie_state — sept pertes
   * sémantiques. L'enveloppe ATTACHE donc la base verbatim, en plus de la
   * projeter vers l'état ADN : la base reste intégralement lisible en aval.
   * C'est la traduction littérale de « enveloppe = base + couches aval ». */
  const attachedBase = canonical_base !== null ? clone(canonical_base) : null;

  if (canonical_base !== null) {
    /* La DEMANDE ORIGINALE vient toujours de la base, même en simple
       alimentation : elle est l'identité de la demande, pas un détail de
       projection, et aucun appelant ne peut la réécrire. */
    request = attachedBase.original_request;
  }
  if (canonical_base !== null && canonical_semantics !== false) {
    const projected = canonicalBaseToEnvelopeInput(canonical_base);
    request = projected.request;
    intent = projected.intent;
    evidence = projected.evidence;
    executability = projected.executability;
    assumptions = projected.assumptions;
    obligations = projected.obligations;
    quantities = projected.quantities;
    output = projected.output;
    checks = projected.checks;
    semantic_lock_signals = projected.semantic_lock_signals;
  }

  const originalRequest = text(request);
  if (!originalRequest) throw new TypeError('Une demande est requise pour construire l’enveloppe d’exécution.');

  const provider = normalizeProvider(provider_result);
  /* CORRECTION-ADN-CANON-02-01 — GARDE CENTRALE.
   * Avec une base canonique, la readiness vient d'elle et d'elle seule. Le
   * repli fallbackDecision() — qui promeut en `exploitable` + route `rapide` —
   * est structurellement hors d'atteinte sur ce chemin. Toute contradiction
   * d'un appelant échoue fermé, dans les deux sens. */
  const decisionForState = attachedBase !== null
    ? assertCanonicalReadinessInvariant(attachedBase, provider_result)
    : (provider.available ? provider.decision : fallbackDecision(provider_result));

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
    contract,
    /* La base canonique voyage intacte : l'enveloppe est « base + couches aval »,
       jamais une réduction de la base. `null` quand l'appelant n'en fournit pas
       (chemins legacy transitoires). */
    canonical_base: attachedBase
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

export function projectToRapide(envelope, { material = '', format = null, level = null } = {}) {
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

export function projectToArchitecte(envelope, { material = '', preferences = '' } = {}) {
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

export function projectToAtelier(envelope, { material = '' } = {}) {
  const base = baseProjection(envelope);
  return clone({
    ...base,
    engine: 'atelier',
    material: text(material),
    user_controlled: true
  });
}

export function validateLegacyLockMapping() {
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

export function createAdapterAuditView(envelope) {
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
