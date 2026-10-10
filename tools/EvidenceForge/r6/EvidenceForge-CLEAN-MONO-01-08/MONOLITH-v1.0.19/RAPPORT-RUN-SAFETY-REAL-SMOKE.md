# RAPPORT — MINI-SMOKE RÉEL RUN SAFETY CONTROLS (MONOLITH-v1.0.5, 2026-09-18, un seul run)

1. **Commit testé** : code EvidenceForge de **`366ec24d`** (HEAD local `407a9e2c` = 366ec24d + 2 commits Atelier Prompts du propriétaire ;
   `git diff 366ec24d 407a9e2c -- tools/EvidenceForge` vide ; aucune modification EvidenceForge non commitée). `ACTIVE_VERSION = MONOLITH-v1.0.5`.
   Serveur redémarré proprement (`start.sh`, port 8768, `Git : 407a9e2c`, worker OK, modèle `claude-sonnet-4-6`, lots gelés OK) après arrêt de
   l'ancienne instance 8772 (`stop.sh`). Aucun autre run actif (8 runs : STOPPED / WAITING_USER ; `f78528fe` RUNNING orphelin → requalifié au
   démarrage en `STOPPED / INTERRUPTED_BY_RESTART` par `markInterruptedRuns`, mécanisme prévu, aucun autre artefact touché).
2. **runId** : `efm-20260917-a4df0747` (`~/evidenceforge-work/reports/h1-v105-runs/`).
3. **Mission** : « Examiner les effets de la marche régulière sur la santé cardiovasculaire chez l’adulte. » (exacte, non enrichie).
4. **Budget** : mode **LIMITED**, plafond **0,40 USD**, alerte **0,30 USD**, saisis dans le formulaire réel (radio « Plafond », aperçu : « Sera enregistré :
   plafond 0.40 USD · alerte à 0.30 USD (budget.json écrit avant tout appel). ») ; `confirm()` jamais appelé (mode plafond). Jamais modifié.
5. **budget.json avant le premier appel** (preuve par horodatages) : `budget.json` mtime **23:20:06.259 Z**, `createdAt 23:20:06.258 Z`, événement
   `budget_set` **23:20:06.259** < « Run créé » 23:20:06.265 < `state.json` mtime 23:20:06.267 < premier appel réel (`llm-calls` `startedAt`
   **23:20:07.593**, ledger seq 2 à 23:20:20.595). Instantané pris 250 ms après la création : `mode LIMITED`, `costBudgetUsd 0.4`,
   `warningThresholdUsd 0.3`, `confirmedUnlimited false`, `setBy user`, `history` 1 entrée (`previous: null/null/null`), **aucun ledger encore existant**.
6. **Appels avant le stop** : 1 preflight (0,0001) + **1 REAL_CALL** (reformulation, 23:20:07.593 → 23:20:20.595, 0,0082 USD).
7. **Stop** : clic réel sur « Arrêter le run » (`btnStop.onclick`, confirmation acceptée) à **23:20:20.613** ; `run_stop_requested` persisté
   **23:20:20.646** ; honoré **23:20:34.883** (`honoredStage DISCIPLINES`, frontière `setStage(PLAN)`).
