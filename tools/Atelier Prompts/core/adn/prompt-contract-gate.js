/* ADN-QG-00 — PROMPT CONTRACT GATE
 * ============================================================================
 * PROTOTYPE PUR — NON BRANCHÉ EN PRODUCTION.
 *
 * Ce module répond à UNE question, et à une seule :
 *
 *     l'artefact projeté (prompt) porte-t-il encore ce que le contrat
 *     canonique qui l'a produit exigeait ?
 *
 * Il ne crée AUCUNE sémantique. Il ne produit AUCUNE readiness. Il ne
 * sélectionne AUCUN verrou. Il ne choisit AUCUNE route. Il ne réécrit RIEN.
 * Il compare EXPECTED (contrat canonique) et OBSERVED (trace de projection).
 *
 * FRONTIÈRES — quatre responsabilités distinctes, jamais confondues :
 *   1. OPRIE readiness      → la demande est-elle exploitable ?      (serveur)
 *   2. Prompt contract      → le prompt porte-t-il le contrat ?      (CE MODULE)
 *   3. Execution readiness  → l'exécution peut-elle démarrer ?       (ailleurs)
 *   4. Output compliance    → la sortie respecte-t-elle le contrat ? (prototype §35)
 *
 * INTERDITS STRUCTURELS, vérifiés par les tests d'autorité :
 *   - aucun appel réseau, aucun provider, aucun LLM juge ;
 *   - aucun fuzzy, aucun embedding, aucune distance d'édition ;
 *   - aucun seuil de longueur, aucun ratio de couverture décisionnel ;
 *   - aucun vocabulaire métier, aucun identifiant de cas ;
 *   - aucune mutation du contrat canonique ni du prompt.
 *
 * DETTE CONNUE (fermée par ADN-QG-01) :
 *   TRACE_NATIVE_FROM_COMPILER = NO — dans ce lot la trace de projection est
 *   construite par l'appelant. Les compilateurs ne l'émettent pas encore.
 * ========================================================================= */

export const PROMPT_CONTRACT_GATE_VERSION = '1.0';

/* Marqueur d'audit : ce prototype n'est branché nulle part. */
export const PROMPT_CONTRACT_GATE_PRODUCTION_ACTIVE = false;

export const GATE_STATUSES = Object.freeze(['PASS', 'PASS_WITH_WARNINGS', 'FAIL']);

/* REQUIRED / OPTIONAL / NOT_APPLICABLE / UNKNOWN — l'absence d'un champ dans le
 * contrat vaut NOT_APPLICABLE, jamais une obligation par défaut. */
export const REQUIREMENT_STATUSES = Object.freeze(['REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE', 'UNKNOWN']);

/* Codes GÉNÉRIQUES. Aucun code métier ne peut être ajouté ici. */
export const VIOLATION_CODES = Object.freeze([
  'MISSING_REQUIRED_PROJECTION',
  'CONTRADICTORY_INSTRUCTION',
  'UNSUPPORTED_INSTRUCTION',
  'QUANTITY_MISMATCH',
  'FORMAT_MISMATCH',
  'MISSING_CHECK',
  'LOCK_MISMATCH',
  'PROVENANCE_MISMATCH',
  'ASSUMPTION_MISMATCH',
  'SCOPE_MISMATCH',
  'OUTPUT_REQUIREMENT_MISMATCH',
  'EMPTY_REQUIRED_SECTION',
  'DUPLICATE_CONFLICTING_INSTRUCTION',
  'TECHNICAL_VALIDATION_FAILURE'
]);

/* Taxonomie DISTINCTE — la conformité de sortie n'est pas la conformité du
 * prompt. Les deux familles ne partagent aucun code, sauf l'échec technique. */
export const OUTPUT_VIOLATION_CODES = Object.freeze([
  'MISSING_REQUIRED_OUTPUT',
  'OUTPUT_FORMAT_MISMATCH',
  'OUTPUT_QUANTITY_MISMATCH',
  'CHECK_FAILED',
  'PROVENANCE_REQUIREMENT_FAILED',
  'SCOPE_VIOLATION',
  'FORBIDDEN_CONTENT_PRESENT',
  'UNSUPPORTED_CLAIM',
  'TECHNICAL_VALIDATION_FAILURE'
]);

export const GATE_MODES = Object.freeze(['strict', 'audit']);

