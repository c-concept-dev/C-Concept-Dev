# MONOLITH-v1.0.7 — ECONOMIC VIABILITY / COST-AWARE PANEL SUFFICIENCY — RAPPORT DE LOT

**Date :** 2026-09-18 · **Base :** MONOLITH-v1.0.6 (candidat GELABLE, `ae9ee80c`, zip `2bb5d49c…`, non modifiée) · **Définition :** `v1.0.7 = v1.0.6 + ECONOMIC PANEL OPTIMIZATION + EARLY SUFFICIENCY + MARGINAL VALUE CONTROL + REVIEW FANOUT CONTROL`
**Coût du lot :** 0 USD — aucun appel fournisseur ; replay du run réel entièrement local. Documents : `ECONOMIC-PANEL-AUTOPSY-v1.md` (avant code), `COST-AWARE-PANEL-DESIGN-v1.md`, `JMMJS-PANEL-COST-REPLAY-v1.{json,md}`.

## 1. Causes racines (autopsie du run `efm-20260918-90544bfc`)

- **ROOT_CAUSE_150** : `PROFESSIONAL-SELECTION-v1` retient `min(pool, cap) = min(682, 150) = 150` ; le plafond agissait comme cible de sélection ; la seule parcimonie (suffisance v1.0.5) était appliquée candidat par candidat, sans lot, sans réévaluation, sans coût du lot suivant : 96 évalués (7,02 USD), dont 56 sur 3 angles jamais suffisants (44 sans aucun approuvé).
- **ROOT_CAUSE_480** : `revues = jumeaux × documents uploadés` = 16 × 30 (contrat gelé EF-03B « 1 revue par jumeau et par cible », cibles construites par MONOLITH une par fichier) ; agrégation = 30 × 10 angles = 300 appels. Projection 86 USD = 12,1 + 477 revues × 0,155.

## 2. Ce qui change (MONOLITH uniquement ; lots gelés intacts)

