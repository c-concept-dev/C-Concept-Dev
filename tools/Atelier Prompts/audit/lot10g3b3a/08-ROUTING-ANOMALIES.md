# Anomalies de routage

## Résultat global conservé

- Exactitude de route : 90 % (27/30).
- Exactitude sur simples : 70 % (7/10).
- Les trois erreurs sont S07, S08 et S09.
- Workers AI : échecs 502 répétés ; 53 réponses 502 provider au total.
- Taux de fallback : 100 % ; fallback local prudent : 40 % global, 30 % des simples, 80 % des complexes.
- Aucun 429.

## Cas anormaux

| Cas | Demande résumée | Oracle | Route | Source | Cause immédiate | Impact |
|---|---|---|---|---|---|---|
| S07 | fonction JS bornée + 3 exemples | rapide | architecte | local-prudent | Workers AI 502 + Groq 502 | +55,1 s ; +15 875 tokens |
| S08 | planification simple bornée | rapide | architecte | local-prudent | double échec provider | +66,7 s ; +16 437 tokens |
| S09 | recette bornée | rapide | architecte | local-prudent | double échec provider | +78,4 s ; +17 974 tokens |

## Nature de l'anomalie

Il ne s'agit pas d'une mauvaise classification sémantique : **aucun provider n'a rendu de décision exploitable**. La politique de continuité `local-prudent → architecte` explique à elle seule les trois erreurs. Elle préserve la prudence mais viole la proportionnalité et l'efficacité.

## Autres anomalies liées

- C03, C05, C09, C10 : route correcte vers Architecte, mais analyse non exploitable après plafond de 8 000 tokens ; 5 ou 8 objets JSON reconnus.
- C01/C02/C04/C06/C07/C08 : exécution finale `incomplete` à 2 500 tokens dans le benchmark ; le succès technique ne vaut pas preuve de complétude.
- Le Decision Provider et Architecte réévaluent tous deux l'exploitabilité/les manques, sans contrat d'autorité partagé.

## Conclusion

Le premier correctif futur doit distinguer **indisponibilité du classifieur** et **complexité de la demande**. Cette conclusion ne prescrit pas ici une nouvelle heuristique métier : elle exige que le futur contrat permette un fallback proportionné, auditable et testé par propriétés structurelles.

