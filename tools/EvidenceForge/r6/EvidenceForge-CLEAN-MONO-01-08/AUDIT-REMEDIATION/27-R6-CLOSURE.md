# 27 — R6 Closure (F-01, F-02)

Round 6 (R6) est une micro-intégration finale : il ferme les deux
écarts relevés par l'audit indépendant après R5
(`EvidenceForge-AUDIT-INDEPENDANT-R5.md`) — le workflow en deux phases
PREPARE/RESUME (R5) était valide mais jamais accessible par un chemin
nominal opérateur réel (R6-F01), et la readiness rapportée pour la
mission canonique restait surqualifiée (R6-F02). Toutes les primitives
R5 (`PRE_RETRIEVAL_GATE`, `POST_RETRIEVAL_GATE`,
`prepareRealScreening()`, `resumeRealScreening()`, `RetrievalSnapshot`,
liaison des `auditDecisions`, cross-process, no-refetch, intégrité du
snapshot) sont réutilisées TELLES QUELLES — aucune nouvelle
architecture, aucune duplication. Aucun Real Smoke réseau réel n'a été
relancé, à aucun moment de ce round.

## R6-F01 — NOMINAL_REAL_SMOKE_TWO_PHASE_INTEGRATION

- **Défaut relevé** : `prepareRealScreening()`/`resumeRealScreening()`
  (`lib/real-screening-workflow.js`, R5) étaient valides et couvertes
  par `test_t08_r5_closure.js` (41/41 PASS), mais n'étaient appelées
  par AUCUN point d'entrée opérateur réel — un opérateur n'avait aucun
  moyen d'exécuter le workflow en deux phases autrement qu'en écrivant
  son propre script.
- **Fichier modifié** : `bin/run-real-smoke.js` — ajout de
  `--phase prepare`/`--phase resume` (`parseCliArgs()`,
  `runPreparePhase()`, `runResumePhase()`, `mainCli()`) qui appellent
  DIRECTEMENT `prepareRealScreening()`/`resumeRealScreening()`. Le
  chemin historique single-shot (`main()`, sans `--phase`) reste
  strictement inchangé. Voir `28-NOMINAL-PREPARE-RESUME-CLI.md` pour
  l'architecture complète.
- **Test** : `test/test_t08_r6_closure.js`, R6-01/R6-02/R6-03/R6-04
  (cycle PREPARE→RESUME complet via deux sous-processus CLI dédiés,
  `test/cli/cli-prepare-runner.js`/`cli-resume-runner.js`) +
  R6-ARGS-01..03/R6-05/R6-06/R6-07 (fail-closed par cause réelle).
- **Résultat réel** : inclus dans `TOUS LES TESTS PASSENT (24)` de
  `test_t08_r6_closure.js`.
- **Preuve no-refetch au niveau CLI** : compteur d'appels provider
  persisté sur disque par le sous-processus PREPARE, relu après RESUME
  — reste à exactement 1 (R6-A01-fetch, R6-04).
- **Limitation restante** : aucune — le chemin nominal est désormais
  intégralement accessible en ligne de commande.

## R6-F02 — READINESS_SEMANTICS (surqualification)

- **Défaut relevé** : le rapport R5 ne calculait/n'exposait pas
  explicitement, pour une mission précise, les trois niveaux de
  readiness distincts (code / préparation / reprise) au niveau du
  binaire lui-même — seule la documentation (`26-READINESS-SEMANTICS.md`)
  portait cette distinction, jamais une fonction testable.
- **Fichier modifié** : `bin/run-real-smoke.js` — cinq fonctions PURES
  ajoutées (`computeRealSmokeCodeReadiness()`,
  `computeReadinessPreparation()`, `computePrepareNext()`,
  `computeResumeReadiness()`, `computeResumeNext()`) assemblées par
  `computeReadinessReport(mission, opts)`, jamais une transformation
  implicite de « code prêt » en « mission prête ». Intégré aux rapports
  `--phase prepare`/`--phase resume` (champ `readiness`).
- **Test** : `test/test_t08_r6_closure.js`, R6-08 (mission canonique
  incomplète : `CODE_READINESS=READY`,
  `PREPARATION_READINESS=NOT_READY`, `PREPARE_NEXT=NOT_READY` — prouvé
  à la fois en appel direct et via un sous-processus CLI réel
  `--phase prepare` sur la fixture canonique livrée), R6-09 (fixture
  LOCAL_CONTROLLED complète : `CODE_READINESS=READY`,
  `PREPARATION_READINESS=READY` — prouvé en appel direct et via le
  cycle CLI complet), R6-10 (aucune combinaison contradictoire, sur 6
  scénarios distincts de readiness, y compris avec/sans snapshot,
  avec/sans décisions valides).
