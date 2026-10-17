# AUDIT — RUN SAFETY CONTROLS (MONOLITH-v1.0.5, 2026-09-18, avant code, 0 USD)

Run de preuve : `efm-20260917-f78528fe` (autopsie canonique locale `~/evidenceforge-work/reports/AUTOPSIE-RUN-BRUTAL-STOP-f78528fe.md`) :
8,04 USD sans plafond, arrêt par mort du processus, `state.json` laissé `RUNNING`, artefacts intacts, reprise possible par réutilisation.

## 1. Architecture AVANT (flux réel, fichier:ligne)
| Maillon | Code | Constat |
|---|---|---|
| Création du run (UI) | `index.html:83-86` budget dans un `<details>` replié « facultatif » ; `index.html:186-192` `budgetInput()` = `{null, null}` si champs vides ; `#start` envoie sans confirmation | un champ vide **devient** « sans plafond » implicitement ; aucune confirmation forte |
| Création du run (API) | `server.js:61` → `PL.startRun` ; `pipeline.js:65` : `budget.json` écrit **seulement** si une valeur est fournie | l'absence de `budget.json` est un état « valide » ; rien ne distingue « jamais configuré » de « sans plafond voulu » |
| Garde de budget | `budget-guard.js:55` `assertAllowed` : `costBudgetUsd === null && warningThresholdUsd === null ⇒ allowed` ; appelée `llm.js:113/142` avant chaque appel réel (après la décision de réutilisation) | correcte ; inopérante sans plafond |
| Transport | `llm.js:117-119` `llmCall` : verrou (`LATCH`) puis `llmCallInner` ; `llm.js:108` `TRANSPORT_CODES` (BUDGET_LIMIT_REACHED inclus) ; `llm.js:114` `latch()` ; `llm-transport.js:28` `AbortController` uniquement pour le délai | aucun point de contrôle utilisateur ; un appel HTTP envoyé ne peut pas être annulé de l'extérieur |
| Boucles payantes | screening : `batch-judge.js` (llmCall par lot) ; professionnels : `stage-professionals.js:233-237` `fetchAuthorWorks` (verrou vérifié **avant** le réseau et avant la suffisance) → boucle gelée MONO-11 absorbe l'erreur (candidat non évalué) ; jumeaux : `runDownstream` gelé (llmCall injecté) ; frontière : `assertNoTransportFailure` (`stage-professionals.js:164`) | tout arrêt propre existant passe par le verrou de transport ⇒ c'est le point d'extension naturel |
| Machine d'états | `pipeline.js:75-83` `fail()` : `RESUMABLE` (`pipeline.js:25`) ⇒ `STOPPED` sinon `FAILED` ; `advance()` `pipeline.js:85-97` : verrou mémoire `running`, `attempts++`, étape = première non DONE | aucun code `STOPPED_BY_USER` ; aucune écriture d'état à la réception d'un signal |
| Serveur | `server.js:90` `resume` (409 si RUNNING) ; aucune route stop/cancel ; aucun `process.on(SIGTERM)` | seul arrêt = SIGTERM du lanceur (`bin/launcher.js:91-95`) ⇒ mort brutale |
| Redémarrage | `run-store.js:95-101` `markInterruptedRuns` (`server.js:19`) : RUNNING ⇒ `STOPPED / INTERRUPTED_BY_RESTART` | correct ; ne relance jamais |
| Reprise | `index.html:256,262` bouton « Reprendre » ⇒ `POST resume` ⇒ `advance` ⇒ checkpoint haché ⇒ aval rejoué ; réutilisation `llm.js:121-139` (réponse VALID à prompt identique, même modèle/sceau/contrat) | aucune refacturation des réponses VALID ; rien n'affiche coût/étape/restant avant reprise |
| Wording plateau | `pipeline.js:188` : `EARLY_STOP_CANDIDATE → EARLY_STOP_CONTINUE` = « Évaluation des professionnels : reprise (…) » | trompeur : rien n'est repris |

## 2. Cause racine f78528fe
`BUDGET_NOT_CONFIGURED` (budget optionnel, aucun défaut, aucune confirmation) + `NO_STOP_MECHANISM`. Aucune corruption : écritures atomiques,
journaux append-only, checkpoints hachés ; `state.json` seulement en retard.

## 3. Architecture APRÈS (décisions de conception)
1. **Budget explicite** : `budget.mode ∈ {LIMITED, UNLIMITED_CONFIRMED}` exigé par `startRun` (point unique, API et UI) ; LIMITED ⇒ `costBudgetUsd > 0`,
   alerte optionnelle **strictement** inférieure ; UNLIMITED_CONFIRMED ⇒ `confirmedUnlimited: true` obligatoire ; sinon `BUDGET_REQUIRED` (400).
   `budget.json` écrit **toujours** avant `state.json` (donc avant tout appel), avec `mode`, `confirmedUnlimited`, `setBy`, `history`. Mise à jour en cours
   de run : lever un plafond exige la même confirmation. Absence de `budget.json` = anomalie (rapportée par `cost-view`).
2. **Arrêt utilisateur** : primitive unique `requestRunStop(runId, {actor})` (`lib/run-stop.js` + `pipeline.js`) : persiste `stop-request.json` ; si aucun
   moteur ne tourne (CREATED / WAITING_USER / STOPPED) l'état passe immédiatement à `STOPPED / STOPPED_BY_USER` ; si RUNNING, la demande est lue
   **avant chaque `llmCall`** (réel ou réutilisé, `llm.js`) et **avant chaque changement d'étape** (`setStage`) ⇒ erreur `STOPPED_BY_USER` classée code de
   transport (verrou) et reprenable ⇒ les boucles gelées absorbent (candidat / jumeau suivant jamais évalué, aucun réseau), la frontière d'étape lève,
   `fail()` écrit `STOPPED` avec `normalizedCause: USER_STOP`. Les écritures atomiques engagées se terminent (aucune interruption de processus).
3. **État partiel** : `run-stop-state.json` (`notAVerdict: true`) écrit par `fail()` sur `STOPPED_BY_USER` : runId, stage, reason, stoppedAt, cost (ledger),
   realCalls, reuse, lastCompletedUnit (dernier appel facturé : finalité, référence, horodatage), nextUnit (description par étape), checkpointRef,
   resumeAllowed, budget, partialArtifacts (dont l'état partiel du panel s'il existe). Jamais un checkpoint.
4. **Reprise** : uniquement `POST resume` (acte utilisateur) ; `advance()` consomme la demande d'arrêt (`consumedAt`) ; `markInterruptedRuns` ne relance
   jamais ; l'UI affiche avant reprise : coût dépensé, étape, restant, projection (ESTIMATE), budget et plafond restant.
5. **Appel en vol** : non annulable (transport `fetch` sans annulation externe) : documenté ; l'appel se termine, est facturé, sa réponse est persistée et
   réutilisable ; aucun appel suivant.
6. **Causes distinctes** : `STOPPED_BY_USER` / `INTERRUPTED_BY_RESTART` / `BUDGET_LIMIT_REACHED` / codes de transport — `normalizedCause` USER_STOP /
   PROVIDER_OR_TRANSIENT / TRANSPORT_FAILURE, jamais fusionnés ; l'UI les libelle séparément.
7. **Wording plateau** : événement seul, aucune policy touchée.
Hors périmètre (inchangé) : gates scientifiques, PANEL-SUFFICIENCY-v2, Screening Cost Optimizer, sélection, jumeaux, lots et contrats gelés, ledger, runs existants.
