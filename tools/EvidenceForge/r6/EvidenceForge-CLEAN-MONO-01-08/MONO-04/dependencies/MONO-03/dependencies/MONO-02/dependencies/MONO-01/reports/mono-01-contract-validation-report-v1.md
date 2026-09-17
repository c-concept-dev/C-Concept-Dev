# MONO-01 — Rapport de validation des contrats

## Méthode

Chaque port a été testé contre le **vrai code gelé** (copies bytewise dans
`dependencies/`, hashes vérifiés indépendamment contre les paquets canoniques
du kit de migration — voir `dependencies/PROVENANCE.md`), jamais contre des
doubles ou des simulations de comportement métier. Seules les dépendances
externes véritablement hors de portée de cet environnement (LLM, réseau
OpenAlex/Crossref/PubMed, Worker Cloudflare) sont injectées via des fonctions
fournies par l'appelant (`workerCallFn`) — exactement le point d'injection
déjà retenu par les modules gelés eux-mêmes, jamais un point d'injection
inventé par MONO-01.

Une chaîne complète et valide (`test/fixtures.js::buildValidChain`) a été
construite EN PASSANT PAR LES PORTS MONO-01 eux-mêmes : ReviewSchemaPort →
TargetDocumentPort → DocumentaryReviewPort → AggregationPort → StabilityPort →
LineagePort → ReportPort, jusqu'à un véritable `UnifiedReportSummary`
(`EF-04A-v1`) produit par le code gelé. Cette chaîne sert de fixture positive
pour la majorité des tests T01-*, et confirme que l'intégration bout en bout
fonctionne, pas seulement les cas d'erreur isolés.

## Correspondance des schemaVersion — CDC vs registre MONO-00

Vérifié ligne à ligne : chaque `schemaVersion` cité dans le CDC section 4
(EF-02A-v2, EF-02B-v2, EF-02C-v2, EF-02D-v2, EF-02D3-v4, EF-02D3-PANEL-v4,
EF-GOV-REG-v1, EF-02E-v2, EF-03-DOC-v1, EF-03A-v1, EF-03B-v1, EF-03C-v1,
EF-03D-v1, EF-04A-v1) correspond **exactement** aux `schemaVersionsProduced`
déclarés dans `mono-00-frozen-baseline-registry-v1.json`. **Aucun écart
trouvé** entre le CDC et le registre gelé sur ce point — le CDC a
manifestement été rédigé à partir du registre lui-même.

## Bugs réels trouvés et corrigés pendant la construction de MONO-01

7. **`ports/ef-orch-execution-port.js` + `index.js`** — 3e passe d'audit :
   malgré la correction de réhydratation (passe 2), le port créait encore
   lui-même `createInMemoryAsyncBackend()` en l'absence d'injection, et
   `createMono01()` ne transmettait aucune option au port — le chemin
   standard MONO-02 utilisait donc toujours, silencieusement, un backend
   RAM non partageable entre processus. **Corrigé** : suppression totale du
   fallback implicite ; `port.durableBackend` vaut `null` sans injection, et
   toute opération réelle (`start`/`resume`/`getStatus`/`getResult`) refuse
   explicitement (fail-closed) avant toute tentative. `createMono01(registry, options)`
   accepte `options.efOrchDurableBackend`, transmis tel quel, jamais
   construit ni possédé par `createMono01`. Vérifié par T01-21 (DURABLE-05
   réécrit) et **T01-22** (nouveau test d'intégration de la vraie factory
   `createMono01`, pas seulement du port isolé) — 10/10 PASS.

6. **`ports/ef-orch-execution-port.js`** — défaut architectural confirmé par
   audit indépendant : le port créait lui-même `createInMemoryAsyncBackend()`
   et utilisait une `Map` locale (`runs`) comme AUTORITÉ de `resume()`,
   rendant toute reprise impossible au-delà du processus courant — en
   contradiction directe avec l'invariant du module gelé
   `ef-orch-durable-run-output-store-v0.1.js` (un `putSuccessfulOutput()`
   réussi doit survivre à une perte immédiate du processus) et avec
   `persistenceExpectation` de MONO-00. **Corrigé** : le backend est
   désormais injecté explicitement (`options.durableBackend` au
   constructeur du port) ; `createInMemoryAsyncBackend()` reste disponible
   comme secours de test uniquement, jamais présenté comme une garantie de
   durabilité. `resume()`/`getStatus()`/`getResult()` réhydratent
   systématiquement l'état depuis `stateSnapshotStore.getRunState(runId)` —
   la `Map` locale ne subsiste que comme cache facultatif pour les
   exécuteurs intra-processus, jamais consultée pour l'état du run. Vérifié
   par T01-21 (11/11 PASS), avec un test explicite à **deux instances
   distinctes** du port partageant le même backend injecté, prouvant la
   reprise sans aucun état JS partagé.