/* ------------------------------------------------------------------------ *
 * Utilitaires purs — aucune interprétation, aucune normalisation sémantique.
 * ------------------------------------------------------------------------ */
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const isInt = (v) => Number.isInteger(v);

function violation(code, requirement_id, detail, blocking = true) {
  if (!VIOLATION_CODES.includes(code)) throw new TypeError(`ADN-QG-00 : code de violation inconnu (${code}).`);
  return { code, requirement_id: requirement_id || null, detail, blocking };
}

function requirement(id, key, status, { lock_id = null, blocking = true, source_path, expectation = null }) {
  if (!REQUIREMENT_STATUSES.includes(status)) throw new TypeError(`ADN-QG-00 : statut d'exigence inconnu (${status}).`);
  return { id, key, status, lock_id, blocking, source_path, expectation };
}

function signalById(contract, id) {
  return list(plain(contract.semantic_lock_signals).signals).find((s) => plain(s).id === id && plain(s).needed === true) || null;
}

/* ------------------------------------------------------------------------ *
 * EXPECTED — les exigences sont DÉRIVÉES du contrat, jamais inventées.
 *
 * Règle unique et générique : une famille absente du contrat produit
 * NOT_APPLICABLE. Rien n'est exigé « par défaut », ce qui rend structurellement
 * impossible le faux positif sur un contrat nu.
 * ------------------------------------------------------------------------ */
