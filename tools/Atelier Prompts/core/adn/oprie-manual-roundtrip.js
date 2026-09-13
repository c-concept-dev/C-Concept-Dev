/* ADN-ARCH-02-B1 — ROUND-TRIP OPRIE MANUEL ET EXÉCUTEURS DE RÔLE
 * ============================================================================
 *
 * CE MODULE N'EST PAS UN SECOND OPRIE.
 *
 * `runOperationalRequestTurn()` reçoit depuis toujours son `executeRole` en
 * paramètre : le serveur y branche une chaîne de fournisseurs, Architecte Pro y
 * branche ici soit un fournisseur navigateur, soit un collage humain. La
 * SÉQUENCE des rôles, la CONSTRUCTION des entrées, les PROMPTS, les SCHÉMAS et
 * les VALIDATEURS restent ceux du moteur, sans une ligne recopiée.
 *
 *   SEMANTIC_PIPELINE_COUNT   = 1   (un seul OPRIE, un seul mapper canonique)
 *   EXECUTION_MECHANISM_COUNT = 2   (fournisseur navigateur · collage humain)
 *
 * CE MODULE NE DÉCIDE AUCUNE SÉMANTIQUE. Il ne produit ni readiness, ni état,
 * ni question, ni verrou. Il compose des primitives existantes et s'arrête.
 */

import {
  ROLE_DEFINITIONS
} from '../../workers/shared/operational-request-core.js';
import {
  OPERATIONAL_REQUEST_ROLE_SEQUENCE,
  runOperationalRequestTurn
} from '../../workers/shared/operational-request-orchestrator.js';
import {
  assertCanonicalReadinessInvariant,
  mapOprieToCanonicalContract,
  validateCanonicalContract
} from './oprie-canonical-mapping.js';
import {
  enrichCanonicalContractFromArchAnalysis,
  mergePostOprieSignals,
  validateArchCanonicalEnrichment
} from './arch-canonical-enrichment.js';

/** États de la SESSION UX, et eux seuls. Aucun n'est un état métier : les états
 *  de la demande restent ceux d'OPRIE, décidés par l'Arbitre. */
export const MANUAL_SESSION_STATES = Object.freeze(['idle', 'waiting_for_external_response', 'running', 'completed', 'failed']);

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** Le schéma d'un rôle peut dépendre de son entrée (cas du Critique). */
function roleSchema(role, roleInput) {
  const def = ROLE_DEFINITIONS[role];
  return typeof def.schema === 'function' ? def.schema(roleInput) : def.schema;
}

/**
 * Instructions PORTABLES d'un rôle : exactement ce que le serveur envoie au
 * modèle, sérialisé pour un copier-coller humain. Aucun texte n'est inventé —
 * les trois morceaux viennent de ROLE_DEFINITIONS. Ni secret, ni endpoint, ni
 * nom de fournisseur ne peut s'y trouver : rien de tel n'y entre.
 *
 * C'est la même construction que la route Architecte historique
 * (`archRequete()` = système + entrée + schéma).
 */
export function buildPortableRolePrompt(role, roleInput) {
  if (!ROLE_DEFINITIONS[role]) throw new TypeError(`Rôle inconnu : ${role}.`);
  const def = ROLE_DEFINITIONS[role];
  return [
    def.systemPrompt,
    '## ENTRÉE À ANALYSER',
    def.buildUserMessage(roleInput),
    '## SCHÉMA JSON DE SORTIE',
    JSON.stringify(roleSchema(role, roleInput), null, 2),
    'Répondez uniquement avec un objet JSON conforme au schéma, sans texte autour.'
  ].join('\n\n');
}

/* -------------------------------------------------------------------------
 * EXÉCUTEUR MANUEL — suspend le tour, expose les instructions, reprend
 * ---------------------------------------------------------------------- */

/**
 * @param {{onStep?: (snapshot: object) => void}} options
 * @returns {{executeRole: Function, submit: Function, abort: Function, snapshot: Function}}
 */
