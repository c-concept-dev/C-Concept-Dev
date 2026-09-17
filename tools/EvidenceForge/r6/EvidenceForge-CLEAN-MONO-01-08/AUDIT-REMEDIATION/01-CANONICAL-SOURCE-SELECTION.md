# 01 — Canonical Source Selection

Méthodologie : comparaison par CONTENU RÉEL (exécution des suites de
tests propres à chaque lot, comparaison aux totaux attendus du registre
MONO-06), jamais par nom de ZIP, date de fichier, ou SHA seul.

## MONO-00

- **Source retenue** : `EvidenceForge-MONO-00-v1.zip` (kit HANDOFF).
- **Raison** : seule révision disponible, aucune ambiguïté.
- **Révisions écartées** : aucune (pas de doublon dans `Mono.zip` pour ce
  lot).
- **Tests** : 27/27 (2 classification + 10 portabilité + 13 T00-15
  dépendances externes, exécutés directement en `python3 <fichier>.py` —
  `pytest` non disponible dans cet environnement ; 2 intégrité manifeste
  Node).
- **Compatibilité aval** : registre `mono-00-frozen-baseline-registry-v1.json`
  consommé tel quel par MONO-01 (`REGISTRY_PATH`).

## MONO-01

- **Source retenue** : la copie IMBRIQUÉE la plus profonde disponible,
  extraite depuis `MONO-05/dependencies/MONO-04/dependencies/MONO-03/
  dependencies/MONO-02/dependencies/MONO-01`.
- **Raison** : la copie imbriquée directement sous MONO-02 seule donnait
  148/148 tests (révision intermédiaire) ; la copie la plus profonde
  (sous MONO-05 complet) donne 172/172, confirmée par diff comme un
  sur-ensemble ajoutant `test_t01_21_eforch_durable_cross_process.js` et
  `test_t01_22_createmono01_integration_backend.js`. Ce sont exactement
  les fichiers dont dépend la preuve CROSS_PROCESS de cette mission
  (`ef-orch-durable-backend-v0.1.js`, `createMono01`).
- **Révisions écartées** : copie imbriquée sous MONO-02 (148/148,
  insuffisante) ; toute copie de `Mono.zip` (non vérifiée indépendamment
  pour ce lot, la copie imbriquée HANDOFF étant déjà supérieure et déjà
  vérifiée bytewise par le gate MONO-06 réel).
- **Tests** : 172/172, `test/run-all.js`.
- **Dépendances imbriquées** : aucune (lot racine).
- **Compatibilité aval** : consommé tel quel par MONO-02/03/04/05 dans
  cette même arborescence.

## MONO-02

- **Source retenue** : `EvidenceForge-MONO-02-R1.zip` (kit HANDOFF).
- **Raison** : `Mono.zip` ne contient que des révisions à 317-324 tests
  (corpus-by-ref-map non rebaseliné) ; MONO-05 lui-même exige exactement
  334 (assertion codée en dur dans
  `test_t05_41_44_nonregression.js::r.count === 334`). `Mono.zip` a donc
  été écarté ENTIÈREMENT pour ce lot (et par cascade MONO-03/04/05) au
  profit du kit HANDOFF déjà validé par un rejeu réel du gate MONO-06 lors
  d'une mission précédente.
- **Révisions écartées** : toutes les révisions MONO-02 de `Mono.zip`
  (324 tests maximum, rebaseline R1 absente).
- **Tests** : 334/334.
- **Compatibilité aval** : nested chain vérifiée bytewise par le gate
  MONO-06 réel (`NESTED_CHAIN`, 0 mismatch).

## MONO-03, MONO-04

- **Source retenue** : `EvidenceForge-MONO-03-R1.zip`,
  `EvidenceForge-MONO-04-R1.zip` (kit HANDOFF), pour la même raison de
  cascade que MONO-02.
- **Tests** : 64/64, 69/69.

## MONO-05

