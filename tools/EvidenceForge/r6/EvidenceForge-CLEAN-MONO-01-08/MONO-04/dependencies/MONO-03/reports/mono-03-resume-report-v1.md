# MONO-03 — Rapport de reprise (ResumePlanner)

## Principe

`computeResumePlan(runState, orderedNodeIds)` classe chaque nœud CONNU du
`RunState` dans exactement un des 6 seaux (`nodesToReuse`, `nodesToResume`,
`nodesToReplay`, `nodesToRecompute`, `nodesNotStarted`, `nodesBlocked`), à
partir de son état persisté et de sa `retryPolicy` — déjà fournie par
l'appelant depuis le graphe MONO-02, jamais recalculée ni devinée. Aucun
raisonnement métier.

## Mapping politique -> seau, vérifié contre les 14 vrais nœuds MONO-02

| Politique | Nœud(s) réel(s) exercé(s) | Seau | Test |
|---|---|---|---|
| `RESTART_STAGE` | EF-02A | `nodesToReplay` | T03-12 |
| `RESUME_CHECKPOINT` | EF-ORCH-SUBSYSTEM | `nodesToResume` | T03-13 |
| `REPLAY_MISSING_ONLY` | EF-03B | `nodesToResume` | T03-14 |
| `RECOMPUTE_DETERMINISTIC` | EF-03D | `nodesToRecompute` | T03-15 |
| `EXPLICIT_REBUILD_REQUIRED` | EF-02E | `nodesBlocked` | T03-16 |
| `NO_RETRY` | EF-04-LINEAGE | `nodesBlocked` | T03-17 |

Ce tableau a été vérifié en lisant `resumePolicy`/`retryPolicy` directement
depuis `dependencies/MONO-02/graph/mono-02-orchestration-graph-v1.json` — la
même source que MONO-02 lui-même, jamais un mapping réinventé à part.

## Déterminisme

`computeResumePlan()` est une fonction pure : même `RunState` + même ordre
de nœuds -> même `ResumePlan`, à chaque appel (T03-11), et le résultat
sérialise/désérialise sans perte (T03-32).

## `resumeFromNode`

Indication du premier nœud non-`SUCCESS` dans l'ordre fourni — jamais un
calcul de dépendances ou d'éligibilité (qui reste la responsabilité de
MONO-02 via `computeReadyNodes()`).

## EF-ORCH-SUBSYSTEM spécifiquement

Quand ce nœud figure dans `nodesToResume`, `reasoningCodes` précise
explicitement que la reprise doit passer par `EFOrchExecutionPort.resume()`
en utilisant l'`efOrchRunIdentity` déjà persisté — jamais une reconstruction
des checkpoints EF-01A→F. Si une `efOrchRunIdentity` est connue dans le
`RunState`, elle est recopiée dans l'entrée `reasoningCodes` correspondante
pour que l'appelant (l'orchestrateur réel, hors périmètre de MONO-03) sache
immédiatement quel identifiant utiliser.
