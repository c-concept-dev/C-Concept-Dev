# EF-03B REAL RUN AUTOPSY v1 — run `efm-20260918-a64167c0` (lecture seule, 0 appel fournisseur)

Généré le 2026-09-19T12:53:50.475Z par `tools/ef03b-autopsy.js` (MONOLITH-v1.0.10). Tentative finale : 9 ; run COMPLETED (9 tentatives). Revues attendues 18 · VALID 10 · ERROR 8. Aucun prompt ni réponse reproduits ; références publiques des professionnels seulement.

## 1. Les 18 revues — passes de la tentative finale

| # | twinId | professionnel | passe | stratégie | prompt (car.) | in | out | stop | durée (s) | USD | valid | erreurs (codes × n) | dimensions | cible réparation | résultat | réutilisable sans appel |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | https://openalex.org/A5031631835 | https://openalex.org/A5031631835 | 1 | BASE_EF03B | 163562 | 48932 | 8192 | max_tokens | 145.1 | 0.2697 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 163403 | 48740 | 8140 | end_turn | 143.4 | 0.2683 | INVALID | TARGET_REF_NOT_LITERAL × 20 | DISC-01,DISC-02,DISC-03,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 3 | TARGETED_REPAIR | 150802 | 45525 | 1817 | end_turn | 31.1 | 0.1638 | INVALID | TARGET_REF_NOT_LITERAL × 1 | DISC-02 | DISC-01,DISC-02,DISC-03,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | **ERROR** (0.7018 USD) | NO_EVIDENCE_CHANGED (TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN) |
| 2 | https://openalex.org/A5015262154 | https://openalex.org/A5015262154 | 1 | BASE_EF03B | 164926 | 49225 | 8192 | max_tokens | 146.2 | 0.2706 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 164413 | 48833 | 8192 | max_tokens | 155.4 | 0.2694 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 3 | INFORMED_REPAIR_V02 | 163544 | 48833 | 8192 | max_tokens | 141.9 | 0.2694 | INVALID | JSON_INVALID × 1 | — | — | **ERROR** (0.8094 USD) | YES_HISTORICAL_VALID_REVALIDATED_OFFLINE |
| 3 | https://openalex.org/A5000192723 | https://openalex.org/A5000192723 | 1 | BASE_EF03B | 166129 | 49682 | 8192 | max_tokens | 151.9 | 0.2719 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 164628 | 48802 | 7645 | end_turn | 136.2 | 0.2611 | INVALID | TARGET_REF_NOT_LITERAL × 3 | DISC-02,DISC-08 | — |  |  |
|  |  |  | 3 | TARGETED_REPAIR | 135623 | 40793 | 606 | end_turn | 11.7 | 0.1315 | VALID | — | — | DISC-02,DISC-08 | **VALID** (passe 3, 0.6645 USD) | YES_FINAL_VALID |
| 4 | https://openalex.org/A5008124698 | https://openalex.org/A5008124698 | 1 | BASE_EF03B | 163357 | 48765 | 6238 | end_turn | 109.9 | 0.2399 | INVALID | TARGET_REF_NOT_LITERAL × 6 | DISC-02,DISC-05,DISC-07,DISC-09 | — |  |  |
|  |  |  | 2 | TARGETED_REPAIR | 138604 | 41852 | 880 | end_turn | 18.6 | 0.1388 | VALID | — | — | DISC-02,DISC-05,DISC-07,DISC-09 | **VALID** (passe 2, 0.3787 USD) | YES_FINAL_VALID |
| 5 | https://openalex.org/A5009943886 | https://openalex.org/A5009943886 | 1 | BASE_EF03B | 162107 | 48607 | 7150 | end_turn | 125.3 | 0.2531 | VALID | — | — | — | **VALID** (passe 1, 0.2531 USD) | YES_FINAL_VALID |
| 6 | https://openalex.org/A5059446032 | https://openalex.org/A5059446032 | 1 | BASE_EF03B | 163668 | 48723 | 7459 | end_turn | 134.3 | 0.2581 | INVALID | TARGET_REF_NOT_LITERAL × 18 | DISC-01,DISC-02,DISC-03,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 2 | TARGETED_REPAIR | 147282 | 44518 | 1412 | end_turn | 26.1 | 0.1547 | INVALID | TARGET_REF_NOT_LITERAL × 1 | DISC-06 | DISC-01,DISC-02,DISC-03,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 |  |  |
|  |  |  | 3 | TARGETED_REPAIR_STRATEGY_CHANGE | 134655 | 40519 | 494 | end_turn | 12.8 | 0.129 | VALID | — | — | DISC-06 | **VALID** (passe 3, 0.5418 USD) | YES_FINAL_VALID |
| 7 | https://openalex.org/A5002572744 | https://openalex.org/A5002572744 | 1 | BASE_EF03B | 166710 | 49536 | 8126 | end_turn | 151.2 | 0.2705 | INVALID | TARGET_REF_NOT_LITERAL × 17 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-07,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 2 | TARGETED_REPAIR | 147969 | 44798 | 2381 | end_turn | 36.9 | 0.1701 | INVALID | TARGET_REF_NOT_LITERAL × 17 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-07,DISC-08,DISC-09,DISC-10 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-07,DISC-08,DISC-09,DISC-10 |  |  |
|  |  |  | 3 | TARGETED_REPAIR_STRATEGY_CHANGE | 148236 | 44876 | 1402 | end_turn | 25.9 | 0.1557 | VALID | — | — | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-07,DISC-08,DISC-09,DISC-10 | **VALID** (passe 3, 0.5963 USD) | YES_FINAL_VALID |
| 8 | https://openalex.org/A5105521386 | https://openalex.org/A5105521386 | 1 | BASE_EF03B | 163172 | 48661 | 8192 | max_tokens | 156 | 0.2689 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 163853 | 48647 | 8036 | end_turn | 139.8 | 0.2665 | INVALID | TARGET_REF_NOT_LITERAL × 20 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 3 | TARGETED_REPAIR | 152654 | 46123 | 1716 | end_turn | 33.8 | 0.1641 | VALID | — | — | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | **VALID** (passe 3, 0.6995 USD) | YES_FINAL_VALID |
| 9 | https://openalex.org/A5061537459 | https://openalex.org/A5061537459 | 1 | BASE_EF03B | 161387 | 48626 | 6530 | end_turn | 118.9 | 0.2438 | INVALID | TARGET_REF_NOT_LITERAL × 11 | DISC-06,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 2 | TARGETED_REPAIR | 142999 | 43099 | 1178 | end_turn | 22.5 | 0.147 | VALID | — | — | DISC-06,DISC-08,DISC-09,DISC-10 | **VALID** (passe 2, 0.3908 USD) | YES_FINAL_VALID |
| 10 | https://openalex.org/A5008056222 | https://openalex.org/A5008056222 | 1 | BASE_EF03B | 168671 | 50071 | 8192 | max_tokens | 151.7 | 0.2731 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 165215 | 48913 | 7940 | end_turn | 145.9 | 0.2658 | INVALID | TARGET_REF_NOT_LITERAL × 18 | DISC-01,DISC-02,DISC-03,DISC-05,DISC-07,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 3 | TARGETED_REPAIR | 147902 | 44651 | 1274 | end_turn | 23.1 | 0.1531 | VALID | — | — | DISC-01,DISC-02,DISC-03,DISC-05,DISC-07,DISC-08,DISC-09,DISC-10 | **VALID** (passe 3, 0.692 USD) | YES_FINAL_VALID |
| 11 | https://openalex.org/A5034919242 | https://openalex.org/A5034919242 | 1 | BASE_EF03B | 164689 | 48950 | 8192 | max_tokens | 150.6 | 0.2697 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 164259 | 48758 | 7784 | end_turn | 138.2 | 0.263 | INVALID | TARGET_REF_NOT_LITERAL × 14 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 3 | TARGETED_REPAIR | 148237 | 44826 | 1054 | end_turn | 23.5 | 0.1503 | INVALID | TARGET_REF_NOT_LITERAL × 14 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | **ERROR** (0.683 USD) | NO_NEVER_VALID |
| 12 | https://openalex.org/A5050677675 | https://openalex.org/A5050677675 | 1 | BASE_EF03B | 161668 | 48265 | 8119 | end_turn | 133.3 | 0.2666 | INVALID | TARGET_REF_NOT_LITERAL × 17 | DISC-03,DISC-04,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 2 | TARGETED_REPAIR | 148758 | 45008 | 1588 | end_turn | 29 | 0.1588 | VALID | — | — | DISC-03,DISC-04,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | **VALID** (passe 2, 0.4254 USD) | YES_FINAL_VALID |
| 13 | https://openalex.org/A5057022658 | https://openalex.org/A5057022658 | 1 | BASE_EF03B | 161266 | 48160 | 7296 | end_turn | 130.3 | 0.2539 | INVALID | TARGET_REF_NOT_LITERAL × 15 | DISC-01,DISC-02,DISC-03,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 | — |  |  |
|  |  |  | 2 | TARGETED_REPAIR | 146915 | 44399 | 707 | end_turn | 17 | 0.1438 | INVALID | TARGET_REF_NOT_LITERAL × 1 | DISC-03 | DISC-01,DISC-02,DISC-03,DISC-05,DISC-06,DISC-07,DISC-08,DISC-09,DISC-10 |  |  |
|  |  |  | 3 | TARGETED_REPAIR_STRATEGY_CHANGE | 135048 | 40628 | 400 | end_turn | 10.1 | 0.1279 | VALID | — | — | DISC-03 | **VALID** (passe 3, 0.5256 USD) | YES_FINAL_VALID |
| 14 | https://openalex.org/A5084194176 | https://openalex.org/A5084194176 | 1 | BASE_EF03B | 166257 | 49419 | 8192 | max_tokens | 144.2 | 0.2711 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 164260 | 48640 | 8192 | max_tokens | 142.1 | 0.2688 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 3 | INFORMED_REPAIR_V02 | 164240 | 48639 | 8192 | max_tokens | 141.5 | 0.2688 | INVALID | JSON_INVALID × 1 | — | — | **ERROR** (0.8087 USD) | NO_EVIDENCE_CHANGED (TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN) |
| 15 | https://openalex.org/A5067779338 | https://openalex.org/A5067779338 | 1 | BASE_EF03B | 174695 | 51410 | 8192 | max_tokens | 154.2 | 0.2771 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 168954 | 49606 | 8192 | max_tokens | 153.6 | 0.2717 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 3 | INFORMED_REPAIR_V02 | 168932 | 49606 | 8192 | max_tokens | 155.5 | 0.2717 | INVALID | JSON_INVALID × 1 | — | — | **ERROR** (0.8205 USD) | NO_NEVER_VALID |
| 16 | https://openalex.org/A5076883985 | https://openalex.org/A5076883985 | 1 | BASE_EF03B | 161097 | 48236 | 8192 | max_tokens | 139 | 0.2676 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 162681 | 48599 | 8192 | max_tokens | 145.2 | 0.2687 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 3 | INFORMED_REPAIR_V02 | 162739 | 48599 | 8192 | max_tokens | 139.3 | 0.2687 | INVALID | JSON_INVALID × 1 | — | — | **ERROR** (0.805 USD) | YES_HISTORICAL_VALID_REVALIDATED_OFFLINE |
| 17 | https://openalex.org/A5081732198 | https://openalex.org/A5081732198 | 1 | BASE_EF03B | 166080 | 49517 | 8192 | max_tokens | 144.9 | 0.2714 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 164125 | 48817 | 6964 | end_turn | 121.6 | 0.2509 | INVALID | TARGET_REF_NOT_LITERAL × 12 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-07,DISC-09 | — |  |  |
|  |  |  | 3 | TARGETED_REPAIR | 144054 | 43517 | 1133 | end_turn | 24.6 | 0.1475 | INVALID | TARGET_REF_NOT_LITERAL × 3 | DISC-04,DISC-09 | DISC-01,DISC-02,DISC-03,DISC-04,DISC-05,DISC-07,DISC-09 | **ERROR** (0.6698 USD) | NO_NEVER_VALID |
| 18 | https://openalex.org/A5072236225 | https://openalex.org/A5072236225 | 1 | BASE_EF03B | 165223 | 49140 | 8192 | max_tokens | 151.6 | 0.2703 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 2 | INFORMED_REPAIR_V02 | 164579 | 48736 | 8192 | max_tokens | 150 | 0.2691 | INVALID | JSON_INVALID × 1 | — | — |  |  |
|  |  |  | 3 | INFORMED_REPAIR_V02 | 164544 | 48735 | 8192 | max_tokens | 152.8 | 0.2691 | INVALID | JSON_INVALID × 1 | — | — | **ERROR** (0.8085 USD) | NO_NEVER_VALID |