- **Source retenue** : mon propre produit déjà construit et vérifié par
  gate lors de la mission précédente
  (`EvidenceForge-MONO-05-R3-TESTFIX-EXEC-MANIFESTFIX`), correspondant au
  ZIP `EvidenceForge-MONO-05-R3.zip` du kit HANDOFF — correction du test
  Playwright (`test/browser/test_t05_R3_browser_report.js`, synchronisation
  de la capture d'écran) + exclusion documentée de 3 fichiers de capture
  régénérés du manifeste (`manifest/MANIFEST-EXCLUSIONS.md`), jamais un
  contournement du gate.
- **Tests** : 119/119, `AUCUNE REGRESSION` (sous-suite T05-41→44 confirme
  172/334/64/69 en aval).
- **Compatibilité aval** : consommé par MONO-08 (`app/server/config.js`
  fournit `MONO01_PATH`/`MONO02_PATH`/`MONO04_PATH`/`REGISTRY_PATH`/
  `GRAPH_PATH`, réutilisés tels quels par la remédiation MONO-08).

## MONO-06

- **Source retenue** : `EvidenceForge-MONO-06-R3.zip` (kit HANDOFF).
- **Raison** : registre à jour (785 total MONO, 1223 historique) —
  `Mono.zip`/certaines archives plus anciennes encodent un registre
  obsolète (721 total, MONO-05=65 — finding F-11 de l'audit condensé,
  déjà signalé comme risque de gouvernance de version).
- **Tests** : 22/22 (auto-tests du harnais lui-même : détection de
  mutation, redaction de secrets fail-closed, versions jsdom figées,
  timeout réel appliqué).
- **Rôle** : source de vérité pour les totaux attendus par lot — utilisé
  RÉELLEMENT (jamais réimplémenté) pour le rejeu de gate produisant
  785/785, 1223/1223 (`TEST-REPORTS/MONO-00-07/mono-06-gate-replay-report.json`).

## MONO-07

- **Source retenue** : extraction de secours déjà connue-bonne, obtenue
  d'un upload distinct correctement formé (30 fichiers réels,
  `package.json` nommé `evidenceforge-mono-07`).
- **Raison** : le ZIP `EvidenceForge-MONO-07-v1.zip` du kit HANDOFF
  lui-même s'est révélé CORROMPU à l'extraction — dossier racine nommé
  de façon inattendue `MONO-07-4`, composé UNIQUEMENT de fichiers
  AppleDouble macOS (`._*`) sans contenu réel dessous (export macOS
  défaillant). Jamais réparé/reconstruit ; simplement écarté au profit
  d'une extraction déjà vérifiée bonne.
- **Tests** : 127/127 (`node test/run-all.js`), après installation
  manuelle de `playwright@1.56.0` (absent des `devDependencies` déclarées).
- **Compatibilité aval** : `lib/harness-env.js::buildEnv()`,
  `lib/e2e-driver.js::driveRun()` et `lib/mono06-gate.js` réutilisés tels
  quels par MONO-08 (jamais recopiés).

## MONO-08

- **Source retenue** : copie de travail git `EvidenceForge/MONO-08/v0.6/`
  (branche `claude/evidenceforge-mono-08-preflight-ebawdn`), déjà la
  révision la plus mûre disponible (rate-limiter fail-closed, preflight à
  réponse bornée, modèle LLM configurable — corrections r2-r4 d'une
  mission précédente), sur laquelle cette mission applique la
  remédiation F-01→F-06.
- **Raison de l'écart avec les paquets `.zip` versionnés** (`EvidenceForge-
  MONO-08-v0.6-implementation-package*.zip`,
  `*-preflight-fix-r3.zip`, `*-real-adapter-model-fix-r4.zip`) : ce sont
  des instantanés PAR ROUND, déjà tous fusionnés dans la copie de travail
  git — les inclure dans le paquet final créerait exactement le problème
  de gouvernance de version que cette mission corrige (archives
  concurrentes sous un même identifiant). Exclus du paquet final ;
  l'historique complet round par round reste disponible dans l'historique
  git du dépôt source (jamais supprimé, seulement non dupliqué ici).
