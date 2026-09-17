# MONO-05 — Rapport UI

## Écrans construits

Dashboard des runs, création de run (validation minimale schema/schemaVersion/
runContractHash), graphe des 14 nœuds réels avec badges d'état, détail de
nœud (moduleId/portId/state/attemptCount/retryPolicy/resumePolicy/lastError/
artifactRefs), dépendances externes (provider/type/configured/available,
jamais un secret), artefacts (lecture seule, contentHash tronqué affiché),
Lineage Gate (PASS/FAIL/NOT_RUN avec aide contextuelle), rapport final
(uniquement après PASS, limite d'assurance toujours visible).

## Ce que l'UI NE fait jamais

Aucun calcul de pertinence, sélection de professionnels, filtrage
`usableRecords`, construction de twin, agrégation de reviews, détermination
de `structurallyStable`, réparation de référence, recalcul de hash métier,
ou décision de `retryPolicy` — toutes ces décisions restent exclusivement
dans MONO-01→04, jamais dupliquées côté client ou serveur MONO-05.

## Polling

`maybeStartPolling()` interroge `/graph` toutes les 3 secondes uniquement
pendant qu'un nœud est `RUNNING`, s'arrête dès qu'aucun nœud ne l'est plus
— jamais un polling agressif ni une infrastructure temps réel complexe.

## Limite assumée : ExternalStageAdapter (EF-02A/B/C)

Documentée dans le README — ces trois nœuds ne sont pas pilotables depuis
le formulaire générique de création de run, car leur binding technique
(MONO-04) exige l'injection de fonctions `resultProvider` réelles, jamais
une simple déclaration JSON. Les construire génériquement depuis l'UI
reviendrait à inventer une logique métier côté UI (interdit).