## 2. Tentatives précédentes (mêmes jumeaux) — ce qui avait déjà été validé

| twinId | tentatives précédentes (tentative/passe/out/stop/statut magasin) | USD précédents | candidat VALID historique | re-validation hors ligne (validateur gelé + parseur EF-03B gelé) | même prompt de passe 1 ? |
|---|---|---|---|---|---|
| https://openalex.org/A5031631835 | t7/p1/7362/end_turn/INVALID ; t7/p2/1176/end_turn/VALID | 0.4035 | t7 p2 | REFUSÉ : TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN | NON (preuves du jumeau changées) |
| https://openalex.org/A5015262154 | t7/p1/7581/end_turn/INVALID ; t7/p2/931/end_turn/VALID | 0.4069 | t7 p2 | VALIDE aujourd'hui | oui |
| https://openalex.org/A5000192723 | t7/p1/8192/max_tokens/INVALID ; t7/p2/8192/max_tokens/INVALID ; t7/p3/8192/max_tokens/INVALID | 0.8105 | — | — | oui |
| https://openalex.org/A5008124698 | t7/p1/6519/end_turn/INVALID ; t7/p2/939/end_turn/VALID | 0.3865 | t7 p2 | VALIDE aujourd'hui | oui |
| https://openalex.org/A5009943886 | t7/p1/7150/end_turn/VALID | 0.2531 | t7 p1 | VALIDE aujourd'hui | oui |
| https://openalex.org/A5059446032 | t7/p1/6983/end_turn/INVALID ; t7/p2/1569/end_turn/VALID | 0.4057 | t7 p2 | VALIDE aujourd'hui | oui |
| https://openalex.org/A5002572744 | t7/p1/8192/max_tokens/INVALID ; t7/p2/8192/max_tokens/INVALID ; t7/p3/8192/max_tokens/INVALID | 0.8099 | — | — | oui |
| https://openalex.org/A5105521386 | t7/p1/7668/end_turn/INVALID ; t7/p2/1082/end_turn/INVALID ; t7/p3/612/end_turn/VALID | 0.5451 | t7 p3 | VALIDE aujourd'hui | oui |
| https://openalex.org/A5061537459 | t7/p1/7746/end_turn/INVALID ; t7/p2/765/end_turn/VALID | 0.3976 | t7 p2 | REFUSÉ : TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN | NON (preuves du jumeau changées) |
| https://openalex.org/A5008056222 | t7/p1/8192/max_tokens/INVALID ; t7/p2/8192/max_tokens/INVALID | 0.5427 | — | — | oui |
| https://openalex.org/A5034919242 | t7/p1/8192/max_tokens/INVALID ; t7/p2/8192/max_tokens/INVALID ; t7/p3/8192/max_tokens/INVALID | 0.808 | — | — | oui |
| https://openalex.org/A5050677675 | t7/p1/7304/end_turn/INVALID ; t7/p2/783/end_turn/VALID | 0.3996 | t7 p2 | VALIDE aujourd'hui | oui |
| https://openalex.org/A5057022658 | t7/p1/7950/end_turn/INVALID ; t7/p2/1186/end_turn/VALID | 0.4172 | t7 p2 | VALIDE aujourd'hui | oui |
| https://openalex.org/A5084194176 | t7/p1/7892/end_turn/VALID | 0.2666 | t7 p1 | REFUSÉ : TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN,TWIN_REF_UNKNOWN | NON (preuves du jumeau changées) |
| https://openalex.org/A5067779338 | t7/p1/8192/max_tokens/INVALID ; t7/p2/8192/max_tokens/INVALID ; t7/p3/8192/max_tokens/INVALID | 0.8205 | — | — | oui |
| https://openalex.org/A5076883985 | t7/p1/6352/end_turn/INVALID ; t7/p2/783/end_turn/VALID | 0.3787 | t7 p2 | VALIDE aujourd'hui | oui |
| https://openalex.org/A5081732198 | t7/p1/8192/max_tokens/INVALID ; t7/p2/8192/max_tokens/INVALID ; t7/p3/8192/max_tokens/INVALID | 0.8101 | — | — | oui |
| https://openalex.org/A5072236225 | t7/p1/8192/max_tokens/INVALID ; t7/p2/8192/max_tokens/INVALID ; t7/p3/8192/max_tokens/INVALID | 0.8085 | — | — | oui |

