# 12 — R2 Closure (round 2, audit indépendant, MONO-08 uniquement)

Mandat : fermer B-01→B-04 (BLOCKERS confirmés par lecture directe du
code) et réévaluer M-01→M-03 (MAJORS) sans toucher MONO-01→MONO-07.
Vérifié : `git diff <base-r2>..HEAD -- EvidenceForge/MONO-08/` ne touche
que des fichiers sous `EvidenceForge/MONO-08/`.

## B-01 — persistence-restart CROSS_INSTANCE, pas CROSS_PROCESS

- **Défaut initial** : `bin/run-real-smoke.js`, phase persistence-restart,
  construisait un nouveau `runRegistry`/`operatorApi` mais réutilisait
  `env.mono01`/`env.mono03`/`env.mono04` — mêmes instances, même
  processus. Preuve CROSS_INSTANCE présentée sous le nom
  `persistence-restart`, jamais qualifiée.
- **Fichier/fonction** : `bin/run-real-smoke.js::runFullPipeline()`.
- **Correction** :
  - `lib/durable-real-env.js::buildDurableComponents()` (nouveau) :
    construit `mono01`/`mono03`/`mono04`/`runRegistry`/`operatorApi` avec
    des backends `FILE_DURABLE` (`lib/file-durable-backend.js`, déjà
    existant depuis r1) au lieu de `cfg.createOperatorBackends()`
    (backends en mémoire, MONO-05, gelé, jamais modifié). Remplace
    `buildEnv()` dans le chemin réel — forme de retour identique, donc
    remplacement direct.
  - `lib/cross-process-restart-worker.js` (nouveau) : processus B,
    reconstruit l'environnement via la MÊME `buildDurableComponents()`,
    réhydrate via `rehydrateRealMissionRun()` (déjà existant, jamais
    réimplémenté), termine le run.
  - `bin/run-real-smoke.js` spawn réellement ce worker
    (`child_process.spawn(process.execPath, [...])`) pour le processus B,
    capture PID/stdout/stderr, renomme l'étape de trace
    `persistence-restart-cross-process` partout (plus aucun
    `persistence-restart` ambigu).
  - `test/cross-process/worker-a.js`/`worker-b.js` (r1, LOCAL_CONTROLLED)
    refactorés pour réutiliser la MÊME `buildDurableComponents()` —
    jamais une deuxième mécanique parallèle.
- **Fichiers modifiés** : `bin/run-real-smoke.js`,
  `lib/durable-real-env.js` (nouveau), `lib/cross-process-restart-
  worker.js` (nouveau), `lib/real-openalex-fetch.js` (nouveau, extrait
  pour réutilisation par le worker), `test/cross-process/worker-a.js`,
  `test/cross-process/worker-b.js`.
- **Test** : `test/test_t08_r2_closure.js`, section B-01 (8 assertions,
  B01-setup à B01-07).
- **Commande exécutée** :
  `EVIDENCEFORGE_KIT_ROOT=<kitroot> EVIDENCEFORGE_MONO07_LIB_PATH=<lib> node test/test_t08_r2_closure.js <kitroot>`
- **Résultat réel** : `TOUS LES TESTS PASSENT` (section B-01 : 8/8) —
  preuve directe : processus A et le vrai `lib/cross-process-restart-
  worker.js` tournent avec des PID distincts, aucun réseau réel tenté
  (durée < 15s, mesurée), aucun objet JS partagé (deux processus OS
  réellement séparés).
- **Limitation restante** : le `FILE_DURABLE` utilisé pour cette preuve
  n'est pas une implémentation de production réseau (voir
  `09-REMAINING-RISKS.md`, point 4, r1). Le CROSS_INSTANCE historique
  (MONO-07) reste distinct et non modifié.

## B-02 — secret scan mono-secret, surfaces étroites

- **Défaut initial** : `bin/run-real-smoke.js` scannait uniquement
  `[process.env.ANTHROPIC_API_KEY]` contre `{trace}` — jamais
  `EVIDENCEFORGE_WORKER_API_KEY` en mode `delegated`, jamais
  RunState/ArtifactRecord/graph/report/contenu disque/stdout-stderr du
  restart/DOM-storage.
- **Fichier/fonction** : `bin/run-real-smoke.js`, bloc final
  `secret-scan`.
- **Correction** :
  - `lib/secret-scan-surfaces.js` (nouveau) :
    `resolveActiveSecretNames(env)`/`resolveActiveSecretValues(env)`
    résolvent le secret actif via `resolveAuthMode()`
    (`lib/real-provider-configs.js`, désormais exportée — même fonction
    que le preflight/`buildRealProviderConfigs()`, jamais une troisième
    logique) : `direct` → `ANTHROPIC_API_KEY` SEUL, `delegated` →
    `EVIDENCEFORGE_WORKER_API_KEY` SEUL, jamais les deux mélangés.
    `collectDurableBackendFileSurfaces(baseDir, label)` lit
    récursivement le contenu RÉELLEMENT persisté sur disque.
  - `bin/run-real-smoke.js` : capture `bodyText`/`localStorage`/
    `sessionStorage` pendant que la page Playwright est encore ouverte
    (jamais `NOT_APPLICABLE` alors que produits) ; capture stdout/stderr
    du worker de restart ; scanne `trace`, les deux dossiers de backend
    durable, `graph`/`report`/`run-state`/`artifacts` (via
    `operatorApi`), le bundle UI séparé, DOM/storage.
