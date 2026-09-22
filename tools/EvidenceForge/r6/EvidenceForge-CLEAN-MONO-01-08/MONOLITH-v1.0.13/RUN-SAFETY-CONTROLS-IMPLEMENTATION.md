# IMPLÉMENTATION — RUN SAFETY CONTROLS (MONOLITH-v1.0.5, 2026-09-18, 0 USD)

Lot P0 : budget explicite avant lancement, arrêt utilisateur persistant, reprise sûre sans double facturation. Aucune logique scientifique
touchée (gates, PANEL-SUFFICIENCY-v2, Screening Cost Optimizer, sélection, jumeaux, lots et contrats gelés, ledger et runs existants inchangés).

## 1. Budget explicite (`lib/budget-guard.js`, `lib/pipeline.js`, `server.js`, `index.html`)
- `normalizeBudgetMode(input)` (nouveau, point unique) : `mode ∈ {LIMITED, UNLIMITED_CONFIRMED}` ; LIMITED ⇒ `costBudgetUsd > 0`, `warningThresholdUsd`
  facultatif mais **strictement** inférieur ; UNLIMITED_CONFIRMED ⇒ `confirmedUnlimited: true` obligatoire ; sinon `BUDGET_REQUIRED` (HTTP 400).
  Compatibilité : un plafond > 0 sans `mode` vaut LIMITED (scripts / lanceur existants) ; un champ vide n'est **jamais** « sans plafond ».
- `startRun` : `budget.json` écrit **toujours**, avant `state.json` (donc avant tout appel), avec `mode`, `confirmedUnlimited`, `setBy`, `createdAt`,
  `history[].mode` ; la réponse rend ce qui est réellement enregistré. `updateBudget` (en cours de run) exige la même confirmation pour lever un plafond.
- `cost-view` : `budget.mode`, `confirmedUnlimited`, `missing` ; l'absence de `budget.json` est déclarée `anomaly: BUDGET_FILE_MISSING`.
- UI : panneau budget **ouvert**, radio « Plafond (recommandé) » / « Sans plafond (confirmation explicite requise) » ; aperçu explicite ; lancement :
  plafond vide ⇒ alerte, aucune requête ; sans plafond ⇒ `confirm()` avec le texte « Ce run n'aura aucun plafond automatique de coût. Les appels
  fournisseur continueront jusqu'à la fin ou jusqu'à votre arrêt manuel. » ; bannière « AUCUN PLAFOND (confirmé explicitement) » sur le run.

## 2. Arrêt utilisateur (`lib/run-stop.js` nouveau, `lib/llm.js`, `lib/pipeline.js`, `server.js`, `index.html`)
- Primitive unique `PL.requestRunStop(runId, {actor})` → `stop-request.json` (atomique, idempotent, historique : `requestedAt`, `honoredAt`, `consumedAt`).
  Moteur actif : la demande est lue **avant chaque `llmCall`** (réel ou réutilisé, `llm.js` `stopCheck`) et **avant chaque `setStage`** ⇒ erreur
  `STOPPED_BY_USER` ajoutée aux `TRANSPORT_CODES` (verrou) et à `RESUMABLE` ⇒ les boucles gelées absorbent (candidat / jumeau / lot suivant jamais
  lancé, aucun réseau), la frontière d'étape lève, `fail()` écrit `STOPPED`, `normalizedCause: USER_STOP`, événement `run_stopped_by_user`, `state.stop`.
  Aucun moteur (CREATED, WAITING_USER, RUNNING orphelin) : arrêt immédiat et persisté. Route `POST /api/runs/:id/stop` ; `RUN_NOT_ACTIVE` si COMPLETED.
- Écritures atomiques jamais interrompues (aucun signal, aucune interruption de processus) ; checkpoints et cache conservés ; rien n'est supprimé.
- UI : bouton « Arrêter le run » visible **seulement** en RUNNING, confirmation « Arrêter ce run ? Les résultats déjà produits seront conservés.
  Aucun nouvel appel fournisseur ne sera lancé. » ; libellés distincts : « arrêté à votre demande », « interrompu par un arrêt du serveur », « budget atteint ».

## 3. État partiel (`run-stop-state.json`, `EvidenceForge.RunStopState`)
`notAVerdict: true`, `notACheckpoint: true`, runId, stage, reason, stoppedAt, requestedAt/actor, cost (total, par étape, tarification), realCalls
(REAL_CALL) + callsIncludingProbesAndKits, reuse, lastCompletedUnit (dernier appel facturé : finalité, référence candidat/jumeau, horodatage, USD),
nextUnit (description par étape + note de granularité), checkpointRef, stagesDone, resumeAllowed/resumeHow, budget, partialArtifacts (dont
`professionals-sufficiency-partial.json` s'il existe), note sur l'appel en vol. Écrit par `fail()` uniquement sur `STOPPED_BY_USER`.

## 4. Reprise
Uniquement `POST resume` (acte utilisateur) → `advance()` consomme la demande (`consumedAt`, événement `run_resumed_after_user_stop`) ; `markInterruptedRuns`
ne consomme ni ne relance ; checkpoint haché + réutilisation MONO-11 des réponses VALID (ledger `REUSE`, coût 0). UI avant reprise : cause, coût déjà
dépensé, étape, étapes terminées, reste estimé (ESTIMATE — NOT GUARANTEE), budget et plafond restant (lus dans `/cost`).

## 5. Appel en vol
Le transport (`fetch`) n'expose aucune annulation externe : un appel déjà envoyé au moment de la demande **se termine, est facturé et sa réponse est
persistée (réutilisable)** ; aucun appel suivant n'est lancé. Documenté dans `stop-request.json`, `run-stop-state.json` et l'UI ; aucune promesse
d'annulation fournisseur.

## 6. Redémarrage
`INTERRUPTED_BY_RESTART` inchangé et distinct : `run-store.markInterruptedRuns` ne requalifie jamais un `STOPPED_BY_USER`, n'écrit pas d'état d'arrêt
utilisateur ; `BUDGET_LIMIT_REACHED` et les codes de transport gardent leur cause (`normalizedCause` PROVIDER_OR_TRANSIENT / TRANSPORT_FAILURE).

## 7. Wording plateau
`pipeline.js` : « Plateau informatif terminé : l'évaluation continue, le panel n'étant pas encore suffisant (…) » ; `lib/panel-sufficiency.js` et
`config.professionals.earlyStop` byte-identiques (RUN-SAFETY-18).

## 8. Fichiers
Nouveaux : `lib/run-stop.js`, `test/test-run-safety.js`, `RUN-SAFETY-CONTROLS-{AUDIT,IMPLEMENTATION,TEST-REPORT}.md`. Modifiés : `lib/budget-guard.js`,
`lib/pipeline.js`, `lib/llm.js`, `lib/cost-view.js`, `lib/run-store.js` (état public : `stop`), `server.js`, `index.html`, `tools/browser-tests-v105.js`
(+8 tests), `test/test-monolith.js` (budget explicite dans les tests existants, hook), `README.md`, `NON-REGRESSION.md`.

## 9. Limites
- Granularité de reprise = checkpoints d'étape + réutilisation ; aucun checkpoint par candidat / jumeau (aval gelé).
- Un arrêt pendant un appel HTTP en vol laisse cet appel se terminer (facturé).
- Le budget par étape / la réserve aval (spécification §16 de l'autopsie) ne sont pas dans ce lot.
- Aucun run réel : le smoke proposé (créer un run LIMITED, arrêter pendant le screening, reprendre) n'est pas lancé.
