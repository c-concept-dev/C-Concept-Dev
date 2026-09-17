# EvidenceForge — MONO-03 : State / Persistence / Resume

MONO-03 fournit **l'état durable du run global du monolithe** — persistance,
reprise, continuité d'exécution. Il ne redéfinit ni COMMENT appeler un
module (MONO-01.x) ni QUAND un nœud est éligible (MONO-02).

## Contenu

```
MONO-03/
├── index.js                          (createMono03(options) — backend OBLIGATOIRE et explicite)
├── lib/
│   ├── persistence-errors.js         (taxonomie technique, 12 codes)
│   ├── persistence-backend.js        (contrat abstrait get/put/has/delete/keys + backend mémoire de TEST)
│   ├── canonical-hash.js             (hachage canonique autonome, jamais couplé à EF-ORCH)
│   ├── artifact-store.js             (ArtifactStore — persistance + vérification cryptographique)
│   ├── run-store.js                  (RunStore — RunState/NodeStateRecord, protocole atomique SUCCESS)
│   ├── run-lock.js                   (RunLock — verrou par run)
│   ├── resume-planner.js             (computeResumePlan — classification déterministe par politique)
│   └── persistence-coordinator.js    (invalidation de lignée, snapshot de registre d'exclusion)
├── contracts/                        (5 contrats JSON)
├── dependencies/
│   ├── PROVENANCE.md
│   └── MONO-02/                      (copie bytewise intégrale, nesting MONO-01.x)
├── test/                             (17 fichiers T03-01 à T03-40 + T03-SUCCESS-ATOMIC-01 à 04, 64 tests)
├── reports/
└── manifest/SHA256SUMS
```

## Frontière d'injection (même discipline que MONO-01.x)

`createMono03(options)` **refuse de se construire du tout** sans
`options.persistenceBackend` explicite — contrairement à `createMono01()`
(qui garde ses 15 autres ports utilisables même sans backend EF-ORCH),
MONO-03 n'a **aucune** fonctionnalité indépendante de la persistance : un
échec immédiat et net vaut mieux qu'une construction partielle qui
masquerait le problème. `createInMemoryBackend()` (`lib/persistence-backend.js`)
est étiqueté `IN_MEMORY_TEST_ONLY` et n'est jamais construit implicitement.

**MONO-03 ne fournit aucune implémentation persistante de production**
(IndexedDB ou équivalent) — cette responsabilité appartient à l'appelant
final. MONO-01.x/MONO-02/MONO-03 définissent ensemble la frontière
d'injection ; aucun des trois ne construit la persistance de production.

## EF-ORCH reste propriétaire de sa persistance interne

MONO-03 ne conserve, pour le nœud `EF-ORCH-SUBSYSTEM`, qu'une **référence
technique opaque** : `efOrchRunIdentity` + le dernier `efOrchNativeStatus`
rapporté. Il ne lit, n'interprète, ni ne duplique jamais le contenu des
stores internes d'EF-ORCH (`RunOutputStore`, `StateSnapshotStore`,
`CheckpointIdentityStore`) — vérifié statiquement par `T03-20` (aucun
fichier de `lib/` ne référence ces structures) et prouvé dynamiquement par
`T03-18`/`T03-19` : un run EF-ORCH démarré par une instance `createMono01()`
est retrouvé et interrogé par une **seconde instance distincte**, via
uniquement l'`efOrchRunIdentity` que MONO-03 a persisté — jamais un
recalcul ni une lecture des checkpoints EF-01A→F eux-mêmes.

## Protocole atomique SUCCESS (sections 13/14) — corrigé après audit indépendant

`RunStore.recordNodeSuccess()` écrit TOUJOURS l'artefact avant de committer
l'état `SUCCESS` du nœud, et commite désormais `nodeStates` et
`artifactRefs` en **une seule écriture RunState** (correction post-audit :
une première version utilisait deux écritures distinctes, laissant une
fenêtre où une panne pouvait produire un `RunState` durablement incohérent
— `SUCCESS` sans `artifactRefs` correspondant). Si l'écriture unique échoue,
l'exception se propage et le nœud reste dans son état courant — jamais un
`SUCCESS` sans artefact ni un `SUCCESS` partiel (`T03-07`, `T03-08`,
`T03-SUCCESS-ATOMIC-01`). Un nœud déjà `SUCCESS` est immuable : toute
tentative de le rejouer ou de l'écraser avec un artefact différent est
refusée explicitement (`T03-09`, `T03-10`). `loadRun()` rejette fail-closed
tout `RunState` historique/corrompu où cette cohérence serait rompue
(`T03-SUCCESS-ATOMIC-04`), sans jamais tenter de la réparer silencieusement.

## Registre d'exclusion (section 16)

Aucun code dédié n'est nécessaire : `ArtifactStore` calcule
`artifactId = sha256(runId, nodeId, contract, schemaVersion, missionId, contentHash)`
— `runId` fait partie de l'identité. Deux runs distincts stockant chacun
leur propre `ExclusionRegistrySet` obtiennent donc systématiquement des
`artifactId` différents ; un ancien run ne peut jamais être muté par un run
plus récent (`T03-30`).

## Lignée (section 17)

`PersistenceCoordinator.isLineageStillValid(runId)` compare les
`artifactId` référencés par le dernier PASS de lignée enregistré aux
`artifactId` actuellement présents dans `runState.artifactRefs` — le
moindre remplacement d'un artefact amont invalide silencieusement toute
confiance dans l'ancien PASS (`T03-31`).

## Vérification indépendante

```
cd MONO-03
npm test                              # 64/64 tests, T03-01 à T03-40 + T03-SUCCESS-ATOMIC-01 à 04
sha256sum -c manifest/SHA256SUMS      # doit renvoyer OK pour tous les fichiers
```
