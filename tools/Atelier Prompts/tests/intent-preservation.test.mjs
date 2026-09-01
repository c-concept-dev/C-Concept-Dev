import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEmptyCandidate,
  assessProvenance,
  diffCandidates,
  assessContradictionTraceability,
  assessStateLegality,
  assessIntentPreservationDeterministic,
  createIntentPreservationAuditView
} from "../core/adn/index.js";

function candidate(overrides = {}) {
  return { ...createEmptyCandidate(), ...overrides };
}

function materialConflict(id, overrides = {}) {
  return {
    id,
    type: "conflict",
    kind: "priority_conflict",
    description: "Deux priorités concurrentes non arbitrées.",
    impact: "material",
    substitutable: false,
    recommended_treatment: "question",
    ...overrides
  };
}

test("assessProvenance signale tout élément matériel sans enregistrement de provenance", () => {
  const c = candidate({ objective: "Préparer un voyage en Italie.", confirmed_constraints: ["Budget maximum 1200€"] });
  const withoutProvenance = assessProvenance(c, []);
  assert.equal(withoutProvenance.unsupported_additions.length, 2);

  const withProvenance = assessProvenance(c, [
    { field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" },
    { field: "confirmed_constraints", value: "Budget maximum 1200€", provenance: "clarification_answer" }
  ]);
  assert.equal(withProvenance.unsupported_additions.length, 0);
});

test("assessProvenance n'exige rien sur un champ vide (règle anti-questionnaire)", () => {
  const empty = candidate();
  const result = assessProvenance(empty, []);
  assert.equal(result.unsupported_additions.length, 0);
});

// --- 3F.3.3-C, A4 : normalisation déterministe minimale (positif) ------------------------------
// Espaces périphériques, casse non significative, ponctuation terminale simple : aucun de ces
// écarts de pure représentation ne doit produire un faux positif d'ajout non tracé.

test("assessProvenance : espaces périphériques n'entraînent pas de faux positif", () => {
  const c = candidate({ objective: "Préparer un voyage en Italie." });
  const result = assessProvenance(c, [{ field: "objective", value: "  Préparer un voyage en Italie.  ", provenance: "explicit_user_statement" }]);
  assert.equal(result.unsupported_additions.length, 0);
});

test("assessProvenance : casse non significative n'entraîne pas de faux positif", () => {
  const c = candidate({ objective: "Préparer un voyage en Italie." });
  const result = assessProvenance(c, [{ field: "objective", value: "PRÉPARER UN VOYAGE EN ITALIE.", provenance: "explicit_user_statement" }]);
  assert.equal(result.unsupported_additions.length, 0);
});

test("assessProvenance : ponctuation terminale simple différente n'entraîne pas de faux positif", () => {
  const c = candidate({ objective: "Préparer un voyage en Italie" });
  const result = assessProvenance(c, [{ field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" }]);
  assert.equal(result.unsupported_additions.length, 0);
});

// --- 3F.3.3-C, A4 : la normalisation reste strictement déterministe (négatif) -------------------
// Deux valeurs dont le contenu diffère réellement (pas seulement la représentation) restent
// distinctes : la normalisation ne doit jamais glisser vers un jugement de similarité sémantique.

test("assessProvenance : une valeur réellement différente reste un ajout non tracé malgré la normalisation", () => {
  const c = candidate({ objective: "Préparer un voyage en Espagne." });
  const result = assessProvenance(c, [{ field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" }]);
  assert.equal(result.unsupported_additions.length, 1);
});

test("assessProvenance : un mot ajouté ou retiré au milieu de la valeur reste détecté (pas de rapprochement approximatif)", () => {
  const c = candidate({ objective: "Préparer un court voyage en Italie." });
  const result = assessProvenance(c, [{ field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" }]);
  assert.equal(result.unsupported_additions.length, 1);
});

test("diffCandidates signale une suppression non tracée et laisse passer une suppression justifiée", () => {
  const previous = candidate({ confirmed_constraints: ["Budget maximum 1200€", "Départ le 3 juin"] });
  const nextUntracked = candidate({ confirmed_constraints: ["Départ le 3 juin"] });
  const untracked = diffCandidates(previous, nextUntracked, []);
  assert.equal(untracked.unsupported_removals.length, 1);
  assert.deepEqual(untracked.unsupported_removals[0], { field: "confirmed_constraints", value: "Budget maximum 1200€" });

  const tracked = diffCandidates(previous, nextUntracked, [
    { field: "confirmed_constraints", value: "Budget maximum 1200€", reason: "Levée explicitement par l'utilisateur au tour 3." }
  ]);
  assert.equal(tracked.unsupported_removals.length, 0);
});

test("diffCandidates sans candidat précédent ne signale jamais de suppression", () => {
  const result = diffCandidates(null, candidate({ objective: "x" }), []);
  assert.equal(result.unsupported_removals.length, 0);
});

test("assessContradictionTraceability signale un conflit matériel disparu sans résolution tracée", () => {
  const previousIssues = [materialConflict("ISSUE-001")];
  const silentlyDropped = assessContradictionTraceability(previousIssues, [], []);
  assert.equal(silentlyDropped.silent_arbitrations.length, 1);
  assert.equal(silentlyDropped.silent_arbitrations[0].issue_id, "ISSUE-001");

  const stillOpen = assessContradictionTraceability(previousIssues, previousIssues, []);
  assert.equal(stillOpen.silent_arbitrations.length, 0, "un conflit encore listé n'est pas un arbitrage silencieux");

  const resolved = assessContradictionTraceability(previousIssues, [], [
    { issue_id: "ISSUE-001", provenance: "clarification_answer", note: "Arbitré par la réponse utilisateur au tour 4." }
  ]);
  assert.equal(resolved.silent_arbitrations.length, 0, "une résolution tracée couvre la disparition");
});

test("assessContradictionTraceability ignore les issues non matérielles ou non-conflict", () => {
  const nonMaterial = [materialConflict("ISSUE-002", { impact: "non_material" })];
  assert.equal(assessContradictionTraceability(nonMaterial, [], []).silent_arbitrations.length, 0);

  const missingInfo = [{
    id: "ISSUE-003",
    type: "missing_information",
    description: "Destination non précisée.",
    impact: "material",
    substitutable: false,
    recommended_treatment: "question"
  }];
  assert.equal(assessContradictionTraceability(missingInfo, [], []).silent_arbitrations.length, 0);
});

test("assessStateLegality délègue à la machine d'état sans jamais légaliser degraded_state -> ready", () => {
  assert.equal(assessStateLegality("understanding", "operational_request_ready").legal, true);
  assert.equal(assessStateLegality("degraded_state", "operational_request_ready").legal, false);
});

test("assessIntentPreservationDeterministic : cas propre => pass=true et champs sémantiques réservés à null", () => {
  const result = assessIntentPreservationDeterministic({
    candidate_previous: null,
    candidate_next: candidate({ objective: "Préparer un voyage en Italie." }),
    provenance_records: [{ field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" }],
    issues_previous: [],
    issues_next: [],
    resolutions: [],
    transition: { from: "understanding", to: "operational_request_ready" }
  });
  assert.equal(result.pass, true);
  assert.equal(result.structurally_valid, true);
  assert.deepEqual(result.unsupported_additions, []);
  assert.deepEqual(result.unsupported_removals, []);
  assert.deepEqual(result.silent_arbitrations, []);
  assert.equal(result.objective_preserved, null, "la couche déterministe ne juge jamais le sens");
  assert.equal(result.priorities_preserved, null, "la couche déterministe ne juge jamais le sens");
  assert.equal(result.semantic_equivalence, null, "la couche déterministe ne juge jamais le sens");
});

test("assessIntentPreservationDeterministic : chaque défaut structurel fait échouer le gate indépendamment", () => {
  const base = {
    candidate_next: candidate({ objective: "Préparer un voyage en Italie." }),
    provenance_records: [{ field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" }],
    transition: { from: "understanding", to: "operational_request_ready" }
  };

  const noProvenance = assessIntentPreservationDeterministic({ ...base, provenance_records: [] });
  assert.equal(noProvenance.pass, false);

  const previous = candidate({ objective: "Préparer un voyage en Italie.", confirmed_constraints: ["Budget maximum 1200€"] });
  const untrackedRemoval = assessIntentPreservationDeterministic({
    ...base,
    candidate_previous: previous,
    provenance_records: [
      { field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" }
    ]
  });
  assert.equal(untrackedRemoval.pass, false);

  const silentArbitration = assessIntentPreservationDeterministic({
    ...base,
    issues_previous: [materialConflict("ISSUE-001")],
    issues_next: []
  });
  assert.equal(silentArbitration.pass, false);

  const illegalTransition = assessIntentPreservationDeterministic({
    ...base,
    transition: { from: "degraded_state", to: "operational_request_ready" }
  });
  assert.equal(illegalTransition.pass, false);
  assert.equal(illegalTransition.structurally_valid, false);
});

test("createIntentPreservationAuditView expose des compteurs sans contenu brut", () => {
  const result = assessIntentPreservationDeterministic({
    candidate_next: candidate({ objective: "x" }),
    provenance_records: [],
    transition: { from: "understanding", to: "clarification_required" }
  });
  const view = createIntentPreservationAuditView(result);
  assert.equal(view.pass, false);
  assert.equal(view.unsupported_additions_count, 1);
  assert.equal(view.unsupported_removals_count, 0);
  assert.equal(view.silent_arbitrations_count, 0);
});

test("le module déterministe ne contient aucune heuristique de similarité lexicale", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, "..", "core", "adn", "intent-preservation.js"), "utf8");
  const forbidden = /similar|levenshtein|jaccard|recouvrement|bag.?of.?words|cosine/i;
  assert.equal(forbidden.test(source), false, "aucune heuristique lexicale ne doit juger la fidélité sémantique");
});
