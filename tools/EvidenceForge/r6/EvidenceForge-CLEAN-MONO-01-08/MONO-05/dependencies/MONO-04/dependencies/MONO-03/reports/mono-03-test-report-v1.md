# MONO-03 — Rapport de tests

16 fichiers, T03-01 à T03-40, 54 tests, tous PASS. Après correction du
protocole de commit SUCCESS (audit indépendant), un 17e fichier ajoute
10 tests adversariaux dédiés — **64 tests au total, tous PASS**.

| Fichier | Couvre | Tests | Statut |
|---|---|---|---|
| test_t03_01_03_run_lifecycle.js | T03-01, T03-02, T03-03 | 5 | PASS |
| test_t03_04_08_artifact_success_protocol.js | T03-04 à T03-08 | 6 | PASS |
| test_t03_09_11_success_reuse_deterministic_plan.js | T03-09, T03-10, T03-11 | 4 | PASS |
| test_t03_12_17_retry_policies.js | T03-12 à T03-17 | 6 | PASS |
| test_t03_18_21_eforch_nested_resume.js | T03-18 à T03-21 | 4 | PASS |
| test_t03_22_25_crash_recovery_locking.js | T03-22 à T03-25 | 8 | PASS |
| test_t03_26_31_mismatches_lineage.js | T03-26 à T03-31 | 9 | PASS |
| test_t03_32_34_serialization_backend_injection.js | T03-32, T03-33, T03-34 | 6 | PASS |
| test_t03_35_38_static_search_no_mutation.js | T03-35 à T03-38 | 4 | PASS |
| test_t03_39_40_mono01_mono02_nonregression.js | T03-39, T03-40 | 2 | PASS |
| test_t03_success_atomic_01_04.js | T03-SUCCESS-ATOMIC-01 à 04 (correction post-audit) | 10 | PASS |
| **Total** | | **64** | **PASS** |

## Ce qui rend ces tests réels, pas des façades

- T03-12 à T03-17 lisent `resumePolicy`/`retryPolicy` directement depuis le
  vrai fichier `dependencies/MONO-02/graph/mono-02-orchestration-graph-v1.json`
  et exercent le VRAI nœud MONO-02 qui porte chaque politique — jamais un
  nœud fictif inventé pour l'occasion.
- T03-18/T03-19 utilisent le VRAI `EFOrchExecutionPort` (MONO-01.x), avec de
  vrais artefacts EF-ORCH (RunContract confirmé, resolverTrace,
  searchProtocol, connectorRunner OpenAlex mocké au niveau réseau
  uniquement) — jamais un mock du port lui-même.
- T03-39/T03-40 exécutent réellement `npm test` dans les répertoires
  imbriqués `dependencies/MONO-02/` et
  `dependencies/MONO-02/dependencies/MONO-01/` via `child_process.execSync`,
  et vérifient le compte exact de tests (172 et 324) — pas une supposition
  que "ça doit marcher".

## Limites des tests

Les scénarios de crash (T03-22, T03-23) simulent la destruction du
processus par la construction d'une seconde instance `createMono03()`/
`createMono01()` sur le même backend, sans jamais partager de variable JS
entre les deux — c'est la méthode standard pour prouver l'absence de
dépendance à un état en mémoire, mais elle ne simule pas une vraie
terminaison de processus OS (hors de portée de cet environnement).
