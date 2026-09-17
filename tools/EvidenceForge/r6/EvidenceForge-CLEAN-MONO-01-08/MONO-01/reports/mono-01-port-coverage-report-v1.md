# MONO-01 — Rapport de couverture des ports

Réponse machine-readable dans `registry/mono-01-port-registry-v1.json`. Ce
document en donne la lecture humaine (T01-18).

## Modules de la baseline MONO-00 (10) — statut de couverture

| moduleId | Port(s) couvrant | bindingStatus |
|---|---|---|
| EF-ORCH | CorpusSnapshotPort, EFOrchExecutionPort, ExternalExecutionPort | BOUND |
| EF-PR-GEN-01 | MissionPort, ExternalExecutionPort | BOUND |
| EF-02A | ProfessionalPipelinePort, ExternalExecutionPort | BOUND (ExternalStageAdapter) |
| EF-02B | ProfessionalPipelinePort, ExternalExecutionPort | BOUND (ExternalStageAdapter) |
| EF-02C | ProfessionalPipelinePort, ExternalExecutionPort | BOUND (ExternalStageAdapter) |
| EF-02ABC-SMOKE-REAL | — | `explicitlyNotApplicable` (artefact historique, HISTORICAL_FREEZE_CONFIRMED dans MONO-00, aucune frontière d'appel exécutable) |
| EF-02D | EligibilityPanelPort, ExternalExecutionPort | BOUND |
| EF-02E | GovernancePort, DocumentaryTwinPort, ExternalExecutionPort | BOUND |
| EF-03 | TargetDocumentPort, ReviewSchemaPort, DocumentaryReviewPort, AggregationPort, StabilityPort, ExternalExecutionPort | BOUND |
| EF-04 | LineagePort, ReportPort, ExternalExecutionPort | BOUND |

**Aucun module de la baseline n'est silencieusement absent** (T01-18, vérifié
mécaniquement : `moduleCoverage` couvre les 10 moduleId, chaque entrée est
soit `coveredByPort` non vide soit `explicitlyNotApplicable: true`).

## 16 ports construits — tous BOUND

BaselinePort, MissionPort, CorpusSnapshotPort, EFOrchExecutionPort,
ProfessionalPipelinePort, EligibilityPanelPort, GovernancePort,
DocumentaryTwinPort, TargetDocumentPort, ReviewSchemaPort,
DocumentaryReviewPort, AggregationPort, StabilityPort, LineagePort,
ReportPort, ExternalExecutionPort.

## Révision MONO-01.x — EFOrchExecutionPort (3e passe : frontière d'injection stricte)

Nouveau défaut confirmé par audit indépendant après la 2e passe : bien que
`resume()` ait été corrigé pour réhydrater depuis un backend durable, le
port continuait à créer lui-même `createInMemoryAsyncBackend()` en absence
d'injection, et `createMono01()` construisait le port sans jamais
transmettre d'option — le chemin standard restait donc systématiquement un
backend RAM implicite.

**Corrigé définitivement** : `createEFOrchExecutionPort(baselinePort, options)`
ne construit plus JAMAIS de backend lui-même. Sans `options.durableBackend`,
le port existe (`createMono01()` reste utilisable pour ses 15 autres ports)
mais `port.durableBackend === null` et **toute opération réelle** (`start`,
`resume`, `getStatus`, `getResult`) **refuse explicitement**, fail-closed,
avant même de tenter quoi que ce soit. `createMono01(registryPathOrObject, options)`
accepte désormais `options.efOrchDurableBackend`, qu'il se contente de
transmettre tel quel — il ne le construit jamais et n'en devient jamais
propriétaire. La frontière d'injection s'arrête à MONO-01/MONO-02 : la
fourniture d'une implémentation persistante de production (IndexedDB ou
équivalent) appartient à un futur MONO-03.

Testé par T01-21 (DURABLE-05 réécrit : refus fail-closed sans backend,
acceptation d'un backend de test explicitement injecté, partage explicite
entre deux ports) et **T01-22, un nouveau test d'intégration testant la
VRAIE factory `createMono01()`** — deux instances `createMono01()`
distinctes partageant explicitement le même backend EF-ORCH, `start()` sur
l'une, `getStatus()`/`resume()` sur l'autre, état retrouvé (10/10 PASS).

## Révision MONO-01.x — EFOrchExecutionPort (corrigée après audit indépendant : durabilité cross-process réelle)

EF-ORCH est traité comme un **sous-système orchestré autonome gelé** : sa
state machine interne, son durable stage runner, son mécanisme
checkpoint/resume, ses politiques `restart_stage`/`resume_checkpoint`, son
ordre EF-01A→F restent intégralement sa propriété. `EFOrchExecutionPort`
(`start`/`resume`/`getStatus`/`getResult`) compose exclusivement les exports
gelés déjà séparés — RunContract, StateMachine, StageAdapter, ExecuteStage,
DurableStageRunner, StageInputResolver, les 7 factories `create*Executor`
(EF-01A à EF-01F), et les stores durables sur un **backend injecté
explicitement** (`options.durableBackend` à la construction du port).

