# CHANGELOG — MONO-11 v0.3-r1 → v0.4 (TARGETED REPAIR LINEAGE PRESERVATION)

v0.3-r1 reste inchangé (dossier et zip canonique `3c44b397dda0997d0fff6ab4c8e8a8b311430e6a5ac7aeee38149f8349296b0b`). v0.3 et v0.2 restent gelés et intacts. Décisions propriétaire du 2026-09-22 : Q1 = OPTION A (corriger le lot), Q2 = v0.4, Q3 = contrat MONO-11-v3, Q6 = `[]` jamais un succès silencieux après réparation échouée.

## Cause corrigée (v0.3-r1)
`rejectedRefsOf` rendait **toutes** les références de la dimension fautive (valides comprises) ; elles entraient dans `forbiddenRefs` (passe 3 : « INTERDIT de réutiliser une citation déjà rejetée ») et dans « citation(s) rejetée(s) » ; `recompose` remplaçait le tableau entier par la réponse du modèle. Une référence originale déjà littérale ne survivait que si le modèle la réémettait (run réel `efm-20260918-a64167c0` t.10 : conservation par le modèle seul — audit indépendant MONOLITH-v1.0.11 § 4, `LINEAGE_PRESERVATION_GAP`).

## Code — `core/review-enforcer.js` (seul module modifié)
- `isLiteralRef(ref, content)` — contrôle de littéralité du validateur (l.90) reproduit à l'identique.
- `partitionRefsOf(errors, parsed, content)` → `{ rejected, preserved, raw }` ; `rejectedRefsOf(errors, parsed, content)` ne rend plus que les références **non littérales** (sans `content` : comportement legacy, tout rejeté).
- `mergeRepairLineage(parsed, repairs, content)` — pur : `FINAL(d) = stableDedup(VALID_ORIGINAL(d) ++ VALID_REPAIR(d))` ; état technique par dimension `NO_REFS_EXPECTED` / `RESOLVED` / `REFS_PRESENT_BUT_UNRESOLVED` ; `applied(d)` = `FINAL(d)` si résolue, sinon refs brutes **inchangées** (jamais un `[]` silencieux) ; trace par dimension (`preservedRefs`, `rejectedRefs`, `validRepairedRefs`, `droppedRepairedRefs`, `finalRefs`, `unresolvedInvalidRefs`, `repairOutcome`).
- `runEnforcedReview` : partition avec le document ; `forbiddenRefs` / `repeatedFaultyRef` sur les seules refs non littérales (+ les réparations non littérales écartées) ; fusion **avant** `recompose` ; `rec.preservedRefs`, `rec.repairUnresolvedDimensions`, `rec.repair.lineage` (additifs).
- `targetedRepairPrompt` : nouvelle entrée `preservedRefs` ; par dimension, « citation(s) rejetée(s) (REFS_TO_REPAIR) » **et** « citation(s) CONSERVÉE(S) (PRESERVED_VALID_REFS … ne les réécrivez pas) » ; règle `[]` : ne rendre que les remplacements ; `[]` = aucun remplacement (les conservées restent ; sans conservée, réparation NON RÉSOLUE).
- `recompose`, `parseRepair`, `validateReviewCandidate`, `enforcementPreamble`, `informedRepairPrompt`, `extractJson`, `repairContext`, `literalFragments`, `DEFAULT_MAX_PASSES`, stratégies : **inchangés** (byte-identité v0.2 vérifiée par r1-T10).

## Contrat — `contracts/mono11-contracts.json`
`contractVersion` = **MONO-11-v3** ; nouveau bloc `lineageMonotonicityDuringRepair` (définitions, P1..P6, états de réparation, `emptyResult`, interdits, « état technique ») ; `retryPolicy.version` = MONO-11-v0.4 ; libellés `targetedRepair.what/feedback`, `strategyChange` alignés. Aucune règle « au moins une citation » ajoutée au validateur.

## Benchmark — `benchmark/replay.js`
`rejectedRefsOf` avec document ; prompt ciblé avec `preservedRefs` ; correction historique rejouée via `mergeRepairLineage` + `recompose` (lignée exposée). `replay-results.json` régénéré : décomptes identiques (12 occurrences, 12 collages, 5 répétitions, 5 éligibles, 0 fausse acceptation, 0 régression, 2 corrections acceptées, 0 collision) ; les hashes des prompts ciblés changent (conservées listées).

## Tests — `test/test-mono11-v0.4.js` (83 = 69 v0.3-r1 + 14)
Adaptations v0.4 : T2 (libellé `REFS_TO_REPAIR` / `PRESERVED_VALID_REFS`), T4 (ex « [] accepté » → `REFS_PRESENT_BUT_UNRESOLVED`, fail-closed), r1-T10 (contrat v3). Ajouts TR-1..TR-14 (mandat propriétaire) : préservation, toutes valides, omission par le modèle, doublons, réparation non littérale, multi-dimension, non-régression sémantique, fixture réelle anonymisée (`test/fixtures/tr8-targeted-repair-case.json`, 4 comportements du modèle → même résultat), sondes P4/P5, rejeu R/S, `[]` légitime (CAS A), invalides non résolues (CAS B), conservées + réparation échouée, omission délibérée.

## Hors périmètre
`core/autonomous-run.js` (schemaVersion des traces `MONO-11-v2` conservée : ajouts additifs, lecteurs tolérants — même règle qu'en r1), validateur, parseur EF-03B (MONO-01), agrégation, qualification, rapport, MONOLITH (v1.0.12 = intégration après gel).
