# Grille d’évaluation humaine — LOT 10G.3B.2

Évaluer les réponses à l’aveugle depuis `blind/answers/`, sans ouvrir
`blind/MAPPING-A-NE-PAS-OUVRIR-AVANT-EVALUATION.json`, sur 10 pour chaque dimension :

1. compréhension de l’intention ;
2. pertinence ;
3. qualité des clarifications ;
4. respect des informations disponibles ;
5. gestion des inconnues ;
6. hypothèses non justifiées ;
7. structure ;
8. actionnabilité ;
9. profondeur adaptée ;
10. valeur ajoutée réelle.

Pour chaque cas, attribuer ensuite un score comparatif :

- `+3` : Atelier nettement supérieur ;
- `+2` : avantage Atelier net ;
- `+1` : léger avantage Atelier ;
- `0` : équivalent ;
- `-1` : légère dégradation Atelier ;
- `-2` : LLM pur préférable ;
- `-3` : Atelier nettement inférieur.

Reporter les notes dans `GRILLE-EVALUATION-HUMAINE.csv`. Une fois toutes les notes figées,
ouvrir le fichier de correspondance pour attribuer le score comparatif.

Le score reste **à valider humainement** tant qu’aucun évaluateur n’a rempli la grille. Une pré-évaluation automatisée ne remplace jamais ce verdict.
