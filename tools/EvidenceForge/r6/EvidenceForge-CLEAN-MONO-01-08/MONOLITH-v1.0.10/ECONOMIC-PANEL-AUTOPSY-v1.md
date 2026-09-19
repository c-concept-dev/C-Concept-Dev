# ECONOMIC PANEL AUTOPSY v1 — run réel `efm-20260918-90544bfc` (150 professionnels → 480 revues)

**Date :** 2026-09-18 · **Base auditée :** MONOLITH-v1.0.5 (le run a été créé à 10:20 UTC sous la version active v1.0.5 ; `state.mission.documents[*].chunking` absent) · **Lecture seule** : aucun run relancé, aucun appel fournisseur.
**Run :** `~/evidenceforge-work/reports/h1-v105-runs/efm-20260918-90544bfc` — mission « Réaliser D103P0.1 — Revue professionnelle documentaire de structure… », 30 documents uploadés, budget LIMITED 15 USD (alerte 14), statut final STOPPED / STOPPED_BY_USER à l'étape TWINS_REVIEWS (13:13:59 UTC), 4 tentatives.

## 1. Compteurs mesurés (artefacts du run)

| Grandeur | Valeur | Preuve |
|---|---|---|
| Sources récupérées / incluses | 84 / 36 | `professionals-discovery.json › discovery.inputStats` |
| Angles (disciplines) | 10 (DISC-001…010) | `disciplines.json`, `panel.json › coverage.byDimension` |
| Candidats découverts | **723 → 689** après fusion | `candidates-deduplication.json` (`before: 723, after: 689`, règle ONE_CANDIDATE_PER_PROVIDER_AUTHOR_ID) ; graines 491 + secondaires 232 |
| Candidats identifiés (candidateRef réel) | **682** (7 non résolus) | `professionals-selection.json › poolCount: 682, unevaluableCount: 7` |
| Retenus pour évaluation | **150** | `professionals-selection.json › cap: 150, selectedCount: 150, reason: PROFESSIONAL_EVALUATION_CAP, capApplied: true` |
| Évalués réellement (oracle) | 96 (54 non évalués par suffisance) | `professionals-sufficiency.json › evaluated: 96, skipped: 54` |
| Approuvés par le gate gelé | 23 | `panel.json › counts.AUTO_APPROVED_FOR_DOCUMENTARY_PANEL: 23` (5 rejetés, 61 différés, 61 base insuffisante) |
| Jumeaux construits | 16 (7 bloqués : `coverage_evaluation_missing_or_invalid`) | `events.jsonl › twins_built` 12:53:22 |
| Cibles de revue | 30 (= documents uploadés) | `plan-confirmation.json › executionMission.targetDocuments` (30) |
| **Revues attendues** | **480 = 16 × 30** | `lib/cost-view.js:37` : `expected = built * targets` ; contrat gelé EF-03B : boucle `for target → for twin` (`MONO-01/dependencies/ef-03b-review-runner-v1.js:168-171`) |
| Groupes d'agrégation attendus | 300 = 30 cibles × 10 angles (1 appel LLM chacun) | `ef-03c-aggregation-v1.js:24-42` (`groupKey(targetId, dimensionId)`), `:189-191` |
| Coût engagé à l'arrêt | **12,10 USD** (PREFLIGHT 0,00 · MISSION 0,16 · DISCIPLINES 0,07 · PLAN 0,07 · RETRIEVAL 0,54 · **PROFESSIONALS 7,02** · **TWINS_REVIEWS 4,24**) | `run-stop-state.json › cost.byStage`, `cost-ledger.jsonl` |
| Appels réels | 163 (+ 3 réutilisations) | `run-stop-state.json`, `state.counters` |
| Projection à l'arrêt | ≈ 83–85 USD | `lib/cost-forecast.js` : 12,1 + (480 − 3) × ~0,15 USD/revue (échantillons en run) |

## 2. Réponses aux questions du mandat

**A. Pourquoi 682 identifiés.** MONO-09 (gelé) émet une entrée par (auteur × discipline de source incluse) : 36 sources incluses × leurs auteurs = 491 graines, + 232 auteurs d'œuvres liées (expansion `related_works`, 2 œuvres × 3 liées par graine, `stage-professionals.js:56-62`) = 723, fusionnés à 689 identités ; 682 possèdent un identifiant OpenAlex. La découverte est volontairement large (« DISCOVER BROADLY ») et gratuite (OpenAlex, 325 appels) — ce n'est pas le problème.

