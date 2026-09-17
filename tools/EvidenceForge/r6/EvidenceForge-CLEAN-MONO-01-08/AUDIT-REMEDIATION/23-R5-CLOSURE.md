# 23 — R5 Closure (A-01, A-02, A-03)

Round 5 (R5) est le round FINAL de préparation au Real Smoke : il ferme
les trois écarts relevés par l'audit indépendant après R4
(`EvidenceForge-AUDIT-INDEPENDANT-R4.md`) — dépendance cyclique
temporelle mission-gate ↔ auditDecisions ↔ retrieval (A-01, BLOQUANT),
absence de workflow de reconnaissance gouverné (A-02, MAJOR), et
contradiction du verdict final (A-03, MAJOR). B-01→B-04/M-01→M-03/
R4-F01→F03 sont hérités CLOSED de r2/r3/r4, sans modification
fonctionnelle ce round (revérifiés non-régressés). Aucun Real Smoke
réseau réel n'a été relancé, à aucun moment de ce round.

## R4-A01 — dépendance cyclique Mission Gate ↔ Audit Decisions

- **Défaut relevé** : `validateRealEForchProvenance()` exigeait
  `auditDecisions` non vide AVANT le mission-gate, indexées par
  `sourceId`, qui ne sont générés qu'APRÈS l'exécution réelle de
  `executeActiveConnectorsRetrieval()` (EF-01C2) — lui-même exécuté
  après le mission-gate dans le chemin nominal. Structurellement
  impossible à satisfaire honnêtement dans un seul chemin nominal
  synchrone.
