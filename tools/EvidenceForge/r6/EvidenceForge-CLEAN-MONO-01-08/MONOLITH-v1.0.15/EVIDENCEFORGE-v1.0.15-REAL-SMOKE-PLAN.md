# EVIDENCEFORGE v1.0.15 — PLAN DE SMOKE RÉEL

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
| Plafond dur (`costBudgetUsd`) | **12 USD** | **20 USD** | **32 USD** |
| Seuil d'alerte | 8 USD | 14 USD | — |
| Estimation (projection) | 3 à 8 USD | 5 à 12 USD | — |
| Plafond indicatif d'appels réels | ≤ 80 | ≤ 120 | — |

**Ancrages mesurés** (run historique A10, tarification Opus 5/25, 10 tentatives) : **36,82 USD** au total, **507 appels réels** — `TWINS_REVIEWS` 28,95 · `PROFESSIONALS` 7,00 · amont 0,88 ; **0,5168 USD** par revue VALID ; **0,2301 USD** par passe. Les estimations ci-dessus sont des **projections** (modèle moins cher, panel minimal, un seul jumeau visé) ; seul `budget.json` est un plafond dur.

**Garde économique** : `economicReviewThresholdUsd = 40`. Si la projection d'avant-revues dépasse 40 USD, le run passe en `WAITING_USER` (gate `ECONOMIC_REVIEW`). Les plafonds proposés sont sous ce seuil ; si le gate se déclenche malgré tout, **ne pas confirmer sans décision propriétaire**.

## 4. Phase A — chemin nominal au coût minimal

**Mode `MISSION_DOSSIER`** (mode de la configuration gelée), **une cible effective**, 1 à 2 documents courts, un seul jumeau si le panel le permet.

**Mesures obligatoires** : `targetId` · `documentAuthoritySha256` · nombre de revues · revues réutilisées · appels fournisseur réels · passes de réparation · **CAS B** rencontrés · `REFS_PRESENT_BUT_UNRESOLVED` · erreurs · coût · anomalies de lignée · qualification du rapport.

**Sources** : `ef03b-resilience.json` (`authorityIdentityVerified`, `authorityContextDivergences`, `registryRefusedForeignTarget`, `registryRefusedForeignAuthority`, `registryReuses`, `realCalls`, `truncations`, `completions`, `literalizations`, `contextUnparsed`, `contextContentMismatch`, `cumulativeReviewCostUsd`) · `ef03b-trace.jsonl` · `enforcement-traces.json` · `reviews-valid.jsonl` · `target-document-set.json` · `reviews.json` · `cost-ledger.jsonl` · `llm-calls.jsonl` · `state.json` / `qualification.json` / `report.json`.

**Critères PASS** : run `COMPLETED` sans intervention hors gates prévus · `authorityIdentityVerified > 0` · `authorityContextDivergences == 0` · `registryRefusedForeignTarget == 0` · chaque entrée de `reviews-valid.jsonl` porte **`targetId` ET `documentAuthoritySha256`** · `sha256(autorité tracée) == sha256(document de `target-document-set.json` pour cette cible)` · **aucune référence littérale valide disparue** · aucun résultat vide silencieux après réparation échouée (`REPAIR_UNPARSABLE` tracé, jamais `CANDIDATE_VALID`) · coût ≤ plafond.

## 5. Phase B — multi-cible contrôlée (seulement si la phase A est saine)

**Objectif spécifique** : observer en production réelle que `target-01` reçoit l'autorité de `target-01`, `target-02` celle de `target-02`, `target-03` celle de `target-03`, et qu'**aucune cible ne reçoit l'autorité d'une autre**.

**Comment obtenir PER_DOCUMENT sans toucher la configuration gelée** — `reviewTargetMode = MISSION_DOSSIER` et `dossierMaxChars = 400 000` sont dans `config/monolith.config.json`, **qui est dans le manifeste gelé** : les modifier exigerait d'ouvrir une nouvelle version. Le seul levier légitime est donc de fournir un dossier dont le total **dépasse 400 000 caractères** : le repli `PER_DOCUMENT` est alors déclenché **par le moteur lui-même**, explicitement et journalisé (`REVIEW_TARGET_FALLBACK`).

**Documents** : 3 documents distincts, ~140 000 caractères chacun, empreintes distinctes, avec des différences de normalisation réelles (apostrophes typographiques, NBSP, CRLF, NFC) pour que **brut ≠ normalisé** sur chaque cible.

**Inspection MANUELLE imposée par la réserve A1** — le câblage de `lib/pipeline.js` n'a aucune couverture comportementale (mutant `XPIPE` survivant en test) ; la vérification en production est donc manuelle :

1. extraire de `target-document-set.json` le couple `(targetId, sha256(content))` pour chaque cible ;
2. extraire de `reviews-valid.jsonl` le couple `(targetId, documentAuthoritySha256)` pour chaque entrée ;
3. extraire de `ef03b-trace.jsonl` les événements portant `targetId` et `documentAuthoritySha256` ;
4. dresser la table des 3 couples et vérifier l'**égalité stricte**, cible par cible ;
5. vérifier que les 3 empreintes sont **distinctes** entre elles.

**Attendu : 3 lignes, 3 empreintes distinctes, 0 croisement. Tout écart ⇒ arrêt immédiat.**

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

**Procédure d'arrêt** : arrêter le run par l'API d'arrêt (acte explicite) · **ne rien corriger, ne rien rejouer** · figer le répertoire de run · calculer les empreintes des artefacts · produire le rapport avec `SMOKE_FAIL` et la chaîne causale mesurée · attendre une décision propriétaire (un **blocker factuel** est la seule raison d'ouvrir une v1.0.16, cf. **D6**).

## 7. Fichiers produits

**Par run** : `state.json`, `review-targets.json`, `target-document-set.json`, `twins.json`, `review-schema.json`, `reviews.json`, `reviews-valid.jsonl`, `enforcement-traces.json`, `ef03b-trace.jsonl`, `ef03b-resilience.json`, `normalization-records.json`, `aggregation.json`, `qualification.json`, `report.json`, `cost-ledger.jsonl`, `llm-calls.jsonl`, `budget.json`, `live-status.json`, les deux checkpoints.

**Après le smoke** : `EVIDENCEFORGE-v1.0.15-REAL-SMOKE-REPORT.md` / `.json`, avec verdict **`SMOKE_PASS`** / **`SMOKE_PASS_WITH_RESERVATIONS`** / **`SMOKE_FAIL`** et recommandation **`ACTIVATION_READY`** / **`ACTIVATION_NOT_READY`**. **Aucune activation automatique** : la décision finale d'`ACTIVE_VERSION` reste propriétaire.

## 8. Validation attendue avant toute dépense

1. modèle et tarification retenus (`claude-sonnet-4-6`, 3/15 par million) ;
2. plafonds : phase A **12 USD**, phase B **20 USD**, enveloppe **32 USD** ;
3. port **8769** et racine de runs isolée `~/evidenceforge-work/reports/smoke-v1015-runs` ;
4. documents de la phase A (1 à 2 courts) et de la phase B (3 documents, total > 400 000 caractères) — **à fournir ou à désigner par le propriétaire** ;
5. procédure de lancement explicite de v1.0.15 sans toucher `ACTIVE_VERSION` ;
6. accord pour que le repli `PER_DOCUMENT` soit obtenu par un dossier réellement trop grand, **seul levier ne touchant pas la configuration gelée**.

**STOP — aucun appel fournisseur ne sera émis avant votre validation.**
