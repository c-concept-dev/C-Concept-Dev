# MONO-04 — Rapport de tests

9 fichiers, T04-01 à T04-41, 56 tests, tous PASS. Un 10e fichier ajoute 3
tests dédiés au circuit breaker. Un 11e fichier ajoute 10 tests dédiés au
conflit d'idempotence (correction post-audit) — **69 tests au total, tous
PASS**.

| Fichier | Couvre | Tests | Statut |
|---|---|---|---|
| test_t04_01_04_provider_secret_dependency.js | T04-01 à T04-04 | 6 | PASS |
| test_t04_05_11_http_server_scenarios.js | T04-05 à T04-11 | 14 | PASS |
| test_t04_12_14_retry.js | T04-12 à T04-14 | 4 | PASS |
| test_t04_15_18_idempotence_redaction_payload.js | T04-15 à T04-18 | 8 | PASS |
| test_t04_19_23_ef02abc_adapter.js | T04-19 à T04-23 | 5 | PASS |
| test_t04_24_28_classification_no_bypass.js | T04-24 à T04-28 | 6 | PASS |
| test_t04_29_31_static_search.js | T04-29 à T04-31 | 3 | PASS |
| test_t04_32_38_persistence_diagnostics_secrets.js | T04-32 à T04-38 | 7 | PASS |
| test_t04_39_41_nonregression.js | T04-39 à T04-41 | 3 | PASS |
| test_t04_cb_circuit_breaker.js | Circuit breaker dédié (comble une limite notée) | 3 | PASS |
| test_t04_idempotence_conflict_01_07.js | T04-IDEMPOTENCE-CONFLICT-01 à 07 (correction post-audit) | 10 | PASS |
| **Total** | | **69** | **PASS** |

## Ce qui rend ces tests réels, pas des façades (CDC section 20/25)

- Tous les scénarios réseau utilisent un **vrai serveur HTTP local**
  (`test/fixtures.js::startTestServer`, basé sur `http.createServer`),
  jamais un mock de fonction `fetch`. Le test réseau réel (T04-06) utilise
  un vrai port TCP fermé (`net.createServer` puis fermeture immédiate),
  pas une simulation d'erreur.
- T04-19 à T04-23 utilisent le **vrai** `ProfessionalPipelinePort`
  (MONO-01.x imbriqué), jamais un mock du port — c'est précisément ce qui
  a révélé le bug réel n°3 (T04-20).
- T04-26 utilise le **vrai** module gelé `EF02D1D2Orchestrator` (juste
  vérifié présent, sans réimplémentation) et un vrai `workerCallFn`
  technique routé via un vrai serveur local.
- T04-39/40/41 exécutent réellement `npm test` dans les répertoires
  imbriqués via `child_process.execSync`, et vérifient le compte exact de
  tests (172, 324, 64) — jamais une supposition.

## Limites des tests

Le circuit breaker (section 16) est désormais testé de façon dédiée
(`test_t04_cb_circuit_breaker.js`) — seuil déclenché, ouverture bloquant
tout appel réseau, fermeture après cool-down, tous vérifiés réellement
contre le serveur local.