5. **`ports/ef-orch-execution-port.js`** — pendant la construction
   d'`EFOrchExecutionPort` : (a) `protocolHash` était appliqué à tort à
   l'identité de checkpoint d'EF-01D lui-même (seul EF-01C2 doit le porter ;
   EF-01D ne l'utilise que pour RÉSOUDRE son entrée depuis EF-01C2, jamais
   pour sa propre identité de checkpoint) — corrigé. (b) `resume()`
   acceptait de tenter une reprise sur un run au statut natif `"failed"`,
   alors que la state machine gelée d'EF-ORCH (`ef-orch-state-machine-v0.1.js`)
   n'expose AUCUNE transition `failed→running` — `failRun` y est un état
   terminal. Corrigé : `resume()` refuse désormais explicitement une reprise
   depuis `"failed"`, sans jamais inventer une capacité que le code gelé ne
   possède pas. Les deux corrections vérifiées par T01-20 (EF-ORCH-02b, 06b).

1. **`lib/baseline-port.js`** — `createBaselinePort()` acceptait un objet de
   registre passé directement (sans passer par `loadRegistry()`) sans
   validation de `schema`/`schemaVersion`/`modules` non vide. Un registre
   invalide construit en mémoire pouvait donc démarrer MONO-01 sans erreur,
   en violation de la section 2 du CDC (« MONO-01 doit obligatoirement
   consommer... »). **Corrigé** : la validation (`assertValidRegistry`)
   s'applique désormais identiquement, que le registre vienne d'un chemin de
   fichier ou d'un objet déjà chargé. Détecté par T01-01 (tests 2 et 3,
   d'abord en échec, maintenant PASS).

2. **`test/fixtures.js`** (harnais de test, pas un port) — `buildValidChain`
   construisait un `MissionDimensionSet` avec `missionId: "m"` fixe pendant
   que le reste de la chaîne recevait le `missionId` réel de l'appelant
   (ex. `"mission-test"`), déclenchant systématiquement
   `MISSION_ID_MISMATCH`. **Corrigé** : le `missionId` du fixture suit
   désormais celui de l'appelant. Ce n'est pas un bug de MONO-01 — c'est la
   confirmation que le contrôle de cohérence de mission (section 8 du CDC)
   fonctionne : il a détecté une incohérence réelle dans les données de test
   dès la première exécution.

3. **`lib/port-factory.js`** — le contrôle de disponibilité des dépendances
   externes (`dependenciesAvailable[dep] === false`) n'était PAS fail-closed :
   une dépendance déclarée requise mais absente de `dependenciesAvailable`
   (ex. `{}`) passait le contrôle, alors que seule une déclaration explicite
   `{ dep: false }` bloquait. **Corrigé** (correction demandée) : le contrôle
   est désormais `dependenciesAvailable[dep] !== true` — une dépendance
   absente bloque exactement comme une dépendance explicitement à `false`.
   Seule une confirmation stricte `=== true` autorise l'appel. Vérifié par
   T01-09 (tests 1, 2, 2b, 3 sur la mécanique générique ; tests 4, 5, 6 sur
   DocumentaryReviewPort en conditions réelles).

