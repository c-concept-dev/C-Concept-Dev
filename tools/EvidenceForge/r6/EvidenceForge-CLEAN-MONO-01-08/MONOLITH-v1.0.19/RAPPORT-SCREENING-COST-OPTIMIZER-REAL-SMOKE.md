# RAPPORT — SMOKE RÉEL SCREENING COST OPTIMIZER (MONOLITH-v1.0.5, 2026-09-17)

1. **runId** : `efm-20260917-edb27b86` (runs root `h1-v105-runs`), laissé **WAITING_USER à la Porte 2** (`RATIFY_SOURCES`) : arrêt volontaire,
   aucune ratification envoyée, aucun appel de l'étape professionnels, run reprenable, aucun budget consommé après la Porte 2.
2. **Commit testé** : `d770ebe1` (serveur redémarré sur ce commit avant le run ; `Git : d770ebe1 · GitHub main : à jour`).
3. **Mission** : identique à `5ad77c88` (activité physique régulière / bénéfices cardiovasculaires), même pipeline. Reformulation **réutilisée**
   (coût 0, prompt identique). Les kits gelés EF-01B/EF-01C1 ont produit **9 angles / 9 requêtes** (8 sur 5ad77c88) et le retrieval **87 sources**
   (180) : la structure amont n'est pas déterministe (résolveur LLM, OpenAlex) ; la comparaison se fait donc **par source** et par lot, pas en absolu.
4. **Budget** : plafond 2,50 USD, alerte 2,00 ; dépensé **0,4227 USD** au total (Porte 1 : 0,06 ; screening + revue : **0,3588**).

## 5. Screening baseline (5ad77c88, 180 sources, 177 jugées)
42 appels, 12 reprises de lot entier, 160 816 tokens d'entrée, 56 700 de sortie, **1,333 USD** = **7,41 mUSD / source jugée** ; reprises = 35 % du coût.

## 6. Screening réel optimisé (edb27b86, 87 sources, 87 jugées, 0 doublon)
| Poste | Appels | Entrée | Sortie | USD |
|---|---|---|---|---|
| screening passe 1 | 11 lots | 31 114 | 9 358 | 0,2337 |
| screening reprise **partielle** (passe 2) | 1 | 1 503 | 123 | 0,0064 |
| revue de portefeuille passe 1 | 3 lots (28 sources jugeables, 4 retirées : sans résumé) | 11 999 | 3 274 | 0,0851 |
| revue reprises partielles (passes 2 et 3) | 4 (5 items) | 7 603 | 721 | 0,0336 |
| **Total screening + revue** | **19** | **52 219** | **13 476** | **0,3588** = **4,12 mUSD / source** |

## 7–8. Appels et reprises (MESURÉ)
- Screening : 86/87 items valides en passe 1 ; 1 item invalide (`decision invalide : moyenne`, énumération hors contrat) ⇒ **1 reprise partielle
  contenant uniquement cet item** (`itemsSubmitted: 1`, `ignoredEntries: 0`), corrigé en passe 2. Items déjà valides renvoyés : **0**.
- Revue de portefeuille : 24/28 valides en passe 1 ; 4 items invalides (3 paraphrases/élisions + 1 fragment tronqué) ⇒ reprises partielles de
  2, 1 et 1 items ; 3 corrigés ; **1 erreur persistante** (`[…]` inséré par le modèle dans la citation : élision = preuve non littérale) refusée en
  passes 2 et 3 puis **déclarée** (`llmStatus: PARTIAL`, `failedBatches: 1 source`) — comportement attendu, 0 faux accept.
