# MONO-05 — Traçabilité CDC

| Section CDC | Exigence | Implémentation | Statut |
|---|---|---|---|
| 1-2 | UI générique = présentation+commande, jamais de logique métier | `app/client/app.js` ne fait que rendre/déclencher, toute décision vient de `operator-api.js`→MONO-01→04 | OK |
| 3 | Inspection avant code | orchestration-engine.js/run-store.js/graphe réel inspectés avant écriture | OK |
| 4 | Architecture navigateur→OperatorApi→MONO-01→04 | `http-server.js` seule frontière réseau | OK |
| 5 | Aucun secret côté client | `getDependencies()` n'expose que configured/available (booléens), jamais une valeur | OK, T05-17/18/19/20 (Playwright réel) |
| 6.A-I | Écrans (dashboard/création/graphe/nœud/EF-ORCH/dépendances/artefacts/lineage/rapport) | `app/client/app.js` | OK |
| 7 | Actions revalidées serveur | `runNode()`/`resumeNode()`/`retryNode()` revalident réellement via `engine.runNode()` (canRun interne) | OK, T05-08/09 |
| 8 | Polling contrôlé | `maybeStartPolling()`, 3s pendant RUNNING, arrêt sur état terminal | OK |
| 9 | RUN_LOCKED affiché, pas de retry sauvage | erreurs propagées telles quelles (code+message) | OK |
| 10 | Code machine + message lisible | `apiError()`/`sendError()` — jamais l'un sans l'autre | OK, T05-12/34 |
| 11-12 | Accessibilité/responsive | focus visible, Tab réel, 3 tailles testées avec captures | OK, T05-29/30/31/32/33 |
| 13-14 | Généricité, vocabulaire épistémique correct | recherche statique complète | OK |
| 15 | Pas de smart repair | aucune notion trouvée | OK |
| 16 | OperatorApi | `operator-api.js` (13 opérations) | OK |
| 17 | Validation serveur systématique | chaque action revalide, jamais une confiance dans le clic UI | OK |
| 18 | Security headers / XSS | CSP/X-Content-Type-Options/Referrer-Policy/X-Frame-Options + zéro `innerHTML=` | OK, T05-28 (Playwright réel) |
| 19 | Logging UI propre | aucun `console.log` de payload/secret dans le client | OK |
| 20-21 | Tests réels avec navigateur | Playwright + Chromium réel, jamais un mock DOM | OK |
| 22-27 | Duplicate-click/XSS/secret/lineage/refresh/restart | tous testés réellement (voir README) | OK |
| 28 | Pas de mock trompeur | tests d'intégration traversent le VRAI OperatorApi→MONO-02→03, et MONO-04 pour l'externe (vrais serveurs HTTP locaux) | OK |
| 34 | Non-régression | voir ci-dessous | OK |
| 35 | Recherche statique | aucune occurrence fonctionnelle interdite | OK |

## Bugs réels trouvés pendant la construction

1. **`getGraph`/`getNode`** lisaient l'état `NOT_STARTED` persisté brut de
   MONO-03 au lieu de consulter le moteur MONO-02 vivant — un nœud sans
   dépendance amont (`EF-ORCH-SUBSYSTEM`) restait affiché `NOT_STARTED` au
   lieu de `READY` juste après création du run. Découvert par
   `test_t05_integration_core.js` (T05-07). Corrigé : `state` est désormais
   lu depuis `engine.getNodeState()` (réhydraté si besoin depuis MONO-03),
   les autres champs (attemptCount, lastError, retryPolicy...) restant lus
   depuis MONO-03.