8. **Appel en vol** : le kit EF-01B (résolveur) a été lancé à **23:20:20.641** (événement « appel réel, tentative 1 », journalisé AVANT l'appel) —
   **5 ms avant** la persistance de la demande (23:20:20.646) : appel déjà en vol, terminé 23:20:34.862, facturé **0,0172 USD** (KIT_CALL), réponse
   persistée (`disciplines.json`, étape DONE). Cas A, documenté.
9. **Appels après le stop** : appels démarrés après `honoredAt` (23:20:34.883) : **0** ; après `requestedAt` (23:20:20.646) : **0**. Preuve : ledger
   seq 3 (KIT_CALL 23:20:34.862, démarré 23:20:20.641) puis rien avant la reprise explicite (seq 4 preflight 23:20:40.853, après `run_resumed…`
   23:20:36.648) ; `llm-calls.jsonl` : 1 seul LLM_CALL ; `events.jsonl` : aucun `kit … appel réel` ni `llm_call` entre 23:20:20.646 et 23:20:36.648.
10. **État STOPPED** : `state.json` `status STOPPED`, `error.code STOPPED_BY_USER`, stage DISCIPLINES → (après reprise) PLAN ; `normalizedCause
    USER_STOP` sur les deux événements `run_stopped_by_user` ; jamais FAILED, jamais PANEL_*.
11. **run-stop-state.json** (dernier arrêt) : `notAVerdict true`, `notACheckpoint true`, runId, stage `PLAN`, reason `STOPPED_BY_USER`, stoppedAt
    23:21:21.599, requestedAt 23:21:21.598, cost `{ totalUsd 0.067512, byStage PREFLIGHT 0.0002 / MISSION 0.0082 / DISCIPLINES 0.0172 / PLAN 0.0419 }`,
    realCalls 1 (+ `callsIncludingProbesAndKits` 5), reuse 0, lastCompletedUnit `{ EF-01C1 planner, 23:21:21.538, 0.04191 }`, nextUnit `{ PLAN, … }`,
    checkpointRef null (aucun checkpoint avant PROFESSIONALS), resumeAllowed true, budget (LIMITED 0,40/0,30), partialArtifacts [].
12. **UI après stop** (textes exacts) : statut **« arrêté à votre demande (reprenable) »** ; bouton Arrêter **masqué** ; bouton Reprendre **visible** ;
    résumé : « Avant de reprendre · cause : arrêté à votre demande · déjà dépensé : 0.03 USD · étape : Identifier les angles d'expertise (2/9 étapes
    terminées) · reste estimé : non projetable · budget : plafond 0.40 USD, reste avant plafond 0.37 USD. » ; bannière : « Run arrêté à votre demande :
    aucun nouvel appel au service d'analyse n'a été lancé après votre demande ; les résultats déjà produits sont conservés. Vous pourrez reprendre le run
    explicitement. » ; bloc budget : « plafond 0.40 USD · reste avant plafond 0.39 USD · alerte à 0.30 USD · la projection tient dans le budget ».
13. **Reprise explicite** : un seul clic « Reprendre le run » à **23:20:36.602** ; `tentative 2 : reprise à l'étape PLAN` 23:20:36.609 ;
    `run_resumed_after_user_stop` 23:20:36.648 (demande consommée : `consumedAt`) ; MISSION et DISCIPLINES (DONE) **non rejouées** ; 1 preflight
    (0,0001) + **1 appel réel** (kit EF-01C1, 23:20:40.877 → 23:21:21.538, 0,0419 USD) ; Porte 1 atteinte (`WAITING_USER / CONFIRM_PLAN`, aucune
    confirmation envoyée).
14. **Reuse** : **aucun cas applicable à ce stade** — les étapes MISSION / DISCIPLINES / PLAN sont atomiques (une réponse = une étape DONE) ; à la
    reprise rien n'était à recalculer, donc aucune ligne REUSE (0) et aucune refacturation : la reformulation et le résolveur n'ont été payés qu'une fois
    (ledger : 1 REAL_CALL, 2 KIT_CALL distincts). Aucun cas de reuse n'a été fabriqué. (La réutilisation réelle à prompt identique est démontrée par
    RUN-SAFETY-21 sur les 4 revues du run f78528fe et par la reformulation réutilisée du smoke `edb27b86`.)
15. **Double facturation** : aucune — chaque finalité apparaît une fois dans le ledger ; `llm-calls.jsonl` : 1 appel ; preflights (2 × 0,0001) par
    tentative, par conception.