- Coût des reprises : **0,040 USD = 11 %** du coût de l'étape (baseline : 35 %). Coût moyen d'une reprise : 0,008 USD (baseline : 0,038).
- Changement de décision par reprise : 0 (les items re-jugés étaient invalides ; aucun item valide n'a été re-jugé).
- Reprises de lot entier : **0**.

## 9–10. Tokens et coût par source (MESURÉ, baseline → smoke)
| Mesure | Baseline | Smoke | Écart |
|---|---|---|---|
| entrée passe 1 / source (screening) | 366 | 358 | −2 % (en-tête équivalent) |
| **sortie passe 1 / source (screening)** | 122 | **108** | **−12 %** |
| **sortie passe 1 / source (portefeuille)** | 208 | **117** | **−44 %** |
| tokens de reprise (entrée / sortie), par reprise | 5 112 / 1 537 | 2 277 / 211 | −55 % / −86 % |
| **coût / source jugée (screening + revue)** | 7,41 mUSD | **4,12 mUSD** | **−44 %** |
| part des reprises dans le coût | 35 % | 11 % | — |
Extrapolé à 180 sources (ESTIMÉ, structure de 5ad77c88) : ≈ 0,74 USD contre 1,333.

## 11. Normalisations (MESURÉ)
3 evidences acceptées après normalisation de forme, chacune rendue sous son **fragment littéral réel** :
- screening, titre : apostrophes droites → typographiques (« Life's Essential 8 … Association's » → « Life’s … Association’s ») ;
- portefeuille, résumé (× 2) : casse initiale (« oxidative stress … » → « Oxidative stress … » ; « the mediating variable … » → « The mediating … »).
Champs de preuve utilisés (115 evidences du screening primaire) : titre 51, résumé 53, **lieu 11** (noms de revue acceptés littéralement, 0 reprise).

## 12. Faux accepts
**0 / 3** normalisations (chaque littéral rendu est une sous-chaîne exacte de son champ) ; **0 / 115** evidences du screening primaire hors de leur
champ. Les 5 items refusés sont tous des preuves non littérales (paraphrases, élisions `[…]`, troncature) ou une énumération hors contrat.

## 13. Décisions différentes
Comparaison par DOI/titre avec 5ad77c88 (screening primaire, hors équilibrage) : **39 sources communes, 36 décisions identiques, 3 différentes**
(`-21` inclus → exclu, `-81` exclu → inclus, `-90` inclus → exclu), toutes à confiance « moyenne » d'un côté : variance du modèle sur des cas
limites, **aucune** de ces sources n'a été re-jugée par une reprise ⇒ aucune différence attribuable à l'optimiseur.

## 14. Bornes de sortie (MESURÉ ≠ ESTIMÉ)
- Estimation du benchmark sur rejeu : −27 % (screening) / −33 % (portefeuille) par proxy caractères.
- **Mesuré** : −12 % (screening : justification moyenne 178 car. contre 235, max 324 — la borne de 160 n'est pas strictement respectée par le modèle,
  1,32 fragment/source contre 2,04) et **−44 %** (portefeuille : 100 car. d'intérêt méthodologique contre 210, 1,85 fragment).
- Le scénario « 0,724 USD » du benchmark **n'est pas validé tel quel** : la borne de sortie du screening est moins efficace qu'estimé ; celle du
  portefeuille l'est davantage. Le coût réel par source (−44 %) provient surtout des reprises partielles (−24 pts) et de la sortie du portefeuille.

## 15. Portefeuille
`notADecision: true`, énoncé inchangé, `llmStatus: PARTIAL` (1 source déclarée non évaluée), périmètre effectif `ALL_EXCLUDED_WITH_ABSTRACT`
(28 jugeables, 4 retirées faute de résumé, déclarées), 16 candidats « méthode hors domaine ». Équilibrage de portefeuille : 1 proposition ajustée.

## 16. Non-régression (après le run)
Monolith **177/177** (+ SCREEN-COST-19), navigateur 25/25, lanceur 14/14, secrets 0, anti-hardcoding 0 avec **8 004 jetons** de quatre runs réels
(smoke inclus), lots gelés MONO-01/09/10/11 vérifiés 0 divergence, runs historiques intacts (rejeu en lecture seule), ratification humaine
byte-identique (SCREEN-COST-14).
**Anomalie détectée par le smoke et corrigée** (`lib/portfolio-balancing.js`, module existant) : quand l'équilibrage remplace l'evidence d'une
proposition ajustée par celle de l'évaluation de portefeuille, les champs d'origine (`evidenceFields`) et la trace de normalisation ne suivaient pas
(1 proposition sur 87 avec des champs désalignés dans `screening-evidence.json` ; le screening primaire est correct, aucune preuve n'était fausse).
Correctif d'une ligne + test SCREEN-COST-19 ; l'artefact du smoke est conservé tel quel (preuve).

## 17. Conclusion
Critère principal : reprises = **uniquement les items invalides** ✔ ; aucun item valide re-jugé ✔ ; aucune paraphrase ni preuve absente acceptée ✔
(5 refus maintenus dont 1 persistant déclaré) ; ratification inchangée ✔ ; portefeuille `notADecision` ✔ ; coût réel **−44 % par source** ✔ ;
aucune régression structurelle ✔ (une anomalie de traçabilité dans un module voisin, corrigée et testée). Bornes de sortie : compatibles
(aucun refus induit), gain **mesuré** −12 % / −44 %, inférieur à l'estimation sur le screening.

**VERDICT : GELABLE** (candidat) — sous réserve du correctif d'alignement (`portfolio-balancing.js`) livré avec ce rapport, non encore exercé en réel.
Jamais GELÉ.
