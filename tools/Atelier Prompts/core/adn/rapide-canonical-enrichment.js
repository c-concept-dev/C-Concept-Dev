/* ADN-RAPIDE-ENRICH-00 — ENRICHISSEMENT CANONIQUE DÉTERMINISTE DU CHEMIN RAPIDE
 * ============================================================================
 *
 * Le contrat canonique produit par OPRIE est volontairement vide sur `output`,
 * `quantities`, `checks` et `obligations` : OPRIE ne produit ni sortie, ni
 * quantité, ni contrôle, ni obligation. Architecte comble ces familles depuis
 * son analyse 3.4. Rapide n'a pas d'analyse — il n'a que la demande elle-même.
 *
 * Ce module est son enrichisseur : il dérive, de façon PURE et DÉTERMINISTE,
 * ce que la demande dit EXPLICITEMENT, et rien d'autre.
 *
 * INVARIANT CENTRAL, qui prime sur toute liste énumérative :
 *
 *   TOUT CHAMP ALIMENTÉ PAR OPRIE EST EN LECTURE SEULE.
 *   L'enrichissement ne peut écrire que dans une liste blanche de chemins que
 *   OPRIE ne produit pas, et la garde compare les deux contrats chemin par
 *   chemin. `intent.recipient` en est absent À DESSEIN : il appartient à OPRIE,
 *   et aucune dérivation ne peut l'inventer (voir ADN-RECIPIENT-00).
 *
 * CE MODULE NE DÉCIDE RIEN :
 *   ni readiness, ni route, ni sélection de verrou. Il produit des SIGNAUX ;
 *   `selectAdaptiveLocks` reste seul à choisir. Il n'invente aucune valeur :
 *   ce que la demande ne dit pas reste absent.
 *
 * AUCUN VOCABULAIRE N'EST ÉCRIT ICI. Les marqueurs de format et les unités
 * comptables sont INJECTÉS par l'appelant, depuis les tables déjà gelées de
 * l'application : une seule source de vérité, aucune liste à maintenir en
 * double, et aucun ancrage de domaine dans le noyau.
 */

import { changedPaths } from './arch-canonical-enrichment.js';

export const RAPIDE_ENRICHMENT_VERSION = '1.0';

/** Les SEULS chemins que l'enrichissement Rapide peut écrire. */
export const RAPIDE_ENRICHABLE_PATHS = Object.freeze([
  'output.format',
  'output.structure',
  'output.sources',
  'quantities',
  'checks',
  'obligations',
  'semantic_lock_signals.signals',
  'semantic_lock_signals.signals_produced'
]);

/** Les quatre signaux, identiques à ceux du chemin Architecte. Aucun cinquième. */
export const RAPIDE_SIGNALS = Object.freeze([
  'CONTRACT_INCONSISTENT', 'EXECUTION_UNSAFE', 'MISSING_PROJECTION_DATA', 'TECHNICAL_STOP'
]);

/** Identifiants de verrou du sélecteur adaptatif. Recopie volontairement figée :
 *  un signal portant un identifiant inconnu serait silencieusement ignoré. */