## 3. Volume des sorties (mesuré)

Sorties TRONQUÉES (stop_reason=max_tokens) : 21 — findings commencés / complets : 10/9, 9/8, 9/8, 10/9, 10/9, 10/9, 10/9, 10/9, 10/9, 10/9, 10/9, 9/8, 10/9, 10/9, 10/9, 10/9, 10/9, 10/9, 9/8, 10/9, 10/9 ; caractères 28132–29846.

| réponse complète (twin/passe) | valid | car. | jetons sortie | finding (car. moy.) | rationale | refs (car. moy. / nb moy. / max) | limitations |
|---|---|---|---|---|---|---|---|
| A5031631835 p2 | INVALID | 28168 | 8140 | 504 | 845 | 463 / 3.4 / 454 | 426 |
| A5000192723 p2 | INVALID | 27610 | 7645 | 661 | 656 | 264 / 3.8 / 160 | 475 |
| A5008124698 p1 | INVALID | 21852 | 6238 | 297 | 729 | 207 / 2.5 / 191 | 406 |
| A5009943886 p1 | VALID | 24550 | 7150 | 650 | 569 | 303 / 1.4 / 620 | 412 |
| A5059446032 p1 | INVALID | 26484 | 7459 | 715 | 590 | 345 / 3.3 / 252 | 434 |
| A5002572744 p1 | INVALID | 29441 | 8126 | 594 | 690 | 378 / 4.3 / 221 | 564 |
| A5105521386 p2 | INVALID | 28572 | 8036 | 768 | 612 | 452 / 3.3 / 490 | 464 |
| A5061537459 p1 | INVALID | 26261 | 6530 | 514 | 862 | 252 / 2.5 / 302 | 522 |
| A5008056222 p2 | INVALID | 28553 | 7940 | 593 | 644 | 362 / 2.8 / 246 | 488 |
| A5034919242 p2 | INVALID | 27681 | 7784 | 862 | 497 | 396 / 3.3 / 454 | 441 |
| A5050677675 p1 | INVALID | 28707 | 8119 | 844 | 558 | 403 / 2.8 / 454 | 533 |
| A5057022658 p1 | INVALID | 25613 | 7296 | 616 | 630 | 352 / 3 / 302 | 464 |
| A5081732198 p2 | INVALID | 24743 | 6964 | 551 | 500 | 262 / 2.4 / 291 | 498 |

