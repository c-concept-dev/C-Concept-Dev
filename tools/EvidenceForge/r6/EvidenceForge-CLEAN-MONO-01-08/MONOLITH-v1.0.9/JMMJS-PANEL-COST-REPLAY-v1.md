# JMMJS PANEL COST REPLAY v1 — run `efm-20260918-90544bfc` (replay local, aucun appel réel)

**Politique rejouée :** SUFFICIENCY_FIRST (v1.0.7) · cibles de revue : MISSION_DOSSIER · budget : LIMITED 15 USD · ESTIMATE — NOT GUARANTEE

| Grandeur | AVANT (mesuré, v1.0.5) | APRÈS (rejoué / projeté, v1.0.7) |
|---|---|---|
| candidats découverts / identifiés | 689 / 682 | inchangé |
| retenus (plafond 150) | 150 | 150 retenus = garde ; panel initial **8**, lots de 4 |
| évalués (oracle payant) | 96 | **96** (36 lots clos ; 54 non évalués par suffisance, 0 différés budget, 0 non observables) |
| approuvés | 23 | 23 |
| état scientifique du panel | PANEL_EXHAUSTED_WITH_GAPS | PANEL_EXHAUSTED_WITH_GAPS (POOL_EXHAUSTED) |
| jumeaux | 16 | 16 |
| cibles de revue | 30 (1 par document) | **1** (MISSION_DOSSIER, 126063 caractères) |
| **revues complètes** | **480** | **16** |
| items de grille (revues × angles) | 4800 | 160 |
| groupes d'agrégation (appels) | 300 | 10 |
| coût déjà engagé / projeté | 12.1 USD engagés ; ≈ 86.13 USD projetés | projection 18.67 USD central (18.67–18.67) |
| ECONOMIC_OUTLIER_WARNING / gate | non disponible | non / non requise · dépasserait le budget 15 USD |
| contribution marginale moyenne / lot | — | 0.7813 (angles + positions indépendantes nouvelles) |
| taux de quasi-doublons parmi les approuvés | — | 23 % |
| rendements décroissants | — | signal actif (5 lots sans gain ; angles à rendement nul : DISC-001, DISC-008) |

## Lots rejoués

| lot | type | évalués | +approuvés | +angles | +positions indép. | quasi-doublons | coût USD | panel après | gaps après |
|---|---|---|---|---|---|---|---|---|---|
| 0 | INITIAL | 8 | 1 | 1 | 1 | 0 | 0.6113 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 1 | EXPANSION | 4 | 1 | 1 | 1 | 0 | 0.3211 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 2 | EXPANSION | 4 | 0 | 0 | 0 | 0 | 0.2917 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 3 | EXPANSION | 4 | 0 | 0 | 0 | 0 | 0.3058 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 4 | EXPANSION | 4 | 1 | 1 | 1 | 0 | 0.2779 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 5 | EXPANSION | 4 | 1 | 0 | 1 | 0 | 0.2862 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 6 | EXPANSION | 4 | 2 | 1 | 2 | 0 | 0.3303 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 7 | EXPANSION | 4 | 0 | 0 | 0 | 0 | 0.3115 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 8 | EXPANSION | 4 | 0 | 0 | 0 | 0 | 0.2911 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 9 | EXPANSION | 4 | 1 | 0 | 1 | 0 | 0.3735 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-003, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008, DISC-009, DISC-010 |
| 10 | EXPANSION | 4 | 1 | 0 | 1 | 0 | 0.3144 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-005, DISC-006, DISC-007, DISC-008 |
| 11 | EXPANSION | 3 | 2 | 1 | 2 | 0 | 0.2319 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-005, DISC-007, DISC-008 |
| 12 | EXPANSION | 2 | 0 | 0 | 0 | 0 | 0.1518 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-005, DISC-007, DISC-008 |
| 13 | EXPANSION | 3 | 2 | 0 | 2 | 0 | 0.2545 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-005, DISC-007, DISC-008 |
| 14 | EXPANSION | 2 | 1 | 0 | 0 | 1 | 0.1584 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 15 | EXPANSION | 3 | 0 | 0 | 0 | 0 | 0.2421 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 16 | EXPANSION | 1 | 0 | 0 | 0 | 0 | 0.0618 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 17 | EXPANSION | 3 | 0 | 0 | 0 | 0 | 0.2215 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 18 | EXPANSION | 1 | 0 | 0 | 0 | 0 | 0.0745 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 19 | EXPANSION | 3 | 2 | 0 | 2 | 0 | 0.3092 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 20 | EXPANSION | 2 | 1 | 0 | 0 | 1 | 0.1542 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 21 | EXPANSION | 3 | 1 | 0 | 0 | 1 | 0.2495 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 22 | EXPANSION | 2 | 0 | 0 | 0 | 0 | 0.151 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 23 | EXPANSION | 1 | 0 | 0 | 0 | 0 | 0.0802 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-004, DISC-007, DISC-008 |
| 24 | EXPANSION | 3 | 1 | 0 | 1 | 0 | 0.2319 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 25 | EXPANSION | 2 | 1 | 0 | 1 | 0 | 0.1636 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 26 | EXPANSION | 0 | 0 | 0 | 0 | 0 | 0 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 27 | EXPANSION | 2 | 0 | 0 | 0 | 0 | 0.141 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 28 | EXPANSION | 2 | 0 | 0 | 0 | 0 | 0.1617 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 29 | EXPANSION | 0 | 0 | 0 | 0 | 0 | 0 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 30 | EXPANSION | 2 | 1 | 0 | 1 | 0 | 0.1523 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 31 | EXPANSION | 2 | 1 | 0 | 0 | 1 | 0.1683 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 32 | EXPANSION | 0 | 0 | 0 | 0 | 0 | 0 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 33 | EXPANSION | 2 | 1 | 0 | 0 | 1 | 0.1587 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 34 | EXPANSION | 2 | 0 | 0 | 0 | 0 | 0.1659 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |
| 35 | EXPANSION | 0 | 0 | 0 | 0 | 0 | 0 | PANEL_CONTINUE | DISC-001, DISC-002, DISC-007, DISC-008 |

## Coûts unitaires mesurés (ledger du run)

- oracle EF-02D2 : 91 appels, 7.0179 USD, 0.0771 USD/appel
- couverture EF-02D3 : 46 appels, 3.7729 USD, ≈ 0.164 USD par admis
- revue EF-03B : 3 revues (3 reprises), ≈ 0.1552 USD par revue (cible ≈ 5 000 car.) ; avec le dossier (31516 jetons d'entrée estimés) ≈ 0.2497 USD

## Limites

- les observations rejouees sont celles du run reel (aucune nouvelle evaluation) ; un candidat jamais evalue reste NOT_OBSERVED
- cout par revue avec dossier = cout mesure par revue + surcout d'entree du dossier au tarif mesure du run (jamais un tarif invente)
- le nombre de jumeaux apres = min(jumeaux reellement construits, approuves rejoues)
- l'agregation est projetee au cout unitaire d'une revue (proxy)
