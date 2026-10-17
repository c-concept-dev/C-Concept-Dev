# EF-03B COST ANALYSIS v1 — run `efm-20260918-a64167c0`

| Mesure | Valeur |
|---|---|
| revues attendues / VALID / ERROR | 18 / 10 / 8 |
| coût EF-03B tentative finale (9) | 11.2744 USD |
| coût EF-03B tentatives précédentes (mêmes jumeaux) | 9.6707 USD |
| coût moyen d'une revue finalement VALID | 0.5168 USD |
| coût moyen d'une revue finalement ERROR | 0.7633 USD |
| coût moyen par passe | 0.2301 USD |
| sorties max_tokens | 21 passes, 5.6768 USD, durée moy. 148.2238 s |
| régénérations complètes (INFORMED_REPAIR_V02) | 16 passes, 4.271 USD, VALID directement : 0, tronquées à nouveau : 10 |
| réparations ciblées (TARGETED_*) | 15 passes, 2.2361 USD, VALID : 9, coût moyen 0.1491 USD, sortie moy. 1202.8 jetons |
| revues déjà VALID à une tentative précédente et recalculées à la tentative finale | 11 revues, 6.3398 USD |

| stratégie | passes | USD | VALID | max_tokens |
|---|---|---|---|---|
| BASE_EF03B | 18 | 4.7673 | 1 | 11 |
| INFORMED_REPAIR_V02 | 16 | 4.271 | 0 | 10 |
| TARGETED_REPAIR | 12 | 1.8235 | 6 | 0 |
| TARGETED_REPAIR_STRATEGY_CHANGE | 3 | 0.4126 | 3 | 0 |
