# CHANGELOG — MONO-11 v0.3 → v0.3-r1 (micro-correctif pré-gel)

v0.3 reste inchangé (zip `bec558412832293221261ab2f481afc2e3a2c8d7e0bae43769837400af81758d`). v0.2 reste gelé et intact.

## Code
- `core/review-enforcer.js` — ajout `canonicalJson`, `repairContext`, `repairContextLines`, constantes `REPAIR_CONTEXT_SCHEMA` / `REPAIR_CONTEXT_VERSION` ; `targetedRepairPrompt` exige `input.context` (`REPAIR_CONTEXT_REQUIRED`) et insère une ligne `CONTEXTE DE REPARATION` après l'en-tête ; `runEnforcedReview` calcule le contexte à chaque passe ciblée, l'expose dans `meta.repairContextFingerprint` et le journalise (`rec.repairContext`) ; `producedBy` mentionne v0.3-r1 ; exports étendus. **Inchangés** : `validateReviewCandidate`, `enforcementPreamble`, `informedRepairPrompt`, `extractJson` (byte-identiques à v0.2, vérifiés par empreinte), `literalFragments`, `parseRepair`, `recompose`, stratégies, `DEFAULT_MAX_PASSES = 3`, détection de répétition, fail-closed.
- `benchmark/replay.js` — construit le prompt ciblé avec contexte ; mesure `targetedPromptsBuilt`, `targetedPromptCollisions`, `distinctRepairContexts`, `carriesFingerprint`.
- `tools/build-manifest.js` — version `v0.3-r1`, prédécesseur v0.3, provenance des jetons de cas (`caseArtifacts` : nom + sha256), `contractVersion` et politique consignés.
- `index.js` — commentaire d'en-tête.
- `contracts/mono11-contracts.json` — `retryPolicy.version` = `MONO-11-v0.3-r1` ; **`contractVersion` = `MONO-11-v2` inchangé** (voir ci-dessous).

## Tests
- `test/test-mono11-v0.3.js` → `test/test-mono11-v0.3-r1.js` : 59 tests v0.3 conservés (T9/T12/R3 rendus autonomes) + 10 tests r1-T1…r1-T10 = **69**.
- `test/fixtures/v0.2-reference.json` (nouveau) : empreintes SHA-256 des sources de fonctions v0.2 gelées, sha256 du fichier, du zip et du sceau v0.2.

## Documentation
- Nouveaux : `CROSS-TWIN-REUSE-AUDIT.md`, `TEST-REPORT-v0.3-r1.md`, `P2-CLOSURE.md`, ce changelog. README : en-tête v0.3-r1 + matrice R1–R5 + mode d'exécution documenté. Errata dans `RETRY-BENCHMARK.md` et `TEST-REPORT.md` (P2-04, P2-01).

## contractVersion / schemaVersion — décision documentée (mandat §6, audit P2-03)
- `contractVersion` reste `MONO-11-v2`. Preuve (audit indépendant v0.3 §D, revérifiée) : **aucun consommateur** dans le kit ne lit `contractVersion`, `retryPolicy`, `informedRetry` ; `review-enforcer.js` n'importe pas le fichier de contrats ; les sept clés consommées sont sémantiquement identiques à v0.2 ; le monolithe distingue les runs par `mono11Version` / `runtimeSealSha256` / `mono11ZipSha256` (ancre du ledger) et épingle `validationContract = MONO-11-v2` dans son filtre de reuse. Un bump forcerait, sans nécessité contractuelle, une divergence de ce filtre (refus de toutes les réutilisations antérieures VALID, donc des appels réels) — effet non demandé et coûteux. Aucun consommateur n'exige de bump ⇒ **pas de bump**.
- `schemaVersion` des traces d'enforcement (`EvidenceForge.ReviewEnforcementTrace`, `MONO-11-v2`, `autonomous-run.js` inchangé) : ajouts de champs purement additifs (`repairContext`), lecteurs tolérants ; pas de bump.
- Le contexte de réparation porte sa **propre** version (`REPAIR_CONTEXT_VERSION = MONO-11-v0.3-r1`) dans l'objet et donc dans l'empreinte : toute évolution future de sa composition change mécaniquement les clés de reuse (pas de reuse trans-version silencieux).
- Règle de gouvernance proposée au propriétaire (non tranchée ici) : seules les clés **consommées** par un lot ou par le monolithe font version de contrat.

## Hors périmètre (non traité, backlog)
P2-05 (coût quadratique de `literalFragments`), P2-06 (libellé « NE SONT PAS CONTIGUS »), P2-08 (`parseRepair` : clés surnuméraires internes, doublons), P2-09 (portée de l'anonymisation des fixtures, `benchmark/` hors `SCAN_DIRS`) — moteur inchangé conformément au mandat §5.
