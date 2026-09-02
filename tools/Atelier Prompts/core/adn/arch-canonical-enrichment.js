/* ADN-ARCH-01 — ENRICHISSEMENT ARCHITECTE DU CANONICAL BASE CONTRACT
 * ============================================================================
 *
 * archAnalyse (3.4) + Canonical Base Contract → contrat enrichi + signaux.
 *
 * INVARIANT CENTRAL, qui prime sur toute liste énumérative :
 *
 *   TOUT CHAMP ALIMENTÉ PAR OPRIE EST EN LECTURE SEULE POUR ARCHITECTE.
 *   Architecte peut READ · COMPARE · VALIDATE · SIGNAL. Jamais WRITE, REMOVE,
 *   OVERRIDE ni ADD dans un champ OPRIE.
 *
 * La garde d'appartenance est GÉNÉRIQUE : l'enrichissement ne peut écrire que
 * dans une liste blanche de chemins non-OPRIE, et le validateur compare les
 * deux contrats chemin par chemin. Tout champ canonique ajouté demain sera donc
 * protégé par construction, sans qu'aucune liste ait à être maintenue.
 *
 * Ce module est PUR et DÉTERMINISTE : ni LLM, ni réseau, ni DOM, ni fournisseur,
 * ni branchement de mode. Il ne décide aucune readiness et ne pose aucune
 * question — seule OPRIE le peut.
 */

import { OPRIE_TRANSIENT_FIELDS, isCanonicalBaseContract } from './oprie-canonical-mapping.js';

export const ARCH_ENRICHMENT_VERSION = '1.0';

/** Les SEULS chemins que l'enrichissement Architecte peut écrire. Tout le reste
 *  du contrat appartient à OPRIE et reste strictement inchangé. */
export const ARCH_ENRICHABLE_PATHS = Object.freeze([
  'evidence.user_facts',
  'evidence.material_facts',
  'evidence.deductions',
  'evidence.external_unverified',
  'evidence.provenance',
  'evidence.extraction_performed',
  'assumptions.forbidden',
  'assumptions.explicit',
  'obligations',
  'quantities',
  'output.format',
  'output.structure',
  'output.tone',
  'output.length_policy',
  'output.sources',
  'checks',
  'semantic_lock_signals.signals',
  'semantic_lock_signals.signals_produced',
  /* ADN-ARCH-02 — le rôle d'exécution est produit par Architecte et par personne
     d'autre : OPRIE ne l'écrit jamais. Le porter dans le contrat canonique est ce
     qui permet au compilateur d'avoir UNE seule source sémantique aval. */
  'execution_role'
]);

/* ADN-ARCH-02 — SOURCE SÉMANTIQUE UNIQUE DU COMPILATEUR ARCHITECTE.
 * Déclarée ici, à côté de l'enrichisseur qui la produit, pour qu'aucun
 * consommateur aval n'ait à la redéclarer — donc à en inventer une seconde. */
export const ARCH_COMPILER_SEMANTIC_SOURCE = 'ENRICHED_CANONICAL_CONTRACT';

/** Les quatre signaux, inchangés. Aucun cinquième n'existe.
 *  L'ordre est celui de la gravité déclarée : il fixe le signal représentatif
 *  d'un arrêt, donc le message montré à la personne. */
export const ARCH_SIGNALS = Object.freeze([
  'CONTRACT_INCONSISTENT', 'EXECUTION_UNSAFE', 'MISSING_PROJECTION_DATA', 'TECHNICAL_STOP'
]);

/**
 * CORRECTION-ADN-ARCH-01-01 — politique officielle des quatre signaux.
 *
 * Les quatre BLOQUENT l'exécution. Aucun ne décide de readiness et aucun ne pose
 * de question : un signal dit seulement « l'exécution ne peut pas continuer
 * sûrement sous le contrat canonique courant ». Seule OPRIE décide d'un état.
 */
export const ARCH_SIGNAL_POLICY = Object.freeze({
  CONTRACT_INCONSISTENT:   Object.freeze({ block_execution: true, return_to_oprie: true,  technical_retry: false }),
  EXECUTION_UNSAFE:        Object.freeze({ block_execution: true, return_to_oprie: true,  technical_retry: false }),
  MISSING_PROJECTION_DATA: Object.freeze({ block_execution: true, return_to_oprie: false, technical_retry: true }),
  TECHNICAL_STOP:          Object.freeze({ block_execution: true, return_to_oprie: false, technical_retry: true })
});

