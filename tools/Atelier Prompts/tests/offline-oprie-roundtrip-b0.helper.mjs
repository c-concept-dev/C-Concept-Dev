/* ADN-ARCH-02-B0 — HARNAIS EXPLORATOIRE DU ROUND-TRIP OPRIE HORS LIGNE
 *
 * Ce fichier n'est PAS une suite de tests et n'est PAS du code de production :
 * c'est un helper d'espace de test, destiné à PROUVER une faisabilité.
 *
 * PRINCIPE — AUCUNE SECONDE IMPLÉMENTATION
 *
 * Rien n'est réécrit ici. Le harnais se contente de brancher un `executeRole`
 * MANUEL sur l'orchestrateur EXISTANT : `runOperationalRequestTurn()` reçoit
 * déjà son exécuteur de rôle en paramètre, précisément pour être indépendant du
 * transport. Le serveur y branche une chaîne HA de fournisseurs ; on y branche
 * ici un dictionnaire de réponses collées par la personne.
 *
 * Conséquence directe : la SÉQUENCE des rôles, la CONSTRUCTION des entrées, les
 * PROMPTS, les SCHÉMAS et les VALIDATEURS restent ceux du serveur, octet pour
 * octet. Il n'existe ni second OPRIE, ni second mapper, ni readiness locale.
 */
import {
  ROLE_DEFINITIONS
} from '../workers/shared/operational-request-core.js';
import {
  OPERATIONAL_REQUEST_ROLE_SEQUENCE,
  runOperationalRequestTurn
} from '../workers/shared/operational-request-orchestrator.js';

/**
 * Prompt PORTABLE d'un rôle : exactement ce que le serveur envoie au modèle,
 * sérialisé pour un copier-coller humain. Aucun texte nouveau n'est inventé —
 * les trois morceaux viennent de ROLE_DEFINITIONS.
 *
 * C'est la même construction que la route Architecte historique
 * (`archRequete()` = ARCH_SYSTEM + entrée + schéma).
 */
export function portableRolePrompt(role, roleInput) {
  const def = ROLE_DEFINITIONS[role];
  if (!def) throw new TypeError(`Rôle OPRIE inconnu : ${role}.`);
  const schema = typeof def.schema === 'function' ? def.schema(roleInput) : def.schema;
  return [
    def.systemPrompt,
    '## ENTRÉE À ANALYSER',
    def.buildUserMessage(roleInput),
    '## SCHÉMA JSON DE SORTIE',
    JSON.stringify(schema, null, 2),
    'Répondez uniquement avec un objet JSON conforme au schéma.'
  ].join('\n\n');
}

/**
 * Exécute un tour OPRIE en mode COLLÉ : `pasted` associe à chaque rôle le texte
 * rendu par le LLM externe. `onPrompt` reçoit le prompt portable réellement
 * construit pour ce rôle (c'est ce qu'une UI afficherait à copier).
 *
 * L'orchestrateur n'est pas modifié : il valide chaque sortie de rôle et
 * construit lui-même l'entrée du rôle suivant. Une réponse collée pour le
 * Critique ne peut donc pas court-circuiter l'Analyste.
 */
export async function runPastedOprieTurn({ original_request, clarification_history = [] }, pasted, { onPrompt } = {}) {
  const seen = [];
  const executeRole = async (role, roleInput) => {
    seen.push(role);
    if (onPrompt) onPrompt(role, portableRolePrompt(role, roleInput), roleInput);
    if (!(role in pasted)) throw new TypeError(`Aucune réponse collée pour le rôle ${role}.`);
    /* parseOutput = le validateur du serveur, tolérant aux blocs ```json. */
    return ROLE_DEFINITIONS[role].parseOutput(pasted[role]);
  };
  const turn = await runOperationalRequestTurn({ original_request, clarification_history }, { executeRole, log() {} });
  return { turn, seen, sequence: [...OPERATIONAL_REQUEST_ROLE_SEQUENCE] };
}

/* -------------------------------------------------------------------------
 * FIXTURES — neutres, sans aucun vocabulaire de domaine.
 * ---------------------------------------------------------------------- */

export function analystOutputFixture(over = {}) {
  return {
    operational_request_candidate: candidateFixture(over.operational_request_candidate || {}),
    provenance_records: [
      { field: 'objective', value: candidateFixture().objective, provenance: 'explicit_user_statement' },
      { field: 'expected_deliverable', value: candidateFixture().expected_deliverable, provenance: 'explicit_user_statement' }
    ],
    issues: [],
    question_candidates: [],
    confirmation_signals: {
      multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false,
      strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false
    },
    ...over
  };
}

export function criticOutputFixture(over = {}) {
  return {
    agreement: 'agree',
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: '',
    question_substitution_review: [],
    illegitimate_question_found: [],
    ...over
  };
}

export function candidateFixture(over = {}) {
  return {
    objective: 'Produire le livrable demandé par la personne.',
    expected_deliverable: 'Un livrable explicitement nommé.',
    secondary_objectives: [],
    confirmed_constraints: [],
    confirmed_priorities: [],
    confirmed_preferences: [],
    delegated_decisions: [],
    external_facts_to_research: [],
    assumptions_allowed: [],
    remaining_unknowns: [],
    ...over
  };
}

/** ArbiterOutput conforme, pour chacun des quatre états. */
export function arbiterOutputFixture(state = 'operational_request_ready', over = {}) {
  const base = {
    state,
    operational_request_candidate: candidateFixture(over.operational_request_candidate || {}),
    issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'Motif de décision fourni par l’Arbitre.'
  };
  if (state === 'clarification_required') {
    base.next_question = { text: 'Une précision est nécessaire ?', targets_issue_id: 'issue-1', expected_progress: 'Lever un obstacle identifié.' };
  }
  if (state === 'confirmation_required') base.confirmation_reason = 'Des arbitrages ont été faits.';
  if (state === 'blocked') base.blocked_reason = 'Un obstacle rend la demande non préparable.';
  const out = { ...base, ...over };
  out.operational_request_candidate = base.operational_request_candidate;
  return out;
}
