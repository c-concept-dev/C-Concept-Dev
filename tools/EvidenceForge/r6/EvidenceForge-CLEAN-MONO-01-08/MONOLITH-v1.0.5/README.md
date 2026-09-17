> **v1.0.5 — Screening Cost Optimizer (2026-09-17, 0 USD).** Règle **SCREENING-EVIDENCE-NORMALIZATION-v1** (`lib/screening-normalization.js` : forme seule, mots entiers, fragment littéral réel rendu, trace hachée), champ `lieu` accepté comme preuve (option A documentée), **reprise partielle** des seuls items refusés (`lib/batch-judge.js`, items valides immuables, lignée), bornes de sortie demandées au modèle, périmètre configurable de la revue de portefeuille (défaut inchangé). Rejeu des 4 runs réels (`tools/screening-replay.js`) : 5ad77c88 1,333 → 0,897 USD déterministe (−33 %), 0,724 estimé (−46 %) ; 4 runs −35 % démontré ; **0 faux accept**. Tests SCREEN-COST-01…18, monolith 176/176. Aucun appel réel ; smoke proposé, non lancé — **NON GELABLE**. Docs : `SCREENING-COST-OPTIMIZER-{AUDIT,BENCHMARK,IMPLEMENTATION}.md`.

> **v1.0.5 — Audit « Professional Economic Stop » (2026-09-17, 0 USD).** `PROFESSIONAL-ECONOMIC-STOP-AUDIT.md` (rejeu des 4 runs réels, familles de règles A–E : rendement/taux ⇒ faux arrêts sur 3 runs/4 ; probabiliste/budget ⇒ 2–20 % sans perte de jalon ; futilité déterministe certaine mais nulle ; levier principal = budget par étape) et `SCREENING-COST-AUTOPSY.md` (1,33 USD, 35 % en reprises dont 91 % structurellement évitables, ≈ −0,7 USD/run estimé). Correctif additif livré : état partiel du panel persisté sur arrêt (`professionals-sufficiency-partial.json`, PRO-PARTIAL-01/02). Aucune policy économique codée — **AUDIT_READY_FOR_POLICY_DECISION**.

> **v1.0.5 — Panel Sufficiency Policy v2 (2026-09-17).** Audit de la règle d'arrêt anticipé (`AUDIT-PANEL-SUFFICIENCY-POLICY.md`) : le « 3 admissibles par angle » comptait des SUPPORTED avant le gate, sur la dimension primaire, sans indépendance, et un vivier épuisé à 0 admissible comptait comme « satisfait ». Correctif : **PANEL-SUFFICIENCY-v2** (`professionals.earlyStop.policy`, `provenance: PRODUCT_POLICY`) — représentation = approuvés par le gate gelé soutenant l'angle ; **plancher contractuel 2 indépendants** (anti-mono-jumeau EF-03C, non abaissable) ; marge produit 3 conservée et tracée ; indépendance = aucune œuvre ni source-graine partagée ; états `DIMENSION_SUFFICIENT / EXHAUSTED_PARTIAL / EXHAUSTED_EMPTY / NO_POOL / CONTINUE` et `PANEL_SUFFICIENT / PANEL_EXHAUSTED_WITH_GAPS / PANEL_CONTINUE` ; `EARLY_STOP_CONFIRMED` uniquement sur `PANEL_SUFFICIENT`. Audit adversarial de la normalisation des références (WORKREF-ADV-01…08). Comptage des indépendants = ensemble indépendant maximal glouton (pas maximum : ne sur-estime jamais, peut sous-estimer, tracé `independenceAlgorithm`). Tests : 156/156 (+23). Validation réelle (`RAPPORT-PANEL-SUFFICIENCY-v2-REAL-VALIDATION.md`, run `5ad77c88`, 2,54 USD, plafond 2,50) : logique conforme en exploitation, mais ni PANEL_SUFFICIENT ni PANEL_EXHAUSTED_WITH_GAPS atteint (budget borne à 26/150 évaluations) — **NON GELABLE**. Rapport : `RAPPORT-PANEL-SUFFICIENCY-POLICY.md`.