export function createManualRoleExecutor({ onStep } = {}) {
  const sequence = [...OPERATIONAL_REQUEST_ROLE_SEQUENCE];
  const state = {
    status: 'idle',
    pending_role: null,
    pending_prompt: '',
    step_index: 0,
    step_count: sequence.length,
    accepted_roles: [],
    last_error: null
  };
  let resolve = null;
  let reject = null;

  const snapshot = () => clone(state);
  const notify = () => { if (typeof onStep === 'function') onStep(snapshot()); };

  /* Le tour s'arrête ici tant que la personne n'a pas collé la réponse. Aucune
     valeur n'est inventée en attendant : la promesse reste simplement ouverte. */
  const executeRole = (role, roleInput) => new Promise((res, rej) => {
    state.status = 'waiting_for_external_response';
    state.pending_role = role;
    state.step_index = sequence.indexOf(role) + 1;
    state.pending_prompt = buildPortableRolePrompt(role, roleInput);
    state.last_error = null;
    resolve = res;
    reject = rej;
    notify();
  });

  /**
   * Consomme une réponse collée. Une réponse non conforme NE CASSE PAS la
   * session : elle est refusée, l'étape reste ouverte, et rien n'est perdu.
   */
  function submit(pastedText) {
    if (state.status !== 'waiting_for_external_response' || !resolve) {
      return { ok: false, role: null, error: 'Aucune étape n’attend de réponse.' };
    }
    const role = state.pending_role;
    let output;
    try {
      output = ROLE_DEFINITIONS[role].parseOutput(pastedText);
    } catch (error) {
      state.last_error = String((error && error.message) || error);
      notify();
      return { ok: false, role, error: state.last_error };
    }
    state.accepted_roles.push(role);
    state.status = 'running';
    state.pending_role = null;
    state.pending_prompt = '';
    state.last_error = null;
    const done = resolve;
    resolve = null;
    reject = null;
    notify();
    done(output);
    return { ok: true, role };
  }

  function abort(reason) {
    const fail = reject;
    resolve = null;
    reject = null;
    state.status = 'failed';
    state.pending_role = null;
    state.pending_prompt = '';
    state.last_error = text(reason) || 'Préparation interrompue.';
    notify();
    if (fail) fail(new Error(state.last_error));
  }

  function complete(status) {
    state.status = status;
    state.pending_role = null;
    state.pending_prompt = '';
    notify();
  }

  return { executeRole, submit, abort, complete, snapshot };
}

/**
 * Exécuteur par FOURNISSEUR : même contrat, transport différent. `callRole`
 * reçoit le prompt système, le message utilisateur et le schéma du rôle, et
 * rend le texte brut du modèle. La validation reste celle du moteur.
 */
export function createProviderRoleExecutor(callRole) {
  if (typeof callRole !== 'function') throw new TypeError('createProviderRoleExecutor : callRole est obligatoire.');
  return async (role, roleInput) => {
    const def = ROLE_DEFINITIONS[role];
    const raw = await callRole({
      role,
      systemPrompt: def.systemPrompt,
      userMessage: def.buildUserMessage(roleInput),
      schema: roleSchema(role, roleInput)
    });
    return def.parseOutput(raw);
  };
}

/** UNIQUE point d'entrée d'un tour OPRIE côté Architecte, quel que soit le mode. */
export function runOprieTurnWithExecutor({ original_request, clarification_history = [] }, executeRole) {
  return runOperationalRequestTurn(
    { original_request: text(original_request), clarification_history: [...clarification_history] },
    { executeRole, log() {} }
  );
}

/** Démarre un tour en mode collage. Rend la session ET la promesse du tour. */
export function startManualOprieTurn({ original_request, clarification_history = [] }, { onStep } = {}) {
  const session = createManualRoleExecutor({ onStep });
  const completion = runOprieTurnWithExecutor({ original_request, clarification_history }, session.executeRole)
    .then((turn) => { session.complete('completed'); return turn; })
    .catch((error) => { session.complete('failed'); throw error; });
  return { session, completion };
}