/**
 * Fusion déterministe des signaux post-OPRIE, quelle qu'en soit l'étape d'origine.
 *
 * - Déduplication sur (signal, canonical_field, arch_source_field) : un même
 *   défaut relevé par deux étapes ne produit jamais deux arrêts.
 * - Aucun signal distinct n'est perdu.
 * - Un signal invalide — type inconnu, ou sans preuve structurelle — n'est jamais
 *   ignoré en silence : il devient un TECHNICAL_STOP portant sa propre trace.
 * - `return_to_oprie` est normalisé par la politique : deux étapes ne peuvent pas
 *   diverger sur la conduite à tenir.
 * - Tri par gravité déclarée, puis par ordre de première apparition : la sortie
 *   est stable pour une même entrée.
 */
export function mergePostOprieSignals(...groups) {
  const merged = new Map();
  let seen = 0;
  const remember = (candidate) => {
    const kind = ARCH_SIGNALS.includes(candidate?.signal) ? candidate.signal : null;
    const canonicalField = text(candidate?.canonical_field) || null;
    const archField = text(candidate?.arch_source_field) || null;
    const valid = kind !== null && (canonicalField || archField);
    const entry = valid
      ? {
          signal: kind,
          canonical_field: canonicalField,
          arch_source_field: archField,
          detail: String(candidate?.detail || ''),
          return_to_oprie: ARCH_SIGNAL_POLICY[kind].return_to_oprie,
          block_execution: true
        }
      : {
          /* FAIL CLOSED : un signal sans type ou sans preuve reste un arrêt. */
          signal: 'TECHNICAL_STOP',
          canonical_field: canonicalField,
          arch_source_field: archField || 'signals',
          detail: `Signal post-OPRIE invalide, converti en arrêt technique : ${JSON.stringify(candidate ?? null)}.`,
          return_to_oprie: false,
          block_execution: true
        };
    const key = `${entry.signal}|${entry.canonical_field || ''}|${entry.arch_source_field || ''}`;
    if (!merged.has(key)) merged.set(key, { order: seen++, entry });
  };

  for (const group of groups) for (const candidate of list(group)) remember(candidate);

  return [...merged.values()]
    .sort((a, b) => (ARCH_SIGNALS.indexOf(a.entry.signal) - ARCH_SIGNALS.indexOf(b.entry.signal)) || (a.order - b.order))
    .map((x) => x.entry);
}

/* Énumérations fermées du schéma 3.4. Une valeur inconnue n'est jamais acceptée
 * en silence : elle produit un signal. Aucun vocabulaire métier n'intervient. */
export const DECLARATION_STATUS_MAP = Object.freeze({
  declaration_utilisateur: 'user_facts',
  affirmation_du_materiau: 'material_facts',
  deduction_llm: 'deductions',
  connaissance_externe_non_verifiee: 'external_unverified',
  preference_confirmee: null   // appartient à intent.preferences, sous autorité OPRIE
});

export const PROVENANCE_STATUS_MAP = Object.freeze({
  soutenue: 'supported',
  hypothese: 'hypothesis',
  information_manquante: 'missing',
  connaissance_externe_non_verifiee: 'external_unverified'
});

export const FONDEMENT_NATURES = Object.freeze([
  'utilisateur', 'materiau', 'preference', 'deduction', 'hypothese', 'connaissance_externe_non_verifiee'
]);

/** Types structurels des composants 3.4. Énumération fermée, aucun mot du contenu. */
export const COMPONENT_TYPES = Object.freeze([
  'section', 'instruction', 'donnee', 'contrainte', 'hypothese', 'interdiction', 'critere', 'verification'
]);

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const texts = (items, key = 'text') => list(items).map((i) => text(i?.[key])).filter(Boolean);

function signal(kind, canonicalField, archSourceField, detail, returnToOprie) {
  if (!ARCH_SIGNALS.includes(kind)) throw new TypeError(`Signal Architecte inconnu : ${kind}.`);
  /* BLOCKING_SIGNAL_HAS_STRUCTURAL_PROOF : un signal sans preuve n'existe pas. */
  if (!canonicalField && !archSourceField) {
    throw new TypeError(`Signal ${kind} sans preuve structurelle : canonical_field et arch_source_field sont nuls.`);
  }
  return {
    signal: kind,
    canonical_field: canonicalField || null,
    arch_source_field: archSourceField || null,
    detail: String(detail || ''),
    return_to_oprie: returnToOprie === true
  };
}