2. **Bug de concurrence réel, le plus significatif** : lorsque deux requêtes
   concurrentes visaient le même nœud, la seconde — rejetée en interne par
   `engine.runNode()` (`NODE_NOT_READY`, une collision d'orchestration,
   jamais une exécution du module métier) — était néanmoins transmise à
   `persistOutcome()` puis persistée dans MONO-03 via `recordNodeFailure()`
   comme un VRAI échec métier du nœud, corrompant l'état du run avec un
   `lastError` fictif. Découvert par `test_t05_restart_concurrency.js`
   (T05-39, en observant que r2 recevait un statut 200 avec un
   `lastError: NODE_NOT_READY` stocké comme faisant partie de l'état
   persisté). Corrigé : `runNode()` distingue désormais un rejet
   d'orchestration (`outcome.result === undefined`, jamais persisté, juste
   propagé comme erreur HTTP 409) d'un véritable résultat d'exécution
   (`outcome.result` présent, seul cas persisté). Confirmé par
   `test_t05_browser_core.js` (T05-39d, double-clic natif dans un vrai
   navigateur, `attemptCount` reste à 1).

3. Deux bugs de TEST (jamais de module) : un appel `startOperatorServer()`
   sans enveloppe `{ providerConfigs }` dans un test (le provider restait
   silencieusement non configuré, masquant le vrai comportement à tester),
   et une comparaison `.sort()` incorrecte sur des codes HTTP numériques
   (tri lexicographique implicite). Corrigés dans les fichiers de test
   eux-mêmes, aucun changement de module.