/* -------------------------------------------------------------------------
 * DU TOUR OPRIE AU CONTRAT COMPILABLE — COMPOSITION, JAMAIS RÉIMPLÉMENTATION
 * ---------------------------------------------------------------------- */

/** Les quatre états, et ce que chacun autorise. Recopie de la gouvernance
 *  existante : seul `operational_request_ready` ouvre l'exécution. */
export const ARCHITECTE_TURN_OUTCOMES = Object.freeze({
  operational_request_ready: 'ready',
  clarification_required: 'clarification',
  confirmation_required: 'confirmation',
  blocked: 'blocked'
});

/**
 * Transforme un tour OPRIE en contrat canonique ENRICHI, prêt pour archCompiler.
 *
 * Chaîne, dans l'ordre, uniquement composée de primitives existantes :
 *   mapOprieToCanonicalContract → validateCanonicalContract
 *   → assertCanonicalReadinessInvariant → enrichCanonicalContractFromArchAnalysis
 *   → validateArchCanonicalEnrichment → mergePostOprieSignals
 *
 * FAIL-CLOSED intégral : tout état non exécutable, tout contrat invalide, toute
 * mutation d'un champ OPRIE et tout signal restant interdisent la compilation.
 *
 * @returns {{outcome: string, contract: object|null, base: object|null, signals: object[], detail: string}}
 */
export function buildArchitecteContractFromTurn(turn, { request_id, original_request, archAnalyse } = {}) {
  const refuse = (outcome, detail, signals = []) => ({ outcome, contract: null, base: null, signals, detail });

  if (!turn || typeof turn !== 'object' || Array.isArray(turn)) return refuse('technical', 'Tour OPRIE absent ou illisible.');
  const outcome = ARCHITECTE_TURN_OUTCOMES[text(turn.state)];
  if (!outcome) return refuse('technical', `État OPRIE hors énumération : ${text(turn.state) || 'vide'}.`);

  let base;
  try {
    base = mapOprieToCanonicalContract(turn, { request_id, original_request });
  } catch (error) {
    return refuse('technical', `Contrat canonique impossible : ${(error && error.message) || 'cause inconnue'}.`);
  }
  const verdict = validateCanonicalContract(base, { arbiterOutput: turn, original_request });
  if (!verdict || verdict.ok !== true) {
    return refuse('technical', `Contrat canonique refusé : ${(verdict && verdict.problems || []).join(' · ')}`);
  }

  /* Les trois états non exécutables s'arrêtent ICI : aucun enrichissement,
     aucune compilation, aucune question posée localement. */
  if (outcome !== 'ready') return { outcome, contract: null, base, signals: [], detail: '' };

  /* La garde de readiness existante confirme que la base autorise une route. */
  try {
    assertCanonicalReadinessInvariant(base, { decision: { etat_demande: 'exploitable', route: 'architecte' } });
  } catch (error) {
    return refuse('technical', (error && error.message) || 'Garde readiness.');
  }

  /* Sans analyse Architecte, la chaîne s'arrête à la base validée : c'est l'état
     normal du parcours hors ligne, où OPRIE passe AVANT l'analyse Architecte.
     Rien n'est compilable à ce stade, et c'est dit explicitement. */
  if (archAnalyse === undefined || archAnalyse === null) {
    return { outcome: 'ready_pending_analysis', contract: null, base, signals: [], detail: '' };
  }

  const enrichment = enrichCanonicalContractFromArchAnalysis(base, archAnalyse);
  const guard = validateArchCanonicalEnrichment(base, enrichment.contract, archAnalyse);
  if (!guard || guard.ok !== true) {
    return refuse('technical', `Enrichissement Architecte refusé : ${(guard && guard.problems || []).join(' · ')}`);
  }
  const signals = mergePostOprieSignals(enrichment.signals);
  if (signals.length) return { outcome: 'signalled', contract: null, base, signals, detail: signals[0].detail };

  return { outcome: 'ready', contract: enrichment.contract, base, signals: [], detail: '' };
}