/* -------------------------------------------------------------------------
 * DIFF DE CHEMINS — cœur de la garde générique d'appartenance
 * ---------------------------------------------------------------------- */

/** Renvoie la liste des chemins dont la valeur diffère entre deux objets. */
export function changedPaths(before, after, prefix = '') {
  const out = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const a = before?.[key];
    const b = after?.[key];
    const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (plain(a) && plain(b)) {
      out.push(...changedPaths(a, b, path));
    } else if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      out.push(path);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------
 * ENRICHISSEMENT
 * ---------------------------------------------------------------------- */

function assertAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
    return { field: 'archAnalyse', detail: 'Analyse Architecte absente ou illisible.' };
  }
  for (const bloc of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation', 'verification']) {
    if (!analysis[bloc] || typeof analysis[bloc] !== 'object') {
      /* La preuve nomme le bloc : le validateur frontend cite exactement la même,
         donc les deux constats fusionnent en un unique arrêt. */
      return { field: bloc, detail: `Bloc d’analyse obligatoire absent : ${bloc}.` };
    }
  }
  return null;
}

/** Traduit les déclarations 3.4 vers les familles d'evidence. Bijection d'énumérations. */
function enrichEvidence(analysis, target, signals) {
  const buckets = { user_facts: [], material_facts: [], deductions: [], external_unverified: [] };

  list(analysis.comprehension.declarations).forEach((declaration, index) => {
    const statut = text(declaration?.statut);
    if (!(statut in DECLARATION_STATUS_MAP)) {
      /* Une valeur hors énumération est une violation du schéma 3.4, donc un
         défaut TECHNIQUE de la production d'analyse — pas une divergence de
         contrat. Elle bloque et autorise un nouvel essai. */
      signals.push(signal('TECHNICAL_STOP', 'evidence',
        `comprehension.declarations[${index}].statut`,
        `Statut de déclaration hors énumération : ${statut || 'vide'}.`, false));
      return;
    }
    const bucket = DECLARATION_STATUS_MAP[statut];
    if (!bucket) return; // preference_confirmee : sous autorité OPRIE, jamais repris ici
    const content = text(declaration?.contenu);
    if (!content) return;
    buckets[bucket].push({
      text: content,
      type: bucket === 'external_unverified' ? 'external_fact' : bucket.replace(/s$/, ''),
      source: 'arch_analysis',
      origin_field: `comprehension.declarations[${index}]`,
      citation: text(declaration?.preuve?.citation) || null,
      /* Aucun fait externe ne peut être « vérifié » depuis archAnalyse seul :
         le schéma 3.4 ne possède aucun statut de vérification. */
      verification_status: bucket === 'external_unverified' ? 'unverified' : 'declared'
    });
  });

  for (const [bucket, items] of Object.entries(buckets)) {
    if (items.length) target.evidence[bucket] = items;
  }

  const provenance = [];
  list(analysis.verification.controle_provenance).forEach((entry, index) => {
    const statut = text(entry?.statut);
    if (!(statut in PROVENANCE_STATUS_MAP)) {
      signals.push(signal('TECHNICAL_STOP', 'evidence.provenance',
        `verification.controle_provenance[${index}].statut`,
        `Statut de provenance hors énumération : ${statut || 'vide'}.`, false));
      return;
    }
    provenance.push({
      statement_id: `arch-prov-${index}`,
      claim: text(entry?.affirmation),
      source_type: 'arch_analysis',
      source_ref: null,
      verification_status: PROVENANCE_STATUS_MAP[statut],
      arch_source_field: `verification.controle_provenance[${index}]`
    });
  });
  if (provenance.length) target.evidence.provenance = provenance;

  /* Le marqueur ne passe à true que parce que la famille evidence a réellement
     été parcourue ici — jamais par défaut, et jamais pour une autre famille. */
  target.evidence.extraction_performed = true;
}

