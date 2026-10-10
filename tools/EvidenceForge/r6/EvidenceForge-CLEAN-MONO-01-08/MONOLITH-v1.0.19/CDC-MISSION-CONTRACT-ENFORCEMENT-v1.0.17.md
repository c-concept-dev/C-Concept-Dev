# CDC — MISSION CONTRACT ENFORCEMENT (R-A) — EvidenceForge MONOLITH v1.0.17

**Statut :** candidat implémenté, **non gelé, non activé, non fumé**. `ACTIVE_VERSION` reste `MONOLITH-v1.0.16`.
**Date :** 2026-10-02. Aucun appel fournisseur. Coût : 0 USD. Aucun nouveau run.
**Base :** `MONOLITH-v1.0.16`, gelée puis activée le 2026-09-24 (`d477cf3a`). Aucun lot gelé n'est modifié (MONO-01, MONO-09, MONO-10, MONO-11).

---

## 1. Origine

Deux audits indépendants ont abouti au même diagnostic :

- l'autopsie `EF-REPORT-P01-VERDICT-AUTOPSY-v1` du 2026-09-19, sur le run `efm-20260918-a64167c0` ;
- l'audit `JMMJS-P0.1-CLOSURE-AUDIT` du 2026-10-01, sur le run `efm-20260930-77f94b06`.

Diagnostic commun : **C. MISSION_CONTRACT_NOT_ENFORCED**, avec pour conséquence **D. VERDICT_NOT_COMPUTED**. La chaîne causale :

- Le livrable confirmé à la Porte 1 (`livrableAttendu` : verdict, matrice de décision, contrat P0.2 conditionnel) est produit et validé par `stage-mission.js`, puis **seulement affiché**. Aucun code ne le consomme ensuite.
- Le schéma de revue gelé (EF-03A), le prompt gelé (EF-03B, règle 7) et l'agrégation gelée (EF-03C) **ne peuvent pas** produire ces livrables.
- Le run termine `COMPLETED` sans signaler l'écart.

L'autopsie du 19/09 proposait deux contrats : (1) une politique de décision déclarée, (2) un inventaire des exigences. **R-A ne traite ni l'un ni l'autre.** R-A rend l'écart **visible et bloquant** : le produit ne promet plus un livrable qu'il ne sait pas produire. La capacité de clôture fait l'objet d'un CDC séparé, non codé : `CDC-P0.1-CLOSURE-STAGE.md`.

## 2. Exigences (mandat → réalisation)

| ID | Exigence du mandat | Réalisation | Preuves |
|---|---|---|---|
| EX-01 | détecter les livrables demandés dans `livrableAttendu` | `lib/mission-deliverables.js › assess()` : registre lexical déterministe MISSION-DELIVERABLES-v1 | MD-01…06, MD-22 |
| EX-02 | comparer avec les capacités réelles de la version | chaque capacité est **déclarée** (`supported`, `reason`) ; une preuve de production est lue dans le rapport | MD-02, MD-07, MD-09 |
| EX-03 | avant CONFIRM_PLAN, afficher tout livrable non supporté | `gateView` expose l'évaluation, l'interface la liste (« produit » / « NON PRODUIT » + raison) | MD-11, MD-18, MD-19, navigateur v1.0.17 |
| EX-04 | interdire qu'un run termine COMPLETED si un livrable accepté est absent | statut terminal `INCOMPLETE_DELIVERABLES` ; **une reconnaissance n'est pas une renonciation** : tout livrable demandé reste accepté (correctif B1) | MD-08, MD-14, MD-15, MD-16, B1-01…B1-10, mutants M08, M12, M17 |
| EX-05 | `missionDeliverables` au rapport : REQUESTED / PRODUCED / NOT_PRODUCED_BY_DESIGN / NOT_PRODUCED_ERROR | `evaluate()` + `attachToReport()` ; en-tête `MISSION_DELIVERABLES` | MD-07, MD-10, MD-13…15 |
| EX-06 | ne modifier ni MONO-01, ni MONO-11, ni les lots gelés ; composition, adaptateur, additif uniquement | porte historique `confirmPlan` byte-identique, appelée par `confirmPlanEnforced` ; `stage-report.js` byte-identique | MD-20, I1…I5 |
| EX-07 | aucun mapping depuis PROCESS_QUALIFICATION / SCIENTIFICALLY_USABLE | aucune preuve de production ne lit l'en-tête de qualification | MD-09, mutant M10 |
| EX-08 | 0 fournisseur, 0 USD, aucun run JMMJS | tests sur fakes ; le run réel n'est relu qu'en lecture seule (MD-22, empreintes avant/après identiques) | MD-22 |

