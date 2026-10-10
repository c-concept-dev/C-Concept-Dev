# AUDIT — PANEL SUFFICIENCY POLICY (état au commit 9ea66c4, avant correctif)

Lecture intégrale : `lib/panel-sufficiency.js`, `lib/stage-professionals.js`, `lib/professional-selection.js`, `lib/professionals-economics.js`,
`config/monolith.config.json`, `AUTOPSIE-PANEL-COST-OPTIMIZER.md`, `RAPPORT-PANEL-COST-OPTIMIZER.md`, `test/test-panel.js`, plus les lots
gelés consultés en lecture seule : `MONO-11/v0.3-r1/core/machine-evidence-gate.js` (gate), `MONO-01/dependencies/ef-03c-aggregation-v1.js`
(agrégation). Runs réels lus en lecture seule : `cf6101c7` (checkpoint complet), `65c805ef`, `dc30dc7a`.

## 1. Autopsie de la règle actuelle (PANEL-SUFFICIENCY-v1)

| Question | Réponse factuelle |
|---|---|
| Où la policy est injectée | `config/monolith.config.json` `professionals.earlyStop` → `stage-professionals.js` `runPanel` (l.213 : `esCfg` = copie sans `$comment`) → `createSufficiencyTracker({ policy })` → `Object.assign({}, DEFAULTS, policy)` (`panel-sufficiency.js:28`). Aucun autre point d'entrée ; `EVIDENCEFORGE_*` ne la surcharge pas. |
| Valeurs réellement utilisées | celles de la config : `targetAdmissiblePerDimension 3`, `minEvaluatedPerDimension 3`, `plateauWindowFactor 2`, `plateauWindowMin 10`, `closeOnPlateau false`, `plateauGraceFactor 2`, `closeDimensionOnTarget true` (identiques aux `DEFAULTS`). Fenêtre de plateau effective = max(10, 2 × angles) ; grâce = 2 × angles. |
| Dimension « satisfaite » | `per[d].admissible >= targetAdmissiblePerDimension` (l.38, l.53). **`admissible` est compté sur la dimension PRIMAIRE du candidat** (`primary.get(candidateRef)` = `dimensionRef` de la découverte), **pas sur les dimensions qu'il soutient**. Un candidat de discipline X dont la pertinence soutient l'angle Y compte pour X. Or le gate gelé définit la couverture d'un angle par les approuvés dont `relevanceEvidence.supportingDimensions` contient cet angle (G-6, `machine-evidence-gate.js:193-197`) : la règle v1 ne mesure pas la même chose que le gate. |
| « admissible » vs « admis » | `admissible` = `relevanceClass === "SUPPORTED"` à l'observation (l.51). Le gate gelé peut encore **différer** un SUPPORTED : G-8 anti-circularité (`SEED_ONLY_SUPPORT`, cas rencontré en test), G-1 identité, G-2 attribution. La v1 peut donc déclarer une cible atteinte avec des candidats que le gate n'admettra pas. |
| Vivier épuisé | `per[d].remaining === 0` (l.38, l.40, l.62). `remaining` = nombre de candidats sélectionnés de dimension primaire d, décrémenté à chaque `observe` (l.49) **et** à chaque `skip` (l.59). |
| Effet des `skipped` sur `remaining` | un candidat non évalué (dimension fermée ou panel jugé suffisant) décrémente `remaining` comme s'il avait été évalué : cohérent pour « il ne reste plus rien à évaluer », mais `evaluated` ne l'inclut pas. Les parcours à vide **après le verrou budget** (corpus_fetch_error) sont en revanche observés comme des évaluations (`observe` appelé par `logObserved`, `stage-professionals.js`) : `evaluated++`, `remaining--` → un angle peut devenir « épuisé » par des non-évaluations. Sans conséquence aujourd'hui (le run s'arrête ensuite par `assertNoTransportFailure`, aucun checkpoint), mais la décision est fausse. |
| Fermeture d'une dimension | l.53 : dès que `admissible >= target` (et `closeDimensionOnTarget`), `closed = true`, `closedReason = TARGET_ADMISSIBLE_REACHED` ; `shouldEvaluate` (l.58) refuse ensuite les candidats **de dimension primaire** d ; `fetchAuthorWorks` lève `PANEL_SUFFICIENT_EARLY_STOP` (boucle gelée : `corpus_fetch_error`, candidat non évalué). |
| Déclenchement de CONFIRMED | l.38-39 : **toutes** les dimensions ayant un vivier vérifient `admissible >= target` **OU** `remaining === 0`. ⇒ **un angle à 0 admissible dont le vivier est épuisé contribue à PANEL_SUFFICIENT** (branche auditée §3). Chemin secondaire : plateau + `closeOnPlateau` (désactivé). |
| Reprise | le traqueur est reconstruit à chaque tentative ; la boucle gelée rejoue tous les candidats dans le même ordre (`selectionOrder`, hash vérifié) ; les réponses VALID sont réutilisées (coût 0) → mêmes observations, mêmes décisions, mêmes candidats non évalués (déterministe). La décision est persistée avec le checkpoint (`sufficiency`) et à part (`professionals-sufficiency.json`). |
| Interaction budget | `budget-guard.assertAllowed` avant chaque appel (`llm.js`) ; dans `fetchAuthorWorks`, `guard.enter` → verrou de panne → **puis** `tracker.shouldEvaluate` : le budget est prioritaire (test PRO-EARLY-10). Défaut résiduel : après le verrou, les candidats restants sont observés comme évalués (voir ci-dessus). |

