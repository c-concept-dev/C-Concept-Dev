# EVIDENCEFORGE v1.0.15 — PLAN DE SMOKE RÉEL

> **RÉVISION v2 — amendée après la validation propriétaire `APPROVED_WITH_ONE_REQUIRED_AMENDMENT`.**
> Amendements intégrés : **préflight hors ligne complet obligatoire avant la phase B** (amendement requis) · plafond **dur d'appels** indépendant du budget · **gate explicite A → B** · fixtures **synthétiques déterministes** autorisées et préférées · contrôle **taille / tokenisation / présentation réelle** avant fournisseur · **table d'inspection multi-cible à 6 colonnes**.
>
> **PLAN SEULEMENT — RIEN N'EST EXÉCUTÉ.** 0 appel fournisseur, 0 USD dépensé à ce stade.
> **Aucune dépense avant validation propriétaire de ce plan** (§ Validation attendue).
>
> Base : `MONOLITH-v1.0.15` **GELÉE** (`FROZEN_WITH_RESERVATIONS`), audit indépendant `V1_0_15_FREEZE_AUDIT_PASS_WITH_RESERVATIONS` (0 blocker, 11 réserves), décision **D7 = `SMOKE_AUTHORIZED_WITH_CONDITIONS`**.
> `ACTIVE_VERSION` reste **`MONOLITH-v1.0.10`** avant, pendant et après le smoke. Le smoke n'active rien.

## 1. Objectifs et non-objectifs

**Objectifs** — (1) mesurer **R12** : l'effet réel du fail-closed CAS B ; (2) observer le prompt **MONO-11 v0.4** avec fournisseur réel ; (3) vérifier qu'aucune **perte de lignée** ne réapparaît ; (4) mesurer erreurs / reprises / nombre d'appels / coût ; (5) exercer l'**identité cible ↔ document** en situation réelle.

**Non-objectifs** — aucun objectif scientifique nouveau ; aucune activation ; aucune modification de code, de configuration ou de lot gelé.

## 2. Comment v1.0.15 est exécutée sans toucher `ACTIVE_VERSION`

Le lanceur habituel démarre `server.js` du répertoire désigné par `ACTIVE_VERSION`. Comme **D5** l'interdit de changer, le smoke lance **explicitement** le serveur de la version gelée :

```js
const L = require('<repo>/tools/EvidenceForge/bin/launcher.js');
const env = Object.assign({}, L.loadEnvLocal(), { EVIDENCEFORGE_RUNS_ROOT: '<SMOKE_RUNS_ROOT>' });
L.startServer('<repo>/.../MONOLITH-v1.0.15', env, 8769, { logPath: '<SMOKE_RUNS_ROOT>/server.log' });
```

`loadEnvLocal()` est le chargeur officiel des identifiants et `startServer` passe toute sortie par `redact` : **aucun secret n'est affiché**. `ACTIVE_VERSION` n'est ni lue ni écrite par cette procédure.