## 3. Conception

### 3.1 Registre MISSION-DELIVERABLES-v1 (`lib/mission-deliverables.js`)

Module **pur** : il ne requiert que `crypto` et n'a ni effet de bord ni appel LLM. Il est **déterministe** et **versionné** : `registrySha256` couvre les patrons, le support, les raisons, les marqueurs de condition et de négation, et les connecteurs.

**Capacités produites par v1.0.17.** Chacune a une preuve de production lue dans le rapport, jamais dans `headline`.

| Capacité | Preuve de production (rapport) |
|---|---|
| DOCUMENTARY_REPORT | 5 tableaux `statements` présents et `pipeline.reviews.reviewsComplete > 0` |
| PROVENANCE_TRACEABILITY | `integrity.seal` et `statements` (lignée « pourquoi ») |
| PROFESSIONALS_IDENTIFICATION | `pipeline.disciplines` et `pipeline.twins > 0` |
| INDEPENDENT_REVIEWS | `reviewsComplete > 0` |
| AGGREGATION | `statements.convergent` / `divergent` et revues > 0 |
| RESERVATIONS_LIMITS | `reservations` et `limits` |
| UNKNOWNS | `statements.nonEtabli` et `qualification.unknowns` |
| NON_PARTICIPATION_DISCLOSURE | la limite « aucun professionnel n'a été consulté » |
| PROCESS_QUALIFICATION | `qualification.criteria` |

**Capacités non produites par conception.** La raison est affichée à la porte et dans le rapport.

