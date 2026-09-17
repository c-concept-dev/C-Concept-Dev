# MONO-03 — Rapport de persistance

## PersistenceBackend

Contrat abstrait minimal (`get`/`put`/`has`/`delete`/`keys`, toutes
asynchrones), délibérément générique et sans connaissance du domaine
EvidenceForge. `createInMemoryBackend()` (implémentation de TEST, étiquetée
`IN_MEMORY_TEST_ONLY`) est la seule implémentation fournie — jamais une
implémentation de production (IndexedDB ou équivalent), qui reste hors
périmètre de MONO-03 (voir CDC section 8 : "ne couple pas le domaine au
backend").

`createMono03(options)` refuse de se construire du tout sans
`options.persistenceBackend` explicite (T03-34) — discipline identique à
celle imposée à `EFOrchExecutionPort` après ses corrections d'audit.

## ArtifactStore

`putArtifact()`/`getArtifact()` — chaque artefact est identifié par
`artifactId = sha256(runId, nodeId, contract, schemaVersion, missionId, contentHash)`.
Toute lecture revérifie cryptographiquement le `contentHash` du payload
retourné (T03-05, T03-06) et, si des champs attendus sont fournis
(`runId`/`missionId`/`contract`/`nodeId`/`schemaVersion`), les compare
strictement au contenu réel (T03-26 à T03-28) — divergence = fail-closed
(`PERSISTED_ARTIFACT_MISMATCH`), jamais une correction heuristique.

`putArtifact()` est idempotent pour un contenu identique et refuse
explicitement (`ARTIFACT_CONFLICT`) tout écrasement d'un `artifactId`
existant par un contenu différent.

## RunStore

`RunState`/`NodeStateRecord` persistés dans le namespace `runs` du backend
injecté. Les 7 états de nœud restent EXACTEMENT ceux de MONO-02
(`NOT_STARTED`/`READY`/`RUNNING`/`SUCCESS`/`FAILED`/`BLOCKED`/`PAUSED`) —
`updateNodeState()` rejette toute valeur hors de cette liste
(`RUN_STATE_CONFLICT`).

`recordNodeSuccess()` implémente le protocole atomique exigé par les
sections 13/14 : (1) écrire l'artefact via `ArtifactStore` — si cette étape
échoue, l'exception se propage et rien d'autre n'est modifié ; (2)
seulement si l'étape 1 réussit, construire `nodeStates` et `artifactRefs`
entièrement en mémoire et les committer en **une seule écriture** `persist()`.

**Correction post-audit** : une première version effectuait deux écritures
`RunState` distinctes pour ces deux champs, laissant une fenêtre où une
panne exactement entre les deux produisait un `RunState` durablement
incohérent (`state === "SUCCESS"` mais `artifactRefs[nodeId]` absent) — le
chemin idempotent de relance retournait alors cet état incohérent tel quel,
sans le détecter. Corrigé par un commit unique, plus un garde-fou
`assertRunStateConsistent()` dans `loadRun()` qui rejette fail-closed toute
incohérence résiduelle (historique ou corruption externe), jamais une
réparation silencieuse. Vérifié par `T03-SUCCESS-ATOMIC-01` à `04`.

Un nœud déjà `SUCCESS` est immuable : `markNodeRunning()` et `updateNodeState()`
refusent toute transition hors de `SUCCESS`, et un second `recordNodeSuccess()`
n'est accepté que si l'artefact fourni est identique (idempotence) —
sinon `RUN_STATE_CONFLICT`.

## RunLock

Verrou par run, persisté dans le namespace `locks` du backend injecté —
visible entre plusieurs instances (T03-24/25). Limite documentée
honnêtement dans `lib/run-lock.js` : le couple `get()+put()` n'est pas une
primitive atomique de type compare-and-swap au niveau du contrat abstrait ;
une implémentation de production sur un backend réellement distribué et
concurrent devrait s'appuyer sur une primitive atomique propre à ce backend.

## Frontière avec EF-ORCH (jamais franchie)

MONO-03 ne stocke, pour `EF-ORCH-SUBSYSTEM`, que `efOrchRunIdentity` et
`efOrchNativeStatus` — deux champs opaques, jamais interprétés. Vérifié
statiquement (T03-20 : aucun fichier de `lib/` ne référence les structures
internes d'EF-ORCH) et dynamiquement (T03-18/19 : reprise cross-instance
réelle via le vrai `EFOrchExecutionPort`).
