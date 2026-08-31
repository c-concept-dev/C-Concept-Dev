# MONO-08 v0.6 — Correctif d'audit ultra-ciblé (r2)

Date : 2026-08-31. Correctif appliqué sur commit audité `212c8c3`, package audité
`EvidenceForge-MONO-08-v0.6-implementation-package-r1.zip`
(`b6a8355951d301e27f7ed39e9a06f4db3db4545ac0cb136cdcca3ca2cae45119`).

Statut de ce correctif : **`CORRECTIVE IMPLEMENTATION READY FOR INDEPENDENT
RE-AUDIT`**.

## Ordre de lecture

1. `RATE-LIMITER-FAIL-CLOSED-FIX.md` — Défaut Bloquant 1 : rate limiter fail-open
   confirmé (code avant/après, conséquence, correction, distinction 429 vs 503,
   tests L/M/N/M2/K-vs-L ajoutés).
2. `NON-REGRESSION-GATE-FIX.md` — Défaut Bloquant 2 : gate de non-régression
   insuffisant confirmé (`|| true` masquant), correction (comparaison stricte
   exit-code + sortie octet pour octet contre baseline immuable), self-test du gate
   (GATE-NEGATIVE-TEST), et documentation transparente d'un bug d'implémentation
   (`errexit` global vs scope de fonction) découvert et corrigé pendant la mise au
   point du script lui-même.
3. `BASELINE-EXIT-CODE-DERIVATION.md` — méthode de dérivation légitime (non fabriquée)
   des 4 nouveaux fichiers `*.baseline.exit`.
4. `wrangler-dry-run-r2.txt` — preuve que le Worker reste déployable (dry-run) après
   le correctif fail-closed.
5. `worker-test-r2.out` — 38/38 PASS (Worker).
6. `v06-delegated-auth-test-r2.out` — 16/16 PASS (v0.6 delegated auth, préflight).
7. `package-and-verify-r2-full-run.txt` — trace complète de l'exécution du pipeline
   de packaging (les 9 étapes, du gate de non-régression jusqu'à la re-vérification
   des hashes depuis le ZIP final).
8. `INTEGRITY-CHECK-R2.md` — confirmation que MONO-00→07, MONO-08 v0.5, MONO-04 et
   EF-ORCH n'ont subi aucune modification pendant ce correctif.

## Ce qui a été corrigé

- `worker/evidenceforge-llm-proxy/src/worker.js` : `checkRateLimit()` réécrite
  fail-closed (binding absent/invalide/en erreur → `503`, jamais un passage
  silencieux vers l'upstream).
- `worker/evidenceforge-llm-proxy/test/worker.test.js` : suppression du test
  « Worker-24 » (testait le comportement fail-open comme correct) ; ajout des cas
  L, M, M2, N, K-vs-L (10 nouvelles assertions, 38 au total contre 28 avant).
- `worker/evidenceforge-llm-proxy/README.md` : documentation du comportement
  fail-closed (table de correspondance situation → HTTP → `reason`).
- `EvidenceForge/MONO-08/v0.6/scripts/package-and-verify.sh` : suppression des 3
  `|| true` sur les tests historiques, remplacés par une comparaison stricte
  exit-code + sortie octet pour octet contre baseline immuable
  (`run_test_and_compare()`), ajout d'un self-test du gate (GATE-NEGATIVE-TEST),
  ajout d'un scan de secrets explicite comme étape à part entière.
- `EvidenceForge/MONO-08/v0.6/reports/v0.6-local-controlled/regression-non-regression/*.baseline.exit`
  (4 nouveaux fichiers) : exit codes de référence dérivés légitimement (voir
  `BASELINE-EXIT-CODE-DERIVATION.md`).

## Ce qui n'a PAS été fait (volontairement)

- Aucun déploiement Cloudflare réel.
- Aucun secret réel créé ou injecté.
- Aucun changement de compte Cloudflare.
- Aucun cas G (REAL), aucun Real Smoke.
- Aucune modification de MONO-00→07, MONO-08 v0.5, MONO-04, EF-ORCH.
- MONO-09/JMMJS non entamé.
- Aucun changement du CDC ni de l'Acceptance Matrix.
- Aucun élargissement de périmètre au-delà des deux défauts mandatés.

## Verdict

```text
CORRECTIVE IMPLEMENTATION READY FOR INDEPENDENT RE-AUDIT
```
