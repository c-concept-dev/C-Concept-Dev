# Non-régression (Phase 6)

## Suites LOCAL_CONTROLLED

```text
test_t08_v06_real_adapter_model.js  (nouveau)  : 9/9 PASS
test_t08_v06_delegated_auth.js                  : 24/24 PASS (inchangé)
test_t08_preflight.js (v0.5, non modifié)       : 10/10 PASS
worker/evidenceforge-llm-proxy/test/worker.test.js : 38/38 PASS (inchangé, Worker non touché)
```

## Gate historique (comparaison stricte contre baseline immuable, mécanisme r2/r3, aucun `|| true`)

```text
test_t08_preflight.js               : expected_exit=0 actual_exit=0 diff=0  -> GATE PASS
test_t08_eforch.js                  : expected_exit=2 actual_exit=2 diff=0  -> GATE PASS
test_t08_matrix.js                  : expected_exit=0 actual_exit=0 diff=0  -> GATE PASS
test_t08_runner_orchestration.js    : expected_exit=1 actual_exit=1 diff=0  -> GATE PASS
```

4/4 GATE PASS, 0 diff sur les 4 fichiers historiques v0.5 (jamais modifiés).

Voir `package-and-verify-r4-full-run.txt` pour la trace complète du pipeline
(GATE-NEGATIVE-TEST inclus), produite par `scripts/package-and-verify.sh` (mise à
jour uniquement pour intégrer `test_t08_v06_real_adapter_model.js` au gate, étapes
2/9 et 4/9 — aucun autre changement du script).
