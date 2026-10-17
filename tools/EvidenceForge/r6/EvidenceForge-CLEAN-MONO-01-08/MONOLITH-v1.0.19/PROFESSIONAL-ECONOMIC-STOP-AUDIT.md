# AUDIT — PROFESSIONAL ECONOMIC STOP (phase 1, 2026-09-17, baseline `1dfd051` / run `efm-20260917-5ad77c88`)

Audit en lecture seule, **0 USD dépensé**, aucun appel fournisseur. Rejeu déterministe des quatre runs réels avec le traqueur
PANEL-SUFFICIENCY-v2 (`lib/panel-sufficiency.js`, policy effective de la config) sur leurs observations réelles, puis simulations
rétrospectives des familles de règles A–E. Scripts de rejeu hors dépôt (scratchpad), résultats reproduits dans ce document.
PANEL-SUFFICIENCY-v2 reste la **politique de suffisance scientifique** ; rien ici ne la modifie.

## 0. Sources et fidélité du rejeu
| Run | Version | Ordre | Évalués | Décision du gate | Coût | Fin |
|---|---|---|---|---|---|---|
| `65c805ef` | v1.0.5 (avant optimiseur) | groupé par discipline | 86 | proxy SUPPORTED* | ledger réel | BUDGET 5,02 |
| `dc30dc7a` | v1.0.5 (différentiel) | tourniquet | 98 | proxy SUPPORTED* | ledger réel | BUDGET 5,02 |
| `5ad77c88` | v1.0.5 (v2) | tourniquet | 26 | `gateCandidate` journalisé | ledger réel | BUDGET 2,54 |
| `cf6101c7` | v1.0.4 (Sonnet) | groupé par discipline | 150 (complet) | `panel.json` (gatePanel gelé) | **reconstruit** (usage réel × tarification courante ; kits non valorisés) | COMPLETED 12,49 |

\* proxy « approuvé ⇔ classe SUPPORTED » : calibré **18/18** sur les deux runs où la décision réelle du gate existe (cf6101c7 : 15 SUPPORTED = 15 approuvés ;
5ad77c88 : 3 = 3). Les dimensions soutenues et œuvres citées sont relues dans les réponses EF-02D2 conservées via le validateur gelé et
`deriveRelevanceClass` gelée. Rejeu 5ad77c88 = journal en direct (26/26). cf6101c7 : le rejeu v2 donne `PANEL_EXHAUSTED_WITH_GAPS` avec
2 angles SUFFICIENT (sciences cognitives 4/3, éthique 6/5), 4 EXHAUSTED_PARTIAL, 3 EXHAUSTED_EMPTY, 1 NO_POOL — première observation
rétrospective complète de la sémantique B sur un run réel.

## 1. Courbes coût / gain (rang → coût cumulé USD / approuvés cumulés / indépendants cumulés)
| Rang | 65c805ef (7 angles) | dc30dc7a (8) | 5ad77c88 (8) | cf6101c7 (10) |
|---|---|---|---|---|
| 10 | 1,33 / 0 / 0 | 1,35 / 1 / 1 | 1,85 / 1 / 2 | 1,19 / 0 / 0 |
| 20 | 1,78 / 0 / 0 | 1,77 / 1 / 1 | 2,30 / 3 / 3 | 1,86 / 0 / 0 |
| 30 | 2,21 / 0 / 0 | 2,19 / 1 / 1 | — (26 : 2,54 / 3 / 3) | 2,52 / 2 / 2 |
| 40 | 2,65 / 0 / 0 | 2,65 / 3 / 3 | | 3,01 / 2 / 2 |
| 50 | 3,15 / 1 / 1 | 3,02 / 4 / 5 | | 3,66 / 4 / 4 |
| 60 | 3,57 / 2 / 2 | 3,45 / 4 / 5 | | 4,24 / 7 / 6 |
| 75 | 4,32 / 2 / 2 | 4,09 / 5 / 6 | | 5,01 / 8 / 7 |
| 86–98 | 4,98 / 2 / 2 (86) | 5,02 / 5 / 6 (98) | | 6,24 / 9 / 8 (98) |
| 125 | | | | 8,32 / 14 / 13 |
| 150 | | | | 9,77 / 15 / 14 |

Information nouvelle par rang (nouvel angle soutenu, nouveau représentant, nouvel indépendant, nouvelle œuvre, nouvelle graine, changement
d'état PANEL) : sur les quatre runs, **aucun changement d'état PANEL_*** n'intervient avant la fin (PANEL_CONTINUE tout du long ; cf6101c7 bascule
en EXHAUSTED_WITH_GAPS au dernier candidat). Les jalons par angle (plancher 2 indépendants, SUFFICIENT) tombent à des rangs dispersés :
65c805ef 54 ; dc30dc7a 38, 72 ; cf6101c7 30, 53, 57, 58, 105, 115.