function enrichAssumptions(analysis, target) {
  const forbidden = texts(list(analysis.strategie.hypotheses_interdites).map((t) => ({ text: t })));
  if (forbidden.length) {
    target.assumptions.forbidden = forbidden.map((value, i) => ({
      text: value, source: 'arch_analysis', origin_field: `strategie.hypotheses_interdites[${i}]`
    }));
  }
  const pilotage = analysis.strategie.pilotage_incertitude || {};
  const explicit = texts(list(pilotage.estimations_a_etiqueter).map((t) => ({ text: t })));
  if (explicit.length) {
    target.assumptions.explicit = explicit.map((value, i) => ({
      text: value, label: 'estimation', source: 'arch_analysis',
      origin_field: `strategie.pilotage_incertitude.estimations_a_etiqueter[${i}]`
    }));
  }
}

/** Enrichit la sortie SANS jamais toucher intent.deliverable, et sans écraser
 *  une valeur déjà établie par une autorité supérieure (USER / DERIVED). */
function enrichOutput(analysis, target) {
  const livrable = analysis.livrable || {};
  const setIfAbsent = (key, value) => {
    if (value && target.output[key] === null) {
      target.output[key] = value;
      /* La provenance est regroupée : des clés sœurs `*_source` sortiraient de
         la liste blanche et seraient — à juste titre — refusées par la garde. */
      target.output.sources = { ...(target.output.sources || {}), [key]: 'arch_analysis' };
    }
  };
  setIfAbsent('format', text(livrable.format_technique) || null);
  setIfAbsent('tone', text(livrable.ton) || null);
  setIfAbsent('length_policy', text(livrable.longueur_indicative) || null);

  if (!list(target.output.structure).length) {
    const sections = list(analysis.compilation.composants_retenus)
      .filter((c) => text(c?.type) === 'section')
      .map((c) => text(c?.titre))
      .filter(Boolean);
    if (sections.length) {
      target.output.structure = sections;
      target.output.sources = { ...(target.output.sources || {}), structure: 'arch_analysis' };
    }
  }
}

/** Une quantité ARCH n'enrichit que si aucune quantité d'autorité supérieure
 *  n'existe. Aucune fusion : exact et min/max restent mutuellement exclusifs.
 *
 *  CORRECTION-ADN-ARCH-01-01 : la mise à l'écart par précédence n'émet PLUS de
 *  signal. Depuis que tout signal bloque, en émettre un ici arrêterait un cas
 *  parfaitement légitime. La trace reste lisible dans le contrat lui-même, par
 *  `quantities[].source`, qui nomme l'autorité retenue. */
function enrichQuantities(analysis, target) {
  const q = analysis.livrable?.quantites;
  if (!q || typeof q !== 'object') return;
  const min = Number.isInteger(q.min) ? q.min : null;
  const max = Number.isInteger(q.max) ? q.max : null;
  if (min === null && max === null) return;

  if (list(target.quantities).length) return;   // USER / DERIVED priment, sans arrêt
  /* Le schéma 3.4 ne porte pas de champ `exact` : ARCH ne peut donc jamais
     produire une exactitude. La limite est de la source, pas du mapping. */
  target.quantities = [{
    target: text(q.unite) || 'éléments',
    unit: text(q.unite) || null,
    exact: null, min, max,
    source: 'arch_analysis'
  }];
}

/** Les critères de vérification gardent leur type réel : un critère qualitatif
 *  ne devient jamais un contrôle déterministe. */
function enrichChecks(analysis, target) {
  const checks = [];
  const push = (items, type, blocking, field) => {
    list(items).forEach((item, i) => {
      const rule = text(item);
      if (!rule) return;
      checks.push({
        id: `arch-${type}-${i}`, type, target: 'deliverable', rule, blocking,
        source: 'arch_analysis', arch_source_field: `${field}[${i}]`, obligation_ids: []
      });
    });
  };
  push(analysis.verification.criteres_bloquants, 'semantic', true, 'verification.criteres_bloquants');
  push(analysis.verification.criteres_qualitatifs, 'heuristic', false, 'verification.criteres_qualitatifs');
  push(analysis.verification.elements_non_verifiables, 'not_verifiable', false, 'verification.elements_non_verifiables');
  if (checks.length) target.checks = checks;
  return checks;
}

/** Promotion en obligation : trois conditions cumulatives, jamais automatique. */
function enrichObligations(analysis, target, checks) {
  const obligations = [];
  checks.filter((c) => c.blocking).forEach((check, i) => {
    obligations.push({
      id: `arch-obl-${i}`, text: check.rule, source: 'arch_analysis',
      promoted_from: check.arch_source_field, mandatory: true, check_ids: [check.id]
    });
  });
  if (obligations.length) target.obligations = obligations;
}

