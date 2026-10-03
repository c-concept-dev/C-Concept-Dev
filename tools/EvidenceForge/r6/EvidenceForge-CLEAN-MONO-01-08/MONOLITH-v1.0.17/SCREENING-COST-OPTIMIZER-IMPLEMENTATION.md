# IMPLÉMENTATION — SCREENING COST OPTIMIZER (MONOLITH-v1.0.5, 2026-09-17)

1. **Cause racine** : validateur de preuve strictement littéral (titre + résumé) face à des citations typographiquement altérées (casse, accents,
   apostrophes/guillemets, ponctuation) et à des noms de revue cités alors que `lieu` est fourni ; toute erreur d'item faisait re-juger le lot entier.
2. **Appels baseline** (5ad77c88) : 42 (23 + 7 passes 1, 8 + 4 reprises), 160 816 tokens d'entrée, 56 700 de sortie, 1,333 USD.
3. **Reprises baseline** : 12 (35 % du coût, 0,461 USD), 108 décisions re-jugées pour 2 changements.
4. **Classification des erreurs** (24 items) : 15 typographie (63 %), 6 nom de revue (25 %), 2 paraphrases (8 %), 1 énumération (4 %).
5. **Architecture** :
   - `lib/screening-normalization.js` (nouveau, pur, sans dépendance) : règle **SCREENING-EVIDENCE-NORMALIZATION-v1** — correspondance littérale
     dans un champ autorisé, sinon correspondance **canonique sur mots entiers** (NFD, accents, casse, apostrophes/guillemets/tirets typographiques,
     ponctuation, espaces) avec **récupération du fragment littéral réel** (projection des positions) ; trace {original, canonique, littéral,
     champ, hashes, règle}. Aucun synonyme, aucune paraphrase, aucune correspondance floue, aucun LLM (SCREEN-COST-05/06).
   - `lib/batch-judge.js` (nouveau) : boucle de jugement par lots partagée, stratégie **RETRY_ONLY_INVALID_ITEMS** (défaut) ou
     `RETRY_FULL_BATCH` ; items valides **immuables** (hash) ; recomposition dans l'ordre ; lignée par item (originalBatchId, acceptedAtPass,
     decisionHash, history[pass, previousDecisionHash, validationErrors]) ; passes journalisées ; entrées renvoyées pour des items déjà acceptés
     ignorées (jamais une erreur de lot) ; erreurs de niveau lot (JSON invalide) ⇒ le même ensemble repart entier.
   - `lib/screening-evidence.js` : validateur rendant `perItem` / `batchErrors` / `entries` / `normalizations` / `ignored` ; evidence rendue sous sa
     forme littérale réelle + `evidenceFields` + `evidenceNormalization` ; prompt aligné (champs citables : titre, résumé, lieu ; année et requête
     informatives) ; bornes de sortie demandées (jamais un motif de refus) ; prompt de **reprise partielle** ; `batches`, `retryStats`, `evidenceRule`
     dans l'artefact ; `detectDuplicates`, `DECISIONS`, schéma inchangés.
   - `lib/corpus-portfolio-review.js` : même validateur/boucle ; pré-filtre déterministe des exclues (doublons DOI / providerId / titre) ;
     `llmScope` configurable (défaut `ALL_EXCLUDED_WITH_ABSTRACT` = périmètre inchangé ; `UNDERCOVERED_ANGLES_ONLY`, `NON_HIGH_CONFIDENCE_ONLY`,
     `NONE`), périmètre retiré déclaré (`llmScope.removed`) ; `notADecision`, énoncé, signaux déterministes inchangés.
   - `config/monolith.config.json` : `screening.evidenceFields / retryStrategy / outputBounds`, `portfolio.llmScope / evidenceFields / retryStrategy /
     outputBounds` ; `batchSize` et `llmBatchSize` **inchangés**.
   - `lib/pipeline.js` : transmission de la configuration (une ligne).
   - `tools/screening-replay.js` (nouveau) : benchmark déterministe sur rejeu (§ BENCHMARK).
   - **Décision `lieu` : option A** (champ de preuve vérifiable, littéral ou canonique, champ enregistré) — justification dans l'AUDIT §3 ; aucun
     contrat gelé n'en dispose ; le contrat du module le déclarait déjà parmi les métadonnées de décision.