export const RAPIDE_SIGNAL_IDS = Object.freeze([
  'role', 'recipient', 'data', 'provenance', 'scope', 'plan', 'format',
  'volume', 'opening_closing', 'forbidden', 'assumptions', 'length', 'final_check'
]);

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Normalisation stable, sans accents ni casse. Aucune sémantique. */
export function normalizeRequestText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* -------------------------------------------------------------------------
 * DÉRIVATION DES QUANTITÉS
 *
 * Règles purement structurelles : des tournures de dénombrement, pas du
 * vocabulaire de domaine. `counting_units` est INJECTÉ (motif d'alternance) ;
 * sans lui, la dernière règle reste simplement inerte.
 *
 * CORRECTION CANONIQUE : « exactement N » produit `exact`, jamais `min = max`.
 * Le moteur historique rendait « minimum N ; maximum N », ce que le contrat
 * canonique interdit — exact et bornes y sont mutuellement exclusifs.
 * ---------------------------------------------------------------------- */

export function deriveQuantityFromRequest(request, { counting_units = '' } = {}) {
  const n = normalizeRequestText(request);
  if (!n) return null;
  const num = (v) => Number.parseInt(v, 10);
  let m;

  if ((m = n.match(/\bexactement\s+(\d{1,4})/))) {
    return { exact: num(m[1]), min: null, max: null, rule: 'exact_explicit' };
  }
  if ((m = n.match(/entre\s+(\d{1,4})\s+et\s+(\d{1,4})/))) {
    const a = num(m[1]); const b = num(m[2]);
    return a <= b ? { exact: null, min: a, max: b, rule: 'range' } : { exact: null, min: b, max: a, rule: 'range_reversed' };
  }
  if ((m = n.match(/(?:au moins|au minimum|minimum|mini|pas moins de)\s+(\d{1,4})/))) {
    return { exact: null, min: num(m[1]), max: null, rule: 'lower_bound' };
  }
  if ((m = n.match(/(\d{1,4})\s+(?:au\s+)?minimum\b/))) {
    return { exact: null, min: num(m[1]), max: null, rule: 'lower_bound_suffix' };
  }
  if ((m = n.match(/(?:au plus|au maximum|maximum|max|pas plus de)\s+(\d{1,4})/))) {
    return { exact: null, min: null, max: num(m[1]), rule: 'upper_bound' };
  }
  const units = text(counting_units);
  if (units && (m = n.match(new RegExp(`(\\d{1,4})\\s+(?:${units})\\b`)))) {
    return { exact: null, min: num(m[1]), max: null, rule: 'counted_unit' };
  }
  return null;
}

/* -------------------------------------------------------------------------
 * DÉRIVATION DU FORMAT
 *
 * Pilotée par une TABLE INJECTÉE. Aucun identifiant de format, aucun marqueur
 * et aucun motif n'est écrit ici : l'appelant fournit le vocabulaire déjà gelé
 * de l'application. Le barème est générique — présence, frontière de mot,
 * position finale, nomination explicite — et identique pour toutes les entrées.
 * ---------------------------------------------------------------------- */

const escapeRegExp = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function deriveFormatFromRequest(request, vocabulary = []) {
  const n = normalizeRequestText(request);
  if (!n) return null;
  const tail = n.slice(Math.floor(n.length * 0.6));
  const scores = [];

  for (const entry of list(vocabulary)) {
    const id = text(entry?.id);
    if (!id) continue;
    let points = 0;
    for (const marker of list(entry?.markers)) {
      const t = normalizeRequestText(marker);
      if (!t || !n.includes(t)) continue;
      points += 3;
      if (new RegExp(`\\b${escapeRegExp(t)}\\b`).test(n)) points += 2;
      if (tail.includes(t)) points += 2;
    }
    /* Un format NOMMÉ explicitement emporte la décision. */
    const named = normalizeRequestText(entry?.name).split(' ')[0];
    if (named && new RegExp(`\\b(en|au format|sous forme de|format)\\s+${escapeRegExp(named)}`).test(n)) points += 8;
    /* Motifs supplémentaires, eux aussi fournis par l'appelant. */
    for (const extra of list(entry?.patterns)) {
      const source = text(extra?.pattern);
      const bonus = Number.isFinite(extra?.bonus) ? extra.bonus : 0;
      if (!source || !bonus) continue;
      try { if (new RegExp(source).test(n)) points += bonus; } catch { /* motif illisible : ignoré, jamais fatal */ }
    }
    if (points > 0) scores.push({ id, points, verifiable: entry?.verifiable === true });
  }

  if (!scores.length) return null;
  scores.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
  return { format: scores[0].id, score: scores[0].points, verifiable: scores[0].verifiable, rule: 'explicit_format_marker' };
}

/* -------------------------------------------------------------------------
 * ENRICHISSEMENT
 * ---------------------------------------------------------------------- */

function signal(kind, canonicalField, sourceField, detail) {
  if (!RAPIDE_SIGNALS.includes(kind)) throw new TypeError(`Signal Rapide inconnu : ${kind}.`);
  if (!canonicalField && !sourceField) {
    throw new TypeError(`Signal ${kind} sans preuve structurelle.`);
  }
  return {
    signal: kind,
    canonical_field: canonicalField || null,
    rapide_source_field: sourceField || null,
    detail: String(detail || ''),
    return_to_oprie: false,
    block_execution: true
  };
}

/** Trace de dérivation : ce qui a été écrit, d'où, et par quelle règle. */
function trace(target, source, rule) {
  return { target_field: target, source, rule, confidence: 'DETERMINISTIC', overrides_existing: false };
}

/** Ajoute un signal de verrou sans jamais en sélectionner un. */
function addLockSignal(existing, id, reason, sourceIds) {
  if (!RAPIDE_SIGNAL_IDS.includes(id)) throw new TypeError(`Identifiant de verrou inconnu : ${id}.`);
  const current = existing.get(id);
  if (current) {
    for (const sid of sourceIds) if (!current.source_ids.includes(sid)) current.source_ids.push(sid);
    return;
  }
  existing.set(id, {
    id, needed: true, reason, priority: 'useful', source: 'runtime',
    source_ids: [...sourceIds], associated_checks: []
  });
}

/**
 * @param {object} canonicalBase  Canonical Base Contract (jamais muté)
 * @param {object} options        { original_request, material, format_vocabulary, counting_units }
 * @returns {{contract: object, signals: object[], derivation_trace: object[]}}
 */
export function enrichRapidCanonicalContract(canonicalBase, {
  material = '', format_vocabulary = [], counting_units = ''
} = {}) {
  if (!canonicalBase || typeof canonicalBase !== 'object' || Array.isArray(canonicalBase)) {
    throw new TypeError('ADN-RAPIDE-ENRICH-00 : Canonical Base Contract requis.');
  }

  const contract = clone(canonicalBase);
  const signals = [];
  const derivation_trace = [];

  /* La demande vient TOUJOURS du contrat : jamais d'un paramètre concurrent.
     C'est ce qui garantit qu'il n'existe qu'une source, même ici. */
  const request = text(contract.original_request);
  if (!request) {
    return {
      contract,
      signals: [signal('TECHNICAL_STOP', 'original_request', null, 'Demande originale absente du contrat canonique.')],
      derivation_trace
    };
  }

  const output = plain(contract.output);
  const lockSignals = new Map(list(plain(contract.semantic_lock_signals).signals).map((s) => [s.id, s]));

  /* ---- QUANTITÉS ---------------------------------------------------- */
  const quantity = deriveQuantityFromRequest(request, { counting_units });
  if (quantity && !list(contract.quantities).length) {
    contract.quantities = [{
      target: 'éléments', unit: null,
      exact: quantity.exact, min: quantity.min, max: quantity.max,
      source: 'derived_deterministic'
    }];
    derivation_trace.push(trace('quantities', 'original_request', quantity.rule));
  }

  /* ---- FORMAT ------------------------------------------------------- */
  const format = deriveFormatFromRequest(request, format_vocabulary);
  if (format && !text(output.format)) {
    contract.output.format = format.format;
    contract.output.sources = { ...plain(contract.output.sources), format: 'derived_deterministic' };
    derivation_trace.push(trace('output.format', 'original_request', format.rule));
  }

  /* ---- OBLIGATIONS — uniquement depuis des contraintes DÉJÀ canoniques */
  const constraints = list(plain(contract.intent).explicit_constraints)
    .map((item, i) => ({ text: text(item?.text), index: i }))
    .filter((item) => item.text);
  if (constraints.length && !list(contract.obligations).length) {
    contract.obligations = constraints.map((item) => ({
      id: `rapide-obl-${item.index}`,
      text: item.text,
      source: 'derived_deterministic',
      promoted_from: `intent.explicit_constraints[${item.index}]`,
      mandatory: true,
      check_ids: []
    }));
    derivation_trace.push(trace('obligations', 'intent.explicit_constraints', 'confirmed_constraint_promotion'));
  }

  /* ---- CHECKS — uniquement ce qui est MÉCANIQUEMENT vérifiable ------- */
  const checks = [];
  const projected = list(contract.quantities)[0];
  if (projected) {
    const rule = projected.exact !== null && projected.exact !== undefined
      ? `Le livrable doit comporter exactement ${projected.exact} éléments.`
      : [projected.min !== null ? `au moins ${projected.min}` : '', projected.max !== null ? `au plus ${projected.max}` : '']
        .filter(Boolean).join(' et ');
    if (rule) {
      checks.push({
        id: 'rapide-check-quantity', type: 'deterministic', target: 'deliverable',
        rule: projected.exact !== null && projected.exact !== undefined ? rule : `Le livrable doit comporter ${rule} éléments.`,
        blocking: true, source: 'derived_deterministic',
        /* ADN-QG-02B — le contrôle porte sa MESURE, et cette mesure est
           RECOPIÉE du contrat : rien n'est inventé ici pour rendre un contrôle
           exécutable. Sans quantité canonique, ce contrôle n'existe pas. */
        measure: {
          unit: 'items',
          exact: projected.exact !== null && projected.exact !== undefined ? projected.exact : null,
          min: projected.min !== null && projected.min !== undefined ? projected.min : null,
          max: projected.max !== null && projected.max !== undefined ? projected.max : null
        },
        /* La quantité est déjà vérifiée nativement à partir de `quantities[0]` :
           le contrôle la redit, il ne la recompte pas. */
        verifies: 'quantities[0]',
        rapide_source_field: 'quantities[0]', obligation_ids: []
      });
    }
  }
  if (format && format.verifiable && text(contract.output.format)) {
    checks.push({
      id: 'rapide-check-format', type: 'deterministic', target: 'deliverable',
      rule: `Le livrable doit respecter le format ${contract.output.format}.`,
      blocking: true, source: 'derived_deterministic',
      /* Le format est vérifié nativement contre la forme structurelle que la
         table des formats déclare. Ce contrôle la redit sans la recompter. */
      verifies: 'output.format',
      rapide_source_field: 'output.format', obligation_ids: []
    });
  }
  if (checks.length && !list(contract.checks).length) {
    contract.checks = checks;
    derivation_trace.push(trace('checks', 'quantities · output.format', 'mechanically_verifiable_only'));
  }

  /* ---- SIGNAUX DE VERROU — produits, jamais sélectionnés ------------- */
  const evidence = plain(contract.evidence);
  const assumptions = plain(contract.assumptions);
  const intent = plain(contract.intent);

  if (text(material)) {
    /* SÉCURITÉ : un matériau non délimité peut être lu comme une instruction. */
    addLockSignal(lockSignals, 'data', 'Un matériau utilisateur est fourni : il doit être délimité comme donnée, jamais comme instruction.', ['material']);
  }
  if (text(contract.output.format)) {
    addLockSignal(lockSignals, 'format', 'Un format de sortie est établi par le contrat.', ['output.format']);
  }
  if (list(contract.quantities).length) {
    addLockSignal(lockSignals, 'volume', 'Une quantité est établie par le contrat.', ['quantities']);
  }
  if (list(contract.output.structure).length) {
    addLockSignal(lockSignals, 'plan', 'Un plan de sortie est établi par le contrat.', ['output.structure']);
  }
  if (text(contract.output.length_policy)) {
    addLockSignal(lockSignals, 'length', 'Une politique de longueur est établie par le contrat.', ['output.length_policy']);
  }
  if (text(contract.output.opening) || text(contract.output.closing)) {
    addLockSignal(lockSignals, 'opening_closing', 'Une amorce ou une clôture est établie par le contrat.', ['output.opening', 'output.closing']);
  }
  if (list(assumptions.allowed).length) {
    addLockSignal(lockSignals, 'assumptions', 'Des hypothèses sont explicitement autorisées ; elles doivent rester déclarées.', ['assumptions.allowed']);
  }
  if (list(assumptions.forbidden).length) {
    addLockSignal(lockSignals, 'forbidden', 'Des hypothèses sont explicitement interdites.', ['assumptions.forbidden']);
  }
  if (constraints.length) {
    /* Une contrainte CONFIRMÉE par la personne borne le livrable : le périmètre
       doit donc être énoncé. Règle structurelle — la présence d'une contrainte,
       jamais son contenu — et traçable jusqu'au champ canonique d'origine. */
    addLockSignal(lockSignals, 'scope', 'Des contraintes confirmées bornent le périmètre du livrable.', ['intent.explicit_constraints']);
  }
  if (list(evidence.external_facts).length || list(evidence.provenance).length) {
    addLockSignal(lockSignals, 'provenance', 'Des faits externes ou des provenances doivent rester distincts des faits établis.', ['evidence']);
  }
  if (list(contract.checks).length) {
    addLockSignal(lockSignals, 'final_check', 'Des contrôles vérifiables existent : le livrable doit être relu contre eux.', ['checks']);
  }
  if (text(intent.recipient)) {
    /* Jamais dérivé : projeté UNIQUEMENT si OPRIE l'a établi. */
    addLockSignal(lockSignals, 'recipient', 'Un destinataire est établi par le contrat.', ['intent.recipient']);
  }

  contract.semantic_lock_signals.signals = [...lockSignals.values()];
  contract.semantic_lock_signals.signals_produced = true;

  /* ---- GARDE GÉNÉRIQUE D'APPARTENANCE ------------------------------- */
  const written = changedPaths(canonicalBase, contract);
  const illegal = written.filter((path) => !RAPIDE_ENRICHABLE_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}.`)));
  if (illegal.length) {
    throw new TypeError(`ADN-RAPIDE-ENRICH-00 : écriture interdite dans un champ OPRIE : ${illegal.join(', ')}.`);
  }

  return { contract, signals, derivation_trace };
}

/**
 * Valide qu'un enrichissement Rapide n'a modifié aucun champ OPRIE.
 * Comparaison GÉNÉRIQUE, sur tous les chemins, sans liste maintenue à la main.
 */
export function validateRapidCanonicalEnrichment(base, enriched) {
  const problems = [];
  if (!base || typeof base !== 'object') return { ok: false, problems: ['Base canonique absente.'], mutated_oprie_fields: [] };
  if (!enriched || typeof enriched !== 'object') return { ok: false, problems: ['Contrat enrichi absent.'], mutated_oprie_fields: [] };

  const written = changedPaths(base, enriched);
  const mutated = written.filter((path) => !RAPIDE_ENRICHABLE_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}.`)));
  for (const path of mutated) problems.push(`Champ sous autorité OPRIE modifié : ${path}.`);

  /* Readiness, demande originale et destinataire : intouchables. */
  if (enriched.original_request !== base.original_request) problems.push('original_request modifiée.');
  if (enriched.intent?.recipient !== base.intent?.recipient) problems.push('intent.recipient modifié — ADN-RECIPIENT-00 reste ouvert.');
  for (const key of ['oprie_state', 'state', 'evaluated']) {
    if (enriched.executability?.[key] !== base.executability?.[key]) problems.push(`executability.${key} modifié.`);
  }

  /* Aucun verrou sélectionné par l'enrichissement. */
  if (list(enriched.selected_locks?.locks).length) problems.push('L’enrichissement ne sélectionne aucun verrou.');

  /* Quantités : exact et bornes restent mutuellement exclusifs. */
  for (const q of list(enriched.quantities)) {
    const hasExact = q?.exact !== null && q?.exact !== undefined;
    const hasRange = (q?.min ?? null) !== null || (q?.max ?? null) !== null;
    if (hasExact && hasRange) problems.push('Quantité incohérente : exact accompagné de bornes.');
  }

  /* Tout signal produit doit porter un identifiant que le sélecteur connaît. */
  for (const [i, s] of list(enriched.semantic_lock_signals?.signals).entries()) {
    if (!RAPIDE_SIGNAL_IDS.includes(s?.id)) problems.push(`semantic_lock_signals.signals[${i}] : identifiant inconnu (${s?.id}).`);
    if (s?.needed !== true) problems.push(`semantic_lock_signals.signals[${i}] doit être needed.`);
    if ('selected' in (s || {})) problems.push(`semantic_lock_signals.signals[${i}] : la sélection appartient à l'ADN.`);
  }

  return { ok: problems.length === 0, problems, mutated_oprie_fields: mutated };
}

/** Vue d'audit sans contenu utilisateur. */
export function createRapidEnrichmentAuditView(base, enriched, derivation_trace) {
  return clone({
    version: RAPIDE_ENRICHMENT_VERSION,
    enriched_paths: changedPaths(base, enriched),
    mutated_oprie_fields: validateRapidCanonicalEnrichment(base, enriched).mutated_oprie_fields,
    derivations: list(derivation_trace).map((t) => ({ target_field: t.target_field, rule: t.rule })),
    lock_signal_ids: list(enriched?.semantic_lock_signals?.signals).map((s) => s.id),
    readiness_unchanged: enriched?.executability?.oprie_state === base?.executability?.oprie_state
  });
}
