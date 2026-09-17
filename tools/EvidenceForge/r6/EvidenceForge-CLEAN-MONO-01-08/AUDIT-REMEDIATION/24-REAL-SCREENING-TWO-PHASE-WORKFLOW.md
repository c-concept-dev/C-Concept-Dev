# 24 — Real Screening Two-Phase Workflow (R5)

Ferme R4-A01 (BLOQUANT) et R4-A02 (MAJOR), audit indépendant round 4
(`EvidenceForge-AUDIT-INDEPENDANT-R4.md`). Voir `23-R5-CLOSURE.md` pour
le récapitulatif de fermeture et `25-RETRIEVAL-SNAPSHOT-CONTRACT.md`
pour le schéma de l'artefact intermédiaire.

## Le problème (R4-A01, rappel)

Le chemin nominal historique (`bin/run-real-smoke.js` →
`lib/real-e2e-driver.js::createRealMissionRun()`) exécutait le
mission-gate — qui exigeait `auditDecisions` non vide, indexées par
`sourceId` — **avant** tout appel provider, donc avant que
`executeActiveConnectorsRetrieval()` (EF-01C2) n'ait même eu lieu. Or
ces `sourceId` sont générés dynamiquement par le connecteur, au moment
réel de la récupération. Structurellement impossible à satisfaire
honnêtement dans un seul chemin nominal synchrone, sans inventer à
l'avance des décisions sur des sources encore inconnues — interdit sans
exception par tous les mandats de cette remédiation.

## La solution : deux phases, une pause opérateur explicite

```
PRÉPARATION                                   PAUSE OPÉRATEUR                RÉCUPÉRATION
────────────                                  ───────────────                ────────────
 mission                                       [ l'opérateur lit le           décisions
   │                                             snapshot, décide,              │
   ▼                                             pour chaque source ]           ▼
 PRE_RETRIEVAL_GATE                                                        POST_RETRIEVAL_GATE
 (validatePreRetrievalProvenance                                           (validatePostRetrievalAuditDecisions
  — resolverRuns/plannerRun/                                                — LA SEULE fonction habilitée
  plannerOutput/humanValidation ;                                            à exiger/valider auditDecisions)
  JAMAIS auditDecisions)                                                         │
   │                                                                             ▼
   ▼                                                                        charge le RetrievalSnapshot
 RunContract / ResolverTrace /                                              EXACT depuis le disque,
 SearchProtocol construits                                                  vérifie son intégrité
   │                                                                        (SNAPSHOT_INTEGRITY_ERROR
   ▼                                                                         si altéré)
 EF-01C2 EXÉCUTÉ RÉELLEMENT                                                      │
 (une seule fois)                                                                ▼
   │                                                                        ScreeningArtifact/
   ▼                                                                        QualificationTestArtifact
 RetrievalSnapshot construit,                                               REJOUÉS depuis le snapshot
 hashé, PERSISTÉ (disque)                                                    (buildReplayConnectorRunners —
   │                                                                         AUCUN second retrieval,
   ▼                                                                         zéro fetchImpl impliqué)
 ARRÊT EXPLICITE :                                                               │
 OPERATOR_INPUT_REQUIRED_                                                        ▼
 AUDIT_DECISIONS                                                            run réel démarré/repris
```

## Implémentation

- **Phase 1 — `prepareRealScreening(env, opts)`**
  (`lib/real-screening-workflow.js`) : charge la mission, exécute
  `PRE_RETRIEVAL_GATE`, construit les artefacts amont
  (`buildPreRetrievalArtifacts()`, `lib/real-e2e-driver.js`), exécute
  EF-01C2 réellement (`executeActiveConnectorsRetrieval()`), assigne les
  `sourceId` réels, construit et persiste le `RetrievalSnapshot`, puis
  retourne `{state: "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS",
  snapshotId, snapshotHash, missionId, sourceCount, sourceIds}` — ne
  tente et ne peut jamais tenter de poursuivre vers EF-01D.