## 2. Rendement marginal
| Run | Coût / évaluation | Approuvés / 100 évals | Coût par approuvé | Coût par indépendant | Coût par jalon d'angle |
|---|---|---|---|---|---|
| 65c805ef | 0,0482 (21 réparations) | 2,3 | 2,07 USD | 2,07 | 4,15 (1 jalon) |
| dc30dc7a | 0,0417 | 5,1 | 0,82 | 0,68 | 2,04 (2) |
| 5ad77c88 | 0,0433 | 11,5 | 0,38 | 0,38 | — (0) |
| cf6101c7 | 0,0618 (30 réparations, Sonnet 4.6 v1.0.4) | 10,0 | 0,62 | 0,66 | 1,55 (6) |

Le rendement marginal **ne décroît pas** avec le rang : les approbations sont dispersées sur toute la liste (cf6101c7 : rangs 21…130, écart moyen
8,7, écart max 21 ; dc30dc7a : 6…72, écart max 29 ; 65c805ef : première approbation au rang 41). Il n'existe aucun « coude » observable.

## 3. Taux d'admission
Global : 2,3 % · 5,1 % · 11,5 % · 10,0 %. Par angle (représentants obtenus, angle soutenu) :
- 65c805ef : 1 angle sur 7 représenté (disc-05 = 2), 6 angles à 0 après 86 évaluations.
- dc30dc7a : 4/8 représentés (disc-03 2, disc-04 2, disc-06 2, disc-08 1), 4 à 0 après 98.
- 5ad77c88 : 3/8 (cardiologie 2, médecine préventive 1, endocrinologie 1), 5 à 0 après 26.
- cf6101c7 : 6/10 (éthique 6, sciences cognitives 4, représentation 2, épidémiologie 2, physiologie 1, géomatique 1), 3 à 0 après 17 candidats
  propres chacun, 1 sans vivier.
**Soutien croisé** (un approuvé soutient un angle différent de son angle de découverte) : 0/2, 2/5, 2/3, 4/15 — soit 8/25 approuvés (32 %). Un
arrêt « par vivier » perd donc une part réelle des représentants des autres angles.

## 4. Contribution par angle
Les angles représentés le sont par 1 à 6 professionnels ; les angles à 0 le restent jusqu'au bout dans 3 runs sur 4 (65c805ef : 6 angles,
dc30dc7a : 4, cf6101c7 : 3 + 1 sans vivier). L'information « cet angle ne trouve rien » est disponible tôt (après 8–12 candidats propres) mais elle
n'est **pas** une preuve d'absence : cf6101c7 rang 130 (droit → éthique) et rang 44 (ingénierie → éthique) sont des approuvés issus de viviers à
0 approbation propre.

## 5–8. Simulations rétrospectives des familles de règles (où chaque règle aurait arrêté, ce qui aurait été perdu)
Perte = approuvés / indépendants / jalons d'angle situés après l'arrêt dans le run réel ; « FAUX ARRÊT » = un jalon d'angle perdu.

| Règle | 65c805ef (cap 5) | dc30dc7a (cap 5) | 5ad77c88 (cap 2,5) | cf6101c7 (cap 5 hypothétique) | cf6101c7 (sans cap) |
|---|---|---|---|---|---|
| A fenêtre 10 sans gain | stop@14, −70 %, perd 2 appr. + jalon **FAUX** | stop@16, −68 %, perd 4 + 2 jalons **FAUX** | jamais | stop@20, perd 15 + 6 jalons **FAUX** | idem |
| A fenêtre 20 | stop@20, −64 % **FAUX** | stop@26, −60 % **FAUX** | jamais | stop@20 **FAUX** | idem |
| A fenêtre 30 / 40 | stop@30/40 **FAUX** | jamais | jamais | jamais | jamais |
| B taux < 5 % après 3×angles | stop@21 **FAUX** | stop@24 **FAUX** | jamais | stop@41, perd 13 + 5 jalons **FAUX** | idem |
| C P(prochain jalon abordable) < 10 % | stop@84, −2 %, perte 0 | stop@94, −3 %, perte 0 | stop@24, −2 %, perte 0 | stop@72, perd 1 approuvé (rang 74) avant le mur réel (≈ 76) | stop@145, −2 %, perte 0 |
| C < 25 % | stop@82, −6 %, 0 | stop@89, −8 %, 0 | stop@22, −5 %, 0 | stop@67 | stop@137, −7 %, 0 |
| D futilité déterministe (panel) | jamais | jamais | jamais | rang 148 | rang 148, −1 % |
| D futilité par angle (plancher inatteignable) | jamais | jamais | jamais | rangs 149–150 | idem |
| E coût attendu du prochain gain > budget restant | stop@67, −20 %, 0 | stop@84, −12 %, 0 | stop@19, −11 %, **perd 1 approuvé** | stop@65 (perd 8 / 2 jalons vs run complet) | jamais |

