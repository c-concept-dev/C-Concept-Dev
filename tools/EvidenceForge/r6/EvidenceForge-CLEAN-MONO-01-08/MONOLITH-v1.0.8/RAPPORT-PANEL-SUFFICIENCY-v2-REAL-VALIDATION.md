# RAPPORT — VALIDATION RÉELLE PANEL-SUFFICIENCY-v2 (MONOLITH-v1.0.5, 2026-09-17)

## 1. Commit testé
Serveur redémarré sur `75ffcd4` (main ; = `d85c9a7` + correction MAXIMUM → MAXIMAL et tests SUFF-15/16, aucune autre modification).
Contrôle préalable exécuté avant tout appel payant : le comptage des indépendants est un ensemble indépendant **maximal** glouton, **pas maximum** ;
il ne sur-estime jamais (aucun faux SUFFICIENT possible), peut sous-estimer (conservateur) ; stratégie journalisée dans chaque décision
(`independenceAlgorithm: GREEDY_MAXIMAL_IN_EVALUATION_ORDER`). Détail : `RAPPORT-PANEL-SUFFICIENCY-POLICY.md` §7b.

## 2. Mission
« Examiner dans quelle mesure l’activité physique régulière chez l’adulte est associée à des bénéfices cardiovasculaires et quels facteurs
conditionnent ces bénéfices. » (mission proposée par le propriétaire ; sha256 de la question `98aca0b1…`). Pipeline **standard** de bout en bout :
reformulation → EF-01B (8 disciplines) → EF-01C1 (8 requêtes) → Porte 1 (confirmée sans modification) → retrieval OpenAlex → screening
(180 sources, 177 jugées, 3 doublons) → revue de portefeuille → Porte 2 (ratifiée sans renversement) → MONO-09 découverte → MONO-10 assessment
→ sélection plafonnée (150) → boucle gelée MONO-11. Aucune fixture, aucun candidat injecté, aucune discipline codée en dur, aucun faux corpus.
Run : `efm-20260917-5ad77c88` (runs root `h1-v105-runs`, lecture seule après arrêt).

## 3. Budget
Plafond **2,50 USD**, alerte **2,00 USD**, fixés à la création (`budget.json`, `setBy: user`). Alerte levée à 2,056 USD (rang 14) ; plafond atteint à
**2,536 USD** (`limitReachedAt` 18:44:40 UTC). Budget jamais relevé, run jamais repris.

## 4. État final
`STOPPED / BUDGET_LIMIT_REACHED` à l'étape PROFESSIONALS (verrou de transport, aucun checkpoint, aucun verdict). État de suffisance au dernier
rang évalué (journal `candidate_evidence`, rang 26) : **`PANEL_CONTINUE` / `EARLY_STOP_CONTINUE`**. Ni A (PANEL_SUFFICIENT) ni B
(PANEL_EXHAUSTED_WITH_GAPS) n'a été atteint : le budget a borné avant, comme anticipé à la Porte 2 (1,41 USD déjà dépensés, ≈ 1,09 USD restants
pour ≈ 25 évaluations sur 150 sélectionnées / 8 angles).

## 5. Angles
8 : epidemiologie, physiologie-exercice, cardiologie, medecine-preventive-sante-publique, biologie-moleculaire-cellulaire, sciences-comportement-psychologie-sante, statistiques-biostatistiques, endocrinologie-metabolisme.

## 6. Candidats
| Mesure | Valeur |
|---|---|
| Découverts (MONO-09) | 1927 (85 œuvres incluses) |
| Résolus / vivier sélectionnable | 1783 (poolHash `3a5e5c9b7e36be50…`) ; 144 non résolus (inévaluables) |
| MONO-10 | 1927 évalués : 876 présentés, 745 base documentaire insuffisante, 306 identité ambiguë |
| Sélectionnés (cap 150 = garde) | 150 (selectionHash `4ae029e53be570f1…`) — par angle : bio-mol-cell 19/144 ; cardiologie 19/154 ; endocrino-metab 19/113 ; epidemiologie 19/533 ; med-prev-sante-pub 19/297 ; physio-exercice 19/326 ; sci-comportement 18/111 ; statistiques 18/105 |
| Ordre | tourniquet `selectionOrder` (déterministe, 1 candidat par angle en boucle — vérifié sur les 26 rangs ci-dessous) |
| Évalués réellement avant le verrou | **26** (24 appels oracle EF-02D2 + 2 corpus INSUFFICIENT sans appel) |
| Parcours à vide après le verrou (boucle gelée) | 124 journalisés `corpus_fetch_error`, **tous ignorés** par le traqueur (approuvés cumulés et « depuis nouveauté » constants) |
| Classes (26) | OUT_OF_SCOPE 8, PARTIAL 13, SUPPORTED 3, UNKNOWN 2 |
| Approuvés par le gate gelé (`gateCandidate`) | **3** (= 3 `AUTO_APPROVED_FOR_DOCUMENTARY_PANEL` du `gatePanel` gelé exécuté en fin de boucle : cohérent) |
| Réparations EF-02D2 | **0** ; normalisations de références journalisées : 6 (0 appel de réparation) |