> **v1.0.5 — Professional Panel Cost Optimizer (2026-09-17).** Autopsie du run réel à 5,02 USD (`AUTOPSIE-PANEL-COST-OPTIMIZER.md`) : 86 évaluations réelles (pas 150), 16 % de l'étape perdus en « réparations » sur des références typographiques, ordre d'évaluation groupé par discipline, admissions rares et sans plateau. Correctifs additifs : **normalisation des références d'œuvres** (`lib/workref-normalization.js`, MONOLITH-WORKREF-NORMALIZATION-v1, journalisée) ; **ordre tourniquet** (`selectionOrder`) ; **early-stop par suffisance** (`lib/panel-sufficiency.js`, PANEL-SUFFICIENCY-v1, **remplacée par v2** — voir l'encadré ci-dessus) ; **routage de modèle par finalité** (mécanisme `llm.routing`, aucune route par défaut, benchmark `tools/bench-oracle-model.js`). Tests : 133/133 (+17 : PRO-EARLY-01…12, WORKREF-01…04, ROUTING-01). Rapport : `RAPPORT-PANEL-COST-OPTIMIZER.md`.

> **v1.0.5 (2026-09-17) — CANDIDAT : COÛT RÉEL, BUDGET DUR, PROJECTION, REVUE DE PORTEFEUILLE DU CORPUS, ÉCONOMIE DU PANEL, CADRAGE, AIDE.** Chantier correctif motivé par le run réel `efm-20260917-f8a95282` (JMJS / D103P0.1 : 99 publications, 12 incluses, 123 professionnels évalués, ≈ 19 USD consommés sans visibilité). Tout est **additif** dans la couche monolithe ; aucun lot gelé, aucun kit, aucun contrat scientifique, aucune porte humaine touchés (`FROZEN-HASHES-BEFORE-AFTER.md`, tests NONREG-01…06). Nouveautés : `config/llm-pricing.json` (**autorité unique** de tarification, versionnée), `runs/<runId>/cost-ledger.jsonl` (**append-only**, une ligne par appel réel — transport principal, kits EF-01B/EF-01C1 capturés par l'adaptateur MONO-04, sonde MONO-10, preflight — et par reuse à coût 0 ; `pricing-snapshot.json` par run), `budget.json` (plafond + alerte, fixés à la création ou à tout moment via `POST /api/runs/:id/budget`, **vérifiés AVANT chaque appel réel** ; plafond atteint ⇒ `STOPPED / BUDGET_LIMIT_REACHED`, reprenable après augmentation explicite), `GET /api/runs/:id/cost` (ACTUAL séparé d'ESTIMATE — NOT GUARANTEE, `UNKNOWN` quand rien n'est mesurable), `corpus-portfolio-review.json` (signaux de niveau corpus avant la Porte 2 : redondances, couverture par angle, sous/sur-représentation, `DOMAIN_RELEVANCE` vs `METHODOLOGICAL_RELEVANCE` ; `notADecision`), `professionals-economics.json` (coût, gain marginal, couverture nouvelle par rang ; **cap 150 = garde, aucun early-stop**), `POST /api/preflight` (« Vérifier ma demande avec l'IA », hors run, ne modifie rien), panneau « Aide ». Voir `AUTOPSIE-POST-RUN-COST-SCREENING.md`, `PLAN-CORRECTIF-COST-SCREENING-v1.md`, `RAPPORT-FINAL-COST-SCREENING-v1.0.5.md`. Tests : 116/116 (`test/test-monolith.js` + `test/test-v105.js`) + 20/20 navigateur (`tools/browser-tests-v105.js`). Reconstruction lecture seule du coût d'un run antérieur : `node tools/reconstruct-cost.js <runDir>`.