**B. Pourquoi 150 retenus.** `lib/professional-selection.js` (PROFESSIONAL-SELECTION-v1) : `selectedCount = min(pool, cap) = min(682, 150) = 150`. La sélection remplit le plafond dès que le pool le dépasse : **le plafond agit comme cible de sélection**. Le seul frein en aval est la suffisance (v1.0.5), qui a laissé 54 des 150 non évalués. `capIsGuardNotTarget: true` n'existe que comme *phrase* dans `professionals-economics.js` (`capStatus.statement`), sans effet fonctionnel.

**C. Pourquoi 150 aboutissent à 480 revues.** Ils n'y aboutissent pas directement : 150 retenus → 96 évalués → 23 approuvés → 16 jumeaux. Les **480 = 16 jumeaux × 30 cibles**. Le multiplicateur n'est pas le panel mais le **nombre de documents uploadés** : l'utilisateur a téléversé 30 fichiers (fragments manuels `PART-XX-OF-YY`, index, clarification) et chaque fichier devient une cible de revue distincte.

**D. Comment les revues sont calculées.** `professionnel × source-cible` : pour chaque cible (document) × pour chaque jumeau actif, une revue complète (prompt EF-03B avec le contenu intégral de la cible, findings par angle). Ni par requirement, ni par batch, ni par grille : **par document**. Puis l'agrégation ajoute un appel LLM par (cible × angle) = 300.

**E. Où Panel Sufficiency intervient.** `lib/stage-professionals.js:215-237` : traqueur PANEL-SUFFICIENCY-v2 consulté dans `fetchAuthorWorks` *avant* chaque évaluation (`tracker.shouldEvaluate`), pendant la boucle gelée MONO-11 `runAutonomousPanel` (qui itère les 150 de la sélection). Un angle SUFFISANT (≥ 3 approuvés dont ≥ 2 indépendants) ferme ses candidats de dimension primaire.

**F. Pourquoi il n'a pas arrêté plus tôt.** Il a fermé 6 angles (DISC-003/004/005/006/009/010 : 6 + 14 + 8 + 0 + 6 + 6 évaluations) et a continué pour 4 angles jamais suffisants : **DISC-001 (22 évalués, 0 approuvé)**, **DISC-002 (22 évalués, 2 approuvés)**, **DISC-008 (12 évalués, 0 approuvé)**, DISC-007 (aucun candidat). 56 des 96 évaluations (≈ 4,1 USD) ont été dépensées sur des angles épuisés sans atteindre la suffisance ; 44 d'entre elles n'ont produit aucun approuvé. La règle est correcte scientifiquement (« on ne peut plus trouver » ≠ « on a assez ») mais **aucune réévaluation par lot, aucun signal de rendements décroissants, aucune estimation de coût du lot suivant** n'existe : l'évaluation file jusqu'à épuisement du vivier.

**G. Conditions exactes** (`lib/panel-sufficiency.js`) :
- `PANEL_SUFFICIENT` ⇔ tous les angles `DIMENSION_SUFFICIENT` (représentants approuvés ≥ `minimumAdmissibleRepresentativesPerDimension` = 3 **et** indépendants ≥ 2, plancher contractuel MONO-01 EF-03C) ;
- `PANEL_CONTINUE` ⇔ au moins un angle non suffisant avec `remaining > 0` dans son vivier ;
- `PANEL_EXHAUSTED_WITH_GAPS` ⇔ aucun candidat restant dans aucun vivier et ≥ 1 angle non suffisant.
- Le coût n'entre nulle part dans ces états (correct) ; le budget dur (`budget-guard.js`) n'intervient qu'*après* dépassement, pas avant un lot.

**H. Nombre réel de professionnels utiles avant saturation.** Courbe mesurée (`professionals-sufficiency.json › history`) :

| rang évalué | approuvés cumulés | angles soutenus | angles soutenus ou partiels | état |
|---|---|---|---|---|
| 5 | 0 | 0 | 8 | CONTINUE |
| 10 | 1 | 1 | 10 | CONTINUE |
| 15 | 2 | 3 | 10 | CONTINUE |
| 20 | 2 | 3 | 10 | CONTINUE |
| 30 | 4 | 5 | 10 | CONTINUE |
| 50 | 10 | 7 | 10 | CONTINUE |
| 96 | 23 | 7 | 10 | EXHAUSTED_WITH_GAPS |

