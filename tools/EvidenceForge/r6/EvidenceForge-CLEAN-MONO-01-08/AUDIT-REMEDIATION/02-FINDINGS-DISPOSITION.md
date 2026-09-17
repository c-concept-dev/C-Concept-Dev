# 02 — Findings Disposition

Deux jeux de findings existent dans les documents d'audit fournis, avec
des numérotations INDÉPENDANTES l'une de l'autre :

- **Audit condensé** (`d7f8a9a1-...md`) : F-01 → F-18, portée MONO-00→08
  complète.
- **Audit indépendant élargi** (`bae13a73-...zip`,
  `11-MONO-08-AUDIT.md` + `19-FINDINGS.md`) : F-01 → F-09, portée
  MONO-08 (F-01→F-07) + transversal (F-08→F-09).

Le mandat de cette mission cite les findings MONO-08 selon la
numérotation de l'AUDIT INDÉPENDANT (F-01 observabilité, F-02/F-03
épistémique, F-04 gouvernance, F-06 fixture) — c'est donc la
numérotation retenue comme fil conducteur ci-dessous, avec la
correspondance vers l'audit condensé indiquée explicitement pour chaque
entrée.

Classification en deux temps, jamais fusionnée : (1) statut de
CONFIRMATION (le défaut existe-t-il réellement, vérifié indépendamment,
jamais supposé sur la seule foi de l'audit) ; (2) statut de
RÉSOLUTION (jamais « corrigé » simplement parce que reclassifié).

## Findings MONO-08 (numérotation audit indépendant)

### F-01 — perte de `lastError`/`errorCode` dans le reporting Real Smoke
*(≡ audit condensé F-18)*

- **Confirmation** : CONFIRMED — vérifié par lecture directe de
  `bin/run-real-smoke.js` (v0.6 avant remédiation) : la trace ne
  conservait que `nodeId:state`, jamais un appel à
  `operatorApi.getNode()`.
- **Résolution** : **PATCHED**. `describeNodeFailure()` ajouté
  (`bin/run-real-smoke.js`), appelé sur le premier nœud non-SUCCESS après
  `driveRun()`. Restitue `nodeId/state/attemptCount/lastError/errorCode`
  toujours, plus `nativeStatus/currentStage/completedStages/
  awaitingStage/gate/lastResultKind` uniquement quand
  `lastError.details` les porte réellement (jamais une valeur devinée).
  Racine confirmée résider dans la frontière MONO-02/MONO-01 (le contrat
  `diagnostics.error.details` de `node-runners.js` ne propage pas
  `completedStages`/`lastResult` pour le cas BLOCKED-en-pause) — jamais
  modifié (lot gelé), simplement restitué fidèlement.
- **Tests** : `test/test_t08_observability.js`, 10/10 (T-NEW-04, formes
  reproduites depuis le code source réel de `operator-api.js` et
  `node-runners.js`, jamais inventées).

### F-02 — `ScreeningArtifact.auditDecisions[].acteur:"human"` fabriqué
*(BLOCKER ; ≡ audit condensé F-16)*

- **Confirmation** : CONFIRMED — `lib/eforch-artifacts.js` ligne 118
  (avant remédiation) générait `acteur: "human"` inconditionnellement,
  identique en mode REAL et en test LOCAL_CONTROLLED.
- **Résolution** : **PATCHED**. `buildScreeningArtifactForMission()`
  accepte désormais `provenance.mode`. Mode REAL sans
  `provenance.auditDecisions` réel (acteur/justification/date/decision
  effectivement fournis par l'appelant) → lève
  `OPERATOR_INPUT_REQUIRED` (fail-closed explicite, `err.code`). Mode
  LOCAL_CONTROLLED (défaut) conserve le comportement fixture existant
  mais étiquette chaque décision `evidenceProvenance:
  "SYNTHETIC_FIXTURE"`. `acteur:"human"` reste littéralement la valeur
  utilisée dans les deux cas — c'est une contrainte du contrat GELÉ
  MONO-01 (`ef-orch-ef01d-screening-artifact-v0.1.js::
  assertScreeningArtifactComplete` exige exactement cette chaîne, sans
  échappatoire `"system_test"` contrairement à EF-01E) : le défaut
  n'était donc jamais la valeur elle-même, mais l'ABSENCE de toute
  exigence qu'une décision humaine réelle l'accompagne en mode REAL.
- **Tests** : `test/test_t08_epistemic_integrity.js` (T-NEW-05/08),
  4 assertions dédiées + `test_t08_eforch.js` (26/26, non-régression
  LOCAL_CONTROLLED).

### F-03 — `ResolverTrace`/`plannerRuns` avec hashes impossibles
*(≡ audit condensé F-15)*

- **Confirmation** : CONFIRMED — `"1".repeat(64)`/`"2".repeat(64)`/
  `"3".repeat(64)`/`"4".repeat(64)` présentés comme `inputHash`/
  `rawResponseHash` d'un appel `provider:"anthropic"` réel.
- **Résolution** : **PATCHED**. `buildResolverTraceForMission()` et
  `buildSearchProtocolForMission()` acceptent `provenance.mode`. Mode
  REAL exige `resolverRuns[]`/`plannerRun` réels (provider/model/
  promptVersion/date/inputHash/rawResponseHash SHA-256 valides,
  fournis par l'appelant) → sinon `OPERATOR_INPUT_REQUIRED`. Mode
  LOCAL_CONTROLLED conserve les valeurs fixture existantes, étiquetées
  `evidenceProvenance: "SYNTHETIC_FIXTURE"`.
- **Tests** : `test_t08_epistemic_integrity.js` (T-NEW-06/07), 4
  assertions dédiées.

### F-04 — le CDC ne statue jamais sur les exigences d'un Real Smoke GELABLE

- **Confirmation** : CONFIRMED — aucun document normatif MONO-08 ne
  précisait, avant cette mission, qu'un stage REAL revendiquant une
  provenance LLM/humaine doit recevoir une provenance réelle ou échouer
  fermé.
- **Résolution** : **PATCHED** — décision APPLIQUÉE en code (pas
  seulement documentée) : `mode: "REAL"` fail-closed sur
  `OPERATOR_INPUT_REQUIRED` (F-02/F-03 ci-dessus), terminologie
  `REAL_LLM_CALL`/`REAL_HUMAN_ACTION`/`SYNTHETIC_FIXTURE` introduite
  dans le code produit (`evidenceProvenance`). Documentation de la
  décision : `06-EPISTEMIC-REMEDIATION.md`.

### F-05 (numérotation indépendante non explicitement numérotée dans
`11-MONO-08-AUDIT.md`, référencée ici par sa place dans la liste) —
absence de preuve de persistance CROSS_PROCESS
*(≡ audit condensé F-12, sévérité BLOCKER dans l'audit condensé)*

- **Confirmation** : CONFIRMED — `test/e2e/test_t07_e2e_resume.js`
  (MONO-07) construit `envB` en réutilisant `envA.mono01`/`envA.mono03`
  (mêmes instances, mêmes `Map` en mémoire) : preuve CROSS_INSTANCE,
  jamais CROSS_PROCESS, malgré une terminologie de rapport
  surqualifiée.
- **Résolution** : **PATCHED** — nouvelle preuve DISTINCTE ajoutée
  (`test/test_t08_cross_process.js`), le test historique MONO-07
  N'A JAMAIS été modifié (préservé tel quel — voir
  `05-PERSISTENCE-REMEDIATION.md` pour la reclassification
  documentaire). `CROSS_PROCESS = PASS`, deux processus Node réellement
  distincts, backend `FILE_DURABLE`.

### F-06 — fixture de mission modifiée v0.5→v0.6 sans déclaration honnête

- **Confirmation** : CONFIRMED — `readyForExecution` est passé de
  `false` (documenté explicitement dans `CDC-TRACE.md` jusqu'à v0.5,
  « honnêtement ») à `true` dans la copie de travail actuelle, sans
  qu'aucune section de version ne documente ce changement, et alors que
  `files-modified-created.txt` classait ce fichier « copié tel quel
  depuis v0.5 ».
- **Résolution** : **PATCHED** — déclaration corrigée en place (jamais
  supprimée en silence, voir historique git) ; contenu réel du fixture
  préservé intégralement. Détail : `06-EPISTEMIC-REMEDIATION.md`.
- **Tests** : `test/test_t08_release_governance.js` (T-NEW-10), 4/4,
  garde de non-régression.

### F-07 — existence non prouvée du Real Smoke nominal historique

- **Confirmation** : CONFIRMED comme LIMITATION DE PREUVE (jamais comme
  absence de run) — les archives fournies à cet audit ne contiennent pas
  l'artefact primaire du run Mac décrit par l'opérateur (baseline=PASS,
  preflight=READY, mission-gate=PASS, connectivity=PASS, puis
  full-pipeline=FAIL au premier nœud EF-ORCH-SUBSYSTEM=BLOCKED,
  persistence-restart/ui-smoke/secret-scan=NOT_RUN).
- **Résolution** : **DOCUMENTED_LIMITATION** — jamais transformé en
  `NOT_RUN` (le run a eu lieu), jamais fabriqué (l'artefact primaire
  manquant n'est jamais reconstitué). `REAL_SMOKE_HISTORIQUE = FAIL`
  reste le statut projet. Détail : `10-REAL-SMOKE-READINESS.md`.

## Findings transversaux (numérotation audit indépendant, `19-FINDINGS.md`)

### F-08 — absence de garantie de cohérence de révision entre paquets MONO livrés séparément

- **Confirmation** : CONFIRMED (constat historique du bundle `Mono.zip`
  contenant des révisions concurrentes non désambiguïsées).
- **Résolution** : **PATCHED** au niveau de CE paquet — canonicalisation
  unique par contenu réel (`01-CANONICAL-SOURCE-SELECTION.md`),
  `RELEASE-MANIFEST.md` nommant explicitement la révision/source/statut
  de chaque lot, aucune archive concurrente incluse dans
  `EvidenceForge-CLEAN-MONO-01-08/`.

### F-09 — `createOperatorBackends()` (MONO-05) ne permet aucune injection de backend alternatif
*(≡ audit condensé F-07/F-08)*

- **Confirmation** : CONFIRMED — `app/server/config.js::
  createOperatorBackends()` construit `EFOrchDurableBackend.
  createInMemoryAsyncBackend()`/`createInMemoryBackend()` en dur, sans
  paramètre d'injection.
- **Résolution** : **MITIGATED_BY_COMPOSITION** — MONO-05 n'a PAS été
  modifié (lot gelé, RÈGLE CARDINALE). `lib/file-durable-backend.js`
  (MONO-08) implémente les mêmes contrats abstraits déjà GELÉS et
  documentés comme frontière d'injection par MONO-01/MONO-03 eux-mêmes
  (`ef-orch-durable-backend-v0.1.js`, `persistence-backend.js`), injecté
  directement via `createMono01({efOrchDurableBackend})`/
  `createMono03({persistenceBackend})` — Option A du mandat, jamais
  l'Option B (paramètre additif dans `createOperatorBackends()`, qui
  aurait nécessité un `CONTRACT_IMPACT` sur MONO-05).

## Findings de l'audit condensé sans correspondance directe dans l'audit
indépendant (MONO-00→06, hors périmètre de modification MONO-08)

| # | Résumé | Sévérité | Disposition |
|---|---|---|---|
| F-05 (condensé) | MONO-03 ne fournit aucune implémentation durable de production | NON_BUG_LIMITATION | **NO_CHANGE_REQUIRED** — comportement documenté et voulu par MONO-03 lui-même ; résolu côté consommateur par F-09 ci-dessus. |
| F-06 (condensé) | MONO-04 : cache d'idempotence/circuit breaker in-process uniquement | NON_BUG_LIMITATION | **NO_CHANGE_REQUIRED** — contrat déjà documenté comme in-process par MONO-04 lui-même ; non sollicité par la preuve CROSS_PROCESS de cette mission (adaptateur LOCAL_CONTROLLED, mono04 jamais réellement appelé). |
| F-08 (condensé) | `run-registry.js::buildContextFromState()` ne reconstruit pas `adapter`/`workerCallFn`/`connectorRunners` à la réhydratation | BLOCKER (pour l'usage générique MONO-05) | **DOCUMENTED_LIMITATION** pour MONO-05 lui-même (frozen, hors périmètre) ; **NO_CHANGE_REQUIRED côté MONO-08** — `rehydrateRealMissionRun()` (MONO-08) ne passe jamais par ce chemin : il reconstruit lui-même `connectorRunners` à neuf à chaque réhydratation (déjà correct avant cette mission, revérifié par la preuve CROSS_PROCESS). |
| F-09 (condensé) | `getGraph()`/`getNode()` avalent les erreurs de réhydratation (`.catch(() => null)`) | MAJOR | **DOCUMENTED_LIMITATION** pour MONO-05 (frozen, hors périmètre) ; mitigé côté MONO-08 par F-01 (le rapport Real Smoke expose désormais `lastError`/`errorCode` explicitement plutôt que de dépendre implicitement de `getGraph()`). |
| F-10 (condensé) | reconstruction de `connectorRunners` limitée à OpenAlex dans `operator-api.js` | MAJOR (généricité) | **NO_CHANGE_REQUIRED côté MONO-08** — MONO-08 construit ses propres `connectorRunners`, jamais via ce chemin MONO-05 ; limitation MONO-05 documentée, hors périmètre. |
| F-11 (condensé) | registre MONO-06 obsolète dans certaines archives (721/65 au lieu de 785/119) | INFO/gouvernance | **REFUTED pour le kit canonique retenu** — le kit HANDOFF utilisé porte le registre à jour (785/119), vérifié par rejeu réel du gate. Confirmé comme réel uniquement pour `Mono.zip`, écarté (voir `01-CANONICAL-SOURCE-SELECTION.md`). |
| F-13 (condensé) | ambiguïté épistémique du mot « réel » dans la documentation MONO-07 | MAJOR | **PARTIALLY_CONFIRMED, PARTIALLY_ADDRESSED** — terminologie `REAL_LLM_CALL`/`REAL_HUMAN_ACTION`/`SYNTHETIC_FIXTURE`/`CROSS_INSTANCE`/`CROSS_PROCESS` introduite dans le CODE produit par cette mission (MONO-08) ; la prose narrative de MONO-07 elle-même n'a pas été réécrite (RÈGLE CARDINALE — lot gelé, aucun changement fonctionnel requis pour son propre fonctionnement) ; un commentaire additif de clarification terminologique a été envisagé mais non requis pour la validité technique — voir `05-PERSISTENCE-REMEDIATION.md`. |
| F-14 (condensé) | `test_t08_runner_orchestration.js` obsolète par rapport à sa fixture | MAJOR, BUG_TEST | **PATCHED** — classifié **BUG_TEST** (jamais BUG_FIXTURE : la mission a légitimement progressé vers `readyForExecution=true`) ; test réécrit pour vérifier le comportement fail-closed réel (`missionGateStatus()`, `extractDocumentPayloads()`) sur des missions synthétiques construites dans le test, plutôt que d'asserter un état figé du fixture partagé. |
| F-17 (condensé) | artefacts EF-01D/EF-01E préconstruits avant le pipeline, présentés comme des résultats réels | BLOCKER | **RESOLVED comme corollaire de F-02/F-03** — la construction PRÉALABLE de ces artefacts est architecturalement correcte et voulue (l'appel LLM/la décision humaine réels, s'ils existent, ont lieu EN AMONT du stage EF-ORCH orchestré, jamais pendant) ; le défaut était l'absence de distinction REAL/SYNTHETIC sur leur CONTENU, désormais corrigée par F-02/F-03. |

## Règle de non-fabrication appliquée à ce document

Aucun finding ci-dessus n'est déclaré « corrigé » sur la seule base d'une
reclassification. Chaque `PATCHED`/`MITIGATED_BY_COMPOSITION` cite le
fichier modifié et le test qui le prouve, listés intégralement dans
`03-FILES-CHANGED.md` et `08-TEST-RESULTS.md`.