`createInMemoryAsyncBackend` (gelé) est une **implémentation de test** du
contrat de backend abstrait (`get`/`put`/`has`/`keys`) — jamais une garantie
de durabilité cross-process. La durabilité réelle (survie à un redémarrage
de processus, IndexedDB ou toute autre implémentation du même contrat) est
la responsabilité de l'implémentation de backend que l'appelant injecte,
jamais un choix fait par le port lui-même. `resume()`/`getStatus()`/
`getResult()` **réhydratent systématiquement** l'état depuis
`stateSnapshotStore.getRunState(runId)` — jamais depuis une Map locale, qui
ne subsiste que comme cache facultatif intra-processus pour les exécuteurs
(jamais pour l'état du run). Une seconde instance de port construite sur le
même backend injecté retrouve l'état exact sans aucun état JS partagé —
vérifié par T01-21 (11/11 PASS, dont un test explicite à deux instances
distinctes du port).

Testé bout en bout et confirmé : `RunContract` → EF-01A → EF-01B → EF-01C1 →
EF-01C2 (avec un vrai gate `manual_import_required` sur `web_public`, résolu
via `resume()` + import manuel, checkpoint OpenAlex réutilisé — aucun second
appel réseau) → EF-01D → EF-01E → EF-01F → un vrai `CorpusSnapshot`, accepté
tel quel par `CorpusSnapshotPort` (T01-20, 26/26 PASS).

Les dépendances externes par sous-étape (EF-01B/EF-01C1 LLM=INDIRECT_UPSTREAM,
EF-01C2 réseau OpenAlex/Crossref/PubMed=DIRECT_RUNTIME) sont injectées par
l'appelant via `executionDependencies.connectorRunners` — jamais codées en
dur, jamais aplaties en booléen (T01-20, EF-ORCH-11).

14 appellent directement la fonction du module gelé correspondant (copie
bytewise vérifiée par hash dans `dependencies/`), avec validation complète
pré/post-appel (section 8/9 du CDC).

**ProfessionalPipelinePort (EF-02A/B/C) — décision d'architecture tranchée
(correction post-audit) :** l'invocation délègue systématiquement à un
**ExternalStageAdapter** injecté explicitement par l'appelant à chaque appel
(`opts.adapter`, voir `contracts/external-stage-adapter-v1.json`,
`bindingType: EXTERNAL_STAGE_ADAPTER`). Raison du choix : EF-02A/B/C sont des
outils HTML à dépôt de fichier manuel (interaction navigateur + Worker
Cloudflare réseau réel) — MONO-01 ne les pilote jamais (pas d'automatisation
d'UI dans ce lot), ne modifie jamais les fichiers HTML gelés, et ne les
réimplémente jamais silencieusement en module JS pur. Le port ne sait rien de
la façon dont l'adaptateur obtient son résultat ; il valide uniquement :

- la présence de la méthode requise sur l'adaptateur pour l'étape appelée
  (absence → `DEPENDENCY_UNAVAILABLE`, dependency=`"externalStageAdapter"`,
  jamais un comportement par défaut inventé) ;
- la conformité schema/schemaVersion de sa sortie (non-conformité →
  `INVALID_MODULE_OUTPUT`, status `FAILED`) ;
- **pour discoverProfessionals (EF-02A) : LES DEUX entrées gelées requises**
  — `corpusSnapshot` (`EvidenceForge.CorpusSnapshot`) ET `missionDimensionSet`
  (`EvidenceForge.MissionDimensionSet`/`EF-PR-GEN-v1`, version exacte reprise
  du registre MONO-00) — chacune validée indépendamment, jamais une seule
  transmise sans contrôle (bug réel trouvé et corrigé, voir
  `mono-01-contract-validation-report-v1.md`) ;
- que les 3 étapes restent strictement indépendantes — un adaptateur qui
  n'implémente que `discoverProfessionals` ne rend jamais disponibles
  `verifyProfessionals` ou `buildProfessionalCorpus` (vérifié explicitement,
  T01-09 tests 10 à 12).

`bindingStatus = BOUND` pour EF-02A, EF-02B et EF-02C. Il n'y a plus de
décision ouverte sur ce port.

## Réponses machine-readable à la définition de done (CDC section 19)

| Question | Réponse |
|---|---|
| Quel port appelle quel module ? | `registry/mono-01-port-registry-v1.json` → `ports[].coversModuleIds` |
| Quels inputs exacts ? | `lib/port-factory.js` → `requiredInputs` / `inputContracts` par appel de port (voir chaque fichier `ports/*.js`) |
| Quels outputs exacts ? | `outputContract` par méthode, validé par `finalizeOutput()` |
| Quelle version ? | `expectedCanonicalVersion` par port, vérifié contre `BaselinePort.getModuleDefinition()` |
| Quelle dépendance externe ? | `externalDependencies` par méthode + `ExternalExecutionPort.classify()` (DIRECT_RUNTIME / INDIRECT_UPSTREAM / NONE, jamais un booléen) |
| Sync ou async ? | `callType` par méthode (SYNC / ASYNC / ASYNC_EXTERNAL), vérifié à l'exécution (T01-11) |
| Quelles conditions bloquent l'appel ? | section 8 du CDC, implémentée dans `invokePort()` — 6 contrôles séquentiels avant tout appel |
| Quel Lineage Gate protège le rapport ? | `ReportPort.gate` — `LINEAGE_BLOCKED` si `LineagePort.assertLineage()` n'a pas produit un PASS explicite (T01-15) |

Toutes ces réponses proviennent de MONO-00 et des contrats gelés — aucune
n'est une valeur inventée par MONO-01.
