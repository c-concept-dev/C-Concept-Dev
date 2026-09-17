# MONO-01 — Traçabilité CDC -> implémentation

| Section CDC | Exigence | Implémentation | Statut |
|---|---|---|---|
| 2 | BaselinePort consomme obligatoirement MONO-00-v1 | `lib/baseline-port.js` — refuse tout autre schema/schemaVersion | ✅ T01-01 |
| 3.1–3.3 | Modules gelés = boîtes noires contractuelles, adaptateur ≠ logique métier, fail closed | `lib/port-factory.js::invokePort` — jamais de recalcul métier, toute frontière inconnue → `INTEGRATION_CONTRACT_ERROR`/BLOCKED | ✅ |
| 4.1 | BaselinePort | `lib/baseline-port.js`, `ports/baseline-port.js` | ✅ |
| — | EFOrchExecutionPort (révision MONO-01.x) | `ports/ef-orch-execution-port.js` | ✅ BOUND (composition du sous-système gelé) — T01-20 (26/26) |
| 4.2 | MissionPort | `ports/mission-port.js` | ✅ |
| 4.3 | CorpusSnapshotPort | `ports/corpus-snapshot-port.js` | ✅ T01-06 |
| 4.4 | ProfessionalPipelinePort | `ports/professional-pipeline-port.js` | ✅ BOUND (ExternalStageAdapter) — T01-09 |
| 4.5 | EligibilityPanelPort | `ports/eligibility-panel-port.js` | ✅ |
| 4.6 | GovernancePort | `ports/governance-port.js` | ✅ T01-14 |
| 4.7 | DocumentaryTwinPort | `ports/documentary-twin-port.js` | ✅ T01-13, T01-14 |
| 4.8 | TargetDocumentPort | `ports/target-document-port.js` | ✅ |
| 4.9 | ReviewSchemaPort | `ports/review-schema-port.js` | ✅ T01-08 |
| 4.10 | DocumentaryReviewPort | `ports/documentary-review-port.js` | ✅ T01-04, T01-09 |
| 4.11 | AggregationPort | `ports/aggregation-port.js` | ✅ |
| 4.12 | StabilityPort | `ports/stability-port.js` | ✅ T01-11 (SYNC confirmé) |
| 4.13 | LineagePort | `ports/lineage-port.js` | ✅ T01-15 |
| 4.14 | ReportPort | `ports/report-port.js` | ✅ T01-15 |
| 4.15 | ExternalExecutionPort | `ports/external-execution-port.js` | ✅ T01-10 |
| 5 | Enveloppe IntegrationInvocation/Result | `contracts/*.json`, `lib/port-factory.js` | ✅ |
| 6 | Statuts techniques uniquement | `buildResultEnvelope` — READY/RUNNING/SUCCESS/FAILED/BLOCKED/NOT_APPLICABLE | ✅ |
| 7 | Taxonomie d'erreurs | `lib/errors.js` — 9 codes exacts, aucun ajouté | ✅ |
| 8 | Validation des entrées | `invokePort` — 6 contrôles séquentiels | ✅ |
| 9 | Validation des sorties | `finalizeOutput` | ✅ T01-07 |
| 10 | Sync/async explicite | `callType` par méthode + contrôle à l'exécution | ✅ T01-11 |
| 11 | Répertoire attendu | Respecté (voir README.md) | ✅ |
| 12 | Tests T01-01 à T01-22 (+ T01-09b, T01-19, T01-20, T01-21, T01-22) | `test/test_t01_*.js` — 172/172 PASS | ✅ |
| 13 | Non-régression MONO-00 + lots gelés | 27/27 + 1223/1223 rejoués | ✅ |
| 14 | Recherche statique | `reports/mono-01-static-search-report-v1.md` | ✅ |
| 15 | Interdictions (pas de RunStore/UI/pipeline E2E, pas de modification des lots gelés) | Aucun fichier gelé modifié (hashes identiques), aucune UI, aucune persistance | ✅ |
| 16–17 | Critères GELABLE / NON GELABLE | Voir rapport final | Voir verdict |
| 18 | Format du rapport final | Fourni séparément dans la réponse à l'opérateur | ✅ |
| 19 | Définition de done | Voir `reports/mono-01-port-coverage-report-v1.md` § réponses machine-readable | ✅ (tous les ports, y compris ProfessionalPipelinePort) |
| 20 | MONO-01 prépare MONO-02, n'exécute rien | Aucun code d'orchestration, aucun state machine d'assemblage | ✅ |
