/* IA-04 — CYCLE DE VIE D'UNE EXÉCUTION
 * ============================================================================
 *
 * Une exécution logique naît une fois, traverse ses phases dans l'ordre, et se
 * termine une fois. Ce module ne fait respecter que cela.
 *
 * Ce qu'il n'est pas :
 *
 *   UNE AUTORITÉ. Il ne sait pas ce qu'est une readiness, un verdict de gate ou
 *   un état OPRIE. Il ne les lit pas, ne les produit pas, n'en juge aucun. Les
 *   phases qu'il connaît sont des étapes TECHNIQUES d'un cycle, pas des états
 *   de la demande — et aucune ne porte le nom d'un état métier.
 *
 *   UN CLASSIFICATEUR DE RÉSULTAT. Le résultat terminal lui est DONNÉ ; il le
 *   conserve tel quel et refuse qu'un second vienne l'écraser. Décider si un
 *   livrable est conforme appartient au gate de sortie, et à lui seul.
 *
 * Les deux distinctions qui justifient son existence :
 *
 *   UNE TENTATIVE FOURNISSEUR N'EST PAS UNE EXÉCUTION. Une exécution logique
 *   peut contenir N appels — reprises 429, bascule Groq -> Anthropic -> OpenAI.
 *   Les compter comme N exécutions ferait payer, et rendrait « exactement une
 *   fois » infalsifiable.
 *
 *   UN RÉSULTAT TARDIF N'EST PAS UN RÉSULTAT. Le premier terminal valide gagne.
 *   Sans cela, deux rappels concurrents laisseraient le dernier écrire — et le
 *   dernier n'est pas le plus vrai, seulement le plus lent.
 *
 * PURETÉ : aucune entrée/sortie, aucun réseau, aucun fournisseur, aucun DOM,
 * aucune horloge, aucun aléa. Les identifiants sont des entiers monotones, pas
 * des horodatages : un horodatage ne prouve aucun ordre.
 * ========================================================================= */

export const EXECUTION_LIFECYCLE_VERSION = "1.0";

/**
 * Les phases TECHNIQUES d'un cycle, dans leur ordre strict. Aucune ne porte le
 * nom d'un état OPRIE : ce sont des étapes de fabrication, pas des verdicts.
 */
export const EXECUTION_PHASES = Object.freeze(["READINESS", "PROMPT_QG", "EXECUTION", "OUTPUT_QG", "TERMINAL"]);

/** Motifs de refus. Techniques, destinés à l'audit — jamais à l'interface. */
export const LIFECYCLE_REFUSALS = Object.freeze([
  "UNKNOWN_EXECUTION", "STALE_EXECUTION", "PHASE_UNKNOWN", "PHASE_SKIPPED",
  "PHASE_REWIND", "PHASE_ALREADY_ENTERED", "ALREADY_TERMINAL", "TERMINAL_ALREADY_APPLIED",
  "TURN_ID_INVALID", "OUTCOME_MISSING"
]);

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const ok = (extra) => Object.freeze({ allowed: true, reason: null, ...(extra || {}) });
const no = (reason, extra) => Object.freeze({ allowed: false, reason, ...(extra || {}) });

/**
 * Crée un registre de cycles. Un registre par application ; il ne conserve que
 * des métadonnées d'exécution, jamais un contenu.
 *
 * @param {{maxRecords?: number}} [options] borne de rétention (défaut 20).
 */
