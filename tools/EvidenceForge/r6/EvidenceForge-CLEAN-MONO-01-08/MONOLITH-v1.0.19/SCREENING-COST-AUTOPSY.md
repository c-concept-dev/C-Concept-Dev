# AUTOPSIE — COÛT DU SCREENING (run `efm-20260917-5ad77c88`, lecture seule, 0 USD)

## 1. Ce qui a été payé avant le panel (ledger réel, USD)
| Poste | Appels | Entrée (tokens) | Sortie (tokens) | USD | Part |
|---|---|---|---|---|---|
| screening (passe 1) | 23 | 64 729 | 21 622 | 0,519 | 39 % |
| screening — reprise informée (passe 2) | 8 | 32 107 | 9 252 | 0,235 | 18 % |
| revue de portefeuille (passe 1) | 7 | 34 738 | 16 633 | 0,354 | 27 % |
| revue de portefeuille — reprise informée | 4 | 29 242 | 9 193 | 0,226 | 17 % |
| **Total RETRIEVAL (LLM)** | **42** | 160 816 | 56 700 | **1,333** | 100 % |
Modèle : `claude-sonnet-4-6` (3 USD/M entrée, 15 USD/M sortie) ; **aucun cache** de prompt (cache_read = 0) ; **aucune réutilisation** (mission nouvelle).
Sortie = 0,85 USD (64 %), entrée = 0,48 USD (36 %).

## 2. Pourquoi 42 appels
- 180 sources, screening par **lots de 8** (23 lots : 22 × 8 + 1 × 4 ; dernier appel 1 381 tokens d'entrée = en-tête seul ≈ 1 200 tokens :
  mission + 8 angles décrits + règles). En-tête répété 23 fois = ≈ 27 600 tokens d'entrée (43 % de l'entrée du screening).
- Par source : ≈ 215 tokens d'entrée (titre, résumé, métadonnées), ≈ 120 tokens de sortie (décision + justification + extraits de preuve).
- Revue de portefeuille : **95 sources proposées exclues**, réévaluées par lots de 12 (7 lots) pour distinguer domaine / méthode ; ≈ 2 400 tokens
  de sortie par lot (≈ 200 par source) — artefact `notADecision`, 44 % du coût LLM de l'étape.

## 3. Pourquoi 12 reprises (35 % des appels, 0,461 USD = 35 % du coût)
Validateur de preuve **littérale** : chaque `evidence` doit être une sous-chaîne exacte du titre/résumé réel. 24 items refusés sur 12 lots :
| Cause | Items | Part |
|---|---|---|
| Typographie / casse / accents / ponctuation / espaces (l'extrait est bien dans le texte réel sous forme canonique) | **15** | 63 % |
| Nom de revue cité comme preuve (`lieu` affiché dans le prompt mais non accepté : « Circulation », « European Heart Journal », …) | **6** | 25 % |
| Paraphrase réelle (extrait absent) | 2 | 8 % |
| Valeur d'énumération hors contrat (`moyenne` au lieu de inclus/exclu) | 1 | 4 % |
Une reprise **renvoie le lot entier** (8 ou 12 sources, prompt + 1 100 tokens) pour 1 à 3 items fautifs : 108 décisions re-jugées pour **2 changements**
(1 correction de l'énumération `moyenne → inclus`, 1 bascule `inclus → exclu`). Les reprises ne changent donc pratiquement jamais la décision
(1,9 %) ; elles ne corrigent que la forme de la preuve.

## 4. Ce qui est structurellement évitable (estimations, non mesurées en réel)
| Levier | Mécanisme | Économie estimée / run | Risque |
|---|---|---|---|
| L1 — acceptation canonique de la preuve | comparaison après canonisation (NFD, casse, ponctuation, espaces), même classe que MONOLITH-WORKREF-NORMALIZATION-v1 ; l'original reste journalisé | 15/23 refus disparaissent ⇒ 5 reprises sur 12 évitées entièrement, ≈ **0,18 USD** | nul sur la décision (la preuve reste dans le texte réel) |
| L2 — `lieu` accepté comme champ de preuve (ou interdit explicitement dans le prompt) | le modèle cite ce qu'on lui montre | 6/23 refus ⇒ avec L1, 10–11 reprises sur 12 évitées, ≈ **0,40 USD** cumulé | nul |
| L3 — reprise **ciblée** (ne renvoyer que les items refusés) | prompt de reprise réduit à 1–3 sources | reprises résiduelles ≈ −70 % | nul (mêmes règles) |
| L4 — sortie plus brève (justification bornée, extraits ≤ 2) | −30 à −40 % de tokens de sortie | ≈ **0,25 USD** (screening + portefeuille) | lisibilité de la justification à vérifier |
| L5 — cache de l'en-tête (mission + angles) ou lots de 15–20 | entrée −20 % | ≈ **0,07 USD** | nul |
| L6 — périmètre de la revue de portefeuille | limiter aux exclusions « proches » ou aux sources sans proposition ; ou sortie brève | 0,2–0,4 USD | c'est une décision produit (signal Porte 2), pas technique |
**Total réaliste L1–L5 : ≈ 0,7 USD sur 1,33 (−55 %)** ; avec L6 jusqu'à ≈ 1,0 USD. Sur 5ad77c88, 0,7 USD = **+16 évaluations professionnelles (+60 %)**
à budget global inchangé. Aucun de ces leviers ne touche un lot gelé (le screening et la revue sont des modules du monolithe).

## 5. Batching
Possible côté entrée (en-tête partagé) ; l'essentiel du coût est la **sortie par source**, indépendante de la taille du lot. Des lots plus grands
augmentent le risque de réponse invalide entière (une reprise = tout le lot) : à coupler obligatoirement avec L3.

## 6. Ce qui n'est pas dans ce périmètre
Rien n'est codé ici. Ordre suggéré si le chantier est retenu : L1 + L2 + L3 (déterministes, journalisés, testables par rejeu des 12 reprises
réelles — les 24 items refusés constituent la fixture adversariale), puis L4/L5, puis L6 (décision produit).