4. **Défaut de reproductibilité du package (2e audit indépendant, jamais un
   bug fonctionnel)** : `test/browser/test_t05_browser_core.js` importait
   `playwright` sans que ce paquet ne soit jamais déclaré dans
   `package.json`, et aucun `package-lock.json` n'existait — une extraction
   ZIP strictement neuve suivie de `npm ci` échouait immédiatement
   (`Cannot find module 'playwright'`), le package dépendant implicitement
   d'une installation globale de l'environnement d'origine. **Corrigé** :
   `playwright` déclaré en `devDependencies` à la version exacte réellement
   testée (`1.56.0`, jamais `latest`), `package-lock.json` généré et inclus
   dans le manifeste. Ajout de `test/package-check.js`, qui vérifie
   séparément la résolution du module (`require.resolve`) et la
   disponibilité réelle du binaire Chromium (`chromium.launch()`) avec un
   message actionnable (`npx playwright install chromium`) — jamais une
   prétention silencieuse à l'autosuffisance : l'environnement de
   construction expose `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, une
   configuration propre à ce sandbox, jamais garantie ailleurs — documentée
   explicitement plutôt que masquée. `test/run-all.js` exécute ce contrôle
   avant toute tentative des tests navigateur et les rapporte honnêtement
   "NON EXÉCUTÉS" (jamais comptés comme PASS) si Chromium est indisponible.

Les quatre bugs/défauts ont été trouvés par des vérifications contre du VRAI
environnement (serveur HTTP local réel, VRAI ProfessionalPipelinePort gelé,
vraie extraction ZIP + `npm ci` réel) — jamais par une supposition.

## Non-régression

- MONO-00 : 27/27.
- MONO-01.x : 172/172 (rejouée depuis MONO-05, T05-41).
- MONO-02-R1 : 334/334 (rejouée depuis MONO-05, T05-42).
- MONO-03-R1 : 64/64 (rejouée depuis MONO-05, T05-43).
- MONO-04-R1 : 69/69 (rejouée depuis MONO-05, T05-44).
- 7 lots gelés historiques : 1223/1223.

## Rebaseline corrective R2 — deux régressions démontrées et corrigées

**Contexte** : un run E2E réel construit dans le cadre de MONO-07, contre la
baseline R1, a révélé deux régressions réelles et indépendantes dans
MONO-05-R1. Classification officielle de la gouvernance :
`MONO05-R2-REG-01` (lineage) et `MONO05-R2-REG-02` (réhydratation
multi-nœuds). Les deux sont corrigées dans cette même version R2 (décision
de gouvernance : pas de R3 séparée, MONO-05 était déjà rouvert et non gelé).

### REG-01 — LINEAGE_PERSISTENCE_AND_STALENESS

**Cause** : `OperatorApi.getLineage()`/`getReport()` lisaient
`RunState.lineageStatus`, mais aucun chemin réel (`runNode`/`resumeNode`/
`retryNode`) n'appelait jamais `MONO-03/lib/persistence-coordinator.js`
(`recordLineagePass`/`recordLineageFail`) pour le maintenir à jour. Un
second défaut de lecture aggravait cela : même écrit, un `PASS` devenu
obsolète après remplacement d'un artefact amont (`isLineageStillValid() ===
false`) restait accepté tel quel par une lecture directe du champ brut.

**Analyse de portée effectuée avant correction** (voir échange de
gouvernance dédié) : `RunState.lineageStatus` + le coordinateur MONO-03
constituent l'autorité durable **prévue et déjà testée** par MONO-03
lui-même (CDC section 6/16/17) — jamais une redondance dérivable du seul
NodeState (Option B rejetée avec preuve). `persistOutcome()`
(`operator-api.js`) est le **seul point de jonction réel** entre l'issue du
moteur MONO-02 et la persistance MONO-03 pour les trois chemins
officiellement supportés — MONO-02 n'a explicitement AUCUNE dépendance vers
MONO-03 (README MONO-02 : "ne construit toujours aucune persistance
finale"), et MONO-03 ne doit acquérir aucun hardcoding de `nodeId`
spécifique (Option A2/A3 rejetées avec preuve). Option A1 validée.

**Correctif (write path)** : `persistOutcome()` appelle, uniquement pour le
nœud `EF-04-LINEAGE`, `syncLineageStatus()` — aiguillée par le prédicat
canonique déjà gelé `LineagePort.isLineagePass()` (MONO-01, jamais
réimplémenté localement). Sémantique FAIL-CLOSED confirmée par
`isLineagePass()` lui-même (EF-04 fail-closed, aucune distinction entre
échec technique et lignée réellement rompue) : tout non-PASS →
`recordLineageFail()`. `basedOnArtifactRefs` dérivé dynamiquement de
`EF-04-LINEAGE.requiredUpstreamNodes` (déjà déclaré dans le graphe gelé),
résolu contre `RunState.artifactRefs` — fail-closed si une référence
amont manque (jamais un PASS sur preuve partielle). Ordre transactionnel
respecté : le NodeState/artefact d'EF-04-LINEAGE est persisté AVANT tout
appel à `recordLineagePass`.

**Correctif (read path)** : `getLineage()`/`getReport()` appellent
`coordinator.isLineageStillValid()` au lieu de lire `state.lineageStatus.status`
directement. Un PASS devenu stale renvoie désormais un statut `STALE`
explicite (jamais présenté comme un PASS courant) et bloque `getReport()`.

**Tests** : `test_t05_R2_lineage_status_sync.js` — 21 assertions
(T05-R2-01 à T05-R2-12), toutes via le VRAI chemin `runNode()`/`resumeNode`/
`retryNode` réel (jamais une préparation manuelle de `lineageStatus`, sauf
le point de départ délibéré des scénarios de staleness, conformément à la
décision de gouvernance). Le test historique `test_t05_lineage_pass.js`
(qui préparait manuellement `lineageStatus` — c'est exactement cet
angle mort qui explique pourquoi le bug n'a jamais été détecté) reste
intact, inchangé, toujours au vert.

### REG-02 — MULTI_NODE_REHYDRATION_CHAIN

**Découverte** : pendant l'écriture des tests REG-01, un happy path réel à
travers une chaîne multi-nœuds a révélé que `getOrRehydrateEngine()`
n'appelait `computeReadyNodes()` qu'une fois avant et une fois après sa
boucle de restauration, jamais entre chaque transition. Un nœud B
dépendant d'un nœud A transitionné dans la MÊME passe ne voyait jamais sa
propre éligibilité réévaluée à temps, et restait bloqué à `READY` (jamais
`SUCCESS`) après le rehydrate final.

**Vérification de portée effectuée avant correction** :
1. `Object.entries(runState.nodeStates)` ne garantit PAS contractuellement
   un ordre topologique — il reflète simplement l'ordre de `nodeDefs`
   fourni par l'appelant à `createRun()` (aujourd'hui topologique par
   coïncidence, jamais un contrat). Le correctif ne s'appuie donc sur
   AUCUN ordre d'énumération (vérifié par T05-R2-17, ordre délibérément
   inversé).
2. Des états persistés `FAILED`/`BLOCKED`/`PAUSED`/`RUNNING` existent
   réellement (`recordNodeFailure`/`recordNodeBlocked`/`recordNodePaused`/
   `markNodeRunning`) et doivent être restaurés.
3. `RUNNING` persisté (crash mi-exécution) est restauré comme `FAILED` —
   jamais laissé `RUNNING` (un nœud `RUNNING` dans le moteur réhydraté ne
   serait plus jamais actionnable : ni `runNode()` (exige READY), ni
   `resumeNode()` (exige PAUSED/FAILED), ni `retryNode()` (exige
   FAILED/BLOCKED)). Ce choix s'appuie sur deux preuves déjà gelées,
   jamais une politique inventée : `MONO-03/lib/resume-planner.js::classifyNode()`
   classe déjà `RUNNING` dans le MÊME bucket `retryPolicy` que
   `FAILED`/`PAUSED` (aucun cas séparé), et `engine.markFailed()` est la
   transition `RUNNING→FAILED` déjà publique et légale du moteur MONO-02.
4. `PAUSED` reste réservé à une pause délibérée (ex: reprise native
   EF-ORCH), jamais à une interruption involontaire de processus.
5. `MONO-03/lib/resume-planner.js::computeResumePlan()` ne recalcule
   jamais l'éligibilité — il classe seulement, à partir de l'état déjà
   persisté et de la politique déjà connue.

**Correctif** : réhydratation en **point fixe**, répétant
(`computeReadyNodes()` + tentative de transition sur chaque nœud) jusqu'à
absence de progression, bornée par `nodeIds.length + 1` passes (garde-fou
anti-boucle-infinie, jamais une boucle non bornée). Vérification
**fail-closed** finale : tout état persisté non-`NOT_STARTED` qui n'a pas
pu être reconstruit légalement (à l'exception documentée `RUNNING→FAILED`)
lève `REHYDRATION_STATE_MISMATCH` explicite — jamais une reconstruction
silencieuse partielle (`persisted SUCCESS / engine READY` ne peut plus se
produire sans être détecté).

**Tests** : `test_t05_R2_rehydration_fixpoint.js` — 13 assertions
(T05-R2-13 à T05-R2-22) : chaîne de 1, 2, 5, puis 12 nœuds ; ordre
d'énumération délibérément non topologique ; branche parallèle (A→B, A→C,
B,C→D) ; SUCCESS amont + downstream NOT_STARTED (jamais un faux SUCCESS) ;
état durable incompatible (fail-closed démontré) ; nouvelle instance après
plusieurs SUCCESS ; reprise après interruption à 5 nœuds.

### Test croisé REG-01 + REG-02

`test_t05_R2_cross_reg01_reg02.js` — 7 assertions démontrant les deux
correctifs ENSEMBLE : run avancé (12 nœuds SUCCESS persistés) → redémarrage
→ réhydratation correcte (REG-02) → exécution réelle d'EF-04-LINEAGE →
synchronisation lineage (REG-01) → EF-04A → rapport accessible → second
redémarrage (PASS toujours valide, rapport toujours accessible) → variante
stale (deux runs distincts, `getReport()` reste `LINEAGE_BLOCKED`).

### Non-régression totale R2

```
65 (historique) + 21 (REG-01) + 13 (REG-02) + 7 (croisé) = 106/106
```

Aucun test historique supprimé ou affaibli — `test_t05_lineage_pass.js`
en particulier reste intact tel quel.

### Verdict proposé (R2)

**CORRECTIVE REBASELINE R2 — GELABLE** (pour la part MONO-05 — voir le
rapport de rebaseline dédié pour le verdict global incluant MONO-06-R2).

## Rebaseline corrective R3 — MONO05-R3-REG-01 (REAL_REPORT_ASSURANCE_UI_SHAPE)

**Contexte** : découvert en construisant un vrai scénario browser E2E dans
le cadre de MONO-07 — le premier test à exercer `renderReport()` avec un
rapport RÉELLEMENT produit par `ef-04a-unified-report-v1.js`, plutôt qu'un
payload fabriqué à la main.

**Cause racine** : `app/client/app.js::renderReport()` lisait
`report.assuranceLevel` / `report.targetDocumentsHashBoundFromEF03` /
`report.documentaryTwinsHashBoundFromEF03` à la RACINE du rapport. Le vrai
contrat EF-04A (`MONO-01/dependencies/ef-04a-unified-report-v1.js`, gelé)
imbrique ces champs sous `report.lineage.lineageAssurance`. Sur un vrai
rapport : `report.assuranceLevel === undefined`.

**Angle mort identique aux régressions précédentes** : le seul test qui
exerçait `renderReport()`/`getReport()` (`test_t05_lineage_pass.js`,
T05-24) fabrique lui-même son propre payload de rapport À LA RACINE via
`recordNodeSuccess()` direct — jamais via le vrai module. Ce test reste
intact (il teste légitimement le passage HTTP brut, pas l'affichage), mais
ne pouvait pas détecter ce décalage entre le vrai contrat et l'UI.

**Correctif** (`app/client/app.js::renderReport()`) : lit désormais
`report.lineage.lineageAssurance`, jamais un champ dupliqué à la racine,
jamais le producer (`ef-04a-unified-report-v1.js`) modifié — la forme
réelle du contrat fait foi, seul l'affichage est corrigé. **Fail-closed** :
si `lineageAssurance` est absent ou `assuranceLevel` n'est pas une chaîne,
affiche un message explicite d'indisponibilité — jamais un `undefined`
silencieux, jamais un niveau d'assurance inventé par défaut
(`full`/`verified`/`scientific`/`high` interdits explicitement).

**Preuve avant/après** (même fixture, `test_t05_R3_report_ui.js`) :
- AVANT (R2) : vrai payload EF-04A → `report.lineage.lineageAssurance`
  présent → `renderReport()` afficherait `assuranceLevel: undefined`.
- APRÈS (R3) : même payload → `renderReport()` affiche
  `reference_revalidated_not_source_hash_bound`, et les deux flags à
  `false`.

**Tests ajoutés** :
- `test/integration/test_t05_R3_report_ui.js` (8 assertions, T05-R3-01 à
  05 + 2 préconditions) — vrai `buildUnifiedReportSummary()` via
  `EF-04-LINEAGE`/`EF-04A` réellement exécutés, jamais un objet fabriqué à
  la main.
- `test/browser/test_t05_R3_browser_report.js` (5 assertions) — scénario
  Playwright réel : run seedé server-side avec un vrai payload EF-04A,
  navigateur ouvre la vraie UI, clique « Ouvrir le rapport », vérifie le
  texte réellement affiché dans le DOM (`reference_revalidated_not_source_hash_bound`,
  les deux flags `false`, aucun `undefined`, aucune erreur console).

**T05-R3-06 (forme legacy plate)** : non ajouté comme test séparé — le
test historique `test_t05_lineage_pass.js`/T05-24 reste intact et continue
de passer sans aucune modification (il teste le passage HTTP brut avec un
payload fabriqué à la racine, jamais affecté par ce correctif qui ne
touche que la fonction d'affichage `renderReport()`). Aucun double contrat
public maintenu artificiellement — seul le contrat réel imbriqué fait foi
pour l'affichage.

### Non-régression totale R3

```
106 (R2) + 8 (T05-R3 report) + 5 (T05-R3 browser) = 119/119
```

Aucun test historique ni R2 supprimé ou affaibli.

### Verdict proposé (R3)

**CORRECTIVE REBASELINE R3 — GELABLE** (pour la part MONO-05 — voir le
rapport de rebaseline dédié pour le verdict global incluant MONO-06-R3).
