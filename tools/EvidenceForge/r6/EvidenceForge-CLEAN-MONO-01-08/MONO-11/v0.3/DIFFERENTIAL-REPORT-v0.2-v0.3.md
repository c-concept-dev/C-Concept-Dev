# Rapport différentiel MONO-11 v0.2 → v0.3

v0.2 : GELÉ / IMMUABLE (zip canonique `5c208cbbd13231e732fe20475347f9f7cbe6f890f3ce4823581093c7eba60005`, sceau `57e243b785f8de8c…`). v0.3 = copie de travail successeur ; aucune modification en place de v0.2.

## Fichiers (diff -rq, hors MANIFEST/SHA256SUMS regénérés)

```
Only in ../v0.2: MANIFEST.json
Only in ../v0.2: SHA256SUMS.txt
Only in .: benchmark
Files ../v0.2/contracts/mono11-contracts.json and ./contracts/mono11-contracts.json differ
Files ../v0.2/core/review-enforcer.js and ./core/review-enforcer.js differ
Files ../v0.2/index.js and ./index.js differ
Only in ../v0.2/test: test-mono11-v0.2.js
Only in ./test: test-mono11-v0.3.js
Files ../v0.2/tools/build-manifest.js and ./tools/build-manifest.js differ
```

## Nature des changements

| Fichier | Fonction(s) | Nature |
|---|---|---|
| `core/review-enforcer.js` | + `literalFragments`, `targetedRepairPrompt`, `parseRepair`, `recompose`, `onlyTargetRefErrors`, `faultyDimensions`, `rejectedRefsOf`, constantes `STRATEGY`/`TARGET_REF_CODE`/`FRAGMENT_MIN_LEN` ; `runEnforcedReview` : sélection de stratégie par passe, réparation ciblée, détection `EXACT_RETRY_REPEAT`, garde anti-passe-identique (fail-closed), lignée enrichie ; `buildEnforcedReviewSet` : `producedBy` v0.3 | comportement de REPRISE uniquement |
| `core/review-enforcer.js` | `validateReviewCandidate`, `enforcementPreamble`, `informedRepairPrompt`, `extractJson` | **byte-identiques à v0.2** (vérifié par T9/T12 : `toString()` égal) |
| `test/test-mono11-v0.3.js` | 44 tests v0.2 conservés à l'identique + T1–T12 + R1–R3 | tests |
| `benchmark/replay.js`, `benchmark/fixtures/*.json` | rejeu déterministe hors ligne sur 11 fixtures réelles anonymisées (identités de jumeaux remplacées, run IDs hachés ; correspondance conservée hors lot) | fixtures/outillage (hors `SCAN_DIRS` du scanner, vérifiées sans fuite de jeton de cas) |
| `contracts/mono11-contracts.json` | + section `retryPolicy` (v0.3) ; `contractVersion` inchangé (`MONO-11-v2`) — aucun schéma de sortie modifié | documentation contractuelle |
| `tools/build-manifest.js`, `index.js` | version, nom, prédécesseur, fichier de tests | versionnage |
| `README.md`, `CHANGELOG-v0.2-to-v0.3.md`, `TEST-REPORT.md`, `RETRY-BENCHMARK.md`, `DIFFERENTIAL-REPORT-v0.2-v0.3.md` | documentation | documentation |

Inchangés (byte-identiques) : `core/autonomous-run.js`, `autonomous-panel-adapter.js`, `composed-qualification.js`, `corpus-sufficiency-probe.js`, `coverage-enforcer.js`, `frozen-bridge.js`, `llm-response-reuse.js`, `machine-evidence-gate.js`, `mono11-ledger.js`, `run-seal-guard.js`, `semantic-relevance-oracle.js`, `target-normalizer.js`, `governance/*`, `test/harness.js`, `test/fixtures/domains.js`, `tools/seal.js`, `tools/anti-hardcoding-scan.js`, docs v0.2 (`ANTI-CIRCULARITY.md`, `ANTI-HARDCODING.md`, `THREAT-MODEL.md`, `LINEAGE.md`, `NON-REGRESSION.md`, `MIGRATION-v0.1-v0.2.md`).

Patch complet : `~/evidenceforge-work/reports/DIFF-MONO11-v0.2-to-v0.3.patch`.

## Matrice différentielle sur les fixtures réelles (validateur)

| Fixture | Passes | Verdicts v0.2 (historique) | Verdicts v0.3 (rejeu) | Identiques |
|---|---|---|---|---|
| R1 (multi) | 3 | REFUS → REFUS → REFUS | REFUS → REFUS → REFUS | oui |
| R2 (multi) | 2 | REFUS → OK | REFUS → OK | oui |
| R3 (multi) | 3 | REFUS → REFUS → REFUS | REFUS → REFUS → REFUS | oui |
| R4 (multi) | 3 | REFUS → REFUS → REFUS | REFUS → REFUS → REFUS | oui |
| R5 (multi) | 2 | REFUS → OK | REFUS → OK | oui |
| R6 (multi) | 2 | REFUS → OK | REFUS → OK | oui |
| S1 (success) | 1 | OK | OK | oui |
| S2 (success) | 1 | OK | OK | oui |
| S3 (success) | 1 | OK | OK | oui |
| S4 (success) | 1 | OK | OK | oui |
| S5 (success) | 1 | OK | OK | oui |

Fausses acceptations : **0** ; régressions : **0**. Toute revue valide en v0.2 reste valide en v0.3 ; aucune revue invalide ne devient valide par assouplissement (le validateur est byte-identique).