## 2. Verdict sur `targetAdmissiblePerDimension = 3`

Ce qui est **justifié / dérivable** :
- Le plancher **2** est contractuel et gelé : l'invariant anti-mono-jumeau de l'agrégation (`ef-03c-aggregation-v1.js:131-152`, `twinRefs.length < 2` ⇒ convergence rejetée) exige au moins **deux jumeaux indépendants** pour qu'un constat devienne « établi ». Un angle représenté par un seul professionnel ne peut produire aucune convergence. Ce plancher n'est pas une opinion : il est lu dans le lot gelé.
- La notion de « représentation d'un angle » est définie par le gate gelé (G-6) : approuvés dont `supportingDimensions` contient l'angle.

Ce qui est **arbitraire** :
- La marge au-dessus du plancher (3 au lieu de 2). Elle est motivée par le rendement jumeaux/admis observé (13/15 sur cf6101c7 : un admis peut ne pas donner de jumeau) mais **une seule mesure** ne fonde pas une valeur ; toute dérivation « fraction du vivier » (options B/C) serait une formule inventée : les données ne montrent aucune relation entre taille du vivier et taux d'admission (10 % sur 553, 3,5 % sur 270, 5 % sur 477).
- Le comptage par **dimension primaire** (au lieu de la dimension soutenue) et le comptage **avant** le gate (admissible ≠ admis).
- L'absence de toute mesure d'**indépendance** : trois « admissibles » co-auteurs de la même œuvre comptent 3.

Ce qui doit rester une **policy produit** : le nombre de représentants attendu au-dessus du plancher contractuel. Il doit être nommé et
tracé comme tel (`provenance: PRODUCT_POLICY`), jamais présenté comme seuil scientifique.

## 3. Branche « vivier épuisé » — confirmée

`satisfied = every(admissible >= target || remaining === 0)` : un angle **0 admissible + vivier épuisé** est traité comme satisfait, et le
message de CONFIRMED dit « chaque angle … a atteint sa cible d'admissibles ou a épuisé son vivier » — la distinction existe dans
`coverage.exhausted` mais **l'état global ne la porte pas** : `EARLY_STOP_CONFIRMED` est le même mot pour « on a assez » et « on ne peut
plus trouver ». Test PRO-EARLY-02 entérine même ce comportement (`c1` OUT_OF_SCOPE ⇒ CONFIRMED). À corriger.

## 4. Signaux d'indépendance disponibles sans LLM (vérifiés sur cf6101c7)

