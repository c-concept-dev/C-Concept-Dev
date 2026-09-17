# MONO-03 — Traçabilité CDC

| Section CDC | Exigence | Implémentation | Statut |
|---|---|---|---|
| 1 | Contrats (RunState/NodeStateRecord/ArtifactRecord/ResumePlan/PersistenceError) | `contracts/*.json` (5) | OK |
| 2 | RunState | `lib/run-store.js::createRun` | OK |
| 3 | NodeStateRecord (7 états MONO-02 exacts) | `lib/run-store.js` (NODE_STATES) | OK |
| 4 | ArtifactStore | `lib/artifact-store.js` | OK |
| 5 | Immutabilité des outputs réussis | `run-store.js::updateNodeState` refuse SUCCESS->autre | OK, T03-09/10 |
| 6 | ResumePlanner | `lib/resume-planner.js::computeResumePlan` | OK, T03-11/32 |
| 7 | Politiques de reprise (6) | `resume-planner.js` (POLICIES) | OK, T03-12 à T03-17 |
| 8 | PersistenceBackend (get/put/has/delete/keys) | `lib/persistence-backend.js` | OK |
| 9 | Durabilité (2 instances distinctes) | tous les tests T03-18/19/21/22/23 utilisent 2 instances | OK |
| 10 | Crash recovery | T03-22, T03-23 | OK |
| 11 | EF-ORCH cross-process | T03-18, T03-19 (vrai EFOrchExecutionPort, 2 instances) | OK |
| 12 | Consistency/hashes | `artifact-store.js::getArtifact` (mismatch fields + hash) | OK, T03-26 à T03-29 |
| 13 | Transactions | `run-store.js::recordNodeSuccess` (write->verify->commit) | OK, T03-07/08/22 |
| 14 | Échec d'écriture -> jamais SUCCESS | idem | OK, T03-08 |
| 15 | Reprise après corruption | `getArtifact` fail-closed | OK, T03-06 |
| 16 | Exclusion registry snapshot | garanti structurellement (artifactId inclut runId) | OK, T03-30 |
| 17 | Lignée invalidée par remplacement amont | `persistence-coordinator.js::isLineageStillValid` | OK, T03-31 |
| 18 | Run locking | `lib/run-lock.js` | OK, T03-24/25 |
| 19 | Idempotence | putArtifact/recordNodeSuccess idempotents, hash différent -> conflit | OK |
| 20 | Taxonomie d'erreurs (12 codes) | `lib/persistence-errors.js` | OK |
| 21 | Tests T03-01 à T03-40 + T03-SUCCESS-ATOMIC-01 à 04 | `test/test_t03_*.js` — 64/64 PASS | OK |
| 22 | Non-régression MONO-00/01/02/lots gelés | voir section ci-dessous | OK |
| 23 | Recherche statique | T03-35/36/37 + T03-38 (aucune mutation gelée) | OK |
| 24 | Interdictions | voir section ci-dessous | OK |

## Interdictions (section 24) — vérifiées

- Réécrire la persistance EF-ORCH : jamais fait, aucun store EF-ORCH recréé (T03-20).
- Inspecter le contenu des checkpoints EF-ORCH : jamais fait (T03-20, recherche statique dédiée).
- Modifier un output métier : `ArtifactStore` clone défensivement, jamais de mutation en place.
- Inventer un ResumePolicy : `resume-planner.js` n'accepte QUE les 6 politiques du CDC (`RESUME_PLAN_INVALID` sinon).
- Réexécuter arbitrairement un SUCCESS : refusé explicitement (`RUN_STATE_CONFLICT`, T03-09/10).
- Reconstruire automatiquement EF-02E : `EXPLICIT_REBUILD_REQUIRED` classe toujours dans `nodesBlocked`, jamais une action automatique (T03-16).
- Contourner MONO-01.x/MONO-02 : MONO-03 ne `require()` aucun port MONO-01.x ni fichier gelé — seul le graphe JSON de MONO-02 est lu (pour ses `resumePolicy`/`retryPolicy`), jamais un port appelé directement par `lib/`.
- Construire l'UI opérateur : aucun code d'interface, uniquement des structures de données et une API programmatique.

## Non-régression (section 22)

- MONO-00 : 27/27 (rejoué séparément, voir rapport final).
- MONO-01.x : 172/172, rejoué **depuis MONO-03 lui-même** via `test_t03_39_40` (T03-39).
- MONO-02 : 324/324, rejoué **depuis MONO-03 lui-même** via `test_t03_39_40` (T03-40).
- 7 lots gelés historiques : 1223/1223 (rejoué séparément, voir rapport final).

## Bugs réels trouvés pendant la construction

Deux défauts trouvés et corrigés dans MONO-03 lui-même pendant sa
construction (aucun défaut du code gelé hérité) :

1. Première version de `RunStore.recordNodeSuccess()` ne revérifiait pas
   immédiatement l'écriture du `RunState` après persistance (seul
   `ArtifactStore` le faisait) — corrigé en ajoutant la même relecture
   immédiate dans `persist()`, avant l'écriture des tests, sans régression
   observable a posteriori.

2. **Bug confirmé par audit indépendant** : `recordNodeSuccess()`
   effectuait le commit `SUCCESS` en DEUX écritures `RunState` distinctes
   (`updateNodeState()` pour `nodeStates`, puis un second `persist()` pour
   `artifactRefs`). Une panne exactement entre les deux laissait un
   `RunState` durablement incohérent : `nodeStates[nodeId].state === "SUCCESS"`
   mais `artifactRefs[nodeId] === undefined` — et le chemin idempotent de
   relance ne détectait ni ne corrigeait cette incohérence, la retournant
   telle quelle. **Corrigé** : `recordNodeSuccess()` construit désormais
   `nodeStates` et `artifactRefs` entièrement en mémoire puis les commite en
   **une seule** écriture `persist()`. Une panne sur ce commit unique laisse
   le nœud dans son état précédent (jamais un `SUCCESS` partiel) —
   l'`ArtifactRecord` déjà écrit peut rester orphelin, réutilisé
   idempotemment au retry suivant. Un garde-fou `assertRunStateConsistent()`
   a été ajouté dans `loadRun()` pour rejeter fail-closed tout `RunState`
   historique ou corrompu externement où cette incohérence existerait quand
   même, sans jamais tenter de la réparer silencieusement. Vérifié par 10
   nouveaux tests (`T03-SUCCESS-ATOMIC-01` à `04`, voir
   `test/test_t03_success_atomic_01_04.js`).