> **v1.0.4 (2026-09-16) — INTÉGRATION CONTRÔLÉE MONO-11 v0.3-r1 (GELÉ par gouvernance, zip `3c44b397…6b0b`).** Le monolithe consomme le lot MONO-11 v0.3-r1 **tel quel** (composition + adaptation : `config/monolith.config.json` désigne le lot, `lib/paths.js` en dérive les chemins, la garde de sceau attend `v0.3-r1`) : réparation ciblée `TARGET_REF_NOT_LITERAL` avec **empreinte de contexte de réparation** (reuse d'une réparation = même jumeau / constat / document uniquement ; collision inter-jumeaux impossible), anti-répétition, fail-closed inchangé. Contrat scientifique `MONO-11-v2`, validateur littéral, cap 150, checkpoints, ré-ancrage, lignée : inchangés. Un checkpoint produit sous le sceau v0.2 (ex. H1) n'est **pas** reprenable sous v1.0.4 (`CHECKPOINT_SEAL_MISMATCH`, fail-closed). Statut : **IMPLEMENTATION GELABLE (candidat)**, non gelé, aucun run réel sous cette version ; audit indépendant différentiel requis. Voir `INTEGRATION-REPORT-MONO11-v0.3-r1.md`, `TEST-REPORT-MONOLITH-MONO11-v0.3-r1.md`, `CROSS-TWIN-MONOLITH-TEST.md`, `CHECKPOINT-REANCHOR-TEST.md`, `FROZEN-HASHES-BEFORE-AFTER.md`.

# EvidenceForge — MONOLITH v1.0.5 (candidat) — historique v1.0.3-r1 → v1.0.4 → v1.0.5

> **r1 (2026-09-16)** : correctif minimal du ré-ancrage du checkpoint professionnel — la référence `EvidenceForge.ProfessionalsCheckpointRef` est inscrite dans le registre de lignée MONO-11 (`ledger.record`, chaîné et lié au manifeste MONO-10 du run courant) et non plus dans le registre MONO-10 à relations typées, qui la refusait à juste titre (`REGISTRY_TYPE_RELATION_MISMATCH`, run H1 `efm-20260915-2584bf6c`). L'assessment reste enregistré dans MONO-10 sous sa relation canonique. Test réel R5. Aucun lot gelé modifié.

> **V1.0.3 CAP-150 — IMPLEMENTATION GELABLE / SCIENTIFIC SELECTION PROVISIONAL.** Plafond économique produit `MAX_PROFESSIONAL_CANDIDATES_TO_EVALUATE = 150` (décision du propriétaire, 2026-09-16) : sélection déterministe `PROFESSIONAL-SELECTION-v1` (`lib/professional-selection.js`) — statut MONO-10, pertinence, confiance d'identité, origine, preuves, tourniquet disciplinaire ; identités non résolues exclues du plafond ; sélection persistée (`professionals-selection.json`, hash) **avant** tout appel LLM (sonde comprise) ; assessment plafonné transmis à MONO-11 ; garde dure `EVALUATION_CAP_INVARIANT_VIOLATION` ; reprise sur la même sélection (hash vérifié). La politique de sélection reste **provisoire** et révisable après les conclusions H1 (elle n'est pas déclarée scientifiquement optimale).

> v1.0.2 = correctifs P0/P1 post-autopsie (fiabilité du parcours réel : pannes de transport, checkpoints durables, reprise au dernier stage terminé, reuse liée au contexte, portes/reprise accessibles, traceur). Voir « Changements v1.0.2 ».
>
> v1.0.1 = correctif produit minimal après l'audit final de v1.0 (`PASS_WITH_NON_BLOCKING_DEBT`). Aucun lot gelé modifié, aucun contrat scientifique changé, porte 2 conservée. Voir « Changements v1.0.1 » en fin de document.