- **Fichiers modifiés** : `lib/eforch-artifacts.js` (nouvelle
  `validatePreRetrievalProvenance()` — identique à l'ancienne
  `validateRealEForchProvenance()` MOINS le bloc `auditDecisions` ;
  `validateRealEForchProvenance()` elle-même conservée telle quelle,
  rétro-compatible, simplement plus appelée par le mission-gate ;
  nouvelle `validatePostRetrievalAuditDecisions(snapshot,
  auditDecisionsInput)`, la SEULE fonction habilitée à exiger/valider
  `auditDecisions`, exécutée uniquement après qu'un `RetrievalSnapshot`
  réel existe). `bin/run-real-smoke.js`
  (`describeMissionGateStatus()` délègue désormais à
  `validatePreRetrievalProvenance()`, jamais à l'ancienne fonction —
  correction centrale du BLOQUANT, au niveau du chemin nominal
  lui-même, pas seulement d'une fonction auxiliaire).
- **Test** : `test/test_t08_r5_closure.js`, R5-A01-01..05 (5
  assertions) + `AUDIT-DEC-*` (9 assertions sur le POST_RETRIEVAL_GATE)
  + non-régression ciblée de `test_t08_r2_closure.js` (B03-CAS3b,
  section « R5-A01 » — voir plus bas).
- **Résultat réel** : inclus dans `TOUS LES TESTS PASSENT (41)` de
  `test_t08_r5_closure.js`.
- **Limitation restante** : aucune — la dépendance cyclique est
  structurellement rompue, jamais contournée par une invention de
  décision anticipée.

## R4-A02 — workflow de reconnaissance gouverné

- **Défaut relevé** : aucun outil/sous-mode/commande dédiée n'existait
  pour produire un run de reconnaissance (retrieval seul), une pause
  opérateur, ni une reprise gouvernée depuis les décisions humaines.
- **Fichier nouveau** : `lib/real-screening-workflow.js` — implémente
  le workflow complet en deux phases :
  - `prepareRealScreening(env, opts)` (PHASE 1) : charge la mission,
    exécute `PRE_RETRIEVAL_GATE`, construit RunContract/ResolverTrace/
    SearchProtocol (`buildPreRetrievalArtifacts()`,
    `lib/real-e2e-driver.js`), exécute EF-01C2 réellement (une seule
    fois), construit et persiste un `RetrievalSnapshot` durable, hashé,
    puis s'arrête explicitement sur
    `OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS`.
  - `buildAuditDecisionsTemplate(snapshot)` : génère un template vide
    de saisie (jamais de décision pré-remplie).
  - `resumeRealScreening(env, adapter, workerCallFn, opts)` (PHASE 2) :
    charge le snapshot exact depuis le disque, vérifie son intégrité,
    exécute `POST_RETRIEVAL_GATE`, construit `ScreeningArtifact`/
    `QualificationTestArtifact` DEPUIS LE SNAPSHOT (rejeu, jamais un
    second retrieval), démarre/poursuit le run réel
    (`createRealMissionRunFromSnapshot()`, `lib/real-e2e-driver.js`).
  - `buildRetrievalSnapshot()`/`verifySnapshotIntegrity()` — voir
    `25-RETRIEVAL-SNAPSHOT-CONTRACT.md` pour le schéma complet.
- **Fichiers modifiés** : `lib/real-e2e-driver.js` (l'ancienne
  `buildEForchArtifacts()` monolithique scindée en
  `buildPreRetrievalArtifacts()` + `buildScreeningAndQualification()`,
  `buildEForchArtifacts()` redevenant un simple assemblage des deux —
  comportement externe strictement identique, vérifié par
  `test_t08_epistemic_integrity.js` inchangé ; nouvelle
  `createRealMissionRunFromSnapshot()`). `lib/eforch-artifacts.js`
  (`executeActiveConnectorsRetrieval()` retourne désormais aussi
  `byConnector` (résultats bruts par connecteur) ; nouvelle
  `buildReplayConnectorRunners(byConnector)` — garantie no-refetch, voir
  `24-REAL-SCREENING-TWO-PHASE-WORKFLOW.md`).
- **Test** : `test/test_t08_r5_closure.js`, R5-A02-01..08 (8
  assertions) + `INTEGRITY-*` (8 assertions, une par champ mandaté
  altéré) + `CROSS-PROCESS-01..07` (preuve à deux processus Node
  réellement distincts). Nouveaux fichiers
  `test/cross-process/worker-prepare-screening.js` et
  `test/cross-process/worker-resume-screening.js`.
- **Résultat réel** : inclus dans `TOUS LES TESTS PASSENT (41)`.
- **Limitation restante** : aucune connue — le workflow complet
  (préparation, pause, reprise, intégrité, no-refetch, cross-process)
  est prouvé de bout en bout en LOCAL_CONTROLLED. Voir
  `24-REAL-SCREENING-TWO-PHASE-WORKFLOW.md` pour le détail complet.

## R4-A03 — contradiction du verdict final

- **Défaut relevé** : le rapport R4 annonçait simultanément
  `REAL_SMOKE_MISSION_READINESS = NOT_READY` et `REAL_SMOKE_NEXT =
  READY_FOR_INDEPENDENT_REAL_RUN`, contredisant la règle de
  gouvernance R4 elle-même (`REAL_SMOKE_NEXT = READY` ⟺
  `CODE_READINESS = READY` ET `MISSION_READINESS = READY`).
- **Correction** : `26-READINESS-SEMANTICS.md` (nouveau) introduit
  quatre niveaux de readiness distincts
  (`CODE_READINESS`/`PREPARATION_READINESS`/`RESUME_READINESS`/
  `MISSION_READINESS`, cette dernière toujours qualifiée par la phase
  visée) et deux signaux `REAL_SMOKE_NEXT` explicitement nommés par
  phase (`REAL_SMOKE_PREPARE_NEXT`/`REAL_SMOKE_RESUME_NEXT`) au lieu
  d'un champ unique ambigu. `22-MISSION-READINESS.md` (R4) est annoté
  comme historique, jamais réécrit.
- **Résultat** : voir « Verdict R5 » ci-dessous — aucune combinaison
  invalide ne subsiste : `REAL_SMOKE_PREPARE_NEXT =
  READY_FOR_INDEPENDENT_REAL_RUN` et `REAL_SMOKE_RESUME_NEXT =
  NOT_READY` coexistent explicitement (les deux qualifiées par phase),
  jamais un `REAL_SMOKE_NEXT` non qualifié affirmant `READY` pendant
  qu'un `MISSION_READINESS` non qualifié affirme `NOT_READY`.
- **Limitation restante** : aucune — la sémantique est désormais
  univoque. Toute réutilisation future d'un champ `REAL_SMOKE_NEXT`
  générique (non qualifié par phase) est explicitement proscrite par
  `26-READINESS-SEMANTICS.md`.

## Non-régression connue et corrigée : `test_t08_r2_closure.js`

Deux sous-cas historiques de B-03 (« auditDecisions vide », «
auditDecisions acteur invalide ») assertaient que
`describeMissionGateStatus()` refuse une mission dont SEULE la partie
`auditDecisions` de `eForchProvenance` est vide/invalide. Cette
assertion était vraie sous l'ancien mission-gate (qui vérifiait
`auditDecisions`) et devient FAUSSE sous le nouveau
`PRE_RETRIEVAL_GATE` — **conséquence directe et voulue de la
correction R4-A01, jamais une régression silencieuse**. Les deux
sous-cas ont été retirés de la boucle `MISSION_NOT_READY` et
remplacés par une nouvelle section `B03-CAS3b (R5-A01)` qui affirme
explicitement le nouveau comportement (`status === "PASS"` pour ces
deux variantes), avec un commentaire de gouvernance détaillant
pourquoi ce n'est pas une régression et où la couverture manquante a
été déplacée (`POST_RETRIEVAL_GATE`, `test_t08_r5_closure.js::
AUDIT-DEC-*`).

## Non-régression (R1→R4 → R5)

