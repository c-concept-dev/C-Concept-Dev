# EvidenceForge — MONO-01 — Integration Contracts & Ports

Couche d'intégration minimale (ports + contrats) préparant l'assemblage du
monolithe orchestrateur à partir de la baseline gelée MONO-00. Aucun code
orchestrateur, aucune UI finale, aucune persistance finale, aucun lot gelé
modifié (CDC MONO-01 section 0).

## Contenu

```
MONO-01/
├── README.md                          (ce fichier)
├── CDC-TRACE.md                       (traçabilité CDC -> implémentation)
├── package.json
├── index.js                           (point d'entrée : createMono01(registryPath))
├── contracts/                         (4 contrats JSON documentaires)
├── lib/                               (errors, baseline-port, port-factory — mécanique commune)
├── ports/                             (15 ports)
├── dependencies/                      (copies bytewise du code gelé, hashes vérifiés — PROVENANCE.md)
├── registry/
│   ├── mono-00-frozen-baseline-registry-v1.json  (copie du registre MONO-00, autorité de compatibilité)
│   └── mono-01-port-registry-v1.json             (registre de ports MONO-01, machine-readable)
├── test/                              (21 fichiers T01-01 à T01-20 + T01-09b + fixtures.js/fixtures-eforch.js + run-all.js)
├── reports/                           (port-coverage, contract-validation, static-search)
└── manifest/
    └── SHA256SUMS
```

## Utilisation

```js
const { createMono01 } = require("./index.js");
const mono01 = createMono01("./registry/mono-00-frozen-baseline-registry-v1.json");

const result = await mono01.reviewSchemaPort.buildReviewSchema(twinSet, dimensionSet, reviewTargets, missionQuestion, { missionId });
// result.status === "SUCCESS" | "FAILED" | "BLOCKED"
// result.output === la sortie EXACTE du module gelé si SUCCESS
```

## Vérification indépendante

```bash
npm test
```

Exécute les 24 fichiers T01-* (172 tests au total) plus les fixtures partagées.
Aucune dépendance npm externe requise (Node pur, aucun `npm ci` nécessaire).

## Frontière d'injection — MONO-01/MONO-02 vs MONO-03

**MONO-01 et MONO-02 définissent la frontière d'injection du backend
durable EF-ORCH — ils ne construisent JAMAIS l'implémentation persistante
de production** (IndexedDB ou équivalent). `createEFOrchExecutionPort()`
refuse explicitement (fail-closed) toute opération réelle sans
`options.durableBackend` injecté ; `createMono01(registry, { efOrchDurableBackend })`
se contente de transmettre ce backend, jamais de le construire ni d'en
devenir propriétaire. La fourniture d'une implémentation persistante de
production appartient à un futur **MONO-03**.

## Révision MONO-01.x — EFOrchExecutionPort (post-audit)

Décision d'architecture tranchée : EF-ORCH est traité comme un sous-système
orchestré autonome gelé, jamais démantelé en nœuds individuels EF-01A..F.
`EFOrchExecutionPort` expose `start()`/`resume()`/`getStatus()`/`getResult()`,
composant exclusivement les exports gelés déjà séparés d'EF-ORCH v0.1
(RunContract, StateMachine, StageAdapter, ExecuteStage, DurableStageRunner,
StageInputResolver, les 7 factories `create*Executor`, les stores durables).
EF-ORCH conserve seul sa state machine interne et son mécanisme
checkpoint/resume. Testé bout en bout jusqu'à un vrai `CorpusSnapshot`,
accepté par `CorpusSnapshotPort`. Voir `contracts/ef-orch-execution-port-v1.json`.

## Révision MONO-01.x — usableRecords (validé)

`EligibilityPanelPort.selectUsableRecords(eligibilityRelevanceSet)` appelle
directement le module gelé, zéro nouvelle logique — 7/7 PASS.

## Décision d'architecture — ProfessionalPipelinePort (EF-02A/B/C)

**Tranchée** (correction post-audit) : EF-02A/B/C restent des outils HTML
gelés, jamais pilotés ni réimplémentés par MONO-01. L'invocation délègue
systématiquement à un **ExternalStageAdapter** injecté explicitement par
l'appelant (`opts.adapter`, voir `contracts/external-stage-adapter-v1.json`).
`bindingStatus = BOUND`, `bindingType = EXTERNAL_STAGE_ADAPTER`. L'absence
d'adaptateur pour une étape produit `DEPENDENCY_UNAVAILABLE`, jamais un
comportement par défaut. Voir `reports/mono-01-port-coverage-report-v1.md`.
