# MONO-03 — Rapport de reprise après incident (crash recovery)

## Scénario de done (CDC section 27) — vérifié réellement

```
run monolithique démarre
→ plusieurs nœuds réussissent            (T03-01/04/07/09)
→ outputs persistés                       (ArtifactStore, contentHash vérifié)
→ interruption brutale                    (nouvelle instance, T03-21/22/23)
→ nouvelle instance
→ même backend
→ RunState retrouvé                       (T03-21)
→ outputs SUCCESS réutilisés              (T03-09, jamais rejoués)
→ EF-ORCH repris via son propre mécanisme natif  (T03-18/19, vrai EFOrchExecutionPort)
→ aucun succès valide rejoué              (T03-10)
→ graphe reprend au bon nœud              (T03-23b, ResumePlan)
```

Chaque flèche ci-dessus correspond à un test réellement exécuté, pas une
affirmation non vérifiée.

## T03-22 — crash entre l'écriture de l'artefact et le commit de l'état

Simulé en écrivant un artefact directement via `ArtifactStore.putArtifact()`
SANS passer par `RunStore.recordNodeSuccess()` (reproduisant exactement
l'état intermédiaire où un vrai crash surviendrait entre les deux étapes du
protocole atomique). Une seconde instance `createMono03()` sur le même
backend retrouve le nœud toujours `RUNNING` — jamais un `SUCCESS` halluciné
à partir de la seule présence de l'artefact. Rejouer `recordNodeSuccess()`
avec le MÊME payload complète alors proprement le protocole interrompu
(idempotence de `putArtifact()`).

## T03-23 — crash pendant RUNNING, avant tout output

Simulé en appelant `markNodeRunning()` puis en détruisant l'instance sans
jamais produire d'artefact. Une seconde instance retrouve le nœud `RUNNING`
(état exact, jamais réinterprété), et `computeResumePlan()` le classe
correctement dans `nodesToReplay` (le nœud testé, EF-02A, porte
`RESTART_STAGE`).

## T03-18/T03-19 — EF-ORCH cross-process réel

Utilise le VRAI `EFOrchExecutionPort` (MONO-01.x), jamais un mock : une
instance `createMono01()` ("process A") démarre un run EF-ORCH ; MONO-03
persiste uniquement `efOrchRunIdentity` + `efOrchNativeStatus` ; une seconde
instance `createMono01()` totalement distincte ("process B"), pointant sur
le même backend EF-ORCH, retrouve exactement ce run via
`getStatus(efOrchRunIdentity)` — confirmant que la reprise EF-ORCH imbriquée
fonctionne réellement à travers la frontière MONO-03, sans que MONO-03 n'ait
jamais eu besoin de lire un seul octet des checkpoints internes d'EF-ORCH.

## Limite assumée

Ces tests utilisent deux INSTANCES distinctes (`createMono03`/`createMono01`
appelés séparément) sur un backend PARTAGÉ, ce qui est la méthode standard
pour prouver qu'aucun état en mémoire (closures, variables de module) n'est
requis pour la reprise — la vraie destruction d'un processus OS n'est pas
simulable dans cet environnement de test, mais l'absence de tout état
partagé autre que le backend est la propriété qui compte réellement ici (et
qui est effectivement vérifiée).
