# RAPPORT — PROFESSIONAL PANEL COST OPTIMIZER (MONOLITH-v1.0.5, 2026-09-17)

Autopsie détaillée : `AUTOPSIE-PANEL-COST-OPTIMIZER.md`. Runs réels lus en lecture seule : baseline `efm-20260917-65c805ef`
(5,02 USD), run complet `efm-20260917-cf6101c7` (v1.0.4). Run différentiel créé pour ce chantier : `efm-20260917-dc30dc7a`.

## 1. Cause racine
Le coût de l'étape « professionnels » (83 % du run) est le produit **nombre d'évaluations × coût unitaire (≈ 0,04 USD, dont 80 % de
sortie : 7 rationales par candidat, prompt gelé)**. Trois défauts concrets, mesurés :
1. **Gaspillage** : 21/86 évaluations (24 %) ont consommé un 2ᵉ appel de « réparation » (0,68 USD, 16 % de l'étape) et fini UNKNOWN,
   parce que le validateur gelé EF-02D2 exige l'égalité de chaîne entre `supportingWorkRef` et le titre réel alors que le modèle
   recopie les titres avec apostrophes/guillemets typographiques (31/31 refus identiques après normalisation).
2. **Ordre** : la boucle gelée parcourait l'assessment MONO-10 groupé par discipline ; sous contrainte de budget, des angles entiers
   n'étaient jamais vus (le tourniquet `selectionOrder` était calculé mais inutilisé).
3. **Aucune condition de sortie** avant la fin de la liste : seuls le budget ou une panne arrêtent la boucle.
Et un fait qui borne toute stratégie : l'admission (SUPPORTED) est **rare et sans plateau** (3,5 % ici, 10 % sur cf6101c7, répartie
sur toute la liste) — il n'existe pas de « convergence » observable au niveau des professionnels ; seule une **suffisance** par angle
est démontrable.

## 2. Analyse coût / rang (baseline, 86 évaluations réelles — pas 150)
| N | coût cumulé | admissibles | angles SUPPORTED | angles SUP ∪ PARTIAL |
|---|---|---|---|---|
| 20 | 0,94 | 0 | 0 | 5 |
| 40 | 1,81 | 0 | 0 | 7 |
| 60 | 2,74 | 3 | 1 | 7 |
| 86 | 4,15 | 3 | 1 | 7 |
Coût unitaire : 0,0487 USD/évaluation (0,035 sans réparation, 0,08 avec). Sortie = 3,33 USD des 4,19.

## 3. Point de convergence rétrospectif
- Baseline (ordre tourniquet reconstruit) : dernier nouvel angle SUPPORTED au rang 33, dernière admission au rang 56 ; 30 évaluations
  ensuite (1,5 USD) sans apport. Extrapolé à 150 : ≈ 7 USD pour 1-2 admissions de plus.