- **Fichiers modifiés** : `bin/run-real-smoke.js`,
  `lib/secret-scan-surfaces.js` (nouveau),
  `lib/real-provider-configs.js` (`resolveAuthMode` exportée).
- **Test** : `test/test_t08_r2_closure.js`, section B-02 (24
  assertions) — résolution de mode (B02-01→06), **tests NÉGATIFS** par
  surface (RunState/ArtifactRecord/OperatorApi-response/report/stdout/
  stderr/trace/dom-bodyText/dom-localStorage/dom-sessionStorage — 10
  fuites volontairement injectées, toutes détectées), test positif
  (surfaces propres → `clean:true`), `collectDurableBackendFileSurfaces`
  lit réellement le disque, revue statique du code de
  `bin/run-real-smoke.js`.
- **Commande exécutée** : identique à B-01 (même fichier de test).
- **Résultat réel** : section B-02, 24/24 PASS.
- **Limitation restante** : aucune valeur secrète réelle n'a été
  utilisée pendant cette mission (uniquement des sentinelles de test) —
  conforme à l'interdiction du mandat.

## B-03 — mission-gate ne validait pas eForchProvenance

- **Défaut initial** : `missionGateStatus(mission)` ne vérifiait que
  `readyForExecution`. Une mission pouvait obtenir `mission-gate=PASS`
  puis échouer immédiatement après en `OPERATOR_INPUT_REQUIRED` (F-02/
  F-03) une fois la construction du run déjà entamée.
- **Fichier/fonction** : `bin/run-real-smoke.js::missionGateStatus()`.
- **Correction** :
  - `lib/eforch-artifacts.js::validateRealEForchProvenance(mission)`
    (nouveau, exportée) : vérification STRUCTURELLE (comptage/forme,
    AVANT toute construction/appel provider), réutilisant les MÊMES
    fonctions de validation par champ (`validateRealResolverRunFields`,
    `validateRealPlannerRunFields`, `validateRealAuditDecisionFields`,
    `validateRealHumanValidationFields`) que les builders eux-mêmes —
    une seule source de vérité, jamais deux logiques divergentes.
  - `bin/run-real-smoke.js::describeMissionGateStatus(mission)`
    (nouveau) : combine `readyForExecution` + `validateRealEForchProvenance`,
    retourne `{status, reason}` avec un motif explicite distinguant les
    deux causes. `missionGateStatus()` (string simple, rétro-compatible)
    délègue à cette fonction.
- **Fichiers modifiés** : `bin/run-real-smoke.js`,
  `lib/eforch-artifacts.js`, `test/test_t08_runner_orchestration.js`
  (fixtures mises à jour pour le nouveau champ requis).