/** `scope` et `forbidden` : signaux STRUCTURELS, issus d'énumérations fermées.
 *  Aucun mot du contenu n'est lu, aucun vocabulaire de domaine n'intervient. */
function enrichSemanticSignals(analysis, target) {
  const existing = new Map(list(target.semantic_lock_signals.signals).map((s) => [s.id, s]));
  const add = (id, reason, sourceIds) => {
    if (existing.has(id)) {
      const current = existing.get(id);
      for (const sid of sourceIds) if (!current.source_ids.includes(sid)) current.source_ids.push(sid);
      return;
    }
    existing.set(id, {
      id, needed: true, reason, priority: 'mandatory', source: 'runtime',
      source_ids: [...sourceIds], associated_checks: []
    });
  };

  const excluded = list(analysis.compilation.composants_ecartes)
    .filter((c) => COMPONENT_TYPES.includes(text(c?.type)))
    .map((c, i) => `compilation.composants_ecartes[${i}]`);
  const prohibitions = list(analysis.compilation.composants_retenus)
    .map((c, i) => ({ type: text(c?.type), ref: `compilation.composants_retenus[${i}]` }))
    .filter((c) => c.type === 'interdiction')
    .map((c) => c.ref);

  if (excluded.length || prohibitions.length) {
    add('scope', 'Des éléments sont explicitement retirés du périmètre du livrable.', [...excluded, ...prohibitions]);
  }
  if (prohibitions.length) {
    add('forbidden', 'Des interdictions explicites sont retenues pour l’exécution.', prohibitions);
  }

  target.semantic_lock_signals.signals = [...existing.values()];
  target.semantic_lock_signals.signals_produced = true;
}

/** Le RÔLE D'EXÉCUTION. Recopie structurelle d'une énumération de champs 3.4,
 *  sans reformulation ni valeur de repli : ce que l'analyse ne porte pas reste
 *  absent, et `diagnoseAgainstOprie` a déjà signalé MISSING_PROJECTION_DATA. */
function enrichExecutionRole(analysis, target) {
  const role = analysis.strategie?.role_adaptatif || {};
  const title = text(role.intitule);
  const mission = text(role.mission);
  if (!title && !mission) return;
  target.execution_role = {
    title: title || null,
    mission: mission || null,
    skills: list(role.competences).map((x) => text(x)).filter(Boolean),
    limits: list(role.limites).map((x) => text(x)).filter(Boolean),
    source: 'arch_analysis'
  };
}

/* -------------------------------------------------------------------------
 * PROJECTION — la forme que le compilateur Architecte consomme
 *
 * ADN-ARCH-02 §14. PURE · DÉTERMINISTE · SANS RÉSEAU · SANS LLM.
 * Ce n'est PAS un second contrat : c'est une lecture, champ par champ, du
 * contrat canonique enrichi. Elle ne peut rien inventer — toute donnée absente
 * du contrat sort `null` ou vide, jamais reconstruite depuis une autre source.
 * ---------------------------------------------------------------------- */

const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const itemTexts = (items) => list(items).map((x) => (typeof x === 'string' ? text(x) : text(x?.text))).filter(Boolean);

function projectIssues(issues) {
  return list(issues).map((issue) => ({
    description: text(issue?.description),
    impact: text(issue?.impact) || null,
    recommended_treatment: text(issue?.recommended_treatment) || null
  })).filter((x) => x.description);
}

/**
 * @param {object} enrichedContract  contrat canonique enrichi (jamais muté)
 * @returns {object|null} entrée de projection, ou null si aucun contrat exploitable
 */