- cf6101c7 (10 angles, 150 évalués, 15 admis) : admissions aux rangs 21…130, **aucun plateau** ; toute règle « k évaluations sans
  nouveauté » perd 7 à 13 admis sur 15 (tableau dans l'autopsie). Les seuils testés (20/30/40/50/60/75/100/125/150) ne sont donc
  **pas** transformés en règle : la seule règle démontrable est la suffisance par angle.

## 4. Algorithme retenu (4 leviers)
| Levier | Décision | Où |
|---|---|---|
| 1. Pré-tri | **Ordre tourniquet** (`selectionOrder`) pour la boucle gelée. Pré-tri lexical rejeté : AUC 0,52 (hasard) pour prédire l'admission ; les signaux MONO-10 sont uniformes (tous MODERATE/PLAUSIBLE/SEED). Rien n'est supprimé : les non-évalués restent en réserve | `professional-selection.js` `capAssessment` |
| 2. Early-stop | **PANEL-SUFFICIENCY-v1** : `EARLY_STOP_CONTINUE / CANDIDATE / CONFIRMED` ; CONFIRMED ⇔ chaque angle a ≥ `targetAdmissiblePerDimension` (3) admissibles (SUPPORTED ⇔ admis, invariant G-3 du gate gelé) ou vivier épuisé ; un angle à la cible est fermé (ses candidats restants ne sont pas évalués) ; nouveauté = admissible / nouvel angle SUPPORTED / nouvel angle PARTIAL / premier échantillon ; le plateau (2 × angles sans nouveauté après ≥ 3 par angle) n'est qu'un signal (`closeOnPlateau=false`). Déterministe, aucun appel LLM. Skip = erreur `PANEL_SUFFICIENT_EARLY_STOP` levée par la dépendance injectée `fetchAuthorWorks` (contrat existant de la boucle gelée : candidat consigné « non évalué », jamais un verdict) ; réserve `PROFESSIONAL_EVALUATION_EARLY_STOP` transmise à l'aval | `lib/panel-sufficiency.js`, `stage-professionals.js` `runPanel`, config `professionals.earlyStop` |
| 3. Batching / reuse | **Aucun regroupement** : chaque prompt EF-02D2 est unique (corpus du candidat) et le contrat gelé est « un professionnel par appel ». La reuse fonctionne (reformulation réutilisée à coût 0 sur le run différentiel). Le vrai levier était le **gaspillage des réparations** : **normalisation typographique des références** (`MONOLITH-WORKREF-NORMALIZATION-v1`, même classe que l'adaptateur de clôture Markdown), journalisée, réversible par config | `lib/workref-normalization.js` |
| 4. Model routing | Mécanisme livré (`llm.routing` par finalité, modèle journalisé par appel, reuse liée au modèle de la finalité) ; **aucune route par défaut** : benchmark réel (33 prompts exacts de la baseline, 1,87 USD) — Haiku 4.5 : 0,0153 USD/éval (−60 %) mais accord de classe 69 %, accord par dimension 67 %, SUPPORTED retrouvés 2/3, 2 faux positifs ; Sonnet 5 : 0,0414 USD/éval (**+8 %**, tokens de réflexion facturés) accord 58 %, 13 SUPPORTED sur 33 (référence : 3). Décision : conserver Sonnet 4.6 ; noter que l'oracle lui-même est instable (30-40 % de désaccord inter-modèles sur l'admission) | `lib/llm.js`, `tools/bench-oracle-model.js`, `runs/_bench/` |

## 5. Fichiers
Modifiés : `lib/stage-professionals.js` (runPanel : ordre, traqueur, adaptateur, journal), `lib/professional-selection.js` (`capAssessment` ordonné),
`lib/pipeline.js` (événements de suffisance, `professionals-sufficiency.json`, réserve aval), `lib/llm.js` (routage par finalité),
`lib/professionals-economics.js` (politique reportée), `config/monolith.config.json` (`professionals.evaluationOrder`, `workRefNormalization`,
`earlyStop`, `llm.routing`), `test/test-monolith.js`, `test/test-v105.js` (identités byte-à-byte requalifiées), `README.md`, `NON-REGRESSION.md`.
Nouveaux : `lib/panel-sufficiency.js`, `lib/workref-normalization.js`, `tools/bench-oracle-model.js`, `test/test-panel.js`,
`AUTOPSIE-PANEL-COST-OPTIMIZER.md`, ce rapport. Lots gelés, kits, MONO-04 : aucun fichier touché.

## 6. Tests
`test/test-monolith.js` : **133/133** (+17 : PRO-EARLY-01…12, WORKREF-01…04, ROUTING-01 ; MONO-10/MONO-11 gelés exercés réellement
via `runPanel` non mocké sur un monde synthétique, OpenAlex et fournisseur simulés par URL). Lanceur 14/14, navigateur 25/25, secrets
0 hit (76 fichiers), anti-hardcoding 0 hit avec **985 jetons** des runs réels, lots gelés byte-identiques.

## 7. Benchmark différentiel (même mission, même budget 5 USD / alerte 4, Portes 1 et 2 passées sans renversement comme la référence)
| | Baseline `65c805ef` (avant) | Différentiel `dc30dc7a` (après) |
|---|---|---|
| Coût total au plafond | 5,02 USD | 5,02 USD (arrêt propre `BUDGET_LIMIT_REACHED`) |
| Coût étape professionnels | 4,19 USD | 4,09 USD |
| Évaluations réelles | 86 | **98** (+14 %) |
| Appels oracle / réparations | 107 / 21 | 97 / **1** (−95 %) |
| Coût unitaire | 0,0487 USD | **0,0417 USD** (−14 %) |
| Références normalisées (appel évité) | 0 | 18 |
| Résultats | SUPPORTED 2 (3 après relecture), PARTIAL 48, OUT 15, **UNKNOWN 21** | SUPPORTED **5**, PARTIAL 65, OUT 26, UNKNOWN 2 (corpus insuffisant) |
| Angles échantillonnés | 6/7 (groupé : 22 candidats du 1ᵉʳ angle avant le 2ᵉ) | **8/8, 12-13 chacun** (tourniquet) |
| Pool / sélection | 270 → 150 | 477 → 150 |
| Suffisance | — | `EARLY_STOP_CANDIDATE` (plateau 26 sans nouveauté) ; non confirmée : 5 admissibles pour 8 angles |
| Reuse | 1 | 1 (reformulation réutilisée, 0 USD) |

## 8. Économie mesurée
- Par évaluation : **−14 %** (0,0487 → 0,0417) ; à budget égal : **+14 % d'évaluations utiles**, **21 → 2 UNKNOWN**, 3 → 5 admissibles.
- Économie absolue sur un run complet à 150 évaluations : ≈ 1,0 USD (réparations évitées) ; sur la baseline rejouée : 0,68 USD.
- **La cible ≤ 2,50 USD n'est pas atteinte** sur cette mission : le vivier est pauvre (5 % d'admissibles), la suffisance n'est jamais
  atteinte et les deux leviers qui auraient permis 2,5 USD sont refusés par les mesures (routage : qualité insuffisante ; arrêt sur
  plateau : perd la majorité des admis sur le run de référence). L'arrêt anticipé livré économise sur les viviers **riches**
  (test PRO-EARLY-01 : 9 évaluations au lieu de 15) ; sur un vivier pauvre, c'est le budget qui borne, comme prévu.

