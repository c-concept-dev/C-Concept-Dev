# 07 — Observability Remediation (F-01)

## Le défaut

`bin/run-real-smoke.js`, avant remédiation, résumait la traversée du
graphe uniquement par :

```js
"traversal: " + nodeTrace.map(t => t.nodeId + ":" + t.state).join(",")
```

Le run nominal historique (voir `10-REAL-SMOKE-READINESS.md`) s'est
arrêté sur `EF-ORCH-SUBSYSTEM: BLOCKED` sans qu'aucune cause racine ne
soit exploitable depuis ce seul résumé — alors que
`operatorApi.getNode(runId, nodeId)` (MONO-05, déjà exposé, jamais
modifié) porte `lastError` (objet `{schema, schemaVersion, code,
message, details}`) depuis le premier instant.

## La correction

`describeNodeFailure(operatorApi, runId, nodeId)` (nouveau, `bin/run-
real-smoke.js`) :

1. Appelle `operatorApi.getNode()` — jamais une réimplémentation, jamais
   une lecture directe de MONO-03 qui contournerait la frontière API
   déjà établie.
2. Restitue TOUJOURS `nodeId`, `state`, `attemptCount`, `lastError`
   (objet complet, jamais tronqué), `errorCode` (= `lastError.code`,
   `null` si absent — jamais une chaîne inventée).
3. Restitue, **uniquement quand `lastError.details` les porte
   réellement** (vérifié champ par champ, jamais une valeur par
   défaut) :
   - `nativeStatus` (← `details.efOrchNativeStatus`)
   - `currentStage` (← `details.stageId`, ou `details.currentStage`)
   - `completedStages` (← `details.completedStages`)
   - `awaitingStage` (← `details.awaitingStage`)
   - `gate` (← `details.gate`, objet complet)
   - `lastResultKind` (← `details.lastResult.kind`)

Appelé sur le PREMIER nœud non-SUCCESS (ordre du graphe, jamais deviné)
dès que `driveRun()` ne produit pas 14/14 SUCCESS, et intégré dans le
`detail` JSON du pas `full-pipeline` de la trace — donc automatiquement
couvert par le passage `secret-scan` existant (qui scanne
`JSON.stringify(trace)` en entier).

## Limite documentée (jamais contournée)

`completedStages`/`lastResult` existent bien dans le `summary` interne
d'`EFOrchExecutionPort` (MONO-01, `ports/ef-orch-execution-port.js`,
lignes `completedStages: state.checkpoints.map(...)`), mais
`lib/node-runners.js` (MONO-02, gelé) ne les propage PAS dans
`diagnostics.error.details` pour le cas `BLOCKED`-en-pause — seuls
`efOrchNativeStatus`/`awaitingStage`/`gate` le sont. `describeNodeFailure()`
ne les invente donc jamais dans ce cas (`typeof details.completedStages
=== "undefined"` → champ absent du résultat, jamais `null` ni une valeur
par défaut qui laisserait croire à une absence de checkpoints plutôt
qu'à une absence de propagation). Corriger cette propagation exigerait
de modifier `node-runners.js` (MONO-02, lot gelé) — non fait ici (voir
`04-CONTRACT-IMPACTS.md` : aucune tension de ce type n'a justifié un
`CONTRACT_IMPACT`, celle-ci n'a simplement pas été jugée nécessaire pour
la validité du diagnostic déjà exposé via `code`/`message`).

## Statut de trace dédié pour F-02/F-03/F-04

`bin/run-real-smoke.js` distingue désormais explicitement
`OPERATOR_INPUT_REQUIRED` (nouveau statut, code de sortie 4) de `FAIL`
(code 1) lorsque la construction du run échoue en mode REAL faute de
provenance réelle — un refus honnête n'est jamais confondu avec une
panne technique.

## Preuve

`test/test_t08_observability.js` (10 assertions, T-NEW-04) : formes de
`getNode()`/`lastError.details` reproduites EXACTEMENT depuis le code
source réel de `operator-api.js` (MONO-05) et `node-runners.js`
(MONO-02) — jamais inventées — couvrant le cas pause/gate-en-attente, le
cas échec natif EF-ORCH, et le cas sans `lastError` du tout (`errorCode`
doit rester `null`, jamais une chaîne fabriquée).