| Suite | Résultat |
|---|---|
| `test_t08_cross_process.js` | PASS (CROSS_PROCESS historique, 2 PID distincts) |
| `test_t08_eforch.js` | 26/26 PASS |
| `test_t08_epistemic_integrity.js` | 11/11 PASS (inchangé malgré le découpage de `buildEForchArtifacts`) |
| `test_t08_observability.js` | 10/10 PASS |
| `test_t08_preflight.js` | 10/10 PASS |
| `test_t08_release_governance.js` | 4/4 PASS |
| `test_t08_runner_orchestration.js` | 10/10 PASS |
| `test_t08_v06_delegated_auth.js` | 24/24 PASS |
| `test_t08_v06_real_adapter_model.js` | 9/9 PASS |
| `test_t08_matrix.js` | 5 PASS + 19 NOT_RUN_ENVIRONMENT_BLOCKED (honnêtement déclarées, inchangé) |
| `test_t08_r2_closure.js` | 62/62 PASS (deux sous-cas B-03 réinterprétés, voir ci-dessus — jamais une perte de couverture) |
| `test_t08_r3_closure.js` | 16/16 PASS |
| `test_t08_r4_closure.js` | 25/25 PASS |
| `test_t08_r5_closure.js` | **41/41 PASS (nouvelle suite)** |
| `worker/evidenceforge-llm-proxy/test/worker.test.js` | 38/38 PASS (non affecté) |

**Aucune régression fonctionnelle introduite par R5** en dehors de la
réinterprétation attendue et documentée des deux sous-cas B-03
ci-dessus.

## Non-modification de MONO-01→07

Confirmée : le diff de ce round touche exclusivement
`EvidenceForge/MONO-08/v0.6/` (`bin/run-real-smoke.js`,
`lib/eforch-artifacts.js`, `lib/real-e2e-driver.js`,
`lib/real-screening-workflow.js` [nouveau],
`test/test_t08_r5_closure.js` [nouveau],
`test/cross-process/worker-prepare-screening.js` [nouveau],
`test/cross-process/worker-resume-screening.js` [nouveau],
`test/test_t08_r2_closure.js`). Aucun fichier sous `MONO-01/`→`MONO-07/`
n'a été touché. Aucun `CONTRACT_ARCHITECTURE_IMPACT.md` n'a été
nécessaire : aucune correction de ce round n'a requis de modification
d'un contrat gelé.

## Verdict R5

```
B-01 = CLOSED
B-02 = CLOSED
B-03 = CLOSED
B-04 = CLOSED
M-01 = CLOSED
M-02 = CLOSED
M-03 = CLOSED
R4-F01 = CLOSED
R4-F02 = CLOSED
R4-F03 = CLOSED

R4-A01 TEMPORAL READINESS CYCLE = CLOSED
R4-A02 GOVERNED RECOGNITION WORKFLOW = CLOSED
R4-A03 READINESS REPORTING = CLOSED

PRE_RETRIEVAL_GATE = PASS
POST_RETRIEVAL_GATE = PASS
RETRIEVAL_SNAPSHOT_DURABILITY = PASS
RETRIEVAL_SNAPSHOT_INTEGRITY = PASS
PREPARE_REAL_SCREENING = PASS
RESUME_REAL_SCREENING = PASS
NO_REFETCH_ON_RESUME = PASS
CROSS_PROCESS_PREPARE_RESUME = PASS
AUDIT_DECISION_BINDING = PASS
SCREENING_LINEAGE = PASS
PROVENANCE_CLASSIFICATION = PASS
NON_REGRESSION = PASS
SECRET_SCAN_PACKAGE = PASS

REAL_SMOKE_CODE_READINESS = READY
REAL_SMOKE_PREPARATION_READINESS = READY
REAL_SMOKE_RESUME_READINESS = NOT_READY
REAL_SMOKE_MISSION_READINESS = NOT_READY

REAL_SMOKE_PREPARE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN
REAL_SMOKE_RESUME_NEXT = NOT_READY

REAL_G_HISTORIQUE = PASS
REAL_SMOKE_HISTORIQUE = FAIL
REAL_EVIDENCE = NON ACQUISE

MONO-08 = GELABLE TECHNIQUEMENT
MONO-09/JMMJS = BLOQUÉ
```

Voir `26-READINESS-SEMANTICS.md` pour la justification complète de
chaque ligne de readiness (pourquoi `RESUME_READINESS`/
`RESUME_NEXT = NOT_READY` coexiste sans contradiction avec
`PREPARE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN`) : la mission
canonique livrée (`fixtures/mission-real-smoke-v1.json`) reste
délibérément `readyForExecution=false`, sans `eForchProvenance`
réelle ni `RetrievalSnapshot` produit par ce paquet — aucune valeur
n'a été inventée pour faire basculer cette évaluation. Voir
`11-FINAL-TECHNICAL-VERDICT.md` pour le rattachement de ce verdict au
verdict global du paquet, et `20-REAL-SMOKE-OPERATOR-CHECKLIST.md`
pour la marche à suivre opérateur réelle avec le nouveau workflow en
deux phases.