16. **Coût total** : **0,067512 USD** (ledger ; UI « 0.07 USD »).
17. **Plafond** : 0,40 jamais atteint ni modifié ; alerte 0,30 jamais levée (`warningRaisedAt null`, `limitReachedAt null`) ; aucune surconsommation.
18. **Second arrêt** : après la reprise, le run était à la **Porte 1** (`WAITING_USER`, aucun moteur) : le bouton « Arrêter » est **masqué** hors RUNNING
    (spécification RUN-SAFETY-17) ; l'arrêt a été fait par la **même primitive** (`POST /api/runs/:id/stop`, 23:21:21.598) ⇒ immédiat, `STOPPED /
    STOPPED_BY_USER`, `stoppedAtGate CONFIRM_PLAN`, `honoredAt 23:21:21.599`, UI « arrêté à votre demande (reprenable) », résumé « déjà dépensé : 0.07 USD ·
    étape : Préparer le plan de recherche (3/9 étapes terminées) · … plafond 0.40 USD, reste avant plafond 0.33 USD. ». Mission non terminée.
19. **Chronologie** (Z) : RUN_CREATED 23:20:06.265 · BUDGET_CREATED 23:20:06.259 · FIRST_REAL_CALL 23:20:07.593→20.595 · IN_FLIGHT_KIT_START 23:20:20.641 ·
    STOP_REQUESTED 23:20:20.646 · IN_FLIGHT_KIT_END 23:20:34.862 · STOP_HONORED 23:20:34.883 · STATE_STOPPED 23:20:34.894 · RESUME_REQUESTED 23:20:36.602
    (consommée 23:20:36.648) · REUSE aucun · NEXT_REAL_CALL 23:20:40.877→23:21:21.538 · GATE_1 23:21:21.567 · SECOND_STOP 23:21:21.598 · FINAL_STOPPED 23:21:21.599.
20. **Tests après smoke** (aucun appel fournisseur) : monolith **198/198**, navigateur **33/33**, lanceur **14/14**, secrets 0, anti-hardcoding 0
    (7 287 jetons de 4 runs réels dont ce smoke), lots gelés MONO-01/09/10/11 **0 divergence**.
21. **Anomalies / observations** (aucune correction pendant le smoke) :
    - a. `stop-request.json` et `run-stop-state.json` ne conservent que le **dernier cycle** (la 1ʳᵉ demande, consommée à la reprise, a été remplacée par la
      2ᵉ) ; l'historique complet reste dans `events.jsonl` (`run_stop_requested` / `run_stopped_by_user` / `run_resumed_after_user_stop`) et `state.stop`.
      Amélioration possible : historiser dans le fichier.
    - b. Les appels des **kits EF-01B/EF-01C1** passent par l'adaptateur MONO-04 (garde de budget) et non par `llmCall` : le contrôle d'arrêt ne les
      couvre qu'aux transitions d'étape (`setStage`). Observé ici comme cas « en vol » (5 ms) ; une **reprise interne du kit** (tentatives 2–3) après une
      demande d'arrêt ne serait pas bloquée par le drapeau (limite documentée, jamais plus d'une étape).
    - c. Bouton « Arrêter » masqué à une porte (`WAITING_USER`) : l'arrêt reste possible par l'API (même primitive) ; décision produit à prendre
      (afficher le bouton aux portes ?).
    - d. Affichage : le résumé avant reprise (lu dans `/cost`) disait 0,03 USD alors que le bloc « Coût du run » affichait encore 0,01 (rafraîchi ensuite) :
      latence de rafraîchissement de l'UI, pas une divergence du ledger.
    - e. Le démarrage du serveur a requalifié le run orphelin `f78528fe` (`INTERRUPTED_BY_RESTART`) : prévu, distinct de `STOPPED_BY_USER`.

## Verdict
Critères : budget.json avant tout REAL_CALL ✔ · LIMITED 0,40 / alerte 0,30 ✔ · stop UI fonctionnel ✔ · STOPPED_BY_USER persisté ✔ · 0 nouvel appel après
`honoredAt` (et après `requestedAt`) ✔ · appel en vol documenté (kit, 5 ms) ✔ · reprise uniquement explicite ✔ · aucune double facturation ✔ ·
coût 0,0675 ≤ 0,40 ✔ · tests verts ✔ · lots gelés inchangés ✔.

**RUN_SAFETY_REAL_SMOKE_PASS.** Proposition suivante : **AUDIT GLOBAL DE GEL MONOLITH-v1.0.5** (non prononcé GELÉ).
