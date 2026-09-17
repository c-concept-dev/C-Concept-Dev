# EvidenceForge - MONO-02 - Orchestration Graph and State Machine

Decide QUAND appeler, QUOI appeler, DANS QUEL ORDRE, SOUS QUELLES
PRECONDITIONS, AVEC QUEL ETAT TECHNIQUE - a partir de la baseline gelee
MONO-00 et des ports geles MONO-01. Ne redefinit jamais COMMENT appeler un
module (deja MONO-01) ni le contenu metier (deja les lots geles).

## Contenu

```
MONO-02/
|-- README.md                          (ce fichier)
|-- CDC-TRACE.md                       (tracabilite CDC -> implementation)
|-- package.json
|-- index.js                           (point d'entree : createOrchestrationEngine)
|-- graph/
|   `-- mono-02-orchestration-graph-v1.json   (14 noeuds, machine-readable)
|-- contracts/                         (3 contrats JSON documentaires)
|-- lib/
|   |-- orchestration-errors.js        (4 codes d'erreur d'orchestration)
|   |-- state-machine.js               (7 etats, 9 transitions)
|   |-- node-runners.js                (1 executeur par noeud, appelle EXCLUSIVEMENT mono01.<port>.*)
|   `-- orchestration-engine.js        (OrchestrationEngine)
|-- dependencies/
|   |-- PROVENANCE.md
|   `-- MONO-01/                       (copie bytewise integrale de MONO-01.x, 106/106 verifie, frontiere d.injection stricte)
|-- test/                              (22 fichiers T02-01 a T02-22 + fixtures.js + run-all.js)
|-- reports/                           (graph-coverage, state-machine, static-search, test-report)
`-- manifest/
    `-- SHA256SUMS
```

## Utilisation

```js
const { createOrchestrationEngine, DEFAULT_GRAPH_PATH } = require("./index.js");
const { createMono01 } = require("./dependencies/MONO-01/index.js");

const mono01 = createMono01("./dependencies/MONO-01/registry/mono-00-frozen-baseline-registry-v1.json");
const engine = createOrchestrationEngine(DEFAULT_GRAPH_PATH, mono01, {
  missionId, missionQuestion,
  externalInputs: { corpusSnapshot, missionDimensionSet, missionDocumentMapping, heuristicPolicy, exclusionRegistry, documents, reviewTargets },
  adapter, // ExternalStageAdapter pour EF-02A/B/C
  dependenciesAvailable: { llm: true },
  workerCallFn,
});

const ready = engine.computeReadyNodes();
for (const nodeId of ready) {
  const result = await engine.runNode(nodeId);
}
```

## Verification independante

```bash
npm test
```

Execute les 24 fichiers T02-* (324 tests au total). Aucune dependance npm
externe requise (Node pur).

## Révision post-audit — EF-ORCH-SUBSYSTEM et usableRecords

Le graphe commence désormais réellement par un `RunContract` (nœud
`EF-ORCH-SUBSYSTEM`, appelant `EFOrchExecutionPort` puis `CorpusSnapshotPort`)
— plus un `CorpusSnapshot` externe supposé déjà produit. EF-ORCH reste un
sous-système orchestré autonome gelé, jamais démantelé en nœuds EF-01A..F.
`lib/node-runners.js` n'implémente plus localement le prédicat
`usableRecords` : il appelle exclusivement
`mono01.eligibilityPanelPort.selectUsableRecords(...)` (MONO-01.x), gardé
par un test de non-régression statique dédié. Voir
`reports/mono-02-graph-coverage-report-v1.md`.

## Révision post-audit (2e passe) — durabilité cross-process EF-ORCH

`EFOrchExecutionPort` (MONO-01.x) a été corrigé pour ne plus dépendre d'une
`Map` locale ni d'un backend mémoire imposé : le backend est injectable
explicitement, et `resume()`/`getStatus()`/`getResult()` réhydratent
systématiquement l'état depuis le backend durable. MONO-02 ne change rien à
sa propre architecture pour cette correction — `EF-ORCH-SUBSYSTEM` continue
d'appeler `EFOrchExecutionPort.start()`/`resume()` exactement comme avant ;
il bénéficie de la durabilité corrigée de MONO-01.x sans aucune modification
côté MONO-02.

## Révision post-audit (3e passe) — frontière d'injection stricte

`createMono01()` construisait `EFOrchExecutionPort` sans jamais transmettre
d'option, retombant systématiquement sur un backend mémoire implicite côté
MONO-01. Corrigé : `createMono01(registry, { efOrchDurableBackend })` reçoit
désormais explicitement le backend, `test/fixtures.js::buildMono01()` en
construit un explicitement à chaque appel (jamais de fallback implicite
côté MONO-01 lui-même, qui refuse fail-closed sans injection). Nouveau test
`test/test_t02_24_explicit_eforch_backend_injection.js` (7/7 PASS) confirmant
que le chemin `durableBackend → createMono01(...) → EFOrchExecutionPort →
EF-ORCH-SUBSYSTEM` fonctionne réellement à travers l'`OrchestrationEngine`
complet, y compris entre deux instances `createMono01()` distinctes
partageant explicitement le même backend.

MONO-02 ne construit toujours aucune persistance finale (IndexedDB ou
équivalent) — cette responsabilité reste entièrement celle d'un futur
MONO-03. MONO-01/MONO-02 se limitent à définir la frontière d'injection.

## Decision d'architecture heritee de MONO-01

ProfessionalPipelinePort (EF-02A/B/C) delegue a un ExternalStageAdapter
injecte explicitement par l'appelant (`ctx.adapter`) - MONO-02 ne pilote
jamais les outils HTML lui-meme, ne les modifie jamais, ne les
reimplemente jamais. Voir dependencies/MONO-01/contracts/external-stage-adapter-v1.json.

## Limites connues heritees ou introduites dans ce lot

Voir reports/mono-02-test-report-v1.md et le rapport final livre a
l'operateur - notamment : (1) un angle mort de validation booleenne dans
MissionPort (MONO-01, gele, non modifiable ici) compense explicitement dans
lib/node-runners.js ; (2) la selection "usableRecords" pour
EligibilityPanelPort.buildCoverageMatrix, non exposee comme methode de port
par MONO-01, reproduite ici a l'identique du predicat gele plutot que
devinee.