## 9. Impact qualité
Positif : 18 évaluations sauvées de l'UNKNOWN (dont des admissibles), tous les angles vus, lignée complète (motif de non-évaluation par
candidat, décision de suffisance dans le checkpoint et à part, réserve explicite aval). Aucun changement de contrat scientifique : la
normalisation ne réécrit qu'une référence de forme canonique identique à un unique titre réel ; une référence inventée reste refusée.
Point d'attention : le désaccord inter-modèles (31-42 %) montre que l'admission EF-02D2 est un jugement instable — à traiter comme tel
dans les réserves scientifiques (hors périmètre de ce chantier).

## 10. Limites restantes
- La suffisance ne se déclenche que si des angles atteignent 3 admissibles ; sur les missions à vivier pauvre le budget reste la borne.
- `targetAdmissiblePerDimension = 3` est un paramètre de politique (motivé par la règle anti-mono-jumeau de l'agrégation), pas une
  vérité mesurée : à ajuster sur des runs complets.
- Le run différentiel n'est pas déterministe (reformulation, angles 8 vs 7, pool 477 vs 270) : comparaison à mission et budget égaux, pas à pool égal.
- Coût unitaire irréductible ≈ 0,04 USD tant que le prompt gelé EF-02D2 exige 7 rationales ; seule une révision du lot MONO-01 (hors périmètre) le changerait.
- 4 parcours non évalués après le plafond restent journalisés comme `corpus_fetch_error` (comportement de la boucle gelée), désormais distingués des non-évalués par suffisance.

## 11. Statut
**GELABLE (candidat)** — sous réserve d'un audit indépendant de la normalisation des références (classe FORMAT_NORMALIZATION_ONLY) et
d'au moins un run réel à vivier riche déclenchant `EARLY_STOP_CONFIRMED`. Non gelé.
