# Rapport LOT 10G.3B.2 — benchmark Atelier Prompts vs GPT-5.6 Sol pur

## Statut technique

**PASS — benchmark complet et reproductible.** Les 3 cas obligatoires et les 30 cas étendus ont été exécutés dans les deux branches. Les erreurs et sorties incomplètes sont conservées. Ce statut atteste le protocole, pas la supériorité d'une branche.

## A. Faits mesurés

- Modèle demandé et retourné : `gpt-5.6-sol`.
- API : proxy Cloudflare autorisé, endpoint `/v1/responses`; aucune clé locale créée, lue ou exposée.
- Corpus figé avant exécution : 10 demandes floues, 10 simples, 10 complexes.
- Demande initiale strictement identique dans les deux branches.
- Aucun retry sémantique, aucun résultat défavorable supprimé.
- Prix GPT utilisé : 4 USD/M tokens d'entrée et 20 USD/M tokens de sortie, relevés le 28 août 2026 dans la [documentation officielle du modèle](https://developers.openai.com/api/docs/models/gpt-5.6-sol). Le coût des Decision Providers Cloudflare/Groq est N/A.

| Catégorie | Succès Atelier | Route conforme | Latence Atelier moy. | Latence pure moy. | Surcoût moy. | Appels Atelier | Appels purs | Tokens Atelier | Tokens purs | Coût Atelier | Coût pur | Fallback |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| floue | 100% | 100% | 46.704 s | 22.035 s | 24.669 s | 5.4 | 1.7 | 5777 | 1573.9 | $0.0714 | $0.0280 | 100% |
| simple | 100% | 70% | 28.897 s | 6.534 s | 22.363 s | 3.3 | 1.4 | 5765.7 | 575.7 | $0.0586 | $0.0080 | 100% |
| complexe | 60% | 100% | 118.614 s | 36.665 s | 81.949 s | 3.6 | 1 | 20586 | 2570.3 | $0.2316 | $0.0503 | 100% |

Sur l'ensemble des 30 cas : succès Atelier 86.7 %, succès pur 100.0 %, exactitude de route 90.0 %, fallback 100.0 %, repli local prudent 40.0 %.

## B. Résultats techniques

- Workers AI primaire a renvoyé HTTP 502 sur ses 41 tentatives observées ; il n'a servi aucun cas.
- Groq a répondu 200 à 29 tentatives et 502 à 12 ; 12/30 cas ont fini sur le repli local prudent.
- Les 82 réponses API inspectées ont toutes retourné exactement `gpt-5.6-sol`.
- Aucun HTTP 429 n'a été observé.
- Quatre analyses Architecte (C03, C05, C09, C10) ont atteint `max_output_tokens` et n'ont pas produit un objet unique exploitable. Elles comptent comme erreurs Atelier, sans retry.
- Trois demandes simples (S07, S08, S09) ont été routées vers Architecte au lieu de Rapide.
- Les demandes floues ont toutes reçu au moins une clarification Atelier ; F10 en a reçu deux.
- Certaines réponses finales ont le statut API `incomplete` quand le plafond de sortie a été atteint ; elles restent conservées dans les données.

## C. Pré-évaluation automatisée — verdict humain requis

La pré-évaluation automatique se limite aux faits vérifiables : respect de l'oracle de route, erreurs, clarifications, latence, appels, tokens et coût. Elle n'attribue aucun score de qualité aux contenus.

- Atelier n'est pas transparent techniquement sur les demandes simples : 3/10 passent par Architecte et le taux de fallback est de 100 %.
- Le parcours Architecte ajoute une analyse longue et coûteuse ; quatre des dix cas complexes échouent avant le livrable final.
- Ces constats ne disent pas si les réponses Atelier réussies sont meilleures : la profondeur, la rigueur et l'actionnabilité doivent être évaluées à l'aveugle.

## D. Évaluation humaine requise

Le fichier `GRILLE-EVALUATION-HUMAINE.csv` contient 60 lignes aveugles, Réponse A ou B. Les textes correspondants sont dans `blind/answers/`; ne pas ouvrir le fichier de correspondance avant d'avoir noté les réponses. Les métriques suivantes restent N/A jusqu'à saisie humaine : pourcentage Atelier supérieur/équivalent/inférieur, gain moyen, dégradation moyenne, taux d'intervention utile et taux de dégradation.

Le score comparatif final reste **à valider humainement** sur l'échelle -3 à +3.

## E. Limites

- Un seul passage par cas : le benchmark mesure cette campagne, pas la variance stochastique.
- Le primaire Workers AI était indisponible ; les résultats de routage caractérisent surtout Groq et le repli local.
- Le coût du Decision Provider n'est pas inclus faute de métriques facturables accessibles.
- Les réponses complexes directes et certaines réponses Atelier peuvent être tronquées au plafond commun de 2 500 tokens de sortie finale.
- La friction inutile automatisée dérive de l'oracle de complétude ; elle reste un indicateur interne à confirmer humainement.
- Les appels Architecte utilisent la requête copier-coller native du HTML, car le schéma Draft-07 du produit contient `allOf`, non accepté par le mode JSON Schema strict de l'API OpenAI.

## Anomalies à traiter dans un lot ultérieur

1. Indisponibilité persistante du primaire Workers AI (HTTP 502).
2. Groq indisponible sur une partie des appels, provoquant le repli prudent local.
3. Sur-routage Architecte de S07, S08 et S09.
4. Dépassement du plafond de l'analyse Architecte sur C03, C05, C09 et C10.
5. Incompatibilité du schéma Architecte Draft-07 avec le JSON Schema strict OpenAI.

Le produit n'a pas été corrigé pendant ce lot.
