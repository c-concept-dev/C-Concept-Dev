# Corpus multi-tour

Source : `evaluation/lot10g3b3f2/multiturn-corpus.json`.

| Cas | Propriété vérifiée |
|---|---|
| A | demande complète, zéro question, Rapide |
| B | information réellement indispensable, clarification puis Rapide |
| C | plusieurs décisions successives, nombre dynamique |
| D | demande complexe complète, zéro question, Architecte |
| E | demande complexe incomplète, plusieurs clarifications puis Architecte |
| F | délégation « À vous de choisir » sans répétition |
| G | réponse « Je ne sais pas » sans répétition mécanique |
| H | provider indisponible sans assimilation à la complexité |
| I | reformulation répétée détectée, état `blocked` |
| J | matériau présent non redemandé |
| Italie | réanalyse obligatoire après `Rome et Florence`, sans liste de questions imposée |

Le test de non-plafonnement simule douze clarifications distinctes successives. Ce nombre est une épreuve de test, pas une limite ni une cible du runtime.