- **Résultat réel** : inclus dans `TOUS LES TESTS PASSENT (24)`.
- **Limitation restante** : aucune — la mission canonique livrée reste
  délibérément `readyForExecution=false` (mandat section 12/`RÈGLE
  FINALE` : « si le code est prêt mais la mission canonique ne l'est
  pas […] c'est un état valide »), jamais artificiellement complétée
  pour faire basculer `PREPARATION_READINESS` en `READY`.

## Non-régression (R1→R5 → R6)

| Suite | Résultat |
|---|---|
| `test_t08_cross_process.js` | PASS (CROSS_PROCESS historique, 2 PID distincts) |
| `test_t08_eforch.js` | 26/26 PASS |
| `test_t08_epistemic_integrity.js` | 11/11 PASS |
| `test_t08_observability.js` | 10/10 PASS |
| `test_t08_preflight.js` | 10/10 PASS |
| `test_t08_release_governance.js` | 4/4 PASS |
| `test_t08_runner_orchestration.js` | 10/10 PASS |
| `test_t08_v06_delegated_auth.js` | 24/24 PASS |
| `test_t08_v06_real_adapter_model.js` | 9/9 PASS |
| `test_t08_r2_closure.js` | 62/62 PASS |
| `test_t08_r3_closure.js` | 16/16 PASS |
| `test_t08_r4_closure.js` | 25/25 PASS |
| `test_t08_r5_closure.js` | 41/41 PASS |
| `test_t08_r6_closure.js` | **24/24 PASS (nouvelle suite)** |
| `worker/evidenceforge-llm-proxy/test/worker.test.js` | 38/38 PASS (non affecté) |

**Aucune régression introduite par R6** — aucun test existant modifié
(contrairement à R5, R6 ne touche aucune assertion préexistante,
uniquement des ajouts).

## Non-modification de MONO-01→07

Confirmée : le diff de ce round touche exclusivement
`EvidenceForge/MONO-08/v0.6/` (`bin/run-real-smoke.js`,
`test/test_t08_r6_closure.js` [nouveau],
`test/cli/cli-prepare-runner.js` [nouveau],
`test/cli/cli-resume-runner.js` [nouveau]). Aucun fichier sous
`MONO-01/`→`MONO-07/` n'a été touché, ni aucun fichier sous
`lib/real-screening-workflow.js`/`lib/eforch-artifacts.js`/
`lib/real-e2e-driver.js` (primitives R5, reprises telles quelles).
Aucun `CONTRACT_ARCHITECTURE_IMPACT.md` n'a été nécessaire.

## Verdict R6

```
R6-F01 NOMINAL_TWO_PHASE_INTEGRATION = CLOSED
R6-F02 READINESS_SEMANTICS = CLOSED

PREPARE_ENTRYPOINT = PASS
RESUME_ENTRYPOINT = PASS
NO_REFETCH_ON_NOMINAL_RESUME = PASS
NON_REGRESSION = PASS

REAL_SMOKE_CODE_READINESS = READY
REAL_SMOKE_PREPARATION_READINESS_CANONICAL_MISSION = NOT_READY
REAL_SMOKE_RESUME_READINESS = NOT_READY
REAL_SMOKE_PREPARE_NEXT = NOT_READY
REAL_SMOKE_RESUME_NEXT = NOT_READY

REAL_G_HISTORIQUE = PASS
REAL_SMOKE_HISTORIQUE = FAIL
REAL_EVIDENCE = NON ACQUISE

MONO-08 = GELABLE TECHNIQUEMENT
MONO-09/JMMJS = BLOQUÉ
```

**Note de lecture** : `REAL_SMOKE_PREPARATION_READINESS_CANONICAL_
MISSION = NOT_READY` porte spécifiquement sur la mission canonique
livrée (`fixtures/mission-real-smoke-v1.json`), qui reste
délibérément incomplète — le MÉCANISME (`PREPARE_ENTRYPOINT`/
`RESUME_ENTRYPOINT`/readiness-reporting) est lui-même intégralement
`PASS`, comme le prouvent R6-01→R6-10 avec une fixture LOCAL_CONTROLLED
complète distincte. Voir `26-READINESS-SEMANTICS.md` (mis à jour R6)
et `11-FINAL-TECHNICAL-VERDICT.md` pour le rattachement complet.