6. **Fichiers** : nouveaux `lib/screening-normalization.js`, `lib/batch-judge.js`, `tools/screening-replay.js`, `test/test-screening-cost.js`,
   les trois documents SCREENING-COST-OPTIMIZER-* ; modifiés `lib/screening-evidence.js`, `lib/corpus-portfolio-review.js`, `lib/pipeline.js`,
   `config/monolith.config.json`, `test/test-monolith.js` (hook), `test/test-v105.js` (NONREG-03 requalifié : `detectDuplicates` / `DECISIONS` /
   schéma byte-identiques), `NON-REGRESSION.md`, `README.md`. Lots gelés, kits, MONO-04, panel professionnel : **aucun fichier touché**.
7. **Tests** : `test/test-screening-cost.js` SCREEN-COST-01…18 (apostrophe, casse, accents NFD/NFC, ponctuation/espaces/guillemets, paraphrase
   refusée, preuve inventée refusée, `lieu`, 1 item invalide sur 8 ⇒ seule cette source repart, 7 items immuables (hashes), recomposition et
   lignée, énumération ⇒ reprise ciblée puis échec déclaré, aucun appel dû à la normalisation + stratégie lot entier, portefeuille `notADecision`
   et périmètres, ratification byte-identique, lots gelés, anti-hardcoding, rejeu déterministe, coût avant/après sur le run réel). Suite monolith
   **176/176** (+18) ; navigateur 25/25 ; lanceur 14/14 ; secrets 0 ; anti-hardcoding 0 (7 820 jetons réels) ; lots gelés 0 divergence ; runs
   historiques intacts (rejeu en lecture seule).
8. **Rejeu avant/après** : voir `SCREENING-COST-OPTIMIZER-BENCHMARK.md` (4 runs, faux accepts 0/37 normalisations).
9. **Coût avant/après** (5ad77c88) : 1,333 → 0,897 USD déterministe (−33 %) → 0,724 USD avec bornes de sortie estimées (−46 %).
10. **Économies** : −0,44 USD/run démontré sur rejeu, −0,61 USD estimé ; 4 runs : −1,20 USD démontré, −1,63 estimé.
11. **Impact qualité** : décisions identiques sauf **1** (immutabilité d'un item valide que la reprise de lot entier avait re-jugé sans erreur) ;
    evidence rendue toujours littérale et réelle, champ d'origine tracé ; les fragments au-delà des bornes ne sont ni refusés ni tronqués par le
    validateur (seul le prompt les demande) ; un item non corrigé après 3 passes devient « sans proposition machine » (décision humaine explicite)
    au lieu de faire échouer 8 sources.
12. **Risques** : (a) le modèle peut répondre différemment à un prompt de reprise partielle (validité JSON) — même validateur, même plafond de
    passes ; (b) bornes de sortie : comportement réel non mesuré ; (c) `lieu` comme preuve : décision produit documentée, réversible par config ;
    (d) UI : `evidenceFields` / `evidenceNormalization` ignorés par la page (champs additifs).
13. **Limites** : cache de prompt et lots plus grands non traités (non simulables) ; périmètre de la revue de portefeuille laissé au propriétaire ;
    estimation des tokens de reprise ciblée par ratio caractères/token.
14. **Lots gelés** : MONO-01 (106), MONO-09 (9), MONO-10 (79), MONO-11 (52) vérifiés, 0 divergence ; sceaux inchangés.
15. **SHA commit** : voir le message de commit (renseigné à la livraison).
16. **Verdict** : smoke réel `edb27b86` exécuté (`RAPPORT-SCREENING-COST-OPTIMIZER-REAL-SMOKE.md`) : reprises partielles valides, 0 faux accept,
    −44 % par source mesuré ; anomalie d'alignement corrigée dans `lib/portfolio-balancing.js` (SCREEN-COST-19) — **GELABLE (candidat)**.
