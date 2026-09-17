# MONO-02 — Rapport de couverture du graphe

## Révision post-audit — EF-ORCH-SUBSYSTEM

Le nœud `EF-ORCH` (faux passthrough d'un `CorpusSnapshot` externe) est
remplacé par **`EF-ORCH-SUBSYSTEM`**, qui appelle réellement
`EFOrchExecutionPort.start()`/`resume()` (MONO-01.x) — le graphe commence
désormais véritablement par un `RunContract`, jamais un `CorpusSnapshot`
supposé déjà produit. EF-ORCH reste traité comme un **sous-système orchestré
autonome gelé** : sa state machine interne, son mécanisme checkpoint/resume,
ses politiques `restart_stage`/`resume_checkpoint` restent entièrement sa
propriété — MONO-02 ne pilote jamais individuellement EF-01A/B/C1/C2/D/E/F,
il ne connaît que l'état externe du sous-système (`NOT_STARTED`/`READY`/
`RUNNING`/`SUCCESS`/`FAILED`/`BLOCKED`/`PAUSED`, plus un statut d'orchestration
`AWAITING_DEPENDENCIES` superposé par MONO-02 pour distinguer « en attente
d'artefacts de stage » d'un échec réel). Une fois le sous-système `completed`,
le `CorpusSnapshot` produit passe par `CorpusSnapshotPort.receive()` avant
d'être exposé comme sortie du nœud — `CorpusSnapshotPort` n'est jamais
supprimé, ses responsabilités de validation restent utiles (flux CDC section 7).

Testé bout en bout : la chaîne complète des 14 nœuds réussit désormais à
partir d'un vrai `RunContract` confirmé, en réutilisant les fixtures EF-ORCH
déjà prouvées de MONO-01.x (`dependencies/MONO-01/test/fixtures-eforch.js`),
jamais une reconstruction séparée.

## Révision post-audit — usableRecords

`lib/node-runners.js` n'implémente plus localement le prédicat
`usableRecords` (éligible ET pertinent sur au moins une dimension) : le
nœud EF-02D appelle exclusivement `mono01.eligibilityPanelPort.selectUsableRecords(...)`
(MONO-01.x). Un test de non-régression statique dédié
(`test/test_t02_23_no_local_usable_records_duplication.js`) empêche le
retour de cette duplication — 4/4 PASS.

## Nœuds construits (14) — mise à jour

| nodeId | moduleId | port MONO-01 | méthode(s) |
|---|---|---|---|
| EF-ORCH-SUBSYSTEM | EF-ORCH | EFOrchExecutionPort + CorpusSnapshotPort | start+resume, puis receive au succès |
| EF-PR-GEN-01 | EF-PR-GEN-01 | MissionPort | validateMissionDimensionSet + validateMissionDocumentMapping + validateHeuristicPolicy |
| EF-02A | EF-02A | ProfessionalPipelinePort | discoverProfessionals |
| EF-02B | EF-02B | ProfessionalPipelinePort | verifyProfessionals |
| EF-02C | EF-02C | ProfessionalPipelinePort | buildProfessionalCorpus |
| EF-02D | EF-02D | EligibilityPanelPort | buildEligibilityRelevanceSet + buildCoverageMatrix + selectPanel |
| EF-02E | EF-02E | DocumentaryTwinPort | buildDocumentaryTwinSet |
| TARGET_DOCUMENT_SET | EF-03 | TargetDocumentPort | buildTargetDocumentSet |
| EF-03A | EF-03 | ReviewSchemaPort | buildReviewSchema |
| EF-03B | EF-03 | DocumentaryReviewPort | buildDocumentaryReviewSet |
| EF-03C | EF-03 | AggregationPort | buildAggregatedDocumentaryReview |
| EF-03D | EF-03 | StabilityPort | buildStabilityContradictionAnalysis |
| EF-04-LINEAGE | EF-04 | LineagePort | assertLineage |
| EF-04A | EF-04 | ReportPort | buildUnifiedReportSummary |