| Paramètre | Valeur | Raison |
|---|---|---|
| Port | **8769** | distinct de 8768 (instance v1.0.10 courante) : aucune collision |
| Racine de runs | **`~/evidenceforge-work/reports/smoke-v1015-runs`**, vide | racine **isolée** : aucun run ≤ v1.0.14 n'y est visible, donc **aucune reprise ni replay accidentel** (réserve **A4**), et le run historique `efm-20260918-a64167c0` reste hors d'atteinte |
| Modèle | **`claude-sonnet-4-6`** (déjà configuré par variable d'environnement) — 3 / 15 USD par million | modèle d'exploitation établi ; `claude-sonnet-5` reste **interdit** (kits gelés). Le défaut de configuration est `claude-opus-4-8` (5 / 25) |

**Préflight avant tout appel** : `build-manifest --verify` → 169 fichiers · `shasum -c` de la somme de gouvernance → 8/8 · lots gelés → 0 divergence · `GET /api/config` sur 8769 → `MONOLITH-v1.0.15` · sonde de disponibilité fournisseur (déclarée gratuite par le lanceur) · racine de runs vide.

## 3. Budget, plafonds, garde

Le plafond **dur** est posé par run via `POST /api/runs/:id/budget` → `runs/<runId>/budget.json`. Il est vérifié **avant chaque appel LLM réel** ; le dépassement possible est borné par le coût d'**un** appel ; l'atteinte du plafond donne `BUDGET_LIMIT_REACHED` (arrêt fatal, reprenable, checkpoint conservé). **Aucune modification de la configuration gelée n'est nécessaire.**

| | Phase A | Phase B | Enveloppe |
|---|---|---|---|
| Plafond dur de coût (`costBudgetUsd`) | **12 USD** | **20 USD** | **32 USD** |
| Seuil d'alerte | 8 USD | 14 USD | — |
| **Plafond dur d'appels réels** | **80** | **120** | **200** |
| Estimation (projection) | 3 à 8 USD | 5 à 12 USD | — |

**Les deux plafonds sont indépendants : ARRÊT si `coût ≥ plafond` OU `appels ≥ plafond`.**

- **Coût — garde de code, automatique.** `budget.json` est vérifié **avant chaque appel LLM réel** ; dépassement borné par le coût d'**un** appel ; `BUDGET_LIMIT_REACHED` = arrêt fatal, reprenable.
- **Appels — surveillance opérateur, pas une garde de code.** Le produit n'a **aucun** plafond de nombre d'appels : celui-ci est tenu par l'opérateur. Je le dis explicitement pour ne pas lui prêter une garantie qu'il n'a pas. Procédure : compter les lignes `LLM_CALL` de `llm-calls.jsonl` (et `realCalls` de `ef03b-resilience.json` pour la part revues) **toutes les 30 secondes** ; à 80 % du plafond, prévenir sans arrêter ; **au plafond, arrêt immédiat** du run par l'API d'arrêt, verdict de phase FAIL sur le critère de plafond.

**Ancrages mesurés** (run historique A10, tarification Opus 5/25, 10 tentatives) : **36,82 USD** au total, **507 appels réels** — `TWINS_REVIEWS` 28,95 · `PROFESSIONALS` 7,00 · amont 0,88 ; **0,5168 USD** par revue VALID ; **0,2301 USD** par passe. Les estimations ci-dessus sont des **projections** (modèle moins cher, panel minimal, un seul jumeau visé) ; seul `budget.json` est un plafond dur.

**Garde économique** : `economicReviewThresholdUsd = 40`. Si la projection d'avant-revues dépasse 40 USD, le run passe en `WAITING_USER` (gate `ECONOMIC_REVIEW`). Les plafonds proposés sont sous ce seuil ; si le gate se déclenche malgré tout, **ne pas confirmer sans décision propriétaire**.

## 4. Phase A — chemin nominal au coût minimal

**Mode `MISSION_DOSSIER`** (mode de la configuration gelée), **une cible effective**, 1 à 2 documents courts, un seul jumeau si le panel le permet.

**Plafonds durs : 12 USD OU 80 appels réels — le premier atteint arrête la phase.**

**Mesures obligatoires** : `runId` · `targetId` · `documentAuthoritySha256` · nombre de revues · appels réels · appels réutilisés · passes de réparation · **CAS B** · `REFS_PRESENT_BUT_UNRESOLVED` · erreurs · coût · anomalies de lignée · `PROCESS_QUALIFICATION` · `SCIENTIFICALLY_USABLE`.

**Fixture de la phase A** — **synthétique déterministe**, 1 document de 8 000 à 15 000 caractères (très en deçà de `dossierMaxChars = 400 000` : le mode `MISSION_DOSSIER` est conservé). Document de processus professionnel générique (titres, sections, listes, passages citables), réaliste mais entièrement inventé, portant des **pièges de normalisation** — apostrophes typographiques, espaces insécables, CRLF, caractères décomposés NFC — pour que **brut ≠ normalisé** et que la garde d'autorité soit réellement exercée. **Aucune donnée patient, aucune donnée personnelle, rien issu du run historique, aucun *hardcoding* destiné à faire réussir une garde.** La question de mission est générique et vous est soumise avec la fixture.

**Sources** : `ef03b-resilience.json` (`authorityIdentityVerified`, `authorityContextDivergences`, `registryRefusedForeignTarget`, `registryRefusedForeignAuthority`, `registryReuses`, `realCalls`, `truncations`, `completions`, `literalizations`, `contextUnparsed`, `contextContentMismatch`, `cumulativeReviewCostUsd`) · `ef03b-trace.jsonl` · `enforcement-traces.json` · `reviews-valid.jsonl` · `target-document-set.json` · `reviews.json` · `cost-ledger.jsonl` · `llm-calls.jsonl` · `state.json` / `qualification.json` / `report.json`.

**Critères PASS** : run `COMPLETED` sans intervention hors gates prévus · `authorityIdentityVerified > 0` · `authorityContextDivergences == 0` · `registryRefusedForeignTarget == 0` · chaque entrée de `reviews-valid.jsonl` porte **`targetId` ET `documentAuthoritySha256`** · `sha256(autorité tracée) == sha256(document de `target-document-set.json` pour cette cible)` · **aucune référence littérale valide disparue** · aucun résultat vide silencieux après réparation échouée (`REPAIR_UNPARSABLE` tracé, jamais `CANDIDATE_VALID`) · coût ≤ plafond.

## 4 bis. Gate entre la phase A et la phase B

**Jamais d'enchaînement automatique A → B.** Le bilan écrit de la phase A (`EVIDENCEFORGE-v1.0.15-SMOKE-PHASEA-REPORT.md` / `.json`) vous est remis d'abord, avec l'un des verdicts : **`PHASE_A_PASS`**, **`PHASE_A_PASS_WITH_NON_BLOCKING_RESERVATIONS`**, **`SMOKE_FAIL`**.

La phase B est **autorisée** uniquement après `PHASE_A_PASS` ou `PHASE_A_PASS_WITH_NON_BLOCKING_RESERVATIONS`, **et** sur décision propriétaire distincte.

La phase B est **interdite** si la phase A produit `SMOKE_FAIL` ou toute anomalie portant sur : lignée · autorité documentaire · identité de cible · identité de registre · **CAS B non maîtrisé** · garde contournée · coût inattendu substantiel.

## 5. Phase B — multi-cible contrôlée (seulement si la phase A est saine)

**Objectif spécifique** : observer en production réelle que `target-01` reçoit l'autorité de `target-01`, `target-02` celle de `target-02`, `target-03` celle de `target-03`, et qu'**aucune cible ne reçoit l'autorité d'une autre**.

**Comment obtenir PER_DOCUMENT sans toucher la configuration gelée** — `reviewTargetMode = MISSION_DOSSIER` et `dossierMaxChars = 400 000` sont dans `config/monolith.config.json`, **qui est dans le manifeste gelé** : les modifier exigerait d'ouvrir une nouvelle version. Le seul levier légitime est donc de fournir un dossier dont le total **dépasse 400 000 caractères** : le repli `PER_DOCUMENT` est alors déclenché **par le moteur lui-même**, explicitement et journalisé (`REVIEW_TARGET_FALLBACK`).

### 5.1 Fixtures — synthétiques déterministes (autorisées et préférées)

Il n'est **pas** nécessaire d'employer trois documents cliniques réels pour franchir un seuil technique. Les fixtures sont **synthétiques, déterministes et reproductibles** : 3 documents d'environ 140 000 caractères, total supérieur au seuil **lu dans la configuration gelée** (jamais codé en dur dans la fixture).

- structure de dossier professionnel (titres, sections numérotées, listes, paragraphes) — assez réaliste pour suivre le pipeline normal ;
- **identifiants internes distincts**, **passages citables distincts** par document (c'est ce qui permet de vérifier la lignée), empreintes distinctes, pièges de normalisation distincts ;
- génération **déterministe** (aucun aléa, aucune horodate) ; le générateur et les empreintes des fixtures sont consignés dans le préflight ;
- **interdits** : donnée patient, donnée personnelle, tout contenu issu du run historique, et **tout *hardcoding* destiné à faire réussir une garde** ou à satisfaire une règle de validation.

Les fixtures servent uniquement à déclencher **naturellement** le chemin multi-cible ; elles ne doivent jamais aider une garde à passer.

### 5.2 PRÉFLIGHT HORS LIGNE COMPLET — obligatoire avant tout appel de la phase B

**Amendement propriétaire requis.** Avant toute dépense, prouver **hors ligne** que les intrants choisis provoquent réellement `MISSION_DOSSIER → DOSSIER_TOO_LARGE → PER_DOCUMENT` avec plusieurs cibles distinctes. Le préflight exécute localement les fonctions **du produit gelé** (`EP.buildReviewTargets`, `TI.buildCanonicalAuthorityMap`, `F.M01.TDS.buildTargetDocumentSet`, `F.M01.RR.buildReviewPrompt`) — **aucune réimplémentation**.

| Id | Doit démontrer | Mesure |
|---|---|---|
| PF-1 | taille totale > seuil **réel** `dossierMaxChars = 400 000` | somme des longueurs, seuil **lu dans la configuration gelée** |
| PF-2 | repli `DOSSIER_TOO_LARGE` effectivement déclenché | `buildReviewTargets` rend `mode = PER_DOCUMENT` et un `fallbackReason` `DOSSIER_TOO_LARGE` |
| PF-3 | au moins 3 cibles `target-01`, `target-02`, `target-03` | `targets.length ≥ 3` et identifiants attendus |
| PF-4 | association cible/document correcte | contenu de la cible *i* = contenu du document *i* (égalité stricte) |
| PF-5 | trois contenus distincts | 3 sha256 de contenus bruts distincts |
| PF-6 | trois `documentAuthoritySha256` distincts | 3 sha256 de documents **normalisés** distincts (carte canonique) |
| PF-7 | aucun croisement d'autorité | la citation propre au document *i* est présente dans son autorité et **absente** des deux autres |
| PF-8 | aucun appel réseau, 0 USD | exécution purement locale, aucun module de transport chargé, aucune clé utilisée |

**Si l'un de ces points échoue : ne pas lancer la phase B.** Artefacts produits : `EVIDENCEFORGE-v1.0.15-SMOKE-PHASEB-PREFLIGHT.md` / `.json`.

### 5.3 Taille, jetons, présentation réelle — contrôle avant fournisseur

Le seuil est exprimé en **caractères** ; il ne dit rien du coût. Le préflight relève donc, **hors ligne** :

- caractères par document (**mesure**) ;
- **longueur exacte du prompt de revue réellement construit**, par cible, avec le constructeur **gelé** `F.M01.RR.buildReviewPrompt` (**mesure**, pas estimation) ;
- estimation de jetons : **heuristique documentée** (≈ 4 caractères par jeton en français) — c'est une **estimation**, jamais une mesure : aucun tokeniseur local n'existe dans le produit ;
- nombre de cibles, nombre maximal théorique de revues (cibles × jumeaux), nombre maximal théorique d'appels (revues × `reviewMaxPasses = 3`, plus couverture) ;
- la projection économique du produit lui-même (`economic-projection.json`), calculée **avant** les revues ; au-delà de `economicReviewThresholdUsd = 40 USD`, le run passe en `WAITING_USER`.

**Comment le pipeline présente-t-il effectivement les documents ?** Le préflight compte combien de fois le contenu complet d'une cible apparaît dans les prompts d'un run complet (1 passe de base + jusqu'à 2 passes ciblées par revue, × jumeaux). **Si le chemin réel implique l'envoi massif et répété du dossier complet** — le dossier entier au lieu d'une seule cible par appel, ou une répétition non bornée — **STOP, aucune dépense, retour au propriétaire avec la mesure.**

**Contrôle du premier appel réel** : après le **premier** appel de revue de la phase B, suspendre et comparer `usage.input_tokens` (`llm-calls.jsonl` / `cost-ledger.jsonl`) à l'estimation du préflight. **Écart supérieur à 100 % ⇒ arrêt et retour au propriétaire** avant de poursuivre. Le coût de ce contrôle est celui d'un seul appel, borné par le budget dur.

### 5.4 Documents et plafonds

**Documents** : 3 fixtures synthétiques distinctes, ~140 000 caractères chacune, empreintes distinctes, avec des différences de normalisation réelles (apostrophes typographiques, NBSP, CRLF, NFC) pour que **brut ≠ normalisé** sur chaque cible. **Plafonds durs : 20 USD OU 120 appels réels.** Préconditions : **gate A → B franchi** et **préflight PASS**.

### 5.5 Inspection manuelle A1 — table multi-cible obligatoire

Le câblage de `lib/pipeline.js` n'a **aucune couverture comportementale** (mutant `XPIPE` survivant en test) : la vérification en production est **manuelle et obligatoire avant toute conclusion PASS**. Table explicite à six colonnes, une ligne par cible :

| `targetId` | `sourceDocumentId` | `documentAuthoritySha256` | `registryAuthoritySha256` | `reviewId` | `status` |
|---|---|---|---|---|---|

**Sources** : `targetId` et `documentAuthoritySha256` ← `target-document-set.json` (sha256 du contenu) et `ef03b-trace.jsonl` · `registryAuthoritySha256`, `reviewId`, `status` ← `reviews-valid.jsonl` et `reviews.json` · `sourceDocumentId` ← `review-targets.json`.

**Assertions** : pour chaque cible `documentAuthoritySha256 === registryAuthoritySha256` · les empreintes sont **distinctes** entre documents distincts · aucune cible ne porte l'empreinte d'une autre.

**Une seule permutation ou collision inattendue ⇒ `SMOKE_FAIL` et arrêt immédiat.**

**Critères PASS** : ceux de la phase A, plus — repli `DOSSIER_TOO_LARGE` effectivement journalisé · ≥ 2 cibles distinctes réellement revues (3 visées) · table d'inspection A1 conforme 3/3 · aucune entrée de registre servie pour une autre cible.

## 6. Conditions d'arrêt

| Id | Condition | Détection |
|---|---|---|
| S1 | authority mismatch | trace `DOCUMENT_AUTHORITY_MISMATCH` inattendue, ou `sha256(autorité) != sha256(document de la cible)` |
| S2 | target mismatch | `DOCUMENT_AUTHORITY_TARGET_MISMATCH`, ou couple croisé dans l'inspection manuelle |
| S3 | context divergence inattendue | `DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE` ou `authorityContextDivergences > 0` |
| S4 | le registre sert une mauvaise cible | revue réutilisée dont l'entrée porte un autre `targetId` |
| S5 | ancienne entrée sans `targetId` réutilisée | entrée servie sans `targetId` (ne doit pas exister : racine isolée) |
| S6 | citation littérale valide qui disparaît | comparaison des `targetEvidenceRefs` avant/après réparation (champ `lineage`) et littéralité dans le document normalisé |
| S7 | garde CHECKPOINT / CONTRACT / AUTHORITY contournée | absence des codes fail-closed là où ils sont exigés |
| S8 | coût dépassant le plafond approuvé | `BUDGET_LIMIT_REACHED` ou coût observé > plafond de phase |
| S9 | comportement non prévu menaçant la lignée | tout état REPAIR/lignée non documenté dans `ef03b-trace.jsonl` |
| S10 | **CAS B transformé en faux succès** | revue conclue `complete` alors que la réparation a échoué ; `CANDIDATE_VALID` là où `REPAIR_UNPARSABLE` est attendu ; registre alimenté après un CAS B |
| S11 | `CHECKPOINT_SEAL_MISMATCH` contourné | reprise acceptée malgré un sceau différent, sans code fail-closed |
| S12 | `CONTRACT` mismatch contourné | entrée de registre d'un autre contrat servie |
| S13 | **plafond d'appels atteint** | compte d'appels réels ≥ plafond de phase (surveillance opérateur) |

**Procédure d'arrêt** : arrêter le run par l'API d'arrêt (acte explicite) · **ne rien corriger, ne rien rejouer** · figer le répertoire de run · calculer les empreintes des artefacts · produire le rapport avec `SMOKE_FAIL` et la chaîne causale mesurée · attendre une décision propriétaire (un **blocker factuel** est la seule raison d'ouvrir une v1.0.16, cf. **D6**).

## 7. Fichiers produits

**Par run** : `state.json`, `review-targets.json`, `target-document-set.json`, `twins.json`, `review-schema.json`, `reviews.json`, `reviews-valid.jsonl`, `enforcement-traces.json`, `ef03b-trace.jsonl`, `ef03b-resilience.json`, `normalization-records.json`, `aggregation.json`, `qualification.json`, `report.json`, `cost-ledger.jsonl`, `llm-calls.jsonl`, `budget.json`, `live-status.json`, les deux checkpoints.

**Après la phase A** : `EVIDENCEFORGE-v1.0.15-SMOKE-PHASEA-REPORT.md` / `.json` (verdict de phase, remis avant tout passage en phase B).
**Avant la phase B** : `EVIDENCEFORGE-v1.0.15-SMOKE-PHASEB-PREFLIGHT.md` / `.json` (0 appel, 0 USD).

**Après le smoke** : `EVIDENCEFORGE-v1.0.15-REAL-SMOKE-REPORT.md` / `.json`, avec verdict **`SMOKE_PASS`** / **`SMOKE_PASS_WITH_RESERVATIONS`** / **`SMOKE_FAIL`** et recommandation **`ACTIVATION_READY`** / **`ACTIVATION_NOT_READY`**. **Aucune activation automatique** : la décision finale d'`ACTIVE_VERSION` reste propriétaire.

## 8. État de la validation propriétaire

**Acquis** — architecture d'exécution (lancement explicite de v1.0.15, `ACTIVE_VERSION` intacte, port 8769, racine de runs dédiée et vide) · phase A telle qu'écrite · plafonds 12 / 20 / 32 USD · fixtures synthétiques déterministes autorisées et **préférées**.

**Amendements intégrés dans cette révision** — plafond dur d'appels indépendant du budget (80 / 120 / 200) · gate explicite A → B, jamais automatique · **préflight hors ligne complet obligatoire avant la phase B** · contrôle taille / tokenisation / présentation réelle avant fournisseur · table d'inspection multi-cible à six colonnes.

**Reste à fournir ou désigner** : la fixture de la phase A et sa question de mission, les trois fixtures de la phase B (générées de façon déterministe, à valider avant emploi).

**Prochaine décision propriétaire, séparée** : **`EXECUTE_SMOKE_PHASE_A`**.

**STOP — aucun appel fournisseur ne sera émis avant cette décision. À ce stade : 0 appel, 0 USD.**
