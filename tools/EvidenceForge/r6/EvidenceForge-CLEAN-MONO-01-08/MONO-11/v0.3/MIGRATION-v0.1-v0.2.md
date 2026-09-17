# MONO-11 — Migration v0.1 → v0.2

**v0.1** : intact (`EvidenceForge-MONO11-AUTONOMOUS-PANEL-v0.1.zip`, SHA-256 `ba9dd877aea77248edf63a5c1c9fad5475f2e56c9df398426d229089a253ea26`), verdict d'audit indépendant `GELABLE`, 0 blocker.
**v0.2** : successeur **additif minimal** créé en réponse à l'audit `AUDIT-INDEPENDENT-MONO11-v0.1-AND-P0.1.md`. Aucun lot gelé (MONO-10 v0.19, MONO-09 v0.2, MONO-01 — dont EF-02D3 et EF-03B) n'est modifié. La règle scientifique `reviews_complete = 100 %` est **inchangée** (et désormais épinglée par mutation).

| Cause révélée par l'audit | Correctif v0.2 | Module | Tests |
|---|---|---|---|
| 2 revues rejetées pour apostrophe U+2019 vs U+0027 (FORMAT_NORMALIZATION_ONLY) | normalisation canonique du document cible **à l'ingestion**, avant EF-03 gelé ; original + normalisé conservés et hachés, journal de transformation, idempotence vérifiée | `core/target-normalizer.js` | T31–T33 |
| 1 revue rejetée pour dimension dupliquée (SCHEMA_DRIFT), réparation gelée aveugle | validation locale à schéma fermé **avant** EF-03B (cardinalité, doublons, clés, énumérations, citations, références jumeau) + **reprise informée** (erreurs structurées, artefact fautif, document, schéma, contraintes) ; EF-03B reste le validateur final | `core/review-enforcer.js` | T30, T34, T35 |
| F13 : 5 admis sans jumeau (topics cités comme œuvres, refusés par EF-02D3) | résolution des `evidenceWorks` dans le corpus **avant** EF-02D3 (un thème n'est pas une œuvre), reprise informée avec références admissibles | `core/coverage-enforcer.js` | T36 |
| F1 : run final exécuté sur code pré-sceau | `assertSealedRuntime` **avant** toute action du run : sceau vérifié, code non scellé refusé, `runtimeSealSha256` / `runCodeHash` / `mono11ManifestSha256` / `mono11ZipSha256` enregistrés dans l'état du run et l'ancre du ledger | `core/run-seal-guard.js`, `core/mono11-ledger.js` | T37, T41 |
| F2 : `llm-no-replay.json` par prompt bloquait des réponses réelles valides | politique de réutilisation **par réponse** avec `validationStatus` (REAL_CALL / REUSE_VALID / RETRY_REAL / NO_SILENT_REUSE), provenance complète de chaque reuse, jamais compté comme appel réel | `core/llm-response-reuse.js` (+ magasin fichier de l'exploitant) | T38 |
| F7/M9 : tolérance `reviews_complete ≥ 90 %` non détectée | règle `accepted == expected` (expected = jumeaux actifs × cibles résolues, jamais 81 en dur) ; tests N=100 (99/90/80 → FAIL, 100 → PASS ; 30/30 → PASS) ; mutants 99 %/90 %/80 % prouvés détectables | `core/composed-qualification.js` | T39, T40 |
| F6 : preuves par candidat non persistées | `ledger.exportArtifacts()` ; le run persiste tout sous `P0.1-EVIDENCE/` | `core/mono11-ledger.js` | T41 |
| F3, F10 | `worksSubmittedToOracle` honnête ; éligibilité jamais fabriquée sur override | oracle, `autonomous-run.js` | — |

Non traités volontairement (mandat §8, dettes déclarées) : seuils `test_unvalidated`, ≤ 10 œuvres soumises, G-11 syntaxique, attestation 8 h, épinglage du fichier de sceau par le bridge.

## Ordre d'exécution imposé (mandat §1)
`build v0.2 → tests → package → SHA256 → MANIFEST final → seal → verify seal → START real run` — le run reel refuse un lot non scellé (`RUN_ON_UNSEALED_CODE`).
