# COST-AWARE PANEL DESIGN v1 — MONOLITH-v1.0.7

**Définition :** `v1.0.7 = v1.0.6 + ECONOMIC PANEL OPTIMIZATION + EARLY SUFFICIENCY + MARGINAL VALUE CONTROL + REVIEW FANOUT CONTROL`. Base : `ECONOMIC-PANEL-AUTOPSY-v1.md`. Aucun lot gelé modifié ; `lib/panel-sufficiency.js` (PANEL-SUFFICIENCY-v2) byte-identique à v1.0.5/v1.0.6.

## 1. Principe produit et frontière d'autorité

```
DISCOVER BROADLY → SCREEN AGGRESSIVELY → SELECT PARSIMONIOUSLY → REVIEW INDEPENDENTLY → TEST SUFFICIENCY EARLY → ADD ONLY IF MARGINAL VALUE JUSTIFIES IT → STOP WHEN SUFFICIENT
```

| Question | Autorité | Module |
|---|---|---|
| Un candidat est-il admis ? | gate machine gelé (`MEG.gateCandidate`) | MONO-11 (gelé) |
| Le panel est-il suffisant ? | **PANEL-SUFFICIENCY-v2** — seule source de `PANEL_SUFFICIENT` / `PANEL_EXHAUSTED_WITH_GAPS` | `lib/panel-sufficiency.js` (inchangé) |
| Faut-il lancer le lot suivant ? | contrôleur économique : **non** si suffisant ; **non** si le budget LIMITED ne couvre pas l'estimation du lot ; sinon oui | `lib/economic-panel.js` |
| Combien de revues ? | cibles de revue construites par MONOLITH (dossier de mission) ; contrat gelé « 1 revue par jumeau × cible » inchangé | `lib/economic-panel.js › buildReviewTargets`, `lib/pipeline.js` |
| Continuer malgré un coût élevé ? | **humain** (porte `ECONOMIC_REVIEW`) | `lib/pipeline.js`, `server.js`, `index.html` |

Règle inviolable (T-ECO-09) : `IF PANEL_SUFFICIENT → STOP ; ELSE → CONTINUE unless budget prevents continuation`. Le coût ne produit jamais une suffisance ; l'état scientifique vient du traqueur.

## 2. Plafond = garde, jamais cible

`professionals.maxCandidatesToEvaluate = 150` reste la borne absolue de la sélection déterministe (PROFESSIONAL-SELECTION-v1, inchangée). `capIsGuardNotTarget = true` (config, politique, record — non désactivable : `normalizeEconomicPolicy` force `true`). Fonctionnellement : la boucle gelée reçoit toujours la sélection complète, mais chaque candidat passe par `eco.beforeEvaluate` **avant tout réseau et tout appel** ; l'évaluation s'arrête au premier des trois événements : `PANEL_SUFFICIENT`, lot suivant non finançable, vivier épuisé (T-ECO-01/04/17).

## 3. SUFFICIENCY_FIRST — lots