| Capacité | Raison (fait d'architecture) |
|---|---|
| BUSINESS_VERDICT | EF-03A n'a pas de champ verdict ; EF-03B interdit vote, consensus et classement ; EF-03C n'agrège pas en verdict ; PROCESS_QUALIFICATION et SCIENTIFICALLY_USABLE qualifient le processus |
| DECISION_MATRIX | les constats sont indexés par dimension, sans axe requirement ni item, et sans statut de décision |
| PER_ITEM_RESPONSE | un constat par dimension, jamais par section, question ou item |
| STRUCTURED_CONTRACT | aucune structure de contrat n'existe |
| SCORING_RANKING | interdit par la charte EF-03B/EF-03C |

**Règles fail-closed :**

1. **Segmentation.** Les clauses sont séparées par `,`, `;`, un point suivi d'un blanc, ou un saut de ligne. Le point de « v0.2 » n'est jamais une coupure (MD-06).
2. **Connecteurs.** « et », « incluant », « ainsi que », etc. sont retirés en tête de clause.
3. **Conditions.** Une clause qui **commence** par « si », « le cas échéant », « lorsque »… est la condition de la clause suivante, ou de la précédente si elle est la dernière. Une condition en ligne (« X si Y ») porte sur X. Les capacités citées dans la condition deviennent `conditionDependsOn` et ne sont jamais des livrables. Ainsi, « si le verdict l'autorise » ne crée pas de second verdict (mutant M15). **Aucune condition n'est évaluée** : un livrable conditionnel n'est jamais garanti (`CONDITION_NOT_EVALUABLE`).
4. **Négation.** Une capacité précédée dans sa clause par « sans », « aucun », « ni », « hors », « ne … pas »… est exclue et tracée dans `excluded`. Exception déclarée : la mention de non-participation (`negationExempt`).
5. **Formes.** Ce sont des attributs du livrable de la clause, jamais des livrables : JSON est produit (export du rapport), TABLE ne l'est pas (`FORM_NOT_SUPPORTED`).
6. **Texte non reconnu.** Une clause sans capacité reconnue devient `UNRECOGNIZED_DELIVERABLE`, non garanti, **jamais supposé produit**.

**Classe de porte.** `SUPPORTED` signifie : capacité produite, inconditionnelle, formes produites. Tout autre cas est `NOT_SUPPORTED`.

### 3.2 Porte 1 appliquée (`lib/pipeline.js`, par composition)

- **Ouverture de la porte.** `missionDeliverablesAssessment(store, state)` évalue `livrableAttendu` et persiste `mission-deliverables-assessment.json` (avec empreinte). L'évaluation est recalculée si le livrable ou le registre a changé.
- **Exports.** `module.exports.confirmPlan = confirmPlanEnforced` ; la porte historique reste disponible sous `confirmPlanCore`.
  - Si au moins un livrable est `NOT_SUPPORTED`, il faut `deliverablesAcknowledged === true` (sinon `DELIVERABLES_ACK_REQUIRED`, HTTP 400, liste détaillée) **et** `deliverablesAssessmentSha256` égal à l'empreinte affichée (sinon `DELIVERABLES_ASSESSMENT_MISMATCH`). La reconnaissance porte donc sur **cette** évaluation.
  - `mission-deliverables-acceptance.json` est écrit **avant** l'appel de la porte historique, qui relance le moteur, puis **retiré** si cette porte refuse (identité absente, etc. : MD-11, mutant M07).
  - La porte historique `confirmPlan` est **byte-identique** à v1.0.16, elle-même byte-identique à v1.0.4 (NONREG-04, MD-20).
- **Hors porte.** Le comportement historique est conservé (`GATE_NOT_OPEN`).
- **Interface.** Section « Livrables demandés — ce que cette version produira », et case de reconnaissance obligatoire si nécessaire. L'empreinte est envoyée avec la confirmation (MD-19, mutant M14, navigateur v1.0.17).

### 3.3 Rapport

- `missionDeliverablesForReport()` réunit l'évaluation de la porte, sa vérification d'empreinte et sa concordance avec le livrable courant et le registre courant.
- L'acceptation n'est retenue que si elle est **liée** : même empreinte d'évaluation, et même identité que `plan-confirmation.json › validation.validatedBy` (MD-16, mutant M09).
- `evaluate()` produit `missionDeliverables` : chaque item a `requested: true`, `requestedStatus: REQUESTED`, et un statut final parmi PRODUCED, NOT_PRODUCED_BY_DESIGN ou NOT_PRODUCED_ERROR, avec `statusReason`, `evidence`, `accepted`, `acknowledgedAsNotProduced` et la synthèse des quatre compteurs.
- `overall` vaut : COMPLETE, INCOMPLETE ou NO_DELIVERABLE_DECLARED. **Correctif B1** : l'état `PARTIAL_BY_DESIGN_ACKNOWLEDGED` est supprimé — il autorisait `COMPLETED` alors qu'un livrable demandé manquait. Le détail « non produit par conception / par erreur / reconnu » reste porté par chaque item et par `summary` (B1-10).
- `attachToReport()` ajoute `missionDeliverables` et deux clés d'en-tête (`MISSION_DELIVERABLES`, `MISSION_DELIVERABLES_USER`) **sans modifier les autres champs**. Il recalcule `reportHash` avec la fonction inchangée `computeReportHash` (MD-10, mutant M13). `stage-report.js` est byte-identique.
- Artefact `mission-deliverables.json`. Il est archivé par le replay des revues.

### 3.4 Statut terminal `INCOMPLETE_DELIVERABLES`

- Si au moins un livrable **accepté** n'est pas PRODUCED, le run termine `INCOMPLETE_DELIVERABLES` et non `COMPLETED`. Le rapport est conservé et vérifiable. Le message utilisateur l'explique.
- Ce statut est **terminal**, comme COMPLETED : une reprise ne rejoue rien (MD-15, mutant M12). Le replay des revues reste possible.
- Coût : une prévision COMPLETE, et le run compte dans l'historique de référence (MD-21).
- Interface : libellé dédié, rapport chargé, reprise masquée.

**Acceptation (corrigée par le correctif B1).** `ACKNOWLEDGE_UNSUPPORTED_DELIVERABLE` **n'est pas** `WAIVE_DELIVERABLE`. Une reconnaissance à la Porte 1 **informe** seulement que l'utilisateur a vu et compris l'incapacité de cette version ; elle ne modifie pas le contrat de mission. **TOUS** les livrables demandés — garantis ou non, reconnus ou non — restent `REQUESTED` et **acceptés** (`accepted` est un invariant du code, jamais dérivé de la reconnaissance). Un livrable reconnu mais non produit reste donc dans `acceptedMissing` et le run termine `INCOMPLETE_DELIVERABLES` (MD-08, MD-14, B1-01…B1-05). Cette version n'a **aucun** mécanisme de renonciation (waiver) : aucun livrable demandé ne peut être abandonné, silencieusement ou non. Pour un run **sans acceptation liée** (antérieur à v1.0.17, acceptation non liée, ou évaluation dérivée), le plan confirmé vaut acceptation de **tout** le livrable affiché : tout livrable non produit rend le run INCOMPLETE (fail-closed). Des réserves explicites le disent : `DELIVERABLES_ASSESSED_AFTER_GATE`, `DELIVERABLES_ACCEPTANCE_NOT_BOUND`, `DELIVERABLES_ASSESSMENT_DRIFT`.

### 3.5 Le cas réel (rejeu en lecture seule, MD-22)

Run `efm-20260930-77f94b06`, livrable confirmé : 10 livrables, dont 4 non garantis (PER_ITEM_RESPONSE, DECISION_MATRIX, BUSINESS_VERDICT, et STRUCTURED_CONTRACT conditionnel au verdict, formes TABLE et JSON). Évaluation rétrospective : `INCOMPLETE`, avec PRODUCED 6, NOT_PRODUCED_BY_DESIGN 4, NOT_PRODUCED_ERROR 0. Aucun octet du run n'a été modifié (empreintes avant/après).

Sous v1.0.17, ce run **n'aurait pas pu** être confirmé sans reconnaissance explicite des 4 livrables manquants, et ne se serait jamais présenté comme « terminé » avec un livrable accepté absent. Avec le correctif B1, cette reconnaissance **n'aurait pas non plus** permis au run de se dire « terminé » : les 4 livrables restent demandés et acceptés, et le run termine `INCOMPLETE_DELIVERABLES`.

## 4. Absence de mapping qualification → verdict (EX-07)

- Le registre classe BUSINESS_VERDICT `supported: false`. Aucun chemin de code ne rend ce livrable PRODUCED.
- **Preuve comportementale (MD-09).** Pour les 4 statuts × 2 valeurs, appliqués à la fois à `headline` et à `qualification.status`, et aussi sans en-tête, les statuts des 10 livrables sont **identiques**. Le verdict reste NOT_PRODUCED_BY_DESIGN.
- **Preuve statique (MD-09).** Hors `attachToReport`, qui n'**écrit** que les deux clés MISSION_DELIVERABLES, le module ne contient aucune lecture de `.headline`, `.PROCESS_QUALIFICATION`, `.SCIENTIFICALLY_USABLE`, `.scientificallyUsableRule`, `["…"]` ni `qualification.status`.
- **Mutant M10.** Un mapping injecté (« QUALIFIED ⇒ verdict produit ») est **tué** par MD-09.

## 5. Composition : ce qui change, ce qui ne change pas

**Modifiés :**

- `lib/pipeline.js` : +54/−7 lignes. Import, terminal, ouverture de porte, rapport, statut, `gateView`, fonctions de composition, exports, archive replay.
- `server.js` : 2 codes 400.
- `index.html` : porte, rapport, statut.
- `lib/cost-view.js` : statut terminal.
- `config/monolith.config.json` : version.
- `tools/build-manifest.js`, `tools/package.sh`.
- `README.md`.
- 3 tests adaptés : V12-18 et T-STREAM-20 (numéro de version uniquement), et le câblage de `test-monolith.js`.

**Nouveaux :** `lib/mission-deliverables.js`, `test/test-v1017-mission-deliverables.js`, `tools/browser-tests-v1017.js`.

**Byte-identiques à v1.0.16** (MD-20) : `stage-report.js`, `stage-mission.js`, `stage-ef01.js`, `stage-professionals.js`, `ef03b-resilience.js`, `llm.js`, ainsi que la fonction `confirmPlan` de `pipeline.js`. Lots gelés : 0 divergence (I1, MD-20, RUN-SAFETY-19). Le prompt de reformulation est inchangé : aucun coût ni comportement LLM nouveau.

## 6. Décisions de conception à valider par le propriétaire

| ID | Décision prise | Alternative |
|---|---|---|
| D-1 | **RENVERSÉE par le correctif B1 (audit indépendant v1.0.17).** Décision initiale (fautive) : « un livrable non garanti reconnu à la porte n'est pas accepté : le run peut terminer `COMPLETED` avec `MISSION_DELIVERABLES = PARTIAL_BY_DESIGN_ACKNOWLEDGED` » — elle assimilait la reconnaissance à une renonciation implicite. Décision en vigueur : la reconnaissance **informe** et reste obligatoire à la porte, mais tout livrable non garanti non produit conduit toujours à `INCOMPLETE_DELIVERABLES` | Introduire un vrai `WAIVE_DELIVERABLE` (explicite, owner-authored, ciblé, tracé, distinct de l'ACK) : **hors périmètre**, non codé |
| D-2 | Source = `livrableAttendu` (reformulation confirmée et affichée) | Analyser aussi la question brute : bruit élevé (négations, interdits P0.2), à évaluer |
| D-3 | Lexique fail-closed : un texte non reconnu exige une reconnaissance | Lexique plus permissif : risque de faux PRODUCED |
| D-4 | Nom du statut terminal : `INCOMPLETE_DELIVERABLES` | `COMPLETED_WITH_MISSING_DELIVERABLES` |
| D-5 | Les preuves de production sont **structurelles** (présence) | Preuves sémantiques : hors de portée sans jugement |

