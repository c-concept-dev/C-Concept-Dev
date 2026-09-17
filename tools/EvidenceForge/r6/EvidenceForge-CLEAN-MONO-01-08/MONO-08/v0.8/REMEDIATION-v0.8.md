# MONO-08 v0.8 — Remediation du contrat de log EF-01C2

## Finding ferme

`EF01C2_CHECKPOINT_LOG_CONTRACT_VIOLATION` — observe au **premier RESUME reel**
(`runId real-resume-mtrvus4k`, 2026-09-07), noeud `EF-ORCH-SUBSYSTEM` = `BLOCKED`,
stage `EF-01C2`, `INTEGRATION_CONTRACT_ERROR` :

```
assertConnectorCheckpointOutputValid: log.costUsd manquant ou non numerique
pour "openalex" (toujours initialise a 0 par executeAll()).
```

## Cause racine

`MONO-01/dependencies/ef-orch-ef01c2-checkpoint-contract-v0.1.js` exige, pour un
connecteur de capacite `automatic`, que `output.log` porte :

| Champ | Regle |
|---|---|
| `connectorId` | chaine non vide, egale au connecteur du checkpoint |
| `requestsCount` | nombre fini |
| `resultsCount` | nombre fini |
| **`costUsd`** | nombre fini |
| `errors` | tableau |
| **`startedAt`** | chaine non vide |
| **`finishedAt`** | chaine non vide |
| `stopReason` | chaine non vide |

Le log agrege de `fairQueryCoverageRetrieval` (v0.7) n'en produisait que cinq :
`connectorId`, `orchestration`, `requestsCount`, `resultsCount`, `errors`,
`stopReason`. **`costUsd`, `startedAt` et `finishedAt` manquaient.**

Quand v0.7 a remplace `buildOpenAlexConnectorRunner` (v0.6) par le runner
equitable pour corriger la famine de requetes, le contrat de log garanti par
`executeAll()` n'a pas ete reproduit. Le defaut est reste invisible parce que
`assertConnectorCheckpointOutputValid()` n'est invoquee que par le noeud EF-01C2
du graphe, c'est-a-dire **uniquement pendant RESUME** : ni le readiness v2, ni le
PREPARE, ni les 63 tests v0.7 ne l'exercaient.

## Semantique adoptee — lue dans le lot gele, jamais devinee

Source : `MONO-01/dependencies/ef-orch-ef01c2-runner-openalex-v0.1.js`.

| Champ | Semantique historique v0.6 | Semantique v0.8 (agregat FAIR) |
|---|---|---|
| `costUsd` | l.107 initialise a `0`, puis l.140 `log.costUsd += data.meta.cost_usd` quand le fournisseur renvoie un nombre | **somme** des `costUsd` des sous-logs par requete. Vaut naturellement `0` quand OpenAlex n'annonce aucun cout — jamais un `0` code en dur, qui masquerait un cout reellement facture |
| `startedAt` | l.107 `nowIso()` avant toute requete | `nowIso()` avant la premiere requete de l'orchestration equitable |
| `finishedAt` | l.177 `nowIso()` dans un `finally`, jamais un `catch` | `nowIso()` dans un `finally` : une exception logicielle inattendue continue de se propager |

`startedAt <= finishedAt` est verifie par test (T06) et par readiness v3.
L'horloge est celle du runtime ; elle n'est injectable que pour les tests.

## Perimetre du changement

Un seul fichier de logique modifie, cinq hunks, tous dans la construction du log :
`lib/fair-query-coverage.js` (voir `DIFF-v0.7-to-v0.8.patch`).

**Inchanges** : allocation `fairShares`, boucle de recuperation, deduplication par
identite externe, plafond global `maxResults`, memoisation de
`buildFairCoverageConnectorRunner`, requetes du SearchProtocol, forme de
`coverage`. Aucun changement scientifique.

## Ajouts

- `lib/readiness-v3.js` — readiness v2 conserve tel quel, plus 8 controles dont
  `EF01C2_CHECKPOINT_LOG_CONTRACT_VALID` et `LOCAL_EF01C2_CHECKPOINT_PATH_PASS`,
  qui executent FAIR hors reseau et passent la sortie dans le **vrai** validateur
  gele. C'est le controle qui manquait.
- `test/test-mono08-v0.8-log-contract.js` — 34 tests, dont la fermeture causale :
  le log v0.7 historique est **rejete** et le log v0.8 **accepte** par le meme
  validateur gele.
- `REBINDING-RULE.md` — statut des 88 decisions humaines existantes.

## Ce que cette remediation ne fait pas

Elle ne repare pas le snapshot du premier run. `snapshotHash` couvre
`retrievalRaw`, donc le log incomplet en fait partie : toute correction
invaliderait `verifySnapshotIntegrity()`. Rendre le corpus exploitable par le
graphe impose un **nouveau PREPARE reel**, avec de nouveaux appels reseau et un
corpus potentiellement different. Cette decision appartient au proprietaire.