| Fichier | Nature |
|---|---|
| `lib/economic-panel.js` (AJOUTÉ, 143 l., pur) | `planBatches`, `createEconomicController` (SUFFICIENCY_FIRST), `buildReviewTargets` (MISSION_DOSSIER / PER_DOCUMENT), `projectDownstream`, `countReviewUnits`, `reviewMarginalContribution` |
| `lib/stage-professionals.js` (+25) | contrôleur consulté dans `fetchAuthorWorks` AVANT tout réseau ; arrêt budgétaire = verrou de transport `PANEL_INCOMPLETE_BUDGET_LIMIT` ; candidats différés (jamais « épuisés ») ; état partiel et checkpoint portent `economicPanel` |
| `lib/pipeline.js` (+59) | entrées économiques (budget, dépense, coûts par candidat, historique) ; `professionals-economic-panel.json` ; cibles de revue persistées (`review-targets.json`, hash vérifié à la reprise) ; `economic-projection.json` avant la première revue ; porte `ECONOMIC_REVIEW` + `confirmEconomics` ; `review-units.json` (reviewDocuments / reviewItems / contribution post-revue) ; `RESUMABLE += PANEL_INCOMPLETE_BUDGET_LIMIT` |
| `lib/cost-view.js` (+27) | cibles réelles (dossier = 1), `reviewDocuments` / `reviewItems` distincts, bloc `economics` (lots, dernier lot, prochain lot, projection, `ECONOMIC_OUTLIER_WARNING`, coût par gain d'information) |
| `lib/run-store.js` (+2) | `GATES.ECONOMIC_REVIEW` |
| `server.js` (+4) | `POST /api/runs/:id/confirm-economics`, `GET /api/runs/:id/projection` |
| `index.html` (+38) | carte de porte économique (projection, cellules, acte nominatif), compteurs distincts, contribution du dernier lot, prochain lot, alerte d'exception |
| `config/monolith.config.json` (+23) | `professionals.capIsGuardNotTarget`, `professionals.economic { … }` |
| `test/test-economic-panel.js` (AJOUTÉ) | T-ECO-01…18 ; `tools/browser-tests-v107.js` (AJOUTÉ) ; `tools/economic-replay.js` (AJOUTÉ) |
| adaptés | `test/test-panel.js` PRO-PARTIAL-01 (axe économique désormais renseigné), `tools/browser-tests-v105.js` (libellé), `tools/build-manifest.js`, `tools/package.sh`, `test/test-monolith.js` (chargement de la suite) |

Inchangés (diff vide) : `panel-sufficiency.js`, `professional-selection.js`, `budget-guard.js`, `run-stop.js`, `screening-*.js`, `corpus-portfolio-review.js`, `portfolio-balancing.js`, `cost-ledger.js`, `cost-forecast.js`, `llm*.js`, `stage-retrieval.js`, `stage-ef01.js`, `stage-report.js`, `paths.js`, `document-chunker.js`, `vendor/`, lots gelés MONO-01/09/10/11 (0 divergence).

## 3. Invariants garantis

| Exigence | Garantie | Test |
|---|---|---|
| Panel Sufficiency = autorité scientifique | seul `panel-sufficiency.js` produit `PANEL_SUFFICIENT` ; le contrôleur lit `tracker.decision()` ; source sans règle coût⇒suffisance | T-ECO-05/07/09/18 |
| Coût ne fabrique jamais la suffisance | budget 0 + panel non suffisant ⇒ `PANEL_INCOMPLETE_BUDGET_LIMIT`, état scientifique `PANEL_CONTINUE` | T-ECO-08/09 |
| Cap 150 = garde | 150 retenus, suffisant à 9 ⇒ 9 évalués, 141 non évalués, 0 appel | T-ECO-01/04/17 |
| Expansion incrémentale | lot initial 1/angle puis lots de 4, réévaluation à chaque lot | T-ECO-03/13 |
| Early stop réel | arrêt au lot où le traqueur passe `PANEL_SUFFICIENT` ; aucun appel après | T-ECO-02/04/17 |
| Pas de produit cartésien inutile | 1 cible dossier ⇒ jumeaux × 1 ; agrégation angles × 1 ; PER_DOCUMENT explicite | T-ECO-10/11 |
| Compteurs distincts | `reviewDocuments` ≠ `reviewItems` (API, UI) | T-ECO-11/12, browser v107 |
| Budget guard respecté | arrêt AVANT le lot ; garde v1.0.5 inchangée ensuite | T-ECO-08, RUN-SAFETY-* |
| Reprise inchangée | même plan/lots au rejeu (déterminisme), candidats différés rejoués à coût 0 | T-ECO-16, NONREG-03 |
| Gate humain économique | `ECONOMIC_REVIEW` si projection > 40 USD ; refus sans nom ; décision persistée avec projection | T-ECO-15, browser v107 |
| Alerte | `ECONOMIC_OUTLIER_WARNING` > 40 USD, cause principale | T-ECO-14 |
| Rendements décroissants descriptifs | signal après 3 lots sans gain, jamais une fermeture | T-ECO-06/07 |

## 4. Replay du run JMMJS (local, aucun appel) — `JMMJS-PANEL-COST-REPLAY-v1.md`

| | AVANT (mesuré) | APRÈS (rejoué / projeté) |
|---|---|---|
| candidats / identifiés / retenus | 689 / 682 / 150 | inchangés (150 = garde) ; panel initial **8**, lots de 4 (36 lots) |
| évalués / approuvés / état | 96 / 23 / EXHAUSTED_WITH_GAPS | 96 / 23 / EXHAUSTED_WITH_GAPS — identique : la suffisance (v2, inchangée) avait déjà arrêté 6 angles ; les 3 angles épuisés restent épuisés (mandat §9 : on continue sauf budget) ; rendements décroissants signalés (5 lots sans gain ; DISC-001, DISC-008 à rendement nul) |
| cibles de revue | 30 | **1** (dossier, 126 063 caractères) |
| **revues complètes** | **480** | **16** |
| items de grille | 4 800 | 160 |
| groupes d'agrégation | 300 | 10 |
| coût | 12,1 USD engagés ; ≈ **86 USD** projetés | **≈ 18,7 USD** projetés (couverture 3,77 + revues 16 × 0,25 avec dossier + agrégation 10 × 0,25 proxy) — **−78 %** ; KPI « standard » (10–25) |
| gate / alerte | — | ni outlier ni gate (< 40) ; **dépasserait le budget 15 USD** ⇒ le garde-budget arrêterait pendant les revues (reprenable après augmentation) |
| divergences / gaps | — | conservés : mêmes 23 approuvés, mêmes 16 jumeaux, mêmes angles, revue complète du dossier par chaque jumeau |

Ce que le replay ne montre pas : une économie sur l'étape PROFESSIONALS pour *cette* mission (les angles épuisés le seraient aussi par lots, sauf arrêt humain ou budgétaire) — l'économie de v1.0.7 y est la *visibilité* (lots, contribution, coût du lot suivant, signal) et le *frein* (budget avant lot, porte à 40 USD). Sur une mission dont les angles deviennent suffisants (cas T-ECO-01/02/04), l'arrêt précoce est effectif et mesuré.

## 5. Tests

| Suite | Résultat |
|---|---|
| `test/test-monolith.js` (+ v105, panel, sufficiency, screening-cost, run-safety, **economic-panel**) | **216 / 216** (198 + 18) |
| `test/test-chunking.js` | 21 / 21 |
| `tools/browser-tests-v107.js` | 11 / 11 |
| `tools/browser-tests-v106.js` / `-v105.js` | 12 / 12 · 33 / 33 |
| `tools/EvidenceForge/test/test-launch.js` (ACTIVE_VERSION = v1.0.7) | 14 / 14 |
| anti-hardcoding / secret-scan / lots gelés | 0 / 0 / 0 divergence |

## 6. Limites et suites

- L'économie de l'étape panel dépend du taux d'approbation par angle ; pour un angle sans candidat approuvable, seul le budget ou l'humain arrête (par mandat). Une option « accepter le panel tel quel » (gaps assumés, reprise directe en aval) n'est pas implémentée.
- 43 % de reprises informées sur la couverture EF-02D3 (1,56 USD) : enforcer MONO-11 gelé, hors périmètre.
- La revue d'un dossier volumineux augmente le coût unitaire de chaque revue (entrée) — projeté au tarif mesuré du run ; repli `PER_DOCUMENT` au-delà de 400 000 caractères.
- Coût d'agrégation jamais mesuré (le run réel n'y est pas parvenu) : projeté par proxy (coût unitaire d'une revue), étiqueté `PROXY_REVIEW_UNIT`.
- Un run réel sous v1.0.7 reste requis avant gel (validation de la porte, du dossier et des compteurs en conditions réelles).

## 7. Verdict technique

**MONOLITH-v1.0.7 — GELABLE** (candidat). Le gel appartient au propriétaire / à l'audit indépendant.
