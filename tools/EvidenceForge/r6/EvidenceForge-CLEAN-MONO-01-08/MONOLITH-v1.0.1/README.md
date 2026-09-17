# EvidenceForge — MONOLITH v1.0.1

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

Au démarrage, l'intégrité des quatre lots gelés (sceaux + zips canoniques MONO-10 v0.19 et MONO-11 v0.2) est vérifiée : un lot altéré **empêche le démarrage** (`FROZEN_LOT_ALTERED`).

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
- Réponses LLM : politique gelée MONO-11 v0.2 (`llm-response-reuse`) — une réponse **réelle validée** pour un prompt octet-identique est réutilisée (`reused:true`, jamais comptée comme un appel réel) ; une réponse invalidée provoque un nouvel appel réel. Magasin partagé `runs/llm-reuse-store.jsonl`, corps en cache par hash.
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
node test/test-monolith.js          # 46 tests : intégrité, mission, screening, ratification, kit EF-01 (reprise bornée), adaptateur, LLM (fail-closed, credit, 429, timeout, réseau, reuse), rapport (hash, reimport), pipeline (document refusé), serveur, UI, anti-hardcoding, secrets
node tools/anti-hardcoding-scan.js  # EVIDENCEFORGE_CASE_ARTIFACTS=<json:json> pour injecter les jetons d'un cas réel
node tools/secret-scan.js
node tools/build-manifest.js        # MANIFEST.json + SHA256SUMS.txt ; --verify
sh tools/package.sh                 # manifeste + EvidenceForge-MONOLITH-v1.0.1.zip
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