- **Génération du template de décisions —
  `buildAuditDecisionsTemplate(snapshot)`** : pré-remplit uniquement
  `snapshotId`/`snapshotHash`/`missionId`/`sourceId`/`titre`/`reference`
  (aide à l'opérateur) — `acteur`/`date`/`decision`/`justification`
  restent explicitement `null` pour CHAQUE source, jamais présumés
  représenter une action humaine avant qu'elle n'ait réellement eu
  lieu (mandat section 14).
- **Phase 2 — `resumeRealScreening(env, adapter, workerCallFn, opts)`**
  (`lib/real-screening-workflow.js`) : charge le snapshot par son
  `snapshotId` depuis le backend durable (potentiellement dans un AUTRE
  processus que celui de la Phase 1), vérifie son intégrité
  cryptographique, puis délègue à
  `createRealMissionRunFromSnapshot()` (`lib/real-e2e-driver.js`) qui
  exécute `POST_RETRIEVAL_GATE`
  (`validatePostRetrievalAuditDecisions()` — la SEULE fonction
  habilitée à exiger/valider `auditDecisions`, jamais une logique
  dupliquée ailleurs), rejoue le retrieval (`buildReplayConnectorRunners`
  — voir garantie no-refetch ci-dessous), construit
  `ScreeningArtifact`/`QualificationTestArtifact` depuis les données
  REJOUÉES du snapshot, puis démarre le run réel.

Le mission-gate nominal (`bin/run-real-smoke.js::describeMissionGateStatus`)
appelle désormais `validatePreRetrievalProvenance()` — identique à
l'ancienne `validateRealEForchProvenance()` MOINS le bloc
`auditDecisions`, qui a été retiré. `validateRealEForchProvenance()`
elle-même est **conservée telle quelle** (rétro-compatibilité, plus
appelée par le mission-gate) : elle continue d'exiger `auditDecisions`
si on l'invoque directement — aucun comportement historique supprimé,
seulement déplacé vers la bonne phase temporelle.

## Garantie « no-refetch » (mandat section 16, CRITIQUE)

`RESUME_REAL_SCREENING` ne réexécute JAMAIS EF-01C2.
`buildReplayConnectorRunners(byConnector)` (`lib/eforch-artifacts.js`)
retourne, pour chaque connecteur, une fonction qui résout
IMMÉDIATEMENT avec le résultat EXACT persisté par la Phase 1
(`snapshot.retrievalRaw.byConnector`) — **aucun `fetchImpl` n'est même
fourni** à cette fonction : impossible ARCHITECTURALEMENT de
déclencher un appel réseau, pas seulement empêché par une
mémoïsation contournable. `createRealMissionRunFromSnapshot()`
utilise ce même résultat rejoué à la fois pour construire
`ScreeningArtifact` directement (`precomputedRetrievalResult`) et pour
le nœud EF-01C2 du graphe lui-même.

Preuve directe par comptage d'appels provider : un compteur externe
incrémenté par le `fetchImpl` de test reste à **exactement 1** après
`prepareRealScreening()`, après `resumeRealScreening()`, ET après avoir
fait tourner le graphe jusqu'à `EF-ORCH-SUBSYSTEM=SUCCESS`
(`test_t08_r5_closure.js::R5-A02-01/08/08b`).

## Pourquoi le `RunContract`/`SearchProtocol` ne sont jamais recalculés à la reprise

`buildConfirmedRunContractForMission()` embarque un `confirmedAt`
horodaté à chaque appel — un second appel produirait un
`runContractHash` DIFFÉRENT, cassant la cohérence avec le snapshot déjà
persisté. `RetrievalSnapshot.upstreamArtifacts` porte donc le
`RunContract`/`ResolverTrace`/`SearchProtocol` **exacts** utilisés à la
Phase 1, réutilisés tels quels à la Phase 2 — jamais reconstruits.

## Preuve CROSS_PROCESS réelle (mandat section 31)

`test/cross-process/worker-prepare-screening.js` (processus A) exécute
`prepareRealScreening()` avec un provider LOCAL_CONTROLLED à DEUX
enregistrements distincts, persiste le snapshot, puis `process.exit()`
— aucun état ne survit dans ce processus au-delà de sa sortie.
`test/cross-process/worker-resume-screening.js` (processus B), lancé
SEULEMENT après la sortie confirmée de A, ouvre UNIQUEMENT les mêmes
dossiers sur disque, charge le snapshot par son `snapshotId` (jamais un
objet JS transmis), injecte des `auditDecisions` construites depuis les
`sourceId` réels reçus en argument (produits par A, jamais devinés à
l'avance), exécute `resumeRealScreening()`, puis fait progresser
`EF-ORCH-SUBSYSTEM` jusqu'à `SUCCESS`. PID(A) ≠ PID(B) ≠ PID(processus
de test) — vérifié explicitement, aucun backend mémoire partagé (voir
`test_t08_r5_closure.js::CROSS-PROCESS-01..07`, 8 assertions).