## 4. Citations rejetées (TARGET_REF_NOT_LITERAL) — sous-classes déterministes

| classe | n | exemple (préfixe de citation → span exact trouvé) |
|---|---|---|
| JOINED_LIST_ITEMS | 87 | `La fiche permet-elle suffisamment de documenter : réaction pendant l'activité ; réaction juste après…` → `La fiche permet-elle suffisamment de documenter :

- réaction pendant l'activité ;
- réaction juste …` |
| PARTIAL_LITERAL | 41 | `La structure doit-elle distinguer explicitement : habituel ≠ prévu ≠ réalisé ≠ réaction après réalis…` → aucun span unique |
| MARKDOWN_MARKERS_STRIPPED | 37 | `Attention : ne pas transformer ces distinctions en dimensions définitives à ce stade.…` → `Attention :** ne pas transformer ces distinctions en dimensions définitives à ce stade.…` |
| WHITESPACE_LINEBREAK_ONLY | 6 | `S01 / S02 = cas d'observation ≠ profils produit ≠ règles métier ≠ catégories ≠ seuils ≠ exceptions c…` → `S01 / S02
= cas d'observation
≠ profils produit
≠ règles métier
≠ catégories
≠ seuils
≠ exceptions c…` |
| PARAPHRASE_OR_ABSENT | 2 | `Distinguer systématiquement : BESOINS DE REPRÉSENTATION de FUTURES RÈGLES DE DÉCISION.…` → aucun span unique |
