# 10 — Real Smoke Readiness

**AUCUN Real Smoke réseau réel n'a été relancé pendant cette mission**
(interdiction explicite du mandat, section 14). Ce document ne rapporte
que des faits déjà établis, jamais un nouveau run.

## Real Smoke historique — statut projet

```
REAL_SMOKE_HISTORIQUE = FAIL
```

Un run nominal a été réellement exécuté (sur Mac, hors de cet
environnement) : `baseline=PASS`, `preflight=READY`, `mission-gate=PASS`,
`connectivity=PASS`, puis `full-pipeline=FAIL` au premier nœud
(`EF-ORCH-SUBSYSTEM=BLOCKED`), avec `persistence-restart`/`ui-smoke`/
`secret-scan` en `NOT_RUN` en conséquence de cet arrêt.

**Ce statut n'est JAMAIS reclassifié `NOT_RUN`.** Le run a eu lieu ; il a
échoué à un point précis et documenté. Les archives fournies à cet audit
ne contiennent pas l'artefact primaire de ce run (le fichier de trace
JSON lui-même) — c'est une LACUNE DE PACKAGING/DE PREUVE, jamais une
preuve que le run n'a jamais existé, et cet artefact manquant n'a jamais
été reconstitué ou fabriqué dans cette mission.

**Cause racine probable, avec le recul de cette remédiation** : le
défaut F-01 (perte de `lastError`) est exactement ce qui a empêché de
diagnostiquer immédiatement pourquoi `EF-ORCH-SUBSYSTEM` était `BLOCKED`
lors de ce run — corrigé dans cette mission (`07-OBSERVABILITY-
REMEDIATION.md`), mais cette correction ne peut évidemment pas
rétroactivement produire le diagnostic du run historique lui-même.

## REAL G (délégation LLM, MONO-08 v0.6)

Statut historique du projet : **PASS**. Non relancé dans cette mission
(interdiction section 13 du mandat), aucune nouvelle preuve fabriquée.

## Ce qui a changé pour un futur run réel indépendant

1. **F-01→F-04 corrigés** : un futur run réel bénéficiera d'un
   diagnostic `lastError`/`errorCode` complet en cas de blocage, et ne
   pourra plus produire silencieusement de fausse provenance
   LLM/humaine.
2. **`mode: "REAL"` désormais actif par défaut dans `bin/run-real-
   smoke.js`** : le pipeline exigera une provenance réelle
   (`mission.eForchProvenance`) avant de construire `ResolverTrace`/
   `SearchProtocol`/`ScreeningArtifact` — absent aujourd'hui du fixture,
   donc un run réel s'arrêtera honnêtement en
   `OPERATOR_INPUT_REQUIRED` tant que l'opérateur ne l'aura pas fourni
   (voir `09-REMAINING-RISKS.md`, point 1).
3. **Preuve CROSS_PROCESS ajoutée** : la persistance durable
   cross-processus, jusque-là non prouvée, l'est désormais (avec un
   backend de référence `FILE_DURABLE` — jamais testé pour un
   déploiement réseau réel).
4. **Fixture correctement déclaré** : plus de contradiction entre le
   contenu réel du fixture et sa documentation d'intégrité.

## Verdict de préparation

```
REAL_SMOKE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN
```

Justification : tous les défauts de code identifiés comme BLOCKER/MAJOR
pour MONO-08 sont corrigés et prouvés par test LOCAL_CONTROLLED
(`08-TEST-RESULTS.md`) ; le pipeline échoue désormais fermé plutôt que
de fabriquer une preuve en l'absence de provenance réelle ; aucune
dépendance live supposée persistable n'est laissée sans preuve. Ce
statut ne signifie PAS qu'un run réel réussirait aujourd'hui sans
intervention opérateur (voir point 1 ci-dessus) — il signifie que le
CODE est prêt à recevoir un run réel honnêtement, sans risque de
fabrication silencieuse.

`REAL_EVIDENCE = NON ACQUISE` — aucune preuve Real Smoke réseau réelle
n'a été acquise par cette mission, et ce document ne prétend jamais le
contraire.