## 7. Coût réel (ledger EvidenceForge, USD)
| Poste | Appels | USD |
|---|---|---|
| PREFLIGHT / sondes | 4 | 0,0006 |
| MISSION (reformulation) | 1 | 0,0101 |
| DISCIPLINES (kit EF-01B) | 1 | 0,0209 |
| PLAN (kit EF-01C1) | 1 | 0,0460 |
| RETRIEVAL (screening 23 + 8 reprises informées, portefeuille 7 + 4 reprises) | 42 | 1,3330 |
| **Avant professionnels** | 49 | **1.4103** |
| PROFESSIONALS (EF-02D2, 24 appels réels + 1 sonde) | 25 | **1.1258** |
| **Total** | 74 lignes (67 REAL_CALL, 2 KIT_CALL, 4 sondes) | **2.5361** |

Coût par évaluation professionnelle : **0.0433 USD** (1,1258 / 26 ; 0,0469 par appel oracle). Reuse : **0** (mission nouvelle : aucun prompt identique).
Aucune réconciliation avec la facturation du fournisseur (autres consommations du compte inconnues).

## 8. Appels
67 appels réels + 2 appels kits + 4 sondes ; 721 appels OpenAlex (gratuits). 0 réutilisation, 0 refus de réutilisation.

## 9. Décision dimension par dimension (rejeu déterministe du traqueur v2 sur les 26 observations)
Aucun artefact `professionals-sufficiency.json` n'est écrit sur un arrêt budget (pas de checkpoint) : la décision ci-dessous est **reconstruite** par
rejeu du traqueur (`lib/panel-sufficiency.js`, même policy effective) sur les observations réelles (classes et décisions du gate lues dans
`events.jsonl`, dimensions soutenues et œuvres citées relues dans les réponses EF-02D2 conservées, via le validateur gelé et `deriveRelevanceClass`
gelée). Le rejeu concorde avec le journal en direct sur les 26 rangs : état du panel ✔, approuvés cumulés ✔, nouveautés (dont `NEW_INDEPENDENT_REPRESENTATIVE`) ✔.

Policy effective : `PANEL-SUFFICIENCY-v2` / `MIN_INDEPENDENT_REPRESENTATION` / `PRODUCT_POLICY` ; cible 3 représentants dont 2 indépendants (plancher contractuel 2) ; indépendance SUPPORTING_WORKS + SEED_SOURCES ; `GREEDY_MAXIMAL_IN_EVALUATION_ORDER`.

| Angle | État | Représentants | Indépendants | Œuvres distinctes | Graines distinctes | Vivier initial / évalué / restant |
|---|---|---|---|---|---|---|
| epidemiologie | `DIMENSION_CONTINUE` | 0 | 0 | 0 | 0 | 19 / 3 / 16 |
| physiologie-exercice | `DIMENSION_CONTINUE` | 0 | 0 | 0 | 0 | 19 / 3 / 16 |
| cardiologie | `DIMENSION_CONTINUE` | 2 | 1 | 5 | 1 | 19 / 4 / 15 |
| medecine-preventive-sante-publique | `DIMENSION_CONTINUE` | 1 | 1 | 3 | 1 | 19 / 3 / 16 |
| biologie-moleculaire-cellulaire | `DIMENSION_CONTINUE` | 0 | 0 | 0 | 0 | 19 / 4 / 15 |
| sciences-comportement-psychologie-sante | `DIMENSION_CONTINUE` | 0 | 0 | 0 | 0 | 18 / 3 / 15 |
| statistiques-biostatistiques | `DIMENSION_CONTINUE` | 0 | 0 | 0 | 0 | 18 / 3 / 15 |
| endocrinologie-metabolisme | `DIMENSION_CONTINUE` | 1 | 1 | 6 | 1 | 19 / 3 / 16 |

