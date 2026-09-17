# 03 — Files Changed (cette mission de remédiation, MONO-08 uniquement)

Base : `EvidenceForge/MONO-08/v0.6/` au commit `8bbd850` (déjà la
révision canonique la plus mûre, voir `01-CANONICAL-SOURCE-SELECTION.md`).
Diff complet : `git diff 8bbd850..HEAD -- EvidenceForge/MONO-08/`, 15
fichiers, +963/-27.

MONO-01→MONO-07 : **AUCUN FICHIER MODIFIÉ** dans cette mission (voir
`00-EXECUTIVE-SUMMARY.md`).

## Fichiers modifiés (contenu différent, chemin identique)

### `lib/eforch-artifacts.js` (F-02, F-03, F-04)
Ajout d'un paramètre `provenance` optionnel (`{mode, ...}`) aux builders
`buildResolverTraceForMission`, `buildSearchProtocolForMission`,
`buildScreeningArtifactForMission`. Mode absent/`LOCAL_CONTROLLED`
(défaut) : comportement fixture INCHANGÉ, étiqueté
`evidenceProvenance:"SYNTHETIC_FIXTURE"`. Mode `"REAL"` : exige des
données réelles fournies par l'appelant, sinon lève
`OPERATOR_INPUT_REQUIRED` (`err.code`), jamais une fabrication.

### `lib/real-e2e-driver.js` (F-02, F-03, F-04)
`buildEForchArtifacts()` accepte et propage `provenanceOpts`.
`createRealMissionRun()` accepte `opts.mode`/`opts.realProvenance` et les
transmet. `rehydrateRealMissionRun()` non modifié dans sa logique
(persistance déjà correcte, revérifiée par la preuve CROSS_PROCESS).

### `bin/run-real-smoke.js` (F-01, F-02/F-03/F-04, F-14)
- Ajout de `describeNodeFailure()` (F-01) : interroge
  `operatorApi.getNode()` sur le premier nœud non-SUCCESS après
  `driveRun()`, restitue `lastError`/`errorCode` toujours, plus les
  champs natifs disponibles.
- Les deux appels à `createRealMissionRun()` passent désormais
  `mode:"REAL"` et `realProvenance: loadRealProvenance(mission)` (lu
  depuis `mission.eForchProvenance`, absent aujourd'hui du fixture — un
  run réel échoue donc honnêtement en `OPERATOR_INPUT_REQUIRED` tant que
  l'opérateur ne l'a pas renseigné).
- Nouveau statut de trace `OPERATOR_INPUT_REQUIRED`, distinct de `FAIL`,
  avec son propre code de sortie (4) dans `main()`.
- `missionGateStatus()` extrait en fonction pure exportée (F-14, pour
  rendre `test_t08_runner_orchestration.js` testable indépendamment du
  fixture partagé).