export function createExecutionLifecycle({ maxRecords = 20 } = {}) {
  /* L'identifiant est un COMPTEUR, jamais un horodatage : deux exécutions
     lancées dans la même milliseconde doivent rester distinguables et ordonnées. */
  let nextId = 1;
  const records = [];

  const find = (executionId) => records.find((r) => r.execution_id === executionId) || null;
  const trim = () => { while (records.length > maxRecords) records.shift(); };

  return {
    /**
     * Ouvre une exécution logique pour un tour. Rend un identifiant technique.
     * Le tour, lui, appartient à l'orchestration : ce module ne le décide pas.
     */
    begin({ turn_id, canonical_version = null } = {}) {
      if (!isInt(turn_id) || turn_id < 0) return no("TURN_ID_INVALID");
      const record = {
        execution_id: nextId,
        turn_id,
        canonical_version,
        phases: [],
        provider_attempts: 0,
        terminal: null,
        terminal_applied: false
      };
      nextId += 1;
      records.push(record);
      trim();
      return ok({ execution_id: record.execution_id });
    },

    /**
     * Entre dans une phase. L'ordre est strict : on n'en saute aucune, on n'en
     * rejoue aucune, et on ne revient jamais en arrière.
     */
    enterPhase(executionId, phase, { currentTurnId = null } = {}) {
      const record = find(executionId);
      if (!record) return no("UNKNOWN_EXECUTION");
      if (currentTurnId !== null && isInt(currentTurnId) && record.turn_id < currentTurnId) {
        /* Le tour a avancé : ce cycle appartient au passé et n'agit plus. */
        return no("STALE_EXECUTION");
      }
      const index = EXECUTION_PHASES.indexOf(phase);
      if (index === -1) return no("PHASE_UNKNOWN");
      if (record.terminal_applied) return no("ALREADY_TERMINAL");
      if (record.phases.includes(phase)) return no("PHASE_ALREADY_ENTERED");
      const derniere = record.phases.length ? EXECUTION_PHASES.indexOf(record.phases[record.phases.length - 1]) : -1;
      if (index < derniere) return no("PHASE_REWIND");
      /* Sauter une phase n'est pas « aller plus vite » : c'est franchir une
         porte sans la traverser. Chaque phase suit immédiatement la précédente. */
      if (index !== derniere + 1) return no("PHASE_SKIPPED");
      record.phases.push(phase);
      return ok({ phase, entered: [...record.phases] });
    },

    /**
     * Enregistre une tentative fournisseur. Elle ne crée AUCUNE exécution : une
     * reprise ou une bascule reste le même appel logique, et doit le rester —
     * sinon « exécuté exactement une fois » ne voudrait plus rien dire.
     */
    recordProviderAttempt(executionId) {
      const record = find(executionId);
      if (!record) return no("UNKNOWN_EXECUTION");
      if (record.terminal_applied) return no("ALREADY_TERMINAL");
      record.provider_attempts += 1;
      return ok({ provider_attempts: record.provider_attempts });
    },

    /**
     * Pose le résultat terminal. Le PREMIER gagne, définitivement.
     *
     * `outcome` est conservé tel quel et n'est jamais interprété : ce module ne
     * sait pas distinguer un succès d'un échec, et n'a pas à le savoir.
     */
    applyTerminal(executionId, outcome) {
      const record = find(executionId);
      if (!record) return no("UNKNOWN_EXECUTION");
      if (outcome === undefined || outcome === null) return no("OUTCOME_MISSING");
      if (record.terminal_applied) return no("TERMINAL_ALREADY_APPLIED", { terminal: record.terminal });
      record.terminal = outcome;
      record.terminal_applied = true;
      if (!record.phases.includes("TERMINAL")) record.phases.push("TERMINAL");
      return ok({ terminal: outcome });
    },

    /** Ce cycle appartient-il encore au tour courant ? */
    isCurrent(executionId, currentTurnId) {
      const record = find(executionId);
      if (!record || !isInt(currentTurnId)) return false;
      return record.turn_id === currentTurnId && !record.terminal_applied;
    },

    /** Un cycle est-il encore ouvert pour ce tour ? Sert à refuser une seconde entrée. */
    hasOpenExecution(turnId) {
      return records.some((r) => r.turn_id === turnId && !r.terminal_applied);
    },

    /** Vue d'audit : métadonnées seules, aucun contenu. */
    describe(executionId) {
      const record = find(executionId);
      if (!record) return null;
      return Object.freeze({
        execution_id: record.execution_id,
        turn_id: record.turn_id,
        canonical_version: record.canonical_version,
        phases: Object.freeze([...record.phases]),
        provider_attempts: record.provider_attempts,
        terminal_applied: record.terminal_applied
      });
    },

    get executionCount() { return records.length; },
    get lastExecutionId() { return records.length ? records[records.length - 1].execution_id : null; }
  };
}

/**
 * PROVENANCE — l'artefact exécuté est-il celui qui a été contrôlé ?
 *
 * Un gate de prompt qui valide A pendant qu'on exécute B ne valide rien. La
 * comparaison est faite sur des IDENTIFIANTS fournis, jamais sur une
 * ressemblance de contenu : ce module ne compare aucun texte.
 */
export function assertExecutionProvenance({ qg_artifact_id, execution_artifact_id } = {}) {
  if (!qg_artifact_id || !execution_artifact_id) return no("OUTCOME_MISSING");
  return qg_artifact_id === execution_artifact_id ? ok() : no("PHASE_SKIPPED");
}

/**
 * Le résultat contrôlé est-il celui de l'exécution courante ?
 * Même règle : des identifiants, pas des contenus.
 */
export function assertOutputProvenance({ execution_id, output_execution_id } = {}) {
  if (!isInt(execution_id) || !isInt(output_execution_id)) return no("UNKNOWN_EXECUTION");
  return execution_id === output_execution_id ? ok() : no("STALE_EXECUTION");
}