export function collectCanonicalRequirements(canonical_contract) {
  const c = plain(canonical_contract);
  const out = plain(c.output);
  const intent = plain(c.intent);
  const evidence = plain(c.evidence);
  const assumptions = plain(c.assumptions);
  const reqs = [];

  const na = (id, key, source_path, lock_id = null) =>
    reqs.push(requirement(id, key, 'NOT_APPLICABLE', { lock_id, blocking: false, source_path }));

  /* --- rôle d'exécution (écrit par Architecte, jamais par OPRIE) --------- */
  if (text(c.execution_role)) {
    reqs.push(requirement('role', 'role', 'REQUIRED', {
      lock_id: 'role', source_path: 'execution_role', expectation: { role: text(c.execution_role) }
    }));
  } else na('role', 'role', 'execution_role', 'role');

  /* --- destinataire : null signifie « non établi », jamais « sans objet » */
  if (text(intent.recipient)) {
    reqs.push(requirement('recipient', 'recipient', 'REQUIRED', {
      lock_id: 'recipient', source_path: 'intent.recipient', expectation: { recipient: text(intent.recipient) }
    }));
  } else na('recipient', 'recipient', 'intent.recipient', 'recipient');

  /* --- format ----------------------------------------------------------- */
  if (text(out.format)) {
    reqs.push(requirement('format', 'format', 'REQUIRED', {
      lock_id: 'format', source_path: 'output.format', expectation: { format: text(out.format) }
    }));
  } else na('format', 'format', 'output.format', 'format');

  /* --- plan de sortie ---------------------------------------------------- */
  if (list(out.structure).length) {
    reqs.push(requirement('plan', 'plan', 'REQUIRED', {
      lock_id: 'plan', source_path: 'output.structure', expectation: { section_count: list(out.structure).length }
    }));
  } else na('plan', 'plan', 'output.structure', 'plan');

  /* --- quantités : l'exactitude et les bornes sont portées telles quelles - */
  const q = plain(list(c.quantities)[0]);
  if (list(c.quantities).length) {
    reqs.push(requirement('quantity', 'quantity', 'REQUIRED', {
      lock_id: 'volume', source_path: 'quantities[0]',
      expectation: {
        exact: isInt(q.exact) ? q.exact : null,
        min: isInt(q.min) ? q.min : null,
        max: isInt(q.max) ? q.max : null
      }
    }));
  } else na('quantity', 'quantity', 'quantities', 'volume');

  /* --- ouverture / clôture ---------------------------------------------- */
  if (text(out.opening) || text(out.closing)) {
    reqs.push(requirement('opening_closing', 'opening_closing', 'REQUIRED', {
      lock_id: 'opening_closing', source_path: 'output.opening · output.closing',
      expectation: { opening: text(out.opening) || null, closing: text(out.closing) || null }
    }));
  } else na('opening_closing', 'opening_closing', 'output.opening · output.closing', 'opening_closing');

  /* --- politique de longueur : AUCUN seuil n'est inventé ici ------------- */
  if (text(out.length_policy)) {
    reqs.push(requirement('length', 'length', 'REQUIRED', {
      lock_id: 'length', source_path: 'output.length_policy', expectation: { length_policy: text(out.length_policy) }
    }));
  } else na('length', 'length', 'output.length_policy', 'length');

  /* --- matériau : un matériau non délimité se lit comme une instruction --- */
  const dataSignal = signalById(c, 'data');
  if (dataSignal || list(evidence.material_facts).length) {
    reqs.push(requirement('data', 'data', 'REQUIRED', {
      lock_id: 'data', source_path: dataSignal ? 'semantic_lock_signals.signals[data]' : 'evidence.material_facts',
      expectation: { delimited: true }
    }));
  } else na('data', 'data', 'evidence.material_facts', 'data');

  /* --- provenance : `unverified` ne redevient jamais `verified` ---------- */
  const provenance = list(evidence.provenance);
  if (provenance.length) {
    const unverified = provenance.filter((p) => plain(p).verification_status !== 'verified').length;
    reqs.push(requirement('provenance', 'provenance', 'REQUIRED', {
      lock_id: 'provenance', source_path: 'evidence.provenance',
      expectation: { total: provenance.length, unverified }
    }));
  } else na('provenance', 'provenance', 'evidence.provenance', 'provenance');

  /* --- hypothèses interdites : QG ne décide jamais lesquelles ------------ */
  const forbiddenAssumptions = list(assumptions.forbidden);
  if (forbiddenAssumptions.length) {
    reqs.push(requirement('assumptions', 'assumptions', 'REQUIRED', {
      lock_id: 'assumptions', source_path: 'assumptions.forbidden',
      expectation: { forbidden_count: forbiddenAssumptions.length }
    }));
  } else na('assumptions', 'assumptions', 'assumptions.forbidden', 'assumptions');

  /* --- périmètre : dérivé du signal STRUCTUREL, jamais du texte ---------- */
  const scopeSignal = signalById(c, 'scope');
  if (scopeSignal) {
    reqs.push(requirement('scope', 'scope', 'REQUIRED', {
      lock_id: 'scope', source_path: 'semantic_lock_signals.signals[scope]',
      expectation: { constraint_count: list(plain(scopeSignal).source_ids).length }
    }));
  } else na('scope', 'scope', 'semantic_lock_signals.signals[scope]', 'scope');

  /* --- interdictions explicites ----------------------------------------- */
  const forbiddenSignal = signalById(c, 'forbidden');
  if (forbiddenSignal) {
    reqs.push(requirement('forbidden', 'forbidden', 'REQUIRED', {
      lock_id: 'forbidden', source_path: 'semantic_lock_signals.signals[forbidden]',
      expectation: { constraint_count: list(plain(forbiddenSignal).source_ids).length }
    }));
  } else na('forbidden', 'forbidden', 'semantic_lock_signals.signals[forbidden]', 'forbidden');

  /* --- contrôles : bloquant = REQUIRED, non bloquant = OPTIONAL ---------- */
  list(c.checks).forEach((raw) => {
    const check = plain(raw);
    const id = text(check.id);
    if (!id) return;
    const blocking = check.blocking === true;
    reqs.push(requirement(`check:${id}`, `check:${id}`, blocking ? 'REQUIRED' : 'OPTIONAL', {
      lock_id: blocking ? 'final_check' : null, blocking,
      source_path: `checks[${id}]`, expectation: { check_id: id, type: text(check.type) || null }
    }));
  });

  /* --- obligations mandataires ------------------------------------------ */
  list(c.obligations).forEach((raw) => {
    const obligation = plain(raw);
    const id = text(obligation.id);
    if (!id) return;
    const mandatory = obligation.mandatory === true;
    reqs.push(requirement(`obligation:${id}`, `obligation:${id}`, mandatory ? 'REQUIRED' : 'OPTIONAL', {
      blocking: mandatory, source_path: `obligations[${id}]`, expectation: { obligation_id: id }
    }));
  });

  return reqs;
}

/* ------------------------------------------------------------------------ *
 * OBSERVED — normalisation d'une trace de projection.
 *
 * QG-00 n'émet PAS la trace : il la reçoit. Cette fonction ne fait que la
 * mettre en forme et refuser ce qui n'est pas structuré. Elle n'ajoute aucune
 * entrée, ce qui interdit à ce module de « compléter » une projection perdue.
 * ------------------------------------------------------------------------ */