La couverture « soutenue ou partielle » de tous les angles est atteinte dès **10** évaluations ; la couverture *soutenue* plafonne à 7 angles dès le rang 50 (jamais 10 : DISC-001/007/008 n'ont aucun représentant). Les 46 évaluations après le rang 50 ont ajouté 13 approuvés (tous sur des angles déjà couverts) et **0 angle nouveau**.

**I. Coût marginal 1→N.** Oracle EF-02D2 : 0,0771 USD/appel (91 appels, 7,02 USD), soit 0,073 USD par candidat évalué (5 sans oracle : corpus insuffisant). Coût linéaire, indépendant du rang. En aval : couverture EF-02D3 0,164 USD par approuvé (46 appels pour 23, dont 20 reprises informées = 43 %) ; revue EF-03B ≈ 0,15 USD par revue (3 complètes 0,133 + 3 reprises 0,022) ; agrégation : non mesurée (jamais atteinte).

**J. Informations distinctes nouvelles après N professionnels** (approuvés / angles soutenus nouveaux dans l'intervalle) : 1→5 : 0/0 · 6→10 : 1/1 · 11→15 : 1/2 · 16→20 : 0/0 · 21→30 : 2/2 · 31→50 : 6/2 · 51→100 : 13/0 · 101→150 : (non évalués). Rendements décroissants nets après le rang 50 pour la couverture ; les approbations continuent à un rythme ≈ 1 sur 4 uniquement sur des angles déjà couverts.

## 3. Formules et emplacements

| Quantité | Formule | Fichier : lignes |
|---|---|---|
| selectedCount | `min(poolCount, cap)` tourniquet par discipline | `lib/professional-selection.js` (PROFESSIONAL-SELECTION-v1) |
| évaluation d'un candidat | `tracker.shouldEvaluate` → OpenAlex works → sonde de suffisance → oracle EF-02D2 (1 appel, 10 œuvres) | `lib/stage-professionals.js:233-240`, `MONO-11/v0.3-r1/core/autonomous-run.js:68-100` |
| approuvé | gate machine gelé `MEG.gateCandidate` | `MONO-11/v0.3-r1/core/machine-evidence-gate.js` |
| jumeaux | admis avec couverture EF-02D3 valide | `autonomous-run.js:128-156` |
| reviewsExpected | `twins × targets` | `MONO-01/dependencies/ef-03b-review-runner-v1.js:168-171` ; `lib/cost-view.js:37` |
| groupes d'agrégation | `targets × dimensions` | `MONO-01/dependencies/ef-03c-aggregation-v1.js:24-42, 189-191` |
| projection | `dépensé + (revues restantes × coût/revue mesuré)` | `lib/cost-forecast.js:58-60` |
| budget | vérifié AVANT chaque appel, arrêt APRÈS dépassement | `lib/budget-guard.js` (v1.0.5) |

## 4. Diagnostic

1. **Fanout structurel** (cause dominante, ×30) : revues = jumeaux × *documents uploadés* ; agrégation = documents × angles. Le produit cartésien est celui du contrat gelé EF-03A/03B **appliqué à des cibles que MONOLITH construit une par fichier** (`pipeline.js` : `targetDocuments: confirmation.executionMission.targetDocuments`). Un dossier de 7 documents réels découpé à la main en 30 fichiers a multiplié par 30 le coût de revue. Même avec AUTO-CHUNK (v1.0.6, 7 fichiers), on aurait 16 × 7 = 112 revues et 70 groupes.
2. **Plafond = cible** : 150 retenus systématiquement ; la seule parcimonie est la suffisance par angle, appliquée candidat par candidat sans lot, sans réévaluation, sans coût du lot suivant, sans signal de rendements décroissants.
3. **Angles épuisés coûteux** : 56 évaluations (≈ 4,1 USD) sur 3 angles qui ne pouvaient pas devenir suffisants (0 ou 2 approuvés sur 22).
4. **Reprises informées de couverture** : 43 % des appels EF-02D3 sont des reprises (1,56 USD) — hors périmètre de ce lot (enforcer MONO-11 gelé), signalé.
5. **Aucun gate économique** : la projection (85 USD) n'était visible qu'après le début des revues ; aucune confirmation humaine n'est demandée avant le lancement massif.
6. **Compteur ambigu** : « 3 / 480 revues » compte des documents-revue (jumeau × cible), pas des items ; les items (findings par angle) ne sont pas comptés séparément.

## 5. Ce que v1.0.7 peut corriger sans toucher aux lots gelés

- MONOLITH choisit les **cibles** de revue : une cible « dossier de mission » (tous les documents, délimités et attribués) ⇒ revues = jumeaux × 1, agrégation = angles × 1. Contrat gelé inchangé (1 revue complète par jumeau et par cible ; la cible est le dossier).
- MONOLITH décide **quels candidats** entrent dans la boucle gelée (déjà le mécanisme v1.0.5) ⇒ lots, réévaluation, estimation du lot suivant, arrêt budgétaire *avant* le lot, signal de rendements décroissants, projection avec le panel initial, gate économique humain.
- Panel Sufficiency (v2) reste l'**unique** autorité scientifique de l'état du panel.