export function canonicalToArchProjectionInput(enrichedContract) {
  /* ADN-ARCH-02 §31 — ARCH_COMPILER_CAN_RECEIVE_RAW_ARCHANALYSE = NO.
     Seule une FORME canonique est projetable. Une analyse 3.4 brute ne porte ni
     `original_request` ni `executability.oprie_state` : elle est refusée ici,
     et aucun consommateur aval n'a besoin de le revérifier. */
  if (!isCanonicalBaseContract(enrichedContract)) return null;
  const contract = clone(enrichedContract);
  const intent = plain(contract.intent);
  const output = plain(contract.output);
  const assumptions = plain(contract.assumptions);
  const executability = plain(contract.executability);
  const evidence = plain(contract.evidence);
  const role = plain(contract.execution_role);

  return {
    semantic_source: ARCH_COMPILER_SEMANTIC_SOURCE,
    request_id: text(contract.request_id) || null,
    original_request: text(contract.original_request) || null,
    objective: text(intent.objective) || null,
    deliverable: text(intent.deliverable) || null,
    recipient: text(intent.recipient) || null,
    preferences: itemTexts(intent.preferences),
    explicit_constraints: itemTexts(intent.explicit_constraints),
    priorities: itemTexts(intent.priorities),
    secondary_objectives: itemTexts(intent.secondary_objectives),
    delegated_decisions: itemTexts(intent.delegated_decisions),
    role: (text(role.title) || text(role.mission))
      ? { title: text(role.title) || null, mission: text(role.mission) || null,
          skills: itemTexts(role.skills), limits: itemTexts(role.limits) }
      : null,
    output: {
      format: text(output.format) || null,
      tone: text(output.tone) || null,
      length_policy: text(output.length_policy) || null,
      structure: itemTexts(output.structure),
      opening: text(output.opening) || null,
      closing: text(output.closing) || null
    },
    quantities: list(contract.quantities).map((q) => ({
      target: text(q?.target) || null,
      unit: text(q?.unit) || null,
      exact: Number.isInteger(q?.exact) ? q.exact : null,
      min: Number.isInteger(q?.min) ? q.min : null,
      max: Number.isInteger(q?.max) ? q.max : null
    })),
    assumptions: {
      allowed: itemTexts(assumptions.allowed),
      forbidden: itemTexts(assumptions.forbidden),
      explicit: list(assumptions.explicit).map((x) => ({ text: text(x?.text), label: text(x?.label) || null })).filter((x) => x.text)
    },
    obligations: list(contract.obligations)
      .map((o) => ({ text: text(o?.text), mandatory: o?.mandatory === true }))
      .filter((o) => o.text),
    checks: list(contract.checks).map((c) => ({
      id: text(c?.id) || null, type: text(c?.type) || null,
      rule: text(c?.rule), blocking: c?.blocking === true
    })).filter((c) => c.rule),
    executability: {
      remaining_unknowns: itemTexts(executability.remaining_unknowns),
      critical_missing: projectIssues(executability.critical_missing),
      substitutable_missing: projectIssues(executability.substitutable_missing)
    },
    evidence: {
      external_knowledge_needed: evidence.external_knowledge_needed === true,
      freshness_needed: evidence.freshness_needed === true
    },
    /* DONNÉE DE PROJECTION SEULEMENT — le compilateur ne sélectionne aucun verrou. */
    semantic_lock_signals: list(plain(contract.semantic_lock_signals).signals).map((s) => ({
      id: text(s?.id) || null, reason: text(s?.reason) || null, priority: text(s?.priority) || null
    })).filter((s) => s.id),
    selected_locks: list(plain(contract.selected_locks).locks).map((l) => ({
      id: text(l?.id) || null, priority: text(l?.priority) || null, reason: text(l?.reason) || null
    })).filter((l) => l.id)
  };
}

/**
 * ADN-ARCH-02 §39 — NOMBRE DE SOURCES SÉMANTIQUES AVAL ACTIVES.
 * Un contrat canonique enrichi exploitable = 1. Rien d'autre ne compte :
 * archAnalyse n'est plus qu'une entrée d'enrichissement, jamais une source aval.
 */
export function activeArchSemanticSourceCount(enrichedContract) {
  return canonicalToArchProjectionInput(enrichedContract) === null ? 0 : 1;
}

/* -------------------------------------------------------------------------
 * DIAGNOSTIC — champs de readiness Architecte, sans aucune autorité
 * ---------------------------------------------------------------------- */