Lecture :
- **A et B (rendement / taux observés) produisent des faux arrêts sur 3 runs sur 4**, avant la première approbation ou avant les jalons : ils sont
  disqualifiés. Aucune fenêtre ne sépare « rien ne vient » de « ça vient plus tard » parce que l'admission est rare et uniforme.
- **C et E (probabilistes, conscients du budget)** n'arrêtent que quelques évaluations avant le mur budgétaire : économie 2–8 % (C) à 11–20 % (E),
  sans perte de jalon, mais E perd un approuvé sur 5ad77c88 (rang 20) et C un sur cf6101c7 à 5 USD. Leur valeur n'est pas l'économie : c'est
  **l'information** « avec le budget restant, la probabilité de changer l'état d'un angle est de X % ».
- **D (futilité déterministe)** est certaine, sans risque, et économiquement nulle (déclenche aux rangs 148–150). À implémenter parce qu'elle est
  vraie, pas parce qu'elle économise.

Arrêt économique **par vivier** (variante C par angle primaire, simulée fidèlement sur cf6101c7 dont les 150 issues sont connues, sous plafond) :
| Plafond | Sans règle | Règle n0 = 8, τ = 0,25 |
|---|---|---|
| 5 USD | 75 évalués, 8 approuvés, 7 indépendants | 79 évalués (13 sautés), **9 approuvés, 8 indépendants** |
| 7,5 USD | 113, 11, 10 | 113 (16 sautés), **12, 11** |
| 10 USD (complet) | 150, 15, 14, 9,77 USD | 136 (14 sautés), 15, 14, **8,87 USD (−9 %)** |
Gain modeste (+1 approuvé à budget égal, ou −9 % à résultat égal), obtenu sur un run **groupé par discipline** ; non démontré en ordre tourniquet
(aucun run tourniquet complet n'existe). Risque : perte du soutien croisé (32 % des approuvés).

## 9. Options de policy
| Option | Description | Verdict empirique |
|---|---|---|
| P0 — aucun arrêt économique automatique | le budget reste la seule borne ; le système **informe** | sûr ; coût inchangé |
| P1 — futilité déterministe (D) | fermer un angle dont le plancher est mathématiquement inatteignable, et déclarer PANEL_SUFFICIENT inatteignable | certain, additif, économie ≈ 0, information exacte |
| P2 — ECONOMIC_STOP_RECOMMENDED informatif (C + E) | à chaque rang : P(prochain jalon abordable), coût attendu du prochain gain, budget restant ; recommandation journalisée, **décision humaine** au checkpoint / au mur | 2–20 % d'économie potentielle, quelques approuvés isolés à risque ; jamais de jalon perdu dans les runs bornés |
| P3 — arrêt automatique sur P2 selon policy produit | stop quand P < τ et coût attendu > budget restant | perd 1 approuvé sur 5ad77c88 (E) ; à n'activer qu'explicitement (`provenance: PRODUCT_POLICY`, τ tracé) |
| P4 — réallocation par vivier | sauter les viviers sans rendement au profit des autres | +1 approuvé / −9 % sur cf6101c7 ; non démontré en tourniquet ; perte de soutien croisé possible |
| P5 — allocation budgétaire par étape | (§ budget) empêcher qu'une étape amont consomme la marge du panel | **levier principal mesuré** (5ad77c88 : 56 % du budget avant le panel) |

## 10. Recommandation architecturale
1. **Ne pas construire un arrêt économique global fondé sur le rendement observé** (A/B) : faux arrêts démontrés sur 3 runs / 4.
2. Construire `PROFESSIONAL-EVALUATION-ECONOMICS-v1` comme un **axe distinct et informatif** (`economicEvaluationState`) alimenté par C, D et E :
   - `ECONOMIC_CONTINUE` ; `ECONOMIC_STOP_RECOMMENDED` (P(prochain jalon abordable) < τ **et** coût attendu du prochain gain > budget d'étape
     restant, avec les estimations affichées comme ESTIMATE — NOT GUARANTEE) ; `ECONOMIC_STOP_CONFIRMED` uniquement par (a) futilité déterministe
     D ou (b) décision humaine explicite ou (c) policy produit explicitement activée (P3, désactivée par défaut).
   - Jamais `PANEL_SUFFICIENT` ; tout arrêt économique conserve les lacunes (`scientificPanelState` inchangé, gaps listés) et l'énoncé
     « évaluation interrompue pour rendement marginal / budget ; le panel n'est PAS déclaré scientifiquement suffisant ».
3. **Autorité humaine (§7)** : option B recommandée — une seule question au propriétaire, posée au **mur budgétaire** ou sur `ECONOMIC_STOP_RECOMMENDED`
   (pas à chaque candidat) : « continuer pour ≈ X USD estimés (P = Y % de franchir un jalon) ou conserver les lacunes actuelles ? ». L'option A
   (arrêt automatique) n'est justifiée que par D. Le mécanisme existant `BUDGET_LIMIT_REACHED → reprise après relèvement explicite` est déjà cette
   question ; il manque l'estimation X / Y et l'état partiel — ce dernier est livré (§12).
4. **Budget par étape (§8)** : le levier mesuré. 5ad77c88 : Porte 2 à 1,41 USD sur 2,50 (56 %), panel 26/150. Sur le run complet cf6101c7 :
   amont 4 % (kits non valorisés), professionnels 74 %, **aval 22 %** (EF-02D3 couverture 1,07 USD, EF-03B revues 1,51, synthèse 0,15 = 2,72 USD
   pour 15 admis ≈ 0,18 USD par admis). Conséquence : aucun des runs à 5 USD n'aurait pu financer l'aval même avec un panel suffisant.
   Proposition (sans valeur imposée) : `budget.allocation = { screeningUsd | share, professionalsUsd | share, synthesisReserve: { perAdmittedUsd, minimumUsd } }`
   avec garde par étape (`assertAllowed(stage)`) : une étape ne consomme pas la part d'une autre sans réallocation explicite du propriétaire ; la
   réserve aval est calculée sur les admis courants (0,18 USD/admis mesuré, à tracer comme estimation). Les parts par défaut peuvent être dérivées
   des runs réels (médiane observée) mais restent `PRODUCT_POLICY` révisables.
5. Deuxième foyer : screening (`SCREENING-COST-AUTOPSY.md`) — économie estimée ≈ 0,7 USD / run (−55 % du coût de screening) sans changer la décision.

## 11. Tests proposés (phase 2, après validation de la policy)
ECON-01 séparation des axes (un ECONOMIC_STOP ne change jamais scientificPanelState) ; ECON-02 futilité déterministe exacte (plancher
inatteignable ⇒ angle fermé, jamais SUFFICIENT) ; ECON-03 P(jalon) calculée sans LLM, avec posterior explicite (Laplace) et bornes ; ECON-04
recommandation journalisée avec estimations marquées ESTIMATE ; ECON-05 rejeu des quatre runs = décisions identiques (déterminisme) ; ECON-06
aucun faux arrêt sur les jalons des runs réels (fixtures dérivées des rejeux) ; ECON-07 budget par étape : une étape amont ne dépasse pas sa part,
réserve aval calculée sur les admis ; ECON-08 question humaine posée une fois (jamais par candidat) ; ECON-09 policy P3 désactivée par défaut,
provenance tracée ; ECON-10 anti-hardcoding (aucun nom de cas, aucune valeur des runs réels dans les seuils).

## 12. Estimation de gain
- Arrêt économique (C/E, informatif → décision humaine) : **2–20 %** de l'étape professionnels, sans perte de jalon sur les runs bornés ; risque
  d'un approuvé isolé perdu. Sur 5ad77c88 : ≈ 0,1–0,3 USD.
- Réallocation par vivier (P4) : +1 approuvé à budget égal ou −9 % à résultat égal (un run, ordre groupé) — à confirmer avant toute mise en œuvre.
- Budget par étape + screening : **≈ 0,7 USD** rendus au panel sur 5ad77c88 (+16 évaluations, +60 %) — le gain le plus sûr.
- Futilité D : 0 USD, information exacte.

## 13. Correctif additif livré dans ce lot (documenté séparément) — état partiel sur arrêt budget
`lib/stage-professionals.js` : sur toute interruption de `runPanel` (plafond, panne, invariant), l'erreur porte `panelPartialState`
(`EvidenceForge.PanelSufficiencyPartialState`, `notAVerdict: true`, `scientificPanelState`, `earlyStopState`, `economicEvaluationState: null`
réservé, policy, rang, évalués/sautés/approuvés, sélectionnés/restants, coverage, gaps, perDimension, reasons, history, panne). `lib/pipeline.js` :
persistance dans `professionals-sufficiency-partial.json` avec `cost` (ledger) et `budget`, événement utilisateur `panel_partial_state`.
Local, déterministe, jamais un checkpoint, jamais un verdict ; rien n'est écrit si l'erreur ne porte pas d'état. Tests PRO-PARTIAL-01
(runPanel réel sous plafond) et PRO-PARTIAL-02 (pipeline : fichier + coût + budget + événement ; erreur sans état ⇒ rien). Suite 158/158.

## Verdict
**AUDIT_READY_FOR_POLICY_DECISION** — aucune policy économique implémentée ; décisions attendues du propriétaire : (1) P1 seul, ou P1 + P2
(informatif, décision humaine), (2) budget par étape (P5) avec ou sans dérivation des parts par défaut, (3) chantier screening.