4. **`ports/professional-pipeline-port.js`** — `discoverProfessionals`
   (EF-02A) acceptait un `MissionDimensionSet` absent : `stageDefinition()`/
   `invokeStage()` ne supportaient qu'un `requiredInputName` UNIQUE, alors
   qu'EF-02A exige DEUX entrées gelées (CorpusSnapshot ET MissionDimensionSet).
   `missionDimensionSet` était transmis à l'adaptateur mais jamais validé —
   ni sa présence, ni son schema, ni sa schemaVersion. **Corrigé** :
   `stageDefinition()`/`invokeStage()` acceptent désormais une LISTE de
   spécifications d'entrée (`{ name, contract }`), chacune requise et
   validée indépendamment. Le contrat de `missionDimensionSet`
   (`EvidenceForge.MissionDimensionSet` / `EF-PR-GEN-v1`) a été repris
   littéralement du registre MONO-00 (`schemaVersionsProduced` d'EF-PR-GEN-01),
   jamais inventé. Vérification complémentaire menée sur EF-02B et EF-02C :
   aucune autre entrée non déclarée n'y est transmise sans contrôle (une
   seule entrée gelée requise chacun, conforme à la chaîne CDC section 4.4).
   Détecté et corrigé avant tout gel — voir `test/test_t01_09b_ef02a_required_inputs.js`
   (10/10 PASS) et `test/test_t01_09_dependency_unavailable.js` (tests 7-9
   mis à jour pour fournir un MissionDimensionSet valide, condition
   désormais correctement exigée).

## Décision d'architecture tranchée — ProfessionalPipelinePort

EF-02A/B/C délèguent désormais systématiquement à un **ExternalStageAdapter**
injecté explicitement (`bindingType: EXTERNAL_STAGE_ADAPTER`,
`bindingStatus: BOUND`). Validé par T01-09 (tests 7 à 14) : absence
d'adaptateur → `DEPENDENCY_UNAVAILABLE` ; adaptateur conforme → `SUCCESS` avec
appel réel confirmé ; sortie de mauvais schema/version → `INVALID_MODULE_OUTPUT`
(`FAILED`) ; les 3 étapes restent strictement indépendantes (un adaptateur
partiel ne débloque que les méthodes qu'il implémente réellement).

## Comportements gelés confirmés préservés à la frontière MONO-01

- **ReviewSchema mission-owned** : ReviewSchemaPort ne prend jamais la
  composition du panel en entrée pour dériver le schéma — seul `twinSet` sert
  à la validation interne (`assertTwinSet`), jamais à influencer
  `reviewTargets`/`dimensions`.
- **Séparation targetEvidenceRefs / twinBasisWorkRefs** : jamais recalculée
  par DocumentaryReviewPort, transportée telle quelle depuis le module gelé
  (confirmé par T01-12, deepEqual + identité de référence).
- **Fail-closed EF-04** : ReportPort n'appelle jamais `buildUnifiedReportSummary`
  sans un PASS explicite de LineagePort (T01-15, 10/10 tests, y compris la
  contre-épreuve positive).
- **Anti-hallucination EF-02E** : une référence citée absente du corpus réel
  produit un statut non-SUCCESS côté port, jamais une réparation par
  similarité (T01-13, avec contre-épreuve positive confirmant que le chemin
  nominal fonctionne bien quand la référence est correcte).
- **Gouvernance EF-02E** : même un `ExclusionRegistrySet` vide doit être
  explicitement construit — jamais un défaut implicite (T01-14).
- **Sync/async fidèle au code gelé** : EF-03D (`buildStabilityContradictionAnalysis`)
  est confirmé SYNC dans le code source réel (pas de mot-clé `async`),
  exactement l'exemple donné par la section 10 du CDC ; une Promise brute
  n'est jamais acceptée comme sortie valide sans `await` (T01-11), non-régression
  directe du défaut historique d'EF-ORCH Stage Adapter.

## Limites de cette validation

- Les dépendances LLM (EF-02D, EF-03B, EF-03C) ont été exercées avec des
  fonctions `workerCallFn` de test déterministes, reproduisant fidèlement le
  format de réponse attendu par les modules gelés (même technique que les
  tests propres de ces lots) — jamais un appel réel à un LLM depuis cet
  environnement.
- ProfessionalPipelinePort a été validé avec des ExternalStageAdapter de test
  (déterministes, en mémoire) — jamais un appel réel aux outils HTML EF-02A/B/C
  ni au Worker Cloudflare depuis cet environnement. Le contrat d'adaptateur
  (`contracts/external-stage-adapter-v1.json`) est vérifié structurellement ;
  son implémentation réelle (automatisation navigateur ou autre mécanisme)
  reste à construire hors de ce lot, par un adaptateur conforme au contrat.