- `module.exports` + garde `require.main === module` ajoutés (jamais
  d'exécution de `main()` sur un simple `require()`).

### `test/test_t08_runner_orchestration.js` (F-14)
T08-RUNNER-04/05 (BUG_TEST — asseraient à tort que la mission fournie
resterait toujours incomplète) réécrits : vérifient désormais la
cohérence structurelle du fixture actuel PLUS le comportement fail-closed
réel de `missionGateStatus()`/`extractDocumentPayloads()` sur des
missions synthétiques construites dans le test. 9/9 PASS (contre 7/9
avant correction).

### `v0.6-implementation-evidence-2026-08-31/files-modified-created.txt`, `.../SHA256SUMS` (F-06)
Correction de la déclaration erronée classant
`fixtures/mission-real-smoke-v1.json` comme « copié tel quel depuis
v0.5 ». Déclaration d'origine jamais supprimée en silence (préservée
dans l'historique git) ; correction ajoutée en place, expliquant la
faille de preuve de la comparaison de non-régression originale.
`SHA256SUMS` du dossier de preuve régénéré pour rester cohérent.

### `v0.6/CDC-TRACE.md` (F-06)
Note de correctif ajoutée en tête de fichier, pointant vers la
correction F-06 — jamais une réécriture de l'historique narratif
existant (chaque section reste un enregistrement honnête de l'état cru
au moment où elle a été écrite).

## Fichiers créés (nouveaux)

| Fichier | Rôle |
|---|---|
| `lib/file-durable-backend.js` | Implémentation de PRODUCTION (fichiers disque, écriture atomique) des contrats abstraits déjà GELÉS de MONO-01 (`ef-orch-durable-backend-v0.1.js`) et MONO-03 (`persistence-backend.js`) — composition pure, aucun lot gelé modifié. |
| `test/cross-process/fixtures.js` | Fixtures LOCAL_CONTROLLED partagées par les deux processus de la preuve CROSS_PROCESS (aucun objet partagé — seul le code source est identique). |
| `test/cross-process/worker-a.js` | Processus A de la preuve CROSS_PROCESS : construit un run, l'avance jusqu'à EF-ORCH-SUBSYSTEM=SUCCESS uniquement, persiste, sort. |
| `test/cross-process/worker-b.js` | Processus B : reconstruit le runtime à neuf, réhydrate, termine le run à 14/14 SUCCESS. |
| `test/test_t08_cross_process.js` | Orchestrateur : spawn réel des deux processus, 12 assertions, imprime `CROSS_PROCESS = PASS`. |
| `test/test_t08_epistemic_integrity.js` | 11 assertions couvrant T-NEW-05→09 (fail-closed REAL, étiquetage SYNTHETIC_FIXTURE, provenance REAL complète fonctionnelle). |
| `test/test_t08_observability.js` | 10 assertions couvrant T-NEW-04 (`describeNodeFailure` contre des formes réelles de `getNode()`/`node-runners.js`). |
| `test/test_t08_release_governance.js` | 4 assertions couvrant T-NEW-10 (garde de non-régression pour la correction F-06). |

## Fichiers explicitement non modifiés (MONO-08)

`lib/preflight.js`, `lib/real-provider-configs.js`, `lib/real-external-adapter.js`,
`lib/frozen-zip-integrity.js`, `lib/kit-root.js`, `lib/secret-scan.js`,
`test/test_t08_eforch.js`, `test/test_t08_matrix.js`,
`test/test_t08_preflight.js`, `test/test_t08_v06_delegated_auth.js`,
`test/test_t08_v06_real_adapter_model.js`,
`worker/evidenceforge-llm-proxy/**`, `MISSION.md`,
`fixtures/mission-real-smoke-v1.json` (contenu — voir F-06 pour la
correction de sa DÉCLARATION, jamais de son contenu), `package.json`,
`README-REAL-SMOKE.md`, `.env.example`.

## Fichiers explicitement exclus du paquet final

`EvidenceForge-MONO-08-v0.6-implementation-package*.zip`,
`*-preflight-fix-r3.zip`, `*-real-adapter-model-fix-r4.zip`,
`*-worker-config-preflight-evidence.zip` (archives de rounds
intermédiaires, superseded par la copie de travail actuelle) ;
`REAL-G-DELEGATED-LLM-EVIDENCE-2026-08-31/`,
`real-smoke-preflight-2026-08-31*/`,
`v0.6-corrective-r1-evidence-2026-08-31/`,
`v0.6-corrective-r2-evidence-2026-08-31/`,
`v0.6-preflight-fix-r3-evidence-2026-08-31/`,
`v0.6-real-adapter-model-fix-r4-evidence-2026-08-31/` (dossiers de
preuve par round, superseded). Voir `01-CANONICAL-SOURCE-SELECTION.md`
pour la justification. Historique complet round par round préservé dans
l'historique git du dépôt source, jamais supprimé, seulement non
dupliqué dans ce paquet.