export function buildProjectionTrace(entries, { request_id = null } = {}) {
  if (!Array.isArray(entries)) throw new TypeError('ADN-QG-00 : la trace de projection doit être une liste.');
  return {
    version: PROMPT_CONTRACT_GATE_VERSION,
    request_id: text(request_id) || null,
    /* Dette QG-01 : tant que ce marqueur est false, la trace vient de
       l'appelant et non du compilateur lui-même. */
    native_from_compiler: false,
    entries: entries.map((raw) => {
      const e = plain(raw);
      const key = text(e.key);
      if (!key) throw new TypeError('ADN-QG-00 : chaque entrée de trace exige une clé.');
      return {
        key,
        present: e.present === true,
        value: e.value === undefined ? null : e.value,
        rendered: typeof e.rendered === 'string' ? e.rendered : null,
        source: text(e.source) || null
      };
    })
  };
}

/* ------------------------------------------------------------------------ *
 * Inspection textuelle STRICTEMENT déterministe.
 *
 * Le seul invariant lu dans le texte est numérique : une borne (« au moins N »,
 * « entre N et M ») contredit mécaniquement une exigence d'exactitude. Ces
 * connecteurs sont des marqueurs de quantité, pas du vocabulaire de domaine :
 * l'énumération est fermée et ne peut pas être étendue par un cas d'usage.
 * ------------------------------------------------------------------------ */
const BOUND_MARKERS = Object.freeze([
  { re: /\bentre\s+\d+\s+et\s+\d+/gi, kind: 'range' },
  { re: /\bau\s+moins\s+\d+/gi, kind: 'min' },
  { re: /\bau\s+plus\s+\d+/gi, kind: 'max' },
  { re: /\bminimum\s+de?\s*\d+/gi, kind: 'min' },
  { re: /\bmaximum\s+de?\s*\d+/gi, kind: 'max' }
]);

function detectBoundMarkers(prompt) {
  const found = [];
  for (const marker of BOUND_MARKERS) {
    const matches = String(prompt).match(marker.re);
    if (matches) found.push({ kind: marker.kind, occurrences: matches.length });
  }
  return found;
}

/* ------------------------------------------------------------------------ *
 * LE GATE
 * ------------------------------------------------------------------------ */
