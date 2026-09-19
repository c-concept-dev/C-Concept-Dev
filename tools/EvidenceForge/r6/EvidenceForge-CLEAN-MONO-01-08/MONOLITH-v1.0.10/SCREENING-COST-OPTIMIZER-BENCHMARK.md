# BENCHMARK SUR REJEU — SCREENING COST OPTIMIZER (2026-09-17, 0 USD, aucun appel fournisseur)

Outil : `tools/screening-replay.js <runDir>` (lecture seule ; rien n'est écrit dans le dossier du run). Les réponses de **passe 1** conservées
dans `llm-cache` sont re-validées par le validateur antérieur (littéral, titre + résumé) et par le validateur courant
(SCREENING-EVIDENCE-NORMALIZATION-v1 sur titre / résumé / lieu, reprise ciblée) ; le coût est recomposé à partir du ledger réel.
- **BASELINE** = ledger réel du run (passe 1 + reprises réelles).
- **NORMALIZATION ONLY** = passe 1 + seules les reprises réelles dont au moins un item reste refusé par le validateur courant (coût réel de ces reprises).
- **NORMALIZATION + TARGETED RETRY** = passe 1 + reprises résiduelles **ciblées** : prompt ciblé réellement construit (tokens d'entrée estimés au ratio
  caractères/token mesuré sur les appels réels du run, 3,97 sur 5ad77c88), sortie proportionnelle aux items re-jugés.
- **FULL OPTIMIZER** = précédent + bornes de sortie (justification ≤ 160 car., ≤ 2 fragments ≤ 80 car.) **ESTIMATE — NOT GUARANTEE** (proxy
  caractères sur les réponses réelles : −27 % screening, −33 % portefeuille) ; à mesurer en réel.
Critère de sûreté : chaque evidence acceptée par normalisation est re-vérifiée comme sous-chaîne littérale du champ rendu (**faux accepts = 0**).

## 1. Run de référence `efm-20260917-5ad77c88` (8 angles, 180 sources)
| Scénario | USD | Appels | Reprises | Économie | Nature |
|---|---|---|---|---|---|
| BASELINE | **1,333** | 42 | 12 | — | mesuré (ledger) |
| NORMALIZATION ONLY | **1,025** | 33 | 3 | −0,31 (−23 %) | déterministe (coûts réels) |
| NORMALIZATION + TARGETED RETRY | **0,897** | 33 | 3 (ciblées) | −0,44 (−33 %) | déterministe + tokens des reprises estimés |
| FULL OPTIMIZER | **0,724** | 33 | 3 | −0,61 (−46 %) | + bornes de sortie (ESTIMATE) |

Détail : screening passe 1 0,519 · reprises réelles 0,235 → résiduelle 0,025 (1 lot : énumération `moyenne`) → ciblée ≈ 0,006 ;
portefeuille passe 1 0,354 · reprises réelles 0,226 → résiduelles 0,128 (2 lots : 2 paraphrases) → ciblées ≈ 0,018 ; bornes de sortie ≈ −0,173.
Tokens de reprise évités : **56 068 entrée, 17 883 sortie**. Normalisations acceptées : **15** (typographie) + **6** noms de revue acceptés
littéralement sur le champ `lieu` ; faux accepts **0** ; items encore refusés **3** = exactement l'énumération hors contrat et les 2 paraphrases.
Décisions : **1 différence** avec le run réel (`source-…-180` : la passe 1 disait `inclus`, la reprise réelle de lot entier avait re-jugé `exclu`
sans qu'aucune erreur ne porte sur cet item ; sous immutabilité des items valides, la décision de passe 1 est conservée). Les 107 autres
décisions sont identiques. Erreurs résiduelles : 3 items → 3 reprises ciblées (1 + 1 + 1 item) au lieu de 12 reprises de lot (96 items re-jugés).

## 2. Autres runs réels (mêmes règles, mêmes estimations)
| Run | BASELINE | NORMALIZATION ONLY | + TARGETED | FULL (est.) | Normalisations | Faux accepts | Encore refusés | Décisions différentes |
|---|---|---|---|---|---|---|---|---|
| `65c805ef` (7 lots de reprise) | 0,773 | 0,593 (2 reprises) | 0,509 | 0,411 | 8 | 0 | 2 (paraphrases) | 0 |
| `dc30dc7a` (9) | 0,871 | 0,496 (**0** reprise) | 0,496 | 0,404 | 11 | 0 | 0 | 0 |
| `cf6101c7` (v1.0.4, 5) | 0,482 | 0,420 (3) | 0,354 | 0,293 | 3 | 0 | 3 (paraphrases) | 0 |
| **Total 4 runs** | **3,459** | **2,534 (−27 %)** | **2,257 (−35 %)** | **1,831 (−47 %)** | 37 | **0** | 8 | 1 |

## 3. Lecture
- Le levier déterministe (normalisation + `lieu` + reprise ciblée) économise **−33 % sur 5ad77c88, −35 % sur les 4 runs**, sans aucun faux accept :
  toutes les erreurs de fond (paraphrases, énumération) restent refusées et repartent seules.
- L'objectif raisonnable (≤ 0,80 USD) n'est atteint que **avec** la borne de sortie estimée (0,72) ; sans elle, 0,90 USD. La borne de sortie est
  une hypothèse de comportement du modèle : **à mesurer sur un smoke réel** avant d'être comptée.
- Non implémenté (non simulable sans appel réel) : cache de prompt / lots plus grands (≈ 0,05–0,07 USD) ; périmètre restreint de la revue de
  portefeuille (décision produit : 0,2–0,4 USD selon le périmètre).
