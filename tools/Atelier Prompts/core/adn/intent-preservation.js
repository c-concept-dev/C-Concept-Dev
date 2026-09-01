import {
  CANDIDATE_FIELDS,
  normalizeCandidate,
  normalizeProvenanceRecords,
  normalizeStatusChanges,
  normalizeIssues,
  normalizeResolutions,
  isLegalTransition
} from "./operational-request-state.js";

export const INTENT_PRESERVATION_VERSION = "1.0";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Normalisation minimale et déterministe pour la seule comparaison de valeurs (jamais appliquée aux
 * valeurs stockées/retournées) : espaces périphériques, casse non significative, ponctuation
 * terminale simple. Ceci évite uniquement les faux positifs triviaux de représentation (mêmes mots,
 * mise en forme différente) — ce n'est ni un rapprochement approximatif de mots-clés, ni un
 * embedding, ni une prétention à juger l'équivalence sémantique. Deux valeurs dont le contenu diffère réellement
 * restent distinctes après normalisation.
 */
function normalizeForComparison(value) {
  return String(value ?? "").trim().replace(/[.!?,;:]+$/u, "").toLowerCase();
}

function sameValue(a, b) {
  return normalizeForComparison(a) === normalizeForComparison(b);
}

/**
 * Couche déterministe uniquement (CDC §14.1). Elle ne juge jamais le sens : elle vérifie ce qui
 * est mécaniquement vérifiable — provenance, structure, suppressions/ajouts, statuts, traçabilité
 * des contradictions, légalité de la transition d'état. Aucun rapprochement de mots-clés n'intervient
 * ici ; la fidélité sémantique (objective_preserved, priorities_preserved, semantic_equivalence)
 * est explicitement laissée à null, réservée à la couche sémantique (rôles Critique/Arbitre,
 * hors périmètre de ce module).
 */

/**
 * Tout élément matériel du candidat (tous les champs sont matériels dès qu'ils sont renseignés,
 * cf. règle anti-questionnaire universel : un champ vide n'a rien à prouver) doit être relié à un
 * enregistrement de provenance portant exactement le même champ et la même valeur.
 */
export function assessProvenance(candidate, provenanceRecords) {
  const normalizedCandidate = normalizeCandidate(candidate);
  const records = normalizeProvenanceRecords(provenanceRecords);
  const unsupported_additions = [];
  for (const field of CANDIDATE_FIELDS) {
    const values = Array.isArray(normalizedCandidate[field]) ? normalizedCandidate[field] : [normalizedCandidate[field]];
    for (const value of values) {
      if (!value) continue;
      const hasProvenance = records.some((record) => record.field === field && sameValue(record.value, value));
      if (!hasProvenance) unsupported_additions.push({ field, value });
    }
  }
  return { unsupported_additions };
}

/**
 * Tout élément présent dans le candidat précédent et absent du candidat suivant doit correspondre
 * à un changement de statut tracé (StatusChange) sur ce même champ et cette même valeur. À défaut,
 * c'est une suppression non soutenue.
 */
export function diffCandidates(candidatePrevious, candidateNext, statusChanges) {
  if (!candidatePrevious) return { unsupported_removals: [] };
  const previous = normalizeCandidate(candidatePrevious);
  const next = normalizeCandidate(candidateNext);
  const changes = normalizeStatusChanges(statusChanges);
  const unsupported_removals = [];
  for (const field of CANDIDATE_FIELDS) {
    const previousValues = Array.isArray(previous[field]) ? previous[field] : (previous[field] ? [previous[field]] : []);
    const nextValues = Array.isArray(next[field]) ? next[field] : (next[field] ? [next[field]] : []);
    for (const value of previousValues) {
      if (nextValues.some((candidate) => sameValue(candidate, value))) continue;
      const tracked = changes.some((change) => change.field === field && sameValue(change.value, value));
      if (!tracked) unsupported_removals.push({ field, value });
    }
  }
  return { unsupported_removals };
}

/**
 * Toute issue de type conflict avec impact=material présente au tour précédent doit soit rester
 * listée au tour suivant (non résolue, ce qui est honnête), soit avoir une Resolution tracée
 * référençant son id. Sa disparition silencieuse, sans trace, est un arbitrage silencieux.
 */
export function assessContradictionTraceability(issuesPrevious, issuesNext, resolutions) {
  const previous = normalizeIssues(issuesPrevious);
  const next = normalizeIssues(issuesNext);
  const resolved = normalizeResolutions(resolutions);
  const silent_arbitrations = [];
  for (const issue of previous) {
    if (issue.type !== "conflict" || issue.impact !== "material") continue;
    const stillOpen = next.some((candidate) => candidate.id === issue.id);
    if (stillOpen) continue;
    const hasResolution = resolved.some((resolution) => resolution.issue_id === issue.id);
    if (!hasResolution) silent_arbitrations.push({ issue_id: issue.id, description: issue.description });
  }
  return { silent_arbitrations };
}

export function assessStateLegality(from, to) {
  return { legal: isLegalTransition(from, to) };
}

/**
 * Agrège les quatre contrôles déterministes. Ne retourne jamais de verdict sur le sens :
 * objective_preserved, priorities_preserved et semantic_equivalence restent null ici, à charge
 * de la couche sémantique (hors périmètre de ce module) de les renseigner.
 */
export function assessIntentPreservationDeterministic({
  candidate_previous = null,
  candidate_next,
  provenance_records = [],
  status_changes = [],
  issues_previous = [],
  issues_next = [],
  resolutions = [],
  transition = null
} = {}) {
  const provenanceResult = assessProvenance(candidate_next, provenance_records);
  const removalResult = diffCandidates(candidate_previous, candidate_next, status_changes);
  const contradictionResult = assessContradictionTraceability(issues_previous, issues_next, resolutions);
  const legality = transition ? assessStateLegality(transition.from, transition.to) : { legal: true };

  const pass = legality.legal
    && provenanceResult.unsupported_additions.length === 0
    && removalResult.unsupported_removals.length === 0
    && contradictionResult.silent_arbitrations.length === 0;

  return clone({
    version: INTENT_PRESERVATION_VERSION,
    layer: "deterministic",
    structurally_valid: legality.legal,
    unsupported_additions: provenanceResult.unsupported_additions,
    unsupported_removals: removalResult.unsupported_removals,
    silent_arbitrations: contradictionResult.silent_arbitrations,
    objective_preserved: null,
    priorities_preserved: null,
    semantic_equivalence: null,
    pass
  });
}

export function createIntentPreservationAuditView(result) {
  return {
    version: result.version,
    layer: result.layer,
    pass: result.pass,
    structurally_valid: result.structurally_valid,
    unsupported_additions_count: list(result.unsupported_additions).length,
    unsupported_removals_count: list(result.unsupported_removals).length,
    silent_arbitrations_count: list(result.silent_arbitrations).length
  };
}
