# 08 — Test Results

Toutes les suites ci-dessous ont été RÉELLEMENT exécutées pendant cette
mission (jamais reprises d'un rapport antérieur sans réexécution). Sortie
console complète : `TEST-REPORTS/`.

## MONO-00 → MONO-07 (canonique, voir `01-CANONICAL-SOURCE-SELECTION.md`)

| Lot | Tests | Résultat | Rapport |
|---|---|---|---|
| MONO-00 | 27/27 | PASS, aucune régression | `TEST-REPORTS/MONO-00-07/MONO-00.out` |
| MONO-01 | 172/172 | PASS, aucune régression | `TEST-REPORTS/MONO-00-07/MONO-01.out` |
| MONO-02 | 334/334 | PASS, aucune régression | `TEST-REPORTS/MONO-00-07/MONO-02.out` |
| MONO-03 | 64/64 | PASS, aucune régression | `TEST-REPORTS/MONO-00-07/MONO-03.out` |
| MONO-04 | 69/69 | PASS, aucune régression | `TEST-REPORTS/MONO-00-07/MONO-04.out` |
| MONO-05 | 119/119 | PASS, aucune régression | `TEST-REPORTS/MONO-00-07/MONO-05.out` |
| MONO-06 (auto-tests du harnais) | 22/22 | PASS, aucune régression | `TEST-REPORTS/MONO-00-07/MONO-06.out` |
| MONO-07 | 127/127 | PASS, aucune régression | `TEST-REPORTS/MONO-00-07/MONO-07.out` |
| **Total MONO** | **785/785** | — | — |

**Preuve indépendante par rejeu réel du gate MONO-06**
(`runMono06Gate()`, fonction réelle, jamais réimplémentée) :
`overallStatus: PASS`, `monoObserved: 785/785`,
`historiqueObserved: 1223/1223` —
`TEST-REPORTS/MONO-00-07/mono-06-gate-replay-report.json`.

## MONO-08

| Suite | Tests | Résultat | Rapport |
|---|---|---|---|
| `test_t08_matrix.js` (A→K + tests locaux) | 5 PASS + 19 `NOT_RUN_ENVIRONMENT_BLOCKED` (préflight bloqué dans cet environnement, jamais fabriqué) | conforme à l'historique | `TEST-REPORTS/MONO-08/test_t08_matrix.out` |
| `test_t08_preflight.js` | 10/10 | PASS | `TEST-REPORTS/MONO-08/test_t08_preflight.out` |
| `test_t08_eforch.js` (T08-EFORCH-01→14, T08-RUNNER-READY-01→05, adversarial) | 26/26 | PASS | `TEST-REPORTS/MONO-08/test_t08_eforch.out` |
| `test_t08_runner_orchestration.js` | 9/9 (**corrigé** — 7/9 avant F-14, voir `02-FINDINGS-DISPOSITION.md`) | PASS | `TEST-REPORTS/MONO-08/test_t08_runner_orchestration.out` |
| `test_t08_v06_delegated_auth.js` | 24/24 | PASS | `TEST-REPORTS/MONO-08/test_t08_v06_delegated_auth.out` |
| `test_t08_v06_real_adapter_model.js` | 9/9 | PASS | `TEST-REPORTS/MONO-08/test_t08_v06_real_adapter_model.out` |
| `worker/evidenceforge-llm-proxy/test/worker.test.js` | 38/38 | PASS | `TEST-REPORTS/MONO-08/worker_test.out` |
| `test_t08_epistemic_integrity.js` **(nouveau)** | 11/11 | PASS | `TEST-REPORTS/MONO-08/test_t08_epistemic_integrity.out` |
| `test_t08_observability.js` **(nouveau)** | 10/10 | PASS | `TEST-REPORTS/MONO-08/test_t08_observability.out` |
| `test_t08_release_governance.js` **(nouveau)** | 4/4 | PASS | `TEST-REPORTS/MONO-08/test_t08_release_governance.out` |
| `test_t08_cross_process.js` **(nouveau)** | 12/12, `CROSS_PROCESS = PASS` | PASS | `TEST-REPORTS/MONO-08/test_t08_cross_process.out` |
| **Total assertions MONO-08 PASS** | **158** (+ 19 honnêtement `NOT_RUN_ENVIRONMENT_BLOCKED`, jamais comptées comme PASS) | — | — |

## Mapping vers les tests obligatoires du mandat (section 16)

| Test mandaté | Statut | Où |
|---|---|---|
| T-NEW-01 (CROSS_PROCESS, deux vrais processus) | **NOUVEAU, PASS** | `test_t08_cross_process.js` |
| T-NEW-02 (runtime B ne partage aucun objet avec A) | **NOUVEAU, PASS** | `test_t08_cross_process.js` |
| T-NEW-03 (réhydratation complète des dépendances reconstructibles) | **NOUVEAU, PASS** | `test_t08_cross_process.js` |
| T-NEW-04 (lastError du premier nœud BLOCKED/FAILED visible) | **NOUVEAU, PASS** | `test_t08_observability.js` |
| T-NEW-05 (pas d'acteur=human auto-généré en REAL) | **NOUVEAU, PASS** | `test_t08_epistemic_integrity.js` |
| T-NEW-06 (pas de hash LLM synthétique en REAL) | **NOUVEAU, PASS** | `test_t08_epistemic_integrity.js` |
| T-NEW-07 (REAL sans provenance LLM réelle → FAIL CLOSED) | **NOUVEAU, PASS** | `test_t08_epistemic_integrity.js` |
| T-NEW-08 (REAL avec action humaine requise mais absente → OPERATOR_INPUT_REQUIRED) | **NOUVEAU, PASS** | `test_t08_epistemic_integrity.js` |
| T-NEW-09 (LOCAL_CONTROLLED accepte des fixtures explicitement SYNTHETIC) | **NOUVEAU, PASS** | `test_t08_epistemic_integrity.js` |
| T-NEW-10 (changement de fixture correctement déclaré) | **NOUVEAU, PASS** | `test_t08_release_governance.js` |
| T-NEW-11 (aucune régression des frontières MONO-01→07) | **DÉJÀ COUVERT** par `test_t08_eforch.js::T08-RUNNER-READY-05` (intégrité ZIP figée avant/après un run complet, bit-à-bit identique) + par le rejeu complet MONO-00→07 ci-dessus | non dupliqué |
| T-NEW-12 (aucun secret brut dans rapports/état/logs) | **DÉJÀ COUVERT** par `test_t08_eforch.js::T08-RUNNER-READY-04a/04b` (secret réellement injecté via `createStaticSecretProvider`, 0 fuite prouvée dans RunState/ArtifactRecord/réponses OperatorApi/rapport/trace/DOM/localStorage/sessionStorage) + revues structurelles H2 (`test_t08_v06_delegated_auth.js`) | non dupliqué |

T-NEW-11/12 ne sont pas dupliqués par de nouveaux fichiers de test : les
tests existants les couvrent déjà en substance et ont été **réexécutés
et reconfirmés PASS** dans cette mission (voir tableau ci-dessus) — les
dupliquer aurait été une réécriture sans changement fonctionnel,
contraire à la RÈGLE CARDINALE.

## Total global

**785 (MONO-00→07) + 158 (MONO-08, hors NOT_RUN_ENVIRONMENT_BLOCKED
honnêtement déclaré) = 943 assertions PASS**, 0 échec, 0 régression.