Premier EvidenceForge **utilisable par un utilisateur** : une question (et, si l'on veut, des documents texte) → reformulation → confirmation → pipeline automatique → rapport lisible (établi / convergent / divergent / provisoire / non établi / réserves / qualification / limites) avec, pour chaque énoncé, « **Pourquoi EvidenceForge dit cela ?** » (la lignée complète), exports JSON et PDF.

Le monolithe **compose** les lots gelés sans les réécrire : EF-01B/C1 (kit d'exploitation r1.3) → MONO-08 v0.6/v0.8 (retrieval réel, RetrievalSnapshot, POST_RETRIEVAL_GATE, EF-02A…EF-04 via le graphe MONO-02/MONO-05/MONO-07) → MONO-09 v0.2 (découverte/identité) → MONO-10 v0.19 (frontière de confiance, manifeste de run, évaluation, capacité LLM certifiée) → MONO-11 v0.2 (**GELÉ**, sceau vérifié avant chargement : panel autonome, couverture, jumeaux, revues, agrégation, qualification composée).

## Pourquoi un dossier et pas un HTML autonome

La contrainte est réelle, pas de confort : les lots gelés sont des modules Node (`require`), écrivent des backends durables sur disque (MONO-05/MONO-08), vérifient des sceaux `SHA256SUMS` par lecture de fichiers, et exigent un transport réel authentifié par un secret d'environnement qui **ne doit jamais** être embarqué dans une page. Un HTML seul ne peut ni charger ces modules, ni lire le système de fichiers, ni détenir le secret. Le livrable est donc le **dossier minimal** prévu par le mandat :

```
MONOLITH-v1.0/
  index.html          interface unique (mode simple + mode expert, desktop/mobile, impression PDF)
  server.js           serveur LOCAL 127.0.0.1 : API JSON + flux d'événements
  config/monolith.config.json   configuration (aucun secret)
  lib/                adaptateurs additifs (mission, EF-01, retrieval/screening, professionnels/MONO-11, rapport, pipeline, LLM)
  vendor/operator-kit-r1.3/     copies octet-à-octet des cœurs du kit d'exploitation (résolveur, planificateur, RunContract, SearchProtocol, provenance)
  tools/              scans (anti-hardcoding, secrets), manifeste, import d'un run scellé (preuve d'intégration)
  test/               suite de tests (fakes, aucun réseau) + résultats
  runs/               runs de l'utilisateur (créé à l'usage ; exclu du paquet)
```

Le dossier vit **à côté** des lots gelés du bundle R6 (`bundleRoot: ".."`) : il ne copie ni ne modifie MONO-01, MONO-09, MONO-10, MONO-11.

## Démarrage

Prérequis : Node ≥ 20, le bundle `EvidenceForge-CLEAN-MONO-01-08` (lots gelés intacts), les racines EF-01B/EF-01C1 (`config/monolith.config.json → operatorKit`), et le transport réel dans l'environnement :

```
export LLM_AUTH_MODE=delegated
export LLM_WORKER_BASE_URL=…        # jamais dans un fichier du paquet
export EVIDENCEFORGE_WORKER_API_KEY=…   # jamais dans un fichier du paquet
node server.js                       # http://127.0.0.1:8765
```

Au démarrage, l'intégrité des quatre lots gelés (sceaux + zips canoniques MONO-10 v0.19 et MONO-11 v0.3-r1) est vérifiée : un lot altéré **empêche le démarrage** (`FROZEN_LOT_ALTERED`).

## Mode simple (ce que voit l'utilisateur)

1. **Votre demande** (+ documents `.txt`/`.md` facultatifs) → « Analyser ma demande ».
2. EvidenceForge reformule la demande, identifie les angles d'expertise, prépare le plan de recherche.
3. **Porte 1 — « Confirmer et lancer l'analyse »** : l'utilisateur lit la compréhension, les angles, le plan, saisit son nom et confirme. *Acte humain réel exigé par le contrat gelé MONO-08 v0.6 (validation humaine du SearchProtocol en mode REAL) — jamais simulé.*
4. Recherche réelle dans la base de publications (OpenAlex), lecture des résumés réels, **proposition machine de tri** (schéma fermé, preuves littérales).
5. **Porte 2 — « Ratifier et poursuivre »** : l'utilisateur parcourt la sélection proposée, peut inverser un choix, saisit son nom et ratifie. *Acte humain réel exigé par le contrat gelé (chaque décision de screening porte `acteur:"human"`) — jamais simulé.*
6. Pipeline automatique : corpus → découverte et évaluation des professionnels → porte machine à base de preuves (MONO-11) → jumeaux documentaires → revues → agrégation → qualification → **rapport**.
7. Rapport, « Pourquoi EvidenceForge dit cela ? », exports JSON / PDF (impression).

L'utilisateur ne choisit **ni** professionnel **ni** discipline, ne voit **aucun** code EF-*, ne gère **aucun** checkpoint, ne répare **aucun** JSON. Les deux confirmations sont les seules interventions ; elles sont imposées par les contrats gelés et sont présentées comme telles.

## Mode expert

Onglets : état / mission, RunContract, plan / SearchProtocol, sources / snapshot, screening, corpus, candidats, évaluation MONO-10, gate machine, corpus professionnels, jumeaux, revues, agrégation, qualification, run MONO-10 / sceau, lignée / hashes, appels LLM (réel vs réutilisation), journal, fichiers. Tout est l'artefact brut, jamais une reformulation.

## Qualification et usage scientifique

Le rapport affiche toujours :

```
PROCESS_QUALIFICATION = <statut MONO-11 : QUALIFIED | QUALIFIED_WITH_RESERVATIONS | NOT_QUALIFIED | IMPOSSIBLE_TO_ASSESS>
SCIENTIFICALLY_USABLE = <calculé : YES seulement si QUALIFIED sans aucune réserve ET validation professionnelle humaine réelle ; sinon NO>
```

`QUALIFIED_WITH_RESERVATIONS` n'est **jamais** présenté comme « validé scientifiquement » ; l'en-tête du rapport l'écrit explicitement.

## Reprise, indisponibilités, fail-closed

- L'état d'un run (`runs/<runId>/state.json`) est la seule vérité ; une étape terminée n'est jamais rejouée ; la reprise repart de la première étape manquante.
- Réponses LLM : politique gelée MONO-11 (`llm-response-reuse`, byte-identique v0.2 → v0.3-r1) — une réponse **réelle validée** pour un prompt octet-identique est réutilisée (`reused:true`, jamais comptée comme un appel réel) ; une réponse invalidée provoque un nouvel appel réel. Magasin partagé `runs/llm-reuse-store.jsonl`, corps en cache par hash.
- Fournisseur : `PROVIDER_NOT_CONFIGURED`, `PROVIDER_CREDIT_EXHAUSTED`, `PROVIDER_RATE_LIMITED` (attente bornée puis reprise), `PROVIDER_TIMEOUT`, `NETWORK_UNAVAILABLE`, `PROVIDER_UNAVAILABLE` → run **STOPPED (reprenable)** avec message utilisateur ; jamais un faux succès.
- Erreur de contrat (lot altéré, snapshot altéré, identité absente, schéma…) → run **FAILED**, non reprenable, message explicite.
- Le `runId` du monolithe et le sceau MONO-11 sont conservés ; chaque tentative ouvre un nouveau run MONO-10 (`<runId>-a<n>`) avec sa propre attestation (validité 8 h, choix d'exploitation consigné).

## Preuve d'intégration P0.1

`node tools/import-sealed-run.js --source <P0.1-RUN> --manifest P0.1-EVIDENCE-MANIFEST.json --state P0.1-RUN-STATE-PHASE2-V02.json` importe, **en lecture seule et après vérification de chaque hash**, le run P0.1 scellé (seal B) et construit son rapport par le même code que les runs natifs. Il s'affiche `PROCESS_QUALIFICATION = QUALIFIED_WITH_RESERVATIONS`, `SCIENTIFICALLY_USABLE = NO`. Aucun appel LLM, aucun réseau. P0.2 n'est pas démarré.

## Limites déclarées (v1.0)

- Documents : texte brut `.txt`/`.md` seulement (pas de PDF) ; limite 2 Mo par document.
- Screening : proposé sur métadonnées + résumés réels, ratifié par l'utilisateur ; aucun texte intégral lu.
- Angles d'expertise : politique `AUTO_RETAIN_VALID_PROPOSALS` sans revue humaine (réserve consignée) ; une ambiguïté bloquante arrête le run, jamais tranchée en silence.
- Le panel est admis par une porte machine (MONO-11) : réserve permanente `PANEL_ADMITTED_BY_MACHINE_EVIDENCE_GATE_WITHOUT_HUMAN_ACT`.
- Serveur local mono-utilisateur, sans authentification (127.0.0.1 uniquement).

## Tests, scans, manifeste

```
node test/test-monolith.js          # 64 tests (+ tools/browser-tests.js : 12 tests navigateur reels via CDP) : intégrité, mission, screening, ratification, kit EF-01 (reprise bornée), adaptateur, LLM (fail-closed, credit, 429, timeout, réseau, reuse), rapport (hash, reimport), pipeline (document refusé), serveur, UI, anti-hardcoding, secrets
node tools/anti-hardcoding-scan.js  # EVIDENCEFORGE_CASE_ARTIFACTS=<json:json> pour injecter les jetons d'un cas réel
node tools/secret-scan.js
node tools/build-manifest.js        # MANIFEST.json + SHA256SUMS.txt ; --verify
sh tools/package.sh                 # manifeste + EvidenceForge-MONOLITH-v1.0.2.zip
node tools/browser-tests.js <runsRoot>   # tests navigateur (serveur sur 8766, runs de test seedes — voir FUNCTIONAL-TEST-REPORT)
```

Voir `NON-REGRESSION.md`, `UX-ACCEPTANCE.md`, `FUNCTIONAL-TEST-REPORT.md`, `PRIVACY-SECRET-SCAN.md`, `FROZEN-INTEGRITY.md`.

## Changements v1.0.1 (correctif produit minimal)

- **Planificateur / résolveur (kit EF-01, gardes gelés)** : `lib/stage-ef01.js → kitAttempts` — reprise **bornée** (`llm.kitMaxAttempts`, 3) et **consciente de l'erreur** (l'erreur de la tentative précédente est consignée dans `ef01-evidence/<planner|resolver>/attempts.jsonl`), preuves de **chaque** tentative conservées dans `attempt-<n>/` (jamais écrasées, numérotation continue entre reprises), compteur `kitRealCalls` incrémenté **avant** chaque appel (exact même en cas d'échec), `llmReal`/`llmReused` persistés aussi en cas d'échec, message utilisateur explicite (`PLANNER_OUTPUT_INVALID`, `RESOLVER_OUTPUT_INVALID`, …), fail-closed après le nombre borné de tentatives. Limite déclarée : le **prompt gelé** EF-01B/EF-01C1 ne peut pas recevoir l'erreur ; la reprise est informée au niveau de l'orchestrateur, pas du prompt.
- **Rapport (mode simple)** : plus de débordement horizontal (`overflow-wrap:anywhere`, mesuré 1280 px et 400 px : `scrollWidth == clientWidth`) ; codes de réserves, critères, readiness, sceaux et hashes **repliés par défaut** dans « Détails techniques » (et intégralement en mode expert) ; libellés d'angles humanisés (`sciences-de-gestion` → « Sciences de gestion ») ; la limite « EF-03B » reformulée sans code.
- **PDF** : page 1 contient le rapport (plus de saut de page avant la carte « Rapport ») ; toutes les sections « Pourquoi EvidenceForge dit cela ? » sont **ouvertes le temps de l'impression** (`beforeprint`/`afterprint`) ; lignes longues coupées proprement.
- **Document refusé** : le serveur refuse le lancement (`DOCUMENTS_REJECTED`, HTTP 400) tant que l'utilisateur n'a pas explicitement accepté de continuer sans le document (`acknowledgeRejected: true`) ; l'interface pose la question.
- **Porte 2** : notification claire quand la ratification est requise (bandeau collant, titre d'onglet « ⚠ Action requise », notification système si autorisée, défilement vers la porte). La porte 2 n'est **pas** supprimée.
- **Export JSON réimportable** : hash canonique du rapport (`computeReportHash`, exclut `generatedAt`, `reportHash`, `importedFrom`, `exportedAt`), `verifyReportHash`, endpoint `POST /api/reports/import` et « Importer un rapport JSON exporté » sur la page d'accueil (run `IMPORTED_REPORT`, lecture seule). Limite déclarée : un export JSON contient le **rapport**, pas les artefacts détaillés du run d'origine (ceux-ci restent dans `runs/<runId>/`).
- **Documentation** : écarts factuels corrigés (nombre de tests, `filesScanned`, débordement, référence à la décision de gel MONO-11 v0.2 copiée dans `governance/`, statut historique « NON GELÉ » du MANIFEST MONO-11 clarifié dans `FROZEN-INTEGRITY.md`).

## Changements v1.0.2 (P0/P1 post-autopsie, aucun lot gelé modifié)

- **Panne ≠ insuffisance documentaire** (`lib/llm.js`, `lib/stage-professionals.js`) : verrou de panne de transport — la première panne fatale (réseau, délai, crédit, débit épuisé, fournisseur, OpenAlex 429/5xx) est mémorisée ; tout appel suivant échoue immédiatement sans réseau ; à la frontière de l'étape, `assertNoTransportFailure` arrête le run (STOPPED, reprenable) : **aucun panel ni `PROFESSIONALS DONE` sur une évaluation incomplète pour cause de transport**, même si un lot gelé absorbe l'exception (MONO-11 `corpus_fetch_error`). `aggregation.classificationError` vérifiée avant toute qualification. Sonde de capacité à délai borné.
- **Checkpoints métier durables** : `checkpoint-professionals.json` (assessment, panel, gateInputs, corpusSetAll, dimensionSet, preuves MONO-11 exportées, registre/ledger, hashes d'entrées et de sorties, sceau, versions de lots, runId, attemptId, capacité, attestation, `complete: true`) et `checkpoint-downstream.json` ; ordre calcul → validation → écriture atomique hachée (`contentHash`) → artefacts dérivés → DONE. Jamais DONE puis sauvegarde.
- **Commit atomique** (`run-store.js → writeAtomic`) : fichier temporaire + fsync + rename ; `loadCheckpoint` vérifie le hash et refuse un checkpoint incomplet/altéré (`CHECKPOINT_CORRUPT`, recalcul propre). Le préflight fournisseur ne dégrade plus une étape DONE ; le pointeur d'étape désigne la première étape non terminée.
- **Reprise au dernier stage terminé** : `PROFESSIONALS = DONE` + `TWINS_REVIEWS` interrompue ⇒ reprise à TWINS_REVIEWS depuis le checkpoint (nouveau run MONO-10 de tentative, preuves **ré-ancrées** sous leurs identifiants d'origine, hashes d'origine conservés), sans recalcul du panel ni appel pour les résultats professionnels. Cause racine du bug v1.0.1 corrigée : `done("QUALIFICATION", { status })` écrasait `DONE` par le statut de qualification ⇒ réentrée du bloc aval.
- **Reuse liée au contexte** (`lib/llm.js`) : une réponse n'est réutilisée que si fournisseur, modèle, sceau d'exécution, contrat de validation (`MONO-11-v2`), statut VALID et **hash du corps en cache** concordent ; sinon appel réel journalisé `LLM_REUSE_REFUSED` (motif). Module gelé `llm-response-reuse` inchangé (filtre additif).
- **Portes / reprise accessibles** (`index.html`, `run-store.js`) : `resumable` exposé par l'API ; « Reprendre » pour tout état reprenable (y compris FAILED historique admissible) ; porte active visible et cliquable depuis le mode expert ; échec de chargement de porte ⇒ message + « Réessayer » sans mutation d'état ; source **sans proposition machine** présentée explicitement (défaut « exclure », décision explicite possible, plus de TypeError) ; choix de ratification conservés localement (reconnexion, rechargement).
- **Traceur** : `eventId`, `attemptId`, `stage`, `actor` (user / machine / system), `previousState`/`nextState`, `checkpointRef`, `durationMs`, `normalizedCause`, résultats fournisseur/réseau et `kindOfCall` (call / retry / reuse) par appel LLM, `candidateRef`/`twinId`/`targetId` quand pertinent ; affichage dédoublonné par `eventId`, **heure locale** dans le journal.
- Tests : 64 tests automatiques (X0–X12 ciblés sur les bugs réels) + 12 tests navigateur réels (`tools/browser-tests.js`, `test/browser-results.json`).