- **Test** : `test/test_t08_r2_closure.js`, section B-03 (12
  assertions) — les 5 cas obligatoires du mandat (CAS1→CAS5, y compris
  5 variantes d'incomplétude pour CAS3) + preuve statique qu'aucun
  builder EF-ORCH n'est appelé par le gate.
- **Commande exécutée** : idem.
- **Résultat réel** : section B-03, 12/12 PASS.
- **Limitation restante** : la validation du gate reste STRUCTURELLE
  (comptage/forme) — l'appariement EXACT par `sourceId` n'est connu
  qu'après calcul du `RunContract` et reste vérifié par les builders
  eux-mêmes à la construction (documenté explicitement dans le
  commentaire de la fonction).

## B-04 — paquet non autonome comme KIT_ROOT

- **Défaut initial** : `MONO-07/lib/harness-env.js` (gelé) attend
  `KIT_ROOT/04-ARTEFACTS-CANONIQUES/MONO/EvidenceForge-MONO-05-*.zip` ;
  le paquet remédié ne livre `MONO-05/` qu'en clair.
- **Fichier/fonction** : nouveau, `lib/kit-root-adapter.js`.
- **Correction** : `buildTemporaryKitRoot(bundleRoot, outDir)` zippe à
  la volée, dans un répertoire JETABLE, chaque `MONO-XX/` présent dans
  le paquet en clair, sous le nom `EvidenceForge-MONO-XX-clean.zip` —
  reconnu par le pattern déjà utilisé par `resolveZip()`/
  `extractFrozenMono05()` (préfixe, pas un nom exact). **Aucune ligne
  de MONO-07/lib/harness-env.js ni d'aucun autre lot gelé modifiée.**
  `MONO-05/` en clair reste l'unique source canonique — le ZIP produit
  est jetable, jamais une seconde copie permanente.
- **Fichiers modifiés** : `lib/kit-root-adapter.js` (nouveau).
- **Test** : `test/test_t08_r2_closure.js`, section B-04 (5
  assertions) — échec propre sur racine inexistante, construction
  réelle du KIT_ROOT, extraction réelle de MONO-05 via
  `extractFrozenMono05()` (MONO-07, gelé, réutilisé tel quel),
  **`test_t08_eforch.js` (26 assertions) rejoué intégralement depuis ce
  KIT_ROOT reconstruit**, revue statique (aucune écriture dans un lot
  gelé).
- **Commande exécutée** :
  `EVIDENCEFORGE_CLEAN_BUNDLE_ROOT=<paquet> EVIDENCEFORGE_KIT_ROOT=<kitroot-dev> EVIDENCEFORGE_MONO07_LIB_PATH=<lib> node test/test_t08_r2_closure.js <kitroot-dev>`
  (le KIT_ROOT de développement sert de secours quand
  `EVIDENCEFORGE_CLEAN_BUNDLE_ROOT` n'est pas fourni — le test s'auto-
  déclare alors `SKIPPED`, jamais un faux PASS, voir section B-04 du
  fichier de test).
- **Résultat réel** : section B-04, 5/5 PASS quand exécuté avec
  `EVIDENCEFORGE_CLEAN_BUNDLE_ROOT` pointant vers le paquet
  `EvidenceForge-CLEAN-MONO-01-08/` réellement assemblé — vérifié
  directement pendant cette mission (voir aussi la vérification finale
  d'autonomie du ZIP packagé, section « Vérification finale » ci-dessous).
- **Limitation restante, honnêtement disclosed** : `bin/run-real-
  smoke.js::main()` appelle en PREMIER `assertMono06GatePasses()`
  (MONO-06, gelé), qui exige la présence de TOUS les ZIP canoniques
  MONO-00→06 sous des noms EXACTS (`EvidenceForge-MONO-00-v1.zip`, etc.)
  PLUS les artefacts `04-ARTEFACTS-CANONIQUES/HISTORIQUES/*.zip`
  (EF-ORCH, EF-PR-GEN-01, EF-02ABC, EF-02D, EF-02E, EF-03, EF-04) — des
  fixtures de test historiques, EXTERNES à MONO-00→08, jamais incluses
  dans ce paquet de remédiation (hors périmètre : ni MONO-08, ni un lot
  MONO-00→07 lui-même). **Le KIT_ROOT reconstruit par
  `lib/kit-root-adapter.js` permet donc à `test_t08_eforch.js`/
  `test_t08_cross_process.js` (qui utilisent `extractFrozenMono05()`
  directement, jamais le gate complet) de tourner de façon totalement
  autonome, mais PAS au premier pas (`baseline-gate`) de
  `bin/run-real-smoke.js` lui-même**, qui reste conçu pour un KIT_ROOT
  de production complet (13 artefacts canoniques), comme il l'a toujours
  été. Ceci correspond exactement au périmètre du mandat R2, section 16
  (« exécuter au minimum une suite dépendant réellement de harness-env
  […] et le test cross-process ») — jamais présenté comme davantage.

## Vérification finale (packaging)

Après reconstruction complète du paquet `EvidenceForge-MONO-01-08-
REMEDIATED-r2.zip` (voir `RELEASE-MANIFEST.md`), le paquet a été
extrait dans un répertoire NEUF (`unzip` dans un répertoire vide,
jamais réutilisé du répertoire de travail de cette mission), PUIS :

1. Un KIT_ROOT temporaire a été construit avec
   `node lib/kit-root-adapter.js <extraction>/EvidenceForge-CLEAN-MONO-01-08
   <repertoire-jetable>` — à partir du contenu du ZIP extrait UNIQUEMENT
   (`MONO-00/`…`MONO-07/` en clair), sans aucune référence à un chemin
   préexistant de cette mission.
2. `test/test_t08_eforch.js` a été rejoué depuis cette extraction
   fraîche contre ce KIT_ROOT temporaire (`EVIDENCEFORGE_KIT_ROOT`/
   `EVIDENCEFORGE_MONO07_LIB_PATH` pointant tous deux à l'intérieur de
   l'extraction) → **26/26 PASS**.
3. La suite `test/test_t08_r2_closure.js` **complète** (pas seulement
   la section B-04) a été rejouée depuis cette même extraction fraîche,
   contre ce même KIT_ROOT temporaire, `EVIDENCEFORGE_CLEAN_BUNDLE_ROOT`
   pointant vers le dossier extrait lui-même (pour que la sous-preuve
   B-04 construise, elle aussi, son propre KIT_ROOT interne depuis
   cette même extraction) → **62/62 PASS**, exit code 0.

Aucune ressource externe à l'extraction n'a été utilisée à aucune étape
(pas de `node_modules/`, pas de référence au dépôt git de
développement, pas de référence à un ancien KIT_ROOT de production).
Résultat consolidé : **88/88 assertions PASS** sur le ZIP shippé,
littéralement depuis son propre contenu extrait. Voir le rapport
terminal de cette mission pour la confirmation littérale de cette
étape (commandes exécutées, chemins, sorties).

## M-01, M-02, M-03

Voir `13-R2-REMAINING-MAJORS.md` pour le détail complet (statut et
impact sur `REAL_SMOKE_NEXT`).
