# CHANGELOG MONO-11 v0.2 → v0.3 — retry ciblé `TARGET_REF_NOT_LITERAL`

Chantier officiel (2026-09-16). Périmètre : `core/review-enforcer.js` (reprise des revues) + tests + fixtures de benchmark + documentation/versionnage. **v0.2 reste GELÉ et intouché.**

## Ajouté
- **Réparation ciblée** (`TARGETED_REPAIR`) : quand toutes les erreurs d'une passe sont `TARGET_REF_NOT_LITERAL` et que la réponse est de forme parsable, la passe suivante ne redemande que `targetEvidenceRefs` des dimensions fautives (schéma fermé `{"repairs":[{dimensionId, targetEvidenceRefs}]}`, `parseRepair`), recompose localement sur la réponse précédente (`recompose`) et revalide **intégralement** avec le validateur inchangé, puis EF-03B gelé. Les champs déjà valides sont préservés (I5).
- **Feedback déterministe** (`literalFragments`) : une citation rejetée est décomposée en fragments contigus maximaux réellement présents dans le document (≥ 12 caractères) ; le prompt signale qu'ils **ne sont pas contigus** et que leur jonction n'est pas une citation. Aucune substitution, aucun choix sémantique local (I4). Repli `[]` rappelé. La réponse fautive n'est plus réinjectée intégralement.
- **Changement de stratégie** (`TARGETED_REPAIR_STRATEGY_CHANGE`) à la passe suivant un échec ciblé : rejet signalé, répétition signalée (`repeatedFaultyRef` / `exactRepeat`), citations déjà rejetées interdites, nouvelle extraction exigée, repli `[]`.
- **Détection `EXACT_RETRY_REPEAT`** : réponse byte-identique à la précédente avec les mêmes codes d'erreur → journalisée ; **aucune passe supplémentaire avec la stratégie qui vient de se répéter** (fail-closed, I7), y compris sur le chemin v0.2 (`INFORMED_REPAIR_V02`) des autres codes.
- **Lignée par passe** (I8) : `strategy`, `previousErrorCodes`, `previousResponseSha256`, `rawResponseSha256`, `responseSha256` (texte validé/recomposé), `exactRepeat`, `repeatedFaultyRef`, `targetedDimensions`, `proposedFragments`, `repair`, `valid`, `errors`, `errorCodes` ; `review.enforcement.strategies`, `failClosedReason`.
- `contracts/mono11-contracts.json → retryPolicy` (documentation ; `contractVersion` inchangé).
- `benchmark/replay.js` + 11 fixtures réelles anonymisées ; tests T1–T12 et R1–R3.

## Inchangé (invariants)
- `validateReviewCandidate` (dont la ligne `TARGET_REF_NOT_LITERAL` : `content.indexOf(ref) === -1`), `enforcementPreamble`, `informedRepairPrompt`, `extractJson` : byte-identiques (T9, T12).
- Passe 1 : prompt EF-03B gelé + préambule, inchangée (T1).
- `DEFAULT_MAX_PASSES = 3` ; le lot n'augmente jamais le nombre de passes (I6).
- Autres codes d'erreur : reprise informée v0.2 (T12) ; seul ajout : la garde anti-répétition (I7).
- Schémas de sortie (`DocumentaryReviewSet` EF-03B-v1, revues) : inchangés ; ajouts additifs dans `enforcement` et les traces (I9).
- Fail-closed : une revue sans correction valide reste `error` (T8) ; `reviews_complete = 100 %`, readiness, qualification, agrégation, couverture, admission, cap : hors périmètre, non touchés.

## Mesures (benchmark hors ligne, fixtures réelles)
- 12 occurrences `TARGET_REF_NOT_LITERAL` rejouées : 12 collages de fragments non contigus détectés, 0 invention ; 5 répétitions exactes détectées ; 5 séquences éligibles à la réparation ciblée ; 2 corrections historiques acceptées par recomposition ; **0 fausse acceptation, 0 régression** (verdicts v0.2 = v0.3 sur 100 % des passes).

## Non fait (hors périmètre, volontairement)
- Aucune modification de `lib/llm.js` ni du monolithe ; aucune intégration ; aucun changement des paramètres de génération.