Panel : **`PANEL_CONTINUE`** — Le panel n'est pas encore suffisant selon la politique : l'évaluation continue.
Couverture : angles soutenus (SUPPORTED) ["cardiologie","medecine-preventive-sante-publique","endocrinologie-metabolisme"] ; soutenus ou partiels 8/8 ; suffisants 0 ; épuisés 0 ; sans vivier 0.

## 10. Indépendance (observation réelle)
- Deux des 3 approuvés soutiennent des angles **autres que leur angle primaire** (rangs 4 et 20 : angle primaire épidémiologie, soutiennent
  cardiologie / médecine préventive) : la représentation v2 compte bien sur les dimensions **soutenues** (définition G-6), pas sur l'angle de
  découverte — la v1 les aurait comptés pour l'épidémiologie.
- **Cardiologie : 2 représentants, 1 indépendant.** Les deux approuvés (`A5000828503`, `A5080637693`) citent 5 œuvres distinctes mais ont été
  découverts depuis la **même source-graine** (`W3021842026`) : non indépendants selon `SEED_SOURCES`. La règle a donc joué en exploitation
  réelle dans le sens conservateur attendu (sans elle, cardiologie afficherait 2/2).
- Endocrinologie-métabolisme et médecine préventive : 1 représentant chacun (1 indépendant), 6 et 3 œuvres distinctes.
- Aucun représentant sans œuvre identifiable (les 3 approuvés citent des œuvres réelles du corpus attribué, validées par EF-02D2 gelé).

## 11. Rang du stop
Aucun arrêt anticipé. Verrou budget après le rang 26 (24ᵉ appel oracle) ; alerte au rang 14.

## 12. Évaluations / appels évités
**0** évaluation, **0** appel évités par la suffisance (elle n'a pas été atteinte). Pour information (ESTIMATE — NOT GUARANTEE, jamais un coût
dépensé) : poursuivre les 124 candidats restants du vivier sélectionné aurait coûté ≈ **5.37 USD** de plus au coût unitaire observé
(0.0433 USD), soit ≈ 7.91 USD pour les 150.

## 13. Économie
Aucune économie due à la v2 sur ce run (aucun angle suffisant, aucun vivier épuisé). Économie mesurée attribuable aux correctifs précédents :
**0 réparation** sur 24 appels (6 références normalisées à coût 0 ; baseline 65c805ef : 24 % de réparations).

## 14. Anomalies et observations
1. **Dépassement du plafond de 0,036 USD** (2,536 pour 2,50) : la garde autorise un appel tant que le total *avant* l'appel est sous le plafond
   (2,4958 au rang 24) ; dépassement borné à un appel. Comportement existant du `budget-guard`, documenté ici, non modifié.