function diagnoseAgainstOprie(analysis, base, signals) {
  const comprehension = analysis.comprehension;
  const pilotage = analysis.strategie.pilotage_incertitude || {};

  /* Cardinalités : un ensemble plus grand côté Architecte signifie qu'un élément
     a été créé après la validation OPRIE. Aucune écriture n'en découle. */
  if (list(comprehension.intentions_secondaires).length > list(base.intent.secondary_objectives).length) {
    signals.push(signal('CONTRACT_INCONSISTENT', 'intent.secondary_objectives',
      'comprehension.intentions_secondaires',
      'Un objectif secondaire absent du contrat validé apparaît dans l’analyse.', true));
  }
  if (list(pilotage.decisions_autonomes).length > list(base.intent.delegated_decisions).length) {
    signals.push(signal('CONTRACT_INCONSISTENT', 'intent.delegated_decisions',
      'strategie.pilotage_incertitude.decisions_autonomes',
      'Une décision autonome non déléguée par la personne apparaît dans l’analyse.', true));
  }
  if (list(analysis.strategie.hypotheses_autorisees).length > list(base.assumptions.allowed).length) {
    signals.push(signal('CONTRACT_INCONSISTENT', 'assumptions.allowed',
      'strategie.hypotheses_autorisees',
      'Une hypothèse non autorisée par la personne apparaît dans l’analyse.', true));
  }
  const knownIssues = list(base.executability.critical_missing).length + list(base.executability.substitutable_missing).length;
  if (list(comprehension.ambiguites).length > knownIssues) {
    signals.push(signal('CONTRACT_INCONSISTENT', 'executability.substitutable_missing',
      'comprehension.ambiguites',
      'L’analyse relève une ambiguïté absente du contrat validé.', true));
  }
  if (list(pilotage.inconnues_non_devineables).length > list(base.executability.remaining_unknowns).length) {
    signals.push(signal('CONTRACT_INCONSISTENT', 'executability.remaining_unknowns',
      'strategie.pilotage_incertitude.inconnues_non_devineables',
      'L’analyse relève une inconnue absente du contrat validé.', true));
  }

  /* Seul fait de danger réellement TYPÉ dans le schéma 3.4. */
  if (list(comprehension.informations_manquantes).some((i) => i && i.bloquant === true)) {
    signals.push(signal('EXECUTION_UNSAFE', 'executability.critical_missing',
      'comprehension.informations_manquantes',
      'L’analyse identifie une information bloquante non résolue.', true));
  }

  /* MISSING_PROJECTION_DATA — une donnée nécessaire à la projection manque. */
  const role = analysis.strategie.role_adaptatif || {};
  if (!text(analysis.livrable?.nature)) {
    signals.push(signal('MISSING_PROJECTION_DATA', 'intent.deliverable', 'livrable.nature',
      'La nature du livrable est absente de l’analyse.', false));
  }
  if (!text(role.intitule) || !text(role.mission)) {
    signals.push(signal('MISSING_PROJECTION_DATA', null, 'strategie.role_adaptatif',
      'Le rôle d’exécution est incomplet dans l’analyse.', false));
  }
}

/* -------------------------------------------------------------------------
 * API PRINCIPALE
 * ---------------------------------------------------------------------- */

/**
 * @param {object} canonicalBase  Canonical Base Contract (jamais muté)
 * @param {object} archAnalyse    analyse 3.4 validée par son schéma
 * @returns {{contract: object, signals: object[]}}
 */