| Signal | Où | Disponible à l'observation ? |
|---|---|---|
| Œuvres soutenant l'angle | `relevanceEvidence.supportingDimensions[].supportingWorkRefs` (titres/DOI) + `supportingWorks[]` (`workRef` OpenAlex, DOI, titre) | oui (registre MONO-11, artefact enregistré avant `candidate_evidence`) |
| Source-graine (publication incluse d'où vient le candidat) | `discovery.candidates[].seedReferences[].providerWorkId` | oui (entrée de `runPanel`) |
| Affiliation | `assessment.professionalIdentity.affiliations`, `candidate.affiliation` (le gate gelé l'utilise déjà : réserve `DIVERSITY_NOT_OBSERVED`) | oui, mais souvent vide (physiologie : 0 affiliation sur 1 admis) |
| Décision réelle du gate | `MEG.gateCandidate(input)` gelé, fonction pure déterministe (mêmes entrées que `gatePanel`) | oui : appelable candidat par candidat depuis le monolithe avec les mêmes artefacts |

Mesure sur cf6101c7 (admis par angle) : représentation-connaissance-IA 2 admis / 6 œuvres distinctes / 2 graines ; éthique 6 / 22 / 5 ;
sciences cognitives 4 / 18 / 3 (2 affiliations) ; physiologie 1 / 5 / 1 ; géomatique 1 / 7 / 1 ; épidémiologie 2 / 7 / 2. Deux admis
partageant une œuvre ou une graine = co-auteurs ou même publication source : représentation non indépendante. Le cas « 3 admissibles
appuyés sur la même œuvre » est donc mesurable exactement par identité d'œuvre (`workRef`), sans aucune inférence.

## 5. Politique retenue (à implémenter) — PANEL-SUFFICIENCY-v2, stratégie MIN_INDEPENDENT_REPRESENTATION

- **Représentation d'un angle** = candidats **approuvés par le gate gelé** (`gateCandidate`, calculé à l'observation, jamais réécrit)
  dont `supportingDimensions` contient l'angle (même définition que G-6).
- **Indépendance** : deux représentants sont indépendants s'ils ne partagent **aucune œuvre** citée pour l'angle (identité `workRef`,
  DOI ou titre canonique — une référence non identifiable ne crée jamais d'indépendance) **et aucune source-graine**. Nombre de
  représentants indépendants = taille d'un ensemble deux à deux indépendants **maximal** (inclusion), construit gloutonnement dans l'ordre d'évaluation (déterministe) — **pas maximum** : dépend de l'ordre, ne sur-estime jamais (|glouton| ≤ |maximum|), peut sous-estimer (conservateur).
- **Angle SUFFISANT** ⇔ représentants ≥ `minimumAdmissibleRepresentativesPerDimension` (PRODUCT_POLICY, 3) **ET** représentants
  indépendants ≥ `minimumIndependentRepresentativesPerDimension` (CONTRACTUAL_FLOOR = 2, invariant anti-mono-jumeau).
- États par angle : `DIMENSION_CONTINUE` · `DIMENSION_SUFFICIENT` · `DIMENSION_EXHAUSTED_PARTIAL` (vivier épuisé, ≥ 1 représentant,
  insuffisant) · `DIMENSION_EXHAUSTED_EMPTY` (vivier épuisé, 0) · `DIMENSION_NO_POOL` (aucun candidat sélectionné, non représenté).
- États du panel : `PANEL_SUFFICIENT` (tous les angles suffisants) · `PANEL_EXHAUSTED_WITH_GAPS` (plus rien à évaluer, ≥ 1 angle non
  suffisant) · `PANEL_CONTINUE`. Early-stop : `EARLY_STOP_CONFIRMED` **uniquement** sur `PANEL_SUFFICIENT` ; un vivier épuisé n'est
  jamais « suffisant », il est déclaré comme un manque.
- Fermeture d'angle : uniquement `DIMENSION_SUFFICIENT`. Observations après verrou de transport ignorées.
- L'artefact de décision enregistre : id/stratégie/provenance de la policy, paramètres effectifs, par angle : état, motif, représentants,
  représentants indépendants, œuvres distinctes, graines distinctes, vivier initial/restant/non évalué, raison de fermeture.