2. **Pas d'artefact de décision persisté sur arrêt budget** : la décision v2 n'existe que dans le journal (`panel`, `sufficiency`, `approvedCumulative`
   par `candidate_evidence`) et par rejeu déterministe (concordant 26/26). Un artefact partiel additif à l'arrêt (`professionals-sufficiency-partial.json`)
   serait utile — **non implémenté** (interdiction de modifier l'architecture pendant ce chantier).
3. 124 parcours à vide après le verrou journalisés par la boucle gelée (`corpus_fetch_error`) : ignorés par le traqueur (`ignore: TRANSPORT_LATCHED`),
   vérifié sur le journal (approuvés cumulés 3 et « depuis nouveauté » 6 constants sur les 124).
4. **Coût avant professionnels élevé** : 1,41 USD dont 1,33 pour le screening/portefeuille de 180 sources, avec **12 reprises informées sur 42 appels**
   (29 %) — hors périmètre de ce chantier, à instruire séparément (structure des réponses de screening).
5. Vivier riche mais **admission rare** : 3 approuvés / 26 (11,5 %), sur 3 angles ; 13 PARTIAL. Au taux observé, 3 représentants indépendants sur
   chacun des 8 angles demanderait bien plus que 150 évaluations : le plafond 150 reste une garde, pas une cible, et la preuve A (PANEL_SUFFICIENT)
   n'est pas accessible à 2,50 USD ni probablement à 5 USD sur une mission à 8 angles.
6. Le `gatePanel` gelé exécuté après le verrou compte 3 approuvés / 8 rejetés / 14 différés / 125 base insuffisante : cohérent avec les 3 décisions
   `gateCandidate` prises en direct (aucune divergence gate-par-candidat vs gate-panel).

## 15. Tests (après le run, commit 75ffcd4)
Monolith **156/156** (dont SUFF-01…16, WORKREF-ADV-01…08, PRO-EARLY-01…12, portefeuille SCREEN-PORTFOLIO-*), navigateur **25/25**, lanceur **14/14**,
secrets **0 hit**, anti-hardcoding **0 hit** avec **7 820 jetons** issus des trois runs réels (5ad77c88, dc30dc7a, 65c805ef : noms, affiliations,
titres, identifiants), runs historiques intacts (WORKREF-04 rejoue 65c805ef en lecture seule ; dc30dc7a et 5ad77c88 non modifiés après leur arrêt).

## 16. Hashes gelés (vérification fail-closed au démarrage et après le run, 0 divergence)
| Lot | Fichiers | Sceau sha256 | Zip canonique |
|---|---|---|---|
| MONO-01 | 106 | `4ba8903c…fe18ffd` | — |
| MONO-09 | 9 | `f1f1e94b…4016e56` | — |
| MONO-10 v0.19 | 79 | `e050af05…ced48227` | `f5a41654…72c2e04` |
| MONO-11 v0.3-r1 | 52 | `9fbef412…402c079c` | `3c44b397…9296b0b` |
Paquet MONOLITH-v1.0.5 : zip `f4f01012…` (MANIFEST 77 fichiers, vérifié) avant ce rapport ; reconstruit après.

## 17. Conclusion
- La v2 a fonctionné en exploitation réelle **sans anomalie de logique** : représentation par le gate gelé (3 = 3), comptage sur les dimensions
  soutenues, règle d'indépendance active (cardiologie 2 représentants / 1 indépendant par graine partagée), verrou budget prioritaire, observations
  post-verrou ignorées, décision rejouable à l'identique (26/26).
- **Mais ni PANEL_SUFFICIENT ni PANEL_EXHAUSTED_WITH_GAPS n'a été observé** : le budget de 2,50 USD a borné à 26 évaluations sur 150. La preuve
  d'exploitation demandée (état A ou B avec artefact complet) **n'est pas obtenue**.
- Coût de cette validation : **2,54 USD**.

**VERDICT : NON GELABLE** (logique validée en réel, sémantique A/B non observée en réel). Pour obtenir B (vivier épuisé) sans dépense
disproportionnée, une mission à vivier étroit (peu d'angles, peu de candidats résolus) serait nécessaire ; pour A, un vivier riche **et**
un budget permettant ≥ 24 approbations indépendantes sur tous les angles, ce qui n'est pas réaliste à 8 angles. Décision du propriétaire.
Jamais GELÉ.

## Annexe — tableau par rang (26 observations réelles avant verrou)
| Rang | Candidat | Angle primaire | Corpus | Classe | Gate | Angles soutenus | Œuvres citées | Graines | Coût cumulé | Approuvés cum. | Panel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `A5001127450` | bio-mol-cell | SUFFICIENT | OUT_OF_SCOPE | — | — | — | 1 | 1.4489 | 0 | PANEL_CONTINUE |
| 2 | `A5033890566` | cardiologie | SUFFICIENT | PARTIAL | — | — (+7 partiels) | — | 1 | 1.5117 | 0 | PANEL_CONTINUE |
| 3 | `A5000933212` | endocrino-metab | SUFFICIENT | OUT_OF_SCOPE | — | — | — | 1 | 1.5520 | 0 | PANEL_CONTINUE |
| 4 | `A5000828503` | epidemiologie | SUFFICIENT | SUPPORTED | **APPROVED** | cardiologie, med-prev-sante-pub (+2 partiels) | 4 | 1 | 1.6002 | 1 | PANEL_CONTINUE |
| 5 | `A5055357489` | med-prev-sante-pub | SUFFICIENT | OUT_OF_SCOPE | — | — | — | 1 | 1.6413 | 1 | PANEL_CONTINUE |
| 6 | `A5001970800` | physio-exercice | SUFFICIENT | OUT_OF_SCOPE | — | — | — | 1 | 1.6832 | 1 | PANEL_CONTINUE |
| 7 | `A5000903337` | sci-comportement | SUFFICIENT | PARTIAL | — | — (+3 partiels) | — | 1 | 1.7271 | 1 | PANEL_CONTINUE |
| 8 | `A5002375158` | statistiques | SUFFICIENT | OUT_OF_SCOPE | — | — | — | 1 | 1.7691 | 1 | PANEL_CONTINUE |
| 9 | `A5003001775` | bio-mol-cell | SUFFICIENT | OUT_OF_SCOPE | — | — | — | 1 | 1.8076 | 1 | PANEL_CONTINUE |
| 10 | `A5123845322` | cardiologie | SUFFICIENT | PARTIAL | — | — (+3 partiels) | — | 1 | 1.8539 | 1 | PANEL_CONTINUE |
| 11 | `A5001540431` | endocrino-metab | SUFFICIENT | SUPPORTED | **APPROVED** | endocrino-metab (+4 partiels) | 6 | 1 | 1.9073 | 2 | PANEL_CONTINUE |
| 12 | `A5027731973` | epidemiologie | SUFFICIENT | OUT_OF_SCOPE | — | — | — | 1 | 1.9535 | 2 | PANEL_CONTINUE |
| 13 | `A5057844452` | med-prev-sante-pub | SUFFICIENT | PARTIAL | — | — (+2 partiels) | — | 1 | 1.9971 | 2 | PANEL_CONTINUE |
| 14 | `A5019955596` | physio-exercice | SUFFICIENT | PARTIAL | — | — (+6 partiels) | — | 1 | 2.0563 | 2 | PANEL_CONTINUE |
| 15 | `A5001390698` | sci-comportement | SUFFICIENT | PARTIAL | — | — (+1 partiels) | — | 1 | 2.0944 | 2 | PANEL_CONTINUE |
| 16 | `A5002779497` | statistiques | SUFFICIENT | PARTIAL | — | — (+1 partiels) | — | 1 | 2.1416 | 2 | PANEL_CONTINUE |
| 17 | `A5005228976` | bio-mol-cell | SUFFICIENT | PARTIAL | — | — (+3 partiels) | — | 1 | 2.1906 | 2 | PANEL_CONTINUE |
| 18 | `A5146339538` | cardiologie | INSUFFICIENT | UNKNOWN | — | — | — | 1 | 2.1906 | 2 | PANEL_CONTINUE |
| 19 | `A5001968810` | endocrino-metab | SUFFICIENT | PARTIAL | — | — (+3 partiels) | — | 1 | 2.2547 | 2 | PANEL_CONTINUE |
| 20 | `A5080637693` | epidemiologie | SUFFICIENT | SUPPORTED | **APPROVED** | cardiologie (+3 partiels) | 2 | 1 | 2.2984 | 3 | PANEL_CONTINUE |
| 21 | `A5069730469` | med-prev-sante-pub | SUFFICIENT | PARTIAL | — | — (+3 partiels) | — | 1 | 2.3477 | 3 | PANEL_CONTINUE |
| 22 | `A5025363382` | physio-exercice | SUFFICIENT | PARTIAL | — | — (+2 partiels) | — | 1 | 2.4014 | 3 | PANEL_CONTINUE |
| 23 | `A5004154542` | sci-comportement | SUFFICIENT | PARTIAL | — | — (+1 partiels) | — | 1 | 2.4376 | 3 | PANEL_CONTINUE |
| 24 | `A5006890401` | statistiques | SUFFICIENT | PARTIAL | — | — (+3 partiels) | — | 1 | 2.4958 | 3 | PANEL_CONTINUE |
| 25 | `A5006019817` | bio-mol-cell | SUFFICIENT | OUT_OF_SCOPE | — | — | — | 1 | 2.5361 | 3 | PANEL_CONTINUE |
| 26 | `A5146355332` | cardiologie | INSUFFICIENT | UNKNOWN | — | — | — | 1 | 2.5361 | 3 | PANEL_CONTINUE |

Rejeu : script de lecture seule hors dépôt ; policy, coverage et perDimension complets dans le JSON d'extraction (non versionné).