export function enrichCanonicalContractFromArchAnalysis(canonicalBase, archAnalyse) {
  if (!canonicalBase || typeof canonicalBase !== 'object' || Array.isArray(canonicalBase)) {
    throw new TypeError('ADN-ARCH-01 : Canonical Base Contract requis.');
  }
  const problem = assertAnalysis(archAnalyse);
  if (problem) {
    /* Analyse inutilisable : le contrat sort inchangé, un signal technique le dit. */
    return {
      contract: clone(canonicalBase),
      signals: [signal('TECHNICAL_STOP', null, problem.field, problem.detail, false)]
    };
  }

  /* Copie profonde : la base d'entrée n'est jamais touchée. */
  const contract = clone(canonicalBase);
  const signals = [];

  diagnoseAgainstOprie(archAnalyse, canonicalBase, signals);

  enrichEvidence(archAnalyse, contract, signals);
  enrichAssumptions(archAnalyse, contract);
  enrichOutput(archAnalyse, contract);
  enrichQuantities(archAnalyse, contract);
  const checks = enrichChecks(archAnalyse, contract);
  enrichObligations(archAnalyse, contract, checks);
  enrichSemanticSignals(archAnalyse, contract);
  enrichExecutionRole(archAnalyse, contract);

  /* Garde générique d'appartenance : toute écriture hors liste blanche est un
     défaut de l'enrichisseur, refusé avant d'atteindre le moindre consommateur. */
  const written = changedPaths(canonicalBase, contract);
  const illegal = written.filter((path) => !ARCH_ENRICHABLE_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}.`)));
  if (illegal.length) {
    throw new TypeError(`ADN-ARCH-01 : écriture interdite dans un champ OPRIE : ${illegal.join(', ')}.`);
  }

  return { contract, signals };
}

/**
 * Valide qu'un enrichissement n'a modifié aucun champ appartenant à OPRIE.
 * La comparaison est GÉNÉRIQUE : elle porte sur tous les chemins, pas sur une
 * liste maintenue à la main.
 */
export function validateArchCanonicalEnrichment(base, enriched, archAnalyse = null) {
  const problems = [];
  if (!base || typeof base !== 'object') return { ok: false, problems: ['Base canonique absente.'], mutated_oprie_fields: [] };
  if (!enriched || typeof enriched !== 'object') return { ok: false, problems: ['Contrat enrichi absent.'], mutated_oprie_fields: [] };

  const written = changedPaths(base, enriched);
  const mutated = written.filter((path) => !ARCH_ENRICHABLE_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}.`)));
  for (const path of mutated) problems.push(`Champ sous autorité OPRIE modifié : ${path}.`);

  /* Contrôles explicites de readiness, en plus de la garde générique. */
  if (enriched.executability?.oprie_state !== base.executability?.oprie_state) problems.push('executability.oprie_state modifié.');
  if (enriched.executability?.state !== base.executability?.state) problems.push('executability.state modifié.');
  if (enriched.executability?.evaluated !== base.executability?.evaluated) problems.push('executability.evaluated modifié.');
  if (enriched.original_request !== base.original_request) problems.push('original_request modifiée.');

  /* Aucun champ transitoire de dialogue ne peut apparaître. */
  const serialized = JSON.stringify(enriched);
  for (const field of OPRIE_TRANSIENT_FIELDS) {
    if (serialized.includes(`"${field}"`)) problems.push(`${field} réintroduit par l'enrichissement.`);
  }

  /* Aucun fait externe ne peut être déclaré vérifié. */
  for (const fact of list(enriched.evidence?.external_unverified)) {
    if (fact?.verification_status !== 'unverified') problems.push('Un fait externe a été promu au-delà de « non vérifié ».');
  }
  for (const entry of list(enriched.evidence?.provenance)) {
    if (entry?.verification_status === 'verified') problems.push('Une provenance a été déclarée vérifiée.');
  }

  /* Aucun verrou sélectionné par l'enrichissement. */
  if (list(enriched.selected_locks?.locks).length) problems.push('L’enrichissement ne sélectionne aucun verrou.');

  /* Quantités : exact et bornes restent mutuellement exclusifs. */
  for (const q of list(enriched.quantities)) {
    const hasExact = q?.exact !== null && q?.exact !== undefined;
    const hasRange = (q?.min ?? null) !== null || (q?.max ?? null) !== null;
    if (hasExact && hasRange) problems.push('Quantité incohérente : exact accompagné de bornes.');
  }

  return { ok: problems.length === 0, problems, mutated_oprie_fields: mutated };
}

/** Vérifie qu'un ensemble de signaux respecte l'invariant de preuve. */
export function validateArchSignals(signals) {
  const problems = [];
  for (const [i, s] of list(signals).entries()) {
    if (!ARCH_SIGNALS.includes(s?.signal)) problems.push(`signals[${i}] : type inconnu (${s?.signal}).`);
    if (!s?.canonical_field && !s?.arch_source_field) problems.push(`signals[${i}] : aucun champ de preuve.`);
    if (typeof s?.detail !== 'string') problems.push(`signals[${i}] : détail manquant.`);
    for (const forbidden of ['question', 'state', 'execution_ready', 'next_question']) {
      if (forbidden in (s || {})) problems.push(`signals[${i}] : champ interdit ${forbidden}.`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Vue d'audit sans contenu utilisateur. */
export function createArchEnrichmentAuditView(base, enriched, signals) {
  return clone({
    version: ARCH_ENRICHMENT_VERSION,
    enriched_paths: changedPaths(base, enriched),
    mutated_oprie_fields: validateArchCanonicalEnrichment(base, enriched).mutated_oprie_fields,
    signal_counts: ARCH_SIGNALS.reduce((acc, kind) => {
      acc[kind] = list(signals).filter((s) => s.signal === kind).length;
      return acc;
    }, {}),
    readiness_unchanged: enriched?.executability?.oprie_state === base?.executability?.oprie_state
  });
}
