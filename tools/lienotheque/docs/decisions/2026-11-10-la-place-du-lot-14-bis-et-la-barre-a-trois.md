# La place du lot 14 bis, et la barre de marge qui s'allumera directement à ×3

**Tranché par Christophe le 10 novembre 2026**, le tableau des marges du coureur macOS sous les
yeux. Ses mots :

> « Barre : reste `null`. Elle s'allumera **directement à ×3** après le lot 14 bis. Ordre décidé :
> **D23, puis 14 bis** (lenteur des tests de `voie-oracle`), **puis l'étape 1.** »

## L'ordre

| rang | ce qui passe | pourquoi là |
|---|---|---|
| 1 | **D23** — le score sur peu d'apparitions | dette ouverte, et elle touche la justesse des liens |
| 2 | **14 bis** — la lenteur de `voie-oracle.test.ts` | lève la seconde moitié de D7, et débloque la barre |
| 3 | **étape 1** — le branchement Vision | ne commence pas avant que les deux soient faites |

## Pourquoi la barre saute ×2

La règle précédente de Christophe était : allumer ×2 dès que plus aucun contrôle ne serait sous ×2
sur le coureur. **La course 42843626700 l'a remplie — de 3 %.**

| marge | corps / délai | contrôle |
|---|---|---|
| **×2.06** | 87 437 / 180 000 | `voie-oracle` — s'abstient quand rien ne revient |
| ×2.33 | 77 260 / 180 000 | `voie-oracle` |
| ×2.40 | 74 987 / 180 000 | `voie-oracle` |
| ×2.58 | 69 772 / 180 000 | `voie-oracle` |
| ×2.82 | 1 776 / 5 000 | `aucune-page-lue` — une moitié du lot 16b |

Une barre à ×2 posée trois centièmes sous le minimum observé n'est pas un garde-fou : c'est un
fil tendu sur le bruit. Elle rendrait la course rouge au premier coureur un peu plus lent, sans
qu'une seule ligne de code ait changé — et un refus qu'on apprend à relancer ne protège plus rien.

Cela contredisait d'ailleurs la raison même qui avait fait proposer ×3, inscrite dans
`fixtures/references/marges-de-delai.json` : « la moitié de marge au-dessus du pire rapport
observé ». Appliquée au ×2.06 de cette course, elle donnait **×1,37**, pas ×2.

D'où la décision : **rien maintenant, ×3 quand 14 bis aura abouti** — c'est-à-dire quand les
quatre premières lignes du tableau auront cessé de l'être.

## Ce que la course a corrigé d'autre, et qu'il faut garder

**`paquet-hermetique` n'est plus à ×1,92 mais à ×3.25.** Christophe avait conditionné un petit lot
à sa confirmation : « si la prochaine course le confirme, inscris un petit lot pour comprendre et
réduire son coût ». La course ne le confirme pas. **Aucun lot n'est inscrit** pour lui — et c'est
le genre de chiffre qu'il faut cesser de citer dès qu'une mesure plus récente le démet.

**Le lot 16b, mesuré au lieu d'être projeté** : ses deux moitiés sortent à **×2.82** et **×3.03**
sur le coureur, là où le contrôle unique était à ×1,03. Ma projection annonçait ×3,08 et ×3,53 :
elle était optimiste d'environ 10 %. Elle était nommée projection, et c'est bien le seul mérite
qu'elle avait.