export function validatePromptAgainstCanonicalContract({
  canonical_contract,
  prompt,
  selected_locks,
  projection_trace,
  mode = 'strict'
} = {}) {
  /* ---- FAIL CLOSED : aucune entrée invalide ne peut produire un PASS ---- */
  const technical = [];
  if (!canonical_contract || typeof canonical_contract !== 'object' || Array.isArray(canonical_contract)) {
    technical.push('canonical_contract absent ou non structuré');
  }
  if (typeof prompt !== 'string' || !prompt.trim()) technical.push('prompt absent ou vide');
  if (!Array.isArray(selected_locks)) technical.push('selected_locks doit être une liste de verrous sélectionnés');
  const trace = plain(projection_trace);
  if (!Array.isArray(trace.entries)) technical.push('projection_trace.entries doit être une liste');
  if (!GATE_MODES.includes(mode)) technical.push(`mode inconnu (${String(mode)})`);

  if (technical.length) {
    return {
      version: PROMPT_CONTRACT_GATE_VERSION,
      status: 'FAIL',
      violations: technical.map((detail) => violation('TECHNICAL_VALIDATION_FAILURE', null, detail, true)),
      warnings: [],
      coverage: { required: 0, satisfied: 0, optional: 0, not_applicable: 0, unknown: 0 },
      checked_requirements: [],
      trace: { mode: GATE_MODES.includes(mode) ? mode : null, entry_count: Array.isArray(trace.entries) ? trace.entries.length : 0, fail_closed: true }
    };
  }

  const requirements = collectCanonicalRequirements(canonical_contract);
  const lockIds = new Set(selected_locks.map((l) => text(plain(l).id) || text(l)).filter(Boolean));

  /* ---- indexation de la trace + détection des doublons ------------------ */
  const byKey = new Map();
  const violations = [];
  const warnings = [];
  for (const entry of trace.entries) {
    const key = text(plain(entry).key);
    if (!key) continue;
    if (!byKey.has(key)) { byKey.set(key, entry); continue; }
    const first = byKey.get(key);
    const identical = JSON.stringify(plain(first).value ?? null) === JSON.stringify(plain(entry).value ?? null);
    if (identical) {
      warnings.push(violation('DUPLICATE_CONFLICTING_INSTRUCTION', key, `Projection dupliquée à l'identique pour « ${key} ».`, false));
    } else {
      violations.push(violation('DUPLICATE_CONFLICTING_INSTRUCTION', key, `Deux projections contradictoires pour « ${key} ».`, true));
    }
  }

  const checked = [];
  let satisfied = 0;

  for (const req of requirements) {
    if (req.status === 'NOT_APPLICABLE') { checked.push({ ...req, outcome: 'NOT_APPLICABLE' }); continue; }

    const entry = byKey.get(req.key);
    const present = !!entry && plain(entry).present === true;
    const value = plain(entry).value;

    /* --- absence de projection ------------------------------------------ */
    if (!present) {
      if (req.status === 'OPTIONAL') { checked.push({ ...req, outcome: 'OPTIONAL_ABSENT' }); continue; }
      const code = req.key.startsWith('check:') ? 'MISSING_CHECK' : 'MISSING_REQUIRED_PROJECTION';
      violations.push(violation(code, req.id, `Exigence « ${req.id} » issue de ${req.source_path} sans projection dans le prompt.`, true));
      checked.push({ ...req, outcome: 'MISSING' });
      continue;
    }

    /* --- section projetée mais vide -------------------------------------- */
    if (typeof plain(entry).rendered === 'string' && !text(plain(entry).rendered)) {
      violations.push(violation('EMPTY_REQUIRED_SECTION', req.id, `La projection de « ${req.id} » est présente mais vide.`, true));
      checked.push({ ...req, outcome: 'EMPTY' });
      continue;
    }

    /* --- comparaison structurée EXPECTED / OBSERVED ---------------------- */
    const mismatch = compareRequirement(req, plain(value), prompt);
    if (mismatch) {
      (mismatch.blocking ? violations : warnings).push(mismatch);
      checked.push({ ...req, outcome: 'MISMATCH' });
      continue;
    }

    /* --- cohérence de verrou : QG constate, il ne sélectionne jamais ----- */
    if (req.lock_id && req.status === 'REQUIRED' && !lockIds.has(req.lock_id)) {
      violations.push(violation('LOCK_MISMATCH', req.id,
        `Le verrou « ${req.lock_id} » est exigé par ${req.source_path} mais absent de la sélection ADN.`, true));
      checked.push({ ...req, outcome: 'LOCK_MISMATCH' });
      continue;
    }

    if (req.status === 'REQUIRED') satisfied += 1;
    checked.push({ ...req, outcome: 'SATISFIED' });
  }

  /* ---- instructions non supportées par le contrat ---------------------- */
  const supported = new Set(requirements.filter((r) => r.status !== 'NOT_APPLICABLE').map((r) => r.key));
  for (const key of byKey.keys()) {
    if (supported.has(key)) continue;
    if (plain(byKey.get(key)).present !== true) continue;
    violations.push(violation('UNSUPPORTED_INSTRUCTION', key,
      `La projection « ${key} » n'a aucun appui dans le contrat canonique.`, true));
  }

  const requiredCount = requirements.filter((r) => r.status === 'REQUIRED').length;
  const coverage = {
    required: requiredCount,
    satisfied,
    optional: requirements.filter((r) => r.status === 'OPTIONAL').length,
    not_applicable: requirements.filter((r) => r.status === 'NOT_APPLICABLE').length,
    unknown: requirements.filter((r) => r.status === 'UNKNOWN').length
  };

  /* ---- SUFFISANCE : aucun score, aucun ratio, aucun seuil -------------- */
  const blocking = violations.filter((v) => v.blocking);
  const status = blocking.length ? 'FAIL' : (warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS');

  return {
    version: PROMPT_CONTRACT_GATE_VERSION,
    status,
    violations,
    warnings,
    coverage,
    checked_requirements: mode === 'audit' ? checked : checked.filter((c) => c.status !== 'NOT_APPLICABLE'),
    trace: {
      mode,
      entry_count: trace.entries.length,
      native_from_compiler: trace.native_from_compiler === true,
      blocking_violations: blocking.length,
      fail_closed: false
    }
  };
}

/* Comparaison par famille — chaque famille porte SON code, ce qui rend la
 * détection d'une perte lisible sans jamais interpréter le contenu. */
function compareRequirement(req, value, prompt) {
  const e = req.expectation || {};
  switch (req.key) {
    case 'quantity': {
      /* Une exigence d'exactitude est contredite par toute borne du prompt. */
      if (isInt(e.exact)) {
        const bounds = detectBoundMarkers(prompt);
        if (bounds.length) {
          return violation('CONTRADICTORY_INSTRUCTION', req.id,
            `Le contrat exige exactement ${e.exact} ; le prompt porte une borne (${bounds.map((b) => b.kind).join(', ')}).`, true);
        }
        if (!isInt(value.exact) || value.exact !== e.exact) {
          return violation('QUANTITY_MISMATCH', req.id,
            `Quantité exacte attendue ${e.exact}, projetée ${isInt(value.exact) ? value.exact : 'aucune'}.`, true);
        }
        return null;
      }
      const minOk = e.min === null || (isInt(value.min) && value.min === e.min);
      const maxOk = e.max === null || (isInt(value.max) && value.max === e.max);
      if (!minOk || !maxOk) {
        return violation('QUANTITY_MISMATCH', req.id,
          `Bornes attendues [${e.min}, ${e.max}], projetées [${value.min ?? 'aucune'}, ${value.max ?? 'aucune'}].`, true);
      }
      return null;
    }
    case 'format':
      return text(value.format) === e.format ? null
        : violation('FORMAT_MISMATCH', req.id, `Format attendu « ${e.format} », projeté « ${text(value.format) || 'aucun'} ».`, true);
    case 'scope':
      return Number(value.constraint_count) >= e.constraint_count ? null
        : violation('SCOPE_MISMATCH', req.id,
          `${e.constraint_count} contrainte(s) de périmètre attendue(s), ${Number(value.constraint_count) || 0} projetée(s).`, true);
    case 'provenance': {
      if (Number(value.total) < e.total) {
        return violation('PROVENANCE_MISMATCH', req.id,
          `${e.total} affirmation(s) tracée(s) attendue(s), ${Number(value.total) || 0} projetée(s).`, true);
      }
      /* Une affirmation non vérifiée ne peut jamais devenir vérifiée. */
      if (Number(value.unverified) < e.unverified) {
        return violation('PROVENANCE_MISMATCH', req.id,
          `${e.unverified} affirmation(s) non vérifiée(s) doivent rester signalées, ${Number(value.unverified) || 0} projetée(s).`, true);
      }
      return null;
    }
    case 'assumptions':
      return Number(value.forbidden_count) === e.forbidden_count ? null
        : violation('ASSUMPTION_MISMATCH', req.id,
          `${e.forbidden_count} hypothèse(s) interdite(s) attendue(s), ${Number(value.forbidden_count) || 0} projetée(s).`, true);
    case 'forbidden':
      return Number(value.constraint_count) >= e.constraint_count ? null
        : violation('SCOPE_MISMATCH', req.id,
          `${e.constraint_count} interdiction(s) attendue(s), ${Number(value.constraint_count) || 0} projetée(s).`, true);
    case 'data':
      return value.delimited === true ? null
        : violation('MISSING_REQUIRED_PROJECTION', req.id,
          'Le matériau est projeté sans délimitation : il pourrait être lu comme une instruction.', true);
    case 'plan':
      return Number(value.section_count) === e.section_count ? null
        : violation('OUTPUT_REQUIREMENT_MISMATCH', req.id,
          `${e.section_count} section(s) attendue(s), ${Number(value.section_count) || 0} projetée(s).`, true);
    case 'role':
      return text(value.role) === e.role ? null
        : violation('OUTPUT_REQUIREMENT_MISMATCH', req.id, `Rôle attendu « ${e.role} », projeté « ${text(value.role) || 'aucun'} ».`, true);
    case 'recipient':
      return text(value.recipient) === e.recipient ? null
        : violation('OUTPUT_REQUIREMENT_MISMATCH', req.id, `Destinataire attendu « ${e.recipient} », projeté « ${text(value.recipient) || 'aucun'} ».`, true);
    case 'length':
      return text(value.length_policy) === e.length_policy ? null
        : violation('OUTPUT_REQUIREMENT_MISMATCH', req.id,
          `Politique de longueur attendue « ${e.length_policy} », projetée « ${text(value.length_policy) || 'aucune'} ».`, true);
    case 'opening_closing': {
      const openOk = e.opening === null || text(value.opening) === e.opening;
      const closeOk = e.closing === null || text(value.closing) === e.closing;
      return openOk && closeOk ? null
        : violation('OUTPUT_REQUIREMENT_MISMATCH', req.id, 'Ouverture ou clôture perdue à la projection.', true);
    }
    default:
      return null;   // check:* et obligation:* : la présence vaut couverture (§23)
  }
}

/* ------------------------------------------------------------------------ *
 * §35 — OUTPUT COMPLIANCE : PROTOTYPE DISTINCT, NON BRANCHÉ.
 *
 * Règle absolue : ce qui n'est pas vérifiable ne devient JAMAIS un PASS.
 * Un contrôle sémantique est DIFFÉRÉ, un contrôle qualitatif est NON VÉRIFIABLE ;
 * ni l'un ni l'autre ne peut être compté comme satisfait.
 * ------------------------------------------------------------------------ */
export const OUTPUT_GATE_STATUSES = Object.freeze([
  'PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL'
]);

export function validateOutputAgainstCanonicalContract({ canonical_contract, output, checks } = {}) {
  if (!canonical_contract || typeof canonical_contract !== 'object' || Array.isArray(canonical_contract)
      || !output || typeof output !== 'object' || Array.isArray(output)) {
    return {
      version: PROMPT_CONTRACT_GATE_VERSION,
      status: 'FAIL',
      violations: [{ code: 'TECHNICAL_VALIDATION_FAILURE', check_id: null, detail: 'Contrat canonique ou sortie absent.', blocking: true }],
      deferred: [], not_verifiable: [], executed: 0
    };
  }

  const c = plain(canonical_contract);
  const source = Array.isArray(checks) ? checks : list(c.checks);
  const violations = [];
  const deferred = [];
  const notVerifiable = [];
  let executed = 0;

  const expectedQuantity = plain(list(c.quantities)[0]);
  const expectedFormat = text(plain(c.output).format);

  for (const raw of source) {
    const check = plain(raw);
    const id = text(check.id) || null;
    const type = text(check.type);

    if (type === 'semantic') { deferred.push({ check_id: id, reason: 'DEFERRED' }); continue; }
    if (type === 'heuristic' || type === 'not_verifiable') { notVerifiable.push({ check_id: id, reason: 'NOT_VERIFIABLE' }); continue; }
    if (type !== 'deterministic') { notVerifiable.push({ check_id: id, reason: 'NOT_VERIFIABLE' }); continue; }

    executed += 1;
    if (check.rapide_source_field === 'quantities[0]' || /quantit/i.test(text(check.rule))) {
      const produced = Array.isArray(output.items) ? output.items.length : null;
      if (produced === null) {
        violations.push({ code: 'MISSING_REQUIRED_OUTPUT', check_id: id, detail: 'La sortie ne porte aucune collection dénombrable.', blocking: check.blocking === true });
      } else if (isInt(expectedQuantity.exact) && produced !== expectedQuantity.exact) {
        violations.push({ code: 'OUTPUT_QUANTITY_MISMATCH', check_id: id, detail: `${expectedQuantity.exact} attendu(s), ${produced} produit(s).`, blocking: check.blocking === true });
      }
      continue;
    }
    if (expectedFormat && text(output.format) !== expectedFormat) {
      violations.push({ code: 'OUTPUT_FORMAT_MISMATCH', check_id: id, detail: `Format attendu « ${expectedFormat} », produit « ${text(output.format) || 'aucun'} ».`, blocking: check.blocking === true });
    }
  }

  const blocking = violations.filter((v) => v.blocking);
  let status;
  if (blocking.length) status = 'FAIL';
  else if (deferred.length || notVerifiable.length) status = 'INCOMPLETE_VERIFICATION';
  else if (violations.length) status = 'PASS_WITH_WARNINGS';
  else status = 'PASS';

  return { version: PROMPT_CONTRACT_GATE_VERSION, status, violations, deferred, not_verifiable: notVerifiable, executed };
}