## 7. Résultats mesurés (2026-10-02)

| Suite | Résultat |
|---|---|
| `node test/test-monolith.js`, avec `EVIDENCEFORGE_MD_REPLAY_RUN` | **367/367** : 345 hérités, dont 2 adaptés au seul numéro de version, + MD-01…22 |
| `node test/test-chunking.js` | 21/21 |
| Navigateur (Chrome headless) | v1.0.5 33/33 · v1.0.6 12/12 · v1.0.7 11/11 · v1.0.8 9/9 · **v1.0.17 10/10** |
| `tools/anti-hardcoding-scan.js` / `tools/secret-scan.js` | 0 / 0 hit |
| Lots gelés | 0 divergence |
| Base v1.0.16 (copie, avant modification) | 345/345, 21/21 |

**Matrice de mutation.** Chaque mutant est une copie sœur dans le bundle avec un défaut unique. Résultat : **16/16 tués**, chacun par au moins un test nommé (détail dans `MATRICE-IMPACTS-INVARIANTS-TESTS-v1.0.17.md`).

## 8. Réserves

| ID | Réserve | Bloquante ? |
|---|---|---|
| R-1 | Lexique : un livrable formulé de façon inattendue est UNRECOGNIZED (bruit, mais sûr). Inversement, une capacité reconnue ne vérifie pas l'objet sémantique (« analyse documentaire de X » est PRODUCED dès que l'analyse existe) | non |
| R-2 | Source = `livrableAttendu`, une sortie LLM affichée à l'utilisateur : un livrable omis par la reformulation n'est pas détecté. Atténuation : affiché et lu à la Porte 1 | non (D-2) |
| R-3 | Les preuves de production sont structurelles : NOT_PRODUCED_ERROR ne se déclenche que sur absence grossière | non (D-5) |
| R-4 | Aucune condition n'est évaluée : tout livrable conditionnel exige une reconnaissance | non |
| R-5 | `tools/browser-tests.js` (suite v1.0) échoue au même endroit sur v1.0.16 (`TypeError … reading 'length'`, ligne 22) : préexistant, non lié | non |
| R-6 | Le lanceur `tools/EvidenceForge/test/test-launch.js` n'a pas été rejoué, car il vise `ACTIVE_VERSION` (v1.0.16). À rejouer à l'activation | non |
| R-7 | Le succès complet de la porte historique via l'interface n'est pas exercé de bout en bout : MD-12 remplace `S1.confirmPlan` par un faux, et le navigateur ne vérifie que la disparition du refus. À couvrir par un micro-smoke à 0 USD jusqu'à la Porte 2 | non |
| R-8 | Un run dont l'étape REPORT a été terminée **sous v1.0.16** et qui n'a pas pu écrire son statut final (crash) terminerait COMPLETED sans `missionDeliverables` sous v1.0.17 | non (fenêtre étroite) |
| R-9 | `schemaVersion` du rapport inchangé (« MONOLITH-v1.0 ») ; la présence de `missionDeliverables` identifie un rapport v1.0.17 | non |
| R-10 | Pas de zip produit, pas de smoke réel (mandat 0 fournisseur) | non |

## 9. Verdict technique

> **GELABLE** (candidat `MONOLITH-v1.0.17`), avec les réserves R-1 à R-10, dont aucune n'est bloquante.
> Conditions : audit indépendant (agent vierge) PASS, puis décision du propriétaire sur D-1 à D-5. **Ne pas activer** avant le micro-smoke R-7.
> **Ce que v1.0.17 n'est pas** : elle ne produit aucun verdict P0.1 ni aucun contrat P0.2. Elle empêche seulement qu'un run prétende les avoir produits.

**STOP pour audit indépendant.**