- **Ordre** : celui de la sélection (tourniquet par discipline) — inchangé.
- **Panel initial** : `minProfessionalsPerCoreDiscipline` (1) candidat par angle doté d'un vivier → 6–12 pour une mission multi-disciplinaire typique (8 dans le replay JMMJS).
- **Expansion** : tranches de `expansionBatch` (4) candidats dans l'ordre restant. Un candidat appartient à un seul lot ; rien n'est déplacé (la boucle gelée n'évalue chacun qu'une fois).
- **À chaque franchissement de lot** (ordre d'évaluation imposé par le mandat §16) : contribution marginale du lot clos → rendements décroissants → état scientifique (couverture, indépendance, gaps via le traqueur) → décision : suffisant ⇒ arrêt ; sinon estimation du lot suivant vs budget ⇒ lancement ou `PANEL_INCOMPLETE_BUDGET_LIMIT`.
- Les candidats d'un angle déjà **suffisant** restent non évalués (v1.0.5) ; les candidats **différés par le budget** ne sont ni évalués ni « épuisés » : le vivier scientifique reste ouvert (`PANEL_CONTINUE`), la reprise est possible après augmentation du budget (T-ECO-08/16).

## 4. Contribution marginale (composantes séparées)

Par lot, à partir de l'historique du traqueur (aucun score opaque) :
```
{ evaluated, newApproved, newDisciplinesCovered, newPartialDisciplines, newIndependentPositions, nearDuplicatePositions, duplicatePositions, notApproved, perDimension }
```
`informationGain = newDisciplinesCovered + newPartialDisciplines + newIndependentPositions` (somme descriptive ; un approuvé quasi-doublon n'est pas une information nouvelle). Post-revue (`reviewMarginalContribution`, descriptif) : `newRequirements, newReservations, newDivergences, newEvidenceGaps, newIndependentPositions, duplicatePositions, nearDuplicatePositions` par jumeau, `duplicateReviewRate`. Une revue redondante n'est jamais supprimée ; la divergence est conservée.

## 5. DIMINISHING_INFORMATION_RETURNS

Signal **descriptif** : `diminishingReturnsBatches` (3) lots consécutifs avec `informationGain = 0`. Journalisé, exposé dans l'API/UI, avec les angles à rendement nul (`≥ maxProfessionalsPerCoreDisciplineBeforeReassess` évalués, 0 approuvé). Il ne ferme jamais le panel (T-ECO-06/07).

## 6. Budget-aware execution

Avant chaque lot : `estimation = taille du lot × coût par candidat` (p25/moyenne/p75 mesurés dans le run dès 3 échantillons, sinon référence historique, sinon UNKNOWN). Budget LIMITED et `dépensé + estimation > plafond` ⇒ le lot n'est pas lancé : verrou de transport (aucun appel suivant), run `STOPPED / PANEL_INCOMPLETE_BUDGET_LIMIT` (reprenable), état partiel persisté (`professionals-sufficiency-partial.json › economicPanel`) avec couverture, gaps, angles sous-couverts, dépense, estimation du lot suivant. Jamais dégradé en `PANEL_SUFFICIENT`. Estimation UNKNOWN : le lot n'est lancé que s'il reste du budget ; le garde-budget réel protège ensuite chaque appel.

## 7. REVIEW FANOUT CONTROL

`reviewTargetMode = MISSION_DOSSIER` (défaut) : une cible unique « Dossier de mission (N documents) » — chaque document délimité (`===== DOCUMENT k / N : titre =====`), bornes et hash par document persistés (`review-targets.json › targets[].sourceDocuments`). Conséquence : `reviewDocuments = jumeaux × 1`, groupes d'agrégation = angles × 1. Le contrat gelé EF-03A/03B n'est pas modifié (il produit toujours 1 revue complète par jumeau et par cible) ; les citations littérales exigées par l'enforcer restent valides dans le dossier. `PER_DOCUMENT` conserve le comportement historique, explicitement. Repli automatique et journalisé vers `PER_DOCUMENT` si le dossier dépasse `dossierMaxChars` (400 000). Reprise : les cibles persistées sont vérifiées par hash (`REVIEW_TARGET_HASH_MISMATCH`).

## 8. Granularité

`countReviewUnits` : `reviewDocuments` (1 par jumeau × cible), `reviewItems` (findings), `twinsReviewed`. UI : « revues complètes » et « items de grille » séparés ; « évalué(s) / retenu(s) (plafond = garde, pas cible) » ; plus jamais « 3 / 480 revues » quand 480 sont des items ou un produit cartésien.

## 9. Projection avant exécution et portes

`projectDownstream` (avant la première revue coûteuse, recalculée à chaque vue) : `INITIAL_PANEL_SIZE, PANEL_SIZE, EXPECTED_TWINS, EXPECTED_REVIEWS, EXPECTED_REVIEW_CALLS, EXPECTED_COVERAGE_CALLS, EXPECTED_AGGREGATION_GROUPS, LOW/CENTRAL/HIGH_COST, mainCostDriver`. Unités : couverture (1 par admis), revues (jumeaux × cibles), agrégation (cibles × angles) ; coûts unitaires mesurés dans le run ou l'historique, sinon proxy = coût unitaire d'une revue mesuré (`PROXY_REVIEW_UNIT`, jamais un tarif inventé), sinon PARTIAL.
- `ECONOMIC_OUTLIER_WARNING` si projection centrale > `economicOutlierUsd` (40) : « Cette mission est inhabituellement coûteuse. » + causes.
- `ECONOMIC_REVIEW_REQUIRED` si projection > `economicReviewThresholdUsd` (40) : porte **humaine** `ECONOMIC_REVIEW` (WAITING_USER) avant le lancement des jumeaux ; `POST /api/runs/:id/confirm-economics {confirmedBy}` ; décision persistée avec la projection. Ce n'est pas un blocage scientifique.
- KPI produit (non scientifiques) : standard 10–25 USD, complexe 25–40, exceptionnel > 40 avec justification visible.

## 10. Compatibilité et non-régression

- `professionals.economic.enabled = false` ⇒ comportement v1.0.6 exact (traqueur seul).
- Reprise/checkpoints inchangés (`run-store.js`) ; `RESUMABLE += PANEL_INCOMPLETE_BUDGET_LIMIT`.
- Budget guard, run stop, screening normalization, provenance, identité, lineage, anti-hardcoding : inchangés (diff vide).
- Tests existants adaptés avec justification : PRO-PARTIAL-01 (axe économique désormais renseigné), browser v1.0.5 (libellé « évalué(s) / retenu(s) »).