Chaque nœud est couvert par un exécuteur enregistré dans `lib/node-runners.js`
(vérifié mécaniquement par T02-20, test 1x14). Aucun module de la baseline
MONO-00 n'est absent : les 9 moduleId exécutables (EF-ORCH, EF-PR-GEN-01,
EF-02A, EF-02B, EF-02C, EF-02D, EF-02E, EF-03, EF-04) apparaissent tous dans
le graphe — EF-02ABC-SMOKE-REAL reste explicitlyNotApplicable côté MONO-01,
cohérent, jamais réintroduit ici.

## Garde de lignée — nœud distinct, jamais fusionné

EF-04-LINEAGE est un nœud séparé d'EF-04A, exactement comme l'exige le CDC
(« et non : EF-03D -> EF-04A directement »). EF-04A.requiredUpstreamNodes
contient EF-04-LINEAGE et EXCLUT explicitement EF-03D — vérifié mécaniquement
par T02-01 (test 4). Le mécanisme d'upstream-gating générique de
l'OrchestrationEngine EST le lineage gate : EF-04A ne devient jamais READY
tant qu'EF-04-LINEAGE n'est pas SUCCESS (T02-11, T02-12). ReportPort applique
en plus, indépendamment, son propre gate interne côté MONO-01 (défense en
profondeur déjà vérifiée par MONO-01 T01-15).

## Dépendances latérales — où elles vivent dans le graphe

| Artefact | Nœud producteur | Consommé par |
|---|---|---|
| MissionDimensionSet | EF-PR-GEN-01 | EF-02A, EF-02D, EF-03A |
| MissionDocumentMapping | EF-PR-GEN-01 | TARGET_DOCUMENT_SET, EF-03B (architectural, jamais un paramètre direct) |
| HeuristicPolicy | EF-PR-GEN-01 | EF-02D |
| ExclusionRegistrySet | entrée externe (opérateur, via GovernancePort hors graphe séquentiel) | EF-02E |
| TargetDocumentSet | TARGET_DOCUMENT_SET | EF-03B, EF-04-LINEAGE, EF-04A |
| ExternalStageAdapter EF-02A/B/C | fourni par l'appelant (ctx.adapter) | EF-02A, EF-02B, EF-02C |
| ExternalExecutionPort | port transversal MONO-01 (classification, pas un nœud d'exécution) | consulté hors graphe pour documenter les dépendances externes |

ExclusionRegistrySet n'est volontairement PAS un nœud séquentiel du graphe
principal : conformément à la conception de GovernancePort (MONO-01), sa
construction est un acte explicite de l'opérateur, jamais une étape
automatique de la chaîne — il apparaît comme une entrée externe requise du
nœud EF-02E (T02-09).

## Dépendances externes — classification fine, jamais un booléen

Reprises telles quelles depuis ExternalExecutionPort (MONO-01) :

- EF-ORCH : LLM = INDIRECT_UPSTREAM sur EF-01B/EF-01C1, NONE sur EF-01C2 ; réseau OpenAlex/Crossref/PubMed = DIRECT_RUNTIME sur EF-01C2 uniquement.
- EF-02A/B/C : dépendance de nœud = externalStageAdapter.<méthode> (binding EXTERNAL_STAGE_ADAPTER, MONO-01 correction 2) — la classification LLM/Worker/réseau sous-jacente de ces outils HTML reste celle documentée par MONO-01, jamais aplatie.
- EF-02D : llm = DIRECT_RUNTIME (mode exact de la baseline, MONO-01 T01-10).
- EF-03B : llm = DIRECT_RUNTIME (obligatoire).
- EF-03C : llm optionnel selon executionContext.classificationWorkerCallFn (jamais requis par défaut dans ce graphe).

Aucune de ces dépendances n'a été simplifiée en un simple booléen
hasExternalDependency — chaque nœud déclare le nom exact de la dépendance
(llm, externalStageAdapter.discoverProfessionals, etc.), fail-closed sur
chacune indépendamment.
