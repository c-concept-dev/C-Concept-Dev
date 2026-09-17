# Regle de reliaison des decisions humaines — MONO-08 v0.8

## Statut de `audit-decisions-confirmed.json`

Les 88 decisions humaines de Christophe Bonnet (22 inclus / 63 exclus / 3 doublons,
SHA-256 `a4c2cec1a720a4d1d5e297b8eb44b7cd6695dbb84238d1de4949662cf9b07c9e`) sont
**liees par contrat** au snapshot du premier PREPARE reel :

```
snapshotId   snapshot-00c24be44264-mtrrf8v3-vol3x5
snapshotHash dcf8fa70f8cbe036fa76bec0273f20ff2497428580bab33ed1b87847a8fccddb
```

`validatePostRetrievalAuditDecisions()` (MONO-08 v0.6, gele) refuse tout jeu de
decisions dont `snapshotId`, `snapshotHash` ou `missionId` divergent du snapshot
charge. Ce lien n'est pas une convention : il est verifie par le lot gele.

## Regle

```
SI  nouveau snapshotHash == ancien snapshotHash
ET  sourceIds identiques (memes valeurs, meme ordre)
ET  contenu de chaque source identique
ALORS la reutilisation PEUT etre evaluee par contrat.

SINON les decisions humaines exigent une reliaison
      et une revue par le proprietaire.
```

## Ce que cette regle ne fait pas

Elle **ne decide pas** de la reutilisation. Aucun mecanisme automatique ne doit
reporter ces 88 decisions sur un nouveau snapshot : c'est un acte humain, comme
la ratification qui les a produites.

## Ce qu'il faut savoir avant un nouveau PREPARE

Corriger v0.7 en v0.8 ne repare pas le snapshot existant : `snapshotHash` couvre
`retrievalRaw`, donc le log incomplet en fait partie. Rendre le corpus exploitable
par le graphe impose un **nouveau PREPARE reel**, donc de nouveaux appels reseau.
OpenAlex n'etant pas fige dans le temps, le nouveau snapshot aura tres
probablement un `snapshotHash` different et, potentiellement, des sources
differentes. La branche « SINON » de la regle ci-dessus est donc le cas attendu :
**les 88 decisions devront etre reliees et revues**, non reprises telles quelles.
