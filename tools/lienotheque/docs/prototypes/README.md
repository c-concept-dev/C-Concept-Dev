# Prototypes du 2 octobre 2026

Scripts Python qui ont prouvé les deux recettes de méthodes. Ce sont des **références de
comportement** pour le lot C, pas du code à intégrer tel quel : la logique doit être portée dans
les outils du projet (lecteur de repères, interpréteur de recettes), au format des contrats.

| Fichier | Rôle | Fixture |
|---|---|---|
| `ocr_methode.py` | Détection multi-passes des numéros, pastilles et pages, vote et cohérence | F3 — 70s Funk & Disco Bass |
| `70s_Funk_Disco_appariement_mp3.csv` / `.json` | Résultat de référence : 95 exercices reliés à leur piste | F3 |
| `westwood_ocr.py` | Redressement, numéros d'exercice, pages imprimées | F4 — Westwood vol. 1 |
| `westwood_pastilles.py` | Présence des pastilles « CD1 Piste NN » | F4 |
| `westwood_relire.py` | Lecture précise du numéro de piste (isolement du bloc sombre) | F4 |
| `westwood_apparier.py` | Consolidation, réparation de séquence, programmation dynamique, évaluation | F4 |
| `Westwood_Vol1_CD1_pistes.csv`, `Westwood_Vol1_exercices.csv` | Résultats de référence : 83/92 premiers exercices, 89/92 pages | F4 |

Les fichiers sources (images, PDF, MP3) sont sous droits : ils ne sont jamais versionnés et
restent dans `fixtures/fichiers/` (ignoré par Git).

Vérité connue : la piste 14 de Westwood commence à l'exercice **189** (la pastille fait foi),
non à 191 comme l'indique le nom du fichier MP3.
